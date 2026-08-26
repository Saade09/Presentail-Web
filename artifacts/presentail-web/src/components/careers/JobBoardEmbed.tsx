import { useEffect, useRef, useState } from "react";
import {
  JOB_BOARD_FALLBACK_HEIGHT,
  JOB_BOARD_URL,
  fetchJobBoardStats,
  registerJobBoardResizeHandler,
} from "@/lib/jobBoard";

type Props = {
  title: string;
  viewAllLabel: string;
  unavailableMessage: string;
};

/**
 * Embeds the company's live JazzHR job board inside the Careers page.
 *
 * The vendor page is cross-origin and doesn't report its own height, so we
 * can't rely on it to auto-resize the iframe (a listener is still wired up
 * via `registerJobBoardResizeHandler` in case that ever changes, but it's
 * not the load-bearing mechanism). Instead:
 *  - our own API server measures the live page's current row count
 *    server-side and returns a height that fits it (see
 *    `fetchJobBoardStats` / api-server's lib/jobBoard.ts);
 *  - the iframe height is *never* capped below that measured value, so in
 *    the normal case there is no internal scrollbar; `scrolling="auto"` is
 *    only a rare safety net for when the estimate undershoots (e.g. titles
 *    wrapping to two lines on a narrow screen), so a role can never be
 *    silently clipped;
 *  - if our server confirms the vendor page itself is unreachable, we swap
 *    the iframe for a plain fallback message instead of showing a broken
 *    empty box. If we simply couldn't reach *our own* API, that says
 *    nothing about the vendor's health, so we still render the iframe at a
 *    generous default height.
 */
export function JobBoardEmbed({ title, viewAllLabel, unavailableMessage }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(JOB_BOARD_FALLBACK_HEIGHT);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    return registerJobBoardResizeHandler(setHeight);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchJobBoardStats().then((stats) => {
      if (cancelled) return;
      if (stats.status === "ok") {
        setHeight(stats.height);
      } else if (stats.status === "vendor-down") {
        setUnavailable(true);
      }
      // "unknown" (our own API was unreachable): keep the fallback height
      // and still try to render the iframe — the vendor page may load fine.
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div data-testid="careers-job-board">
      {unavailable ? (
        <p
          className="text-muted-foreground leading-relaxed mb-3"
          data-testid="careers-job-board-unavailable"
        >
          {unavailableMessage}
        </p>
      ) : (
        <iframe
          ref={iframeRef}
          src={JOB_BOARD_URL}
          title={title}
          data-testid="careers-job-board-iframe"
          scrolling="auto"
          style={{
            width: "100%",
            height,
            border: "none",
            display: "block",
            transition: "height 200ms ease",
          }}
          onError={() => setUnavailable(true)}
        />
      )}
      <div className="mt-4 text-center">
        <a
          href={JOB_BOARD_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="careers-view-all-jobs"
          className="text-sm font-medium underline underline-offset-4 text-foreground hover:opacity-80"
        >
          {viewAllLabel}
        </a>
      </div>
    </div>
  );
}
