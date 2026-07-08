import { Router, type IRouter } from "express";
import { rateLimit } from "express-rate-limit";
import multer from "multer";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, partnerApplicationsTable } from "@workspace/db";
import { objectStorageClient } from "../lib/objectStorage.js";
import { createTransport } from "nodemailer";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 2 },
});

const partnerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ ok: false, message: "Too many requests, please try again later." }); // i18n-ignore
  },
});

const ALLOWED_BRAND_PROFILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

const ALLOWED_PRODUCT_LIST_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const BodySchema = z.object({
  country: z.string().min(1).max(100),
  city: z.string().min(1).max(200),
  brandName: z.string().min(1).max(300),
  website: z.string().url().max(500),
  categories: z.union([
    z.array(z.string().min(1).max(100)),
    z.string().transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
  ]).refine((cats) => cats.length > 0, "At least one category required"),
  otherCategory: z.string().max(300).optional(),
  socialMedia: z.string().max(300).optional(),
  contactFirstName: z.string().min(1).max(100),
  contactLastName: z.string().min(1).max(100),
  contactRole: z.string().min(1).max(200),
  email: z.string().email().max(300),
  dialCode: z.string().min(1).max(10),
  phone: z.string().min(1).max(30),
});

function parseGcsPath(envPath: string): { bucketName: string; objectDir: string } {
  const stripped = envPath.replace(/^gs:\/\//, "").replace(/^\/+/, "");
  const slash = stripped.indexOf("/");
  if (slash === -1) return { bucketName: stripped, objectDir: "" };
  return { bucketName: stripped.slice(0, slash), objectDir: stripped.slice(slash + 1) };
}

async function uploadToGcs(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR ?? "";
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const { bucketName, objectDir } = parseGcsPath(privateDir);
  const ext = originalName.split(".").pop() ?? "bin";
  const objectName = `${objectDir ? objectDir + "/" : ""}partner-applications/${randomUUID()}.${ext}`;
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: mimeType, resumable: false });
  return `/objects/${objectName}`;
}

async function sendNotificationEmail(data: {
  id: number;
  brandName: string;
  contactName: string;
  email: string;
  country: string;
  city: string;
  website: string;
  categories: string[];
}): Promise<void> {
  const host = process.env.SMTP_HOST;
  if (!host) return;

  const notifyTo =
    process.env.PARTNER_NOTIFY_EMAIL ??
    "adnan@presentail.com,ahmad@presentail.com,bassel@presentail.com"; // i18n-ignore
  const transport = createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
      : undefined,
  });

  await transport.sendMail({
    from: process.env.SMTP_USER ?? "noreply@presentail.com", // i18n-ignore
    to: notifyTo,
    subject: `New partner application #${data.id} — ${data.brandName}`, // i18n-ignore
    text: [
      `New partner application received (#${data.id})`, // i18n-ignore
      ``,
      `Brand: ${data.brandName}`, // i18n-ignore
      `Contact: ${data.contactName} <${data.email}>`, // i18n-ignore
      `Country: ${data.country}, City: ${data.city}`, // i18n-ignore
      `Website: ${data.website}`, // i18n-ignore
      `Categories: ${data.categories.join(", ")}`, // i18n-ignore
    ].join("\n"),
  });
}

router.post(
  "/partner-application",
  partnerLimiter,
  upload.fields([
    { name: "brandProfile", maxCount: 1 },
    { name: "productList", maxCount: 1 },
  ]),
  async (req, res): Promise<void> => {
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const brandProfileFile = files?.["brandProfile"]?.[0];
    const productListFile = files?.["productList"]?.[0];

    if (!brandProfileFile) {
      res.status(400).json({ ok: false, message: "brandProfile file is required" }); // i18n-ignore
      return;
    }
    if (!productListFile) {
      res.status(400).json({ ok: false, message: "productList file is required" }); // i18n-ignore
      return;
    }

    if (!ALLOWED_BRAND_PROFILE_TYPES.includes(brandProfileFile.mimetype)) {
      res.status(400).json({ ok: false, message: "Invalid brand profile file type" }); // i18n-ignore
      return;
    }
    if (!ALLOWED_PRODUCT_LIST_TYPES.includes(productListFile.mimetype)) {
      res.status(400).json({ ok: false, message: "Invalid product list file type" }); // i18n-ignore
      return;
    }

    const parsed = BodySchema.safeParse(req.body);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid request"; // i18n-ignore
      res.status(400).json({ ok: false, message: msg }); // i18n-ignore
      return;
    }

    const {
      country, city, brandName, website, categories, otherCategory,
      socialMedia, contactFirstName, contactLastName, contactRole,
      email, dialCode, phone,
    } = parsed.data;

    let brandProfileUrl: string;
    let productListUrl: string;

    try {
      [brandProfileUrl, productListUrl] = await Promise.all([
        uploadToGcs(brandProfileFile.buffer, brandProfileFile.originalname, brandProfileFile.mimetype),
        uploadToGcs(productListFile.buffer, productListFile.originalname, productListFile.mimetype),
      ]);
    } catch (err) {
      req.log.error({ err }, "partner-application: file upload failed");
      res.status(500).json({ ok: false, message: "File upload failed, please try again." }); // i18n-ignore
      return;
    }

    let inserted: { id: number }[];
    try {
      inserted = await db
        .insert(partnerApplicationsTable)
        .values({
          country,
          city,
          brandName,
          website,
          categories,
          otherCategory: otherCategory ?? null,
          socialMedia: socialMedia ?? null,
          contactFirstName,
          contactLastName,
          contactRole,
          email,
          dialCode,
          phone,
          brandProfileUrl,
          productListUrl,
        })
        .returning({ id: partnerApplicationsTable.id });
    } catch (err) {
      req.log.error({ err }, "partner-application: DB insert failed");
      res.status(500).json({ ok: false, message: "Failed to save application, please try again." }); // i18n-ignore
      return;
    }

    const id = inserted[0]?.id ?? 0;

    void sendNotificationEmail({
      id,
      brandName,
      contactName: `${contactFirstName} ${contactLastName}`,
      email,
      country,
      city,
      website,
      categories,
    }).catch((err: unknown) => {
      req.log.warn({ err }, "partner-application: email notification failed");
    });

    req.log.info(
      { partnerApplicationId: id, country, brandName },
      "partner application received",
    );

    res.status(200).json({ ok: true, id });
  },
);

export default router;
