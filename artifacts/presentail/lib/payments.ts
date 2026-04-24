import { API_BASE } from "./stripe";

type PayResult = { ok: true; url: string; id: string } | { ok: false; code?: string; message: string };

export async function createMamoPayment(payload: {
  amount: number;
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
