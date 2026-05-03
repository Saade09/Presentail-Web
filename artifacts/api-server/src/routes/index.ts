import { Router, type IRouter } from "express";
import healthRouter from "./health";
import checkoutRouter from "./checkout";
import paymentRouter from "./payment";
import wooRouter from "./woo";
import authRouter from "./auth";
import pushRouter from "./push";
import deliveryLocationsRouter from "./delivery-locations";
import fxRouter from "./fx";
import homepageRouter from "./homepage";

const router: IRouter = Router();

router.use(healthRouter);
router.use(checkoutRouter);
router.use(paymentRouter);
router.use(wooRouter);
router.use(authRouter);
router.use(pushRouter);
router.use(deliveryLocationsRouter);
router.use(fxRouter);
router.use(homepageRouter);

export default router;
