import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkoutRouter from "./checkout";
import paymentRouter from "./payment";
import wooRouter from "./woo";
import authRouter from "./auth";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkoutRouter);
router.use(paymentRouter);
router.use(wooRouter);
router.use(authRouter);
router.use(pushRouter);

export default router;
