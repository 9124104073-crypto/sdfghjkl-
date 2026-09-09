import { useState } from "react";
import api from "../api/client";
import { Bars3D } from "../components/three/widgets3d";
import {
  AsyncPanel,
  Card,
  DataStatusBadge,
  Donut,
  Field,
  Notes,
  Tag,
  fmtCrore,
  fmtNumber,
  selectClass,
  useApi,
} from "../components/ui";

const SLICE_COLORS = ["#0f766e", "#14b8a6", "#5eead4", "#99f6e4", "#f59e0b"];

export default function Cost() {
  const [projectId, setProjectId] = useState(null);
  const [form, setForm] = useState({
    project_type: "Hospital",
    scale: "standard",
    risk_level: "Medium",
    labour: 120,
  });

  const { data: portfolio, loading, error, refetch } = useApi(() => api.projects(), []);
  const { data: typesEnvelope } = useApi(() => api.costProjectTypes(), []);
  const { data: detail } = useApi(
    () => (projectId ? api.project(projectId) : Promise.resolve(null)),
    [projectId]
  );
  const { data: adhoc, refetch: runEstimate } = useApi(
    () => api.estimateCost(form),
    [form],
    { immediate: false }
  );

  const projects = portfolio?.projects || [];
  const activeId = projectId || projects[0]?.id;
  const cost = detail?.cost;
  const timeline = detail?.timeline;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Cost &amp; Construction</h1>
        <p className="text-sm text-slate-500">
          Planning-level estimates with explicit ranges and assumptions. Never an approved
          government cost.
        </p>
      </div>

      <AsyncPanel loading={loading} error={error} data={projects} onRetry={refetch}>
        <div className="grid gap-5 lg:grid-cols-3">
          <Card index={0} title="Portfolio" subtitle={`${projects.length} proposed projects`}>
            <div className="max-h-[520px] space-y-1 overflow-y-auto pr-1">
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProjectId(p.id)}
                  className={`w-full rounded-md px-2.5 py-2 text-left transition ${
                    p.id === activeId ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-slate-50"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-900">{p.name}</p>
                  <p className="flex items-center justify-between text-[11px] text-slate-500">
                    <span>{p.area}</span>
                    <span className="tabular-nums">{fmtCrore(p.budget_cr)}</span>
                  </p>
                </button>
              ))}
            </div>
          </Card>

          <div className="space-y-5 lg:col-span-2">
            {detail && cost && (
              <Card index={1}
                title={detail.project.name}
                subtitle={`${detail.project.area} · ${detail.project.sector}`}
                actions={<DataStatusBadge status={cost.data_status} />}
              >
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wide text-slate-500">
                      Planning-level estimate
                    </p>
                    <p className="text-3xl font-semibold tabular-nums text-slate-900">
                      {fmtCrore(cost.estimate_cr)}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Range {fmtCrore(cost.range_cr[0])} &ndash; {fmtCrore(cost.range_cr[1])} at{" "}
                      {cost.contingency_pct}% contingency
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Estimate confidence: {cost.confidence}%
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                      <Metric label="Duration" value={`${timeline.total_months} mo`} />
                      <Metric label="Peak labour" value={fmtNumber(timeline.peak_labour)} />
                      <Metric label="Risk" value={<Tag value={detail.project.dataset_risk_level} />} />
                      <Metric
                        label="Suitability"
                        value={`${detail.project.suitability_score}/100`}
                      />
                    </div>
                  </div>

                  <div>
                    <Bars3D
                      height={190}
                      data={Object.entries(cost.breakdown_cr).map(([name, value], i) => ({
                        label: name.replaceAll("_", " "),
                        value,
                        color: SLICE_COLORS[i % SLICE_COLORS.length],
                      }))}
                    />
                    <div className="flex justify-center">
                      <Donut
                        ariaLabel="Cost breakdown by component"
                        size={140}
                        thickness={20}
                        data={Object.entries(cost.breakdown_cr).map(([name, value], i) => ({
                          name: name.replaceAll("_", " "),
                          value,
                          color: SLICE_COLORS[i % SLICE_COLORS.length],
                        }))}
                      />
                    </div>
                    <ul className="space-y-0.5 text-[11px]">
                      {Object.entries(cost.breakdown_cr).map(([name, value], i) => (
                        <li key={name} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-slate-600">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: SLICE_COLORS[i % SLICE_COLORS.length] }}
                            />
                            {name.replaceAll("_", " ")}
                          </span>
                          <span className="tabular-nums">{fmtCrore(value)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="mt-5 border-t border-slate-100 pt-4">
                  <h3 className="text-xs font-semibold text-slate-800">Construction programme</h3>
                  <div className="mt-2 space-y-1.5">
                    {timeline.phases.map((phase) => (
                      <div key={phase.phase} className="flex items-center gap-3 text-xs">
                        <span className="w-52 shrink-0 text-slate-700">{phase.phase}</span>
                        <div className="relative h-4 flex-1 rounded bg-slate-100">
                          <div
                            className="absolute h-4 rounded bg-brand-500/80"
                            style={{
                              left: `${((phase.start_month - 1) / timeline.total_months) * 100}%`,
                              width: `${(phase.duration_months / timeline.total_months) * 100}%`,
                            }}
                          />
                        </div>
                        <span className="w-16 text-right tabular-nums text-slate-500">
                          {phase.duration_months} mo
                        </span>
                        <span className="w-16 text-right tabular-nums text-slate-500">
                          {phase.labour} lab.
                        </span>
                      </div>
                    ))}
                  </div>
                  {timeline.machinery.length > 0 && (
                    <p className="mt-3 text-[11px] text-slate-500">
                      Machinery: {timeline.machinery.join(", ")}
                    </p>
                  )}
                </div>

                <div className="mt-4 rounded-lg bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold text-slate-700">Assumptions</p>
                  <ul className="mt-1 space-y-0.5 text-[11px] text-slate-600">
                    {cost.assumptions.map((a) => (
                      <li key={a}>&bull; {a}</li>
                    ))}
                  </ul>
                </div>

                <Notes notes={cost.notes} />
              </Card>
            )}

            <Card index={2}
              title="Ad-hoc estimator"
              subtitle="Estimate a project type that is not yet in the portfolio"
            >
              <div className="grid gap-3 sm:grid-cols-4">
                <Field label="Project type">
                  <select
                    className={selectClass}
                    value={form.project_type}
                    onChange={(e) => setForm({ ...form, project_type: e.target.value })}
                  >
                    {(typesEnvelope?.data || ["Hospital"]).map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Scale">
                  <select
                    className={selectClass}
                    value={form.scale}
                    onChange={(e) => setForm({ ...form, scale: e.target.value })}
                  >
                    <option value="small">Small</option>
                    <option value="standard">Standard</option>
                    <option value="large">Large</option>
                  </select>
                </Field>
                <Field label="Risk level">
                  <select
                    className={selectClass}
                    value={form.risk_level}
                    onChange={(e) => setForm({ ...form, risk_level: e.target.value })}
                  >
                    {["Low", "Medium", "High", "Very High"].map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Peak labour">
                  <input
                    type="number"
                    min="0"
                    max="5000"
                    className={selectClass}
                    value={form.labour}
                    onChange={(e) => setForm({ ...form, labour: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <button
                type="button"
                onClick={() => runEstimate()}
                className="mt-3 rounded-md bg-brand-700 px-4 py-2 text-xs font-medium text-white hover:bg-brand-800"
              >
                Estimate
              </button>

              {adhoc && (
                <div className="mt-4 rounded-lg border border-slate-200 px-4 py-3">
                  <p className="text-2xl font-semibold tabular-nums text-slate-900">
                    {fmtCrore(adhoc.estimate_cr)}
                  </p>
                  <p className="text-xs text-slate-500">
                    Range {fmtCrore(adhoc.range_cr[0])} &ndash; {fmtCrore(adhoc.range_cr[1])} &middot;
                    confidence {adhoc.confidence}%
                  </p>
                  <ul className="mt-2 space-y-0.5 text-[11px] text-slate-600">
                    {adhoc.assumptions.map((a) => (
                      <li key={a}>&bull; {a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          </div>
        </div>
      </AsyncPanel>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}
