import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkoutRouter from "./checkout";
import paymentRouter from "./payment";
import wooRouter from "./woo";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkoutRouter);
router.use(paymentRouter);
router.use(wooRouter);

export default router;
