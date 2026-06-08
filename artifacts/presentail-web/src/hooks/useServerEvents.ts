/**
 * Subscribes to the API server's Server-Sent Events stream and invalidates
 * React Query caches when the server signals that data has changed.
 *
 * Mount once near the app root (LocationContext calls this).  EventSource
 * reconnects automatically on transient network drops so no manual retry
 * logic is needed.
 */

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useServerEvents(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const source = new EventSource("/api/events");

    // Delivery config changed in OS (city active state, express flag,
    // time slots, fees) — force an immediate refetch so open tabs pick
    // up the change without waiting for the 10-minute poll interval.
    source.addEventListener("locations-updated", () => {
      void queryClient.invalidateQueries({ queryKey: ["delivery-locations"] });
    });

    return () => {
      source.close();
    };
  }, [queryClient]);
}
