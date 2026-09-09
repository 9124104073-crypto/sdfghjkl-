import { useState } from "react";
import api, { describeError } from "../api/client";
import { Engine3D } from "../components/three/widgets3d";
import {
  AsyncPanel,
  Card,
  DataStatusBadge,
  Notes,
  Tag,
  fmtCrore,
  fmtNumber,
  useApi,
} from "../components/ui";

export default function Dpr() {
  const [projectId, setProjectId] = useState(null);
  const [dpr, setDpr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [genError, setGenError] = useState(null);

  const { data: portfolio, loading, error, refetch } = useApi(() => api.projects(), []);
  const projects = portfolio?.projects || [];
  const activeId = projectId || projects[0]?.id;
  const active = projects.find((p) => p.id === activeId);

  async function generate() {
    if (!activeId) return;
    setBusy(true);
    setGenError(null);
    setDpr(null);
    try {
      setDpr(await api.generateDpr(activeId, { include_explainability: true }));
    } catch (err) {
      setGenError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">AI DPR Generator</h1>
        <p className="text-sm text-slate-500">
          Select a project, analyse it, then generate a Detailed Project Report assembled from
          decision-engine output.
        </p>
      </div>
        <div className="hidden w-44 shrink-0 sm:block">
          <Engine3D height={110} />
        </div>
      </div>

      <AsyncPanel loading={loading} error={error} data={projects} onRetry={refetch}>
        <div className="grid gap-5 lg:grid-cols-4">
          <Card index={0} title="Select project" subtitle={`${projects.length} in portfolio`}>
            <div className="max-h-[560px] space-y-1 overflow-y-auto pr-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setProjectId(p.id);
                    setDpr(null);
                    setGenError(null);
                  }}
                  className={`w-full rounded-md px-2.5 py-2 text-left transition ${
                    p.id === activeId ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-slate-50"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-900">{p.name}</p>
                  <p className="text-[11px] text-slate-500">
                    {p.area} &middot; {p.sector}
                  </p>
                </button>
              ))}
            </div>
          </Card>

          <div className="space-y-5 lg:col-span-3">
            {active && (
              <Card index={1}
                title={active.name}
                subtitle={`${active.area} · ${active.project_code}`}
                actions={
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={generate}
                      disabled={busy}
                      className="rounded-md bg-brand-700 px-4 py-2 text-xs font-medium text-white hover:bg-brand-800 disabled:opacity-50"
                    >
                      {busy ? "Analysing..." : "Analyse & generate DPR"}
                    </button>
                    <a
                      href={api.dprDownloadUrl(activeId)}
                      className="rounded-md border border-brand-600 px-4 py-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
                    >
                      Download PDF
                    </a>
                  </div>
                }
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Metric label="Suitability" value={`${active.suitability_score}/100`} />
                  <Metric label="Budget" value={fmtCrore(active.budget_cr)} />
                  <Metric label="Timeline" value={`${active.timeline_months} mo`} />
                  <Metric label="Risk" value={<Tag value={active.dataset_risk_level} />} />
                </div>

                {genError && (
                  <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                    {genError}
                  </p>
                )}

                {!dpr && !busy && !genError && (
                  <p className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                    Run the analysis to assemble the report sections, or download the PDF directly.
                  </p>
                )}
              </Card>
            )}

            {dpr && (
              <Card index={2}
                title="Detailed Project Report"
                subtitle={`Generated ${dpr.generated_on}`}
                actions={<DataStatusBadge status="ai_generated" />}
              >
                <Section title="1. Executive summary">
                  <p className="text-sm leading-relaxed text-slate-700">{dpr.executive_summary}</p>
                </Section>

                {dpr.site && (
                  <Section title="2. Site analysis">
                    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                      <Row label="Site code" value={dpr.site.site_code} />
                      <Row label="Zone" value={dpr.site.zone} />
                      <Row label="Land use" value={dpr.site.land_use} />
                      <Row
                        label="Population (5 km)"
                        value={fmtNumber(dpr.site.population_catchment_5km)}
                      />
                      <Row label="Flood risk" value={dpr.site.flood_risk} />
                      <Row label="Terrain" value={dpr.site.terrain_suitability} />
                      <Row label="Elevation" value={`${dpr.site.elevation_m} m`} />
                      <Row label="Land available" value={`${dpr.site.land_available_acres} ac`} />
                      <Row label="Transit" value={dpr.site.transit_access} />
                    </dl>
                  </Section>
                )}

                {dpr.explainability && (
                  <Section title="3. Suitability & explainability">
                    <p className="text-sm text-slate-700">{dpr.explainability.why_this_site}</p>
                    <table className="mt-3 w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[10px] uppercase text-slate-500">
                          <th className="pb-1 pr-2">Factor</th>
                          <th className="pb-1 pr-2">Score</th>
                          <th className="pb-1 pr-2">Weight</th>
                          <th className="pb-1">Effect</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dpr.explainability.all_factors.map((f) => (
                          <tr key={f.factor} className="border-b border-slate-50">
                            <td className="py-1 pr-2 text-slate-700">{f.label}</td>
                            <td className="py-1 pr-2 tabular-nums">{f.normalized}</td>
                            <td className="py-1 pr-2 tabular-nums text-slate-500">
                              {f.weight_pct}%
                            </td>
                            <td
                              className={`py-1 tabular-nums ${
                                f.delta_vs_baseline >= 0 ? "text-emerald-700" : "text-rose-700"
                              }`}
                            >
                              {f.delta_vs_baseline >= 0 ? "+" : ""}
                              {f.delta_vs_baseline}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </Section>
                )}

                {dpr.risk && (
                  <Section title="4. Risk assessment">
                    <div className="flex items-center gap-2">
                      <Tag value={dpr.risk.overall_level} />
                      <span className="text-xs tabular-nums text-slate-600">
                        {dpr.risk.overall_score}/100
                      </span>
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-slate-600">
                      {dpr.risk.components.map((c) => (
                        <li key={c.name}>
                          <span className="font-medium text-slate-800">{c.label}:</span> {c.level} (
                          {c.score}) &mdash; {c.rationale}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                <Section title="5. Cost estimate">
                  <p className="text-xl font-semibold tabular-nums text-slate-900">
                    {fmtCrore(dpr.cost.estimate_cr)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Range {fmtCrore(dpr.cost.range_cr[0])} &ndash; {fmtCrore(dpr.cost.range_cr[1])}{" "}
                    &middot; {dpr.cost.contingency_pct}% contingency &middot; confidence{" "}
                    {dpr.cost.confidence}%
                  </p>
                  <ul className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                    {dpr.cost.assumptions.map((a) => (
                      <li key={a}>&bull; {a}</li>
                    ))}
                  </ul>
                </Section>

                <Section title="6. Timeline, labour & machinery">
                  <ul className="space-y-1 text-xs text-slate-600">
                    {dpr.timeline.phases.map((p) => (
                      <li key={p.phase} className="flex justify-between gap-3">
                        <span>{p.phase}</span>
                        <span className="tabular-nums text-slate-500">
                          month {p.start_month} &middot; {p.duration_months} mo &middot; {p.labour}{" "}
                          labour
                        </span>
                      </li>
                    ))}
                  </ul>
                </Section>

                <Section title="7. Government scheme">
                  {dpr.scheme?.primary ? (
                    <>
                      <p className="text-sm font-medium text-slate-900">
                        {dpr.scheme.primary.scheme_name}
                      </p>
                      <p className="text-xs text-slate-600">{dpr.scheme.primary.ministry}</p>
                      <p className="mt-1 text-xs text-slate-600">{dpr.scheme.primary.reason}</p>
                      <div className="mt-1.5 flex gap-2">
                        <Tag value={`${dpr.scheme.primary.match_confidence}% match`} />
                        <Tag value={dpr.scheme.primary.verification_status} />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-amber-800">
                      Insufficient verified data available for a scheme match.
                    </p>
                  )}
                </Section>

                <Section title="8. Data sources">
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="border-b border-slate-200 text-left uppercase text-slate-500">
                        <th className="pb-1 pr-2">Dataset</th>
                        <th className="pb-1 pr-2">Source</th>
                        <th className="pb-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dpr.data_sources.map((s) => (
                        <tr key={s.dataset} className="border-b border-slate-50">
                          <td className="py-1 pr-2 text-slate-700">{s.dataset}</td>
                          <td className="py-1 pr-2 text-slate-500">{s.source}</td>
                          <td className="py-1">
                            <Tag value={s.verification_status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Section>

                <Notes disclaimer={dpr.disclaimer} />
              </Card>
            )}
          </div>
        </div>
      </AsyncPanel>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="border-t border-slate-100 py-4 first:border-t-0 first:pt-0">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand-700">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-2 border-b border-slate-50 py-0.5">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900">{value ?? "-"}</dd>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
