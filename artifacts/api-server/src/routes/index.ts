import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkoutRouter from "./checkout";
import wooRouter from "./woo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkoutRouter);
router.use(wooRouter);

export default router;
