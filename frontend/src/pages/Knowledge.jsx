import { useState } from "react";
import api, { describeError } from "../api/client";
import {
  AsyncPanel,
  Card,
  DataStatusBadge,
  Notes,
  StatCard,
  Tag,
  fmtNumber,
  selectClass,
  useApi,
} from "../components/ui";

const EXAMPLES = [
  "Which scheme funds a storm water drain?",
  "How are recommendation tiers decided?",
  "What contingency applies to a high risk project?",
  "Is the Chennai climate data verified?",
  "How is terrain risk calculated?",
  "What does the platform refuse to do?",
];

/**
 * Knowledge base — semantic search over the platform's own methodology,
 * scheme reference table and data registry. This is the retrieval half of
 * the RAG pipeline the Copilot uses to ground its answers.
 */
export default function Knowledge() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const { data: stats, loading, error: statsError, refetch } = useApi(() => api.knowledgeStats(), []);
  const { data: audit } = useApi(() => api.auditLog({ limit: 12 }), []);
  const { data: aiHistory } = useApi(() => api.aiHistory({ limit: 12 }), []);
  const { data: mqtt } = useApi(() => api.mqttStatus(), []);

  async function search(text) {
    const q = (text ?? query).trim();
    if (q.length < 2) return;
    setQuery(q);
    setBusy(true);
    setError(null);
    try {
      setResults(await api.knowledgeSearch({ q, top_k: 5 }));
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Knowledge base &amp; activity</h1>
        <p className="text-sm text-slate-500">
          Semantic retrieval over NIRMAN AI's own methodology, scheme reference table and data
          registry — plus the record of what the platform has actually produced.
        </p>
      </div>

      <AsyncPanel loading={loading} error={statsError} data={stats} onRetry={refetch}>
        {stats && (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <StatCard index={0} label="Sources" value={stats.sources} />
            <StatCard index={1} label="Documents" value={stats.documents} />
            <StatCard index={2} label="Chunks" value={stats.chunks} />
            <StatCard index={3} label="Embeddings" value={stats.embeddings} />
            <StatCard index={4} label="Dimensions" value={stats.dimensions} sub="per vector" />
          </div>
        )}
      </AsyncPanel>

      <Card index={0}
        title="Search the knowledge base"
        subtitle="Nothing external is scraped — retrieval covers only what the platform can vouch for"
        actions={<DataStatusBadge status="source" />}
      >
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            search();
          }}
        >
          <input
            type="search"
            className={selectClass}
            placeholder="Ask about methodology, a scheme, or a dataset"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="shrink-0 rounded-md bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50" disabled={busy}>
            {busy ? "Searching…" : "Search"}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => search(e)}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-[11px] text-slate-600 hover:border-brand-400 hover:bg-brand-50"
            >
              {e}
            </button>
          ))}
        </div>

        {error && (
          <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
            {error}
          </p>
        )}

        {results && (
          <div className="mt-4">
            {results.results.length === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                No passage passed the similarity threshold. The Copilot would answer
                “Insufficient verified data available.” rather than guess.
              </div>
            ) : (
              <div className="space-y-2">
                {results.results.map((r) => (
                  <div key={r.chunk_id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <b className="text-xs text-slate-900">{r.document}</b>
                      <span className="flex items-center gap-1.5">
                        <Tag value={r.doc_type.replaceAll("_", " ")} />
                        <Tag value={r.verification_status} />
                        <span className="font-mono text-[10px] text-slate-400">
                          {(r.similarity * 100).toFixed(0)}% match
                        </span>
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{r.excerpt}</p>
                    <p className="mt-1 text-[10px] text-slate-400">
                      Source: {r.source || "—"}
                      {r.source_url && (
                        <>
                          {" · "}
                          <a href={r.source_url} target="_blank" rel="noreferrer" className="underline">
                            portal
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                ))}
              </div>
            )}
            <Notes notes={results.notes} />
          </div>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card index={1} title="Recent AI output" subtitle="Persisted engine and Copilot results" actions={<DataStatusBadge status="ai_generated" />}>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {(aiHistory?.data || []).map((r) => (
              <div key={r.id} className="rounded-md bg-slate-50 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <b className="text-[11px]">{r.recommendation_type.replaceAll("_", " ")}</b>
                  <span className="font-mono text-[10px] text-slate-400">
                    {r.recorded_at.slice(11, 19)}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500">
                  {r.entity_type} {r.entity_id} · provider {r.provider || "—"}
                </p>
              </div>
            ))}
            {!aiHistory?.data?.length && (
              <p className="py-6 text-center text-xs text-slate-500">
                Nothing recorded yet. Run a recommendation or generate a DPR.
              </p>
            )}
          </div>
        </Card>

        <Card index={2} title="Audit trail" subtitle="What the platform was asked to do">
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {(audit?.data || []).map((a) => (
              <div key={a.id} className="rounded-md bg-slate-50 px-2.5 py-1.5">
                <div className="flex items-center justify-between gap-2">
                  <b className="font-mono text-[11px]">{a.action}</b>
                  <span className="font-mono text-[10px] text-slate-400">{a.at.slice(11, 19)}</span>
                </div>
                {a.detail && <p className="text-[10px] text-slate-500">{a.detail}</p>}
              </div>
            ))}
            {!audit?.data?.length && (
              <p className="py-6 text-center text-xs text-slate-500">No audit entries yet.</p>
            )}
          </div>
        </Card>

        <Card index={3} title="MQTT ingestion" subtitle="ESP32 → broker → Risk engine">
          {mqtt ? (
            <>
              <div className="flex items-center gap-2">
                <Tag value={mqtt.connected ? "NORMAL" : mqtt.configured ? "WARNING" : "—"} />
                <span className="text-xs text-slate-600">
                  {mqtt.connected
                    ? "Connected"
                    : mqtt.configured
                      ? "Configured, not connected"
                      : "No broker configured"}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-slate-500">Broker</dt>
                <dd className="text-right font-medium">{mqtt.broker_url || "—"}</dd>
                <dt className="text-slate-500">Topic</dt>
                <dd className="text-right font-mono text-[11px]">{mqtt.topic || "—"}</dd>
                <dt className="text-slate-500">Messages</dt>
                <dd className="text-right tabular-nums">{fmtNumber(mqtt.messages_received)}</dd>
                <dt className="text-slate-500">Accepted</dt>
                <dd className="text-right tabular-nums">{fmtNumber(mqtt.readings_accepted)}</dd>
                <dt className="text-slate-500">Rejected</dt>
                <dd className="text-right tabular-nums">{fmtNumber(mqtt.readings_rejected)}</dd>
              </dl>
              <Notes notes={mqtt.notes} />
            </>
          ) : (
            <p className="text-xs text-slate-500">Checking broker status…</p>
          )}
        </Card>
      </div>
    </div>
  );
}
