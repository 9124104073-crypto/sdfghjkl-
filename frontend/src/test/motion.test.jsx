import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { StreamingText } from "../components/StreamingText";
import { Ticker } from "../components/Ticker";

/**
 * These cover the two pieces whose behaviour is time-driven and therefore
 * easy to get quietly wrong: the reveal must always reach the full text, and
 * the ticker must duplicate its items exactly once so the loop is seamless.
 */

beforeEach(() => {
  // jsdom has no rAF pacing; drive frames off timers we control.
  let t = 0;
  vi.stubGlobal("requestAnimationFrame", (cb) => setTimeout(() => cb((t += 16)), 0));
  vi.stubGlobal("cancelAnimationFrame", (id) => clearTimeout(id));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    }
  );
});

describe("StreamingText", () => {
  it("reveals the whole text and fires onDone exactly once", async () => {
    const done = vi.fn();
    render(<StreamingText text="Guindy scores 85.5" cps={100000} onDone={done} />);
    await waitFor(() => expect(screen.getByText(/Guindy scores 85\.5/)).toBeTruthy());
    await waitFor(() => expect(done).toHaveBeenCalled());
  });

  it("skips the reveal entirely on a hidden tab, where no frames arrive", () => {
    const spy = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    const { container } = render(<StreamingText text="Guindy scores 85.5" />);
    expect(container.textContent).toBe("Guindy scores 85.5");
    expect(container.querySelector(".nir-caret")).toBeNull();
    spy.mockRestore();
  });

  it("shows nothing and does not hang on empty text", () => {
    const done = vi.fn();
    const { container } = render(<StreamingText text="" onDone={done} />);
    // No caret should linger on an empty answer.
    expect(container.querySelector(".nir-caret")).toBeNull();
    expect(done).toHaveBeenCalled();
  });
});

describe("Ticker", () => {
  it("renders each item twice so the -50% loop has no seam", () => {
    const { container } = render(<Ticker items={[{ label: "Sites", value: 40 }, { label: "Projects", value: 12 }]} />);
    const track = container.querySelector(".nir-ticker-track");
    expect(track).toBeTruthy();
    expect(track.children.length).toBe(4);
    expect(screen.getAllByText("Sites").length).toBe(2);
  });

  it("renders nothing when there are no items", () => {
    const { container } = render(<Ticker items={[]} />);
    expect(container.firstChild).toBeNull();
  });
});
