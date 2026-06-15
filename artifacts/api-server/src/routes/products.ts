import { Router, type IRouter } from "express";
import { z } from "zod";
import { inferProductColors } from "../lib/productColorInference";

const router: IRouter = Router();

const ProductItemSchema = z.object({
  slug: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
});

const ColorHintsRequestSchema = z.object({
  products: z.array(ProductItemSchema).min(1).max(200),
});

router.post("/products/color-hints", async (req, res) => {
  const parsed = ColorHintsRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request", details: parsed.error.issues });
    return;
  }

  const colors = await inferProductColors(parsed.data.products);
  res.json({ colors });
});

export default router;
