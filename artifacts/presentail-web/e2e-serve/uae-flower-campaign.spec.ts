import { expect, test } from "@playwright/test";

const UAE_CAMPAIGNS = [
  {
    path: "/en-ae/dubai/flower-delivery",
    city: "Dubai",
    cityId: "ae-dubai",
  },
  {
    path: "/en-ae/abu-dhabi/flower-delivery",
    city: "Abu Dhabi",
    cityId: "ae-abu-dhabi",
  },
] as const;

for (const campaign of UAE_CAMPAIGNS) {
  test(`serves the city-aware flower campaign at ${campaign.path}`, async ({
    request,
  }) => {
    const response = await request.get(campaign.path);
    expect(response.status()).toBe(200);

    const html = await response.text();
    const origin = new URL(response.url()).origin;

    expect(html).toContain(
      `<title>Flower Delivery in ${campaign.city} | Presentail</title>`,
    );
    expect(html).toContain(
      `Shop fresh flower arrangements available for delivery in ${campaign.city}.`,
    );
    expect(html).toContain(`<h1>Flower delivery in ${campaign.city}</h1>`);
    expect(html).toContain(
      `Browse fresh arrangements available for ${campaign.city}. Delivery dates and times are confirmed at checkout.`,
    );
    expect(html).toContain(`data-server-campaign-landing="${campaign.cityId}"`);

    const flowersHeading = html.indexOf("<h2>Flowers</h2>");
    const luxuryHeading = html.indexOf("<h2>Luxury Arrangements</h2>");
    expect(flowersHeading).toBeGreaterThan(-1);
    expect(luxuryHeading).toBeGreaterThan(flowersHeading);

    expect(html.match(/data-server-campaign-cta/g)).toHaveLength(1);
    expect(html).toContain(">Shop flowers</a>");
    expect(html).toContain(
      "Explore fresh arrangements and confirm delivery dates and times at checkout.",
    );
    expect(html).toContain(
      ">Need help choosing? Chat with a support agent</a>",
    );
    const supportHref = html.match(
      /data-server-campaign-support href="([^"]+)"/,
    )?.[1];
    expect(supportHref).toBeTruthy();
    expect(decodeURIComponent(supportHref!)).toContain(
      `help choosing flowers for delivery in ${campaign.city}.`,
    );

    expect(html).toContain(
      `<link rel="canonical" href="${origin}${campaign.path}"`,
    );
    expect(html).toContain('hreflang="en-AE"');
    expect(html).not.toContain('content="noindex');
    expect(html).not.toContain("Achrafieh");
    expect(html).not.toContain("delivered in Beirut");
    expect(html).not.toContain("Online Flower &amp; Gift Delivery");
  });
}

test("keeps the Beirut reference campaign server-rendered and city-specific", async ({
  request,
}) => {
  const response = await request.get("/en-lb/beirut/flower-delivery");
  expect(response.status()).toBe(200);

  const html = await response.text();
  const origin = new URL(response.url()).origin;
  expect(html).toContain(
    "<title>Online Flower &amp; Gift Delivery | Presentail</title>",
  );
  expect(html).toContain(
    '<meta name="description" content="Send flowers, cakes, balloons, plants, chocolates and more gifts online with Presentail. Express same-day delivery available in Lebanon, UAE, and Cyprus."',
  );
  expect(html).toContain(
    `<link rel="canonical" href="${origin}/en-lb/beirut/flower-delivery"`,
  );
  expect(html).toContain('hreflang="en-LB"');
  expect(html).toContain('hreflang="ar-LB"');
  expect(html).toContain('hreflang="fr-LB"');
  expect(html).toContain('hreflang="x-default"');
  expect(html).not.toContain('content="noindex');
  expect(html).toContain("<h1>Flowers delivered in Beirut today</h1>");
  expect(html).toContain('data-server-campaign-landing="lb-beirut"');
  expect(html.match(/data-server-campaign-cta/g)).toHaveLength(1);
  expect(html).toContain(">Shop flowers</a>");
  expect(html).toContain("<h2>Flowers</h2>");
  expect(html).toContain("<h2>Luxury Arrangements</h2>");
  expect(html).not.toContain("Flower delivery in Dubai");
  expect(html).not.toContain("Flower delivery in Abu Dhabi");
});
