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

// ── Per-IP concurrent connection cap ─────────────────────────────────────────

/**
 * Maximum number of simultaneous SSE connections allowed from a single IP.
 * This bounds the damage a single source can do even when rotating through
 * many concurrent sockets.
 */
export const SSE_MAX_CONNECTIONS_PER_IP = 10;

const ipConnectionCount = new Map<string, number>();

/**
 * Record a new connection from `ip`.
 * Returns `false` (and does NOT add to the registry) when the caller is
 * already at or above the per-IP cap.
 */
export function addSseClient(res: Response, ip: string): boolean {
  const current = ipConnectionCount.get(ip) ?? 0;
  if (current >= SSE_MAX_CONNECTIONS_PER_IP) {
    return false;
  }
  ipConnectionCount.set(ip, current + 1);
  clients.add(res);
  return true;
}

export function removeSseClient(res: Response, ip: string): void {
  clients.delete(res);
  const current = ipConnectionCount.get(ip) ?? 0;
  if (current <= 1) {
    ipConnectionCount.delete(ip);
  } else {
    ipConnectionCount.set(ip, current - 1);
  }
}

export function getSseClientCount(): number {
  return clients.size;
}

/** Only for use in unit tests — resets all connection state. */
export function __resetSseBroadcastForTests(): void {
  clients.clear();
  ipConnectionCount.clear();
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
