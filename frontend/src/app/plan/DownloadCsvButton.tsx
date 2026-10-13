"use client";

import { Download } from "lucide-react";

/** Saves text the page already holds as a file. Nothing is requested from the server. */
export default function DownloadCsvButton({ csv, filename }: { csv: string; filename: string }) {
  function download() {
    // The byte-order mark makes Excel read the file as UTF-8.
    const url = URL.createObjectURL(new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      type="button"
      onClick={download}
      className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-foreground hover:bg-surface-hover"
    >
      <Download className="h-4 w-4" aria-hidden />
      Download as CSV
    </button>
  );
}
