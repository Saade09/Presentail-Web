import { expect, test, type Page, type Response } from "@playwright/test";

const TRUSTPILOT_BOOTSTRAP_URL =
  "https://widget.trustpilot.com/bootstrap/v5/tp.widget.bootstrap.min.js";
const TRUSTPILOT_FRAME_URL = "https://widget.trustpilot.com/e2e/trustbox-frame";

type TrustpilotCounters = {
  bootstrapRequests: number;
  initializationElements: string[];
  vendorFrameResponses: number;
  applicationProbeResponses: number;
};

async function installTrustpilotFixture(page: Page): Promise<TrustpilotCounters> {
  const counters: TrustpilotCounters = {
    bootstrapRequests: 0,
    initializationElements: [],
    vendorFrameResponses: 0,
    applicationProbeResponses: 0,
  };

  await page.addInitScript(() => {
    localStorage.setItem(
      "presentail_delivery_location_v1",
      JSON.stringify({ countryCode: "LB", cityId: "beirut" }),
    );
  });

  await page.route(TRUSTPILOT_BOOTSTRAP_URL, async (route) => {
    counters.bootstrapRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        (() => {
          let nextElement = 0;
          window.__trustpilotE2EInitializations = [];
          window.Trustpilot = {
            loadFromElement(element) {
              const elementId = String(++nextElement);
              element.dataset.trustpilotE2eElement = elementId;
              window.__trustpilotE2EInitializations.push(elementId);
              const iframe = document.createElement("iframe");
              iframe.src = ${JSON.stringify(TRUSTPILOT_FRAME_URL)};
              iframe.title = "Trustpilot reviews";
              element.appendChild(iframe);
            }
          };
        })();
      `,
    });
  });

  await page.route(TRUSTPILOT_FRAME_URL, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><title>Trustpilot fixture</title><p>TrustBox loaded</p>",
    }),
  );

  page.on("response", (response: Response) => {
    const url = new URL(response.url());
    const isTrustpilotRequest =
      url.hostname === "widget.trustpilot.com" || url.pathname.toLowerCase().includes("trustpilot");
    if (!isTrustpilotRequest) return;

    if (
      url.origin === "https://widget.trustpilot.com" &&
      response.request().resourceType() === "document" &&
      response.frame() !== page.mainFrame() &&
      response.ok()
    ) {
      counters.vendorFrameResponses += 1;
    } else if (url.origin === new URL(page.url()).origin && response.request().resourceType() !== "script") {
      counters.applicationProbeResponses += 1;
    }
  });

  return counters;
}

async function waitForHomepageTrustBox(page: Page, expectedInitializations: number) {
  await page.getByTestId("homepage-trustpilot-section").scrollIntoViewIfNeeded();
  await expect(page.locator(".trustpilot-widget iframe")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __trustpilotE2EInitializations?: string[];
            }
          ).__trustpilotE2EInitializations?.length ?? 0,
      ),
    )
    .toBe(expectedInitializations);
}

test("TrustBox bootstrap and iframe stay stable across homepage SPA remount", async ({ page }) => {
  const counters = await installTrustpilotFixture(page);

  await page.goto("/en-lb/beirut");
  await waitForHomepageTrustBox(page, 1);

  await page.getByRole("link", { name: "Contact Us" }).click();
  await expect(page).toHaveURL(/\/en-lb\/beirut\/contact$/);
  await page.getByTestId("link-logo").click();
  await expect(page).toHaveURL(/\/en-lb\/beirut\/?$/);
  await waitForHomepageTrustBox(page, 2);

  counters.initializationElements = await page.evaluate(
    () =>
      (
        window as Window & {
          __trustpilotE2EInitializations?: string[];
        }
      ).__trustpilotE2EInitializations ?? [],
  );

  expect(counters.bootstrapRequests).toBe(1);
  expect(counters.initializationElements).toEqual(["1", "2"]);
  expect(counters.vendorFrameResponses).toBe(2);
  expect(counters.applicationProbeResponses).toBe(0);
});