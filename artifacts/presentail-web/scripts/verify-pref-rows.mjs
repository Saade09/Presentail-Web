// Ad-hoc QA script for checkout preference rows across responsive breakpoints.
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
  const mobile = (page.viewportSize()?.width ?? 0) < 768;
  await page.getByTestId(mobile ? "switch-whatsapp-updates-row" : "check-whatsapp-updates-label")
    .waitFor({ timeout: 20000 });
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

    const wa = page.getByTestId("switch-whatsapp-updates");
    const anon = page.getByTestId("switch-identity-secret");
    const waCheckbox = page.getByTestId("check-whatsapp-updates");
    const anonCheckbox = page.getByTestId("check-identity-secret");

    check("defaults: whatsapp checked",
      await wa.isChecked() && await waCheckbox.isChecked());
    check("defaults: anonymous unchecked",
      !(await anon.isChecked()) && !(await anonCheckbox.isChecked()));

    // The visible mobile controls are switches; the desktop checkboxes remain
    // hidden state mirrors for the shared checkout values.
    const waBox = await box(page, "switch-whatsapp-updates");
    const anonBox = await box(page, "switch-identity-secret");
    check("whatsapp switch 36x20px", Math.abs(waBox.width - 36) <= 1 && Math.abs(waBox.height - 20) <= 1, JSON.stringify(waBox));
    check("anon switch 36x20px", Math.abs(anonBox.width - 36) <= 1 && Math.abs(anonBox.height - 20) <= 1, JSON.stringify(anonBox));

    // row heights >= 44
    const waLabel = await box(page, "switch-whatsapp-updates-row");
    const anonLabel = await box(page, "switch-identity-secret-row");
    check("whatsapp row >=44px tall", waLabel.height >= 44, `h=${waLabel.height}`);
    check("anon row >=44px tall", anonLabel.height >= 44, `h=${anonLabel.height}`);
    check("rows full width & aligned", Math.abs(waLabel.x - anonLabel.x) < 1 && Math.abs(waLabel.width - anonLabel.width) < 1);

    // switches are right-aligned with each other
    check("switches x-aligned", Math.abs(waBox.x - anonBox.x) < 1, `wa=${waBox.x} anon=${anonBox.x}`);

    // helper indent: whatsapp helper starts beneath title text (checkbox + gap + icon + gap)
    const waHint = await box(page, "switch-whatsapp-updates-hint");
    const anonHint = await box(page, "switch-identity-secret-hint");
    check("wa helper stays inside row", waHint.x > waLabel.x, `hint.x=${waHint.x}`);
    check("anon helper stays inside row", anonHint.x > anonLabel.x, `hint.x=${anonHint.x}`);

    // The existing mobile stack uses space-y-3 between bordered rows.
    const gap = anonLabel.y - (waLabel.y + waLabel.height);
    check("mobile row separation stays 12px", gap >= 11 && gap <= 13, `gap=${gap}`);

    // divider presence at max-md
    const borderTop = await page.getByTestId("switch-identity-secret-row").evaluate((el) => {
      const cs = getComputedStyle(el);
      return cs.borderTopWidth + " " + cs.borderTopStyle;
    });
    check("mobile anon row keeps its border", borderTop.startsWith("1px solid"), borderTop);

    // ---- interaction: tap title, helper, icon, whitespace ----
    // Scroll the rows into view so raw mouse coordinates below are valid.
    await page.getByTestId("switch-whatsapp-updates-row").scrollIntoViewIfNeeded();
    // 1) tap whatsapp title text → unchecks
    await page.getByTestId("switch-whatsapp-updates-row").getByText("WhatsApp order updates", { exact: true }).tap();
    check("tap wa title toggles off", !(await wa.isChecked()));
    // 2) tap helper text → checks again
    await page.getByTestId("switch-whatsapp-updates-row").getByTestId("switch-whatsapp-updates-hint").tap();
    check("tap wa helper toggles on", await wa.isChecked());
    // 3) tap the WhatsApp icon (svg) → toggles
    await page.locator('[data-testid="switch-whatsapp-updates-row"] svg').tap();
    check("tap wa icon toggles off", !(await wa.isChecked()));
    // 4) tap whitespace at far right of row → toggles (fresh viewport-relative box)
    const waLabelNow = await box(page, "switch-whatsapp-updates-row");
    await page.mouse.click(waLabelNow.x + waLabelNow.width - 10, waLabelNow.y + waLabelNow.height / 2);
    check("tap wa whitespace toggles on", await wa.isChecked());
    // 5) tap switch directly → exactly one toggle
    await wa.tap();
    check("tap wa switch toggles once (off)", !(await wa.isChecked()));
    await wa.tap();
    check("tap wa switch toggles once (on)", await wa.isChecked());

    // anonymous row independence
    check("anon still unchecked after wa taps", !(await anon.isChecked()));
    await page.getByTestId("switch-identity-secret-row").getByText("Send anonymously", { exact: true }).tap();
    check("tap anon title toggles on", await anon.isChecked());
    check("wa unaffected by anon tap", await wa.isChecked());
    await page.getByTestId("switch-identity-secret-row").getByTestId("switch-identity-secret-hint").tap();
    check("tap anon helper toggles off", !(await anon.isChecked()));

    // rapid taps: 4 taps → back to same state (even count, no double-fire per tap)
    const before = await anon.isChecked();
    for (let i = 0; i < 4; i++) {
      await page.getByTestId("switch-identity-secret-row").getByText("Send anonymously", { exact: true }).tap();
    }
    check("rapid 4 taps -> same state", (await anon.isChecked()) === before);

    // keyboard: focus switch, Space toggles; row shows focus ring
    await wa.focus();
    await page.keyboard.press("Space");
    check("keyboard Space toggles wa", !(await wa.isChecked()));
    await page.keyboard.press("Space"); // restore

    // Accessible name = title only; helper arrives once as the description.
    const waName = await wa.evaluate((el) => {
      const lbl = document.getElementById(el.getAttribute("aria-labelledby"));
      return lbl ? lbl.textContent.trim() : null;
    });
    check("wa accessible name is title only", waName === "WhatsApp order updates", waName);
    const anonName = await anon.evaluate((el) => {
      const lbl = document.getElementById(el.getAttribute("aria-labelledby"));
      return lbl ? lbl.textContent.trim() : null;
    });
    check("anon accessible name is title only", anonName === "Send anonymously", anonName);
    const waDesc = await wa.evaluate((el) => {
      const d = document.getElementById(el.getAttribute("aria-describedby"));
      return d ? d.textContent.trim() : null;
    });
    check("wa description is helper", (waDesc || "").startsWith("Order and delivery updates"), waDesc);

    // WhatsApp icon not separately focusable
    const iconFocusable = await page.locator('[data-testid="switch-whatsapp-updates-row"] svg').evaluate((el) =>
      el.matches(":focus") || el.tabIndex >= 0);
    check("wa icon not focusable", !iconFocusable);

    // screenshot of the sender card
    await page.getByTestId("switch-whatsapp-updates-row").scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    await page.screenshot({ path: "/tmp/pref-rows-mobile-en.png" });
    await ctx.close();
  }

  // ---------- Mobile (320px) EN: narrow wrap check ----------
  {
    const { ctx, page } = await newPage(browser, { width: 320, height: 700 });
    await openCheckout(page);
    const waBox = await box(page, "switch-whatsapp-updates");
    const waHint = await box(page, "switch-whatsapp-updates-hint");
    const waLabel = await box(page, "switch-whatsapp-updates-row");
    check("320px: no overlap hint/switch",
      waHint.x + waHint.width < waBox.x, `hint.right=${waHint.x + waHint.width} switch.x=${waBox.x}`);
    // NOTE: the page itself has a pre-existing 39px horizontal overflow at 320px
    // (sign-in card's nowrap buttons — unrelated to this task), so assert the
    // rows stay inside their own card's content box rather than the viewport.
    const cardRight = await page.getByTestId("switch-whatsapp-updates-row").evaluate((el) => {
      const card = el.closest(".bg-white.rounded-2xl");
      const r = card.getBoundingClientRect();
      const cs = getComputedStyle(card);
      return r.right - parseFloat(cs.paddingRight);
    });
    check("320px: label fits card content", waLabel.x + waLabel.width <= cardRight + 1,
      `label right=${waLabel.x + waLabel.width}, card content right=${cardRight}`);
    await page.getByTestId("switch-whatsapp-updates-row").scrollIntoViewIfNeeded();
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
    const waBox = await box(page, "switch-whatsapp-updates");
    const waLabel = await box(page, "switch-whatsapp-updates-row");
    const waHint = await box(page, "switch-whatsapp-updates-hint");
    // RTL: switch moves to the far left while the decorative icon starts at right.
    check("ar: switch on left edge", waBox.x < waLabel.x + 50,
      `switch.x=${waBox.x}, label.x=${waLabel.x}`);
    check("ar: helper clear of switch", waHint.x > waBox.x + waBox.width,
      `hint.x=${waHint.x}, switch.right=${waBox.x + waBox.width}`);
    const wa = page.getByTestId("switch-whatsapp-updates");
    const wasChecked = await wa.isChecked();
    await page.getByTestId("switch-whatsapp-updates-hint").tap();
    check("ar: full-row tap toggles", (await wa.isChecked()) !== wasChecked);
    await page.getByTestId("switch-whatsapp-updates-row").scrollIntoViewIfNeeded();
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
    const tabletStyles = await page.getByTestId("check-whatsapp-updates-label").evaluate((label) => {
      const input = label.querySelector("input");
      const title = label.querySelector("#whatsapp-updates-title");
      const hint = label.querySelector("#whatsapp-updates-hint");
      const icon = label.querySelector("svg");
      const text = label.querySelector('[data-testid="desktop-whatsapp-updates-text"]');
      return {
        alignItems: getComputedStyle(label).alignItems,
        inputMarginTop: getComputedStyle(input).marginTop,
        titleDisplay: getComputedStyle(title).display,
        hintMarginTop: getComputedStyle(hint).marginTop,
        iconPosition: getComputedStyle(icon).position,
        textPaddingInlineStart: getComputedStyle(text).paddingInlineStart,
      };
    });
    check("tablet: WhatsApp row keeps pre-desktop alignment",
      tabletStyles.alignItems === "flex-start" &&
      tabletStyles.inputMarginTop === "4px" &&
      tabletStyles.titleDisplay === "flex" &&
      tabletStyles.hintMarginTop === "2px" &&
      tabletStyles.iconPosition === "static" &&
      tabletStyles.textPaddingInlineStart === "0px",
      JSON.stringify(tabletStyles));
    await page.screenshot({ path: "/tmp/pref-rows-tablet.png" });
    await ctx.close();
  }

  // ---------- Breakpoint boundary: 767px mobile / 768px tablet ----------
  for (const width of [767, 768]) {
    const { ctx, page } = await newPage(browser, { width, height: 1000 });
    await openCheckout(page);
    const mobileRowsVisible =
      await page.getByTestId("switch-whatsapp-updates-row").isVisible() &&
      await page.getByTestId("switch-identity-secret-row").isVisible();
    const tabletWaVisible = await page.getByTestId("check-whatsapp-updates-label").isVisible();
    const tabletAnonVisible = await page.getByTestId("check-identity-secret-label").isVisible();
    const desktopAnonVisible = await page.getByTestId("check-anonymous-gift-label").isVisible();
    check(`${width}px: responsive preference variant is unchanged`,
      width === 767
        ? mobileRowsVisible && !tabletWaVisible && !tabletAnonVisible && !desktopAnonVisible
        : !mobileRowsVisible && tabletWaVisible && tabletAnonVisible && !desktopAnonVisible);
    await ctx.close();
  }

  // ---------- Desktop (1024px + 1280px): aligned two-line preference rows ----------
  for (const width of [1024, 1280]) {
    const { ctx, page } = await newPage(browser, { width, height: 900 });
    await openCheckout(page);

    const wa = page.getByTestId("check-whatsapp-updates");
    const anon = page.getByTestId("check-anonymous-gift");
    const waLabel = page.getByTestId("check-whatsapp-updates-label");
    const anonLabel = page.getByTestId("check-anonymous-gift-label");
    const waTitle = page.locator("#whatsapp-updates-title");
    const anonTitle = page.getByTestId("anonymous-gift-title");
    const waHint = page.getByTestId("whatsapp-updates-hint");
    const anonHint = page.getByTestId("anonymous-gift-hint");
    const waIcon = page.getByTestId("whatsapp-icon-desktop");
    const anonIcon = page.getByTestId("identity-secret-icon-desktop");

    check(`desktop ${width}: desktop rows visible`, await wa.isVisible() && await anon.isVisible());
    check(`desktop ${width}: mobile switch rows hidden`,
      !(await page.getByTestId("switch-whatsapp-updates").isVisible()) &&
      !(await page.getByTestId("switch-identity-secret").isVisible()));
    check(`desktop ${width}: default states preserved`, await wa.isChecked() && !(await anon.isChecked()));
    check(`desktop ${width}: checkbox size 16px`,
      Math.abs((await box(page, "check-whatsapp-updates")).width - 16) <= 1 &&
      Math.abs((await box(page, "check-anonymous-gift")).width - 16) <= 1);

    const waLabelBox = await waLabel.boundingBox();
    const anonLabelBox = await anonLabel.boundingBox();
    check(`desktop ${width}: rows remain in order`,
      waLabelBox.y < anonLabelBox.y, `wa=${waLabelBox.y} anon=${anonLabelBox.y}`);

    const waTitleBox = await waTitle.boundingBox();
    const anonTitleBox = await anonTitle.boundingBox();
    const waHintBox = await waHint.boundingBox();
    const anonHintBox = await anonHint.boundingBox();
    const waTextCenter = (waTitleBox.y + waHintBox.y + waHintBox.height) / 2;
    const anonTextCenter = (anonTitleBox.y + anonHintBox.y + anonHintBox.height) / 2;
    const waInputBox = await wa.boundingBox();
    const anonInputBox = await anon.boundingBox();
    const waIconBox = await waIcon.boundingBox();
    const anonIconBox = await anonIcon.boundingBox();

    check(`desktop ${width}: title/helper gap is compact`,
      waHintBox.y - (waTitleBox.y + waTitleBox.height) >= 3 &&
      waHintBox.y - (waTitleBox.y + waTitleBox.height) <= 5 &&
      anonHintBox.y - (anonTitleBox.y + anonTitleBox.height) >= 3 &&
      anonHintBox.y - (anonTitleBox.y + anonTitleBox.height) <= 5);
    check(`desktop ${width}: helper columns align`,
      Math.abs(waTitleBox.x - waHintBox.x) <= 1 &&
      Math.abs(anonTitleBox.x - anonHintBox.x) <= 1 &&
      Math.abs(waHintBox.x - anonHintBox.x) <= 1,
      `wa=${waHintBox.x} anon=${anonHintBox.x}`);
    check(`desktop ${width}: controls center to full text blocks`,
      Math.abs((waInputBox.y + waInputBox.height / 2) - waTextCenter) <= 1.5 &&
      Math.abs((waIconBox.y + waIconBox.height / 2) - waTextCenter) <= 1.5 &&
      Math.abs((anonInputBox.y + anonInputBox.height / 2) - anonTextCenter) <= 1.5 &&
      Math.abs((anonIconBox.y + anonIconBox.height / 2) - anonTextCenter) <= 1.5);
    check(`desktop ${width}: helper copy stays single-line`,
      waHintBox.height <= 20 && anonHintBox.height <= 20,
      `wa=${waHintBox.height} anon=${anonHintBox.height}`);

    // Click targets and independent state changes.
    await waHint.click();
    check(`desktop ${width}: clicking WhatsApp helper unchecks only WhatsApp`,
      !(await wa.isChecked()) && !(await anon.isChecked()));
    await anonTitle.click();
    check(`desktop ${width}: clicking anonymous title checks only anonymous`,
      !(await wa.isChecked()) && await anon.isChecked());
    await wa.focus();
    check(`desktop ${width}: WhatsApp receives keyboard focus`, await wa.evaluate((el) => el === document.activeElement));
    await page.keyboard.press("Space");
    check(`desktop ${width}: Space checks WhatsApp independently`,
      await wa.isChecked() && await anon.isChecked());
    await anon.focus();
    await page.keyboard.press("Space");
    check(`desktop ${width}: Space unchecks anonymous independently`,
      await wa.isChecked() && !(await anon.isChecked()));

    await page.evaluate(() => {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    });
    await page.screenshot({ path: `/tmp/pref-rows-desktop-${width}.png` });
    await ctx.close();
  }

  // ---------- Desktop RTL (1280px): logical icon/text alignment ----------
  {
    const { ctx, page } = await newPage(browser, { width: 1280, height: 900 });
    await openCheckout(page, "/ar-lb/beirut/checkout?guest=1");
    const dir = await page.evaluate(() => document.documentElement.dir);
    const waInput = await box(page, "check-whatsapp-updates");
    const anonInput = await box(page, "check-anonymous-gift");
    const waIcon = await box(page, "whatsapp-icon-desktop");
    const anonIcon = await box(page, "identity-secret-icon-desktop");
    const waTitle = await page.locator("#whatsapp-updates-title").boundingBox();
    const anonTitle = await box(page, "anonymous-gift-title");
    const waHint = await box(page, "whatsapp-updates-hint");
    const anonHint = await box(page, "anonymous-gift-hint");
    const right = (rect) => rect.x + rect.width;
    const waTextCenter = (waTitle.y + waHint.y + waHint.height) / 2;
    const anonTextCenter = (anonTitle.y + anonHint.y + anonHint.height) / 2;

    check("desktop RTL: document direction is rtl", dir === "rtl");
    check("desktop RTL: logical helper edges align",
      Math.abs(right(waTitle) - right(waHint)) <= 1 &&
      Math.abs(right(anonTitle) - right(anonHint)) <= 1 &&
      Math.abs(right(waHint) - right(anonHint)) <= 1,
      `wa=${right(waHint)} anon=${right(anonHint)}`);
    check("desktop RTL: checkbox/icon/text order is logical",
      waInput.x > waIcon.x && waIcon.x > right(waHint) &&
      anonInput.x > anonIcon.x && anonIcon.x > right(anonHint));
    check("desktop RTL: controls center to full text blocks",
      Math.abs((waInput.y + waInput.height / 2) - waTextCenter) <= 1.5 &&
      Math.abs((waIcon.y + waIcon.height / 2) - waTextCenter) <= 1.5 &&
      Math.abs((anonInput.y + anonInput.height / 2) - anonTextCenter) <= 1.5 &&
      Math.abs((anonIcon.y + anonIcon.height / 2) - anonTextCenter) <= 1.5);
    check("desktop RTL: helper copy stays single-line",
      waHint.height <= 20 && anonHint.height <= 20,
      `wa=${waHint.height} anon=${anonHint.height}`);
    await page.getByTestId("check-whatsapp-updates-label").scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({ path: "/tmp/pref-rows-desktop-1280-ar.png" });
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
