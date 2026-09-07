import { useCallback, useEffect, useState } from "react";
import { AnimatedNumber, Skeleton } from "./motion";
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

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  interactive = false,
  index = 0,
}) {
  return (
    <section
      className={`nir-reveal rounded-xl border border-slate-200 bg-white shadow-sm nir-spotlight ${
        interactive ? "nir-interactive" : ""
      } ${className}`}
      style={{ animationDelay: `${index * 65}ms` }}
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
  if (value === null || value === undefined) return <span className="text-slate-400">—</span>;
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

export function Loading({ label = "Loading", rows = 3 }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" role="status" aria-live="polite">
      <div className="mb-4 flex items-center gap-2.5 text-xs text-slate-500">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-200 border-t-brand-600" />
        {label}…
      </div>
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-3" width={`${92 - i * 11}%`} />
        ))}
      </div>
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
          className="btn-press nir-interactive mt-3 rounded-md bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
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

export function StatCard({ label, value, sub, tone = "default", animate = true, index = 0 }) {
  const tones = {
    default: "text-slate-900",
    good: "text-emerald-700",
    warn: "text-amber-700",
    bad: "text-rose-700",
  };
  const numeric = typeof value === "number" ? value : null;
  return (
    <div
      className={`stat-tile tone-${tone} nir-interactive nir-spotlight nir-reveal rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm`}
      style={{ animationDelay: `${index * 55}ms` }}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${tones[tone]}`}>
        {animate && numeric !== null ? <AnimatedNumber value={numeric} /> : value}
      </p>
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
      <div
        className={`bar-grow h-full rounded-full ${color}`}
        style={{ width: `${pct}%`, transition: "width var(--dur-slow) var(--ease-out)" }}
      />
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
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function fmtCrore(value) {
  if (value === null || value === undefined) return "—";
  return `₹${fmtNumber(value, value < 100 ? 1 : 0)} Cr`;
}

/**
 * Donut chart drawn directly as SVG arcs.
 *
 * Replaces Recharts' <Pie>, which renders no sectors under Recharts 3.10 in
 * this layout. Hand-drawing is also cheaper: one path per slice, no chart
 * runtime, and it animates with a plain CSS transition.
 */
export function Donut({ data, size = 150, thickness = 22, ariaLabel = "Distribution" }) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const outer = size / 2 - 2;
  const inner = outer - thickness;
  let angle = -Math.PI / 2; // start at 12 o'clock

  const arcs = data.map((slice) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const end = angle + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const point = (a, r) => [
      (size / 2 + r * Math.cos(a)).toFixed(2),
      (size / 2 + r * Math.sin(a)).toFixed(2),
    ];
    const [x0, y0] = point(angle, outer);
    const [x1, y1] = point(end, outer);
    const [x2, y2] = point(end, inner);
    const [x3, y3] = point(angle, inner);
    const d = `M${x0},${y0} A${outer},${outer} 0 ${large} 1 ${x1},${y1} L${x2},${y2} A${inner},${inner} 0 ${large} 0 ${x3},${y3} Z`;
    angle = end;
    return { ...slice, d, pct: (slice.value / total) * 100 };
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      role="img"
      aria-label={ariaLabel}
    >
      {arcs.map((arc) => (
        <path key={arc.name} d={arc.d} fill={arc.color}>
          <title>{`${arc.name}: ${arc.value} (${arc.pct.toFixed(0)}%)`}</title>
        </path>
      ))}
    </svg>
  );
}
