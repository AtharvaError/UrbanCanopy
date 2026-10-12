"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { GeoJSON, MapContainer, Pane, TileLayer, useMap } from "react-leaflet";
import { geoJSON as leafletGeoJSON } from "leaflet";
import type { Feature, FeatureCollection, Geometry } from "geojson";
import type { GeoJSON as LeafletGeoJSONLayer, Layer, Path, PathOptions } from "leaflet";
import { Loader2, LocateFixed, Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { boundsOf } from "@/lib/geometry";
import { ACTIVE_CITY } from "@/lib/city";
import { hviColor as colorForHvi } from "@/lib/hvi";
import type { MapLayer, MapView } from "@/lib/mapState";
import type { CellNbsProps, CellNdviProps, WardProps } from "@/lib/wardTypes";
import { WARD_PROFILES_URL, ordinal, type WardProfileData } from "@/lib/wardProfile";
import { hoverSummary } from "@/lib/zonePlanner";

type LayerId = MapLayer;

// Map centre now comes from config/cities/<slug>.json, the same file the
// pipeline reads, rather than a literal that could drift from it (issue #68).

/** Selected-ward outline, layered on top of whichever data layer is active. */
function selectionStyle(wardId: string, selectedWardId: string | null): Partial<PathOptions> {
  if (wardId !== selectedWardId) return {};
  return { color: "#0EA5B3", weight: 3 };
}

function styleHvi(selectedWardId: string | null) {
  return (feature?: Feature<Geometry, WardProps>): PathOptions => ({
    fillColor: colorForHvi(feature?.properties?.HVI ?? null),
    fillOpacity: 0.75,
    color: "#333333",
    weight: 1,
    ...selectionStyle(feature?.properties?.ward_id ?? "", selectedWardId),
  });
}

/**
 * The 541-cell grid, colored by the same continuous HVI ramp as the ward
 * layer instead of the ward-level average. This is the layer the r/gis
 * critique asked for: the computation was already gridded (`05_hvi.py`
 * scores every cell before the ward rollup averages them), only the
 * rendering was ward-only. Thinner strokes than the 24-ward layer, since
 * 541 adjacent cell borders at ward-layer weight tile into a solid mesh.
 */
function styleHviGrid(selectedWardId: string | null) {
  return (feature?: Feature<Geometry, CellNbsProps>): PathOptions => ({
    fillColor: colorForHvi(feature?.properties?.HVI ?? null),
    fillOpacity: 0.8,
    color: "#333333",
    weight: 0.3,
    ...selectionStyle(feature?.properties?.ward_id ?? "", selectedWardId),
  });
}

function stylePlantability(selectedWardId: string | null) {
  return (feature?: Feature<Geometry, CellNbsProps>): PathOptions => {
    const plantable = feature?.properties?.plantable;
    return {
      fillColor: plantable ? "#4ade80" : "#f87171",
      fillOpacity: 0.65,
      color: "#333333",
      weight: 0.5,
      ...selectionStyle(feature?.properties?.ward_id ?? "", selectedWardId),
    };
  };
}

const NDVI_CHANGE_COLORS: Record<string, string> = {
  gained: "#4ade80",
  stable: "#d4d4d8",
  lost: "#f87171",
  unknown: "#e5e5e5",
};

function styleNdviChange(selectedWardId: string | null) {
  return (feature?: Feature<Geometry, CellNdviProps>): PathOptions => {
    const cls = feature?.properties?.change_class ?? "unknown";
    return {
      fillColor: NDVI_CHANGE_COLORS[cls] ?? "#e5e5e5",
      fillOpacity: 0.7,
      color: "#333333",
      weight: 0.5,
      ...selectionStyle(feature?.properties?.ward_id ?? "", selectedWardId),
    };
  };
}

/** A Mapbox public token. Public by design: it ships to the browser, and is restricted by URL on Mapbox's side, not by secrecy. */
const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

/**
 * The street map under the data.
 *
 * With a Mapbox token, Mapbox's light or dark style to match the theme, so the
 * basemap stops being a white rectangle in a dark interface. Without one,
 * Esri's World Light Gray Canvas, which needs no key and keeps a fresh
 * checkout working.
 *
 * Not CARTO: its free tier serves a watermarked "API KEY REQUIRED" placeholder
 * for every tile, with a 200 status, so the failure only shows in the pixels
 * (confirmed 2026-09-03).
 */
/** Above the data polygons (Leaflet's overlay pane is 400), below markers and tooltips. */
const LABEL_PANE_Z = 450;

function Basemap() {
  const { resolvedTheme } = useTheme();
  if (MAPBOX_TOKEN) {
    const dark = resolvedTheme === "dark";
    const tiles = (style: string) =>
      `https://api.mapbox.com/styles/v1/mapbox/${style}/tiles/512/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`;
    const style = dark ? "dark-v11" : "light-v11";
    return (
      <>
        <TileLayer
          // Keyed by style: Leaflet does not refetch tiles when only the URL
          // template of a mounted layer changes.
          key={`base-${style}`}
          attribution='&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> <a href="https://www.mapbox.com/map-feedback/">Improve this map</a>'
          url={tiles(style)}
          tileSize={512}
          zoomOffset={-1}
        />
        {/* Place names again, over the data, so they are read on top of the
            colours and not through them.

            A raster style has no labels-only version, so the lettering is
            lifted out of a second copy of the map with a filter and a blend.
            The copy is always the dark style, whichever theme is showing: its
            lettering is pale on near-black, the widest gap between text and
            everything else that either style has. The light style's district
            names are a thin mid grey, about as dark as its lakes, and no
            threshold separates the two.

            The filter pushes the copy to two tones. In the dark theme the
            lettering goes to white and the rest to black, and "lighten" keeps
            only what is lighter than the fill beneath. In the light theme the
            copy is inverted first, so the lettering goes to black and the rest
            to white, and "darken" keeps only what is darker. Either way the
            data colours come through untouched. Light and dark are the same
            style in two palettes, so each name lands exactly on its twin in
            the layer below.

            The pane is named for the theme because a Leaflet pane's style is
            set when it is created. */}
        <Pane
          key={`labels-${style}`}
          name={`basemap-labels-${style}`}
          style={{
            zIndex: LABEL_PANE_Z,
            pointerEvents: "none",
            mixBlendMode: dark ? "lighten" : "darken",
            filter: dark ? "brightness(1.6) contrast(4)" : "invert(1) brightness(0.72) contrast(8)",
          }}
        >
          <TileLayer url={tiles("dark-v11")} tileSize={512} zoomOffset={-1} />
        </Pane>
      </>
    );
  }
  // Esri's Canvas services are addressed z/y/x, not Leaflet's usual z/x/y,
  // and split into an unlabelled base plus a transparent label overlay, which
  // goes above the data so the labels are not tinted by it.
  return (
    <>
      <TileLayer
        attribution='&copy; <a href="https://www.esri.com">Esri</a> — Esri, HERE, Garmin, FAO, NOAA, USGS'
        url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
      />
      <Pane name="basemap-labels" style={{ zIndex: LABEL_PANE_Z, pointerEvents: "none" }}>
        <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}" />
      </Pane>
    </>
  );
}

/** Tooltip content is HTML handed to Leaflet, and locality names are data. */
function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

/**
 * The card that follows the pointer over the map: the locality's name, its
 * band, score and rank, what drives it, and four measured values. Short on
 * purpose, it is what you read to decide whether to click.
 *
 * Over a cell layer it adds that cell's own value, since the cell is what the
 * pointer is actually on.
 */
function hoverCardHtml(
  wardId: string,
  properties: Record<string, unknown>,
  profiles: WardProfileData | null,
): string {
  const profile = profiles?.wards.find((w) => w.ward_id === wardId);
  const summary = profile && profiles ? hoverSummary(profile, profiles) : null;
  if (!summary) return `<p class="zone-hover__name">${escapeHtml(wardId)}</p>`;

  const cellLines: string[] = [];
  if (typeof properties.grid_id === "string") {
    if (typeof properties.HVI === "number") cellLines.push(`This cell scores ${properties.HVI.toFixed(1)}`);
    if (typeof properties.plantable === "boolean") cellLines.push(properties.plantable ? "plantable" : "not plantable");
    if (typeof properties.change_class === "string") cellLines.push(`green cover ${properties.change_class}`);
  }

  return [
    `<p class="zone-hover__name">${escapeHtml(summary.name)}<span class="zone-hover__band zone-hover__band--${summary.level.toLowerCase()}">${summary.level}</span></p>`,
    `<p class="zone-hover__score"><strong>${summary.score.toFixed(1)}</strong> / 100${
      summary.rank === null ? "" : ` · ${ordinal(summary.rank)} of ${summary.total}`
    }</p>`,
    `<p class="zone-hover__line">${
      summary.driver ? `Main driver: ${escapeHtml(summary.driver.toLowerCase())}` : "No factor above the city average"
    }</p>`,
    summary.type ? `<p class="zone-hover__line">Type: ${escapeHtml(summary.type.toLowerCase())}</p>` : "",
    `<p class="zone-hover__facts">${summary.facts.map(escapeHtml).join(" · ")}</p>`,
    cellLines.length ? `<p class="zone-hover__line">${escapeHtml(cellLines.join(", "))}</p>` : "",
    `<p class="zone-hover__hint">Click for the full breakdown</p>`,
  ].join("");
}

const LAYER_META: Record<LayerId, { label: string; url: string; caption: string }> = {
  hvi: {
    label: "Heat vulnerability",
    url: "/wards_hvi.geojson",
    caption: "How urgently each locality needs cooling, combining heat, people, and access to help.",
  },
  hvi_grid: {
    label: "Heat grid",
    // Same file the plantability layer reads: cells_nbs.geojson already
    // carries HVI per cell, alongside plantable/worldcover_class.
    url: "/cells_nbs.geojson",
    caption: `The same index at the ${ACTIVE_CITY.cellLabel} cell it is measured at, before the cells are averaged into localities.`,
  },
  plantability: {
    label: "Plantability",
    url: "/cells_nbs.geojson",
    caption: "Where planting trees makes ecological sense, and where cool roofs work better.",
  },
  ndvi_change: {
    label: "Green-cover change",
    url: "/cells_ndvi_change.geojson",
    caption: "Where vegetation has grown or been lost over about nine years, hot season to hot season.",
  },
};

const HVI_LEGEND_BINS = [
  { color: "#ffffb2", label: "Under 20" },
  { color: "#fed976", label: "20-35" },
  { color: "#feb24c", label: "35-50" },
  { color: "#fd8d3c", label: "50-65" },
  { color: "#f03b20", label: "65-80" },
  { color: "#bd0026", label: "80+" },
];

function Legend({ layer }: { layer: LayerId }) {
  return (
    <Card className="absolute bottom-6 left-2 z-[1000] max-w-[240px] gap-0 bg-background/95 p-3 text-xs backdrop-blur-sm">
      {layer === "hvi" && (
        <>
          <p className="mb-1.5 font-semibold text-foreground">Heat Vulnerability Index (0-100)</p>
          <div className="flex overflow-hidden rounded-sm" aria-hidden="true">
            {HVI_LEGEND_BINS.map((b) => (
              <div key={b.color} className="h-3 flex-1" style={{ background: b.color }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Less vulnerable</span>
            <span>Most vulnerable</span>
          </div>
        </>
      )}
      {layer === "hvi_grid" && (
        <>
          <p className="mb-1.5 font-semibold text-foreground">HVI, {ACTIVE_CITY.cellLabel} grid (0-100)</p>
          <div className="flex overflow-hidden rounded-sm" aria-hidden="true">
            {HVI_LEGEND_BINS.map((b) => (
              <div key={b.color} className="h-3 flex-1" style={{ background: b.color }} />
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
            <span>Less vulnerable</span>
            <span>Most vulnerable</span>
          </div>
          <p className="mt-1.5 text-[10px] text-muted-foreground">
            The same score a locality is averaged from.
          </p>
        </>
      )}
      {layer === "plantability" && (
        <>
          <p className="mb-1.5 font-semibold text-foreground">Can trees go here?</p>
          <div className="space-y-1 text-foreground">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#4ade80" }} aria-hidden="true" />
              <span>Yes, suitable for planting</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#f87171" }} aria-hidden="true" />
              <span>No, cool roofs instead</span>
            </div>
          </div>
        </>
      )}
      {layer === "ndvi_change" && (
        <>
          <p className="mb-1.5 font-semibold text-foreground">Green cover since 2016-17</p>
          <div className="space-y-1 text-foreground">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#4ade80" }} aria-hidden="true" />
              <span>Gained vegetation</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm border border-border" style={{ background: "#d4d4d8" }} aria-hidden="true" />
              <span>Stable</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-sm" style={{ background: "#f87171" }} aria-hidden="true" />
              <span>Lost vegetation</span>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

/** Pans/zooms to the selected ward when selection changes and ward-level geometry is available. */
function FlyToSelection({
  selectedWardId,
  wardsGeo,
}: {
  selectedWardId: string | null;
  wardsGeo: FeatureCollection<Geometry, WardProps> | null;
}) {
  const map = useMap();
  useEffect(() => {
    if (!selectedWardId || !wardsGeo) return;
    const feature = wardsGeo.features.find((f) => f.properties.ward_id === selectedWardId);
    const bounds = feature ? boundsOf(feature.geometry) : null;
    if (bounds) map.flyToBounds(bounds, { padding: [48, 48], maxZoom: 13, duration: 0.6 });
  }, [selectedWardId, wardsGeo, map]);
  return null;
}

/**
 * Leaflet caches its container's pixel size at creation time and doesn't notice
 * layout-driven resizes (e.g. toggling fullscreen, which changes the container's
 * width instantly via React state, not a window resize event). Without this the
 * map keeps its old framing and leaves the newly-available space blank.
 */
function InvalidateSizeOnChange({ dep }: { dep: unknown }) {
  const map = useMap();

  // Primary mechanism: react to the container's actual pixel size changing,
  // whatever the cause (fullscreen toggle, sidebar mount/unmount, a CSS
  // transition settling, OS/browser chrome changing). This is more reliable
  // than guessing a fixed delay, since it fires exactly when the size is
  // actually different rather than assuming a transition duration.
  useEffect(() => {
    const el = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(el);
    return () => observer.disconnect();
  }, [map]);

  // Redundant safety net tied to the fullscreen toggle itself, in case a
  // resize happens to report the same size mid-transition before settling
  // (e.g. a layout that overshoots then corrects).
  useEffect(() => {
    map.invalidateSize();
    const ids = [60, 260].map((ms) => window.setTimeout(() => map.invalidateSize(), ms));
    return () => ids.forEach(window.clearTimeout);
  }, [dep, map]);

  return null;
}

/**
 * Frames the map to the 24 wards' actual extent once their geometry loads,
 * instead of a fixed center/zoom that leaves most of the view as surrounding
 * Thane/Panvel/ocean. Runs once (a ref guard, not state) so it never fights
 * a user's own pan/zoom or the ward-selection FlyToSelection above.
 */
function FitToWardExtent({
  wardsGeo,
  enabled,
}: {
  wardsGeo: FeatureCollection<Geometry, WardProps> | null;
  enabled: boolean;
}) {
  const map = useMap();
  const fitted = useRef(false);
  useEffect(() => {
    if (!enabled || fitted.current || !wardsGeo) return;
    const bounds = leafletGeoJSON(wardsGeo as GeoJSON.GeoJsonObject).getBounds();
    if (bounds.isValid()) {
      // Whole zoom levels only (see zoomSnap on the map): fitBounds rounds
      // down, so the city can sit a little smaller than the space allows. That
      // is the price of lettering that is not resampled.
      map.fitBounds(bounds, { padding: [10, 10] });
      fitted.current = true;
    }
  }, [enabled, wardsGeo, map]);
  return null;
}

/** Keeps Leaflet's imperative viewport in sync with the URL without making a
 * drag produce a React remount. The map emits on moveend, not every mousemove. */
function MapUrlState({
  view,
  onViewChange,
}: {
  view: MapView | null;
  onViewChange?: (view: MapView) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!view) return;
    const center = map.getCenter();
    if (center.lat !== view.lat || center.lng !== view.lng || map.getZoom() !== view.zoom) {
      map.setView([view.lat, view.lng], view.zoom, { animate: false });
    }
  }, [map, view]);

  useEffect(() => {
    if (!onViewChange) return;
    const report = () => {
      const center = map.getCenter();
      onViewChange({ lat: center.lat, lng: center.lng, zoom: map.getZoom() });
    };
    map.on("moveend", report);
    return () => {
      map.off("moveend", report);
    };
  }, [map, onViewChange]);

  return null;
}

/** react-leaflet's MapContainer doesn't forward aria-label to the underlying
 *  container div, so screen readers otherwise announce only the zoom
 *  buttons/attribution text with no indication this is a heat-vulnerability
 *  map. Set it imperatively on the real DOM node instead. */
function MapAccessibleName() {
  const map = useMap();
  useEffect(() => {
    map.getContainer().setAttribute("aria-label", `${ACTIVE_CITY.name} heat vulnerability map`);
  }, [map]);
  return null;
}

export default function WardChoropleth({
  selectedWardId = null,
  onSelectWard,
  isFullscreen = false,
  onToggleFullscreen,
  locating = false,
  locateError = null,
  onLocate,
  activeLayer = "hvi",
  onLayerChange,
  mapView = null,
  onMapViewChange,
}: {
  selectedWardId?: string | null;
  onSelectWard?: (wardId: string) => void;
  isFullscreen?: boolean;
  onToggleFullscreen?: () => void;
  /** True while the dashboard's find-my-ward flow is running (issue #116). */
  locating?: boolean;
  /** A user-facing find-my-ward failure message, shown over the map. */
  locateError?: string | null;
  /** Requests "find the ward I'm in". Only rendered when provided. */
  onLocate?: () => void;
  /** Current layer, controlled by the dashboard URL. */
  activeLayer?: LayerId;
  onLayerChange?: (layer: LayerId) => void;
  /** Current centre and zoom, controlled by the dashboard URL. */
  mapView?: MapView | null;
  onMapViewChange?: (view: MapView) => void;
}) {
  const [cache, setCache] = useState<Partial<Record<LayerId, FeatureCollection>>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache[activeLayer]) return;
    fetch(LAYER_META[activeLayer].url)
      .then((res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return res.json();
      })
      .then((data) => setCache((prev) => ({ ...prev, [activeLayer]: data })))
      .catch((err) => setError(String(err)));
  }, [activeLayer, cache]);

  const data = cache[activeLayer];
  const wardsGeo = (cache.hvi as FeatureCollection<Geometry, WardProps> | undefined) ?? null;

  // The hover card reads the locality profiles. A ref, because the tooltips are
  // bound once per layer and build their content each time they open: they
  // need the profiles as they are then, without rebinding 900 layers when the
  // file arrives. Until it does, the card shows the name alone.
  const profilesRef = useRef<WardProfileData | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(WARD_PROFILES_URL)
      .then((res) => (res.ok ? (res.json() as Promise<WardProfileData>) : null))
      .then((json) => {
        if (!cancelled && json) profilesRef.current = json;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Memoize per-render style functions so react-leaflet sees a stable identity
  // unless selectedWardId actually changed (#35). Otherwise every render
  // creates a new function and forces an unnecessary GeoJSON restyle.
  const hviStyle = useMemo(() => styleHvi(selectedWardId), [selectedWardId]);
  const hviGridStyle = useMemo(() => styleHviGrid(selectedWardId), [selectedWardId]);
  const plantabilityStyle = useMemo(() => stylePlantability(selectedWardId), [selectedWardId]);
  const ndviStyle = useMemo(() => styleNdviChange(selectedWardId), [selectedWardId]);

  // Selection changes restyle the already-mounted layer in place via the ref
  // below, and never go through `key`. Remounting on every ward click tears the
  // layer down and recreates it mid-click, which silently swallows whatever
  // Leaflet was doing with that same click. The popup this originally protected
  // is gone (WardDialog covers fullscreen too), but the hazard is not: keep
  // `key` for changes that genuinely need onEachFeature to rebind.
  const layerRef = useRef<LeafletGeoJSONLayer | null>(null);
  useEffect(() => {
    if (!layerRef.current) return;
    if (activeLayer === "hvi") layerRef.current.setStyle(hviStyle as (f?: Feature<Geometry>) => PathOptions);
    else if (activeLayer === "hvi_grid")
      layerRef.current.setStyle(hviGridStyle as (f?: Feature<Geometry>) => PathOptions);
    else if (activeLayer === "plantability")
      layerRef.current.setStyle(plantabilityStyle as (f?: Feature<Geometry>) => PathOptions);
    else layerRef.current.setStyle(ndviStyle as (f?: Feature<Geometry>) => PathOptions);
  }, [hviStyle, hviGridStyle, plantabilityStyle, ndviStyle, activeLayer]);

  /** Every layer resolves a click to a ward: the cell layers carry `ward_id`
   *  too, so clicking a grid cell opens its parent ward. */
  function selectFrom<P extends { ward_id: string }>(feature: Feature<Geometry, P>, layer: Layer) {
    const wardId = feature.properties.ward_id;
    layer.on("click", () => onSelectWard?.(wardId));
    layer.bindTooltip(
      () => hoverCardHtml(wardId, feature.properties as unknown as Record<string, unknown>, profilesRef.current),
      { sticky: true, opacity: 1, direction: "auto", offset: [14, 0], className: "zone-hover" },
    );

    // Keyboard access: Leaflet path layers render as SVG <path> elements that
    // are not focusable by default. Make each one tabbable and select it on
    // Enter/Space, mirroring the click handler. The focus ring is drawn with
    // CSS (see the global rule below) so it stays visible without touching
    // Leaflet's own styling.
    // Leaflet calls onEachFeature *before* the layer is added to the map, so
    // getElement() is undefined at this point — defer until the 'add' event
    // when the <path> actually exists in the DOM.
    const pathLayer = layer as Path;
    const attachKeyboard = () => {
      const el = pathLayer.getElement?.() as HTMLElement | undefined;
      if (!el) return;
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `Select ${wardId}`);
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectWard?.(wardId);
        }
      };
      el.addEventListener("keydown", onKeyDown);
      layer.once("remove", () => el.removeEventListener("keydown", onKeyDown));
    };
    layer.once("add", attachKeyboard);
  }

  return (
    <div className="absolute inset-0">
      <Card className="absolute right-2 top-2 z-[1000] w-fit gap-0 bg-background/95 p-1 backdrop-blur-sm">
        <div className="flex items-center gap-0.5">
          <Tabs value={activeLayer} onValueChange={(v: string) => onLayerChange?.(v as LayerId)}>
            {/* Height is overridden through the same group-data variant the
                primitive uses, so it wins rather than sitting alongside it. */}
            <TabsList aria-label="Map layer" className="group-data-horizontal/tabs:h-7">
              {(Object.keys(LAYER_META) as LayerId[]).map((id) => (
                <TabsTrigger
                  key={id}
                  value={id}
                  title={LAYER_META[id].caption}
                  className="whitespace-nowrap px-1.5 text-xs"
                >
                  {LAYER_META[id].label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* Each trigger's aria-controls points at one of these. Without
                them Radix emits a reference to an id that is not in the
                document, which is a critical WCAG failure (issue #118): axe
                reports aria-valid-attr-value on every tab.

                They are not a formality. The thing these tabs actually
                control is a Leaflet canvas, which conveys nothing to a screen
                reader, so the panel is the only place the current layer gets
                described in words. Visually hidden because the map is the
                sighted user's version of the same information. */}
            {(Object.keys(LAYER_META) as LayerId[]).map((id) => (
              <TabsContent key={id} value={id} className="sr-only">
                {LAYER_META[id].caption}
              </TabsContent>
            ))}
          </Tabs>
          {onLocate && (
            <>
              <span className="mx-0.5 h-4 w-px bg-border" aria-hidden />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onLocate}
                disabled={locating}
                aria-label={locating ? "Finding your locality…" : "Find my locality"}
                title={locating ? "Finding your locality…" : "Find my locality, using your location"}
              >
                {locating ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <LocateFixed className="h-3.5 w-3.5" />
                )}
              </Button>
            </>
          )}
          {onToggleFullscreen && (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onToggleFullscreen}
              aria-label={isFullscreen ? "Exit fullscreen" : "View map fullscreen"}
              title={isFullscreen ? "Exit fullscreen (Esc)" : "View fullscreen"}
            >
              {isFullscreen ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </Button>
          )}
        </div>
      </Card>

      <Legend layer={activeLayer} />

      {(error || locateError) && (
        <div className="absolute inset-x-0 top-12 z-[1000] mx-auto flex w-fit max-w-[90%] flex-col items-center gap-1">
          {error && (
            <div className="rounded bg-destructive/10 px-3 py-1 text-sm text-destructive">
              Failed to load layer: {error}
            </div>
          )}
          {locateError && (
            <div
              // Announce the failure rather than leaving a screen-reader user
              // with a button that silently did nothing (issue #116).
              role="status"
              className="rounded border border-border bg-background/95 px-3 py-1 text-center text-sm text-foreground backdrop-blur-sm"
            >
              {locateError}
            </div>
          )}
        </div>
      )}

      <MapContainer
        center={mapView ? [mapView.lat, mapView.lng] : ACTIVE_CITY.center}
        zoom={mapView?.zoom ?? ACTIVE_CITY.zoom}
        // Quarter-step zooms so fitBounds can actually fill the container
        // instead of rounding down to the next whole level.
        // Whole levels: the basemap is raster tiles, and at a fractional zoom
        // the browser stretches them, which is what made the place names look
        // out of focus.
        zoomSnap={1}
        zoomDelta={1}
        style={{ height: "100%", width: "100%" }}
      >
        <Basemap />
        {data && activeLayer === "hvi" && (
          <GeoJSON
            key={`hvi-${isFullscreen}`}
            ref={layerRef}
            data={data as FeatureCollection<Geometry, WardProps>}
            style={hviStyle as (f?: Feature<Geometry>) => PathOptions}
            onEachFeature={selectFrom as (f: Feature<Geometry>, l: Layer) => void}
          />
        )}
        {data && activeLayer === "hvi_grid" && (
          <GeoJSON
            key={`hvi_grid-${isFullscreen}`}
            ref={layerRef}
            data={data as FeatureCollection<Geometry, CellNbsProps>}
            style={hviGridStyle as (f?: Feature<Geometry>) => PathOptions}
            onEachFeature={selectFrom as (f: Feature<Geometry>, l: Layer) => void}
          />
        )}
        {data && activeLayer === "plantability" && (
          <GeoJSON
            key={`plantability-${isFullscreen}`}
            ref={layerRef}
            data={data as FeatureCollection<Geometry, CellNbsProps>}
            style={plantabilityStyle as (f?: Feature<Geometry>) => PathOptions}
            onEachFeature={selectFrom as (f: Feature<Geometry>, l: Layer) => void}
          />
        )}
        {data && activeLayer === "ndvi_change" && (
          <GeoJSON
            key={`ndvi_change-${isFullscreen}`}
            ref={layerRef}
            data={data as FeatureCollection<Geometry, CellNdviProps>}
            style={ndviStyle as (f?: Feature<Geometry>) => PathOptions}
            onEachFeature={selectFrom as (f: Feature<Geometry>, l: Layer) => void}
          />
        )}
        <FlyToSelection selectedWardId={selectedWardId} wardsGeo={wardsGeo} />
        <InvalidateSizeOnChange dep={isFullscreen} />
        <FitToWardExtent wardsGeo={wardsGeo} enabled={!mapView} />
        <MapUrlState view={mapView} onViewChange={onMapViewChange} />
        <MapAccessibleName />
      </MapContainer>
    </div>
  );
}
