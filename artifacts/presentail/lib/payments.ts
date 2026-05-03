import { API_BASE } from "./stripe";

type PayResult = { ok: true; url: string; id: string } | { ok: false; code?: string; message: string };

export async function createMamoPayment(payload: {
  // USD amount — the server converts to AED using live FX rates (Mamo only
  // settles in AED).
  amount: number;
  // ISO 4217 of the currency the shopper saw in-app, recorded for receipts.
  currency?: string;
  title?: string;
  description?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  returnUrl: string;
  failureReturnUrl: string;
}): Promise<PayResult> {
  try {
    const res = await fetch(`${API_BASE}/api/payment/mamo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}

export async function createPayPalOrder(payload: {
  // USD amount — the server converts into the shopper's selected currency
  // (or falls back to USD when PayPal doesn't support that currency).
  amount: number;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  orderId: string;
}): Promise<PayResult> {
  try {
    const res = await fetch(`${API_BASE}/api/payment/paypal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}
