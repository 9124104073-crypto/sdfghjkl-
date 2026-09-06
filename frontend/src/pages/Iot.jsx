import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import api, { describeError } from "../api/client";
import MapView from "../components/MapView";
import {
  AsyncPanel,
  Card,
  DataStatusBadge,
  Notes,
  StatCard,
  Tag,
  useApi,
} from "../components/ui";

const STATUS_COLORS = { NORMAL: "#10b981", WARNING: "#f59e0b", CRITICAL: "#e11d48" };

export default function Iot() {
  const [selectedId, setSelectedId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const { data, loading, error, refetch } = useApi(() => api.iotDevices(), []);
  const devices = data?.devices || [];
  const selected = devices.find((d) => d.device_id === selectedId) || devices[0];

  async function simulate(escalate) {
    if (!selected) return;
    setBusy(true);
    setActionError(null);
    try {
      await api.iotSimulate({ device_id: selected.device_id, readings: 1, escalate });
      await refetch();
    } catch (err) {
      setActionError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">IoT Monitoring</h1>
        <p className="text-sm text-slate-500">
          Sensors &rarr; ESP32 &rarr; MQTT &rarr; ingestion &rarr; Risk Engine &rarr; dashboard. IoT
          is an input to risk analysis, not an independent decision engine.
        </p>
      </div>

      <AsyncPanel loading={loading} error={error} data={devices} onRetry={refetch}>
        {data && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatCard label="Devices" value={data.summary.total} />
              <StatCard label="Online" value={data.summary.online} tone="good" />
              <StatCard label="Normal" value={data.summary.NORMAL} tone="good" />
              <StatCard label="Warning" value={data.summary.WARNING} tone="warn" />
              <StatCard label="Critical" value={data.summary.CRITICAL} tone="bad" />
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-5">
              <Card
                title="Sensor fleet"
                className="lg:col-span-2"
                actions={<DataStatusBadge status="demo" />}
              >
                <div className="space-y-1.5">
                  {devices.map((device) => (
                    <button
                      key={device.device_id}
                      type="button"
                      onClick={() => setSelectedId(device.device_id)}
                      className={`w-full rounded-md border px-3 py-2 text-left transition ${
                        device.device_id === selected?.device_id
                          ? "border-brand-300 bg-brand-50"
                          : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-900">
                          {device.sensor_label}
                        </span>
                        <Tag value={device.status} />
                      </div>
                      <div className="mt-0.5 flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {device.location} &middot; {device.device_id}
                        </span>
                        <span className="tabular-nums font-medium text-slate-800">
                          {device.current_value ?? "-"}
                          {device.unit}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-400">
                        trend: {device.trend}
                        {device.change != null && (
                          <>
                            {" "}
                            ({device.change > 0 ? "+" : ""}
                            {device.change})
                          </>
                        )}
                      </p>
                    </button>
                  ))}
                </div>
              </Card>

              {selected && (
                <Card
                  title={`${selected.sensor_label} — ${selected.location}`}
                  subtitle={selected.device_id}
                  className="lg:col-span-3"
                  actions={<Tag value={selected.status} />}
                >
                  <div className="flex flex-wrap items-baseline gap-4">
                    <div>
                      <p className="text-3xl font-semibold tabular-nums text-slate-900">
                        {selected.current_value}
                        <span className="ml-1 text-base text-slate-500">{selected.unit}</span>
                      </p>
                      <p className="text-xs text-slate-500">
                        previous {selected.previous_value ?? "-"}
                        {selected.unit} &middot; trend {selected.trend}
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      <p>Warning at {selected.warning_threshold}{selected.unit}</p>
                      <p>Critical at {selected.critical_threshold}{selected.unit}</p>
                    </div>
                  </div>

                  <p className="mt-2 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {selected.status_message}
                  </p>

                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart
                      data={selected.history.map((h) => ({
                        time: h.timestamp.slice(11, 16),
                        value: h.value,
                      }))}
                      margin={{ left: -18, right: 10, top: 14 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} domain={["auto", "auto"]} />
                      <RTooltip />
                      {selected.warning_threshold && (
                        <ReferenceLine
                          y={selected.warning_threshold}
                          stroke="#f59e0b"
                          strokeDasharray="4 4"
                          label={{ value: "warning", fontSize: 9, fill: "#b45309" }}
                        />
                      )}
                      {selected.critical_threshold && (
                        <ReferenceLine
                          y={selected.critical_threshold}
                          stroke="#e11d48"
                          strokeDasharray="4 4"
                          label={{ value: "critical", fontSize: 9, fill: "#be123c" }}
                        />
                      )}
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={STATUS_COLORS[selected.status]}
                        strokeWidth={2}
                        dot={{ r: 2 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => simulate(0.6)}
                      className="rounded-md bg-amber-600 px-3 py-2 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                    >
                      Simulate rising level
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => simulate(0)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Steady reading
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => simulate(-0.6)}
                      className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      Simulate receding
                    </button>
                  </div>

                  {actionError && (
                    <p className="mt-2 text-xs text-rose-700">{actionError}</p>
                  )}

                  <p className="mt-3 text-[11px] text-slate-500">
                    A real ESP32 publishes{" "}
                    <code className="rounded bg-slate-100 px-1">
                      {"{device_id, sensor_type, value, unit, timestamp}"}
                    </code>{" "}
                    to MQTT topic{" "}
                    <code className="rounded bg-slate-100 px-1">
                      nirman/sensors/{selected.device_id}
                    </code>
                    , which reaches the database through the same ingest path as these simulated
                    readings.
                  </p>
                </Card>
              )}
            </div>

            <Card className="mt-5" title="Device locations">
              <MapView
                height="320px"
                markers={devices
                  .filter((d) => d.latitude)
                  .map((d) => ({
                    id: d.device_id,
                    latitude: d.latitude,
                    longitude: d.longitude,
                    label: `${d.device_id} — ${d.location}`,
                    color: STATUS_COLORS[d.status],
                    radius: d.status === "NORMAL" ? 8 : 13,
                    rows: [
                      { label: "Sensor", value: d.sensor_label },
                      { label: "Reading", value: `${d.current_value}${d.unit}` },
                      { label: "Status", value: d.status },
                    ],
                  }))}
                onSelect={(m) => setSelectedId(m.id)}
                legend={Object.entries(STATUS_COLORS).map(([label, color]) => ({ label, color }))}
              />
            </Card>

            <Notes notes={data.notes} />
          </>
        )}
      </AsyncPanel>
    </div>
  );
}
