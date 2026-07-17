import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import Together from "together-ai";

// Server-side only client using the service role key — this bypasses RLS,
// which is fine here since this route runs on the server, never in the browser.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const together = new Together({ apiKey: process.env.TOGETHER_API_KEY });

const MODEL = "openai/gpt-oss-20b"; // same model sortnews.py uses for ranking

function buildPrompt(title, fullText) {
  return `You are writing talking points for a news article.

Article title: ${title}

Article text:
${fullText}

Write a single paragraph that sound natural when read aloud by a radio news presenter. Aim for 3-5 concise sentences, and avoid long or complex sentences, semicolons, and excessive subordinate clauses. Each sentence should communicate one key point and flow smoothly into the next. Cover the key facts, and why it's a positive or uplifting story.  Use only facts from the article. Output only the paragraph.`;
}

export async function POST(request) {
  const { articleIds } = await request.json();

  if (!articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
    return NextResponse.json(
      { error: "No article IDs provided" },
      { status: 400 }
    );
  }

  // Fetch full_text for the selected articles
  const { data: articles, error: fetchError } = await supabaseAdmin
    .from("weekly_articles")
    .select("id, title, full_text")
    .in("id", articleIds);

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }

  if (!articles || articles.length === 0) {
    return NextResponse.json(
      { error: "No matching articles found" },
      { status: 404 }
    );
  }

  const results = [];

  // Process sequentially to keep this simple and avoid hammering the Together
  // API with concurrent requests. If selection sizes grow large and this feels
  // slow, this loop is the place to add concurrency with a limit.
  for (const article of articles) {
    if (!article.full_text || article.full_text.trim().length === 0) {
      results.push({
        id: article.id,
        title: article.title,
        talkingPoints: null,
        error: "No article text available to generate talking points from.",
      });
      continue;
    }

    try {
      const completion = await together.chat.completions.create({
        model: MODEL,
        max_tokens: 600,
        temperature: 0.4,
        messages: [
          { role: "user", content: buildPrompt(article.title, article.full_text) },
        ],
      });

      const talkingPoints = completion.choices?.[0]?.message?.content?.trim();

      if (!talkingPoints) {
        results.push({
          id: article.id,
          title: article.title,
          talkingPoints: null,
          error: "LLM returned empty response.",
        });
        continue;
      }

      // Save back to Supabase
      const { error: updateError } = await supabaseAdmin
        .from("weekly_articles")
        .update({ talking_points: talkingPoints })
        .eq("id", article.id);

      if (updateError) {
        results.push({
          id: article.id,
          title: article.title,
          talkingPoints,
          error: `Generated but failed to save: ${updateError.message}`,
        });
        continue;
      }

      results.push({
        id: article.id,
        title: article.title,
        talkingPoints,
        error: null,
      });
    } catch (err) {
      results.push({
        id: article.id,
        title: article.title,
        talkingPoints: null,
        error: err.message || "Unknown error calling Together AI.",
      });
    }
  }

  return NextResponse.json({ results });
}
