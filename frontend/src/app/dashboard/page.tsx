"use client";

import { Suspense, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import ZonePlanner from "../components/ZonePlanner";
import dynamic from "next/dynamic";
import { usePathname, useSearchParams } from "next/navigation";
import WardPanel from "../components/WardPanel";
import WardCompare from "../components/WardCompare";
import SiteHeader from "../components/SiteHeader";
import DataVintageBar from "../components/DataVintageBar";
import {
  parseWardParam,
  readStoredWards,
  serializeWardParam,
  toggleWard,
  writeStoredWards,
} from "@/lib/savedWards";
import {
  findMyWard,
  isLocateFailure,
  LOCATE_ERROR_MESSAGE,
} from "@/lib/findWard";
import { parseMapLayer, parseMapView, writeMapView, type MapLayer, type MapView } from "@/lib/mapState";

const WardChoropleth = dynamic(() => import("../components/WardChoropleth"), {
  ssr: false,
  loading: () => <div className="p-8 text-zinc-500">Loading map…</div>,
});

const HINT_KEY = "ucip-dashboard-hint-dismissed";
const hintListeners = new Set<() => void>();

function dismissFirstVisitHint() {
  localStorage.setItem(HINT_KEY, "1");
  hintListeners.forEach((listener) => listener());
}

function subscribeFirstVisitHint(callback: () => void) {
  hintListeners.add(callback);
  return () => hintListeners.delete(callback);
}

function getFirstVisitHintSnapshot() {
  return !localStorage.getItem(HINT_KEY);
}

function getFirstVisitHintServerSnapshot() {
  return false;
}

function FirstVisitHint() {
  const visible = useSyncExternalStore(
    subscribeFirstVisitHint,
    getFirstVisitHintSnapshot,
    getFirstVisitHintServerSnapshot
  );

  if (!visible) return null;

  return (
    <div className="flex items-center justify-between gap-4 border-b border-brand-teal/20 bg-brand-teal/10 px-6 py-2 text-sm text-foreground">
      <p>
        Colors rank Nagpur&apos;s localities by heat vulnerability. Click any one, on the map or in
        the list, to see its breakdown and recommendation. Switch layers top-right.
      </p>
      <button
        onClick={dismissFirstVisitHint}
        className="shrink-0 rounded px-2 py-0.5 text-xs font-medium hover:bg-brand-teal/10"
        aria-label="Dismiss hint"
      >
        Got it
      </button>
    </div>
  );
}

function DashboardContent() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const selectedWardId = searchParams.get("ward");
  const trackedWards = useMemo(
    () => parseWardParam(searchParams.get("wards")),
    [searchParams]
  );
  const activeLayer = parseMapLayer(searchParams.get("layer"));
  const mapView = parseMapView(searchParams);
  const comparedWards = useMemo(
    () => parseWardParam(searchParams.get("compare")).slice(0, 4),
    [searchParams]
  );
  const [isFullscreen, setIsFullscreen] = useState(false);
  /** Find-my-ward (issue #116): state for the map's locate button. */
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);

  async function locateMe() {
    // Only ever called from the button's click handler, so the browser's
    // location permission prompt is tied to a user gesture and never fires on
    // page load.
    setLocating(true);
    setLocateError(null);
    try {
      const wardId = await findMyWard();
      selectWard(wardId);
    } catch (err) {
      setLocateError(
        isLocateFailure(err) ? LOCATE_ERROR_MESSAGE[err.kind] : LOCATE_ERROR_MESSAGE.lookup
      );
    } finally {
      setLocating(false);
    }
  }

  /**
   * The URL is the source of truth for ward selection, not local state.
   * Selecting a ward pushes a new history entry (so browser Back steps back
   * to the list instead of leaving the dashboard entirely); clearing the
   * selection replaces the current entry instead of adding another one.
   *
   * Uses the History API rather than router.push/replace. This route is
   * statically prerendered, and after a cold load of a URL that already
   * carries `?ward=`, both router methods became silent no-ops: selecting a
   * different ward or closing the panel left the URL, and therefore the
   * selection, stuck on whatever was loaded. Next supports history.pushState
   * and replaceState for search-param updates, and useSearchParams re-renders
   * from them.
   */
  function selectWard(wardId: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (wardId) {
      params.set("ward", wardId);
      window.history.pushState(null, "", `${pathname}?${params.toString()}`);
    } else {
      params.delete("ward");
      const qs = params.toString();
      window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    }
  }

  /**
   * Tracking a ward writes to the same URL the selection lives in, so the
   * tracked set is shareable and bookmarkable by construction. replaceState
   * rather than pushState: starring wards is not navigation, and each star
   * should not become a Back-button step.
   */
  function toggleTracked(wardId: string) {
    const next = toggleWard(trackedWards, wardId);
    const params = new URLSearchParams(searchParams.toString());
    if (next.length) params.set("wards", serializeWardParam(next));
    else params.delete("wards");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
    writeStoredWards(next);
  }

  /** The map owns its pixels, the URL owns its durable state. Replacing avoids
   * putting every drag and zoom into the Back-button history. */
  function updateMapState(layer: MapLayer, view: MapView | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (layer === "hvi") params.delete("layer");
    else params.set("layer", layer);
    if (view) writeMapView(params, view);
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  function openComparison() {
    const params = new URLSearchParams(searchParams.toString());
    params.set("compare", serializeWardParam(trackedWards.slice(0, 4)));
    window.history.pushState(null, "", `${pathname}?${params.toString()}`);
  }

  function closeComparison() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("compare");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  }

  /**
   * On a cold load with no `wards` param, restore whatever this device last
   * tracked. The URL always wins when it carries a set, so opening someone
   * else's shared link shows their wards rather than silently merging in yours.
   */
  useEffect(() => {
    if (searchParams.get("wards") !== null) return;
    const stored = readStoredWards();
    if (stored.length === 0) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("wards", serializeWardParam(stored));
    window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    // Deliberately mount-only: this restores a starting state, and re-running it
    // whenever the params change would resurrect the set the moment a user
    // clears it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Escape exits fullscreen, but only when the planner panel is closed. The
   * panel closes on Escape too; without this guard a single press would close
   * it and drop out of fullscreen at the same time.
   */
  useEffect(() => {
    if (!isFullscreen || selectedWardId) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setIsFullscreen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isFullscreen, selectedWardId]);

  return (
    <div className="flex h-screen flex-col bg-background">
      {!isFullscreen && <SiteHeader compact />}
      {!isFullscreen && <FirstVisitHint />}
      <main className="relative flex flex-1 overflow-hidden">
        <div className="dashboard-map relative flex-1">
          <WardChoropleth
            selectedWardId={selectedWardId}
            onSelectWard={selectWard}
            isFullscreen={isFullscreen}
            onToggleFullscreen={() => setIsFullscreen((v) => !v)}
            locating={locating}
            locateError={locateError}
            onLocate={locateMe}
            activeLayer={activeLayer}
            onLayerChange={(layer) => updateMapState(layer, mapView)}
            mapView={mapView}
            onMapViewChange={(view) => updateMapState(activeLayer, view)}
          />
        </div>
        {!isFullscreen && (
          // Narrower than it was: the list is an index into the map, not the
          // main event, and every pixel it gives back goes to the map.
          <aside className="hidden w-72 shrink-0 border-l border-border bg-background md:block lg:w-80">
            <WardPanel
              selectedWardId={selectedWardId}
              onSelectWard={selectWard}
              showDetail={false}
              trackedWards={trackedWards}
              onToggleTracked={toggleTracked}
              onCompare={openComparison}
            />
          </aside>
        )}
      </main>
      {/* Outside <main> and outside the fullscreen guards on purpose: the
          planner is the only detail surface, so it has to work in fullscreen
          and below the md breakpoint, where the aside above does not exist.
          The ranked list stays a list underneath it, with the open locality
          highlighted. */}
      <ZonePlanner selectedWardId={selectedWardId} onSelectWard={selectWard} />
      <WardCompare wardIds={comparedWards} onClose={closeComparison} />
      {/* The data-vintage bar is dashboard chrome like the header and hint, so
          it follows the same fullscreen guard (issue #124). */}
      {!isFullscreen && <DataVintageBar />}
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-muted-foreground">Loading…</div>}>
      <DashboardContent />
    </Suspense>
  );
}
