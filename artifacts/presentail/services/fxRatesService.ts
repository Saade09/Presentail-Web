import { applyFxRates, type CurrencyCode } from "@/data/currencies";
import { API_BASE } from "@/lib/stripe";

type FxRatesResponse = {
  ok: boolean;
  base?: string;
  rates?: Record<string, number>;
  fetchedAt?: number;
  source?: "live" | "fallback";
};

/**
 * Fetch live FX rates from the server and update the in-memory CURRENCIES
 * table so display amounts track what the server will charge. Best-effort:
 * any failure leaves the static fallback rates in place.
 */
export async function refreshFxRates(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/fx/rates`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return false;
    const json = (await res.json()) as FxRatesResponse;
    if (!json.ok || !json.rates) return false;
    applyFxRates(json.rates as Partial<Record<CurrencyCode, number>>);
    return true;
  } catch {
    return false;
  }
}
