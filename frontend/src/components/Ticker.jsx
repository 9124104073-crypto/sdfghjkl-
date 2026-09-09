import { useEffect, useRef, useState } from "react";
import { C, body } from "../theme";
import { usePrefersReducedMotion } from "./motion";

/**
 * Ticker — a seamless horizontal scroller.
 *
 * The track renders the items twice and slides by exactly -50%, so the second
 * copy arrives where the first started and the loop never shows a seam. Speed
 * is expressed in pixels per second and converted to a duration from the
 * measured track width, so a short list and a long one scroll at the same
 * pace rather than the short one racing.
 */
export function Ticker({ items = [], speed = 45, reverse = false, className = "", tone = "navy" }) {
  const reduced = usePrefersReducedMotion();
  const trackRef = useRef(null);
  const [dur, setDur] = useState(40);

  useEffect(() => {
    const el = trackRef.current;
    if (!el) return undefined;
    const measure = () => {
      const half = el.scrollWidth / 2;
      if (half > 0) setDur(Math.max(12, half / speed));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items, speed]);

  if (!items.length) return null;

  const dark = tone === "navy";
  const run = [...items, ...items];

  // With motion suppressed the ticker becomes an ordinary wrapping strip —
  // still readable, just not moving.
  if (reduced) {
    return (
      <div className={`flex flex-wrap gap-x-6 gap-y-1 overflow-hidden ${className}`} style={body}>
        {items.map((it, i) => (
          <Item key={i} item={it} dark={dark} />
        ))}
      </div>
    );
  }

  return (
    <div className={`nir-ticker relative overflow-hidden ${className}`} style={body}>
      <div
        ref={trackRef}
        className={`nir-ticker-track ${reverse ? "is-reverse" : ""}`}
        style={{ "--ticker-dur": `${dur}s` }}
      >
        {run.map((it, i) => (
          <Item key={i} item={it} dark={dark} />
        ))}
      </div>
      {/* Feathered edges so items enter and leave rather than being chopped. */}
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-12"
        style={{ background: `linear-gradient(to right, ${dark ? C.navy : C.bg}, transparent)` }}
      />
      <div
        className="pointer-events-none absolute inset-y-0 right-0 w-12"
        style={{ background: `linear-gradient(to left, ${dark ? C.navy : C.bg}, transparent)` }}
      />
    </div>
  );
}

function Item({ item, dark }) {
  const { label, value, unit, tone } = typeof item === "string" ? { label: item } : item;
  return (
    <span className="flex shrink-0 items-center gap-2 whitespace-nowrap px-5 text-xs">
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: tone || (dark ? C.lime : C.teal), flex: "none" }}
      />
      <span style={{ color: dark ? "rgba(255,255,255,0.62)" : C.slateSoft }}>{label}</span>
      {value != null && (
        <span className="font-semibold tabular-nums" style={{ color: dark ? "#fff" : C.navy }}>
          {value}
          {unit ? <span className="ml-0.5 font-normal opacity-70">{unit}</span> : null}
        </span>
      )}
    </span>
  );
}

export default Ticker;
