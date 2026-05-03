import { API_BASE } from "./stripe";

type PayResult = { ok: true; url: string; id: string } | { ok: false; code?: string; message: string };

// Cart item sent to the server for total computation.
// The server resolves the real price from the WooCommerce catalog using wcId.
type CartItem = { wcId: number; quantity: number };

export async function createMamoPayment(payload: {
  items: CartItem[];
  // orderId is REQUIRED so the server can bind the payment intent to this
  // specific order and prevent replay attacks.
  orderId: string;
  district?: string;
  expressDelivery?: boolean;
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
  items: CartItem[];
  // orderId is REQUIRED so the server can bind the payment intent to this
  // specific order and prevent replay attacks.
  orderId: string;
  district?: string;
  expressDelivery?: boolean;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
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
