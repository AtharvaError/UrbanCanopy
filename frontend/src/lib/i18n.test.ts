/**
 * The translation table.
 *
 * A label that is missing in Hindi or Marathi falls back to English silently,
 * which is the right behaviour for a reader and the wrong one for whoever added
 * the label: these tests are where the gap shows up instead.
 */

import { describe, it, expect } from "vitest";
import { LANGUAGES, STRING_KEYS, entryOf, hasString, isLang, translate } from "./i18n";
import { PRIORITY_BANDS, peopleActions } from "./zonePlanner";
import { MAP_LAYERS } from "./mapState";
import type { WardProfile, WardProfileData } from "./wardProfile";

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("every label", () => {
  it("is filled in for every language", () => {
    for (const key of STRING_KEYS) {
      const entry = entryOf(key);
      for (const lang of Object.keys(LANGUAGES)) {
        expect(entry[lang as keyof typeof entry].trim(), `${key} in ${lang}`).not.toBe("");
      }
    }
  });

  it("keeps the same placeholders in every language", () => {
    for (const key of STRING_KEYS) {
      const entry = entryOf(key);
      expect(placeholders(entry.hi), `${key} in hi`).toEqual(placeholders(entry.en));
      expect(placeholders(entry.mr), `${key} in mr`).toEqual(placeholders(entry.en));
    }
  });

  it("is actually translated, not English copied across", () => {
    // A few labels are the same word in two languages; a table that is mostly
    // identical means the translations were never written.
    const same = STRING_KEYS.filter((key) => entryOf(key).hi === entryOf(key).en || entryOf(key).mr === entryOf(key).en);
    expect(same.length).toBeLessThan(STRING_KEYS.length * 0.05);
  });
});

describe("translate", () => {
  it("fills placeholders", () => {
    expect(translate("en", "list.title", { n: 30 })).toBe("30 localities, ranked by heat priority");
    expect(translate("hi", "list.title", { n: 30 })).toContain("30");
    expect(translate("mr", "outlook.below", { t: 40, day: "शुक्रवार" })).toContain("40°C");
  });

  it("recognises its own languages and nothing else", () => {
    expect(isLang("mr")).toBe(true);
    expect(isLang("fr")).toBe(false);
    expect(isLang(null)).toBe(false);
  });
});

describe("labels the interface builds keys for", () => {
  it("has one for each priority band", () => {
    for (const band of PRIORITY_BANDS) expect(hasString(`band.${band.level}`)).toBe(true);
  });

  it("has one for each map layer", () => {
    for (const layer of MAP_LAYERS) expect(hasString(`layer.${layer}`)).toBe(true);
  });

  it("has a title and a text for every people-focused action the planner can suggest", () => {
    // A locality worse than the city on every measure fires every rule.
    const city = { hvi_mean: 60, LST_C: 40, NDVI: 0.3, pop_density_km2: 1000, child_pct: 0, slum_pct: 0, hospital_dist_m: 500, impervious_pct: 40 };
    const worst = { ...city, ward_id: "x", hvi: 90, pop_density_km2: 9000, impervious_pct: 90, NDVI: 0.1, LST_C: 45, hospital_dist_m: 2000 };
    const actions = peopleActions(worst as unknown as WardProfile, { city } as unknown as WardProfileData, 90);
    expect(actions.length).toBe(5);
    for (const action of actions) {
      expect(hasString(`action.${action.id}.title`), action.id).toBe(true);
      expect(hasString(`action.${action.id}.text`), action.id).toBe(true);
      // The English label is the planner's own wording, so the two cannot drift.
      expect(translate("en", `action.${action.id}.title` as never)).toBe(action.title);
      expect(translate("en", `action.${action.id}.text` as never)).toBe(action.action);
    }
  });
});
