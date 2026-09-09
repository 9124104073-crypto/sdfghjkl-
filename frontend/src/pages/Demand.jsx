import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/client";
import { Bars3D } from "../components/three/widgets3d";
import { Ticker } from "../components/Ticker";
import { VerifiedOnlyNotice, useDataMode } from "../components/DataMode";
import {
  AsyncPanel,
  Card,
  DataStatusBadge,
  Notes,
  ScoreBar,
  StatCard,
  Tag,
  fmtNumber,
  useApi,
} from "../components/ui";

const PRIORITY_COLOR = {
  "Very High": "#e11d48",
  High: "#f97316",
  Medium: "#f59e0b",
  Low: "#10b981",
};

/**
 * Demand Analysis — population growth as an infrastructure-planning signal.
 *
 * The source dataset's own conclusion is the point of this page: the
 * fastest-growing localities sit in low-lying peripheral zones, so growth
 * has to be read against flood vulnerability rather than on its own.
 */
export default function Demand() {
  const { isVerifiedOnly } = useDataMode();
  const [selected, setSelected] = useState(null);

  const { data, loading, error, refetch } = useApi(() => api.population(), []);
  const { data: risk } = useApi(() => api.risk(), []);

  const rows = data?.results || [];
  const summary = data?.summary;

  const riskBy = useMemo(() => {
    const map = {};
    (risk?.results || []).forEach((r) => {
      map[r.location] = r;
    });
    return map;
  }, [risk]);

  const current = rows.find((r) => r.location === selected) || rows[0];

  const distribution = useMemo(() => {
    const counts = {};
    rows.forEach((r) => {
      counts[r.growth_priority] = (counts[r.growth_priority] || 0) + 1;
    });
    return ["Very High", "High", "Medium", "Low"]
      .filter((k) => counts[k])
      .map((k) => ({ k, v: counts[k] }));
  }, [rows]);

  // Growth against flood exposure: the cross-reference the source report calls for.
  const tradeoff = useMemo(
    () =>
      rows
        .map((r) => {
          const rk = riskBy[r.location];
          const flood = rk?.components?.find((c) => c.name === "flood")?.level;
          return { ...r, flood, riskScore: rk?.overall_score };
        })
        .filter((r) => r.flood)
        .sort((a, b) => b.growth_pct - a.growth_pct),
    [rows, riskBy]
  );

  const compounding = tradeoff.filter(
    (r) => ["High", "Very High"].includes(r.flood) && ["High", "Very High"].includes(r.growth_priority)
  );

  const trend = summary?.totals
    ? Object.entries(summary.totals).map(([year, v]) => ({ year, population: v }))
    : [];

  const growthTicker = [...rows]
    .sort((a, b) => b.growth_pct - a.growth_pct)
    .slice(0, 12)
    .map((r) => ({ label: r.location, value: `+${r.growth_pct.toFixed(1)}`, unit: "%" }));

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Demand Analysis</h1>
        <p className="text-sm text-slate-500">
          Population growth to 2045 across {rows.length} sampled localities, and what it implies for
          where infrastructure has to go.
        </p>
      </div>

      <VerifiedOnlyNotice dataset="The population projection dataset" />

      {growthTicker.length > 0 && (
        <Ticker className="rounded-lg border border-slate-200 bg-white py-2.5" tone="light" speed={48} items={growthTicker} />
      )}

      {!isVerifiedOnly && (
        <AsyncPanel loading={loading} error={error} data={rows} onRetry={refetch}>
          {summary && (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <StatCard index={0} label="Localities" value={rows.length} />
                <StatCard index={1}
                  label="Population 2026"
                  value={`${(summary.totals["2026"] / 1e6).toFixed(2)}M`}
                />
                <StatCard index={2}
                  label="Projected 2045"
                  value={`${(summary.totals["2045"] / 1e6).toFixed(2)}M`}
                  tone="warn"
                />
                <StatCard index={3}
                  label="Overall growth"
                  value={`+${summary.overall_growth_pct}%`}
                  sub="2026 to 2045"
                />
                <StatCard index={4}
                  label="Growth + flood risk"
                  value={compounding.length}
                  tone="bad"
                  sub="localities in both"
                />
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-3">
                <Card index={0}
                  title="Aggregate trajectory"
                  subtitle="Combined population across the sample"
                  actions={<DataStatusBadge status="derived" />}
                >
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={trend} margin={{ left: -12, right: 10, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                      <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `${(v / 1e6).toFixed(1)}M`}
                      />
                      <RTooltip formatter={(v) => fmtNumber(v)} />
                      <Line
                        type="monotone"
                        dataKey="population"
                        stroke="#0d9488"
                        strokeWidth={2.5}
                        dot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>

                <Card index={1} title="Fastest growth" subtitle="Percent change, 2026 to 2045">
                  <Bars3D
                    height={220}
                    data={[...rows]
                      .sort((a, b) => b.growth_pct - a.growth_pct)
                      .slice(0, 10)
                      .map((r) => ({ label: r.location, value: r.growth_pct }))}
                  />
                </Card>

                <Card index={2} title="Growth priority" subtitle="How the sample is distributed">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={distribution} margin={{ left: -20, right: 10, top: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="k" tick={{ fontSize: 10 }} />
                      {/* Pin the domain: the auto-scale leaves the bars short. */}
                      <YAxis
                        tick={{ fontSize: 10 }}
                        allowDecimals={false}
                        domain={[0, (max) => Math.ceil((max + 1) / 2) * 2]}
                      />
                      <RTooltip />
                      <Bar dataKey="v" radius={[4, 4, 0, 0]}>
                        {distribution.map((d) => (
                          <Cell key={d.k} fill={PRIORITY_COLOR[d.k]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </Card>

                <Card index={2} title="Fastest growing" subtitle="2026 to 2045">
                  <div className="space-y-2">
                    {summary.fastest_growing.map((r) => (
                      <button
                        key={r.location}
                        type="button"
                        onClick={() => setSelected(r.location)}
                        className="w-full text-left"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-xs font-medium text-slate-900">{r.location}</span>
                          <span className="text-xs tabular-nums text-rose-700">
                            +{r.growth_pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="mt-1">
                          <ScoreBar value={r.growth_pct} max={140} tone="bg-rose-500" />
                        </div>
                      </button>
                    ))}
                  </div>
                </Card>
              </div>

              <Card index={3}
                className="mt-5"
                title="Growth against flood exposure"
                subtitle="The cross-reference the source report calls for — fast growth in low-lying zones is the compounding case"
                actions={<DataStatusBadge status="derived" />}
              >
                {compounding.length > 0 && (
                  <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs leading-relaxed text-rose-900">
                    <b>
                      {compounding.length} localities carry both High/Very High growth priority and
                      High/Very High flood vulnerability:
                    </b>{" "}
                    {compounding.map((c) => c.location).join(", ")}. Growth here raises the number of
                    people exposed, so drainage and shelter capacity has to lead the housing, not
                    follow it.
                  </div>
                )}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-2">Locality</th>
                        <th className="pb-2 pr-2 text-right">2026</th>
                        <th className="pb-2 pr-2 text-right">2045</th>
                        <th className="pb-2 pr-2 text-right">Growth</th>
                        <th className="pb-2 pr-2 text-right">CAGR</th>
                        <th className="pb-2 pr-2">Growth priority</th>
                        <th className="pb-2 pr-2">Flood</th>
                        <th className="pb-2 text-right">Demand score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tradeoff.map((r) => {
                        const compound =
                          ["High", "Very High"].includes(r.flood) &&
                          ["High", "Very High"].includes(r.growth_priority);
                        return (
                          <tr
                            key={r.location}
                            onClick={() => setSelected(r.location)}
                            className={`cursor-pointer border-b border-slate-50 ${
                              r.location === current?.location
                                ? "bg-brand-50"
                                : compound
                                  ? "bg-rose-50/40"
                                  : "hover:bg-slate-50"
                            }`}
                          >
                            <td className="py-2 pr-2 font-medium text-slate-900">{r.location}</td>
                            <td className="py-2 pr-2 text-right tabular-nums text-slate-600">
                              {fmtNumber(r.population_2026)}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums">
                              {fmtNumber(r.projected_2045)}
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums font-medium">
                              +{r.growth_pct.toFixed(0)}%
                            </td>
                            <td className="py-2 pr-2 text-right tabular-nums text-slate-500">
                              {r.cagr_pct.toFixed(2)}%
                            </td>
                            <td className="py-2 pr-2">
                              <Tag value={r.growth_priority} />
                            </td>
                            <td className="py-2 pr-2">
                              <Tag value={r.flood} />
                            </td>
                            <td className="py-2 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="tabular-nums">{r.demand_score.toFixed(0)}</span>
                                <div className="w-12">
                                  <ScoreBar value={r.demand_score} tone="bg-brand-500" />
                                </div>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>

              {current && (
                <Card index={4}
                  className="mt-5"
                  title={current.location}
                  subtitle="Projected trajectory"
                  actions={<Tag value={current.growth_priority} />}
                >
                  <div className="grid gap-5 lg:grid-cols-3">
                    <div className="lg:col-span-2">
                      <ResponsiveContainer width="100%" height={210}>
                        <LineChart
                          data={current.series}
                          margin={{ left: -10, right: 10, top: 8 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                          <YAxis
                            tick={{ fontSize: 10 }}
                            tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                          />
                          <RTooltip formatter={(v) => fmtNumber(v)} />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                          <Line
                            name="Residents"
                            type="monotone"
                            dataKey="population"
                            stroke="#0d9488"
                            strokeWidth={2.5}
                            dot={{ r: 4 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div>
                      <p className="text-sm leading-relaxed text-slate-700">{current.explanation}</p>
                      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <dt className="text-slate-500">2026</dt>
                        <dd className="text-right font-medium">
                          {fmtNumber(current.population_2026)}
                        </dd>
                        <dt className="text-slate-500">2045</dt>
                        <dd className="text-right font-medium">
                          {fmtNumber(current.projected_2045)}
                        </dd>
                        <dt className="text-slate-500">Growth</dt>
                        <dd className="text-right font-medium">+{current.growth_pct}%</dd>
                        <dt className="text-slate-500">CAGR</dt>
                        <dd className="text-right font-medium">{current.cagr_pct}%</dd>
                        <dt className="text-slate-500">Demand score</dt>
                        <dd className="text-right font-medium">{current.demand_score}/100</dd>
                      </dl>
                      {riskBy[current.location] && (
                        <div className="mt-3 rounded-lg bg-slate-50 px-3 py-2">
                          <p className="text-[11px] font-medium text-slate-700">Climate risk</p>
                          <div className="mt-1 flex items-center gap-2">
                            <Tag value={riskBy[current.location].overall_level} />
                            <span className="text-xs tabular-nums text-slate-600">
                              {riskBy[current.location].overall_score}/100
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <Notes notes={current.notes} />
                </Card>
              )}

              <Notes notes={summary.notes} />
            </>
          )}
        </AsyncPanel>
      )}
    </div>
  );
}
