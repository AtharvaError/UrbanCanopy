"use client";

import { useEffect } from "react";
import { Languages } from "lucide-react";
import { LANGUAGES, LOCALES, isLang } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";

/** English, Hindi or Marathi for the interface's main labels. Each language is listed in its own script. */
export default function LanguageSwitch() {
  const { lang, t, setLanguage } = useLanguage();
  // The page is served as English. Once the reader's choice is known, say so on
  // <html>, which is what a screen reader takes its pronunciation from.
  useEffect(() => {
    document.documentElement.lang = LOCALES[lang];
  }, [lang]);
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Languages className="h-4 w-4 shrink-0" aria-hidden />
      <span className="sr-only">{t("nav.language")}</span>
      <select
        value={lang}
        onChange={(e) => {
          if (isLang(e.target.value)) setLanguage(e.target.value);
        }}
        className="rounded-md border border-border bg-surface px-1.5 py-1 text-xs text-foreground"
      >
        {Object.entries(LANGUAGES).map(([code, name]) => (
          <option key={code} value={code} lang={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}
