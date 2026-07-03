import { Router, type IRouter } from "express";
import { and, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  customerAddressesTable,
  type CustomerAddress,
} from "@workspace/db";
import { authenticate } from "../lib/auth";
import { requireUserType } from "../lib/requireUserType";
import { getCustomerById, getCustomerByWcId } from "../lib/customers";

const router: IRouter = Router();

const LABEL_VALUES = ["home", "work", "other"] as const;

const addressInputSchema = z.object({
  label: z.enum(LABEL_VALUES),
  nickname: z.string().trim().max(80).nullish(),
  countryCode: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "countryCode must be an ISO 3166-1 alpha-2 code")
    .transform((s) => s.toUpperCase()),
  district: z.string().trim().min(1).max(120),
  addressLine: z.string().trim().min(1).max(500),
  apartment: z.string().trim().max(80).nullish(),
  building: z.string().trim().max(120).nullish(),
  directions: z.string().trim().max(500).nullish(),
  recipientFirstName: z.string().trim().max(80).nullish(),
  recipientLastName: z.string().trim().max(80).nullish(),
  recipientPhoneCountryCode: z
    .string()
    .trim()
    .max(8)
    .nullish(),
  recipientPhone: z.string().trim().max(40).nullish(),
  isDefault: z.boolean().optional(),
});

const partialAddressInputSchema = addressInputSchema.partial();

function blankToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function serialize(row: CustomerAddress) {
  return {
    id: row.id,
    label: row.label,
    nickname: row.nickname,
    countryCode: row.countryCode,
    district: row.district,
    addressLine: row.addressLine,
    apartment: row.apartment,
    building: row.building,
    directions: row.directions,
    recipientFirstName: row.recipientFirstName,
    recipientLastName: row.recipientLastName,
    recipientPhoneCountryCode: row.recipientPhoneCountryCode,
    recipientPhone: row.recipientPhone,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveCustomerId(
  req: Parameters<typeof authenticate>[1],
  authHeader: string | undefined,
): Promise<
  | { ok: true; customerId: number }
  | { ok: false; status: number; message: string }
> {
  const auth = await authenticate(authHeader, req);
  if (!auth.ok) return auth;
  // Priority order:
  // (a) localCustomerId claim — native JWT / web auth; look up directly.
  if (auth.localCustomerId) {
    const local = await getCustomerById(auth.localCustomerId);
    if (local) {
      if (local.deletedAt) return { ok: false, status: 401, message: "This account has been deleted" }; // i18n-ignore
      return { ok: true, customerId: local.id };
    }
  }
  // (b) WC customer ID — mobile WordPress JWT; look up by wcCustomerId.
  const byWc = await getCustomerByWcId(auth.customerId);
  if (byWc) {
    if (byWc.deletedAt) return { ok: false, status: 401, message: "This account has been deleted" }; // i18n-ignore
    return { ok: true, customerId: byWc.id };
  }
  // (c) Final fallback — local-only JWT where customerId IS the local row id.
  const byId = await getCustomerById(auth.customerId);
  if (byId) {
    if (byId.deletedAt) return { ok: false, status: 401, message: "This account has been deleted" }; // i18n-ignore
    return { ok: true, customerId: byId.id };
  }
  return {
    ok: false,
    status: 404,
    message: "Customer profile not found", // i18n-ignore
  };
}

// GET /api/me/addresses
router.get(
  "/me/addresses",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res
        .status(resolved.status)
        .json({ ok: false, message: resolved.message });
      return;
    }
    const rows = await db
      .select()
      .from(customerAddressesTable)
      .where(eq(customerAddressesTable.customerId, resolved.customerId))
      .orderBy(
        desc(customerAddressesTable.isDefault),
        desc(customerAddressesTable.updatedAt),
      );
    res.json({ ok: true, addresses: rows.map(serialize) });
  },
);

// POST /api/me/addresses
router.post(
  "/me/addresses",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res
        .status(resolved.status)
        .json({ ok: false, message: resolved.message });
      return;
    }
    const parsed = addressInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid address" }); // i18n-ignore
      return;
    }
    const input = parsed.data;
    const customerId = resolved.customerId;

    // First saved address is implicitly the default; otherwise honour the
    // explicit flag. When marking default, clear any previous default first
    // to satisfy the unique partial index.
    const existingCount = await db
      .select({ id: customerAddressesTable.id })
      .from(customerAddressesTable)
      .where(eq(customerAddressesTable.customerId, customerId))
      .limit(1);
    const isFirst = existingCount.length === 0;
    const wantDefault = isFirst || input.isDefault === true;

    if (wantDefault) {
      await db
        .update(customerAddressesTable)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(customerAddressesTable.customerId, customerId),
            eq(customerAddressesTable.isDefault, true),
          ),
        );
    }

    const [row] = await db
      .insert(customerAddressesTable)
      .values({
        customerId,
        label: input.label,
        nickname: blankToNull(input.nickname ?? null),
        countryCode: input.countryCode,
        district: input.district,
        addressLine: input.addressLine,
        apartment: blankToNull(input.apartment ?? null),
        building: blankToNull(input.building ?? null),
        directions: blankToNull(input.directions ?? null),
        recipientFirstName: blankToNull(input.recipientFirstName ?? null),
        recipientLastName: blankToNull(input.recipientLastName ?? null),
        recipientPhoneCountryCode: blankToNull(
          input.recipientPhoneCountryCode ?? null,
        ),
        recipientPhone: blankToNull(input.recipientPhone ?? null),
        isDefault: wantDefault,
      })
      .returning();
    res.json({ ok: true, address: serialize(row) });
  },
);

// PATCH /api/me/addresses/:id
router.patch(
  "/me/addresses/:id",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res
        .status(resolved.status)
        .json({ ok: false, message: resolved.message });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "Invalid address id" }); // i18n-ignore
      return;
    }
    req.log.info({ rawBody: req.body }, "PATCH /me/addresses raw body");
    const parsed = partialAddressInputSchema.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ ok: false, message: parsed.error.issues[0]?.message ?? "Invalid address" }); // i18n-ignore
      return;
    }
    req.log.info({ parsed: parsed.data }, "PATCH /me/addresses parsed body");

    const [existing] = await db
      .select()
      .from(customerAddressesTable)
      .where(
        and(
          eq(customerAddressesTable.id, id),
          eq(customerAddressesTable.customerId, resolved.customerId),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ ok: false, message: "Address not found" }); // i18n-ignore
      return;
    }

    const input = parsed.data;
    const patch: Partial<typeof customerAddressesTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.label !== undefined) patch.label = input.label;
    if (input.nickname !== undefined)
      patch.nickname = blankToNull(input.nickname);
    if (input.countryCode !== undefined) patch.countryCode = input.countryCode;
    if (input.district !== undefined) patch.district = input.district;
    if (input.addressLine !== undefined) patch.addressLine = input.addressLine;
    if (input.apartment !== undefined)
      patch.apartment = blankToNull(input.apartment);
    if (input.building !== undefined)
      patch.building = blankToNull(input.building);
    if (input.directions !== undefined)
      patch.directions = blankToNull(input.directions);
    if (input.recipientFirstName !== undefined)
      patch.recipientFirstName = blankToNull(input.recipientFirstName);
    if (input.recipientLastName !== undefined)
      patch.recipientLastName = blankToNull(input.recipientLastName);
    if (input.recipientPhoneCountryCode !== undefined)
      patch.recipientPhoneCountryCode = blankToNull(
        input.recipientPhoneCountryCode,
      );
    if (input.recipientPhone !== undefined)
      patch.recipientPhone = blankToNull(input.recipientPhone);

    if (input.isDefault === true && !existing.isDefault) {
      await db
        .update(customerAddressesTable)
        .set({ isDefault: false, updatedAt: new Date() })
        .where(
          and(
            eq(customerAddressesTable.customerId, resolved.customerId),
            eq(customerAddressesTable.isDefault, true),
            ne(customerAddressesTable.id, id),
          ),
        );
      patch.isDefault = true;
    }

    const [updated] = await db
      .update(customerAddressesTable)
      .set(patch)
      .where(eq(customerAddressesTable.id, id))
      .returning();
    res.json({ ok: true, address: serialize(updated) });
  },
);

// DELETE /api/me/addresses/:id
router.delete(
  "/me/addresses/:id",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res
        .status(resolved.status)
        .json({ ok: false, message: resolved.message });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "Invalid address id" }); // i18n-ignore
      return;
    }
    const [existing] = await db
      .select()
      .from(customerAddressesTable)
      .where(
        and(
          eq(customerAddressesTable.id, id),
          eq(customerAddressesTable.customerId, resolved.customerId),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ ok: false, message: "Address not found" }); // i18n-ignore
      return;
    }
    await db
      .delete(customerAddressesTable)
      .where(eq(customerAddressesTable.id, id));

    // If we removed the default, promote the most recently updated remaining
    // address so the customer always has one default address selected.
    if (existing.isDefault) {
      const [next] = await db
        .select()
        .from(customerAddressesTable)
        .where(eq(customerAddressesTable.customerId, resolved.customerId))
        .orderBy(desc(customerAddressesTable.updatedAt))
        .limit(1);
      if (next) {
        await db
          .update(customerAddressesTable)
          .set({ isDefault: true, updatedAt: new Date() })
          .where(eq(customerAddressesTable.id, next.id));
      }
    }
    res.json({ ok: true });
  },
);

// POST /api/me/addresses/:id/default
router.post(
  "/me/addresses/:id/default",
  requireUserType(["customer", "team"]),
  async (req, res) => {
    const resolved = await resolveCustomerId(req, req.header("authorization"));
    if (!resolved.ok) {
      res
        .status(resolved.status)
        .json({ ok: false, message: resolved.message });
      return;
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id) || id <= 0) {
      res.status(400).json({ ok: false, message: "Invalid address id" }); // i18n-ignore
      return;
    }
    const [existing] = await db
      .select()
      .from(customerAddressesTable)
      .where(
        and(
          eq(customerAddressesTable.id, id),
          eq(customerAddressesTable.customerId, resolved.customerId),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ ok: false, message: "Address not found" }); // i18n-ignore
      return;
    }
    await db
      .update(customerAddressesTable)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        and(
          eq(customerAddressesTable.customerId, resolved.customerId),
          eq(customerAddressesTable.isDefault, true),
          ne(customerAddressesTable.id, id),
        ),
      );
    const [updated] = await db
      .update(customerAddressesTable)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(customerAddressesTable.id, id))
      .returning();
    res.json({ ok: true, address: serialize(updated) });
  },
);

export default router;
