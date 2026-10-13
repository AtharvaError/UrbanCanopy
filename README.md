<div align="center">

<img src="frontend/public/wordmark.svg" alt="UrbanCanopy" width="340">

**Which parts of Nagpur need cooling first, why, and what to do about it.**

![Stack](https://img.shields.io/badge/stack-Next.js%20%2B%20TypeScript%20%2B%20Node-38bdf8)
![Data](https://img.shields.io/badge/data-open%2C%20no%20account%20needed-22c55e)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

</div>

---

UrbanCanopy compares Nagpur's localities for heat-related concern using five public
indicators and one transparent formula. It ranks them, explains every score factor
by factor, lets you change an input and watch the score move, and suggests practical
actions.

It is a decision-support prototype. It is **not** a forecast, **not** a health
prediction, and **not** an official Nagpur Municipal Corporation tool.

## What it does

| | |
|---|---|
| **Priority map** | 30 localities coloured by score on a Mapbox basemap. Hover any one for its band, score, rank, main driver and key numbers. |
| **Ranked list** | Every locality, most concerning first, with a bar on one 0 to 100 scale. Searchable by name. |
| **Zone planner** | Click a locality for a side panel: priority band, a points breakdown that adds up exactly to the score, live what-if sliders, and suggested actions. |
| **Zone calculator** | Pick 3 to 5 localities, edit any indicator, drag any weight. Score, band and rank update as you type. |
| **How the score works** | The formula in one line, each weight, the bands, and six assumptions and limits. |
| **Kinds of locality** | K-means groups the localities into three types, so two that score alike for opposite reasons are told apart. |
| **Live heat outlook** | Nagpur's air temperature now (OpenWeatherMap, refreshed every five minutes) and the next four days' highs (Open-Meteo). On a day the forecast reaches 40°C or more, the dashboard names the localities to act in first. |
| **AI explainer** | "Explain with AI" in the planner writes a plain-language reading of a locality's numbers, in English, Hindi or Marathi. Optional: it needs a key, below. |
| **Action brief** | "Download brief" in the planner opens a one-page summary of a locality to print or save as a PDF: score, reasons, actions, places and limits. |
| **Getting hotter** | A map layer showing where the ground has warmed faster or slower than the city as a whole between 2017 and 2026. |
| **Places** | Hospitals, schools, bus stops and markets from OpenStreetMap as pins on the map, so an action points at somewhere. |
| **Hindi and Marathi** | A language switch for the main labels: menu, landing page, dashboard, planner headings and the people-focused actions. |
| **Scenario builder** | Apply tree canopy, cool roofs and pocket parks to several localities and compare before-and-after maps. |

## The score in one line

```
score = 65.5 + 36.0 × ( 0.27 × distance to a hospital
                      + 0.27 × population density
                      + 0.25 × built-up surface
                      + 0.19 × surface heat
                      − 0.02 × green cover )
```

Each factor goes in as how far the locality sits from the city average, in standard
deviations. A locality that is average on everything scores 65.5. Scores of 80 and
above are **Critical**, 65 to 80 **High**, 50 to 65 **Moderate**, below 50 **Lower**.

The weights come from a principal component analysis of Nagpur's own grid cells,
following Reid et al. 2009. You can change them in the calculator.

**Current top five:** Itwari (82.4), Shanti Nagar (78.5), Rameshwari (76.6),
Indora (76.0), Pratap Nagar (75.4).

## Quick start

You need [Node.js](https://nodejs.org) 24.

```bash
cd frontend
```

```bash
npm install
```

```bash
npm run dev
```

Open `http://localhost:3000`. The map, ranking, planner, calculator and scenario
builder run entirely off the data files committed in `frontend/public/`, so there is
no database to set up and they need no API key.

### Optional keys

Three features use a key. Each is switched off, with a plain message, when its key is
missing. Keys go in files that git ignores; do not commit one.

| Feature | Put this in | Variable |
|---|---|---|
| Mapbox basemap. Without it the map uses a key-free Esri basemap. | `frontend/.env.local` | `NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here` |
| Live temperature, from [OpenWeatherMap](https://openweathermap.org/api). | `frontend/.env.local` | `OPENWEATHER_API_KEY=your_key_here` |
| AI explainer, from Experiential Labs. | `frontend/.env.local` | `EXPLABS_API_KEY=your_key_here` |

Restart the dev server after changing `frontend/.env.local`.

The AI explainer runs inside the site (`/api/heat-explain`), so it works on a hosted
copy as well as on your own machine, and the key never reaches the browser.
`server.mjs` in the project root is the same explainer as a standalone server, kept
for running it apart from the site; the site does not need it.

## Where the data comes from

| Indicator | Source | Detail |
|---|---|---|
| Land surface temperature | Landsat 8/9 Collection 2 (USGS) | Median of 22 scenes, March to May 2026 |
| Green cover (NDVI) | Landsat 8/9 | Same scenes, plus a 2017 baseline for change |
| Built-up surface | ESA WorldCover 2021 | Share of each cell that is built-up |
| Tree cover (not in the score) | ESA WorldCover 2021 | Share of each cell mapped as tree cover; the starting point for the tree slider |
| Warming trend (not in the score) | Landsat 8/9 | The same season in 2017 and 2026, read against the city's own change |
| Places (not in the score) | OpenStreetMap | 412 hospitals, 75 schools, 21 bus stops, 3 markets |
| Population density | WorldPop 2020 | 1 km estimate |
| Distance to a hospital | OpenStreetMap | 439 mapped hospitals |
| City outline, locality names | OpenStreetMap | Relation 12969115, "Nagpur City" |

Satellite data is read from Microsoft Planetary Computer's public archive. Nothing in
the build needs an account.

- **Grid:** 932 cells of 500 m, 928 of them scored.
- **Localities:** 30, such as Sitabuldi, Sadar, Dharampeth, Mahal and Itwari.

## Rebuilding the data

```bash
cd pipeline/open
```

```bash
npm install
```

```bash
node run.mjs --city nagpur --publish
```

The first run downloads about 130 small windows of Landsat imagery and takes several
minutes; they are cached in `data/cache/`, so later runs are quick. See
[pipeline/open/README.md](pipeline/open/README.md) for each stage.

## Tests

```bash
cd frontend
```

```bash
npm test
```

335 tests for the site. The data build has its own, including one that feeds Mumbai's
original inputs through the scoring code and requires the original project's published
scores back exactly:

```bash
cd pipeline/open
```

```bash
npm test
```

## Structure

```
frontend/         Next.js site: map, planner, calculator, scenario builder
server.mjs        The AI explainer as a standalone server (optional)
pipeline/open/    Node data build for Nagpur (satellite, population, scoring, clustering)
pipeline/         The original Python + Earth Engine pipeline (used for Mumbai)
config/cities/    One JSON file per city: bounding box, grid size, season
data/nagpur/      Nagpur's built dataset
data/             Mumbai's original dataset, kept as the scoring reference
docs/             Method notes from the original project
docs/PRD.md       Product requirements, and how the app maps to the hackathon brief
```

## Assumptions and limits

Stated in the app as well, on the calculator page.

- **Illustrative, not predictive.** The score ranks where to look first. It does not
  predict illness or temperature.
- **Surface, not air.** Heat is land surface temperature from satellite, which is the
  temperature of roofs, roads and soil.
- **The AI explanation is generated text.** It restates the locality's published
  numbers in plain language and can be wrong. It adds nothing to the score.
- **Live weather does not change the score.** It is one reading for the whole city, so
  it cannot rank localities. The score says where to act; the forecast says when. The
  alert uses the India Meteorological Department's criteria on actual temperature (45°C
  a heat wave, 47°C a severe one); 40 to 45°C is shown as a "heat watch", which is this
  tool's own label and not an official declaration.
- **Localities are approximate.** No open map of Nagpur's municipal zones or wards
  exists, so each cell is grouped with the nearest named place from OpenStreetMap.
  They are not administrative boundaries.
- **The dense core is cooler at the surface than the open fringe.** Cells that are 80%
  or more built-up average 44.6°C; cells under 20% built-up average 46.4°C. Top
  localities rank high for crowding and built-up cover, not for being the hottest
  ground.
- **The factors partly pull against each other,** so the statistical weights come out
  close to equal and no weighting is the single right one. Have them reviewed before
  using the ranking for a real decision.
- **Coarse or incomplete inputs.** Population is a 1 km model. Hospitals are as mapped
  in OpenStreetMap. There is no open data on outdoor workers, older residents or
  informal housing.
- **Tree cover is land mapped as trees at 10 m.** It stands in for canopy cover and
  runs low in built-up areas, where a street tree is narrower than a pixel.
- **The warming layer compares two seasons, not a trend line.** 2026's hot season was
  cooler overall than 2017's, so each cell is read against the city-wide change. It
  shows where the city warmed faster or slower than itself, not by how much it warmed.
- **Places are as mapped by volunteers.** Bus stops and markets are far from complete
  in OpenStreetMap; a locality with none drawn is not a locality with none.
- **Translations cover the main labels.** Numbers, place names and the method and
  limits text stay in English. The Hindi and Marathi wording has not been reviewed by
  a native-speaking subject expert.
- **Plantability is not calibrated for central India.** It is a land-cover screen and
  does not clear a site for planting.
- **Cooling estimates come from studies of other cities** (Ziter 2019, Santamouris
  2014, Bowler 2010) and are indicative only.
