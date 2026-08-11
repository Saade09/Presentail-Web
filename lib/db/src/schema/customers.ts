import {
  boolean,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Allowed values for the `gender` column. Kept open with `unspecified`
// so users can opt out, and validated at the API boundary before write.
export const CUSTOMER_GENDERS = ["female", "male", "unspecified"] as const;
export type CustomerGender = (typeof CUSTOMER_GENDERS)[number];

// Supported language codes for push notifications and other locale-aware copy.
// "en" is the default when the customer's preference is not recorded.
export const CUSTOMER_LANGS = ["en", "ar", "fr"] as const;
export type CustomerLang = (typeof CUSTOMER_LANGS)[number];

// Canonical customer record for the project. This is the source of truth for
// identity going forward; WooCommerce is treated as a downstream sync target
// (see `wcCustomerId`). Email is stored lowercased and trimmed and is unique.
// Phone is normalized best-effort to E.164 and used as a secondary lookup.
export const customersTable = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(),
    phoneE164: text("phone_e164"),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    country: text("country"),
    city: text("city"),
    wcCustomerId: integer("wc_customer_id"),
    authProvider: text("auth_provider"),
    authUserId: text("auth_user_id"),
    gender: text("gender"),
    birthday: date("birthday"),
    birthdayShareMonthDay: boolean("birthday_share_month_day").notNull().default(true),
    // Preferred language for push notifications and locale-aware server copy.
    // Defaults to "en". Set from the mobile app's active locale on sign-in /
    // registration. Valid values: "en" | "ar" | "fr" (CUSTOMER_LANGS).
    preferredLang: text("preferred_lang").notNull().default("en"),
    source: text("source").notNull().default("presentail.com"),
    // Stripe Customer ID — populated lazily on the first save-card opt-in.
    stripeCustomerId: text("stripe_customer_id"),
    // Stripe Customer ID on the Gulf account (AED / UAE shoppers).
    stripeCustomerIdGulf: text("stripe_customer_id_gulf"),
    // Set to NOW() when the account is deleted (anonymised). Sessions that
    // resolve to a row with deletedAt != null are rejected immediately so
    // old bearer tokens cannot access data after account deletion.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    // True once the account owner has confirmed ownership of the email
    // address. Defaults to true for accounts created via social/Clerk/WC
    // auth (those providers verify email themselves). Set to false for new
    // local password registrations until the verification link is clicked.
    // Orders are not attached to unverified accounts so a fraudulent
    // registration cannot pre-claim another user's order history.
    emailVerified: boolean("email_verified").notNull().default(true),
    // Stable Apple `sub` (subject) claim from the Apple ID JWT.
    // Stored on every Apple sign-in so we can resolve the account by Apple
    // identity if the email claim is ever absent (e.g. private-relay rotation).
    appleSub: text("apple_sub"),
    // scrypt-hashed password for locally-registered (password) accounts.
    // Null for social (Google/Apple) accounts that never set a password.
    passwordHash: text("password_hash"),
    // One-time token sent in the verification email. Hex-encoded 32-byte
    // random value. Cleared once the account is verified.
    emailVerificationToken: text("email_verification_token"),
    emailVerificationTokenExpiresAt: timestamp(
      "email_verification_token_expires_at",
      { withTimezone: true },
    ),
    // One-time token for the local password reset flow (used when
    // WC_AUTH_ENABLED=false and the account has a local scrypt password hash).
    // Hex-encoded 32-byte random value. Cleared once the reset is completed
    // or a new token is issued.  Expires after 1 hour.
    passwordResetToken: text("password_reset_token"),
    passwordResetTokenExpiresAt: timestamp(
      "password_reset_token_expires_at",
      { withTimezone: true },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: uniqueIndex("customers_email_idx").on(t.email),
    phoneIdx: index("customers_phone_idx").on(t.phoneE164),
    wcIdx: uniqueIndex("customers_wc_customer_idx").on(t.wcCustomerId),
    authIdx: index("customers_auth_idx").on(t.authProvider, t.authUserId),
  }),
);

export type Customer = typeof customersTable.$inferSelect;
export type InsertCustomer = typeof customersTable.$inferInsert;
