import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkoutRouter from "./checkout";
import paymentRouter from "./payment";
import wooRouter from "./woo";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkoutRouter);
router.use(paymentRouter);
router.use(wooRouter);
router.use(authRouter);

export default router;
