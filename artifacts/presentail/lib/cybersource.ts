// CyberSource Unified Checkout — mobile client API helpers
//
// Used by the mobile checkout to:
//   1. Fetch a capture context JWT from the server
//   2. Charge the card after the WebView tokenizer returns a transient token

import { API_BASE } from "./stripe";

export type CybersourceCaptureContextResult =
  | { ok: true; captureContext: string; environment: "test" | "live" }
  | { ok: false; message: string; code?: string };

export type CybersourceChargeResult =
  | { ok: true; paymentRef: string }
  | { ok: false; message: string; code?: string };

export type CartItem = { wcId: number; quantity: number; osSlug?: string };

type SharedPayload = {
  orderId: string;
  items: CartItem[];
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  deliverySlot?: string;
  deliverySlotId?: string;
  cityId?: string;
};

export async function fetchCybersourceCaptureContext(
  payload: SharedPayload & { targetOrigin: string },
): Promise<CybersourceCaptureContextResult> {
  try {
    const res = await fetch(`${API_BASE}/api/payment/cybersource/capture-context`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      return { ok: false, message: data?.message ?? `HTTP ${res.status}`, code: data?.code };
    }
    return {
      ok: true,
      captureContext: data.captureContext as string,
      environment: (data.environment ?? "test") as "test" | "live",
    };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "Network error" }; // i18n-ignore
  }
}

export async function chargeCybersource(
  payload: SharedPayload & {
    transientTokenJwt: string;
    billingDetails?: {
      firstName?: string;
      lastName?: string;
      email?: string;
    };
  },
): Promise<CybersourceChargeResult> {
  try {
    const res = await fetch(`${API_BASE}/api/payment/cybersource/charge`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json()) as any;
    if (!res.ok) {
      return { ok: false, message: data?.message ?? `HTTP ${res.status}`, code: data?.code };
    }
    return { ok: true, paymentRef: data.paymentRef as string };
  } catch (err: any) {
    return { ok: false, message: err?.message ?? "Network error" }; // i18n-ignore
  }
}
