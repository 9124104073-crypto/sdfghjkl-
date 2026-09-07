import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./index.css";

/**
 * Drives the pointer-tracking sheen on .nir-spotlight surfaces.
 *
 * One passive listener for the whole document, throttled to a frame, rather
 * than a listener per card — the sheen is decoration and must never cost
 * measurable input latency.
 */
if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  let frame = 0;
  document.addEventListener(
    "pointermove",
    (event) => {
      const target = event.target instanceof Element ? event.target.closest(".nir-spotlight") : null;
      if (!target) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = target.getBoundingClientRect();
        target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
        target.style.setProperty("--my", `${event.clientY - rect.top}px`);
      });
    },
    { passive: true }
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
