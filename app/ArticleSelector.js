"use client";

import { useState, useRef } from "react";

export default function ArticleSelector({ articles }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState([]); // [{ id, title, talkingPoints, error }]
  const [editedText, setEditedText] = useState({}); // { [id]: string } — user's edited copy
  const [copiedId, setCopiedId] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const [loadingAudioId, setLoadingAudioId] = useState(null); // id currently loading for Play/Download click
  const [preparingIds, setPreparingIds] = useState(new Set()); // ids being pre-generated in the background
  const [audioError, setAudioError] = useState({}); // { [id]: string }
  const audioRefs = useRef({}); // { [id]: HTMLAudioElement }
  const audioUrlRefs = useRef({}); // { [id]: objectURL }
  const audioTextRefs = useRef({}); // { [id]: text the cached audio was generated from }
  const pendingGenerations = useRef({}); // { [id]: Promise } — in-flight generation, so Play doesn't duplicate a background one

  const maxRank = Math.max(...articles.map((a) => a.rank), 1);

  function toggleArticle(id) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  function handleEdit(id, value) {
    setEditedText((prev) => ({ ...prev, [id]: value }));
    // Text changed — any cached or in-flight audio for the old text is now stale.
    // Next play/download (or the caller) will need to regenerate.
  }

  async function handleCopy(id, title) {
    const text = editedText[id] ?? "";
    try {
      await navigator.clipboard.writeText(`${title}\n\n${text}`);
      setCopiedId(id);
      setTimeout(() => setCopiedId((current) => (current === id ? null : current)), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  // Core generator — reused by background pre-generation, Play, and Download.
  // Caches by (id, text) so unrelated calls for the same still-current text
  // share one in-flight request instead of firing duplicates.
  function generateAudioUrl(id, text) {
    if (audioUrlRefs.current[id] && audioTextRefs.current[id] === text) {
      return Promise.resolve(audioUrlRefs.current[id]);
    }
    if (pendingGenerations.current[id]?.text === text) {
      return pendingGenerations.current[id].promise;
    }

    const promise = fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `TTS request failed with status ${res.status}`);
        }
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        if (audioUrlRefs.current[id]) {
          URL.revokeObjectURL(audioUrlRefs.current[id]);
        }
        audioUrlRefs.current[id] = url;
        audioTextRefs.current[id] = text;
        return url;
      })
      .finally(() => {
        delete pendingGenerations.current[id];
      });

    pendingGenerations.current[id] = { text, promise };
    return promise;
  }

  // Fire off audio generation for every processed article immediately,
  // in parallel, so it's likely already cached by the time someone clicks Play.
  function prepareAudioInBackground(items) {
    const ids = items.map((i) => i.id);
    setPreparingIds((prev) => new Set([...prev, ...ids]));

    items.forEach(({ id, text }) => {
      generateAudioUrl(id, text)
        .catch((err) => {
          // Don't surface background failures loudly — Play will retry and
          // show the error there if it still fails at that point.
          console.error(`Background audio prep failed for ${id}:`, err.message);
        })
        .finally(() => {
          setPreparingIds((prev) => {
            const next = new Set(prev);
            next.delete(id);
            return next;
          });
        });
    });
  }

  async function handlePlay(id) {
    if (playingId === id) {
      audioRefs.current[id]?.pause();
      setPlayingId(null);
      return;
    }

    if (playingId && audioRefs.current[playingId]) {
      audioRefs.current[playingId].pause();
      setPlayingId(null);
    }

    const text = editedText[id];
    if (!text || text.trim().length === 0) return;

    setLoadingAudioId(id);
    setAudioError((prev) => ({ ...prev, [id]: null }));

    try {
      const url = await generateAudioUrl(id, text);

      let audio = audioRefs.current[id];
      if (!audio || audio.src !== url) {
        audio = new Audio(url);
        audio.onended = () => setPlayingId((current) => (current === id ? null : current));
        audioRefs.current[id] = audio;
      }

      audio.currentTime = 0;
      audio.play();
      setPlayingId(id);
    } catch (err) {
      setAudioError((prev) => ({ ...prev, [id]: err.message }));
    } finally {
      setLoadingAudioId(null);
    }
  }

  async function handleDownload(id, title) {
    const text = editedText[id];
    if (!text || text.trim().length === 0) return;

    setLoadingAudioId(id);
    setAudioError((prev) => ({ ...prev, [id]: null }));

    try {
      const url = await generateAudioUrl(id, text);

      const filename =
        title
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60) || "talking-points";

      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.wav`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      setAudioError((prev) => ({ ...prev, [id]: err.message }));
    } finally {
      setLoadingAudioId(null);
    }
  }

  async function handleProcess() {
    if (selectedIds.length === 0) return;

    setIsProcessing(true);
    setError(null);
    setResults([]);
    setEditedText({});

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
      const newResults = data.results || [];
      setResults(newResults);

      const initialEdits = {};
      const readyForAudio = [];
      for (const result of newResults) {
        if (result.talkingPoints) {
          initialEdits[result.id] = result.talkingPoints;
          readyForAudio.push({ id: result.id, text: result.talkingPoints });
        }
      }
      setEditedText(initialEdits);

      // Kick off audio generation for everything right away, in the background
      prepareAudioInBackground(readyForAudio);
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
                      onClick={() => handleCopy(result.id, result.title)}
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
                  <>
                    <textarea
                      value={editedText[result.id] ?? ""}
                      onChange={(e) => handleEdit(result.id, e.target.value)}
                      rows={5}
                      className="w-full resize-y rounded-lg border border-border bg-background px-3 py-2 text-sm leading-relaxed text-foreground/90 focus:outline-none focus:ring-1 focus:ring-indigo focus:border-indigo/50"
                    />
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        onClick={() => handlePlay(result.id)}
                        disabled={loadingAudioId === result.id}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-indigo/50 hover:text-indigo disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loadingAudioId === result.id
                          ? "Loading…"
                          : playingId === result.id
                          ? "⏸ Pause"
                          : "▶ Play"}
                      </button>
                      <button
                        onClick={() => handleDownload(result.id, result.title)}
                        disabled={loadingAudioId === result.id}
                        className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1 text-xs font-medium text-muted-foreground transition hover:border-indigo/50 hover:text-indigo disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loadingAudioId === result.id ? "Loading…" : "⬇ Download"}
                      </button>
                      {preparingIds.has(result.id) && loadingAudioId !== result.id && (
                        <span className="text-xs text-muted-foreground/70">preparing audio…</span>
                      )}
                      {audioError[result.id] && (
                        <span className="text-xs text-destructive">{audioError[result.id]}</span>
                      )}
                    </div>
                  </>
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
