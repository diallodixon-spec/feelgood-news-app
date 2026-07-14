import { supabase } from "@/lib/supabaseClient";
import ArticleSelector from "./ArticleSelector";

export const dynamic = "force-dynamic"; // always fetch fresh, never statically cache this page
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function HomePage() {
  const { data: articles, error } = await supabase
    .from("weekly_articles")
    .select("id, rank, title, url, created_at")
    .order("rank", { ascending: true });

  const lastUpdated =
    articles && articles.length > 0
      ? new Date(
          Math.max(...articles.map((a) => new Date(a.created_at).getTime()))
        )
      : null;

  return (
    <main className="min-h-screen bg-grid">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-10">
          <span className="text-xs uppercase tracking-widest text-indigo font-semibold">
            Weekly Digest
          </span>
          <h1 className="font-display text-4xl font-bold mt-2 text-balance">
            Weekly Government News Highlights 
          </h1>
          <p className="text-muted-foreground mt-3 max-w-xl">
            The week's most significant government achievements, identified and ranked by AI from the latest JIS news. Select the stories to feature and generate talking points. 
          </p>
          {lastUpdated && (
            <p className="text-sm text-muted-foreground/70 mt-2">
              Last updated:{" "}
              {lastUpdated.toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive">
            Couldn&apos;t load articles: {error.message}
          </div>
        )}

        {!error && (!articles || articles.length === 0) && (
          <div className="rounded-xl border border-border bg-card px-4 py-6 text-muted-foreground text-center">
            No articles loaded for this week yet.
          </div>
        )}

        {!error && articles && articles.length > 0 && (
          <ArticleSelector articles={articles} />
        )}
      </div>
    </main>
  );
}
