/**
 * E2E test: landmark (Address Book place) checkout flow — full journey
 *
 * Task 4662: the OS Address Book API still rejects our storefront key and
 * OS_ADDRESS_BOOK_ENABLED remains dark, so there is no live data to select
 * against. Per the task's fallback path, this spec stubs
 * /api/address-book/places/search at the network layer (page.route) and
 * exercises the complete journey in a real browser:
 *
 *   1. Cart + delivery location seeded (LB / Beirut / USD).
 *   2. Checkout step 1 in guest mode; district explicitly set to Beirut
 *      (fee $3 → total $68).
 *   3. Type a landmark query ("Casino") into the Delivery Details field —
 *      the debounced search fires and the suggestion dropdown renders.
 *   4. Explicitly click the suggested verified place (Casino du Liban,
 *      verified district: Jounieh).
 *   5. Assert the conversion to the verified-place card, the green
 *      "Delivery district updated" banner, the district picker moving to
 *      Jounieh, and the order summary re-pricing ($7 fee → total $72).
 *   6. Fill the follow-up internal-location detail + remaining step-1 fields.
 *   7. Complete a card payment (mock Stripe, stubbed payment-intent).
 *   8. Assert the POST /woo/order payload carries the structured
 *      addressBookPlace record (placeId, districtName, internalDetail,
 *      typedQuery, selectionSource) plus the Jounieh district + $7 fee, and
 *      that the flattened deliveryDetails/street string stays populated for
 *      legacy consumers.
 *
 * When live Address Book data becomes available, the same journey can be
 * re-verified against the real API by removing the places-search stub and
 * pointing the query at a known verified place.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CART_ITEM = {
  product: {
    id: "test-rose-bouquet",
    name: "Rose Bouquet",
    slug: "rose-bouquet",
    priceValue: 65,
    wcId: 0,
    image: { uri: "" },
    category: null,
  },
  quantity: 1,
};

const LOCATION = { countryCode: "LB", cityId: "lb-beirut" };
const VALID_LB_PHONE = "+96170000000";
const FAKE_ORDER_ID = "TEST-LB-LANDMARK-001";
const FAKE_PI_ID = "pi_test_landmark_success";
const FAKE_CLIENT_SECRET = "pi_test_landmark_success_secret_abc123";

const BEIRUT_FEE_USD = 3;
const JOUNIEH_FEE_USD = 7;
const SUBTOTAL_USD = 65;

/** Verified Address Book place returned by the stubbed search endpoint.
 *  Its verified district (Jounieh) differs from the shopper's current
 *  district (Beirut), so selecting it must trigger the district auto-change
 *  banner and a fee/summary re-price. */
const STUB_PLACE = {
  id: "place-casino-du-liban",
  name: "Casino du Liban",
  officialName: "Casino du Liban S.A.L.",
  area: "Maameltein",
  districtName: "Jounieh",
  districtCityId: "lb-jounieh",
  districtCityName: "Jounieh",
  countryCode: "LB",
  lat: 33.9922,
  lng: 35.6294,
  verified: true as const,
  followUpQuestion: "Where inside Casino du Liban?",
  followUpPlaceholder: "e.g. Main entrance, Salle des Ambassadeurs",
};

const LANDMARK_QUERY = "Casino";
const INTERNAL_DETAIL = "Main entrance, reception desk";

// ---------------------------------------------------------------------------
// Mock Stripe.js (same shape as checkout-full-flow.spec.ts)
// ---------------------------------------------------------------------------

const MOCK_STRIPE_SCRIPT = `
(function() {
  function MockStripeElement(type) {
    this._type = type;
  }
  MockStripeElement.prototype.mount = function(container) {
    if (container && typeof container.appendChild === 'function') {
      var div = document.createElement('div');
      div.setAttribute('data-mock-stripe-field', this._type);
      div.style.cssText = 'height:40px;border:1px solid #ccc;border-radius:4px;padding:8px;';
      container.appendChild(div);
    }
  };
  MockStripeElement.prototype.unmount = function() {};
  MockStripeElement.prototype.destroy = function() {};
  MockStripeElement.prototype.on = function() { return this; };
  MockStripeElement.prototype.off = function() { return this; };
  MockStripeElement.prototype.update = function() {};
  MockStripeElement.prototype.focus = function() {};
  MockStripeElement.prototype.blur = function() {};
  MockStripeElement.prototype.clear = function() {};

  function MockElements(stripe) {
    this._stripe = stripe;
    this._elements = {};
  }
  MockElements.prototype.create = function(type) {
    var el = new MockStripeElement(type);
    this._elements[type] = el;
    return el;
  };
  MockElements.prototype.getElement = function(type) {
    return this._elements[type] || new MockStripeElement(type);
  };
  MockElements.prototype.update = function() {};
  MockElements.prototype.destroy = function() {};
  MockElements.prototype.fetchUpdates = function() { return Promise.resolve({}); };
  MockElements.prototype.submit = function() { return Promise.resolve({}); };

  function MockStripe(publishableKey) {
    this._key = publishableKey;
    this._elementsInstance = null;
  }
  MockStripe.prototype.elements = function() {
    if (!this._elementsInstance) this._elementsInstance = new MockElements(this);
    return this._elementsInstance;
  };
  MockStripe.prototype.createToken = function() {
    return Promise.resolve({ token: { id: 'tok_mock' } });
  };
  MockStripe.prototype.createPaymentMethod = function() {
    return Promise.resolve({ paymentMethod: { id: 'pm_mock' } });
  };
  MockStripe.prototype.confirmCardPayment = function(clientSecret) {
    return Promise.resolve({
      paymentIntent: { id: '${FAKE_PI_ID}', status: 'succeeded', client_secret: clientSecret },
      error: undefined,
    });
  };
  MockStripe.prototype.paymentRequest = function() {
    return {
      canMakePayment: function() { return Promise.resolve(null); },
      on: function() {},
      off: function() {},
      show: function() {},
      update: function() {},
    };
  };
  MockStripe.prototype.confirmPayment = function() {
    return Promise.resolve({ error: null });
  };
  MockStripe.prototype.handleNextAction = function() {
    return Promise.resolve({
      paymentIntent: { id: '${FAKE_PI_ID}', status: 'succeeded' },
    });
  };
  MockStripe.prototype.retrievePaymentIntent = function(clientSecret) {
    return Promise.resolve({
      paymentIntent: { id: '${FAKE_PI_ID}', status: 'succeeded', client_secret: clientSecret },
    });
  };
  MockStripe.prototype._registerWrapper = function() {};
  MockStripe.prototype.registerAppInfo = function() {};

  window.Stripe = function(publishableKey) {
    return new MockStripe(publishableKey);
  };
})();
`;

// ---------------------------------------------------------------------------
// API stubs
// ---------------------------------------------------------------------------

const STUB_CURRENCIES = {
  currencies: [
    {
      code: "USD",
      name: "US Dollar",
      symbol: "$",
      symbolPosition: "left",
      spaceBetween: false,
      decimals: 2,
    },
  ],
  fallbackCode: "USD",
  countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
};

const STUB_FX_RATES = { ok: true, base: "USD", rates: { USD: 1 } };

/**
 * Two active LB cities with DIFFERENT fees so the place-driven district
 * change is observable in the order summary. The country-level free-delivery
 * threshold is set far above the cart subtotal so the fee is always charged
 * (the assertion would otherwise be masked by "FREE" rendering).
 */
const STUB_DELIVERY_LOCATIONS = {
  countries: [
    {
      id: "lb",
      name: "Lebanon",
      code: "LB",
      flag: "🇱🇧",
      currency: "USD",
      isActive: true,
      freeDeliveryThresholdUsd: 500,
      freeDeliveryEnabled: true,
      cities: [
        {
          id: "lb-beirut",
          name: "Beirut",
          isActive: true,
          fee: BEIRUT_FEE_USD,
          expressAvailable: false,
          // Explicit daytime startHour values matter: the fee logic falls
          // back to cutoffHour when startHour is missing, and a fallback
          // ≥ 21 triggers the $5 same-day night surcharge, skewing totals.
          timeSlots: [
            { label: "10:00–14:00", startHour: 10, endHour: 14, cutoffHour: 23 },
            { label: "14:00–18:00", startHour: 14, endHour: 18, cutoffHour: 23 },
          ],
        },
        {
          id: "lb-jounieh",
          name: "Jounieh",
          isActive: true,
          fee: JOUNIEH_FEE_USD,
          expressAvailable: false,
          timeSlots: [
            { label: "10:00–14:00", startHour: 10, endHour: 14, cutoffHour: 23 },
          ],
        },
      ],
    },
  ],
  dataStatus: "live",
};

type CapturedSearch = { q: string | null; country: string | null };

async function installStubs(
  page: Page,
  captured: { searches: CapturedSearch[]; orderPayload: Record<string, unknown> | null },
): Promise<void> {
  await page.route("**/api/currencies", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_CURRENCIES),
    }),
  );
  await page.route("**/api/fx/rates", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_FX_RATES),
    }),
  );
  await page.route("**/api/geo/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ countryCode: "LB", currencyCode: "USD", currency: "USD" }),
    }),
  );
  // 404 → useDeliveryConfig falls back to built-in defaults (a stubbed
  // {ok:true} body crashes FreeDeliveryBanner's threshold parsing).
  await page.route("**/api/delivery-config**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  await page.route("**/api/delivery-locations**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(STUB_DELIVERY_LOCATIONS),
    }),
  );
  await page.route("**/api/orders/next-id", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID }),
    }),
  );
  await page.route("**/api/checkout/payment-intent", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        clientSecret: FAKE_CLIENT_SECRET,
        orderId: FAKE_ORDER_ID,
        amount: (SUBTOTAL_USD + JOUNIEH_FEE_USD) * 100,
        currency: "USD",
      }),
    }),
  );
  // Pre-charge order-payload persistence (charged-but-lost-order net). The
  // card flow fails closed without a 2xx here, so the hermetic run stubs it.
  await page.route("**/api/checkout/klarna-pending", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true }),
    }),
  );
  // Best-effort pre-payment fee verification — 404 makes the client skip the
  // server comparison (otherwise real-server fees for a fake catalog item
  // could pop the price-changed confirm dialog mid-flow).
  await page.route("**/api/checkout/fees", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: "{}" }),
  );
  // Capture the finalized order payload — the addressBookPlace assertion
  // target. Fulfilled as success so the flow reaches order-confirmed.
  await page.route("**/api/woo/order", (route) => {
    try {
      const body = route.request().postData();
      if (body) captured.orderPayload = JSON.parse(body);
    } catch {
      /* ignore parse noise; assertion on null will fail loudly */
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, orderId: FAKE_ORDER_ID, couponDiscount: 0 }),
    });
  });

  // ── The stub under test: Address Book places search ─────────────────────
  // Mirrors the real route contract: 200 { ok: true, places: [...] } with
  // matches only for queries that hit the fixture place; empty otherwise.
  await page.route("**/api/address-book/places/search**", (route) => {
    const url = new URL(route.request().url());
    const q = url.searchParams.get("q");
    const country = url.searchParams.get("country");
    captured.searches.push({ q, country });
    const matches =
      typeof q === "string" &&
      STUB_PLACE.name.toLowerCase().includes(q.trim().toLowerCase());
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, places: matches ? [STUB_PLACE] : [] }),
    });
  });

  await page.route("**/js.stripe.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/javascript",
      body: MOCK_STRIPE_SCRIPT,
    }),
  );
  // Silence analytics noise.
  await page.route("**/api/analytics/**", (route) => route.fulfill({ status: 204, body: "" }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Concatenated text of every rendered order-total element (desktop sidebar,
 * mobile collapsed summary, sticky footer). Both layouts derive from the
 * same fee state, so polling the combined text is viewport-agnostic.
 */
async function totalsText(page: Page): Promise<string> {
  const parts: string[] = [];
  for (const id of ["text-total", "text-summary-collapsed-total", "text-footer-total"]) {
    parts.push(...(await page.getByTestId(id).allTextContents()));
  }
  return parts.join(" | ");
}

/** Step-1 continue CTA — desktop sidebar button vs mobile sticky footer. */
function continueCta(page: Page) {
  return page
    .getByTestId("button-continue-to-payment-sidebar")
    .or(page.getByTestId("button-continue-to-payment"))
    .locator("visible=true");
}

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

test.describe("Checkout — landmark place selection end-to-end (stubbed Address Book)", () => {
  test("type → suggest → select → district banner + fee update → follow-up → order carries addressBookPlace", async ({
    page,
  }) => {
    const captured: {
      searches: CapturedSearch[];
      orderPayload: Record<string, unknown> | null;
    } = { searches: [], orderPayload: null };

    await page.addInitScript(MOCK_STRIPE_SCRIPT);
    await page.addInitScript(
      ({ cart, location }) => {
        window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
        window.localStorage.setItem(
          "presentail_delivery_location_v1",
          JSON.stringify(location),
        );
        // Checkout requires a committed delivery window before it can create
        // a payment. Use tomorrow so this fixture remains bookable regardless
        // of the time the browser test runs; the tested place selection still
        // changes only the district and fee.
        const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
          .toISOString()
          .slice(0, 10);
        window.localStorage.setItem(
          "presentail_delivery_selection_v1",
          JSON.stringify({
            mode: "schedule",
            date: tomorrow,
            slotLabel: "10:00–14:00",
            slotId: null,
            serviceType: null,
            cityId: null,
            source: "user_selected",
          }),
        );
      },
      { cart: [CART_ITEM], location: LOCATION },
    );
    await installStubs(page, captured);

    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/en-lb/beirut/checkout?guest=1");

    // Belt-and-braces: dismiss the login dialog if it still appears.
    const guestBtn = page.getByTestId("button-checkout-as-guest");
    if (await guestBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await guestBtn.click();
    }

    // ── Step 1 · baseline: Beirut district, $3 fee ($68 total) ─────────────
    const recipientName = page.getByTestId("input-recipient-name");
    await expect(recipientName).toBeVisible({ timeout: 15_000 });

    // Deterministically commit the Beirut district (the seeded location
    // usually pre-fills it, but an explicit pick removes the race).
    const districtTrigger = page.getByTestId("select-district");
    await expect(districtTrigger).toBeVisible({ timeout: 10_000 });
    if (!(await districtTrigger.textContent())?.includes("Beirut")) {
      await districtTrigger.click();
      await page.getByTestId("option-district-lb-beirut").click();
    }
    await expect(districtTrigger).toContainText("Beirut");

    const baselineTotal = SUBTOTAL_USD + BEIRUT_FEE_USD; // 68
    await expect
      .poll(() => totalsText(page), { timeout: 10_000 })
      .toContain(String(baselineTotal));

    // ── Type the landmark query → suggestion dropdown ──────────────────────
    const addressField = page.getByTestId("input-recipient-address");
    await addressField.fill(LANDMARK_QUERY);

    const dropdown = page.getByTestId("dropdown-place-suggestions");
    await expect(dropdown).toBeVisible({ timeout: 10_000 });
    const option = page.getByTestId(`option-place-${STUB_PLACE.id}`);
    await expect(option).toBeVisible();
    await expect(option).toContainText(STUB_PLACE.name);
    await expect(option).toContainText("Verified");

    // The search request must be scoped to the delivery country.
    const lastSearch = captured.searches[captured.searches.length - 1];
    expect(lastSearch?.q).toBe(LANDMARK_QUERY);
    expect(lastSearch?.country).toBe("LB");

    // ── Explicit selection → card mode + district banner + re-price ────────
    await option.click();

    const placeCard = page.getByTestId("card-selected-place");
    await expect(placeCard).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("text-selected-place-name")).toHaveText(STUB_PLACE.name);
    await expect(page.getByTestId("text-selected-place-official")).toHaveText(
      STUB_PLACE.officialName,
    );

    // Green "Delivery district updated" banner names the place + district.
    const banner = page.getByTestId("notice-place-district-updated");
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(STUB_PLACE.name);
    await expect(banner).toContainText("Jounieh");

    // District picker moved to the place's verified district.
    await expect(districtTrigger).toContainText("Jounieh");

    // Order summary re-priced with the Jounieh fee ($72 total).
    const repricedTotal = SUBTOTAL_USD + JOUNIEH_FEE_USD; // 72
    await expect
      .poll(() => totalsText(page), { timeout: 10_000 })
      .toContain(String(repricedTotal));

    // ── Follow-up internal-location detail (required with a place) ─────────
    const detailInput = page.getByTestId("input-place-internal-detail");
    await expect(detailInput).toBeVisible();
    // The place's own follow-up question is used as the field label.
    await expect(
      page.locator('label[for="place-internal-detail"]'),
    ).toContainText(STUB_PLACE.followUpQuestion);
    await detailInput.fill(INTERNAL_DETAIL);

    // ── Remaining step-1 fields ─────────────────────────────────────────────
    await recipientName.fill("Ahmad");
    await page.getByTestId("input-recipient-phone").fill(VALID_LB_PHONE);
    await page.getByTestId("input-sender-first-name").fill("Test");
    await page.getByTestId("input-sender-email").fill("guest@example.com");
    await page.getByTestId("input-sender-phone").fill(VALID_LB_PHONE);

    const continueBtn = continueCta(page);
    await expect(continueBtn).toBeEnabled({ timeout: 5_000 });
    await continueBtn.click();

    // ── Step 2 · card payment via mock Stripe ──────────────────────────────
    const cardOption = page.getByTestId("option-payment-card");
    await expect(cardOption).toBeVisible({ timeout: 10_000 });
    await cardOption.click();

    await expect(
      page
        .locator('[data-mock-stripe-field="cardNumber"]')
        .or(page.locator('iframe[title*="card number" i]')),
    ).toBeVisible({ timeout: 20_000 });

    const submitBtn = page.getByTestId("button-submit-payment");
    await expect(submitBtn).toBeEnabled({ timeout: 5_000 });
    await submitBtn.click();

    await page.waitForURL(/\/order-confirmed/, { timeout: 20_000 });
    expect(page.url()).toContain("status=success");

    // ── Order payload carries the structured place record ──────────────────
    expect(captured.orderPayload, "POST /woo/order must have been captured").not.toBeNull();
    const payload = captured.orderPayload!;

    const place = payload.addressBookPlace as Record<string, unknown> | undefined;
    expect(place, "order payload must include addressBookPlace").toBeTruthy();
    expect(place?.placeId).toBe(STUB_PLACE.id);
    expect(place?.name).toBe(STUB_PLACE.name);
    expect(place?.officialName).toBe(STUB_PLACE.officialName);
    expect(place?.districtName).toBe("Jounieh");
    expect(place?.districtCityId).toBe(STUB_PLACE.districtCityId);
    expect(place?.lat).toBe(STUB_PLACE.lat);
    expect(place?.lng).toBe(STUB_PLACE.lng);
    expect(place?.internalDetail).toBe(INTERNAL_DETAIL);
    expect(place?.typedQuery).toBe(LANDMARK_QUERY);
    expect(place?.selectionSource).toBe("suggestion");

    // District + fee on the order match the place's verified district.
    expect(payload.district).toBe("Jounieh");
    expect(payload.districtFee).toBe(JOUNIEH_FEE_USD);
    expect(payload.totalUsd).toBe(SUBTOTAL_USD + JOUNIEH_FEE_USD);

    // Flattened legacy address string stays populated (WooCommerce/courier
    // consumers with no schema knowledge of Address Book places).
    for (const key of ["deliveryDetails", "street"] as const) {
      const flat = payload[key];
      expect(typeof flat, `${key} must be a string`).toBe("string");
      expect(flat as string).toContain(STUB_PLACE.name);
      expect(flat as string).toContain(INTERNAL_DETAIL);
    }

    // No uncaught JS errors during the journey.
    expect(
      pageErrors.filter((e) => !e.includes("ResizeObserver loop")),
      `unexpected page errors: ${pageErrors.join(" | ")}`,
    ).toEqual([]);
  });
});
