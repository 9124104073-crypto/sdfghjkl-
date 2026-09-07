import { CheckCircle2, Cpu, Database, Radio, ServerCog } from "lucide-react";
import api from "../api/client";
import { C, body, heading } from "../theme";
import { useDataMode } from "../components/DataMode";
import { Panel, SectionHeader, StatusPill, Tag } from "../components/widgets";
import { useApi } from "../components/ui";

/**
 * Settings — the live configuration of the running service.
 *
 * Every value is read from /health, the provider registries and the model
 * endpoint, so this reflects what the backend is actually doing rather than
 * a static list of preferences.
 */
export default function Settings() {
  const { dataMode, setDataMode } = useDataMode();
  const { data: health } = useApi(() => api.health(), []);
  const { data: providers } = useApi(() => api.providers(), []);
  const { data: mlProviders } = useApi(() => api.mlProviders(), []);
  const { data: model } = useApi(() => api.mlModel(), []);
  const { data: mqtt } = useApi(() => api.mqttStatus(), []);
  const { data: corpus } = useApi(() => api.knowledgeStats(), []);

  const workspace = [
    ["Department", "Urban Development Department, Tamil Nadu"],
    ["Default region", "Chennai Metropolitan Area"],
    ["Units", "Metric · ₹ (INR) · crore"],
    ["Coordinate reference", "EPSG:4326 storage · EPSG:32644 analysis"],
  ];

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        eyebrow="Configuration"
        title="Settings"
        subtitle="Workspace preferences, and the live state of the services behind them."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel className="p-5" index={0}>
          <div className="mb-4 flex items-center gap-2">
            <ServerCog size={16} style={{ color: C.teal }} />
            <span className="text-sm font-semibold" style={{ color: C.navy, ...heading }}>Service status</span>
          </div>
          <dl className="flex flex-col">
            {[
              ["Status", health ? <StatusPill tone={health.status === "ok" ? "green" : "red"}>{health.status}</StatusPill> : "—"],
              ["Version", health?.version ?? "—"],
              ["Database", health?.database ?? "—"],
              ["Seeded", health?.seeded ? "yes" : "no"],
              ["Demo mode", health?.demo_mode ? "on" : "off"],
              ["Copilot provider", health?.ai_provider ?? "—"],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center justify-between py-2" style={{ borderTop: `1px solid ${C.border}` }}>
                <dt className="text-sm" style={{ color: C.slateSoft }}>{k}</dt>
                <dd className="text-sm font-medium" style={{ color: C.navy }}>{v}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel className="p-5" index={1}>
          <div className="mb-4 flex items-center gap-2">
            <Database size={16} style={{ color: C.teal }} />
            <span className="text-sm font-semibold" style={{ color: C.navy, ...heading }}>Data mode</span>
          </div>
          <p className="mb-3 text-xs leading-relaxed" style={{ color: C.slateSoft }}>
            Verified-only hides demonstration values and says what is missing, rather than
            substituting an estimate. Use it to see what would survive connecting an authoritative
            provider.
          </p>
          <div className="inline-flex rounded-md p-1" style={{ background: C.bg, border: `1px solid ${C.border}` }}>
            {["demo", "verified"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setDataMode(m)}
                aria-pressed={dataMode === m}
                className="rounded px-4 py-1.5 text-xs font-semibold capitalize transition"
                style={
                  dataMode === m
                    ? { background: C.card, color: C.teal, boxShadow: "0 1px 3px rgba(15,40,52,.12)" }
                    : { background: "transparent", color: C.slateSoft }
                }
              >
                {m}
              </button>
            ))}
          </div>

          <div className="mt-5">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: C.slateFaint }}>
              Record counts
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {Object.entries(health?.record_counts || {}).slice(0, 10).map(([k, v]) => (
                <div key={k} className="flex justify-between">
                  <span style={{ color: C.slateSoft }}>{k.replaceAll("_", " ")}</span>
                  <span className="font-semibold tabular-nums" style={{ color: C.navy }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </Panel>

        <Panel className="p-5" index={2}>
          <div className="mb-4 flex items-center gap-2">
            <Cpu size={16} style={{ color: C.teal }} />
            <span className="text-sm font-semibold" style={{ color: C.navy, ...heading }}>Scoring providers</span>
          </div>
          <div className="flex flex-col gap-2">
            {(mlProviders?.data || []).map((p) => (
              <div key={p.key} className="rounded-md p-3" style={{ border: `1px solid ${C.border}` }}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold" style={{ color: C.navy }}>{p.label}</span>
                  {p.default && <StatusPill tone="green">Default</StatusPill>}
                </div>
                <p className="mt-1 text-[11px] leading-snug" style={{ color: C.slateSoft }}>{p.description}</p>
              </div>
            ))}
          </div>
          {model?.model && (
            <div className="mt-3 rounded-md p-3 text-[11px]" style={{ background: C.bg, color: C.slateSoft }}>
              Surrogate: {model.model.algorithm} · {model.model.training_rows?.toLocaleString()} rows ·
              held-out R² {model.model.cross_validated_r2}, MAE {model.model.cross_validated_mae}.
            </div>
          )}
        </Panel>

        <Panel className="p-5" index={3}>
          <div className="mb-4 flex items-center gap-2">
            <Radio size={16} style={{ color: C.teal }} />
            <span className="text-sm font-semibold" style={{ color: C.navy, ...heading }}>Integrations</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center justify-between py-2" style={{ borderTop: `1px solid ${C.border}` }}>
              <span className="text-sm" style={{ color: C.slateSoft }}>MQTT ingestion</span>
              <StatusPill tone={mqtt?.enabled ? "green" : "slate"}>
                {mqtt?.enabled ? "connected" : "not configured"}
              </StatusPill>
            </div>
            <div className="flex items-center justify-between py-2" style={{ borderTop: `1px solid ${C.border}` }}>
              <span className="text-sm" style={{ color: C.slateSoft }}>Knowledge corpus</span>
              <span className="text-sm font-medium" style={{ color: C.navy }}>
                {corpus?.chunks ?? "—"} chunks
              </span>
            </div>
            {(providers?.data || []).map((p) => (
              <div key={p.key} className="flex items-center justify-between py-2" style={{ borderTop: `1px solid ${C.border}` }}>
                <span className="text-sm" style={{ color: C.slateSoft }}>{p.organisation}</span>
                <StatusPill tone={p.configured ? "green" : "slate"}>
                  {p.configured ? "active" : "declared"}
                </StatusPill>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="p-5" index={4}>
        <div className="mb-4 flex items-center gap-2">
          <CheckCircle2 size={16} style={{ color: C.teal }} />
          <span className="text-sm font-semibold" style={{ color: C.navy, ...heading }}>Workspace</span>
        </div>
        <dl className="flex flex-col">
          {workspace.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-3" style={{ borderTop: `1px solid ${C.border}` }}>
              <dt className="text-sm" style={{ color: C.slateSoft }}>{k}</dt>
              <dd className="text-sm font-medium" style={{ color: C.navy }}>{v}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}
