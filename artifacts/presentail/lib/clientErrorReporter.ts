import Constants from "expo-constants";
import { Platform } from "react-native";

import { API_BASE } from "@/lib/stripe";
import { getDeviceId } from "@/services/notifications";

type Boundary = "route" | "root";

type ReportInput = {
  error: unknown;
  componentStack?: string | null;
  route: string;
  boundary?: Boundary;
};

// Defensive client-side PII scrub. The server scrubs again, but we want to
// avoid sending raw bearer tokens, JWTs, emails, phone numbers, addresses,
// or card messages off the device in the first place.
const SCRUB_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]"],
  [/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[REDACTED_JWT]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[REDACTED_EMAIL]"],
  [/\+?\d[\d\s().-]{8,}\d/g, "[REDACTED_PHONE]"],
];

// Sensitive object/JSON-style fields likely to leak into a stringified
// Error (e.g. `Invalid order: {"cardMessage":"happy birthday Sara",...}`).
// Matches `key: "value"` and `key="value"` shapes; the value is replaced
// while the key is preserved so the surrounding context is still useful.
const SENSITIVE_KEYS = [
  "cardMessage",
  "card_message",
  "message",
  "recipientAddress",
  "recipient_address",
  "address",
  "address1",
  "address2",
  "addressLine1",
  "addressLine2",
  "street",
  "streetAddress",
  "building",
  "apartment",
  "deliveryAddress",
  "delivery_address",
  "recipientPhone",
  "recipient_phone",
  "recipientName",
  "recipient_name",
  "phone",
  "phoneNumber",
  "phone_number",
  "fullName",
  "full_name",
  "firstName",
  "first_name",
  "lastName",
  "last_name",
  "email",
  "password",
  "token",
  "jwt",
  "authorization",
];

const SENSITIVE_KEY_RULES: ReadonlyArray<readonly [RegExp, string]> = SENSITIVE_KEYS.flatMap(
  (key) =>
    [
      [
        new RegExp(`("${key}"\\s*:\\s*)"(?:\\\\.|[^"\\\\])*"`, "gi"),
        '$1"[REDACTED]"',
      ],
      [
        new RegExp(`(\\b${key}\\s*=\\s*)"(?:\\\\.|[^"\\\\])*"`, "gi"),
        '$1"[REDACTED]"',
      ],
    ] as Array<readonly [RegExp, string]>,
);

function scrub(value: string): string {
  let out = value;
  for (const [re, repl] of SENSITIVE_KEY_RULES) out = out.replace(re, repl);
  for (const [re, repl] of SCRUB_RULES) out = out.replace(re, repl);
  return out;
}

function clip(value: string | undefined | null, max: number): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;
  const trimmed = value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
  return scrub(trimmed);
}

function platformTag(): "ios" | "android" | "web" {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "web";
}

type ExpoLikeConfig = {
  version?: unknown;
  ios?: { buildNumber?: unknown } | null;
  android?: { versionCode?: unknown } | null;
};

function readConfig(): ExpoLikeConfig {
  // `Constants.expoConfig` is the modern Expo Router shape; `manifest` is
  // the legacy classic-build shape. Both are optional at runtime, so we
  // narrow with `unknown` rather than reaching through `any`.
  const fromExpoConfig = (Constants as { expoConfig?: unknown }).expoConfig;
  if (fromExpoConfig && typeof fromExpoConfig === "object") {
    return fromExpoConfig as ExpoLikeConfig;
  }
  const fromManifest = (Constants as { manifest?: unknown }).manifest;
  if (fromManifest && typeof fromManifest === "object") {
    return fromManifest as ExpoLikeConfig;
  }
  return {};
}

function appVersion(): string | undefined {
  const v = readConfig().version;
  return typeof v === "string" ? v : undefined;
}

function buildNumber(): string | undefined {
  const cfg = readConfig();
  if (Platform.OS === "ios") {
    const ios = cfg.ios?.buildNumber;
    if (typeof ios === "string" || typeof ios === "number") return String(ios);
  }
  if (Platform.OS === "android") {
    const android = cfg.android?.versionCode;
    if (typeof android === "string" || typeof android === "number") {
      return String(android);
    }
  }
  return undefined;
}

let cachedDeviceId: string | null = null;
async function safeDeviceId(): Promise<string | undefined> {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    cachedDeviceId = await getDeviceId();
    return cachedDeviceId;
  } catch {
    return undefined;
  }
}

/**
 * Send a single client-side crash report to the API. Never throws — a
 * failed report must not turn a recoverable screen crash into a hard
 * crash. Best-effort fire-and-forget.
 */
export function reportClientError(input: ReportInput): void {
  const err = input.error;
  const message =
    (err instanceof Error && err.message) ||
    (typeof err === "string" && err) ||
    "Unknown error";
  const stack = err instanceof Error ? err.stack ?? undefined : undefined;

  const body = {
    message: clip(message, 2000) ?? "Unknown error",
    stack: clip(stack, 8000),
    componentStack: clip(input.componentStack ?? undefined, 4000),
    route: clip(input.route, 200),
    boundary: input.boundary ?? "route",
    platform: platformTag(),
    appVersion: clip(appVersion(), 200),
    buildNumber: clip(buildNumber(), 200),
  };

  // Resolve deviceId asynchronously, then POST. We don't await the caller.
  void (async () => {
    try {
      const deviceId = await safeDeviceId();
      const payload = deviceId ? { ...body, deviceId } : body;
      // 5s safety timeout so a hung request can't keep this promise alive
      // forever on a failing network.
      const controller =
        typeof AbortController !== "undefined" ? new AbortController() : null;
      const timer = controller
        ? setTimeout(() => controller.abort(), 5000)
        : null;
      try {
        await fetch(`${API_BASE}/api/client-errors`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller?.signal,
        });
      } finally {
        if (timer) clearTimeout(timer);
      }
    } catch {
      // Swallow — reporter must never throw or reject into the caller.
    }
  })();
}
