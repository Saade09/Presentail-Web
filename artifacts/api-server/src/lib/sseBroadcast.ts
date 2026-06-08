/**
 * Server-Sent Events broadcast channel.
 *
 * Keeps a registry of all currently-connected SSE clients and provides
 * typed broadcast helpers. Each browser tab that opens GET /api/events
 * registers itself here; on disconnect it deregisters automatically.
 *
 * Usage:
 *   Server: import { broadcastLocationsUpdated } from "./sseBroadcast";
 *           broadcastLocationsUpdated();   // after any delivery-config change
 *
 *   Client: const source = new EventSource("/api/events");
 *           source.addEventListener("locations-updated", () => { ... });
 */

import type { Response } from "express";

// ── Client registry ──────────────────────────────────────────────────────────

const clients = new Set<Response>();

export function addSseClient(res: Response): void {
  clients.add(res);
}

export function removeSseClient(res: Response): void {
  clients.delete(res);
}

export function getSseClientCount(): number {
  return clients.size;
}

// ── Broadcast helpers ────────────────────────────────────────────────────────

/**
 * Notify all connected browsers that the delivery-locations data has changed.
 * Clients should invalidate their cached delivery-locations query and refetch.
 */
export function broadcastLocationsUpdated(): void {
  const frame = "event: locations-updated\ndata: {}\n\n";
  for (const client of clients) {
    try {
      client.write(frame);
    } catch {
      // Client already disconnected — the close handler will deregister it.
    }
  }
}
