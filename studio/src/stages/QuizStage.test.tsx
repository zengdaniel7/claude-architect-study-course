import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { manifest } from "../content";
import { QuizStage } from "./QuizStage";

const mocks = vi.hoisted(() => ({ completeStage: vi.fn() }));
vi.mock("../StudioContext", () => ({
  useStudio: () => ({ session: { unitId: "w1" }, completeStage: mocks.completeStage })
}));

describe("QuizStage", () => {
  it("hides the explanation until the learner commits and records confidence", async () => {
    const user = userEvent.setup();
    const question = manifest.banks.w1.questions[0];
    render(<QuizStage />);

    expect(screen.queryByText(question.why)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: new RegExp(question.opts[question.ans], "i") }));
    await user.click(screen.getByLabelText("I guessed"));
    await user.click(screen.getByRole("button", { name: "Check answer" }));

    expect(screen.getByText(question.why)).toBeInTheDocument();
    expect(screen.getByText(/marked as a guess/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /next question|finish quiz/i })).toBeEnabled();
  });
});
