import { Router, type IRouter, type Request, type Response } from "express";
import { Webhook } from "svix";
import { createClerkClient } from "@clerk/express";
import { isUserType } from "@workspace/clerk-types";

const router: IRouter = Router();

// POST /api/clerk/webhook
//
// Receives Clerk events. We only act on `user.created` to ensure every new
// Clerk user that signs up via the web storefront is tagged with
// `publicMetadata.userType="customer"`.
//
// The router is mounted at `/api/clerk/webhook` (see app.ts), so the
// handler is registered at `/`. It must run with `express.raw()` because
// Svix verifies the signature against the EXACT raw request bytes.
router.post(
  "/",
  async (req: Request, res: Response): Promise<void> => {
    const secret = process.env.CLERK_WEBHOOK_SECRET;
    if (!secret) {
      // The webhook secret is configured separately (Clerk dashboard → Webhooks).
      // Until it's provided we accept-and-ignore so first-run signup still
      // works (the lazy fallback in `authenticate()` will set userType on
      // the first authenticated request).
      req.log?.warn?.(
        "clerkWebhook: CLERK_WEBHOOK_SECRET not configured, ignoring event",
      );
      res.status(503).json({
        ok: false,
        message: "Clerk webhook secret not configured",
      });
      return;
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      req.log?.warn?.("clerkWebhook: CLERK_SECRET_KEY not configured");
      res.status(503).json({ ok: false, message: "Clerk not configured" });
      return;
    }

    const payload = req.body as Buffer;
    const headers = {
      "svix-id": req.header("svix-id") ?? "",
      "svix-timestamp": req.header("svix-timestamp") ?? "",
      "svix-signature": req.header("svix-signature") ?? "",
    };

    let evt: { type: string; data: Record<string, unknown> };
    try {
      const wh = new Webhook(secret);
      evt = wh.verify(
        payload.toString("utf8"),
        headers,
      ) as typeof evt;
    } catch (err: any) {
      req.log?.warn?.(
        { err: err?.message },
        "clerkWebhook: signature verification failed",
      );
      res.status(401).json({ ok: false, message: "Invalid signature" });
      return;
    }

    if (evt.type !== "user.created") {
      // We only need to react to new sign-ups. All other events are
      // accepted so Clerk doesn't retry them.
      res.json({ ok: true, ignored: evt.type });
      return;
    }

    const userId = String((evt.data as { id?: string }).id ?? "");
    if (!userId) {
      res.status(400).json({ ok: false, message: "Missing user id" });
      return;
    }

    const existing = (evt.data as { public_metadata?: { userType?: unknown } })
      .public_metadata;
    if (existing && isUserType(existing.userType)) {
      // Another surface (Presentail OS) may have already pre-tagged the
      // user — never overwrite an existing user-type assignment.
      res.json({ ok: true, alreadyTyped: existing.userType });
      return;
    }

    try {
      const clerk = createClerkClient({ secretKey });
      await clerk.users.updateUserMetadata(userId, {
        publicMetadata: { userType: "customer" },
      });
      req.log?.info?.({ userId }, "clerkWebhook: tagged user as customer");
      res.json({ ok: true });
    } catch (err: any) {
      req.log?.error?.(
        { err: err?.message, userId },
        "clerkWebhook: failed to set publicMetadata",
      );
      res.status(500).json({ ok: false, message: "Failed to tag user" });
    }
  },
);

export default router;
