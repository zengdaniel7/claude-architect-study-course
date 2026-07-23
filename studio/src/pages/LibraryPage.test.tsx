import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { manifest } from "../content";
import { LibraryPage } from "./LibraryPage";

vi.mock("../StudioContext", () => ({ useStudio: () => ({ session: { unitId: "w1" } }) }));

function renderLibrary() {
  return render(<MemoryRouter><LibraryPage /></MemoryRouter>);
}

describe("LibraryPage", () => {
  it("shows the current lesson and the complete course directory", () => {
    renderLibrary();
    expect(screen.getByRole("heading", { name: "Study library" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Files, folders, and plain text" })).toBeInTheDocument();
    expect(screen.getByText("23", { selector: "dd" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: `Videos ${manifest.media.videos.length}` })).toBeInTheDocument();
    expect(screen.getByText("JSON by hand")).toBeInTheDocument();
  });

  it("searches lesson folders by topic", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.type(screen.getByRole("textbox", { name: "Search library" }), "MCP");
    expect(screen.getByText("An MCP server")).toBeInTheDocument();
    expect(screen.queryByText("JSON by hand")).not.toBeInTheDocument();
  });

  it("exposes reviewed lesson clips and extra videos without unofficial exam coaching", async () => {
    const user = userEvent.setup();
    renderLibrary();
    await user.click(screen.getByRole("tab", { name: `Videos ${manifest.media.videos.length}` }));
    expect(screen.getByText("Agentic Loops and stop_reason Explained")).toBeInTheDocument();
    expect(screen.getByText("Multi-Agent System in Python and Claude SDK | Hands On")).toBeInTheDocument();
    expect(screen.queryByText("Exam Questions Solved and Exam Traps")).not.toBeInTheDocument();
    expect(screen.getByText(/Community video collection/)).toBeInTheDocument();
  });
});
