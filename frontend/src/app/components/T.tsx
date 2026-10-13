"use client";

import { useLanguage } from "@/lib/useLanguage";
import type { StringKey } from "@/lib/i18n";

/** One translated label, usable from a server component. Renders English until the reader's choice is known. */
export default function T({ k, vars }: { k: StringKey; vars?: Record<string, string | number> }) {
  const { t } = useLanguage();
  return <>{t(k, vars)}</>;
}
