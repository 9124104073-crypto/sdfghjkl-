import { Download, FileText, FolderClock, ScrollText } from "lucide-react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { C, body, heading } from "../theme";
import { KPICard, Panel, SectionHeader, StatusPill, Tag } from "../components/widgets";
import { AsyncPanel, useApi } from "../components/ui";

/**
 * Planning Reports — the platform's own history.
 *
 * Reads the persisted `ai_recommendations` and `audit_logs` tables rather
 * than a fixture list, so this page shows what the system has genuinely
 * produced and been asked to do.
 */
export default function Reports() {
  const { data: outputs, loading, error, refetch } = useApi(() => api.aiHistory(), []);
  const { data: audit } = useApi(() => api.auditLog(), []);
  const { data: scores } = useApi(() => api.scoreHistory(), []);
  const { data: portfolio } = useApi(() => api.projects(), []);

  const rows = outputs?.data || [];
  const auditRows = audit?.data || [];
  const scoreRows = scores?.data || [];
  const projects = portfolio?.projects || [];

  const byType = rows.reduce((acc, r) => {
    acc[r.recommendation_type] = (acc[r.recommendation_type] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-6">
      <SectionHeader
        eyebrow="History"
        title="Planning Reports"
        subtitle="Everything the platform has produced and been asked to do, read from the persisted history rather than a fixture list."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPICard index={0} label="AI outputs recorded" value={rows.length} icon={ScrollText} />
        <KPICard index={1} label="Scoring runs" value={scoreRows.length} icon={FileText} />
        <KPICard index={2} label="Audit entries" value={auditRows.length} icon={FolderClock} />
        <KPICard index={3} label="Projects available" value={projects.length} icon={FileText} sub="each can generate a DPR" />
      </div>

      <AsyncPanel loading={loading} error={error} data={rows} onRetry={refetch} empty="No AI output recorded yet — generate a DPR or ask the Copilot.">
        <div className="grid gap-5 lg:grid-cols-3">
          <Panel className="p-5 lg:col-span-2" index={0}>
            <div className="mb-4 text-sm font-semibold" style={{ color: C.navy, ...heading }}>
              Generated output
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={body}>
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: C.slateFaint }}>
                    <th className="pb-2 pr-2">Type</th>
                    <th className="pb-2 pr-2">Entity</th>
                    <th className="pb-2 pr-2">Provider</th>
                    <th className="pb-2 pr-2">Status</th>
                    <th className="pb-2">Recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 25).map((r) => (
                    <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                      <td className="py-2.5 pr-2 font-medium" style={{ color: C.navy }}>
                        {r.recommendation_type.replaceAll("_", " ")}
                      </td>
                      <td className="py-2.5 pr-2" style={{ color: C.slateSoft }}>
                        {r.entity_type} {r.entity_id}
                      </td>
                      <td className="py-2.5 pr-2" style={{ color: C.slateSoft }}>{r.provider || "—"}</td>
                      <td className="py-2.5 pr-2"><Tag value={r.data_status} /></td>
                      <td className="py-2.5 text-xs tabular-nums" style={{ color: C.slateFaint }}>
                        {r.recorded_at?.replace("T", " ").slice(0, 16)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="flex flex-col gap-5">
            <Panel className="p-5" index={1}>
              <div className="mb-3 text-sm font-semibold" style={{ color: C.navy, ...heading }}>
                By type
              </div>
              {Object.entries(byType).length === 0 && (
                <p className="text-xs" style={{ color: C.slateSoft }}>Nothing recorded yet.</p>
              )}
              <div className="flex flex-col gap-2">
                {Object.entries(byType).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs" style={{ color: C.slate }}>
                    <span>{k.replaceAll("_", " ")}</span>
                    <span className="font-semibold tabular-nums" style={{ color: C.navy }}>{v}</span>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel className="p-5" index={2}>
              <div className="mb-3 text-sm font-semibold" style={{ color: C.navy, ...heading }}>
                Download a DPR
              </div>
              <p className="mb-3 text-xs" style={{ color: C.slateSoft }}>
                Any portfolio project can be rendered as a four-page PDF.
              </p>
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
                {projects.slice(0, 12).map((p) => (
                  <a
                    key={p.id}
                    href={api.dprDownloadUrl(p.id)}
                    className="nir-row flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-xs"
                    style={{ color: C.slate }}
                  >
                    <span className="truncate">{p.name}</span>
                    <Download size={13} style={{ color: C.teal, flex: "none" }} />
                  </a>
                ))}
              </div>
              <Link to="/dpr" className="mt-3 inline-block text-xs font-medium" style={{ color: C.teal }}>
                Open the DPR generator →
              </Link>
            </Panel>
          </div>
        </div>

        <Panel className="mt-5 p-5" index={3}>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-sm font-semibold" style={{ color: C.navy, ...heading }}>
              Audit trail
            </div>
            <StatusPill tone="slate" dot={false}>{auditRows.length} entries</StatusPill>
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm" style={body}>
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide" style={{ color: C.slateFaint }}>
                  <th className="pb-2 pr-2">Action</th>
                  <th className="pb-2 pr-2">Entity</th>
                  <th className="pb-2 pr-2">Detail</th>
                  <th className="pb-2">At</th>
                </tr>
              </thead>
              <tbody>
                {auditRows.slice(0, 40).map((a) => (
                  <tr key={a.id} style={{ borderTop: `1px solid ${C.border}` }}>
                    <td className="py-2 pr-2 font-medium" style={{ color: C.navy }}>{a.action}</td>
                    <td className="py-2 pr-2" style={{ color: C.slateSoft }}>
                      {a.entity_type ? `${a.entity_type} ${a.entity_id ?? ""}` : "—"}
                    </td>
                    <td className="py-2 pr-2 text-xs" style={{ color: C.slateSoft }}>{a.detail || "—"}</td>
                    <td className="py-2 text-xs tabular-nums" style={{ color: C.slateFaint }}>
                      {a.at?.replace("T", " ").slice(0, 16)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {auditRows.length === 0 && (
              <p className="py-8 text-center text-xs" style={{ color: C.slateSoft }}>
                No audit entries yet.
              </p>
            )}
          </div>
        </Panel>
      </AsyncPanel>
    </div>
  );
}
