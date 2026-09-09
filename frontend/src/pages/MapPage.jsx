import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client";
import MapView, { RISK_COLORS, TIER_COLORS } from "../components/MapView";
import CityScape3D from "../components/CityScape3D";
import { AsyncPanel, Card, DataStatusBadge, Notes, Tag, fmtNumber, useApi } from "../components/ui";

const LAYER_OPTIONS = [
  { key: "sites", label: "Candidate sites" },
  { key: "risk", label: "Risk areas" },
  { key: "hospital", label: "Hospitals (reference)" },
  { key: "school", label: "Schools (reference)" },
  { key: "water_body", label: "Water bodies (reference)" },
];

export default function MapPage() {
  const navigate = useNavigate();
  const [active, setActive] = useState(["sites", "risk"]);
  const [selected, setSelected] = useState(null);
  const [view3d, setView3d] = useState(false);

  const { data: gis, loading, error, refetch } = useApi(() => api.gisLayers(), []);
  const { data: risk } = useApi(() => api.risk(), []);

  function toggle(key) {
    setActive((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  const markers = useMemo(() => {
    if (!gis) return [];
    const out = [];

    if (active.includes("sites")) {
      gis.sites.forEach((s) => {
        out.push({
          id: `site-${s.id}`,
          siteId: s.id,
          latitude: s.latitude,
          longitude: s.longitude,
          label: s.name,
          color: TIER_COLORS[s.dataset.recommendation] || "#0f766e",
          radius: 8,
          kind: "site",
          rows: [
            { label: "Site code", value: s.site_code },
            { label: "Population (5 km)", value: fmtNumber(s.population_catchment_5km) },
            { label: "Flood risk", value: s.flood_risk },
            { label: "Land", value: `${s.land_available_acres} ac` },
          ],
        });
      });
    }

    if (active.includes("risk") && risk) {
      risk.results
        .filter((r) => r.latitude && r.longitude)
        .forEach((r) => {
          const flood = r.components.find((c) => c.name === "flood");
          out.push({
            id: `risk-${r.location}`,
            latitude: r.latitude,
            longitude: r.longitude,
            label: `${r.location} — ${r.overall_level} risk`,
            color: RISK_COLORS[flood?.level] || "#94a3b8",
            radius: 14,
            kind: "risk",
            rows: [
              { label: "Overall", value: `${r.overall_level} (${r.overall_score})` },
              { label: "Flood", value: flood?.level },
              { label: "Rainfall", value: r.annual_rainfall_mm ? `${r.annual_rainfall_mm} mm` : "-" },
            ],
          });
        });
    }

    ["hospital", "school", "water_body"].forEach((layer) => {
      if (!active.includes(layer)) return;
      (gis.layers[layer] || []).forEach((a) => {
        out.push({
          id: `${layer}-${a.asset_code}`,
          latitude: a.latitude,
          longitude: a.longitude,
          label: a.name,
          color: layer === "hospital" ? "#7c3aed" : layer === "school" ? "#2563eb" : "#0891b2",
          radius: 6,
          kind: layer,
          rows: [
            { label: "Type", value: a.category },
            { label: "Region", value: a.region },
            ...(a.capacity ? [{ label: a.capacity_unit, value: fmtNumber(a.capacity) }] : []),
          ],
        });
      });
    });

    return out;
  }, [gis, risk, active]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Infrastructure Map</h1>
        <p className="text-sm text-slate-500">
          Candidate sites, risk areas and existing facilities on OpenStreetMap.
        </p>
      </div>

      <Card index={0}
        title="Layers"
        actions={<DataStatusBadge status="demo" />}
        subtitle="Toggle what appears on the map"
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-view3d
            onClick={() => setView3d((v) => !v)}
            className="nir-interactive rounded-full border px-3 py-1 text-xs font-semibold"
            style={
              view3d
                ? { background: "#0B1F33", borderColor: "#0B1F33", color: "#A3E635" }
                : { background: "transparent", borderColor: "#E3E8E3", color: "#334155" }
            }
          >
            {view3d ? "3D landscape" : "2D map"}
          </button>
          <span className="mr-1 h-4 w-px" style={{ background: "#E3E8E3" }} />
          {LAYER_OPTIONS.map((layer) => (
            <button
              key={layer.key}
              type="button"
              onClick={() => toggle(layer.key)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                active.includes(layer.key)
                  ? "border-brand-600 bg-brand-600 text-white"
                  : "border-slate-200 text-slate-600 hover:border-brand-400"
              }`}
            >
              {layer.label}
            </button>
          ))}
        </div>
      </Card>

      <AsyncPanel loading={loading} error={error} data={gis} onRetry={refetch}>
        {gis && (
          <div className="grid gap-5 lg:grid-cols-4">
            <Card index={1} className="lg:col-span-3" title={`${markers.length} features plotted`}>
              {view3d ? (

                <CityScape3D

                  sites={gis.sites.map((x) => ({ id: x.id, site_name: x.name, latitude: x.latitude, longitude: x.longitude, score: x.dataset.ai_score, recommendation: x.dataset.recommendation }))}

                  height={560}

                  selectedId={selected?.siteId}

                  onSelect={(site) => setSelected({ label: site.site_name, siteId: site.id, kind: "site", rows: [{ label: "Score", value: Number(site.score).toFixed(1) }, { label: "Tier", value: site.recommendation }] })}

                />

              ) : (

                <MapView
                height="560px"
                markers={markers}
                onSelect={setSelected}
                legend={[
                  { label: "Recommended site", color: TIER_COLORS.Recommended },
                  { label: "Consider", color: TIER_COLORS.Consider },
                  { label: "Very high flood risk", color: RISK_COLORS["Very High"] },
                  { label: "Hospital (reference)", color: "#7c3aed" },
                  { label: "School (reference)", color: "#2563eb" },
                ]}
              />

              )}
            </Card>

            <Card index={2} title="Selection" subtitle="Click any marker">
              {selected ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-slate-900">{selected.label}</p>
                  <Tag value={selected.kind} />
                  <dl className="mt-2 space-y-1 text-xs">
                    {selected.rows?.map((row) => (
                      <div key={row.label} className="flex justify-between gap-3">
                        <dt className="text-slate-500">{row.label}</dt>
                        <dd className="font-medium text-slate-900">{row.value ?? "-"}</dd>
                      </div>
                    ))}
                  </dl>
                  {selected.siteId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/recommendation?site=${selected.siteId}`)}
                      className="mt-3 w-full rounded-md bg-brand-700 px-3 py-2 text-xs font-medium text-white hover:bg-brand-800"
                    >
                      Open site recommendation
                    </button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-slate-500">
                  Select a marker to inspect its attributes.
                </p>
              )}
            </Card>
          </div>
        )}
        {gis && <Notes notes={gis.notes} />}
      </AsyncPanel>
    </div>
  );
}
