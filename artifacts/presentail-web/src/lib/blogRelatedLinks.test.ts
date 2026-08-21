import { describe, expect, it } from "vitest";
import { BLOG_RELATED_SLUGS } from "@workspace/blog-content";

const UNDER_LINKED_SLUGS = [
  "gift-baskets-dubai",
  "flower-shops-in-lebanon",
  "inside-spring-sourcing-trip",
  "what-to-send-when-there-are-no-words",
  "corporate-gifting-lebanon",
  "valentines-day-gifts-lebanon",
  "teddy-bear-gifts-lebanon",
  "send-gifts-to-lebanon-from-gulf",
  "chocolatiers-behind-our-gift-boxes",
  "flower-shop-in-achrafieh",
  "baby-boy-balloons",
  "fathers-day-gifts-lebanon",
  "balloon-delivery-beirut-lebanon",
  "best-cakes-lebanon",
] as const;

describe("BLOG_RELATED_SLUGS", () => {
  it("gives every formerly under-linked article two or three inbound article links", () => {
    const inbound = new Map<string, number>();
    for (const targets of Object.values(BLOG_RELATED_SLUGS)) {
      for (const target of targets) inbound.set(target, (inbound.get(target) ?? 0) + 1);
    }

    for (const slug of UNDER_LINKED_SLUGS) {
      expect(inbound.get(slug), slug).toBeGreaterThanOrEqual(2);
      expect(inbound.get(slug), slug).toBeLessThanOrEqual(3);
    }
  });
});