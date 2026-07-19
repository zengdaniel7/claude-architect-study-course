import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArchivePage } from "./ArchivePage";

const mocks = vi.hoisted(() => ({ mastered: true }));
vi.mock("../StudioContext", () => ({ useStudio: () => ({ session: { mastery: mocks.mastered ? "mastered" : "practiced" } }) }));

describe("ArchivePage", () => {
  it("offers one disclosed Week 2 archive action after W1 mastery", () => {
    render(<ArchivePage />);
    const link = screen.getByRole("link", { name: "Continue to Week 2 archive" });
    expect(link).toHaveAttribute("href", "/legacy/notes.html?unit=w2");
    expect(screen.getByText("Opens legacy archive.")).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("does not offer Week 2 before W1 is mastered", () => {
    mocks.mastered = false;
    render(<ArchivePage />);
    expect(screen.queryByRole("link", { name: "Continue to Week 2 archive" })).not.toBeInTheDocument();
  });
});
