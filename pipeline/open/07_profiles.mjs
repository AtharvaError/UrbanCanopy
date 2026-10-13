/**
 * Stage 07 (open build): everything the site reads that is derived from the
 * scored cells and needs no new data.
 *
 * One pass over what stages 09, 10, 11, 12 and 15 of the Python pipeline do:
 *
 *   cells_ndvi_change.geojson   green cover gained, stable or lost per cell, and
 *                               whether its surface warmed more or less than the city
 *   ward_profiles.json          each area against the city, with neighbours
 *   hero_city.json              the areas as a small 3D-ready model
 *   hero_region.json            the land around the city, for the same model
 *   budget_allocation.json      where a fixed cool-roof budget would go
 *
 * Nothing here is recomputed. Scores and ranks are read from stage 05's output.
 *
 * Run: node 07_profiles.mjs --city nagpur
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { ROOT, cityFromArgv } from "./lib/city.mjs";
import {
  bboxOf,
  featureCollection,
  geometriesAdjacent,
  mapGeometry,
  polygonArea,
  polygonsOf,
  readJson,
  signedRingArea,
  simplifyRing,
  utmProjector,
  writeJson,
} from "./lib/geo.mjs";
import { DIRECTIONS } from "./lib/index.mjs";
import { chooseClusters } from "./lib/kmeans.mjs";
import { mean, populationStd, zscores } from "./lib/stats.mjs";

// ---------------------------------------------------- green-cover change --
const GAIN_THRESHOLD = 0.05;
const LOSS_THRESHOLD = -0.05;

/**
 * A cell counts as warming faster or slower than the city only beyond this
 * many degrees either side of the city-wide change. Set by this project.
 */
const HEAT_CHANGE_THRESHOLD_C = 1;

/** A cell's surface-temperature change between the two seasons, or null when either is missing. */
function lstDelta(p) {
  const known = typeof p.LST_C === "number" && typeof p.LST_C_prev === "number";
  return known ? p.LST_C - p.LST_C_prev : null;
}

/**
 * The city-wide mean change in surface temperature between the two seasons.
 *
 * Two hot seasons nine years apart differ mostly because one year's weather was
 * hotter than the other's, which says nothing about any one place. So the
 * change layer never shows a cell's raw change: it shows the change against
 * this figure, which cancels the weather and leaves where the city warmed
 * faster or slower than itself.
 */
function cityLstChange(cells) {
  const deltas = cells.features.map((f) => lstDelta(f.properties)).filter((d) => d !== null);
  return deltas.length ? mean(deltas) : null;
}

function ndviChange(cells) {
  const cityHeatChange = cityLstChange(cells);
  const features = cells.features.map((f) => {
    const p = f.properties;
    const known = p.NDVI !== null && p.NDVI !== undefined && p.NDVI_prev !== null && p.NDVI_prev !== undefined;
    const delta = known ? p.NDVI - p.NDVI_prev : null;
    const heatDelta = lstDelta(p);
    const heatVsCity = heatDelta === null || cityHeatChange === null ? null : heatDelta - cityHeatChange;
    return {
      type: "Feature",
      properties: {
        grid_id: p.grid_id,
        ward_id: p.ward_id,
        NDVI: p.NDVI,
        NDVI_prev: p.NDVI_prev ?? null,
        ndvi_delta: delta,
        change_class: !known ? "unknown" : delta > GAIN_THRESHOLD ? "gained" : delta < LOSS_THRESHOLD ? "lost" : "stable",
        LST_C: p.LST_C ?? null,
        LST_C_prev: p.LST_C_prev ?? null,
        lst_delta_vs_city: heatVsCity,
        heat_change_class:
          heatVsCity === null
            ? "unknown"
            : heatVsCity > HEAT_CHANGE_THRESHOLD_C
              ? "faster"
              : heatVsCity < -HEAT_CHANGE_THRESHOLD_C
                ? "slower"
                : "in_line",
        HVI: p.HVI,
      },
      geometry: f.geometry,
    };
  });
  return featureCollection("cells_ndvi_change", features);
}

// ------------------------------------------------------- area profiles --
const UNITS = {
  LST_C: "degrees Celsius (land surface, not air)",
  NDVI: "vegetation index, unitless, not a canopy percentage",
  pop_density_km2: "people per square kilometre",
  child_pct: "percent (0-100), Census share of population aged 0 to 6",
  slum_pct: "percent (0-100), proxy from mapped slum-cluster boundaries",
  hospital_dist_m: "metres",
  impervious_pct: "percent (0-100)",
};

/** Mean of the numbers in a list, ignoring anything that is not one. Null when none are. */
function meanOfKnown(values) {
  const known = values.filter((v) => typeof v === "number");
  return known.length ? mean(known) : null;
}

function wardProfiles(cells, wards, boundariesUtm, indicators, weights) {
  const rows = cells.features.map((f) => f.properties);
  const city = { hvi_mean: mean(rows.map((r) => r.HVI)) };
  for (const c of indicators) city[c] = mean(rows.map((r) => r[c]));
  // Context the score does not use: measured tree cover, and how much the
  // surface warmed between the two seasons. The second is only ever read
  // against the city's own figure (see cityLstChange).
  city.tree_pct = meanOfKnown(rows.map((r) => r.tree_pct));
  city.lst_change_c = cityLstChange(cells);

  // What turns a contribution into score points. A cell's score is its summed
  // contributions rescaled to 0-100 between the lowest and highest cell, so a
  // contribution of 1 is worth 100 / (max - min) points, and a cell that is
  // exactly average on every indicator (contributions all zero) scores
  // `baseline_points`. With these two numbers a published score decomposes
  // exactly: score = baseline_points + sum of contribution x points_per_contribution.
  const raw = rows.map((r) => indicators.reduce((s, c) => s + r[`contrib_${c}`], 0));
  const rawMin = Math.min(...raw);
  const rawMax = Math.max(...raw);
  const scoreScale = {
    baseline_points: ((0 - rawMin) / (rawMax - rawMin)) * 100,
    points_per_contribution: 100 / (rawMax - rawMin),
  };

  // The mean and spread each indicator is standardised against, and which way
  // it counts. With the weights and the scale above, this is everything needed
  // to compute a score from five numbers by hand, which is what the calculator
  // on the site does:
  //   score = baseline + points_per_contribution
  //           x sum( weight x direction x (value - mean) / std )
  const indicatorStats = Object.fromEntries(
    indicators.map((c) => [
      c,
      { mean: mean(rows.map((r) => r[c])), std: populationStd(rows.map((r) => r[c])), direction: DIRECTIONS[c] },
    ]),
  );

  // Areas that share an edge or a corner count as neighbours, which is what a
  // reader means by "next to". One metre of slack absorbs coordinate rounding.
  const neighbours = new Map(
    boundariesUtm.map((a) => [
      a.ward_id,
      boundariesUtm.filter((b) => b.ward_id !== a.ward_id && geometriesAdjacent(a.geometry, b.geometry, 1)).map((b) => b.ward_id).sort(),
    ]),
  );

  const scored = wards.features.map((f) => f.properties).filter((w) => w.HVI !== null);
  const hviByWard = new Map(scored.map((w) => [w.ward_id, w.HVI]));
  const profiles = scored.map((w) => {
    const members = rows.filter((r) => r.ward_id === w.ward_id);
    const entry = {
      ward_id: w.ward_id,
      ward_gid: w.ward_gid,
      hvi: w.HVI,
      rank: w.rank,
      n_cells: w.n_cells,
      // "More vulnerable than X% of the city's areas." Rank 1 maps to 100.
      percentile: scored.length > 1 ? Math.round(((scored.length - w.rank) / (scored.length - 1)) * 1000) / 10 : null,
    };
    for (const c of indicators) {
      entry[c] = mean(members.map((m) => m[c]));
      entry[`${c}_delta_city`] = entry[c] - city[c];
    }
    entry.tree_pct = meanOfKnown(members.map((m) => m.tree_pct));
    const warming = meanOfKnown(members.map(lstDelta));
    entry.lst_change_vs_city_c = warming === null || city.lst_change_c === null ? null : warming - city.lst_change_c;
    // Biggest upward driver: the most positive contribution.
    const top = indicators.reduce((best, c) => (w[`contrib_${c}`] > w[`contrib_${best}`] ? c : best), indicators[0]);
    entry.top_driver = top;
    entry.top_driver_contrib = w[`contrib_${top}`];

    entry.neighbours = neighbours.get(w.ward_id) ?? [];
    const rated = entry.neighbours.filter((n) => hviByWard.has(n)).map((n) => ({ ward_id: n, hvi: hviByWard.get(n) }));
    if (rated.length) {
      entry.coolest_neighbour = rated.reduce((a, b) => (b.hvi < a.hvi ? b : a));
      entry.hottest_neighbour = rated.reduce((a, b) => (b.hvi > a.hvi ? b : a));
    }
    return entry;
  });
  profiles.sort((a, b) => a.rank - b.rank);

  const { typeOf, summary: typesSummary } = localityTypes(profiles, indicators);
  for (const profile of profiles) profile.type_id = typeOf.get(profile.ward_id);

  return {
    generated_from: "cells_nbs.geojson",
    n_cells: rows.length,
    n_wards: profiles.length,
    indicators,
    units: Object.fromEntries(indicators.map((c) => [c, UNITS[c]])),
    weights: Object.fromEntries(indicators.map((c) => [c, weights[c]])),
    score_scale: scoreScale,
    indicator_stats: indicatorStats,
    locality_types: typesSummary,
    city,
    wards: profiles,
  };
}

// ------------------------------------------------------- locality types --
/** How each indicator reads in a type's description. */
const TYPE_TERMS = {
  LST_C: "surface heat",
  NDVI: "green cover",
  pop_density_km2: "population density",
  child_pct: "share of young children",
  slum_pct: "informal housing",
  hospital_dist_m: "distance to a hospital",
  impervious_pct: "built-up cover",
};
/** A type is described by the indicators its centre sits at least this many standard deviations from the average on. */
const TYPE_DISTINCT_Z = 0.5;

/**
 * A short name for a type, from where its centre sits. The rules are tried in
 * order and are deliberately few: they name the broad kinds of place the
 * indicators can tell apart, and anything else is "mixed". The description
 * beside the name lists the actual differences, so the name is a handle and
 * not the evidence.
 */
function typeName(z) {
  const at = (key) => z[key] ?? 0;
  if (at("impervious_pct") <= -0.5 && at("pop_density_km2") <= -0.5) {
    return at("LST_C") >= 0.3 ? "Hot open fringe" : "Open, lightly built land";
  }
  if (at("NDVI") >= 0.5) return at("LST_C") <= -0.3 ? "Greener, cooler neighbourhoods" : "Greener neighbourhoods";
  if (at("impervious_pct") >= 0.5 && at("pop_density_km2") >= 0.3) return "Crowded built-up core";
  return "Mixed neighbourhoods";
}

function typeDescription(z, indicators) {
  const above = indicators.filter((c) => z[c] >= TYPE_DISTINCT_Z).sort((a, b) => z[b] - z[a]).map((c) => TYPE_TERMS[c]);
  const below = indicators.filter((c) => z[c] <= -TYPE_DISTINCT_Z).sort((a, b) => z[a] - z[b]).map((c) => TYPE_TERMS[c]);
  const list = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0]);
  if (!above.length && !below.length) return "Close to the average locality on every measure.";
  return [above.length ? `Above the average locality on ${list(above)}.` : "", below.length ? `Below it on ${list(below)}.` : ""]
    .filter(Boolean)
    .join(" ");
}

/**
 * Sorts the localities into a few types with k-means on their indicators.
 *
 * This is a second reading of the same five numbers, not a second score. The
 * score ranks; the types describe. Two localities can sit side by side in the
 * ranking for opposite reasons, one crowded and paved, the other open and hot,
 * and they do not need the same response. The types make that visible.
 *
 * Indicators are standardised across localities first, so no unit dominates.
 * The number of types is chosen by lib/kmeans.mjs's stated rule and every
 * candidate's figures are published with the result. Types are numbered by
 * their mean score, highest first, so the numbering is stable and means
 * something.
 */
function localityTypes(profiles, indicators) {
  const columns = indicators.map((c) => zscores(profiles.map((w) => w[c])));
  const points = profiles.map((_, i) => indicators.map((_, j) => columns[j][i]));
  const { chosen, tried, tolerance } = chooseClusters(points);

  const groups = [...new Set(chosen.assignments)]
    .map((cluster) => {
      const members = profiles.filter((_, i) => chosen.assignments[i] === cluster);
      const z = Object.fromEntries(indicators.map((c, j) => [c, chosen.centres[cluster][j]]));
      return { cluster, members, z, meanScore: mean(members.map((m) => m.hvi)) };
    })
    .sort((a, b) => b.meanScore - a.meanScore);

  const used = new Map();
  const types = groups.map((group, id) => {
    const base = typeName(group.z);
    used.set(base, (used.get(base) ?? 0) + 1);
    return {
      id,
      // Two types can earn the same name; the second is numbered, not renamed.
      name: used.get(base) > 1 ? `${base} (${used.get(base)})` : base,
      description: typeDescription(group.z, indicators),
      n: group.members.length,
      mean_score: group.meanScore,
      centroid_z: group.z,
      members: group.members.map((m) => m.ward_id),
    };
  });

  const typeOf = new Map(types.flatMap((t) => t.members.map((m) => [m, t.id])));
  return {
    typeOf,
    summary: {
      method: "k-means on the indicators, standardised across localities",
      k: chosen.k,
      silhouette: chosen.silhouette,
      selection: `largest k within ${tolerance} of the best silhouette`,
      candidates: tried,
      types,
    },
  };
}

// --------------------------------------------------------------- hero model --
const HERO_SIMPLIFY_M = 150;
const HERO_MIN_PART_M2 = 250_000;
const HERO_TARGET_SPAN = 2;
/**
 * The region disc's radius in model units, not metres. The landing scene's
 * camera, fog and curvature were tuned around a region about 7.5 units across
 * (Mumbai's 155 km at Mumbai's scale). A smaller city scales up more, so a
 * fixed 155 km would arrive two or three times larger in model space and push
 * the fog and horizon out of the frame they were set for. Holding the units
 * steady keeps the scene as designed; the distance it stands for is reported.
 */
const HERO_REGION_RADIUS_UNITS = 7.5;
const round4 = (v) => Math.round(v * 1e4) / 1e4;

function heroModels(city, wards, boundariesUtm) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boundariesUtm) {
    const [x0, y0, x1, y1] = bboxOf(b.geometry);
    minX = Math.min(minX, x0);
    minY = Math.min(minY, y0);
    maxX = Math.max(maxX, x1);
    maxY = Math.max(maxY, y1);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const scale = HERO_TARGET_SPAN / Math.max(maxX - minX, maxY - minY);

  // Model space, the closing vertex dropped, outer rings counter-clockwise and
  // holes clockwise: what THREE.Shape needs to punch holes correctly.
  const toModel = (ring, wantCounterClockwise) => {
    const points = simplifyRing(ring, HERO_SIMPLIFY_M).map(([x, y]) => [round4((x - cx) * scale), round4((y - cy) * scale)]);
    if (points.length > 1 && points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1]) points.pop();
    if (points.length < 3) return null;
    if (signedRingArea(points) > 0 !== wantCounterClockwise) points.reverse();
    return points;
  };

  const scores = new Map(wards.features.map((f) => [f.properties.ward_id, f.properties]));
  const features = boundariesUtm
    .map((b) => {
      const parts = polygonsOf(b.geometry)
        .filter((rings) => polygonArea(rings) >= HERO_MIN_PART_M2)
        .map((rings) => {
          const outer = toModel(rings[0], true);
          return outer ? { outer, holes: rings.slice(1).map((h) => toModel(h, false)).filter(Boolean) } : null;
        })
        .filter(Boolean);
      const score = scores.get(b.ward_id);
      return parts.length
        ? { ward_id: b.ward_id, ward_gid: b.ward_gid, hvi: score?.HVI ?? null, rank: score?.rank ?? null, parts }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.rank ?? Infinity) - (b.rank ?? Infinity));

  const heroCity = {
    generated_from: `data/${city.raw.boundaries.file} + wards_hvi.geojson`,
    projection: city.projectedCrs,
    simplify_tolerance_m: HERO_SIMPLIFY_M,
    note:
      `Model space: centred on the city bounding box, longer axis scaled to ${HERO_TARGET_SPAN}. ` +
      "Outer rings are counter-clockwise, holes clockwise.",
    extent: { width: round4((maxX - minX) * scale), height: round4((maxY - minY) * scale) },
    space: { origin_easting: cx, origin_northing: cy, scale, metres_per_unit: 1 / scale },
    wards: features,
  };

  // The Python stage clips Natural Earth's land to a disc around the city, so
  // a coastal city shows its coastline. An inland city's disc is all land, and
  // clipping land to it returns the disc. That is computed directly here
  // instead of downloading a global coastline to cut nothing out of it; a city
  // within the radius of a coast needs the Python stage's clip.
  const radius = HERO_REGION_RADIUS_UNITS;
  const radiusKm = Math.round(radius / scale / 1000);
  const disc = Array.from({ length: 96 }, (_, i) => {
    const angle = (i / 96) * 2 * Math.PI;
    return [round4(Math.cos(angle) * radius), round4(Math.sin(angle) * radius)];
  });
  const heroRegion = {
    generated_from: "computed: the region disc, entirely land",
    licence: "not applicable",
    source_url: "",
    projection: city.projectedCrs,
    region_radius_units: round4(radius),
    simplify_tolerance_m: 0,
    note:
      `Land within about ${radiusKm} km of the city, in the same model space as the area geometry. ` +
      "The city is further than that from any coast, so the region is one unbroken disc.",
    parts: [{ outer: disc, holes: [] }],
  };
  return { heroCity, heroRegion };
}

// -------------------------------------------------------------- budget --
// Constants and reasoning are pipeline/15_optimize.py's; see that file for why
// only cool roofs can be allocated and why the default objective weights by
// vulnerability.
const COOL_ROOF_C_PER_0_1_ALBEDO = 0.6;
const ASSUMED_ALBEDO_GAIN = 0.4;
const ROOF_SHARE_OF_IMPERVIOUS = 0.4;
const BUDGET_INR = 50_000_000;
const BUDGET_INTERVENTION = "cool_roof_lime";

function budgetAllocation(city, wards, profiles) {
  const costs = readJson(join(ROOT, "config", "intervention_costs.json"));
  const spec = costs.interventions[BUDGET_INTERVENTION];
  if (!spec?.sourced) return null;
  const coolingC = (ASSUMED_ALBEDO_GAIN / 0.1) * COOL_ROOF_C_PER_0_1_ALBEDO;
  const byId = new Map(profiles.wards.map((w) => [w.ward_id, w]));

  const candidates = wards.features
    .map((f) => f.properties)
    .map((w) => {
      const profile = byId.get(w.ward_id);
      if (!profile || !profile.pop_density_km2 || profile.impervious_pct === undefined || !w.n_cells) return null;
      // Nominal area from the cell count, as the Python stage takes it.
      const areaKm2 = w.n_cells * (city.cellSizeM / 1000) ** 2;
      const population = profile.pop_density_km2 * areaKm2;
      const treatableM2 = areaKm2 * 1e6 * (profile.impervious_pct / 100) * ROOF_SHARE_OF_IMPERVIOUS;
      const cost = treatableM2 * spec.cost;
      const exposure = coolingC * population;
      const benefit = exposure * (w.HVI / 100);
      if (cost <= 0 || benefit <= 0) return null;
      return { ward_id: w.ward_id, rank: w.rank, hvi: Math.round(w.HVI * 100) / 100, population, treatableM2, cost, exposure, ratio: benefit / cost };
    })
    .filter(Boolean)
    .sort((a, b) => b.ratio - a.ratio);

  // Fractional knapsack: optimal for a divisible good, which square metres of roof are.
  let remaining = BUDGET_INR;
  const allocation = [];
  for (const c of candidates) {
    if (remaining <= 0) break;
    const spend = Math.min(Math.round(c.cost), remaining);
    const share = spend / Math.round(c.cost);
    allocation.push({
      ward_id: c.ward_id,
      rank: c.rank,
      hvi: c.hvi,
      population_est: Math.round(c.population),
      spend_inr: Math.round(spend),
      share_of_ward_treated: Math.round(share * 1000) / 1000,
      roof_m2_treated: Math.round(c.treatableM2 * share),
      benefit_person_degrees: Math.round(c.exposure * share),
    });
    remaining -= spend;
  }

  return {
    city: city.slug,
    intervention: { key: BUDGET_INTERVENTION, label: spec.label, unit: spec.unit, cost: spec.cost, source: spec.source, source_url: spec.source_url },
    sourced_cost: true,
    illustrative_only: false,
    budget_inr: BUDGET_INR,
    spent_inr: Math.round(BUDGET_INR - remaining),
    unspent_inr: Math.round(remaining),
    wards_funded: allocation.length,
    wards_fully_funded: allocation.filter((a) => a.share_of_ward_treated >= 0.999).length,
    total_benefit_person_degrees: allocation.reduce((s, a) => s + a.benefit_person_degrees, 0),
    objective: "vulnerability",
    objective_description:
      "Maximise vulnerability-weighted cooling: degrees C x people exposed x area HVI, allocated by benefit per rupee.",
    objective_note:
      "Allocated by fractional knapsack, provably optimal for a divisible intervention. The choice of objective " +
      "moves the answer a long way: maximising bare person-degrees sends the budget to whichever areas have the " +
      "most roof and the most people, whether or not they are the areas at risk. That is why this weights by " +
      "vulnerability, and why the objective is recorded in the output.",
    assumptions: [
      `Albedo gain from a cool roof: +${ASSUMED_ALBEDO_GAIN}. An assumption, not a measurement.`,
      `Cooling: ${COOL_ROOF_C_PER_0_1_ALBEDO} C per +0.1 albedo, the conservative end of Santamouris 2014's 0.57-2.3 K range.`,
      `Roof area: ${ROOF_SHARE_OF_IMPERVIOUS * 100}% of each area's impervious surface. Imperviousness includes roads and paving, so this is a share of it, and it is an assumption, not a roof survey.`,
      "Population from WorldPop density times area; the same modelled surface the index uses, not a census count.",
      "Benefit is instantaneous person-degrees. It does not model intervention lifetime, maintenance, discounting, or health outcomes.",
    ],
    limitations: [
      "Only cool roofs can be allocated. Cited cooling coefficients exist for tree canopy (Ziter 2019) and pocket parks (Bowler 2010), but no credible Indian unit cost was found for either, so they cannot enter a budget comparison.",
      "Costs are 2020 prices and are not inflation-adjusted.",
      "The areas are approximate localities, not administrative units, so an allocation by area is not an allocation to a body that could spend it.",
    ],
    citations: { cool_roof: "Santamouris 2014, Solar Energy 103:682-703, doi:10.1016/j.solener.2012.07.003" },
    allocation,
    skipped_wards: [],
  };
}

function main() {
  const city = cityFromArgv();
  const cells = readJson(join(city.dataDir, "cells_nbs.geojson"));
  const wards = readJson(join(city.dataDir, "wards_hvi.geojson"));
  const utm = utmProjector(city.projectedCrs);
  const boundariesUtm = readJson(city.boundariesPath).features.map((f, i) => ({
    ward_id: String(f.properties[city.wardIdField]),
    ward_gid: f.properties.gid ?? i + 1,
    geometry: mapGeometry(f.geometry, utm.forward),
  }));
  const indicators = Object.keys(DIRECTIONS).filter((c) => cells.features[0].properties[c] !== undefined);

  const change = ndviChange(cells);
  writeJson(join(city.dataDir, "cells_ndvi_change.geojson"), change);
  const counts = {};
  const heatCounts = {};
  for (const f of change.features) {
    counts[f.properties.change_class] = (counts[f.properties.change_class] ?? 0) + 1;
    heatCounts[f.properties.heat_change_class] = (heatCounts[f.properties.heat_change_class] ?? 0) + 1;
  }
  console.log(`[ok] green-cover change: ${JSON.stringify(counts)}`);
  const cityHeat = cityLstChange(cells);
  console.log(
    `[ok] surface-heat change against the city's own (${cityHeat === null ? "unknown" : cityHeat.toFixed(2) + " C"}): ${JSON.stringify(heatCounts)}`,
  );

  const weights = readJson(join(city.dataDir, "hvi_pca_log.json")).weights;
  const profiles = wardProfiles(cells, wards, boundariesUtm, indicators, weights);
  // The two seasons the change layers compare, so the site can name the years.
  const provenancePath = join(city.dataDir, "provenance_satellite.json");
  if (existsSync(provenancePath)) {
    const provenance = readJson(provenancePath);
    profiles.change_windows = { previous: provenance.previous_window, current: provenance.composite_window };
  }
  writeJson(join(city.dataDir, "ward_profiles.json"), profiles, 2);
  console.log(`[ok] wrote ${profiles.wards.length} area profiles`);
  const types = profiles.locality_types;
  console.log(
    `[ok] ${types.k} locality types (silhouette ${types.silhouette.toFixed(3)}; tried ` +
      types.candidates.map((c) => `k=${c.k}: ${c.silhouette.toFixed(3)}`).join(", ") +
      ")",
  );
  for (const type of types.types) console.log(`     ${type.name}: ${type.n} localities, mean score ${type.mean_score.toFixed(1)}`);

  const { heroCity, heroRegion } = heroModels(city, wards, boundariesUtm);
  writeJson(join(city.dataDir, "hero_city.json"), heroCity);
  writeJson(join(city.dataDir, "hero_region.json"), heroRegion);
  console.log(`[ok] wrote the hero model: ${heroCity.wards.length} areas`);

  const budget = budgetAllocation(city, wards, profiles);
  if (budget) {
    writeJson(join(city.dataDir, "budget_allocation.json"), budget, 2);
    console.log(`[ok] budget scenario: ${budget.wards_funded} areas funded from INR ${budget.budget_inr.toLocaleString("en-IN")}`);
  }

  // ------------------------------------------------------- sanity checks --
  let ok = true;
  const isolated = profiles.wards.filter((w) => w.neighbours.length === 0).map((w) => w.ward_id);
  if (isolated.length) {
    console.log(`[WARN] areas with no neighbour: ${isolated.join(", ")}`);
    ok = false;
  }
  if (heroCity.wards.length !== boundariesUtm.length) {
    console.log(`[WARN] ${heroCity.wards.length}/${boundariesUtm.length} areas in the hero model`);
    ok = false;
  }
  if ((counts.unknown ?? 0) > 0.1 * change.features.length) {
    console.log("[WARN] more than 10% of cells have no green-cover baseline");
    ok = false;
  }
  console.log(ok ? "\nGO" : "\nCHECK WARNINGS");
  if (!ok) process.exitCode = 2;
}

main();
