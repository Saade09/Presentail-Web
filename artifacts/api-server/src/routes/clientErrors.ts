import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import {
  ReportClientErrorBody,
  ReportClientErrorResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;
const MAX_COMPONENT_STACK = 4000;
const MAX_FIELD = 200;

// Defensive PII scrub. The client also scrubs, but we strip again in case
// a stack/message embeds an Authorization header value, a JWT, or a raw
// email/phone that the client missed. Note: this is best-effort; route
// names like "checkout/[orderId]" are intentionally preserved.
const SCRUB_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [REDACTED]"],
  [/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, "[REDACTED_JWT]"],
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, "[REDACTED_EMAIL]"],
  [/\+?\d[\d\s().-]{8,}\d/g, "[REDACTED_PHONE]"],
];

// Mirrors the client-side scrub for sensitive object/JSON-style fields
// (cardMessage, recipient address, recipient name/phone, auth tokens).
// Handles both `"key":"value"` and `key="value"` forms.
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

const SENSITIVE_KEY_RULES: ReadonlyArray<readonly [RegExp, string]> =
  SENSITIVE_KEYS.flatMap(
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

function clip(value: string | undefined, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.length > max ? `${value.slice(0, max)}…[truncated]` : value;
  return scrub(trimmed);
}

// Single shared limiter: 30 reports / 5 min per IP. Bursty crash storms
// from a single device are clipped without blocking the rest of the fleet.
const clientErrorsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    const body: ReturnType<typeof ReportClientErrorResponse.parse> = { ok: true };
    res.status(200).json(body);
  },
});

router.post(
  "/client-errors",
  clientErrorsLimiter,
  // Cap body size at 64 KB so the endpoint can't be used as a log-spam sink.
  // The Express-level express.json() default is 100 KB; this is tighter.
  (req, res, next) => {
    const cl = Number(req.header("content-length") ?? 0);
    if (Number.isFinite(cl) && cl > 64 * 1024) {
      res
        .status(400)
        .json({ ok: false, message: "Payload too large" });
      return;
    }
    next();
  },
  (req, res): void => {
    const parsed = ReportClientErrorBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({
          ok: false,
          message: parsed.error.issues[0]?.message ?? "Invalid body",
        });
      return;
    }
    const {
      message,
      stack,
      componentStack,
      route,
      boundary,
      platform,
      appVersion,
      buildNumber,
      deviceId,
    } = parsed.data;

    req.log.error(
      {
        clientError: true,
        boundary: boundary ?? "route",
        route: clip(route, MAX_FIELD),
        platform,
        appVersion: clip(appVersion, MAX_FIELD),
        buildNumber: clip(buildNumber, MAX_FIELD),
        deviceId: clip(deviceId, MAX_FIELD),
        message: clip(message, MAX_MESSAGE),
        stack: clip(stack, MAX_STACK),
        componentStack: clip(componentStack, MAX_COMPONENT_STACK),
      },
      "client crash report",
    );

    const body = ReportClientErrorResponse.parse({ ok: true });
    res.status(200).json(body);
  },
);

export default router;
