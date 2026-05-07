import { API_BASE, type StoreContext } from "./stripe";

type PayResult = { ok: true; url: string; id: string } | { ok: false; code?: string; message: string };

type CartItem = { wcId: number; quantity: number };

function storeHeadersFromCtx(ctx?: StoreContext): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (ctx?.countryCode) h["x-store-country"] = ctx.countryCode;
  if (ctx?.cityId) h["x-store-city"] = ctx.cityId;
  return h;
}

export async function createMamoPayment(payload: {
  items: CartItem[];
  orderId: string;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  currency?: string;
  title?: string;
  description?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  returnUrl: string;
  failureReturnUrl: string;
  storeContext?: StoreContext;
}): Promise<PayResult> {
  try {
    const { storeContext, ...body } = payload;
    const res = await fetch(`${API_BASE}/api/payment/mamo`, {
      method: "POST",
      headers: storeHeadersFromCtx(storeContext),
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}

export async function createPayPalOrder(payload: {
  items: CartItem[];
  orderId: string;
  district?: string;
  expressDelivery?: boolean;
  noAddress?: boolean;
  currency: string;
  returnUrl: string;
  cancelUrl: string;
  storeContext?: StoreContext;
}): Promise<PayResult> {
  try {
    const { storeContext, ...body } = payload;
    const res = await fetch(`${API_BASE}/api/payment/paypal`, {
      method: "POST",
      headers: storeHeadersFromCtx(storeContext),
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}
