import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "./motion";

/**
 * Reveals text a few characters at a time, the way a model streams.
 *
 * The full answer has already arrived from the API — this is presentation
 * only, so it never delays the content: `onDone` fires the moment the reveal
 * catches up, and with reduced motion the text simply appears.
 */
export function StreamingText({ text = "", cps = 420, className = "", style, onDone }) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? text.length : 0);

  useEffect(() => {
    if (reduced || !text) {
      setShown(text.length);
      onDone?.();
      return undefined;
    }
    // A hidden tab gets no animation frames at all, so a reveal started there
    // would leave the answer blank indefinitely. Content must never be stuck
    // behind an effect: skip straight to the full text.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      setShown(text.length);
      onDone?.();
      return undefined;
    }

    setShown(0);
    let raf = 0;
    // Take the origin from the first frame's own timestamp rather than
    // performance.now(): the two need not share a clock, and a mismatch makes
    // the elapsed time negative, which strands the reveal at zero forever.
    let t0 = null;
    const tick = (now) => {
      if (t0 === null) t0 = now;
      const elapsed = Math.max(0, (now - t0) / 1000);
      const n = Math.min(text.length, Math.floor(elapsed * cps));
      setShown(n);
      if (n < text.length) raf = requestAnimationFrame(tick);
      else onDone?.();
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, cps, reduced]);

  const done = shown >= text.length;
  return (
    <span className={className} style={style}>
      {text.slice(0, shown)}
      {!done && <span className="nir-caret" aria-hidden="true" />}
    </span>
  );
}

export default StreamingText;
