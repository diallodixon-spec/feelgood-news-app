"use client";

import { useState } from "react";

export default function ArticleSelector({ articles }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]); // [{ id, title, talkingPoints, error }]
  const [copiedId, setCopiedId] = useState(null);

  const maxRank = Math.max(...articles.map((a) => a.rank), 1);

  function toggleArticle(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleCopy(id, text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  async function handleProcess() {
    if (selectedIds.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setResults([]);

    try {
      const res = await fetch("/api/process-articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: selectedIds }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Request failed with status ${res.status}`);
      }

      const data = await res.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <div>
      <ul className="space-y-3 mb-8">
        {articles.map((article) => {
          // Rank 1 = most feel-good = brightest glow on the row itself.
          // Glow tapers toward the bottom of this week's batch, so intensity
          // is real information, not decoration — just no numeral attached.
          const intensity = 1 - (article.rank - 1) / Math.max(maxRank - 1, 1);
          const glowAlpha = 0.1 + intensity * 0.3;
          const glowSpread = 10 + intensity * 30;

          return (
            <li
              key={article.id}
              className="flex items-start gap-4 rounded-xl border border-border bg-card px-4 py-4 transition-colors hover:border-indigo/40"
              style={{
                boxShadow: `0 0 ${glowSpread}px -12px oklch(0.511 0.230 276.966 / ${glowAlpha})`,
              }}
            >
              <input
                type="checkbox"
                id={`article-${article.id}`}
                checked={selectedIds.includes(article.id)}
                onChange={() => toggleArticle(article.id)}
                className="mt-1.5 h-4 w-4 accent-indigo cursor-pointer"
              />

              <label htmlFor={`article-${article.id}`} className="flex-1 cursor-pointer">
                <span className="block font-medium leading-snug">{article.title}</span>
                <a
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-sm text-muted-foreground hover:text-indigo break-all transition-colors"
                >
                  {article.url}
                </a>
              </label>
            </li>
          );
        })}
      </ul>

      {error && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-destructive mb-4">
          {error}
        </div>
      )}

      <button
        onClick={handleProcess}
        disabled={selectedIds.length === 0 || isProcessing}
        className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground glow-indigo-soft transition hover:glow-indigo disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
      >
        {isProcessing
          ? "Generating talking points…"
          : `Process${selectedIds.length ? ` (${selectedIds.length})` : ""}`}
      </button>

      {results.length > 0 && (
        <div className="mt-12">
          <h2 className="font-display text-xl font-bold mb-4">Talking Points</h2>
          <div className="space-y-4">
            {results.map((result) => (
              <div
                key={result.id}
                className="rounded-xl border border-border bg-card px-5 py-4"
              >
                <div className="flex items-start justify-between gap-4 mb-2">
                  <h3 className="font-medium leading-snug">{result.title}</h3>
                  {result.talkingPoints && (
                    <button
                      onClick={() => handleCopy(result.id, `${result.title}\n\n${result.talkingPoints}`)}
                      className={`shrink-0 rounded-md border px-3 py-1 text-xs font-medium transition ${
                        copiedId === result.id
                          ? "border-transparent bg-primary text-primary-foreground"
                          : "border-border text-muted-foreground hover:border-indigo/50 hover:text-indigo"
                      }`}
                    >
                      {copiedId === result.id ? "Copied!" : "Copy"}
                    </button>
                  )}
                </div>

                {result.talkingPoints ? (
                  <p className="text-sm leading-relaxed text-foreground/90">
                    {result.talkingPoints}
                  </p>
                ) : (
                  <p className="text-sm text-destructive">
                    {result.error || "No talking points generated."}
                  </p>
                )}

                {result.talkingPoints && result.error && (
                  <p className="mt-2 text-xs text-chart-5">Note: {result.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
