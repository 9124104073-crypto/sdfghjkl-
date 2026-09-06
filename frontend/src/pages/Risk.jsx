import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import api from "../api/client";
import MapView, { RISK_COLORS } from "../components/MapView";
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

export default function Risk() {
  const [selected, setSelected] = useState(null);
  const { data, loading, error, refetch } = useApi(() => api.risk(), []);
  const { data: population } = useApi(() => api.population(), []);

  const current =
    data?.results.find((r) => r.location === selected) || data?.results[0] || null;
  const demand = population?.results.find((p) => p.location === current?.location);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Risk &amp; Climate</h1>
        <p className="text-sm text-slate-500">
          Rule-based classification over flood, terrain, accessibility and construction-delay
          indicators. This is not a validated flood forecast.
        </p>
      </div>

      <AsyncPanel loading={loading} error={error} data={data?.results} onRetry={refetch}>
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <StatCard label="Locations assessed" value={data.summary.locations} />
              <StatCard
                label="High / very high"
                value={data.summary.high_risk_count}
                tone="bad"
              />
              <StatCard
                label="Average rainfall"
                value={`${fmtNumber(data.summary.average_rainfall_mm)} mm`}
              />
              <StatCard
                label="Very high flood risk"
                value={data.summary.flood_vulnerability_distribution["Very High"] || 0}
                tone="bad"
              />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-5">
              <Card
                title="Risk map"
                subtitle="Marker colour shows flood vulnerability"
                className="lg:col-span-3"
                actions={<DataStatusBadge status="derived" />}
              >
                <MapView
                  height="420px"
                  markers={data.results
                    .filter((r) => r.latitude)
                    .map((r) => {
                      const flood = r.components.find((c) => c.name === "flood");
                      return {
                        id: r.location,
                        latitude: r.latitude,
                        longitude: r.longitude,
                        label: r.location,
                        color: RISK_COLORS[flood?.level] || "#94a3b8",
                        radius: r.location === current?.location ? 15 : 11,
                        rows: [
                          { label: "Overall", value: `${r.overall_level} (${r.overall_score})` },
                          { label: "Flood", value: flood?.level },
                        ],
                      };
                    })}
                  onSelect={(m) => setSelected(m.id)}
                  legend={["Low", "Medium", "High", "Very High"].map((label) => ({
                    label,
                    color: RISK_COLORS[label],
                  }))}
                />
              </Card>

              {current && (
                <Card
                  title={current.location}
                  subtitle="Risk breakdown"
                  className="lg:col-span-2"
                  actions={<Tag value={current.overall_level} />}
                >
                  <div className="mb-3 flex items-baseline gap-2">
                    <span className="text-3xl font-semibold tabular-nums text-slate-900">
                      {current.overall_score}
                    </span>
                    <span className="text-xs text-slate-500">/ 100 composite risk</span>
                  </div>

                  <div className="space-y-3">
                    {current.components.map((c) => (
                      <div key={c.name}>
                        <div className="flex items-baseline justify-between">
                          <span className="text-xs font-medium text-slate-800">{c.label}</span>
                          <span className="text-xs text-slate-600">
                            <Tag value={c.level} /> <span className="tabular-nums">{c.score}</span>
                          </span>
                        </div>
                        <div className="mt-1">
                          <ScoreBar
                            value={c.score}
                            tone={
                              c.score >= 75
                                ? "bg-rose-500"
                                : c.score >= 50
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            }
                          />
                        </div>
                        <p className="mt-1 text-[11px] text-slate-500">{c.rationale}</p>
                      </div>
                    ))}
                  </div>

                  {demand && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <p className="text-xs font-medium text-slate-800">Population outlook</p>
                      <ResponsiveContainer width="100%" height={140}>
                        <LineChart data={demand.series} margin={{ left: -20, right: 8, top: 8 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                          <XAxis dataKey="year" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${v / 1000}k`} />
                          <RTooltip formatter={(v) => fmtNumber(v)} />
                          <Line
                            type="monotone"
                            dataKey="population"
                            stroke="#0d9488"
                            strokeWidth={2}
                            dot={{ r: 3 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                      <p className="text-[11px] text-slate-500">{demand.explanation}</p>
                    </div>
                  )}
                </Card>
              )}
            </div>

            <Card className="mt-5" title="All locations" actions={<DataStatusBadge status="derived" />}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                      <th className="pb-2 pr-2">Location</th>
                      <th className="pb-2 pr-2">Overall</th>
                      <th className="pb-2 pr-2">Flood</th>
                      <th className="pb-2 pr-2">Terrain</th>
                      <th className="pb-2 pr-2">Access</th>
                      <th className="pb-2 pr-2">Delay</th>
                      <th className="pb-2">Rainfall</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.results.map((r) => (
                      <tr
                        key={r.location}
                        onClick={() => setSelected(r.location)}
                        className={`cursor-pointer border-b border-slate-50 ${
                          r.location === current?.location ? "bg-brand-50" : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-2 pr-2 font-medium text-slate-900">{r.location}</td>
                        <td className="py-2 pr-2">
                          <Tag value={r.overall_level} />{" "}
                          <span className="tabular-nums text-xs text-slate-500">
                            {r.overall_score}
                          </span>
                        </td>
                        {r.components.map((c) => (
                          <td key={c.name} className="py-2 pr-2">
                            <Tag value={c.level} />
                          </td>
                        ))}
                        <td className="py-2 tabular-nums text-xs text-slate-600">
                          {r.annual_rainfall_mm ? `${r.annual_rainfall_mm} mm` : "-"}
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
  );
}
