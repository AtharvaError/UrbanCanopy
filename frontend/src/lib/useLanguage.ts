"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_LANG, LOCALES, isLang, translate, type Lang, type StringKey } from "./i18n";

/**
 * The reader's chosen language, kept in this browser.
 *
 * A small store rather than React context, so a server-rendered page can drop
 * in one translated label (see `T`) without the whole tree becoming a client
 * component. The server always renders English; the choice is applied after
 * hydration, which is why the snapshot for the server is fixed.
 */

const STORAGE_KEY = "urbancanopy-lang";
const listeners = new Set<() => void>();

function read(): Lang {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLang(stored) ? stored : DEFAULT_LANG;
  } catch {
    // Storage can be blocked outright; the site then stays in English.
    return DEFAULT_LANG;
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function setLanguage(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Nothing to do: the choice simply will not outlive the page.
  }
  document.documentElement.lang = LOCALES[lang];
  listeners.forEach((listener) => listener());
}

export function useLanguage() {
  const lang = useSyncExternalStore(subscribe, read, () => DEFAULT_LANG);
  const t = useCallback((key: StringKey, vars?: Record<string, string | number>) => translate(lang, key, vars), [lang]);
  return { lang, t, setLanguage };
}
