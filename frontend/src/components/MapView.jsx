import { useEffect, useMemo, useRef, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import SitePreview3D from "./SitePreview3D";

const CHENNAI_CENTER = [13.03, 80.22];

export const RISK_COLORS = {
  "Very Low": "#059669",
  Low: "#10b981",
  Moderate: "#f59e0b",
  Medium: "#f59e0b",
  High: "#f97316",
  "Very High": "#e11d48",
};

export const TIER_COLORS = {
  Recommended: "#059669",
  "Highly Recommended": "#059669",
  Consider: "#0284c7",
  "Further Assessment Required": "#f59e0b",
  "Conditionally Recommended": "#f59e0b",
  "Not Recommended": "#e11d48",
};

/**
 * Leaflet needs telling when its container changes size.
 *
 * Without this the map can keep the dimensions it had at mount. Do not watch
 * Leaflet's own container: invalidating Leaflet from that observer changes the
 * container again and can create an endless ResizeObserver loop on the Risk
 * page. A first-paint pass plus debounced browser resizing covers the layouts
 * this app uses without feeding back into Leaflet.
 */
function ResponsiveMap() {
  const map = useMap();
  useEffect(() => {
    let frame = requestAnimationFrame(() => map.invalidateSize({ animate: false, pan: false }));
    let timer = 0;
    const invalidate = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => map.invalidateSize({ animate: false, pan: false }), 120);
    };
    window.addEventListener("resize", invalidate);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.removeEventListener("resize", invalidate);
    };
  }, [map]);
  return null;
}

/** Glides to the focused marker instead of teleporting. */
function FocusMarker({ focus }) {
  const map = useMap();
  const previous = useRef(null);
  useEffect(() => {
    if (!focus || !Number.isFinite(focus.latitude) || !Number.isFinite(focus.longitude)) return;
    const key = `${focus.latitude},${focus.longitude}`;
    if (previous.current === key) return;
    previous.current = key;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const target = [focus.latitude, focus.longitude];
    if (reduced) map.setView(target, Math.max(map.getZoom(), 12), { animate: false });
    else map.flyTo(target, Math.max(map.getZoom(), 12), { duration: 0.7, easeLinearity: 0.22 });
  }, [focus, map]);
  return null;
}

/**
 * Leaflet map over OpenStreetMap.
 *
 * Markers are supplied by the caller as { id, latitude, longitude, label,
 * color, radius, rows }, so every page plots its own layer without this
 * component knowing about sites, risk or sensors.
 */
export default function MapView({
  markers = [],
  center = CHENNAI_CENTER,
  zoom = 11,
  height = "480px",
  onSelect,
  legend,
  focus,
  basemap = "streets",
}) {
  const [selectedId, setSelectedId] = useState(null);
  const plotted = useMemo(
    () => markers.filter((m) => Number.isFinite(m.latitude) && Number.isFinite(m.longitude)),
    [markers]
  );
  const selectedMarker = plotted.find((marker) => marker.id === selectedId) || null;
  const scoreText = selectedMarker?.rows?.find((row) => /score|overall/i.test(row.label))?.value;
  const selectedScore = Number.parseFloat(String(scoreText ?? "").match(/[\d.]+/)?.[0] || "0");
  const scoreWidth = Math.max(4, Math.min(100, selectedScore));

  function selectMarker(marker) {
    setSelectedId(marker.id);
    onSelect?.(marker);
  }

  // Carto's Positron keeps the data legible; OSM standard shows more context.
  const tiles =
    basemap === "muted"
      ? {
          url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        }
      : {
          url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        };

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height, width: "100%", borderRadius: "0.5rem" }}
        scrollWheelZoom
        preferCanvas
        zoomAnimation
        markerZoomAnimation
      >
        <TileLayer attribution={tiles.attribution} url={tiles.url} detectRetina keepBuffer={3} />
        <ResponsiveMap />
        <FocusMarker focus={focus} />

        {plotted.map((marker) => {
          const selected = marker.id === selectedId || Boolean(marker.selected);
          return (
            <CircleMarker
              key={marker.id}
              center={[marker.latitude, marker.longitude]}
              radius={marker.radius ?? 8}
              pathOptions={{
                color: selected ? "#4c1d95" : marker.color || "#0f766e",
                fillColor: selected ? "#a855f7" : marker.color || "#0f766e",
                fillOpacity: selected ? 1 : 0.66,
                weight: selected ? 4 : 1.5,
              }}
              eventHandlers={{
                click: () => selectMarker(marker),
                mouseover: (e) => e.target.setStyle({ fillOpacity: 0.95, weight: selected ? 4 : 3 }),
                mouseout: (e) =>
                  e.target.setStyle({
                    fillOpacity: selected ? 1 : 0.66,
                    weight: selected ? 4 : 1.5,
                  }),
              }}
            >
              <Tooltip direction="top" offset={[0, -6]} opacity={1}>
                <span className="text-xs font-medium">{marker.label}</span>
              </Tooltip>
              <Popup>
                <div className="min-w-[190px] text-xs">
                  <p className="text-sm font-semibold text-slate-900">{marker.label}</p>
                  {marker.rows?.map((row) => (
                    <p key={row.label} className="mt-1 flex justify-between gap-3">
                      <span className="text-slate-500">{row.label}</span>
                      <span className="font-medium text-slate-900">{row.value}</span>
                    </p>
                  ))}
                  <button type="button" onClick={() => selectMarker(marker)} className="nir-interactive mt-2 w-full rounded bg-brand-600 px-2 py-1 text-[11px] font-medium text-white">View location</button>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>

      {selectedMarker && (
        <div className="absolute bottom-3 left-3 z-[450] w-60 overflow-hidden rounded-md border bg-white" style={{ borderColor: "#DDE6E0", boxShadow: "0 14px 30px -18px rgba(11,31,51,.45)" }}>
          <SitePreview3D score={selectedScore} height={118} />
          <div className="px-3 py-2.5">
            <p className="truncate text-xs font-semibold text-slate-900">{selectedMarker.label}</p>
            <p className="mt-0.5 text-[10px] text-slate-500">Selected location · street context</p>
            {selectedScore > 0 && (
              <div className="mt-2.5">
                <div className="mb-1 flex items-center justify-between text-[10px] font-semibold text-slate-600"><span>Planning score</span><span className="tabular-nums text-slate-900">{selectedScore.toFixed(1)}/100</span></div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{ width: `${scoreWidth}%` }} /></div>
              </div>
            )}
          </div>
        </div>
      )}

      {legend?.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[400] rounded-lg border border-slate-200 bg-white/92 px-3 py-2 text-[11px] shadow-sm backdrop-blur-sm">
          {legend.map((item) => (
            <p key={item.label} className="flex items-center gap-2">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </p>
          ))}
        </div>
      )}

      {plotted.length === 0 && (
        <p className="mt-2 text-xs text-slate-500">
          No mappable coordinates in the current selection.
        </p>
      )}
    </div>
  );
}
