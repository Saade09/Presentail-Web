// Ad-hoc QA script for task: compact tappable preference rows on mobile checkout.
// Plain-node chromium.launch() (the playwright test runner stalls in this container).
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL || "http://localhost:80";
const EXE = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;

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
const STUB_CURRENCIES = {
  currencies: [
    { code: "USD", name: "US Dollar", symbol: "$", symbolPosition: "left", spaceBetween: false, decimals: 2 },
  ],
  fallbackCode: "USD",
  countryToCurrency: { LB: "USD", AE: "AED", CY: "EUR" },
};
const STUB_DELIVERY_LOCATIONS = {
  ok: true,
  locations: [
    {
      id: "lb-beirut",
      name: "Beirut",
      countryCode: "LB",
      currency: "USD",
      districts: [{ name: "Beirut Central", deliveryFeeUsd: 0 }],
      expressAvailable: false,
      timeSlots: [
        { label: "10:00–14:00", cutoffHour: 8 },
        { label: "14:00–18:00", cutoffHour: 12 },
      ],
    },
  ],
};

async function installStubs(page) {
  await page.route("**/api/currencies", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_CURRENCIES) }));
  await page.route("**/api/fx/rates", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, base: "USD", rates: { USD: 1 } }) }));
  await page.route("**/api/geo/**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ countryCode: "LB", currencyCode: "USD", currency: "USD" }) }));
  await page.route("**/api/delivery-config**", (r) => r.fulfill({ status: 404, body: "not found" }));
  await page.route("**/api/delivery-locations**", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(STUB_DELIVERY_LOCATIONS) }));
  await page.route("**/api/orders/next-id", (r) =>
    r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, orderId: "TEST-PREF-001" }) }));
  await page.route("**/js.stripe.com/**", (r) =>
    r.fulfill({ status: 200, contentType: "text/javascript", body: "window.Stripe = function(){return {};};" }));
  await page.route("**/api/analytics/**", (r) => r.fulfill({ status: 204, body: "" }));
}

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

async function newPage(browser, { width = 390, height = 844 } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();
  await page.addInitScript(({ cart, location }) => {
    window.localStorage.setItem("presentail_cart_v1", JSON.stringify(cart));
    window.localStorage.setItem("presentail_delivery_location_v1", JSON.stringify(location));
  }, { cart: [CART_ITEM], location: LOCATION });
  await installStubs(page);
  return { ctx, page };
}

async function openCheckout(page, path = "/en-lb/beirut/checkout?guest=1") {
  await page.goto(BASE + path, { waitUntil: "domcontentloaded" });
  const guestBtn = page.getByTestId("button-checkout-as-guest");
  if (await guestBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await guestBtn.click();
  }
  await page.getByTestId("check-whatsapp-updates-label").waitFor({ timeout: 20000 });
}

async function box(page, testId) {
  return page.getByTestId(testId).boundingBox();
}

async function run() {
  const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

  // ---------- Mobile (390px) EN: layout + interaction ----------
  {
    const { ctx, page } = await newPage(browser);
    await openCheckout(page);

    const wa = page.getByTestId("check-whatsapp-updates");
    const anon = page.getByTestId("check-identity-secret");

    check("defaults: whatsapp checked", await wa.isChecked());
    check("defaults: anonymous unchecked", !(await anon.isChecked()));

    // checkbox size ~24px
    const waBox = await box(page, "check-whatsapp-updates");
    const anonBox = await box(page, "check-identity-secret");
    check("whatsapp checkbox ~24px", Math.abs(waBox.width - 24) <= 1 && Math.abs(waBox.height - 24) <= 1, JSON.stringify(waBox));
    check("anon checkbox ~24px", Math.abs(anonBox.width - 24) <= 1 && Math.abs(anonBox.height - 24) <= 1, JSON.stringify(anonBox));

    // row heights >= 44
    const waLabel = await box(page, "check-whatsapp-updates-label");
    const anonLabel = await box(page, "check-identity-secret-label");
    check("whatsapp row >=44px tall", waLabel.height >= 44, `h=${waLabel.height}`);
    check("anon row >=44px tall", anonLabel.height >= 44, `h=${anonLabel.height}`);
    check("rows full width & aligned", Math.abs(waLabel.x - anonLabel.x) < 1 && Math.abs(waLabel.width - anonLabel.width) < 1);

    // checkboxes left-aligned with each other
    check("checkboxes x-aligned", Math.abs(waBox.x - anonBox.x) < 1, `wa=${waBox.x} anon=${anonBox.x}`);

    // helper indent: whatsapp helper starts beneath title text (checkbox + gap + icon + gap)
    const waHint = await box(page, "whatsapp-updates-hint");
    const anonHint = await box(page, "identity-secret-hint");
    check("wa helper indented past icon", waHint.x > waBox.x + waBox.width + 12 + 16, `hint.x=${waHint.x}`);
    check("anon helper starts under title", anonHint.x > anonBox.x + anonBox.width + 8, `hint.x=${anonHint.x}`);

    // row separation ~16px (label paddings) between whatsapp label bottom and anon label top
    const gap = anonLabel.y - (waLabel.y + waLabel.height);
    check("row separation small (divider between)", gap >= -1 && gap <= 6, `gap=${gap}`);

    // divider presence at max-md
    const borderTop = await page.getByTestId("check-identity-secret-label").evaluate((el) => {
      const wrap = el.parentElement;
      const cs = getComputedStyle(wrap);
      return cs.borderTopWidth + " " + cs.borderTopStyle;
    });
    check("divider present on anon wrapper", borderTop.startsWith("1px solid"), borderTop);

    // ---- interaction: tap title, helper, icon, whitespace ----
    // Scroll the rows into view so raw mouse coordinates below are valid.
    await page.getByTestId("check-whatsapp-updates-label").scrollIntoViewIfNeeded();
    // 1) tap whatsapp title text → unchecks
    await page.getByTestId("check-whatsapp-updates-label").getByText("Get order updates on WhatsApp", { exact: true }).tap();
    check("tap wa title toggles off", !(await wa.isChecked()));
    // 2) tap helper text → checks again
    await page.getByTestId("whatsapp-updates-hint").tap();
    check("tap wa helper toggles on", await wa.isChecked());
    // 3) tap the WhatsApp icon (svg) → toggles
    await page.locator('[data-testid="check-whatsapp-updates-label"] svg').tap();
    check("tap wa icon toggles off", !(await wa.isChecked()));
    // 4) tap whitespace at far right of row → toggles (fresh viewport-relative box)
    const waLabelNow = await box(page, "check-whatsapp-updates-label");
    await page.mouse.click(waLabelNow.x + waLabelNow.width - 10, waLabelNow.y + waLabelNow.height / 2);
    check("tap wa whitespace toggles on", await wa.isChecked());
    // 5) tap checkbox directly → exactly one toggle
    await wa.tap();
    check("tap wa checkbox toggles once (off)", !(await wa.isChecked()));
    await wa.tap();
    check("tap wa checkbox toggles once (on)", await wa.isChecked());

    // anonymous row independence
    check("anon still unchecked after wa taps", !(await anon.isChecked()));
    await page.getByTestId("check-identity-secret-label").getByText("Send this gift anonymously", { exact: true }).tap();
    check("tap anon title toggles on", await anon.isChecked());
    check("wa unaffected by anon tap", await wa.isChecked());
    await page.getByTestId("identity-secret-hint").tap();
    check("tap anon helper toggles off", !(await anon.isChecked()));

    // rapid taps: 4 taps → back to same state (even count, no double-fire per tap)
    const before = await anon.isChecked();
    for (let i = 0; i < 4; i++) {
      await page.getByTestId("check-identity-secret-label").getByText("Send this gift anonymously", { exact: true }).tap();
    }
    check("rapid 4 taps -> same state", (await anon.isChecked()) === before);

    // keyboard: focus checkbox, Space toggles; row shows focus ring
    await wa.focus();
    await page.keyboard.press("Space");
    check("keyboard Space toggles wa", !(await wa.isChecked()));
    await page.keyboard.press("Space"); // restore

    // Accessible name = title only; helper arrives once as the description.
    const waName = await wa.evaluate((el) => {
      const lbl = document.getElementById(el.getAttribute("aria-labelledby"));
      return lbl ? lbl.textContent.trim() : null;
    });
    check("wa accessible name is title only", waName === "Get order updates on WhatsApp", waName);
    const anonName = await anon.evaluate((el) => {
      const lbl = document.getElementById(el.getAttribute("aria-labelledby"));
      return lbl ? lbl.textContent.trim() : null;
    });
    check("anon accessible name is title only", anonName === "Send this gift anonymously", anonName);
    const waDesc = await wa.evaluate((el) => {
      const d = document.getElementById(el.getAttribute("aria-describedby"));
      return d ? d.textContent.trim() : null;
    });
    check("wa description is helper", (waDesc || "").startsWith("We'll send order"), waDesc);

    // WhatsApp icon not separately focusable
    const iconFocusable = await page.locator('[data-testid="check-whatsapp-updates-label"] svg').evaluate((el) =>
      el.matches(":focus") || el.tabIndex >= 0);
    check("wa icon not focusable", !iconFocusable);

    // screenshot of the sender card
    await page.getByTestId("check-whatsapp-updates-label").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/pref-rows-mobile-en.png" });
    await ctx.close();
  }

  // ---------- Mobile (320px) EN: narrow wrap check ----------
  {
    const { ctx, page } = await newPage(browser, { width: 320, height: 700 });
    await openCheckout(page);
    const waBox = await box(page, "check-whatsapp-updates");
    const waHint = await box(page, "whatsapp-updates-hint");
    const waLabel = await box(page, "check-whatsapp-updates-label");
    check("320px: no overlap hint/checkbox", waHint.x > waBox.x + waBox.width, `hint.x=${waHint.x}`);
    // NOTE: the page itself has a pre-existing 39px horizontal overflow at 320px
    // (sign-in card's nowrap buttons — unrelated to this task), so assert the
    // rows stay inside their own card's content box rather than the viewport.
    const cardRight = await page.getByTestId("check-whatsapp-updates-label").evaluate((el) => {
      const card = el.closest(".bg-white.rounded-2xl");
      const r = card.getBoundingClientRect();
      const cs = getComputedStyle(card);
      return r.right - parseFloat(cs.paddingRight);
    });
    check("320px: label fits card content", waLabel.x + waLabel.width <= cardRight + 1,
      `label right=${waLabel.x + waLabel.width}, card content right=${cardRight}`);
    await page.getByTestId("check-whatsapp-updates-label").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: "/tmp/pref-rows-mobile-320-en.png" });
    await ctx.close();
  }

  // ---------- Mobile (390px) AR: RTL mirroring ----------
  {
    const { ctx, page } = await newPage(browser);
    await openCheckout(page, "/ar-lb/beirut/checkout?guest=1");
    const dir = await page.evaluate(() => document.documentElement.dir);
    check("ar: document dir=rtl", dir === "rtl");
    const waBox = await box(page, "check-whatsapp-updates");
    const waLabel = await box(page, "check-whatsapp-updates-label");
    const waHint = await box(page, "whatsapp-updates-hint");
    // RTL: checkbox on the far right of the row
    check("ar: checkbox on right edge", waBox.x + waBox.width > waLabel.x + waLabel.width - 30,
      `cb right=${waBox.x + waBox.width}, label right=${waLabel.x + waLabel.width}`);
    // helper indented from the right (its right edge is left of the checkbox's left edge)
    check("ar: helper clear of checkbox", waHint.x + waHint.width < waBox.x, `hint right=${waHint.x + waHint.width}, cb left=${waBox.x}`);
    const wa = page.getByTestId("check-whatsapp-updates");
    const wasChecked = await wa.isChecked();
    await page.getByTestId("whatsapp-updates-hint").tap();
    check("ar: full-row tap toggles", (await wa.isChecked()) !== wasChecked);
    await page.getByTestId("check-whatsapp-updates-label").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/pref-rows-mobile-ar.png" });
    await ctx.close();
  }

  // ---------- Tablet (820px): unchanged compact styling must NOT apply ----------
  {
    const { ctx, page } = await newPage(browser, { width: 820, height: 1180 });
    await openCheckout(page);
    const waBox = await box(page, "check-whatsapp-updates");
    check("tablet: whatsapp checkbox stays 16px", Math.abs(waBox.width - 16) <= 1, JSON.stringify(waBox));
    const borderTop = await page.getByTestId("check-identity-secret-label").evaluate((el) => {
      const cs = getComputedStyle(el.parentElement);
      return cs.borderTopWidth;
    });
    check("tablet: no divider", borderTop === "0px", borderTop);
    await page.screenshot({ path: "/tmp/pref-rows-tablet.png" });
    await ctx.close();
  }

  // ---------- Desktop (1280px): desktop anon block visible, mobile block hidden ----------
  {
    const { ctx, page } = await newPage(browser, { width: 1280, height: 900 });
    await openCheckout(page);
    const desktopAnonVisible = await page.getByTestId("check-anonymous-gift").isVisible();
    const mobileAnonVisible = await page.getByTestId("check-identity-secret").isVisible();
    check("desktop: desktop anon block visible", desktopAnonVisible);
    check("desktop: mobile anon block hidden", !mobileAnonVisible);
    const waBox = await box(page, "check-whatsapp-updates");
    check("desktop: whatsapp checkbox stays 16px", Math.abs(waBox.width - 16) <= 1, JSON.stringify(waBox));
    await ctx.close();
  }

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
