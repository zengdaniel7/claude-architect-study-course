import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FrontierInboxPage } from "./FrontierInboxPage";

const mocks = vi.hoisted(() => ({ demo: false, fetchInbox: vi.fn(), fetchDetail: vi.fn(), decide: vi.fn() }));
vi.mock("../StudioContext", () => ({ useStudio: () => ({ demo: mocks.demo }) }));
vi.mock("../api", () => ({ fetchFrontierInbox: mocks.fetchInbox, fetchFrontierInboxDetail: mocks.fetchDetail, decideProposal: mocks.decide }));

describe("FrontierInboxPage", () => {
  beforeEach(() => {
    mocks.demo = false;
    mocks.fetchInbox.mockReset().mockResolvedValue([{ id: "proposal-1", kind: "content_gap", summary: "Needs one more path visual.", status: "pending", createdAt: "now", advisoryOnly: true }]);
    mocks.fetchDetail.mockReset().mockResolvedValue({ id: "proposal-1", kind: "content_gap", summary: "Needs one more path visual.", status: "pending", createdAt: "now", advisoryOnly: true, payload: { gap: "Needs one more path visual." } });
    mocks.decide.mockReset().mockResolvedValue({ proposal: { id: "proposal-1", status: "accepted", advisoryOnly: true } });
  });

  it("opens an advisory item and records an explicit accept decision", async () => {
    const user = userEvent.setup();
    render(<FrontierInboxPage />);

    await screen.findByText("Needs one more path visual.");
    await user.click(screen.getByRole("button", { name: "Open" }));
    expect(await screen.findByText(/\"gap\"/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));

    await waitFor(() => expect(mocks.decide).toHaveBeenCalledWith("proposal-1", "accepted"));
    const status = screen.getByText("Proposal accepted. It remains advisory.");
    await waitFor(() => expect(status).toHaveFocus());
  });
});
