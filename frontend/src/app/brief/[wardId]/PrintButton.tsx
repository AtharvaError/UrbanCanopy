"use client";

import { Printer } from "lucide-react";

/** Opens the browser's print dialog, where "Save as PDF" is one of the printers. */
export default function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md bg-brand-teal px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-teal-hover"
    >
      <Printer className="h-4 w-4" aria-hidden />
      Print or save as PDF
    </button>
  );
}
