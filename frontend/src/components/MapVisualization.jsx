import { Component } from "react";
import { AlertCircle, MapPinned } from "lucide-react";
import MapView from "./MapView";

// A planning-demo scenario around the Adyar river corridor. It is visibly
// labelled as a projected overlay, not a surveyed flood boundary.
export const CLIMATE_FLOOD_ZONE = [
  [13.035, 80.235],
  [13.022, 80.285],
  [12.982, 80.294],
  [12.975, 80.251],
  [13.004, 80.229],
];

export const SIH_SAMPLE_SITES = [
  { name: "Site A - T. Nagar", lat: 13.0418, lng: 80.2341, score: 87, risk: "Low", aiExplanation: "High population coverage, excellent road connectivity, and low flood exposure." },
  { name: "Site B - Adyar", lat: 12.9916, lng: 80.26, score: 71, risk: "Medium", aiExplanation: "Good accessibility, with moderate flood exposure due to its river proximity." },
  { name: "Site C - OMR", lat: 12.841, lng: 80.234, score: 54, risk: "High", aiExplanation: "Infrastructure coverage and public transport access need further assessment." },
];

class MapFailureBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="flex h-[500px] flex-col items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-6 text-center">
          <AlertCircle className="mb-3 text-slate-400" size={28} />
          <p className="text-sm font-semibold text-slate-800">Map preview is unavailable</p>
          <p className="mt-1 text-xs text-slate-500">The site analysis and report remain available. Check your network connection and refresh to load map tiles.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function scoreColor(score) {
  if (score >= 80) return "#059669";
  if (score >= 60) return "#f97316";
  return "#dc2626";
}

export default function MapVisualization({ sites = SIH_SAMPLE_SITES, climateActive = false, selectedId, onSelect }) {
  const markers = sites.map((site) => ({
    id: site.id ?? site.name,
    latitude: site.latitude ?? site.lat,
    longitude: site.longitude ?? site.lng,
    label: site.name,
    color: scoreColor(site.score),
    radius: (site.id ?? site.name) === selectedId ? 12 : 9,
    rows: [
      { label: "Suitability score", value: `${site.score.toFixed(1)} / 100` },
      { label: "Risk level", value: site.risk },
      { label: "AI insight", value: site.aiExplanation },
    ],
  }));

  return (
    <section aria-label="Interactive site suitability map">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900"><MapPinned size={17} className="text-brand-700" /> Interactive suitability map</h2>
          <p className="mt-1 text-xs text-slate-500">Select a site marker to inspect its score, risk, AI explanation, and street context.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-[10px] font-medium text-slate-600">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" /> 80+
          <span className="h-2.5 w-2.5 rounded-full bg-orange-500" /> 60-79
          <span className="h-2.5 w-2.5 rounded-full bg-red-600" /> &lt;60
        </div>
      </div>
      <MapFailureBoundary>
        <MapView
          height="500px"
          center={[13.0827, 80.2707]}
          zoom={11}
          markers={markers}
          onSelect={onSelect}
          polygons={climateActive ? [{ id: "2050-flood-zone", positions: CLIMATE_FLOOD_ZONE, color: "#2563eb", fillOpacity: 0.22, label: "Projected 2050 flood exposure zone" }] : []}
        />
      </MapFailureBoundary>
      {climateActive && <p className="mt-2 text-[11px] text-blue-700">Blue overlay: projected 2050 flood-exposure scenario for comparison only; not a statutory flood boundary.</p>}
    </section>
  );
}
