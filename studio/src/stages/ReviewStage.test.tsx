import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ReviewStage } from "./ReviewStage";

const card = { id: "one", front: "What is a file?", back: "One saved item.", source: "Lesson concept" };
const mocks = vi.hoisted(() => ({ rateReviewCard: vi.fn(), fetchCards: vi.fn(), demo: true }));
vi.mock("../StudioContext", () => ({ useStudio: () => ({ rateReviewCard: mocks.rateReviewCard, demo: mocks.demo, saving: false }) }));
vi.mock("../api", () => ({ fetchPendingReview: mocks.fetchCards }));

function savedRating(overrides: Record<string, unknown> = {}) {
  return {
    ratingId: "11111111-1111-4111-8111-111111111111",
    reviewId: "demo-review",
    cardId: "one",
    rating: "good",
    repeat: false,
    reviewComplete: true,
    remaining: 0,
    queue: [],
    session: {},
    feedback: {},
    stateVersion: 1,
    ...overrides
  };
}

describe("ReviewStage", () => {
  beforeEach(() => {
    mocks.demo = true;
    mocks.rateReviewCard.mockReset().mockResolvedValue(savedRating());
    mocks.fetchCards.mockReset().mockResolvedValue(null);
  });

  it("persists one selected rating instead of submitting a packet-wide review", async () => {
    const user = userEvent.setup();
    render(<ReviewStage />);
    expect(screen.queryByText("One saved item.")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByLabelText("Got it"));
    await user.click(screen.getByRole("button", { name: "Save rating" }));

    await waitFor(() => expect(mocks.rateReviewCard).toHaveBeenCalledTimes(1));
    const [reviewId, cardId, rating, elapsedMs, ratingId] = mocks.rateReviewCard.mock.calls[0];
    expect({ reviewId, cardId, rating }).toEqual({ reviewId: "demo-review", cardId: "w1-preview", rating: "good" });
    expect(elapsedMs).toEqual(expect.any(Number));
    expect(ratingId).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.queryByText(/finalGrade|reviewed/i)).not.toBeInTheDocument();
  });

  it("uses the returned queue for Again instead of mutating a client packet", async () => {
    mocks.rateReviewCard.mockResolvedValueOnce(savedRating({
      cardId: "w1-preview",
      rating: "again",
      repeat: true,
      reviewComplete: false,
      remaining: 1,
      queue: [{ id: "w1-preview", front: "What is a file?", back: "One saved item.", source: "Lesson concept", repetitions: 1 }]
    }));
    const user = userEvent.setup();
    render(<ReviewStage />);

    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByLabelText("Again"));
    await user.click(screen.getByRole("button", { name: "Save rating" }));

    await waitFor(() => expect(mocks.rateReviewCard).toHaveBeenCalledWith(
      "demo-review", "w1-preview", "again", expect.any(Number), expect.any(String), expect.any(Array)
    ));
    expect(screen.getByText("1 card due")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show answer" })).toBeInTheDocument();
  });

  it("reloads an Again card from the server queue", async () => {
    mocks.demo = false;
    mocks.fetchCards.mockResolvedValueOnce({
      reviewId: "server-review",
      cards: [{ ...card, repetitions: 1 }]
    });
    render(<ReviewStage />);

    expect(await screen.findByText("What is a file?")).toBeInTheDocument();
    expect(mocks.rateReviewCard).not.toHaveBeenCalled();
  });

  it("reuses one rating ID when an ambiguous save is retried", async () => {
    mocks.rateReviewCard.mockResolvedValueOnce(null).mockResolvedValueOnce(savedRating());
    const user = userEvent.setup();
    render(<ReviewStage />);
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByLabelText("Got it"));
    await user.click(screen.getByRole("button", { name: "Save rating" }));
    await screen.findByRole("alert");
    await user.click(screen.getByRole("button", { name: "Retry rating" }));

    await waitFor(() => expect(mocks.rateReviewCard).toHaveBeenCalledTimes(2));
    expect(mocks.rateReviewCard.mock.calls[1][4]).toBe(mocks.rateReviewCard.mock.calls[0][4]);
    expect(mocks.rateReviewCard.mock.calls[1][3]).toBe(mocks.rateReviewCard.mock.calls[0][3]);
  });

  it("moves focus to a saved review confirmation", async () => {
    const user = userEvent.setup();
    render(<ReviewStage />);
    await user.click(screen.getByRole("button", { name: "Show answer" }));
    await user.click(screen.getByLabelText("Got it"));
    await user.click(screen.getByRole("button", { name: "Save rating" }));

    const confirmation = await screen.findByText("Review saved.");
    await waitFor(() => expect(confirmation.parentElement).toHaveFocus());
  });
});
