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

    // Defer the initial connection until the browser is idle so that
    // headless crawlers (PageSpeed Insights, Lighthouse) do not see a
    // console error for the long-lived SSE socket timing out during their
    // capture window.  Real users get the connection a moment after the
    // page is interactive; the existing exponential-backoff reconnect
    // logic handles any subsequent drops transparently.
    let idleHandle: ReturnType<typeof setTimeout> | number | null = null;
    if (typeof requestIdleCallback !== "undefined") {
      idleHandle = requestIdleCallback(() => connect(), { timeout: 5_000 });
    } else {
      // Safari does not support requestIdleCallback — fall back to a short
      // setTimeout so we still defer past the initial render cycle.
      idleHandle = setTimeout(() => connect(), 200);
    }

    return () => {
      if (idleHandle !== null) {
        if (typeof requestIdleCallback !== "undefined") {
          cancelIdleCallback(idleHandle as number);
        } else {
          clearTimeout(idleHandle as ReturnType<typeof setTimeout>);
        }
        idleHandle = null;
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
