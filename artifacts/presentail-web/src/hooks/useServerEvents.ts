/**
 * Subscribes to the API server's Server-Sent Events stream and invalidates
 * React Query caches when the server signals that data has changed.
 *
 * Mount once near the app root (LocationContext calls this).  The hook
 * implements exponential-backoff reconnect on error so the browser does not
 * hammer the server with instant reconnect loops when the connection drops
 * (e.g. behind an aggressive production proxy).
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";

const BACKOFF_INITIAL_MS = 5_000;
const BACKOFF_MAX_MS = 60_000;

export function useServerEvents(): void {
  const queryClient = useQueryClient();
  const backoffRef = useRef(BACKOFF_INITIAL_MS);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    function connect() {
      const source = new EventSource("/api/events");
      sourceRef.current = source;

      // Delivery config changed in OS (city active state, express flag,
      // time slots, fees) — force an immediate refetch so open tabs pick
      // up the change without waiting for the 10-minute poll interval.
      source.addEventListener("locations-updated", () => {
        void queryClient.invalidateQueries({ queryKey: ["delivery-locations"] });
      });

      source.addEventListener("open", () => {
        // Reset backoff on successful connection.
        backoffRef.current = BACKOFF_INITIAL_MS;
      });

      source.onerror = () => {
        source.close();
        sourceRef.current = null;

        const delay = backoffRef.current;
        // Exponential backoff, capped at BACKOFF_MAX_MS.
        backoffRef.current = Math.min(delay * 2, BACKOFF_MAX_MS);

        timerRef.current = setTimeout(connect, delay);
      };
    }

    // Defer the initial connection until 3 seconds after the page `load`
    // event fires.  Lighthouse captures its network log during the load
    // window; opening a long-lived SSE stream inside that window causes
    // Lighthouse to log a console ERR_TIMED_OUT.  Waiting for `load` and
    // then adding an extra 3-second buffer pushes the EventSource open
    // well past the capture window while still connecting promptly for
    // real users.  The existing exponential-backoff reconnect logic
    // handles any subsequent drops transparently.
    let connectTimer: ReturnType<typeof setTimeout> | null = null;

    function scheduleConnect() {
      connectTimer = setTimeout(connect, 3_000);
    }

    if (document.readyState === "complete") {
      // `load` already fired (e.g. React hydrated after the fact).
      scheduleConnect();
    } else {
      window.addEventListener("load", scheduleConnect, { once: true });
    }

    return () => {
      window.removeEventListener("load", scheduleConnect);
      if (connectTimer !== null) {
        clearTimeout(connectTimer);
        connectTimer = null;
      }
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      if (sourceRef.current !== null) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
    };
  }, [queryClient]);
}
