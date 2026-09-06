import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { describeError } from "../api/client";
import { DataModeProvider, DataModeToggle, VerifiedOnlyNotice } from "../components/DataMode";
import { AsyncPanel, DataStatusBadge, ScoreBar, Tag, fmtCrore, fmtNumber } from "../components/ui";

function withProviders(ui) {
  return (
    <DataModeProvider>
      <MemoryRouter>{ui}</MemoryRouter>
    </DataModeProvider>
  );
}

beforeEach(() => {
  localStorage.clear();
});

describe("data-status labelling", () => {
  // The platform's central promise: a demonstration value is never shown
  // without saying so.
  it.each([
    ["demo", "Demo data"],
    ["source", "Source data"],
    ["derived", "Derived"],
    ["ai_generated", "AI generated"],
  ])("renders %s as %s", (status, label) => {
    render(<DataStatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders nothing when no status is supplied", () => {
    const { container } = render(<DataStatusBadge status={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("Tag", () => {
  it("shows an em dash for a missing value rather than blank", () => {
    render(<Tag value={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the recommendation tier text", () => {
    render(<Tag value="Recommended" />);
    expect(screen.getByText("Recommended")).toBeInTheDocument();
  });
});

describe("ScoreBar", () => {
  it("clamps a score above 100 to full width", () => {
    const { container } = render(<ScoreBar value={140} />);
    expect(container.firstChild.firstChild).toHaveStyle({ width: "100%" });
  });

  it("clamps a negative score to zero width", () => {
    const { container } = render(<ScoreBar value={-20} />);
    expect(container.firstChild.firstChild).toHaveStyle({ width: "0%" });
  });
});

describe("number formatting", () => {
  it("formats Indian-grouped integers", () => {
    expect(fmtNumber(185000)).toBe("1,85,000");
  });

  it("shows an em dash rather than NaN for missing values", () => {
    expect(fmtNumber(null)).toBe("—");
    expect(fmtCrore(undefined)).toBe("—");
  });

  it("formats crore values with the rupee symbol", () => {
    expect(fmtCrore(120)).toContain("120");
    expect(fmtCrore(120)).toContain("Cr");
  });
});

describe("AsyncPanel", () => {
  it("shows a loading state first", () => {
    render(
      <AsyncPanel loading error={null} data={null}>
        <p>content</p>
      </AsyncPanel>
    );
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  it("shows an actionable error with a retry", async () => {
    const onRetry = vi.fn();
    render(
      <AsyncPanel loading={false} error="Cannot reach the backend" data={null} onRetry={onRetry}>
        <p>content</p>
      </AsyncPanel>
    );
    expect(screen.getByText("Cannot reach the backend")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("shows an empty state for an empty list", () => {
    render(
      <AsyncPanel loading={false} error={null} data={[]} empty="No sites matched">
        <p>content</p>
      </AsyncPanel>
    );
    expect(screen.getByText("No sites matched")).toBeInTheDocument();
  });

  it("renders children once data arrives", () => {
    render(
      <AsyncPanel loading={false} error={null} data={[1]}>
        <p>content</p>
      </AsyncPanel>
    );
    expect(screen.getByText("content")).toBeInTheDocument();
  });
});

describe("Demo / Verified data mode", () => {
  it("defaults to demo mode and switches on click", async () => {
    render(withProviders(<DataModeToggle />));
    const verified = screen.getByRole("button", { name: "Verified" });
    expect(screen.getByRole("button", { name: "Demo" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(verified);
    await waitFor(() => expect(verified).toHaveAttribute("aria-pressed", "true"));
  });

  it("hides demonstration content behind an explanatory notice", async () => {
    render(
      withProviders(
        <>
          <DataModeToggle />
          <VerifiedOnlyNotice dataset="The candidate-site inventory" />
        </>
      )
    );
    expect(screen.queryByText(/Verified-only mode/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Verified" }));
    expect(await screen.findByText(/Verified-only mode/i)).toBeInTheDocument();
    // It must explain, not silently substitute a number.
    expect(screen.getByText(/hidden here rather than substituted/i)).toBeInTheDocument();
  });

  it("remembers the choice across mounts", async () => {
    const { unmount } = render(withProviders(<DataModeToggle />));
    await userEvent.click(screen.getByRole("button", { name: "Verified" }));
    unmount();

    render(withProviders(<DataModeToggle />));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Verified" })).toHaveAttribute("aria-pressed", "true")
    );
  });
});

describe("error messages", () => {
  it("explains an unreachable backend instead of showing a stack trace", () => {
    expect(describeError({ message: "Network Error" })).toMatch(/Cannot reach the NIRMAN AI backend/);
  });

  it("surfaces the weight-validation message from the API", () => {
    const err = {
      response: { status: 422, data: { error: "invalid_weights", detail: "Weights must total 100% (got 90.00%)." } },
    };
    expect(describeError(err)).toBe("Weights must total 100% (got 90.00%).");
  });

  it("reports a timeout in plain language", () => {
    expect(describeError({ code: "ECONNABORTED" })).toMatch(/timed out/);
  });

  it("passes through a 404 detail", () => {
    expect(describeError({ response: { status: 404, data: { detail: "Site 999 not found." } } })).toBe(
      "Site 999 not found."
    );
  });
});
