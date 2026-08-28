import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { checkAdminToken } from "../lib/admin-auth";
import { getOperationalMetrics } from "../lib/operationalMetrics";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Aggregate, in-process diagnostics only. No URLs, query strings, request
// bodies, headers, customer data, payment data, or credentials are returned.
router.get("/healthz/metrics", (req, res) => {
  if (
    process.env.BASELINE_DISABLE_WORKERS !== "1" &&
    !checkAdminToken(req, res)
  ) {
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(getOperationalMetrics());
});

export default router;
