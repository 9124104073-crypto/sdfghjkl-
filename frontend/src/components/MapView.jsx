import { CircleMarker, MapContainer, Popup, TileLayer, Tooltip } from "react-leaflet";

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
 * Leaflet map over OpenStreetMap tiles.
 *
 * Markers are supplied by the caller as { id, latitude, longitude, label,
 * color, radius, rows } so every page can plot its own layer without this
 * component knowing about sites, risk or sensors.
 */
export default function MapView({
  markers = [],
  center = CHENNAI_CENTER,
  zoom = 11,
  height = "480px",
  onSelect,
  legend,
}) {
  const plotted = markers.filter(
    (m) => Number.isFinite(m.latitude) && Number.isFinite(m.longitude)
  );

  return (
    <div className="relative">
      <MapContainer
        center={center}
        zoom={zoom}
        style={{ height, width: "100%", borderRadius: "0.5rem" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {plotted.map((marker) => (
          <CircleMarker
            key={marker.id}
            center={[marker.latitude, marker.longitude]}
            radius={marker.radius ?? 8}
            pathOptions={{
              color: marker.color || "#0f766e",
              fillColor: marker.color || "#0f766e",
              fillOpacity: 0.65,
              weight: 1.5,
            }}
            eventHandlers={onSelect ? { click: () => onSelect(marker) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {marker.label}
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
                {onSelect && (
                  <button
                    type="button"
                    onClick={() => onSelect(marker)}
                    className="mt-2 w-full rounded bg-brand-600 px-2 py-1 text-[11px] font-medium text-white"
                  >
                    Open details
                  </button>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {legend?.length > 0 && (
        <div className="pointer-events-none absolute bottom-3 right-3 z-[400] rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-[11px] shadow-sm">
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
