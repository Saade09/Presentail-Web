import { Router, type IRouter } from "express";
import { getJobBoardStats } from "../lib/jobBoard";

const router: IRouter = Router();

// Public read-only endpoint the Careers page calls to size its embedded
// job-board iframe to fit the *current* live listing (see lib/jobBoard.ts
// for why this has to be measured server-side rather than reported by the
// cross-origin embed itself).
router.get("/careers/job-board-stats", async (_req, res) => {
  const stats = await getJobBoardStats();
  res.json(stats);
});

export default router;
