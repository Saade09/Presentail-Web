import { describe, expect, it } from "vitest";

import { searchOsAddressBookPlaces } from "./client";

const env =
  (
    globalThis as typeof globalThis & {
      process?: { env?: Record<string, string | undefined> };
    }
  ).process?.env ?? {};

/**
 * Opt-in live contract smoke test.
 *
 * Run with:
 *   PRESENTAIL_OS_API_KEY=... \
 *   OS_ADDRESS_BOOK_SMOKE_QUERY=... \
 *   [OS_ADDRESS_BOOK_SMOKE_EXPECTED_ID=...] \
 *   pnpm --filter @workspace/presentail-os run test:address-book-live
 *
 * The credential, query, and optional expected place id stay outside the
 * repository. The hermetic checkout browser test covers the complete explicit
 * selection, district reconciliation, repricing, and order-payload journey.
 */
describe.runIf(env.OS_ADDRESS_BOOK_LIVE_SMOKE === "1")(
  "Presentail OS Address Book — live contract",
  () => {
    it("returns a checkout-eligible place for a controlled query", async () => {
      const apiKey = env.PRESENTAIL_OS_API_KEY?.trim();
      const query = env.OS_ADDRESS_BOOK_SMOKE_QUERY?.trim();
      const expectedId = env.OS_ADDRESS_BOOK_SMOKE_EXPECTED_ID?.trim();

      if (!apiKey) {
        throw new Error(
          "PRESENTAIL_OS_API_KEY is required for the live Address Book smoke test.",
        );
      }
      if (!query) {
        throw new Error(
          "OS_ADDRESS_BOOK_SMOKE_QUERY is required for the live Address Book smoke test.",
        );
      }

      const { places } = await searchOsAddressBookPlaces(
        {
          apiKey,
          baseUrl: env.PRESENTAIL_OS_API_URL || undefined,
        },
        { q: query },
      );

      const selected = expectedId
        ? places.find((place) => place.id === expectedId)
        : places.find(
            (place) =>
              place.verified && place.published && place.checkoutEnabled,
          );

      expect(
        selected,
        "expected a checkout-eligible Address Book place",
      ).toBeTruthy();
      expect(selected).toMatchObject({
        verified: true,
        published: true,
        checkoutEnabled: true,
      });
    });
  },
);
