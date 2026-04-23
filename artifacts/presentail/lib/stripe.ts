import Constants from "expo-constants";

const explicit = process.env.EXPO_PUBLIC_API_BASE_URL;
const domain = process.env.EXPO_PUBLIC_DOMAIN;

const inferred = (() => {
  if (explicit) return explicit;
  if (domain) return `https://${domain}/api-server`;
  const hostUri = (Constants as any)?.expoConfig?.hostUri || (Constants as any)?.manifest?.hostUri;
  if (hostUri) {
    const host = String(hostUri).split(":")[0];
    return `http://${host}:3000/api-server`;
  }
  return "/api-server";
})();

export const API_BASE = inferred;

export type CheckoutLineItem = {
  name: string;
  description?: string;
  image?: string;
  amount: number; // cents
  quantity: number;
};

export async function createStripeCheckoutSession(payload: {
  items: CheckoutLineItem[];
  email?: string;
  metadata?: Record<string, string>;
  successUrl: string;
  cancelUrl: string;
}): Promise<
  | { ok: true; url: string; id: string }
  | { ok: false; code?: string; message: string }
> {
  try {
    const res = await fetch(`${API_BASE}/api/checkout/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const json = await res.json();
    return json;
  } catch (e: any) {
    return { ok: false, message: e?.message ?? "Network error" };
  }
}
