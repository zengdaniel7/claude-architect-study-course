import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { buildStages } from "../../content";
import { ProgressRail } from "./ProgressRail";

describe("ProgressRail", () => {
  it("announces progress and the one current stage", () => {
    render(<ProgressRail stages={buildStages(2)} percent={33} />);
    expect(screen.getByRole("progressbar", { name: "Lesson completion" })).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByText("Build").closest("li")).toHaveAttribute("aria-current", "step");
    expect(screen.getAllByRole("listitem")).toHaveLength(6);
  });
});
