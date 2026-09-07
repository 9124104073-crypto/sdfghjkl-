import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { VerifiedOnlyNotice, useDataMode } from "../components/DataMode";
import {
  AsyncPanel,
  Card,
  DataStatusBadge,
  Field,
  Notes,
  ScoreBar,
  StatCard,
  Tag,
  fmtNumber,
  selectClass,
  useApi,
} from "../components/ui";

const SORTS = {
  name: { label: "Locality (A–Z)", get: (s) => s.name, dir: 1 },
  population: { label: "Population served", get: (s) => s.population_catchment_5km ?? 0, dir: -1 },
  density: { label: "Population density", get: (s) => s.population_density ?? 0, dir: -1 },
  land: { label: "Land available", get: (s) => s.land_available_acres ?? 0, dir: -1 },
  cost: { label: "Land cost per acre", get: (s) => s.land_cost_cr_per_acre ?? 0, dir: 1 },
  hospitals: { label: "Existing hospitals", get: (s) => s.existing_hospitals ?? 0, dir: 1 },
  score: { label: "Published score", get: (s) => s.dataset.ai_score ?? 0, dir: -1 },
};

/**
 * Infrastructure Explorer — browse and filter the full asset and candidate
 * inventory. Complements the map (spatial) and site recommendation (ranked)
 * views with a plain tabular way to interrogate what exists.
 */
export default function Explorer() {
  const { isVerifiedOnly } = useDataMode();
  const [query, setQuery] = useState("");
  const [zone, setZone] = useState("");
  const [flood, setFlood] = useState("");
  const [sort, setSort] = useState("population");
  const [tab, setTab] = useState("sites");

  const { data: sitesEnvelope, loading, error, refetch } = useApi(() => api.sites(), []);
  const { data: gis } = useApi(() => api.gisLayers(), []);
  const { data: spatial } = useApi(() => api.spatialSummary(), []);
  const { data: gaps } = useApi(() => api.coverageGaps({ radius_km: 5 }), []);
  const { data: catchments } = useApi(() => api.catchments({ radius_km: 5 }), []);

  const sites = sitesEnvelope?.data || [];
  const zones = useMemo(() => [...new Set(sites.map((s) => s.zone).filter(Boolean))].sort(), [sites]);
  const floods = useMemo(
    () => [...new Set(sites.map((s) => s.flood_risk).filter(Boolean))],
    [sites]
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out = sites.filter((s) => {
      if (zone && s.zone !== zone) return false;
      if (flood && s.flood_risk !== flood) return false;
      if (!needle) return true;
      return [s.name, s.site_code, s.land_use, s.transit_access, s.recommended_infrastructure]
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
    const cfg = SORTS[sort];
    return out.sort((a, b) => {
      const av = cfg.get(a);
      const bv = cfg.get(b);
      if (typeof av === "string") return cfg.dir * av.localeCompare(bv);
      return cfg.dir * (av - bv);
    });
  }, [sites, query, zone, flood, sort]);

  const assets = gis?.layers || {};
  const existing = ["hospital", "school", "water_body", "ward_or_village", "elevation_sample"]
    .flatMap((k) => (assets[k] || []).map((a) => ({ ...a, layer: k })));

  const totals = useMemo(() => {
    const pop = filtered.reduce((a, s) => a + (s.population_catchment_5km || 0), 0);
    const land = filtered.reduce((a, s) => a + (s.land_available_acres || 0), 0);
    const hosp = filtered.reduce((a, s) => a + (s.existing_hospitals || 0), 0);
    const sch = filtered.reduce((a, s) => a + (s.existing_schools || 0), 0);
    return { pop, land, hosp, sch };
  }, [filtered]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Infrastructure Explorer</h1>
        <p className="text-sm text-slate-500">
          Browse the full inventory — candidate localities, existing facilities and the spatial
          relationships between them.
        </p>
      </div>

      <VerifiedOnlyNotice dataset="The candidate-site inventory" />

      {!isVerifiedOnly && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-6">
            <StatCard index={0} label="Localities shown" value={filtered.length} sub={`of ${sites.length}`} />
            <StatCard index={1} label="Population served" value={fmtNumber(totals.pop)} />
            <StatCard index={2} label="Land available" value={`${fmtNumber(totals.land, 1)} ac`} />
            <StatCard index={3} label="Existing hospitals" value={totals.hosp} />
            <StatCard index={4} label="Existing schools" value={totals.sch} />
            <StatCard index={5}
              label="Study extent"
              value={spatial ? `${fmtNumber(spatial.convex_hull_area_km2)} km²` : "—"}
              sub="convex hull"
            />
          </div>

          <Card index={0} title="Filters" className="mt-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Search">
                <input
                  type="search"
                  className={selectClass}
                  placeholder="Locality, code, land use, transit"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </Field>
              <Field label="Zone">
                <select className={selectClass} value={zone} onChange={(e) => setZone(e.target.value)}>
                  <option value="">All zones</option>
                  {zones.map((z) => (
                    <option key={z}>{z}</option>
                  ))}
                </select>
              </Field>
              <Field label="Flood risk">
                <select className={selectClass} value={flood} onChange={(e) => setFlood(e.target.value)}>
                  <option value="">Any</option>
                  {floods.map((f) => (
                    <option key={f}>{f}</option>
                  ))}
                </select>
              </Field>
              <Field label="Sort by">
                <select className={selectClass} value={sort} onChange={(e) => setSort(e.target.value)}>
                  {Object.entries(SORTS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Card>

          <div className="mt-5 flex gap-2">
            {[
              ["sites", `Candidate localities (${filtered.length})`],
              ["assets", `Existing facilities (${existing.length})`],
              ["spatial", "Spatial analysis"],
            ].map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                aria-pressed={tab === k}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                  tab === k
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-slate-200 text-slate-600 hover:border-brand-400"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <AsyncPanel loading={loading} error={error} data={sites} onRetry={refetch}>
            {tab === "sites" && (
              <Card index={1} className="mt-4" title="Candidate localities" actions={<DataStatusBadge status="demo" />}>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-2">Locality</th>
                        <th className="pb-2 pr-2">Zone</th>
                        <th className="pb-2 pr-2">Land use</th>
                        <th className="pb-2 pr-2 text-right">Population</th>
                        <th className="pb-2 pr-2 text-right">Density</th>
                        <th className="pb-2 pr-2 text-right">Land</th>
                        <th className="pb-2 pr-2 text-right">₹/acre</th>
                        <th className="pb-2 pr-2">Flood</th>
                        <th className="pb-2 pr-2">Suggested facility</th>
                        <th className="pb-2 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((s) => (
                        <tr key={s.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2 pr-2">
                            <Link
                              to={`/recommendation?site=${s.id}`}
                              className="font-medium text-slate-900 hover:text-brand-700"
                            >
                              {s.name}
                            </Link>
                            <div className="text-[10px] text-slate-400">{s.site_code}</div>
                          </td>
                          <td className="py-2 pr-2 text-slate-600">{s.zone}</td>
                          <td className="py-2 pr-2 text-xs text-slate-500">{s.land_use}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {fmtNumber(s.population_catchment_5km)}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums text-slate-600">
                            {fmtNumber(s.population_density)}
                          </td>
                          <td className="py-2 pr-2 text-right tabular-nums">{s.land_available_acres} ac</td>
                          <td className="py-2 pr-2 text-right tabular-nums text-slate-600">
                            {s.land_cost_cr_per_acre}
                          </td>
                          <td className="py-2 pr-2">
                            <Tag value={s.flood_risk} />
                          </td>
                          <td className="py-2 pr-2 text-xs text-slate-600">
                            {s.recommended_infrastructure}
                          </td>
                          <td className="py-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="tabular-nums">{s.dataset.ai_score ?? "—"}</span>
                              <div className="w-12">
                                <ScoreBar value={s.dataset.ai_score ?? 0} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length === 0 && (
                    <p className="py-8 text-center text-xs text-slate-500">
                      No localities match these filters.
                    </p>
                  )}
                </div>
              </Card>
            )}

            {tab === "assets" && (
              <Card index={2}
                className="mt-4"
                title="Existing facilities and reference layers"
                subtitle="Loaded GIS layers, grouped by type"
                actions={<DataStatusBadge status="demo" />}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-2">Asset</th>
                        <th className="pb-2 pr-2">Layer</th>
                        <th className="pb-2 pr-2">Category</th>
                        <th className="pb-2 pr-2">Serves</th>
                        <th className="pb-2 pr-2 text-right">Capacity</th>
                        <th className="pb-2">Region</th>
                      </tr>
                    </thead>
                    <tbody>
                      {existing.map((a) => (
                        <tr key={a.asset_code} className="border-b border-slate-50">
                          <td className="py-2 pr-2 font-medium text-slate-900">{a.name}</td>
                          <td className="py-2 pr-2 text-xs text-slate-500">
                            {a.layer.replaceAll("_", " ")}
                          </td>
                          <td className="py-2 pr-2 text-xs text-slate-600">{a.category || "—"}</td>
                          <td className="py-2 pr-2 text-xs text-slate-500">{a.serviced_zone || "—"}</td>
                          <td className="py-2 pr-2 text-right tabular-nums">
                            {a.capacity ? `${fmtNumber(a.capacity)} ${a.capacity_unit || ""}` : "—"}
                          </td>
                          <td className="py-2">
                            <Tag value={a.region === "Chennai" ? "Chennai" : "Coimbatore study box"} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Notes notes={gis?.notes} />
              </Card>
            )}

            {tab === "spatial" && (
              <div className="mt-4 grid gap-5 lg:grid-cols-2">
                <Card index={3}
                  title="Coverage gaps"
                  subtitle="Localities with no candidate site within 5 km"
                  actions={<DataStatusBadge status="derived" />}
                >
                  {gaps ? (
                    <>
                      <p className="mb-3 text-sm text-slate-600">
                        <b className="tabular-nums">{gaps.covered_count}</b> of{" "}
                        <b className="tabular-nums">{gaps.total_localities}</b> localities from the
                        other datasets fall inside a candidate site's catchment.
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                            <th className="pb-2 pr-2">Locality</th>
                            <th className="pb-2 text-right">Distance to nearest site</th>
                          </tr>
                        </thead>
                        <tbody>
                          {gaps.uncovered.map((u) => (
                            <tr key={u.locality} className="border-b border-slate-50">
                              <td className="py-2 pr-2 font-medium text-slate-900">{u.locality}</td>
                              <td className="py-2 text-right tabular-nums text-amber-700">
                                {u.km_to_nearest_candidate_site} km
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Notes notes={gaps.notes} />
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Computing coverage…</p>
                  )}
                </Card>

                <Card index={4}
                  title="Catchment overlap"
                  subtitle="Sites competing for the same population"
                  actions={<DataStatusBadge status="derived" />}
                >
                  {catchments ? (
                    <>
                      <p className="mb-3 text-sm text-slate-600">
                        Mean overlap{" "}
                        <b className="tabular-nums">{catchments.summary.mean_overlaps}</b> other
                        catchments per site, at a {catchments.radius_km} km radius.
                      </p>
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                            <th className="pb-2 pr-2">Locality</th>
                            <th className="pb-2 pr-2 text-right">Overlaps</th>
                            <th className="pb-2 text-right">Catchment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catchments.results.slice(0, 12).map((c) => (
                            <tr key={c.site_id} className="border-b border-slate-50">
                              <td className="py-2 pr-2 font-medium text-slate-900">{c.name}</td>
                              <td className="py-2 pr-2 text-right tabular-nums">
                                {c.overlapping_site_catchments}
                              </td>
                              <td className="py-2 text-right tabular-nums text-slate-500">
                                {c.catchment_area_km2} km²
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <Notes notes={catchments.notes} />
                    </>
                  ) : (
                    <p className="text-xs text-slate-500">Computing catchments…</p>
                  )}
                </Card>
              </div>
            )}
          </AsyncPanel>
        </>
      )}
    </div>
  );
}
