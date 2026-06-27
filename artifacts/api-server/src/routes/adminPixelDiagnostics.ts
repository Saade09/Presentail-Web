import { Router, type IRouter, type Request, type Response } from "express";
import { getPixelConfigHealth } from "../lib/fbConversions";

const router: IRouter = Router();

// Admin-only Facebook pixel / CAPI configuration diagnostics.
//
// Auth: `x-push-admin-token` header (PUSH_ADMIN_TOKEN env var).
//
// Endpoint:
//   GET /api/admin/pixel/diagnostics → JSON
//
// Response shape:
//   {
//     ok: boolean,           // true when every country is fully configured
//     countries: [
//       {
//         country: "lb" | "ae",
//         pixelIdConfigured: boolean,
//         accessTokenConfigured: boolean,
//         ok: boolean
//       },
//       ...
//     ]
//   }

function requireAdmin(req: Request, res: Response): boolean {
  const expected = process.env.PUSH_ADMIN_TOKEN;
  const supplied =
    req.header("x-push-admin-token") ?? req.header("x-admin-token");
  if (!expected || !supplied || supplied !== expected) {
    res.status(401).json({ ok: false, message: "Invalid or missing admin token" }); // i18n-ignore
    return false;
  }
  return true;
}

router.get("/admin/pixel/diagnostics", (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;

  const countries = getPixelConfigHealth();
  const allOk = countries.every((c) => c.ok);

  res.json({ ok: allOk, countries });
});

export default router;
