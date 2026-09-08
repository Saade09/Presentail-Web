// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const html = fs.readFileSync(
  path.resolve(process.cwd(), "index.html"),
  "utf8",
);

describe("Meta Pixel document-head bootstrap", () => {
  it("captures fbclid into a 90-day parent-domain _fbc cookie before pixel init", () => {
    const captureIndex = html.indexOf('new URLSearchParams(window.location.search).get("fbclid")');
    const initIndex = html.indexOf('window.fbq("init", pixelId)');

    expect(captureIndex).toBeGreaterThan(-1);
    expect(initIndex).toBeGreaterThan(captureIndex);
    expect(html).toContain('"fb.1." + Date.now() + "." + fbclid');
    expect(html).toContain("Max-Age=7776000");
    expect(html).toContain("Domain=.presentail.com");
  });

  it("loads fbevents.js from a preconnected origin and uses Vite pixel variables", () => {
    expect(html).toContain(
      '<link rel="preconnect" href="https://connect.facebook.net" crossorigin>',
    );
    expect(html).toContain(
      '"https://connect.facebook.net/en_US/fbevents.js"',
    );
    expect(html).toContain("%VITE_FB_PIXEL_ID_LB%");
    expect(html).toContain("%VITE_FB_PIXEL_ID_AE%");
  });

  it("fires the inline PageView with a unique event ID for later CAPI deduplication", () => {
    expect(html).toContain('"trackSingle", pixelId, "PageView", {}, { eventID: eventId }');
    expect(html).toContain("__presentailMetaInitialPageView");
  });
});