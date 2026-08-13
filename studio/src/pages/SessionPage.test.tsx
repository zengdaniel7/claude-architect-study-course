import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { buildStages } from "../content";
import { SessionPage } from "./SessionPage";

vi.mock("../stages/LearnStage", () => ({ LearnStage: () => <div>learn-stage-content</div> }));
vi.mock("../stages/DrawStage", () => ({ DrawStage: () => <div>draw-stage-content</div> }));
vi.mock("../stages/BuildStage", () => ({ BuildStage: () => <div>build-stage-content</div> }));
vi.mock("../stages/TeachStage", () => ({ TeachStage: () => <div>teach-stage-content</div> }));
vi.mock("../stages/QuizStage", () => ({ QuizStage: () => <div>quiz-stage-content</div> }));
vi.mock("../stages/ReviewStage", () => ({ ReviewStage: () => <div>review-stage-content</div> }));
vi.mock("../components/organisms/TutorDrawer", () => ({ TutorDrawer: () => null }));
vi.mock("../components/molecules/FeedbackBanner", () => ({ FeedbackBanner: () => null }));
vi.mock("../StudioContext", () => ({
  useStudio: () => ({
    loading: false,
    session: {
      unitId: "w1",
      title: "Files, folders, and plain text",
      stage: "draw",
      stageIndex: 1,
      stages: buildStages(1),
      progressPercent: 17,
      mastery: "practiced",
      dueReviews: 0,
      stateVersion: 3,
      manifestHash: "test"
    }
  })
}));

describe("SessionPage look-back", () => {
  it("shows today's stage by default with no look-back banner", () => {
    render(<SessionPage />);
    expect(screen.getByText("draw-stage-content")).toBeInTheDocument();
    expect(screen.queryByText(/Looking back/)).toBeNull();
  });

  it("lets the learner re-read a finished step read-only and return", async () => {
    const user = userEvent.setup();
    render(<SessionPage />);
    await user.click(screen.getByRole("button", { name: "Look back at the finished Learn step" }));
    expect(screen.getByText("learn-stage-content")).toBeInTheDocument();
    expect(screen.queryByText("draw-stage-content")).toBeNull();
    // The finished step renders inside a disabled fieldset so nothing can be resubmitted.
    const fieldset = screen.getByRole("group", { name: "Finished Learn step, read-only" });
    expect(fieldset).toBeDisabled();
    expect(screen.getByText(/Looking back at Learn/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to today's step" }));
    expect(screen.getByText("draw-stage-content")).toBeInTheDocument();
    expect(screen.queryByText(/Looking back/)).toBeNull();
  });
});
