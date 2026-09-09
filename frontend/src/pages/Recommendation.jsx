import { useEffect, useMemo, useState } from "react";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
} from "recharts";
import { useSearchParams } from "react-router-dom";
import api from "../api/client";
import MapView, { TIER_COLORS } from "../components/MapView";
import { Gauge3D, RiskShell3D } from "../components/three/widgets3d";
import {
  AsyncPanel,
  Card,
  DataStatusBadge,
  Field,
  Notes,
  ScoreBar,
  Tag,
  fmtNumber,
  selectClass,
  useApi,
} from "../components/ui";

const FLOOD_LEVELS = ["Very Low", "Low", "Moderate", "High", "Very High"];

const METHODS = {
  mcda: {
    label: "Deterministic MCDA",
    hint: "Weighted multi-criteria analysis. The platform's default scorer.",
  },
  ml: {
    label: "Model + SHAP",
    hint: "Gradient-boosted model explained with SHAP. Illustrative only.",
  },
};

export default function Recommendation() {
  const [params, setParams] = useSearchParams();
  const [infrastructureType, setInfrastructureType] = useState("Hospital");
  const [limit, setLimit] = useState(5);
  const [maxFloodRisk, setMaxFloodRisk] = useState("");
  const [selectedId, setSelectedId] = useState(
    params.get("site") ? Number(params.get("site")) : null
  );
  const [method, setMethod] = useState("mcda");

  const { data: typesEnvelope } = useApi(() => api.infrastructureTypes(), []);
  const types = typesEnvelope?.data || ["Hospital"];

  const { data, loading, error, refetch } = useApi(
    () =>
      api.recommend({
        infrastructure_type: infrastructureType,
        limit: Number(limit),
        max_flood_risk: maxFloodRisk || null,
      }),
    [infrastructureType, limit, maxFloodRisk]
  );

  const results = data?.results || [];

  // Radar over the nine factors for the leading candidates — the shape of a
  // site's profile compares faster than nine separate numbers.
  const radarTop = results.slice(0, 3);
  const radarData = (radarTop[0]?.factors || []).map((f) => {
    const row = {
      factor: f.label
        .replace(" availability", "")
        .replace("Distance from existing facilities", "Facility distance")
        .replace("Infrastructure gap", "Service gap"),
    };
    radarTop.forEach((r) => {
      const match = r.factors.find((x) => x.name === f.name);
      row[r.site_name] = match ? Math.round(match.normalized) : 0;
    });
    return row;
  });
  const RADAR_COLORS = ["#0F766E", "#F59E0B", "#94A3B8"];

  // Keep a valid selection as filters change.
  useEffect(() => {
    if (!results.length) return;
    if (!results.some((r) => r.site_id === selectedId)) {
      setSelectedId(results[0].site_id);
    }
  }, [results, selectedId]);

  useEffect(() => {
    if (selectedId) setParams({ site: String(selectedId) }, { replace: true });
  }, [selectedId, setParams]);

  const selected = useMemo(
    () => results.find((r) => r.site_id === selectedId) || results[0],
    [results, selectedId]
  );

  const { data: xai, loading: xaiLoading } = useApi(
    () =>
      !selected
        ? Promise.resolve(null)
        : method === "ml"
          ? api.mlExplain(selected.site_id)
          : api.siteExplain(selected.site_id, infrastructureType),
    [selected?.site_id, infrastructureType, method]
  );
  const { data: model } = useApi(
    () => (method === "ml" ? api.mlModel() : Promise.resolve(null)),
    [method]
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Site Recommendation</h1>
        <p className="text-sm text-slate-500">
          Deterministic weighted MCDA over {data?.candidates_evaluated ?? 40} candidate localities.
          No language model contributes to these scores.
        </p>
      </div>

      <Card index={0} title="Assessment parameters">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Infrastructure type">
            <select
              value={infrastructureType}
              onChange={(e) => setInfrastructureType(e.target.value)}
              className={selectClass}
            >
              {types.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Results" hint="Top-N candidates to return">
            <select value={limit} onChange={(e) => setLimit(e.target.value)} className={selectClass}>
              {[5, 10, 20, 40].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Explanation method" hint={METHODS[method].hint}>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectClass}>
              {Object.entries(METHODS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Maximum flood risk" hint="Exclude sites above this exposure">
            <select
              value={maxFloodRisk}
              onChange={(e) => setMaxFloodRisk(e.target.value)}
              className={selectClass}
            >
              <option value="">No limit</option>
              {FLOOD_LEVELS.map((level) => (
                <option key={level} value={level}>
                  {level} or lower
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>

      <AsyncPanel
        loading={loading}
        error={error}
        data={results}
        onRetry={refetch}
        empty="No sites matched these filters. Relax the flood-risk limit."
      >
        <div className="grid gap-5 lg:grid-cols-5">
          <Card index={1}
            title={`Top ${results.length} sites`}
            subtitle={`for a ${infrastructureType.toLowerCase()}`}
            className="lg:col-span-3"
            actions={<DataStatusBadge status="derived" />}
          >
            <MapView
              height="320px"
              markers={results.map((r) => ({
                id: r.site_id,
                latitude: r.site.latitude,
                longitude: r.site.longitude,
                label: r.site_name,
                color: TIER_COLORS[r.recommendation] || "#0f766e",
                radius: r.site_id === selected?.site_id ? 12 : 8,
                rows: [
                  { label: "Score", value: r.score.toFixed(1) },
                  { label: "Confidence", value: `${r.confidence}%` },
                  { label: "Flood risk", value: r.site.flood_risk },
                ],
              }))}
              onSelect={(m) => setSelectedId(m.id)}
              legend={Object.entries(TIER_COLORS)
                .filter(([k]) =>
                  ["Recommended", "Consider", "Further Assessment Required", "Not Recommended"].includes(k)
                )
                .map(([label, color]) => ({ label, color }))}
            />

            {radarData.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-1 text-xs font-semibold text-slate-800">Factor profile</div>
            <p className="mb-2 text-[11px] text-slate-500">
              Normalised 0–100 across the top {radarTop.length} candidates. A wider shape is a
              stronger all-round site; a spiky one is strong in places and weak elsewhere.
            </p>
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#E3E8E3" />
                <PolarAngleAxis dataKey="factor" tick={{ fill: "#64748B", fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {radarTop.map((r, i) => (
                  <Radar
                    key={r.site_id}
                    name={r.site_name}
                    dataKey={r.site_name}
                    stroke={RADAR_COLORS[i]}
                    fill={RADAR_COLORS[i]}
                    fillOpacity={i === 0 ? 0.24 : 0.1}
                    strokeWidth={i === 0 ? 2 : 1.4}
                  />
                ))}
                <RTooltip contentStyle={{ borderRadius: 6, border: "1px solid #E3E8E3", fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3">
              {radarTop.map((r, i) => (
                <span key={r.site_id} className="flex items-center gap-1.5 text-[11px] text-slate-600">
                  <span className="h-2 w-2 rounded-sm" style={{ background: RADAR_COLORS[i] }} />
                  {r.site_name}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-2">#</th>
                    <th className="pb-2 pr-2">Site</th>
                    <th className="pb-2 pr-2">Score</th>
                    <th className="pb-2 pr-2">Conf.</th>
                    <th className="pb-2 pr-2">Population</th>
                    <th className="pb-2 pr-2">Flood</th>
                    <th className="pb-2">Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, index) => (
                    <tr
                      key={r.site_id}
                      onClick={() => setSelectedId(r.site_id)}
                      className={`cursor-pointer border-b border-slate-50 transition ${
                        r.site_id === selected?.site_id ? "bg-brand-50" : "hover:bg-slate-50"
                      }`}
                    >
                      <td className="py-2 pr-2 text-xs text-slate-400">{index + 1}</td>
                      <td className="py-2 pr-2 font-medium text-slate-900">{r.site_name}</td>
                      <td className="py-2 pr-2">
                        <div className="flex items-center gap-2">
                          <span className="w-10 tabular-nums">{r.score.toFixed(1)}</span>
                          <div className="w-16">
                            <ScoreBar value={r.score} />
                          </div>
                        </div>
                      </td>
                      <td className="py-2 pr-2 tabular-nums text-slate-600">{r.confidence}%</td>
                      <td className="py-2 pr-2 tabular-nums text-slate-600">
                        {fmtNumber(r.site.population_catchment_5km)}
                      </td>
                      <td className="py-2 pr-2">
                        <Tag value={r.site.flood_risk} />
                      </td>
                      <td className="py-2">
                        <Tag value={r.recommendation} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="space-y-5 lg:col-span-2">
            {selected && (
              <Card index={2}
                title={`Why ${selected.site_name}?`}
                subtitle="Explainable AI &middot; weighted contributions"
                actions={<DataStatusBadge status="derived" />}
              >
                {xaiLoading && <p className="text-sm text-slate-500">Computing breakdown...</p>}
                {xai && method === "ml" && (
                  <>
                    <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] leading-relaxed text-violet-900">
                      <b>Model prediction, not the platform's score.</b> A gradient-boosted model
                      fitted on 40 demonstration rows, explained with SHAP. The deterministic MCDA
                      engine remains the scorer of record.
                    </div>
                    <p className="text-sm leading-relaxed text-slate-700">{xai.why_this_site}</p>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-50 px-2 py-2">
                        <p className="text-[10px] uppercase text-slate-500">Base value</p>
                        <p className="text-sm font-semibold">{xai.base_value}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-2">
                        <p className="text-[10px] uppercase text-slate-500">SHAP sum</p>
                        <p className="text-sm font-semibold">
                          {xai.score_breakdown.net_factor_effect >= 0 ? "+" : ""}
                          {xai.score_breakdown.net_factor_effect}
                        </p>
                      </div>
                      <div className="rounded-lg bg-violet-50 px-2 py-2">
                        <p className="text-[10px] uppercase text-violet-700">Prediction</p>
                        <p className="text-sm font-semibold text-violet-800">{xai.score}</p>
                      </div>
                    </div>
                    <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-600">
                      SHAP contributions
                    </h3>
                    <ul className="mt-1 space-y-1">
                      {xai.all_factors.slice(0, 8).map((f) => (
                        <li key={f.factor} className="rounded-md bg-slate-50 px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-slate-800">{f.label}</span>
                            <span
                              className={`text-xs font-semibold tabular-nums ${
                                f.shap_value >= 0 ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {f.shap_value >= 0 ? "+" : ""}
                              {f.shap_value}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-slate-400">value: {f.value}</p>
                        </li>
                      ))}
                    </ul>
                    {model && (
                      <p className="mt-3 text-[11px] text-slate-500">
                        Model: {model.model.algorithm}, {model.model.training_rows} rows, CV R²{" "}
                        {model.model.cross_validated_r2}, MAE {model.model.cross_validated_mae}.
                      </p>
                    )}
                  </>
                )}
                {xai && method === "mcda" && (
                  <>
                    <p className="text-sm leading-relaxed text-slate-700">{xai.why_this_site}</p>

                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-slate-50 px-2 py-2">
                        <p className="text-[10px] uppercase text-slate-500">Baseline</p>
                        <p className="text-sm font-semibold">{xai.score_breakdown.baseline}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 px-2 py-2">
                        <p className="text-[10px] uppercase text-slate-500">Factor effect</p>
                        <p
                          className={`text-sm font-semibold ${
                            xai.score_breakdown.net_factor_effect >= 0
                              ? "text-emerald-700"
                              : "text-rose-700"
                          }`}
                        >
                          {xai.score_breakdown.net_factor_effect >= 0 ? "+" : ""}
                          {xai.score_breakdown.net_factor_effect}
                        </p>
                      </div>
                      <div className="rounded-lg bg-brand-50 px-2 py-2">
                        <p className="text-[10px] uppercase text-brand-700">Final</p>
                        <p className="text-sm font-semibold text-brand-800">{xai.score}</p>
                      </div>
                    </div>

                    <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                      Positive factors
                    </h3>
                    <FactorList factors={xai.positive_factors} tone="positive" />

                    <h3 className="mt-3 text-xs font-semibold uppercase tracking-wide text-rose-700">
                      Negative factors
                    </h3>
                    {xai.negative_factors.length ? (
                      <FactorList factors={xai.negative_factors} tone="negative" />
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        No factor scored below the neutral baseline under this weighting.
                      </p>
                    )}

                    <p className="mt-4 text-[11px] text-slate-500">
                      Method: {xai.method.replaceAll("_", " ")}. Source:{" "}
                      {xai.source?.source_name} ({xai.source?.verification_status}).
                    </p>
                  </>
                )}
              </Card>
            )}

            {selected && (
              <Card index={3} title="Site profile" subtitle={selected.site.site_code}>
                {/* Score and risk as paired 3D readouts before the detail. */}
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <Gauge3D score={selected.score} label="suitability" height={175} />
                  <RiskShell3D score={selected.risk.overall_score} height={175} label="risk" />
                </div>

                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <Detail label="Zone" value={selected.site.zone} />
                  <Detail label="Land use" value={selected.site.land_use} />
                  <Detail
                    label="Population (5 km)"
                    value={fmtNumber(selected.site.population_catchment_5km)}
                  />
                  <Detail
                    label="Density"
                    value={`${fmtNumber(selected.site.population_density)}/km²`}
                  />
                  <Detail label="Land available" value={`${selected.site.land_available_acres} ac`} />
                  <Detail label="Elevation" value={`${selected.site.elevation_m} m`} />
                  <Detail label="Transit" value={selected.site.transit_access} />
                  <Detail label="Road access" value={selected.site.road_connectivity} />
                  <Detail label="Terrain" value={selected.site.terrain_suitability} />
                  <Detail label="Water" value={selected.site.water_availability} />
                </dl>

                <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-medium text-slate-700">Overall risk</p>
                  <div className="mt-1 flex items-center gap-2">
                    <Tag value={selected.risk.overall_level} />
                    <span className="text-xs tabular-nums text-slate-600">
                      {selected.risk.overall_score}/100
                    </span>
                  </div>
                  {selected.demand && (
                    <p className="mt-2 text-[11px] text-slate-600">
                      Demand: {selected.demand.growth_priority} growth priority, +
                      {selected.demand.growth_pct}% by 2045.
                    </p>
                  )}
                </div>

                <p className="mt-3 text-[11px] text-slate-500">
                  Source dataset score: {selected.site.dataset.ai_score ?? "-"} (
                  {selected.site.dataset.recommendation}). Shown for comparison; the NIRMAN engine
                  scores independently.
                </p>
              </Card>
            )}
          </div>
        </div>

        {data && <Notes notes={data.notes} />}
      </AsyncPanel>
    </div>
  );
}

function FactorList({ factors, tone }) {
  return (
    <ul className="mt-1 space-y-1.5">
      {factors.map((f) => (
        <li key={f.factor} className="rounded-md bg-slate-50 px-2.5 py-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-800">{f.label}</span>
            <span
              className={`text-xs font-semibold tabular-nums ${
                tone === "positive" ? "text-emerald-700" : "text-rose-700"
              }`}
            >
              {f.delta_vs_baseline >= 0 ? "+" : ""}
              {f.delta_vs_baseline}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500">{f.rationale}</p>
          <p className="mt-0.5 text-[10px] text-slate-400">
            {f.normalized}/100 at {f.weight_pct}% weight
          </p>
        </li>
      ))}
    </ul>
  );
}

function Detail({ label, value }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value ?? "-"}</dd>
    </>
  );
}
