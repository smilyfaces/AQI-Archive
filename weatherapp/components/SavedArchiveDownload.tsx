"use client";

import { useState } from "react";
import { Download } from "lucide-react";

export function SavedArchiveDownload({ slugs }: { slugs: string[] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/saved/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slugs }),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null);
        throw new Error(result?.error ?? "Could not download the saved cities archive.");
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "saved-cities-archive.csv";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not download the saved cities archive.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="saved-archive-download">
    <button type="button" className="button secondary" onClick={download} disabled={busy || !slugs.length}>
      <Download size={16} aria-hidden="true" />
      {busy ? "Preparing archive…" : "Download saved archives (CSV)"}
    </button>
    {error && <p role="alert">{error}</p>}
  </div>;
}
