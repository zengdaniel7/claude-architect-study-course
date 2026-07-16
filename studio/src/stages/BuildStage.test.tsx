import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BuildStage } from "./BuildStage";

const mocks = vi.hoisted(() => ({ completeStage: vi.fn() }));
vi.mock("../StudioContext", () => ({ useStudio: () => ({ completeStage: mocks.completeStage }) }));

describe("BuildStage prerequisite bridge", () => {
  it("explains the boundary before opening the editor", async () => {
    const user = userEvent.setup();
    render(<BuildStage />);

    expect(screen.getByRole("heading", { name: /learning the file, not JSON punctuation/i })).toBeInTheDocument();
    expect(screen.getByText(/W2 teaches JSON/i)).toBeInTheDocument();
    expect(screen.queryByText(/replace the blank/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open the practice workbench/i }));
    expect(await screen.findByRole("heading", { name: /inspect one complete text file/i })).toBeInTheDocument();
  });
});
