// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test-utils";
import { JobBoardEmbed } from "./JobBoardEmbed";

const { mockApiFetch } = vi.hoisted(() => ({ mockApiFetch: vi.fn() }));

vi.mock("@/lib/api", () => ({ apiFetch: mockApiFetch }));

const props = {
  title: "Open roles at Presentail",
  viewAllLabel: "View all jobs",
  unavailableMessage: "The job board is temporarily unavailable.",
};

describe("JobBoardEmbed", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  it("renders the iframe sized to the server-reported height and the view-all link", async () => {
    mockApiFetch.mockResolvedValue({ ok: true, jobCount: 49, height: 1826 });
    renderWithProviders(<JobBoardEmbed {...props} />);

    await waitFor(() => {
      const iframe = screen.getByTestId("careers-job-board-iframe") as HTMLIFrameElement;
      expect(iframe.style.height).toBe("1826px");
    });
    const link = screen.getByTestId("careers-view-all-jobs");
    expect(link.getAttribute("href")).toBe("https://presentail.applytojob.com/apply/jobs/");
  });

  it("shows the unavailable message (and keeps the view-all link) when our server confirms the vendor is down", async () => {
    mockApiFetch.mockResolvedValue({ ok: false });
    renderWithProviders(<JobBoardEmbed {...props} />);

    await waitFor(() => {
      const msg = screen.getByTestId("careers-job-board-unavailable");
      expect(msg.textContent).toBe(props.unavailableMessage);
    });
    expect(screen.queryByTestId("careers-job-board-iframe")).toBeNull();
    expect(screen.queryByTestId("careers-view-all-jobs")).not.toBeNull();
  });

  it("still renders the iframe at a generous fallback height if our own API is unreachable", async () => {
    mockApiFetch.mockRejectedValue(new Error("network error"));
    renderWithProviders(<JobBoardEmbed {...props} />);

    expect(screen.getByTestId("careers-job-board-iframe")).not.toBeNull();
    await waitFor(() => expect(mockApiFetch).toHaveBeenCalled());
    expect(screen.queryByTestId("careers-job-board-unavailable")).toBeNull();
  });
});
