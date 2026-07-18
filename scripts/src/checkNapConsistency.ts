/**
 * checkNapConsistency
 *
 * Verifies that the NAP (Name, Address, Phone) contact details in
 * `locationData.mjs` exactly match the constants defined in `Contact.tsx`.
 * Fails with exit code 1 if any mismatch is detected so a CI build catches
 * drift before it reaches production schema.
 *
 * Rules checked
 * ─────────────
 * 1. LOCATION_DATA["lb"].phone  must equal PHONE_E164 in Contact.tsx
 * 2. LOCATION_DATA["ae"].phone  must equal PHONE_E164 in Contact.tsx
 * 3. LOCATION_DATA["cy"].phone  must equal PHONE_E164 in Contact.tsx
 * 4. LOCATION_DATA["lb"].email  must equal SUPPORT_EMAIL in Contact.tsx
 * 5. LOCATION_DATA["ae"].email  must equal SUPPORT_EMAIL in Contact.tsx
 * 6. LOCATION_DATA["cy"].email  must equal SUPPORT_EMAIL in Contact.tsx
 *
 * Contact.tsx is the user-visible source of truth; locationData.mjs feeds the
 * JSON-LD schema. They must stay in sync. When they diverge, search engines
 * see one phone/email and customers see another — the definition of a NAP
 * inconsistency.
 *
 * Usage: pnpm --filter @workspace/scripts run check-nap-consistency
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const LOCATION_DATA_PATH = path.resolve(
  __dirname,
  "../../artifacts/presentail-web/src/lib/locationData.mjs",
);
const CONTACT_TSX = path.resolve(
  __dirname,
  "../../artifacts/presentail-web/src/pages/Contact.tsx",
);

interface LocationEntry {
  phone: string;
  email: string;
  openingHours: string[];
  priceRange: string;
  serviceAreas: string[];
  currenciesAccepted: string;
  paymentAccepted: string;
}

function extractStringConst(source: string, name: string): string | null {
  const m = source.match(new RegExp(`const\\s+${name}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`));
  return m ? m[1] : null;
}

async function main(): Promise<void> {
  const locDataMod = (await import(pathToFileURL(LOCATION_DATA_PATH).href)) as {
    LOCATION_DATA: Record<string, LocationEntry>;
  };
  const { LOCATION_DATA } = locDataMod;

  if (!LOCATION_DATA || typeof LOCATION_DATA !== "object") {
    console.error("❌ Could not load LOCATION_DATA from locationData.mjs");
    process.exit(1);
  }

  const source = fs.readFileSync(CONTACT_TSX, "utf-8");

  const contactPhone = extractStringConst(source, "PHONE_E164");
  const contactEmail = extractStringConst(source, "SUPPORT_EMAIL");

  if (!contactPhone) {
    console.error("❌ Could not extract PHONE_E164 from Contact.tsx");
    process.exit(1);
  }
  if (!contactEmail) {
    console.error("❌ Could not extract SUPPORT_EMAIL from Contact.tsx");
    process.exit(1);
  }

  const errors: string[] = [];
  const countries = ["lb", "ae", "cy"] as const;

  for (const cc of countries) {
    const loc = LOCATION_DATA[cc];
    if (!loc) {
      errors.push(`LOCATION_DATA["${cc}"] is missing`);
      continue;
    }
    if (loc.phone !== contactPhone) {
      errors.push(
        `LOCATION_DATA["${cc}"].phone = "${loc.phone}" but Contact.tsx PHONE_E164 = "${contactPhone}"`,
      );
    }
    if (loc.email !== contactEmail) {
      errors.push(
        `LOCATION_DATA["${cc}"].email = "${loc.email}" but Contact.tsx SUPPORT_EMAIL = "${contactEmail}"`,
      );
    }
  }

  if (errors.length > 0) {
    console.error("❌ NAP inconsistency detected — JSON-LD schema and Contact page are out of sync:\n");
    for (const e of errors) {
      console.error(`  • ${e}`);
    }
    console.error(
      "\nFix: update locationData.mjs to match the phone/email in Contact.tsx, or vice versa.",
    );
    process.exit(1);
  }

  console.log(
    `✓ NAP consistency check passed — phone and email match Contact.tsx for all ${countries.length} countries.`,
  );
}

main().catch((err) => {
  console.error("❌ Unexpected error:", err);
  process.exit(1);
});
