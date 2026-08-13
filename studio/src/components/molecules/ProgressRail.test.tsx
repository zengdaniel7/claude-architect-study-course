import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildStages } from "../../content";
import { ProgressRail } from "./ProgressRail";

describe("ProgressRail", () => {
  it("announces progress and the one current stage", () => {
    render(<ProgressRail stages={buildStages(2)} percent={33} />);
    expect(screen.getByRole("progressbar", { name: "Lesson completion" })).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByText("Build").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });

  it("stays non-interactive when no look-back handler is given", () => {
    render(<ProgressRail stages={buildStages(2)} percent={33} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("lets the learner look back at finished steps only", async () => {
    const user = userEvent.setup();
    const onSelectStage = vi.fn();
    render(<ProgressRail stages={buildStages(2)} percent={33} viewedStage={null} onSelectStage={onSelectStage} />);
    // Two completed steps become buttons; current and upcoming steps do not.
    expect(screen.getAllByRole("button")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "Look back at the finished Learn step" }));
    expect(onSelectStage).toHaveBeenCalledWith("learn");
    expect(screen.queryByRole("button", { name: /Build/ })).toBeNull();
  });

  it("offers a way back to today's step while looking back", async () => {
    const user = userEvent.setup();
    const onSelectStage = vi.fn();
    render(<ProgressRail stages={buildStages(2)} percent={33} viewedStage="learn" onSelectStage={onSelectStage} />);
    expect(screen.getByRole("button", { name: "Look back at the finished Learn step" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Return to today's Build step" }));
    expect(onSelectStage).toHaveBeenCalledWith(null);
  });
});
