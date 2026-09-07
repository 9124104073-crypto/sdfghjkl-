import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/client";
import { AsyncPanel, Card, DataStatusBadge, Notes, ScoreBar, Tag, useApi } from "../components/ui";

const FACTORS = [
  { key: "impact", label: "Impact" },
  { key: "urgency", label: "Urgency" },
  { key: "population_benefit", label: "Population benefit" },
  { key: "risk", label: "Risk exposure" },
  { key: "infrastructure_gap", label: "Infrastructure gap" },
  { key: "feasibility", label: "Feasibility" },
];

const DEFAULTS = {
  impact: 35,
  urgency: 20,
  population_benefit: 20,
  risk: 10,
  infrastructure_gap: 10,
  feasibility: 5,
};

export default function Priority() {
  const [weights, setWeights] = useState(DEFAULTS);
  const [sector, setSector] = useState("");
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const balanced = Math.abs(total - 100) < 0.5;

  const { data, loading, error, refetch } = useApi(
    () => api.priority({ weights, sector: sector || null }),
    [weights, sector]
  );

  const sectors = data?.sector_summary?.map((s) => s.sector) || [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Infrastructure Priority Ranking</h1>
        <p className="text-sm text-slate-500">
          The published impact score is one input. The Priority Engine re-ranks using urgency,
          population benefit, risk, service gap and feasibility.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-4">
        <Card index={0}
          title="Ranking weights"
          actions={
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                balanced
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                  : "bg-rose-50 text-rose-800 ring-rose-200"
              }`}
            >
              {total}%
            </span>
          }
        >
          <div className="space-y-3">
            {FACTORS.map((factor) => (
              <div key={factor.key}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-slate-800">{factor.label}</span>
                  <span className="text-xs tabular-nums text-slate-600">{weights[factor.key]}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="5"
                  value={weights[factor.key]}
                  onChange={(e) =>
                    setWeights((w) => ({ ...w, [factor.key]: Number(e.target.value) }))
                  }
                  className="mt-1 w-full"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setWeights(DEFAULTS)}
            className="mt-4 w-full rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Reset to defaults
          </button>

          {sectors.length > 0 && (
            <div className="mt-5 border-t border-slate-100 pt-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                Filter by sector
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setSector("")}
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    sector === "" ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  All
                </button>
                {sectors.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSector(s)}
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      sector === s ? "bg-brand-600 text-white" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-5 lg:col-span-3">
          <AsyncPanel loading={loading} error={error} data={data?.results} onRetry={refetch}>
            {data && (
              <>
                <Card index={1}
                  title="Sector distribution"
                  subtitle="Average published impact score per sector"
                  actions={<DataStatusBadge status="demo" />}
                >
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={data.sector_summary} margin={{ left: 0, right: 8, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis
                        dataKey="sector"
                        tick={{ fontSize: 10 }}
                        angle={-30}
                        textAnchor="end"
                        interval={0}
                        height={70}
                      />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <RTooltip />
                      <Bar dataKey="average_impact" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card index={2}
                  title={`Ranked projects (${data.projects_ranked})`}
                  actions={<DataStatusBadge status="derived" />}
                >
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                          <th className="pb-2 pr-2">Rank</th>
                          <th className="pb-2 pr-2">Project</th>
                          <th className="pb-2 pr-2">Area</th>
                          <th className="pb-2 pr-2">Sector</th>
                          <th className="pb-2 pr-2">Score</th>
                          <th className="pb-2 pr-2">Risk</th>
                          <th className="pb-2">vs published</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.results.map((row) => (
                          <tr key={`${row.area}-${row.project}`} className="border-b border-slate-50">
                            <td className="py-2 pr-2 text-xs text-slate-400">{row.computed_rank}</td>
                            <td className="py-2 pr-2 font-medium text-slate-900">{row.project}</td>
                            <td className="py-2 pr-2 text-slate-600">{row.area}</td>
                            <td className="py-2 pr-2 text-xs text-slate-500">{row.sector}</td>
                            <td className="py-2 pr-2">
                              <div className="flex items-center gap-2">
                                <span className="w-10 tabular-nums">
                                  {row.computed_score.toFixed(1)}
                                </span>
                                <div className="w-16">
                                  <ScoreBar value={row.computed_score} tone="bg-brand-500" />
                                </div>
                              </div>
                            </td>
                            <td className="py-2 pr-2">
                              <Tag value={row.risk_level} />
                            </td>
                            <td className="py-2 text-xs">
                              {row.rank_change === 0 ? (
                                <span className="text-slate-400">&mdash;</span>
                              ) : row.rank_change > 0 ? (
                                <span className="text-emerald-700">&uarr; {row.rank_change}</span>
                              ) : (
                                <span className="text-rose-700">
                                  &darr; {Math.abs(row.rank_change)}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Notes notes={data.notes} />
                </Card>
              </>
            )}
          </AsyncPanel>
        </div>
      </div>
    </div>
  );
}
