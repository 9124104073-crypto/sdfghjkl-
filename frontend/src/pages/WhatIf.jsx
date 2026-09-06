import { useEffect, useState } from "react";
import api from "../api/client";
import {
  AsyncPanel,
  Card,
  DataStatusBadge,
  ErrorState,
  Notes,
  ScoreBar,
  useApi,
} from "../components/ui";

const PARAMS = [
  { key: "budget", label: "Budget", hint: "Cost-efficiency and funding feasibility" },
  { key: "accessibility", label: "Accessibility", hint: "Transport connectivity and reach" },
  { key: "flood_safety", label: "Flood Safety", hint: "Resilience to flooding and stormwater" },
  { key: "population_coverage", label: "Population Coverage", hint: "Residents who benefit" },
  { key: "sustainability", label: "Sustainability", hint: "Long-term environmental outlook" },
];

const PRESETS = {
  "Equal weighting": { budget: 20, accessibility: 20, flood_safety: 20, population_coverage: 20, sustainability: 20 },
  "Climate resilience first": { budget: 15, accessibility: 15, flood_safety: 40, population_coverage: 20, sustainability: 10 },
  "Cost constrained": { budget: 40, accessibility: 10, flood_safety: 30, population_coverage: 15, sustainability: 5 },
  "Maximum reach": { budget: 15, accessibility: 25, flood_safety: 10, population_coverage: 40, sustainability: 10 },
};

export default function WhatIf() {
  const [weights, setWeights] = useState(PRESETS["Equal weighting"]);
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const balanced = Math.abs(total - 100) < 0.5;

  // `weights` must be in the deps: without it the fetcher closes over the
  // initial weights and every re-run posts the baseline scenario again.
  const { data, loading, error, refetch } = useApi(
    () => api.simulate({ weights, top_n: 15 }),
    [weights],
    { immediate: false }
  );

  // Recalculation always happens on the backend, never in the browser.
  useEffect(() => {
    if (balanced) refetch();
  }, [refetch, balanced]);

  function setWeight(key, value) {
    setWeights((prev) => ({ ...prev, [key]: Number(value) }));
  }

  function normalise() {
    if (total === 0) return;
    const scaled = {};
    let running = 0;
    const keys = Object.keys(weights);
    keys.forEach((key, index) => {
      if (index === keys.length - 1) {
        scaled[key] = Math.round((100 - running) * 10) / 10;
      } else {
        const value = Math.round((weights[key] / total) * 1000) / 10;
        scaled[key] = value;
        running += value;
      }
    });
    setWeights(scaled);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">What-If Simulator</h1>
        <p className="text-sm text-slate-500">
          Adjust what matters and the backend re-ranks all 45 areas. Baseline is the equal-weight
          scenario.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card
          title="Planning priorities"
          subtitle="Weights must total 100%"
          actions={
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
                balanced
                  ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                  : "bg-rose-50 text-rose-800 ring-rose-200"
              }`}
            >
              {total.toFixed(1)}%
            </span>
          }
        >
          <div className="space-y-4">
            {PARAMS.map((param) => (
              <div key={param.key}>
                <div className="flex items-baseline justify-between">
                  <span className="text-xs font-medium text-slate-800">{param.label}</span>
                  <span className="text-xs tabular-nums text-slate-600">{weights[param.key]}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  value={weights[param.key]}
                  onChange={(e) => setWeight(param.key, e.target.value)}
                  className="mt-1 w-full"
                />
                <p className="text-[11px] text-slate-500">{param.hint}</p>
              </div>
            ))}
          </div>

          {!balanced && (
            <button
              type="button"
              onClick={normalise}
              className="mt-4 w-full rounded-md bg-brand-700 px-3 py-2 text-xs font-medium text-white hover:bg-brand-800"
            >
              Normalise to 100%
            </button>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              Scenario presets
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(PRESETS).map(([name, preset]) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setWeights(preset)}
                  className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-700 hover:border-brand-400 hover:bg-brand-50"
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
        </Card>

        <div className="lg:col-span-2">
          {!balanced ? (
            <ErrorState message={`Weights currently total ${total.toFixed(1)}%. They must total 100% before the backend will run the scenario.`} />
          ) : (
            <AsyncPanel loading={loading} error={error} data={data?.results} onRetry={refetch}>
              {data && (
                <Card
                  title="Scenario ranking"
                  subtitle={data.scenario_summary}
                  actions={<DataStatusBadge status="derived" />}
                >
                  {/* At the equal-weight baseline nothing moves, so naming a
                      "biggest gain" and "biggest drop" would be meaningless. */}
                  {data.movers.biggest_gain.rank_change === 0 &&
                  data.movers.biggest_drop.rank_change === 0 ? (
                    <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      This is the equal-weight baseline scenario, so no area has moved. Adjust a
                      slider or pick a preset to see the ranking change.
                    </p>
                  ) : (
                    <div className="mb-4 grid gap-3 sm:grid-cols-2">
                      <Mover title="Biggest gain" row={data.movers.biggest_gain} tone="good" />
                      <Mover title="Biggest drop" row={data.movers.biggest_drop} tone="bad" />
                    </div>
                  )}

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                          <th className="pb-2 pr-2">Rank</th>
                          <th className="pb-2 pr-2">Area</th>
                          <th className="pb-2 pr-2">Score</th>
                          <th className="pb-2 pr-2">vs baseline</th>
                          <th className="pb-2">Movement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.results.map((row) => (
                          <tr key={row.area} className="border-b border-slate-50">
                            <td className="py-2 pr-2 text-xs text-slate-400">{row.new_rank}</td>
                            <td className="py-2 pr-2 font-medium text-slate-900">{row.area}</td>
                            <td className="py-2 pr-2">
                              <div className="flex items-center gap-2">
                                <span className="w-11 tabular-nums">{row.new_score.toFixed(1)}</span>
                                <div className="w-20">
                                  <ScoreBar value={row.new_score} tone="bg-brand-500" />
                                </div>
                              </div>
                            </td>
                            <td
                              className={`py-2 pr-2 tabular-nums text-xs ${
                                row.score_change > 0
                                  ? "text-emerald-700"
                                  : row.score_change < 0
                                    ? "text-rose-700"
                                    : "text-slate-400"
                              }`}
                            >
                              {row.score_change > 0 ? "+" : ""}
                              {row.score_change.toFixed(1)}
                            </td>
                            <td className="py-2 text-xs">
                              {row.rank_change === 0 ? (
                                <span className="text-slate-400">no change</span>
                              ) : row.rank_change > 0 ? (
                                <span className="text-emerald-700">
                                  &uarr; {row.rank_change} (was #{row.baseline_rank})
                                </span>
                              ) : (
                                <span className="text-rose-700">
                                  &darr; {Math.abs(row.rank_change)} (was #{row.baseline_rank})
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {data.results[0]?.explanation}
                  </p>

                  <Notes notes={data.notes} />
                </Card>
              )}
            </AsyncPanel>
          )}
        </div>
      </div>
    </div>
  );
}

function Mover({ title, row, tone }) {
  if (!row) return null;
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        tone === "good" ? "border-emerald-200 bg-emerald-50" : "border-rose-200 bg-rose-50"
      }`}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-600">{title}</p>
      <p className="mt-0.5 text-sm font-semibold text-slate-900">{row.area}</p>
      <p className="text-xs text-slate-600">
        #{row.baseline_rank} &rarr; #{row.new_rank} ({row.rank_change > 0 ? "+" : ""}
        {row.rank_change})
      </p>
    </div>
  );
}
