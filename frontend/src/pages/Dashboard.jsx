import { Link } from "react-router-dom";
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
import MapView, { TIER_COLORS } from "../components/MapView";
import { Ticker } from "../components/Ticker";
import { Gauge3D, Bars3D } from "../components/three/widgets3d";
import { ProgressRing } from "../components/uikit";
import {
  AsyncPanel,
  Card,
  DataStatusBadge,
  Notes,
  ScoreBar,
  Donut,
  StatCard,
  Tag,
  fmtCrore,
  fmtNumber,
  useApi,
} from "../components/ui";

const RISK_PIE_COLORS = { Low: "#10b981", Medium: "#f59e0b", High: "#e11d48" };

export default function Dashboard() {
  const { data, loading, error, refetch } = useApi(() => api.dashboard(), []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Portfolio Dashboard</h1>
        <p className="text-sm text-slate-500">
          Chennai Metropolitan Area &middot; candidate sites, proposed projects and live risk signals.
        </p>
      </div>

      <AsyncPanel loading={loading} error={error} data={data} onRetry={refetch}>
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatCard index={0} label="Sites assessed" value={fmtNumber(data.metrics.sites_assessed)} />
              <StatCard index={1}
                label="Recommended sites"
                value={fmtNumber(data.metrics.recommended_sites)}
                tone="good"
                sub="per source dataset"
              />
              <StatCard index={2} label="Projects" value={fmtNumber(data.metrics.projects)} />
              <StatCard index={3}
                label="Portfolio outlay"
                value={fmtCrore(data.metrics.total_budget_cr)}
                sub="planning-level"
              />
              <StatCard index={4}
                label="High-risk areas"
                value={fmtNumber(data.metrics.high_risk_areas)}
                tone="bad"
              />
              <StatCard index={5}
                label="Sensor alerts"
                value={fmtNumber(data.metrics.sensor_alerts)}
                tone={data.metrics.sensor_alerts > 0 ? "warn" : "good"}
                sub={`${data.metrics.sensors_online} online`}
              />
            </div>

            <Ticker
              className="mt-5 rounded-lg border py-2.5"
              tone="light"
              speed={50}
              items={[
                { label: "Sites assessed", value: data.metrics.sites_assessed },
                { label: "Projects", value: data.metrics.projects },
                { label: "Outlay", value: data.metrics.total_budget_cr, unit: " ₹cr" },
                { label: "High-risk localities", value: data.metrics.high_risk_areas },
                ...data.top_sites.map((s) => ({ label: s.site_name, value: s.score.toFixed(1) })),
              ]}
            />

            {/* The leading site as a 3D gauge, the shortlist as 3D bars —
                same numbers as the table below, read at a glance. */}
            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <Card index={0} title="Leading site" subtitle={data.top_sites[0]?.site_name}>
                <Gauge3D score={data.top_sites[0]?.score ?? 0} label="suitability" height={210} />
              </Card>
              <Card index={1} title="Portfolio counters" subtitle="Rings draw to the live value" className="lg:col-span-2">
                <div className="flex flex-wrap items-start justify-around gap-4 py-2">
                  <ProgressRing value={data.metrics.sites_assessed} max={40} label="Sites assessed" />
                  <ProgressRing value={data.metrics.recommended_sites} max={data.metrics.sites_assessed || 40} label="Recommended" />
                  <ProgressRing value={data.metrics.high_risk_areas} max={data.metrics.sites_assessed || 40} label="High risk" tone="#DC2626" />
                  <ProgressRing value={data.metrics.sensors_online} max={Math.max(data.metrics.sensors_online, 8)} label="Sensors online" />
                </div>
              </Card>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <Card index={0} title="Shortlist" subtitle="Top candidates by score" className="lg:col-span-3">
                <Bars3D
                  height={210}
                  data={data.top_sites.slice(0, 8).map((s) => ({
                    label: s.site_name,
                    value: s.score,
                    color: TIER_COLORS[s.recommendation],
                  }))}
                />
              </Card>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              <Card index={0}
                title="Top candidate sites"
                subtitle="Hospital siting under default weights"
                className="lg:col-span-2"
                actions={<DataStatusBadge status="derived" />}
              >
                <MapView
                  height="360px"
                  markers={data.top_sites.map((s) => ({
                    id: s.site_id,
                    latitude: s.latitude,
                    longitude: s.longitude,
                    label: s.site_name,
                    color: TIER_COLORS[s.recommendation] || "#0f766e",
                    radius: 10,
                    rows: [
                      { label: "Score", value: s.score.toFixed(1) },
                      { label: "Tier", value: s.recommendation },
                    ],
                  }))}
                  legend={[
                    { label: "Recommended", color: TIER_COLORS.Recommended },
                    { label: "Consider", color: TIER_COLORS.Consider },
                    { label: "Further assessment", color: TIER_COLORS["Further Assessment Required"] },
                  ]}
                />
                <ul className="mt-4 space-y-2">
                  {data.top_sites.map((site, index) => (
                    <li key={site.site_id} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-xs font-semibold text-slate-400">{index + 1}</span>
                      <Link
                        to={`/recommendation?site=${site.site_id}`}
                        className="w-36 shrink-0 font-medium text-slate-900 hover:text-brand-700"
                      >
                        {site.site_name}
                      </Link>
                      <div className="flex-1">
                        <ScoreBar value={site.score} />
                      </div>
                      <span className="w-12 text-right text-xs tabular-nums text-slate-600">
                        {site.score.toFixed(1)}
                      </span>
                      <Tag value={site.recommendation} />
                    </li>
                  ))}
                </ul>
              </Card>

              <div className="space-y-5">
                <Card index={1} title="Risk profile" subtitle="Proposed projects by risk class">
                  <div className="flex justify-center py-1">
                    <Donut
                      ariaLabel="Proposed projects by risk class"
                      data={Object.entries(data.risk_distribution).map(([name, value]) => ({
                        name,
                        value,
                        color: RISK_PIE_COLORS[name] || "#94a3b8",
                      }))}
                    />
                  </div>
                  <div className="mt-2 flex flex-wrap justify-center gap-3 text-xs">
                    {Object.entries(data.risk_distribution).map(([name, value]) => (
                      <span key={name} className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: RISK_PIE_COLORS[name] || "#94a3b8" }}
                        />
                        {name} ({value})
                      </span>
                    ))}
                  </div>
                </Card>

                <Card index={2} title="Population outlook" subtitle="Sampled localities, 2026 to 2045">
                  <p className="text-2xl font-semibold text-slate-900">
                    +{data.population.overall_growth_pct}%
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {fmtNumber(data.population.totals?.["2026"])} &rarr;{" "}
                    {fmtNumber(data.population.totals?.["2045"])} residents
                  </p>
                  <Link
                    to="/risk"
                    className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline"
                  >
                    View demand and risk detail &rarr;
                  </Link>
                </Card>
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <Card index={3} title="Projects by sector" actions={<DataStatusBadge status="demo" />}>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={Object.entries(data.sector_distribution)
                      .map(([sector, count]) => ({ sector, count }))
                      .sort((a, b) => b.count - a.count)}
                    layout="vertical"
                    margin={{ left: 8, right: 16 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                    <YAxis
                      type="category"
                      dataKey="sector"
                      width={150}
                      tick={{ fontSize: 10 }}
                      interval={0}
                    />
                    <RTooltip />
                    <Bar dataKey="count" fill="#0d9488" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card>

              <Card index={4}
                title="Highest priority projects"
                subtitle="Re-ranked by the Priority Engine"
                actions={<DataStatusBadge status="derived" />}
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-2">#</th>
                        <th className="pb-2 pr-2">Project</th>
                        <th className="pb-2 pr-2">Area</th>
                        <th className="pb-2 text-right">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.top_priority.map((row) => (
                        <tr key={`${row.area}-${row.project}`} className="border-b border-slate-50">
                          <td className="py-2 pr-2 text-xs text-slate-400">{row.computed_rank}</td>
                          <td className="py-2 pr-2 font-medium text-slate-900">{row.project}</td>
                          <td className="py-2 pr-2 text-slate-600">{row.area}</td>
                          <td className="py-2 text-right tabular-nums text-slate-900">
                            {row.computed_score.toFixed(1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Link
                  to="/priority"
                  className="mt-3 inline-block text-xs font-medium text-brand-700 hover:underline"
                >
                  Open full ranking &rarr;
                </Link>
              </Card>
            </div>

            <Notes notes={data.notes} />
          </>
        )}
      </AsyncPanel>
    </div>
  );
}
