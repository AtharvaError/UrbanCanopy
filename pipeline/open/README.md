# The open build

Builds a city's dataset without Google Earth Engine, from sources that need no
account. It exists because the Python pipeline in the parent directory cannot run
without an Earth Engine project, and standing up a new city should not wait on one.

Nagpur is built this way. Mumbai is still built by the Python pipeline.

## Run it

```bash
npm install
```

```bash
node run.mjs --city nagpur --publish
```

`--publish` copies the result into `frontend/public/`, which holds exactly one
city. Leave it off to build into `data/<slug>/` only. `--from 05` resumes at a
stage and reuses earlier output.

The first run downloads about 130 Landsat band windows and takes several minutes on
a slow link. They are cached in `data/cache/`, so a rerun is quick and a run that
fails part way resumes where it stopped.

```bash
npm test
```

## Stages

| Stage | Script | What it produces | Source |
|---|---|---|---|
| 01 | `01_localities.mjs` | City outline and approximate locality polygons | OpenStreetMap |
| 02 | `02_grid.mjs` | The analysis grid, clipped to the localities | none |
| 03 | `03_satellite.mjs` | Surface temperature, NDVI now and nine years ago, built-up share, land-cover class, distance to water | Landsat 8/9 and ESA WorldCover on Microsoft Planetary Computer |
| 04 | `04_people.mjs` | Population density, distance to the nearest hospital | WorldPop, OpenStreetMap |
| 05 | `05_index.mjs` | Scores, weights, area ranking, sensitivity | none |
| 06 | `06_nbs.mjs` | Plantability and rule-based recommendations | none |
| 07 | `07_profiles.mjs` | Green-cover and surface-heat change, area profiles with the published formula constants, k-means locality types, the landing-page model, the budget scenario | none |
| 08 | `08_places.mjs` | Hospitals, schools, bus stops and markets inside the city's areas, for the map | OpenStreetMap |

Stage 01 is run once, by hand, when a city is set up:

```bash
node 01_localities.mjs --city nagpur --osm-relation 12969115
```

## How this relates to the Python pipeline

The scoring in `lib/index.mjs` and the recommendation rules in `lib/nbs.mjs` are
ports of `05_hvi.py`, `08_sensitivity.py` and `_nbs.py`. `verify_mumbai.test.mjs`
feeds Mumbai's committed input cells through the port and requires the published
scores, weights, ranks, plantability flags and recommendations back, to floating-point
precision. A change to either implementation that the other does not follow
fails that test.

The data stages are not ports. They read the same products from different places,
and they differ in these ways, each stated in the stage that does it:

- **Areas are approximate.** Nagpur has no open ward map, so stage 01 groups the
  city around named OpenStreetMap places. These are not administrative units.
- **The season comes from the city config.** Nagpur uses March to May, its hot
  season. Mumbai's November to February window would describe a mild winter here.
- **Population is read at 1 km.** WorldPop's server does not honour range requests,
  so the 100 m national file would have to be downloaded whole. Density is right at
  the scale of a locality and smoothed below it.
- **There is no slum or child-population indicator** unless a city supplies one.
  The index runs on the indicators a city has; Nagpur has five.
- **A pixel counts toward a cell when its centre is inside it.** Earth Engine
  weights by the fraction inside.
- **Not built here:** the station validation of surface temperature (stage 13),
  the multi-year time series (stage 14), the bootstrap uncertainty and the
  weighting comparison. The site hides those sections when their files are absent.

## Before relying on a new city

Read `docs/calibrating-ecology.md`. The plantability filter still encodes Mumbai's
coastal ecology and is not calibrated for any other city. Stage 06 says so every
time it runs.

Check the PCA loadings in `data/<slug>/hvi_pca_log.json` as well. The weighting
assumes the indicators rise and fall together. In Nagpur they do not: surface heat
and hospital distance rise toward the fringe while density and built-up cover rise
toward the core, so the weights come out close to equal and partly pull against
each other. The ranking is reproducible, but that is a property of the city worth
understanding before the ranking is used.
