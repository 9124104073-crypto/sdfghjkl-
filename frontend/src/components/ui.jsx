import { useCallback, useEffect, useState } from "react";
import { describeError } from "../api/client";

/** Small data-fetching hook with loading, error and refetch states. */
export function useApi(fetcher, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState(null);

  const run = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetcher(...args);
      setData(result);
      return result;
    } catch (err) {
      setError(describeError(err));
      return null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (immediate) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, immediate]);

  return { data, loading, error, refetch: run, setData };
}

export function Card({ title, subtitle, actions, children, className = "" }) {
  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            {title && <h2 className="text-sm font-semibold text-slate-900">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

const STATUS_STYLES = {
  demo: "bg-amber-50 text-amber-800 ring-amber-200",
  source: "bg-sky-50 text-sky-800 ring-sky-200",
  derived: "bg-brand-50 text-brand-800 ring-brand-200",
  ai_generated: "bg-violet-50 text-violet-800 ring-violet-200",
};

const STATUS_LABELS = {
  demo: "Demo data",
  source: "Source data",
  derived: "Derived",
  ai_generated: "AI generated",
};

/** Every number on screen says where it came from. */
export function DataStatusBadge({ status, title }) {
  if (!status) return null;
  return (
    <span
      title={title || STATUS_LABELS[status]}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        STATUS_STYLES[status] || STATUS_STYLES.demo
      }`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

const TIER_STYLES = {
  Recommended: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  "Highly Recommended": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Consider: "bg-sky-50 text-sky-800 ring-sky-200",
  "Further Assessment Required": "bg-amber-50 text-amber-800 ring-amber-200",
  "Conditionally Recommended": "bg-amber-50 text-amber-800 ring-amber-200",
  "Not Recommended": "bg-rose-50 text-rose-800 ring-rose-200",
  "High Priority": "bg-rose-50 text-rose-800 ring-rose-200",
  Approve: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Low: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  Medium: "bg-amber-50 text-amber-800 ring-amber-200",
  Moderate: "bg-amber-50 text-amber-800 ring-amber-200",
  High: "bg-orange-50 text-orange-800 ring-orange-200",
  "Very High": "bg-rose-50 text-rose-800 ring-rose-200",
  "Very Low": "bg-emerald-50 text-emerald-800 ring-emerald-200",
  NORMAL: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  WARNING: "bg-amber-50 text-amber-800 ring-amber-200",
  CRITICAL: "bg-rose-50 text-rose-800 ring-rose-200",
};

export function Tag({ value, className = "" }) {
  if (value === null || value === undefined) return <span className="text-slate-400">-</span>;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${
        TIER_STYLES[value] || "bg-slate-100 text-slate-700 ring-slate-200"
      } ${className}`}
    >
      {value}
    </span>
  );
}

export function Loading({ label = "Loading" }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-6 text-sm text-slate-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-brand-600" />
      {label}...
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-4 text-sm text-rose-800">
      <p className="font-medium">Something went wrong</p>
      <p className="mt-1 text-rose-700">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
        >
          Try again
        </button>
      )}
    </div>
  );
}

export function Empty({ message = "No data available." }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}

/** Wraps the loading/error/empty triad so pages stay readable. */
export function AsyncPanel({ loading, error, data, onRetry, empty, children }) {
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  if (!data || (Array.isArray(data) && data.length === 0)) return <Empty message={empty} />;
  return children;
}

export function StatCard({ label, value, sub, tone = "default" }) {
  const tones = {
    default: "text-slate-900",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-rose-700",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
    </div>
  );
}

/** Horizontal 0-100 bar used for scores throughout the app. */
export function ScoreBar({ value, max = 100, tone }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const color =
    tone ||
    (pct >= 83 ? "bg-emerald-500" : pct >= 75 ? "bg-sky-500" : pct >= 70 ? "bg-amber-500" : "bg-rose-500");
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Notes({ notes, disclaimer }) {
  if (!notes?.length && !disclaimer) return null;
  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
      {notes?.map((note) => (
        <p key={note} className="flex gap-2">
          <span aria-hidden="true">&bull;</span>
          <span>{note}</span>
        </p>
      ))}
      {disclaimer && <p className="mt-2 font-medium text-slate-700">{disclaimer}</p>}
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

export const selectClass =
  "mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500";

export function fmtNumber(value, digits = 0) {
  if (value === null || value === undefined) return "-";
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtCrore(value) {
  if (value === null || value === undefined) return "-";
  return `₹${fmtNumber(value, value < 100 ? 1 : 0)} Cr`;
}
