import { useState } from "react";
import api from "../api/client";
import { Bars3D } from "../components/three/widgets3d";
import { Ticker } from "../components/Ticker";
import { AsyncPanel, Card, DataStatusBadge, Field, Notes, Tag, selectClass, useApi } from "../components/ui";

export default function Schemes() {
  const [query, setQuery] = useState("");
  const [lookupType, setLookupType] = useState("Drainage");

  const { data, loading, error, refetch } = useApi(() => api.schemes(), []);
  const { data: lookup, refetch: runLookup } = useApi(
    () => api.recommendScheme({ project_type: lookupType }),
    [lookupType],
    { immediate: false }
  );

  const recommendations = (data?.recommendations || []).filter((r) => {
    if (!query) return true;
    const needle = query.toLowerCase();
    return (
      r.area.toLowerCase().includes(needle) ||
      r.proposed_project.toLowerCase().includes(needle) ||
      r.scheme_name.toLowerCase().includes(needle)
    );
  });

  const projectTypes = [
    ...new Set((data?.schemes || []).flatMap((s) => s.eligible_project_types)),
  ].sort();

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Government Schemes</h1>
        <p className="text-sm text-slate-500">
          Funding routes are selected from a curated reference table. A language model is never
          allowed to name a scheme.
        </p>
      </div>

      <AsyncPanel loading={loading} error={error} data={data?.schemes} onRetry={refetch}>
        {data && (
          <>
            <Card index={0}
              title="Scheme lookup"
              subtitle="Match any project type against the reference table"
            >
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Project type">
                  <select
                    className={selectClass}
                    value={lookupType}
                    onChange={(e) => setLookupType(e.target.value)}
                  >
                    {projectTypes.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => runLookup()}
                    className="rounded-md bg-brand-700 px-4 py-2 text-xs font-medium text-white hover:bg-brand-800"
                  >
                    Find schemes
                  </button>
                </div>
              </div>

              {lookup && (
                <div className="mt-4">
                  {lookup.matched ? (
                    <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3">
                      <p className="text-sm font-semibold text-brand-900">
                        {lookup.primary.scheme_name}
                      </p>
                      <p className="text-xs text-brand-800">{lookup.primary.ministry}</p>
                      <p className="mt-2 text-xs text-slate-700">{lookup.primary.reason}</p>
                      <p className="mt-1 text-xs text-slate-600">{lookup.primary.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
                        <Tag value={`${lookup.primary.match_confidence}% match`} />
                        <Tag value={lookup.primary.verification_status} />
                        {lookup.primary.source_url && (
                          <a
                            href={lookup.primary.source_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-brand-700 underline"
                          >
                            Official portal
                          </a>
                        )}
                      </div>
                      {lookup.alternatives.length > 0 && (
                        <p className="mt-2 text-[11px] text-slate-600">
                          Alternatives:{" "}
                          {lookup.alternatives.map((a) => a.scheme_name).join(", ")}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                      {lookup.notes.join(" ")}
                    </div>
                  )}
                </div>
              )}
            </Card>

            <Ticker
              className="mt-5 rounded-lg border border-slate-200 bg-white py-2.5"
              tone="light"
              speed={46}
              items={data.schemes.map((s) => ({ label: s.scheme_name }))}
            />

            <Card index={1} className="mt-5" title="Scheme uptake" subtitle="Proposed projects matched to each scheme">
              <Bars3D
                height={215}
                data={Object.entries(
                  recommendations.reduce((acc, r) => {
                    acc[r.scheme_name] = (acc[r.scheme_name] || 0) + 1;
                    return acc;
                  }, {})
                )
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 10)
                  .map(([label, value]) => ({ label, value }))}
              />
            </Card>

            <div className="mt-5 grid gap-5 lg:grid-cols-5">
              <Card index={2}
                title={`Project mappings (${recommendations.length})`}
                className="lg:col-span-3"
                actions={<DataStatusBadge status="derived" />}
              >
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Filter by area, project or scheme"
                  className={selectClass}
                />
                <div className="mt-3 max-h-[520px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-white">
                      <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wide text-slate-500">
                        <th className="pb-2 pr-2">Area</th>
                        <th className="pb-2 pr-2">Proposed project</th>
                        <th className="pb-2 pr-2">Recommended scheme</th>
                        <th className="pb-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recommendations.map((r) => (
                        <tr key={`${r.area}-${r.proposed_project}`} className="border-b border-slate-50">
                          <td className="py-2 pr-2 text-slate-600">{r.area}</td>
                          <td className="py-2 pr-2 font-medium text-slate-900">
                            {r.proposed_project}
                          </td>
                          <td className="py-2 pr-2 text-slate-700">{r.scheme_name}</td>
                          <td className="py-2">
                            <Tag value={r.verification_status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {recommendations.length === 0 && (
                    <p className="py-6 text-center text-xs text-slate-500">
                      No mappings match that filter.
                    </p>
                  )}
                </div>
              </Card>

              <Card index={2}
                title={`Scheme reference (${data.schemes.length})`}
                className="lg:col-span-2"
                actions={<DataStatusBadge status="source" />}
              >
                <div className="max-h-[560px] space-y-3 overflow-y-auto pr-1">
                  {data.schemes.map((s) => (
                    <div key={s.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                      <p className="text-xs font-semibold text-slate-900">{s.scheme_name}</p>
                      <p className="text-[11px] text-slate-500">{s.ministry}</p>
                      <p className="mt-1 text-[11px] leading-snug text-slate-600">{s.description}</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {s.eligible_project_types.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      {s.source_url && (
                        <a
                          href={s.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1.5 inline-block text-[10px] text-brand-700 underline"
                        >
                          {s.source_url}
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            <Notes notes={data.notes} />
          </>
        )}
      </AsyncPanel>
    </div>
  );
}
