import api from "../api/client";
import { Ticker } from "../components/Ticker";
import { Bars3D } from "../components/three/widgets3d";
import { AsyncPanel, Card, DataStatusBadge, Tag, fmtNumber, useApi } from "../components/ui";

export default function DataLineage() {
  const { data: sources, loading, error, refetch } = useApi(() => api.dataSources(), []);
  const { data: lineage } = useApi(() => api.lineage(), []);
  const { data: providers } = useApi(() => api.providers(), []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Data &amp; Lineage</h1>
        <p className="text-sm text-slate-500">
          Every dataset carries its source, licence, verification status and demo flag, so a
          demonstration value is never mistaken for a verified government measurement.
        </p>
      </div>

      {(sources?.data || []).length > 0 && (
        <Ticker
          className="rounded-lg border border-slate-200 bg-white py-2.5"
          tone="light"
          speed={42}
          items={sources.data.map((d) => ({
            label: d.dataset_name,
            value: d.verification_status,
          }))}
        />
      )}

      <AsyncPanel loading={loading} error={error} data={sources?.data} onRetry={refetch}>
        {lineage && (
          <Card index={0}
            title="Data lineage"
            subtitle="Metric → Source → Processing → Decision engine → Output"
            actions={<DataStatusBadge status="source" />}
          >
            <div className="space-y-2">
              {lineage.data.map((row) => (
                <div
                  key={row.dataset}
                  className="rounded-lg border border-slate-200 px-3 py-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{row.metric || row.dataset}</span>
                    <span className="flex items-center gap-1.5">
                      <Tag value={row.verification_status} />
                      {row.is_demo_data && <Tag value="demo" />}
                      <span className="text-slate-400">{fmtNumber(row.record_count)} rows</span>
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <Step label="Source" value={row.source} />
                    <Arrow />
                    <Step label="Processing" value={row.processing} />
                    <Arrow />
                    <Step label="Engine" value={row.engine} tone="brand" />
                    <Arrow />
                    <Step label="Output" value={row.output} />
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-2">
          {sources && (
            <>
            <Card index={1} title="Registry volume" subtitle="Records held per dataset">
              <Bars3D
                height={215}
                data={[...sources.data]
                  .filter((s) => s.record_count)
                  .sort((a, b) => b.record_count - a.record_count)
                  .slice(0, 10)
                  .map((s) => ({ label: s.dataset_name, value: s.record_count }))}
              />
            </Card>

            <Card index={2} title={`Data-source registry (${sources.data.length})`}>
              <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                {sources.data.map((s) => (
                  <div key={s.dataset_name} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900">{s.dataset_name}</p>
                      <Tag value={s.verification_status} />
                    </div>
                    <p className="mt-0.5 text-[11px] text-slate-600">{s.source_name}</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">{s.description}</p>
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 text-[10px] text-slate-500">
                      <div>Scope: {s.geographic_scope}</div>
                      <div>Records: {fmtNumber(s.record_count)}</div>
                      <div>Licence: {s.license}</div>
                      <div>Updates: {s.update_frequency}</div>
                    </dl>
                    {s.source_url && (
                      <a
                        href={s.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-[10px] text-brand-700 underline"
                      >
                        {s.source_url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </Card>
            </>
          )}

          {providers && (
            <Card index={2}
              title="Data providers"
              subtitle="Swapping demonstration data for authoritative sources is a configuration change"
            >
              <div className="space-y-2">
                {providers.data.map((p) => (
                  <div key={p.key} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-900">{p.name}</p>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 ring-inset ${
                          p.configured
                            ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                            : "bg-slate-100 text-slate-600 ring-slate-200"
                        }`}
                      >
                        {p.configured ? "Active" : "Declared, not connected"}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-600">{p.organisation}</p>
                    <p className="mt-1 text-[11px] leading-snug text-slate-500">{p.notes}</p>
                    <p className="mt-0.5 text-[10px] text-slate-400">
                      Licence: {p.license} &middot; {p.geographic_scope}
                    </p>
                    {p.source_url && (
                      <a
                        href={p.source_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-brand-700 underline"
                      >
                        {p.source_url}
                      </a>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-900">
                NIRMAN AI does not scrape and does not fabricate a value to fill a gap. An
                unconnected provider returns nothing rather than an approximation.
              </p>
            </Card>
          )}
        </div>
      </AsyncPanel>
    </div>
  );
}

function Step({ label, value, tone }) {
  return (
    <span
      className={`rounded px-1.5 py-1 ${
        tone === "brand" ? "bg-brand-50 text-brand-800" : "bg-slate-50 text-slate-600"
      }`}
    >
      <span className="text-[9px] uppercase tracking-wide text-slate-400">{label}: </span>
      {value || "-"}
    </span>
  );
}

function Arrow() {
  return <span className="text-slate-300">&rarr;</span>;
}
