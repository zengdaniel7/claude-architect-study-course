import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewStage } from "./ReviewStage";

const mocks = vi.hoisted(() => ({ completeStage: vi.fn(), fetchCards: vi.fn() }));
vi.mock("../StudioContext", () => ({ useStudio: () => ({ completeStage: mocks.completeStage, demo: true, saving: false }) }));
vi.mock("../api", () => ({ fetchPendingReview: mocks.fetchCards }));

describe("ReviewStage", () => {
  beforeEach(() => {
    mocks.completeStage.mockReset().mockResolvedValue({});
    mocks.fetchCards.mockReset().mockResolvedValue([]);
    sessionStorage.clear();
    sessionStorage.setItem("ccaf-studio-review-cards", JSON.stringify([
      { id: "one", front: "What is a file?", back: "One saved item.", source: "Lesson concept" }
    ]));
  });

  it("keeps reveal, rating, and next as separate decisions", async () => {
    const user = userEvent.setup();
    render(<ReviewStage />);
    expect(screen.queryByText("One saved item.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show answer" }));
    expect(screen.getByText("One saved item.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finish review" })).toBeDisabled();

    await user.click(screen.getByLabelText("Got it"));
    await user.click(screen.getByRole("button", { name: "Finish review" }));
    await waitFor(() => expect(mocks.completeStage).toHaveBeenCalledWith("review", {
      reviewId: "demo-review",
      reviewed: 1,
      finalGrade: "good"
    }));
  });

  it("repeats an Again card instead of finishing mastery", async () => {
    const user = userEvent.setup();
    render(<ReviewStage />);
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByLabelText("Again"));
    expect(screen.getByRole("button", { name: "Review again" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Review again" }));
    expect(screen.getByText("Card 2 of 2")).toBeInTheDocument();
    expect(mocks.completeStage).not.toHaveBeenCalled();
  });
});
