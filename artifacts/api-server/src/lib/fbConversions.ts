import { createHash, randomBytes } from "crypto";

const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

type CountryKey = "lb" | "ae";

function configForCountry(countryKey: CountryKey): { pixelId: string; accessToken: string } | null {
  if (countryKey === "lb") {
    const pixelId = process.env.VITE_FB_PIXEL_ID_LB;
    const accessToken = process.env.FB_CONVERSIONS_TOKEN_LB;
    if (!pixelId || !accessToken) return null;
    return { pixelId, accessToken };
  }
  if (countryKey === "ae") {
    const pixelId = process.env.VITE_FB_PIXEL_ID_AE;
    const accessToken = process.env.FB_CONVERSIONS_TOKEN_AE;
    if (!pixelId || !accessToken) return null;
    return { pixelId, accessToken };
  }
  return null;
}

function countryCodeToKey(countryCode: string | null | undefined): CountryKey | null {
  if (!countryCode) return null;
  const lower = countryCode.toLowerCase();
  if (lower === "lb") return "lb";
  if (lower === "ae") return "ae";
  return null;
}

function hashValue(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

type CAPIUserData = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

type CAPIPurchaseParams = {
  eventId: string;
  value: number;
  currency: string;
  countryCode: string | null | undefined;
  userData?: CAPIUserData;
};

export async function sendCapiPurchase(params: CAPIPurchaseParams): Promise<void> {
  const countryKey = countryCodeToKey(params.countryCode);
  if (!countryKey) return;

  const config = configForCountry(countryKey);
  if (!config) return;

  const eventTime = Math.floor(Date.now() / 1000);

  const hashedUserData: Record<string, string> = {};
  if (params.userData?.email) {
    hashedUserData.em = hashValue(params.userData.email);
  }
  if (params.userData?.phone) {
    hashedUserData.ph = hashValue(params.userData.phone.replace(/\D/g, ""));
  }
  if (params.userData?.firstName) {
    hashedUserData.fn = hashValue(params.userData.firstName);
  }
  if (params.userData?.lastName) {
    hashedUserData.ln = hashValue(params.userData.lastName);
  }

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: eventTime,
        event_id: params.eventId,
        action_source: "website",
        user_data: Object.keys(hashedUserData).length > 0 ? hashedUserData : { client_user_agent: "" },
        custom_data: {
          value: params.value,
          currency: params.currency.toUpperCase(),
        },
      },
    ],
  };

  const url = `${GRAPH_API_BASE}/${config.pixelId}/events?access_token=${config.accessToken}`;

  await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
