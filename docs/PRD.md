# Product Requirements Document: UrbanCanopy

| | |
|---|---|
| Product | UrbanCanopy, urban heat intelligence for Nagpur |
| Document status | Draft v2, 12 October 2026 (replaces v1, "UCIP Nagpur") |
| Owner | (add team name) |
| Build status | Working prototype on real Nagpur data. See section 11. |
| Built on | The open-source UCIP project (Apache 2.0) |

## 1. Summary

UrbanCanopy shows which parts of Nagpur most need cooling, explains why in plain
numbers, and lets a planner test interventions before spending money on them.

It scores the city on a 500 m grid from satellite and open public data, rolls the
scores up into 30 named localities, and gives each one an intervention priority
score from 0 to 100. Clicking a locality opens a planner panel that breaks the
score down factor by factor, runs "what if" cooling scenarios live, and lists
recommended actions with citations.

It is a decision-support tool. It is not a forecast, not a health prediction, and
not an official Nagpur Municipal Corporation (NMC) product.

## 2. Problem

Nagpur is one of the hottest large cities in India. In the March to May 2026 hot
season its land surface averaged about 45°C in satellite imagery, with individual
500 m cells from 31°C to 53°C.

Heat risk is not spread evenly, and it is not the same thing as heat. A crowded,
fully built-up neighbourhood is at higher risk than open land that is hotter at the
surface but has few residents. Today a planner deciding where to plant trees, paint
roofs or open a cooling centre has no ranked, explained, neighbourhood-level picture
that combines heat with who lives there. Existing heat maps show temperature only,
and they do not say what to do.

## 3. Goals

1. Rank Nagpur's localities by intervention priority, with every score explained.
2. Recommend cooling actions per locality, each traceable to a citation.
3. Let a user test "what if" scenarios and see the effect on the score immediately.
4. Use only real, open data, and state every assumption and limit in the product.

### Non-goals

- Predicting air temperature, heatwaves or health outcomes.
- Replacing a site-level engineering or ecological study.
- Other cities. The engine is city-agnostic, but this release is Nagpur only.
- Phone-first design. The product is built for desktop; the planner panel does
  open full-screen on small screens.

## 4. Users

| User | What they need |
|---|---|
| City planner or NMC-adjacent professional | A ranked list, the reason behind each rank, and a defensible action. |
| Resident | "Is my area a priority, and what does this map mean?" in plain language. |
| Reviewer or hackathon judge | A method they can check: sources, weights, assumptions, limits. |

## 5. User stories

- As a planner, I see every locality ranked, so I know where to look first.
- As a planner, I click a locality and see which factors push its score up or
  down, in points, so I choose the right kind of intervention.
- As a planner, I move sliders for trees, cool roofs and parks and watch the score,
  priority band and rank change, so I can compare options before committing.
- As a planner, I see which single lever cools this locality most.
- As a resident, I search for my neighbourhood by name.
- As a reviewer, I can trace any number to a data source, a citation or a stated
  assumption.

## 6. Features

| # | Feature | Description | Priority | Status |
|---|---|---|---|---|
| F1 | Priority map | Localities coloured by score, on a Mapbox basemap that follows light and dark theme. Heat grid, plantability and green-cover-change layers. | Must | Built |
| F2 | Ranked list | All localities, most vulnerable first, searchable by name. | Must | Built |
| F3 | Zone Intelligence & Action Planner | Slide-over panel for the selected locality. See section 7. | Must | Built (first three tabs) |
| F4 | Scenario builder | Pick several localities, apply interventions or a preset, see before-and-after maps, cooling in °C, new scores and ranks. | Must | Built |
| F5 | Rule-based recommendations | Native trees, cool roofs, pocket parks, rain gardens, each with a rationale and citation. | Must | Built |
| F6 | Plantability screen | Trees are only suggested where land cover allows planting. | Must | Built, not yet calibrated for the region |
| F7 | 3D city overview | Localities raised and coloured by score on the landing page. | Should | Built |
| F8 | Budget scenario | Where a fixed cool-roof budget would go, using sourced costs only. | Could | Removed from the site at the owner's request; still computed by the data build |
| F9 | Read-only API | The same data for other tools. | Could | Built |
| F10 | Zone calculator | Pick 3 to 5 localities, edit any indicator, drag any weight; score, band and rank update live. Includes a one-click worked example. | Must | Built |
| F11 | "How the score works" card | The formula in one line, each weight, the priority bands, six assumptions and limits. | Must | Built |
| F12 | People-focused suggestions | Drinking water, shade where people wait, midday work advisory, outreach priority, a public cool room. One visible rule each. | Must | Built |
| F13 | Ranking bars | A bar per locality in the ranked list, on one 0 to 100 scale. | Should | Built |
| F14 | Map hover card | Band, score, rank, main driver and four measured values under the pointer. | Should | Built |
| F15 | Kinds of locality | K-means groups the 30 localities into types by their five indicators. Shown on the calculator page, in the planner and on the hover card. | Should | Built |
| F19 | Measured tree cover | The tree slider counts from the tree cover ESA WorldCover maps in each cell, so only added canopy cools. | Must | Built |
| F20 | Getting hotter layer | Where the surface warmed faster or slower than the city between 2017 and 2026. | Should | Built |
| F21 | Places on the map | Hospitals, schools, bus stops and markets from OpenStreetMap as pins. | Should | Built |
| F22 | Action brief | A one-page printable summary per locality. | Should | Built |
| F23 | Hindi and Marathi | A language switch for the main labels and the AI explanation. | Should | Built |
| F24 | Data & method page | Formula, what is measured or assumed, locality types, sources. | Should | Built |
| F17 | AI explainer | A plain-language reading of a locality's numbers, generated on request through a local server. Optional; needs a key. | Could | Built |
| F18 | Live temperature | Current air temperature from OpenWeatherMap in the header, landing page and outlook bar, refreshed every five minutes. Optional; needs a key. | Should | Built |
| F16 | Live heat outlook | Live air temperature (OpenWeatherMap) and four-day forecast highs (Open-Meteo) on the dashboard. A stated threshold rule turns the hottest day into an alert level and names the localities to act in first. Weather never changes a score. | Should | Built |

Removed in this version at the owner's request: the Methodology, Mission,
Contribute and Contact pages. Method notes now live in `docs/` only.

## 7. Zone Intelligence & Action Planner

Opens from the right when a locality is clicked on the map or in the ranked list.
About 460 px wide on desktop, full-screen on small screens.

**Behaviour**

- Slides in from the right; closes with the X button or Escape.
- The locality stays highlighted on the map and in the list while it is open.
- Previous and Next controls step through localities in rank order. The open tab
  is kept; the what-if sliders reset so a scenario never carries over silently.
- The map stays live beside the panel, so clicking another locality switches it.
- A "Compare with city average" toggle shows the city figure beside each value.

**Header**

- Priority badge: Critical (80 and above), High (65 to 80), Moderate (50 to 65),
  Lower (below 50). The bands follow the map legend's colour breaks.
- Locality name, built form from land cover, number of cells.
- Intervention priority score out of 100, rank, and points above or below the
  city average.
- One sentence naming the main concern, generated from the largest upward factors.
- A standing note: illustrative, from public indicators, not a health prediction.

**Tab 1: Why this zone?**

Each factor is shown with its measured value, its concern level from 0 to 100
among localities, its weight in the index, its contribution in points, and a short
interpretation. The breakdown is exact: the city-average baseline plus every
factor's points equals the published score.

**Tab 2: What if?**

Presets and three sliders (tree canopy, cool-roof albedo, pocket parks). Changing
one updates the estimated cooling, the score, the priority band, the rank, the
breakdown on tab 1 and the summary on tab 3 immediately.

**Tab 3: Actions**

The three levers ranked by how much each moves this locality, the rule-based
recommendations with citations, and a link to the multi-locality scenario builder.

**Wording rule:** the panel says intervention priority, never danger, health
prediction or fatality risk.

**Open item:** only the first part of the planner brief was received. Any further
tabs or sections in the full brief are not yet built.

## 8. How the score is built

The score is a transparent weighted sum, 0 to 100. There is no trained model.

| Indicator | Source | Weight |
|---|---|---|
| Distance to nearest hospital | OpenStreetMap, 439 hospitals | 27% |
| Population density | WorldPop 2020 | 27% |
| Built-up share | ESA WorldCover 2021 | 25% |
| Land surface temperature | Landsat 8/9, March to May 2026 median, 22 scenes | 19% |
| Green cover (NDVI) | Landsat 8/9, same scenes | 2% |

- Weights come from a principal component analysis of Nagpur's own cells, following
  Reid et al. 2009. The first component explains 52% of the variation.
- Ranking stability: nudging any weight by 20% leaves the order almost unchanged
  (mean Kendall tau 0.94, top five overlap 4.6 of 5).
- The scoring code is a port of UCIP's, and it reproduces UCIP's published Mumbai
  scores, weights, ranks and recommendations exactly. That is checked by a test.
- Cooling estimates use published coefficients: Ziter 2019 (canopy), Santamouris
  2014 (cool roofs), Bowler 2010 (parks).

**Current top five:** Itwari (82.4), Shanti Nagar (78.5), Rameshwari (76.6),
Indora (76.0), Pratap Nagar (75.4).

**A finding worth stating:** in the hot season, Nagpur's dense core is cooler at
the surface than its open fringe. Cells that are 80% or more built-up average
44.6°C; cells under 20% built-up average 46.4°C, and grassland cells 48.3°C. Bare
soil and dry grass heat up more than buildings do. So the top localities rank high
because of crowding and built-up cover, not because they are the hottest ground.
This is why the tool scores vulnerability and not temperature alone.

**A limit of the weighting, stated plainly:** the method assumes the indicators
move together along one "vulnerability" axis. In Nagpur they do not. Surface heat
and hospital distance rise toward the fringe while density and built-up cover rise
toward the core. The method keeps each indicator's fixed direction and uses only
the size of its statistical loading as the weight, so in practice the index is
close to an equal weighting of four indicators that partly pull against each other.
The ranking is stable and reproducible, but the weights should be reviewed by a
domain expert before it informs a real decision.

## 8b. Kinds of locality (clustering)

The score ranks localities. A second, separate reading sorts them by what kind of
place they are, using k-means on the same five indicators, standardised across
the 30 localities.

| Type | Localities | Mean score | What sets it apart |
|---|---|---|---|
| Crowded built-up core | 13 | 73.9 | More built-up and denser; less green cover; closer to hospitals |
| Hot open fringe | 9 | 63.1 | Hotter at the surface and further from hospitals; less dense, less built-up |
| Greener, cooler neighbourhoods | 8 | 62.1 | More green cover; cooler at the surface |

- Three types were chosen by a stated rule: the largest number of groups whose
  silhouette is within 0.05 of the best. Two groups separate slightly more cleanly
  (0.48 against 0.46) but only say "core versus fringe".
- The clustering uses a fixed random seed, so it gives the same result every run.
- Types describe; they are not risk levels. The fringe and the greener
  neighbourhoods score almost the same on average and need different responses,
  which is the reason to show types at all.
- A silhouette of 0.46 means the groups are real but not sharply separated. A
  locality near the edge of its group could reasonably sit in the next one.

## 8a. How this maps to the hackathon brief

The brief ("Urban Heat Risk Intelligence") asks for a small app that compares
zones with transparent indicators and makes no claim of precise prediction.

| The brief asks for | Where it is |
|---|---|
| Display 3 to 5 zones and their indicators | Zone calculator; also the full ranked list of 30 |
| An explainable score from a simple weighted rule | "How the score works" card; points breakdown in the planner |
| Rank zones and show the main factors | Ranked list with bars; "Why this zone?" tab; map hover card |
| Practical suggestions (shade, hydration, outreach) | Planner "Actions" tab |
| Zone comparison and a risk category | Calculator; Critical, High, Moderate, Lower bands |
| Ranked hotspot list or simple chart | Ranked list with bars |
| One example of an input change affecting the score | Calculator's "Example" button; planner "What if?" tab |
| Brief assumptions and limitations | "How the score works" card |

Not covered: typing in a brand-new zone from scratch (the calculator edits real
localities), and a true vulnerable-population indicator, for which no open data
was found. The brief was received cut off after "no GIS or live", so anything
after that point has not been checked.

## 9. Data and geography

- **City boundary:** the Nagpur City outline from OpenStreetMap, about 211 km².
- **Grid:** 932 cells of 500 m, of which 928 are scored.
- **Localities:** 30 named areas. No open map of NMC zones or wards exists, so each
  cell is grouped with the nearest named place from OpenStreetMap. These are
  approximate and are not administrative boundaries. The product says so.
- **Rebuild:** one command, no account or paid service needed, except the optional
  Mapbox token for the basemap.

## 10. Technical approach

| Layer | Choice |
|---|---|
| Frontend | Next.js, TypeScript, Tailwind, Leaflet with Mapbox tiles, SVG maps, three.js for the 3D overview |
| Data build | Node.js scripts in `pipeline/open/`, reading open satellite archives directly |
| Storage | Static GeoJSON and JSON served with the site. No database required. |
| Configuration | Mapbox public token in `frontend/.env.local`, not in source control |
| Hosting | Any Node host that serves a Next.js app |

## 11. Current status

| Item | Status |
|---|---|
| Nagpur dataset: boundary, localities, grid, five indicators, scores, recommendations | Done |
| Website switched to Nagpur and renamed UrbanCanopy, with new logo | Done |
| Zone Intelligence & Action Planner (three tabs) | Done |
| Scenario builder on Nagpur data | Done |
| Mapbox basemap | Done |
| Methodology, Mission, Contribute, Contact pages | Removed |
| Automated tests updated for Nagpur (340 passing, plus 14 for the data build) | Done |
| Zone calculator, score card, people-focused suggestions, ranking bars, hover card | Done |
| K-means locality types | Done |
| Live heat outlook on the dashboard | Done |
| AI explainer and OpenWeatherMap live temperature merged | Done |
| Tree-cover baseline, warming layer, places, action brief, languages, new page layout | Done |
| Official ward boundaries | Not available as open data; needs a file from the municipal corporation |
| README rewritten for UrbanCanopy and Nagpur | Done |
| Remaining sections of the planner brief | Waiting on the full brief |

## 12. Success measures

For the prototype:

- Every locality has a score, a rank, a priority band and an explained breakdown.
- A first-time user can open a locality and run a what-if in under one minute.
- Every number on screen traces to a source, a citation or a stated assumption.
- The whole dataset rebuilds from scratch with one command.

If taken further: use by at least one NMC department or local NGO, and a field
check of the ranking against ground measurements.

## 13. Risks and limitations

| Risk | Effect | Mitigation |
|---|---|---|
| Localities are approximate, not official wards | May be read as NMC units | Labelled in the product; replace with official boundaries when available |
| Land surface temperature is not air temperature | Scores may be over-read as "felt" heat | Stated wherever temperature appears |
| Plantability was tuned for Mumbai's ecology | May mark native open habitat as plantable | Flagged as uncalibrated; needs a local ecologist's review |
| Population data is at 1 km, coarser than the grid | Neighbouring cells share a density; parks and lakes are credited with residents | Stated; use a finer source if one becomes available |
| Indicators do not move together in Nagpur (see section 8) | The statistical weighting is close to equal weighting, and heat pulls against density | Stated here; have the weights reviewed before real use |
| Hospital distance carries the largest weight and depends on OpenStreetMap | A missing hospital in the map inflates a locality's score | Stated; verify the hospital list locally |
| Green cover has almost no weight (2%) | The index barely rewards greenery in the hot season, when vegetation is sparse everywhere | Stated; a monsoon-season layer could be added |
| Green-cover change compares two single seasons | A wetter year can look like tree growth | Read broad patterns only, not single cells |
| No slum or child-population data | Social vulnerability is under-represented | Stated; add when a source is found |
| Cooling coefficients come from other cities | Scenario results are indicative | Shown as estimates with ranges |

## 14. Open questions

1. Can official NMC zone or prabhag boundaries be obtained?
2. Is there a usable source for informal-settlement locations in Nagpur?
3. What do the remaining sections of the planner brief ask for?
4. Who is the intended first real user: NMC, the Smart City office, or an NGO?

## 15. Milestones

| Milestone | Contents | Status |
|---|---|---|
| M1 | Nagpur dataset complete | Done |
| M2 | Website on Nagpur, renamed, planner panel live | Done |
| M3 | Demo-ready: tests green, production build, pitch material | Tests and build done; pitch material still describes Mumbai |
| Later | Official boundaries, ecological calibration, ground validation, remaining planner sections | Planned |
