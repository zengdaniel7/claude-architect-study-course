import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TeachStage } from "./TeachStage";

const mocks = vi.hoisted(() => ({ completeStage: vi.fn() }));
vi.mock("../StudioContext", () => ({ useStudio: () => ({ completeStage: mocks.completeStage, saving: false }) }));

describe("TeachStage recording", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("disables Record while permission is pending and releases a late stream after unmount", async () => {
    let resolveStream: (stream: MediaStream) => void = () => undefined;
    const pendingStream = new Promise<MediaStream>((resolve) => { resolveStream = resolve; });
    const getUserMedia = vi.fn(() => pendingStream);
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    vi.stubGlobal("MediaRecorder", vi.fn());
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
    const user = userEvent.setup();
    const { unmount } = render(<TeachStage />);

    await user.click(screen.getByRole("button", { name: "Record" }));
    expect(screen.getByRole("button", { name: "Waiting for microphone…" })).toBeDisabled();

    unmount();
    resolveStream(stream);
    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });
});
