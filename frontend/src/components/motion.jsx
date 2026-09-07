import { useEffect, useRef, useState } from "react";

/**
 * Motion primitives.
 *
 * Everything here respects `prefers-reduced-motion` by resolving instantly
 * rather than animating, and every element starts from a *visible* resting
 * state — nothing is parked at opacity 0 waiting on an observer, so the page
 * is fully readable the moment it paints.
 */

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/** Entrance animation driven purely by CSS, staggered by index. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }) {
  const reduced = usePrefersReducedMotion();
  return (
    <Tag
      className={`${reduced ? "" : "nir-reveal"} ${className}`}
      style={reduced ? undefined : { animationDelay: `${delay}ms` }}
    >
      {children}
    </Tag>
  );
}

/** Staggers its children's entrance without needing per-child wiring. */
export function Stagger({ children, step = 45, className = "", start = 0 }) {
  const items = Array.isArray(children) ? children : [children];
  return (
    <div className={className}>
      {items.filter(Boolean).map((child, i) => (
        <Reveal key={child?.key ?? i} delay={start + i * step}>
          {child}
        </Reveal>
      ))}
    </div>
  );
}

/**
 * Counts to a target value with an ease-out curve.
 *
 * Uses requestAnimationFrame rather than a timer so it stays on the compositor's
 * clock, and snaps immediately when motion is reduced or the delta is trivial.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  duration = 620,
  format,
  className = "",
}) {
  const reduced = usePrefersReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = Number(value) || 0;
    if (reduced || Math.abs(to - from) < 0.005) {
      fromRef.current = to;
      setDisplay(to);
      return undefined;
    }
    const started = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - started) / duration);
      // easeOutExpo — fast start, gentle settle
      const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
      const current = from + (to - from) * eased;
      setDisplay(current);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration, reduced]);

  const shown = format
    ? format(display)
    : Number(display).toLocaleString("en-IN", {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

  return (
    <span className={`tabular-nums ${className}`} style={{ fontVariantNumeric: "tabular-nums" }}>
      {shown}
    </span>
  );
}

/** Content-shaped placeholder, so loading does not collapse the layout. */
export function Skeleton({ className = "", rounded = "rounded-md", width }) {
  return (
    <div
      className={`nir-skeleton ${rounded} ${className}`}
      style={width ? { width } : undefined}
      aria-hidden="true"
    />
  );
}

export function SkeletonPanel({ rows = 4 }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <Skeleton className="mb-4 h-3 w-32" />
      <div className="space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-3" width={`${90 - i * 9}%`} />
        ))}
      </div>
    </div>
  );
}

/**
 * Cross-fades its children whenever `routeKey` changes.
 *
 * The outgoing view is not unmounted mid-transition — React swaps children and
 * the incoming frame animates in, so navigation never flashes a blank page.
 */
export function PageTransition({ routeKey, children }) {
  const reduced = usePrefersReducedMotion();
  const [rendered, setRendered] = useState({ key: routeKey, node: children });

  useEffect(() => {
    setRendered({ key: routeKey, node: children });
  }, [routeKey, children]);

  if (reduced) return <div>{rendered.node}</div>;
  return (
    <div key={rendered.key} className="nir-page">
      {rendered.node}
    </div>
  );
}

/** Pointer-tracking highlight, kept subtle. Disabled for reduced motion. */
export function useSpotlight() {
  const ref = useRef(null);
  const reduced = usePrefersReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return undefined;
    let frame = 0;
    const onMove = (e) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      });
    };
    el.addEventListener("pointermove", onMove);
    return () => {
      el.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(frame);
    };
  }, [reduced]);
  return ref;
}
