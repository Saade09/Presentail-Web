import {
  index,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const partnerApplicationsTable = pgTable(
  "partner_applications",
  {
    id: serial("id").primaryKey(),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    country: text("country").notNull(),
    city: text("city").notNull(),
    brandName: text("brand_name").notNull(),
    website: text("website").notNull(),
    categories: text("categories").array().notNull(),
    otherCategory: text("other_category"),
    socialMedia: text("social_media"),
    contactFirstName: text("contact_first_name").notNull(),
    contactLastName: text("contact_last_name").notNull(),
    contactRole: text("contact_role").notNull(),
    email: text("email").notNull(),
    dialCode: text("dial_code").notNull(),
    phone: text("phone").notNull(),
    brandProfileUrl: text("brand_profile_url").notNull(),
    productListUrl: text("product_list_url").notNull(),
  },
  (t) => ({
    submittedAtIdx: index("partner_applications_submitted_at_idx").on(t.submittedAt),
    emailIdx: index("partner_applications_email_idx").on(t.email),
  }),
);

export type PartnerApplication = typeof partnerApplicationsTable.$inferSelect;
export type InsertPartnerApplication = typeof partnerApplicationsTable.$inferInsert;
