import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import api, { describeError } from "../api/client";
import { TypingDots } from "../components/widgets";
import { Card, DataStatusBadge, Tag, useApi } from "../components/ui";

export default function Copilot() {
  const [question, setQuestion] = useState("");
  const [thread, setThread] = useState([]);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const { data: suggestions } = useApi(() => api.copilotSuggestions(), []);

  async function ask(text) {
    const q = (text ?? question).trim();
    if (q.length < 3 || busy) return;
    setBusy(true);
    setQuestion("");
    setThread((t) => [...t, { role: "user", text: q }]);
    try {
      const answer = await api.copilot({ question: q });
      setThread((t) => [...t, { role: "assistant", ...answer }]);
    } catch (err) {
      setThread((t) => [...t, { role: "error", text: describeError(err) }]);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">NIRMAN Copilot</h1>
        <p className="text-sm text-slate-500">
          Ask in plain language. The Copilot explains results the decision engines produced — it
          never invents scores, costs, schemes, coordinates or regulations.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-4">
        <Card title="Try asking" className="lg:col-span-1">
          <ul className="space-y-1.5">
            {(suggestions?.data || []).map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => ask(s)}
                  className="w-full rounded-md border border-slate-200 px-2.5 py-2 text-left text-[11px] leading-snug text-slate-700 transition hover:border-brand-400 hover:bg-brand-50"
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
            Flow: question &rarr; intent detection &rarr; NIRMAN decision engines &rarr; sourced
            answer. The provider (mock, local or hosted) is selected server-side and the frontend
            never knows which is active.
          </p>
        </Card>

        <Card className="lg:col-span-3" title="Conversation">
          <div className="max-h-[520px] space-y-4 overflow-y-auto pr-1">
            {thread.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-xs text-slate-500">
                Ask a question, or pick one of the suggestions.
              </p>
            )}

            {thread.map((message, index) => {
              if (message.role === "user") {
                return (
                  <div key={index} className="flex justify-end">
                    <p className="max-w-[80%] rounded-lg rounded-br-sm bg-brand-700 px-3 py-2 text-sm text-white">
                      {message.text}
                    </p>
                  </div>
                );
              }
              if (message.role === "error") {
                return (
                  <div
                    key={index}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800"
                  >
                    {message.text}
                  </div>
                );
              }
              return (
                <div key={index} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <DataStatusBadge status={message.data_status} />
                    {message.intent && <Tag value={message.intent.replaceAll("_", " ")} />}
                    <span className="text-[10px] text-slate-400">
                      provider: {message.provider}
                    </span>
                    {message.confidence != null && (
                      <span className="text-[10px] text-slate-400">
                        confidence: {message.confidence}%
                      </span>
                    )}
                  </div>

                  <p className="text-sm leading-relaxed text-slate-800">{message.answer}</p>

                  {message.actions?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {message.actions.map((action) => (
                        <Link
                          key={action.label}
                          to={action.target}
                          className="rounded-full border border-brand-300 bg-white px-2.5 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
                        >
                          {action.label} &rarr;
                        </Link>
                      ))}
                    </div>
                  )}

                  {message.sources?.length > 0 && (
                    <div className="mt-3 border-t border-slate-200 pt-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        Sources
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {message.sources.map((source) => (
                          <li key={source.dataset} className="text-[11px] text-slate-600">
                            {source.source}{" "}
                            <Tag value={source.verification_status} />
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {message.notes?.length > 0 && (
                    <p className="mt-2 text-[10px] leading-snug text-slate-400">
                      {message.notes.join(" ")}
                    </p>
                  )}
                </div>
              );
            })}

            {busy && <TypingDots />}
          </div>

          <form
            className="mt-4 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              ask();
            }}
          >
            <input
              ref={inputRef}
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which area is best for a new fire station?"
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
            <button
              type="submit"
              disabled={busy || question.trim().length < 3}
              className="rounded-md bg-brand-700 px-5 py-2 text-sm font-medium text-white hover:bg-brand-800 disabled:opacity-50"
            >
              Ask
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
