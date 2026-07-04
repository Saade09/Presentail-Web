// @vitest-environment jsdom

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ShimmerImage } from "./ShimmerImage";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function renderImage(props: React.ComponentProps<typeof ShimmerImage>) {
  const { container } = render(<ShimmerImage {...props} />);
  return container.querySelector("img")!;
}

// ---------------------------------------------------------------------------
// Catalog proxy URL auto-srcset
// ---------------------------------------------------------------------------

describe("ShimmerImage — catalog proxy URL auto-srcset", () => {
  it("auto-applies card srcset (144w/288w/480w) for an occasion-image proxy URL", () => {
    const src = "/api/catalog/occasion-image/mothers-day";
    const img = renderImage({ src, alt: "Mothers Day" });
    expect(img.srcset).toBe(
      `${src}?w=144&f=webp 144w, ${src}?w=288&f=webp 288w, ${src}?w=480&f=webp 480w`,
    );
  });

  it("auto-applies card srcset for a brand-image proxy URL", () => {
    const src = "/api/catalog/brand-image/acme";
    const img = renderImage({ src, alt: "Acme" });
    expect(img.srcset).toBe(
      `${src}?w=144&f=webp 144w, ${src}?w=288&f=webp 288w, ${src}?w=480&f=webp 480w`,
    );
  });

  it("resolves src to the 288w proxy URL for catalog proxy URLs", () => {
    const src = "/api/catalog/brand-image/acme";
    const img = renderImage({ src, alt: "Acme" });
    expect(img.src).toContain(`${src}?w=288&f=webp`);
  });

  it("applies the default card sizes hint for catalog proxy URLs", () => {
    const src = "/api/catalog/occasion-image/birthday";
    const img = renderImage({ src, alt: "Birthday" });
    expect(img.sizes).toBe("(max-width: 768px) 25vw, 300px");
  });
});

// ---------------------------------------------------------------------------
// Explicit srcset prop takes priority over auto-derived catalog srcset
// ---------------------------------------------------------------------------

describe("ShimmerImage — explicit srcset prop overrides auto-derived srcset", () => {
  it("uses the caller-supplied srcset even when src is a catalog proxy URL", () => {
    const src = "/api/catalog/brand-image/luxe";
    const customSrcset = "/custom-300.webp 300w, /custom-600.webp 600w";
    const img = renderImage({ src, alt: "Luxe", srcset: customSrcset });
    expect(img.srcset).toBe(customSrcset);
  });

  it("uses the caller-supplied sizes even when src is a catalog proxy URL", () => {
    const src = "/api/catalog/occasion-image/wedding";
    const img = renderImage({ src, alt: "Wedding", sizes: "50vw" });
    expect(img.sizes).toBe("50vw");
  });
});

// ---------------------------------------------------------------------------
// Non-catalog, non-OS URLs — no auto-srcset
// ---------------------------------------------------------------------------

describe("ShimmerImage — non-catalog URLs do not get auto srcset", () => {
  it("renders no srcset attribute for a plain HTTPS image URL", () => {
    const src = "https://example.com/image.jpg";
    const img = renderImage({ src, alt: "External" });
    expect(img.srcset).toBe("");
  });

  it("renders no srcset attribute for a static /public path", () => {
    const src = "/images/logo.png";
    const img = renderImage({ src, alt: "Logo" });
    expect(img.srcset).toBe("");
  });

  it("uses the raw src unchanged for non-catalog non-OS URLs", () => {
    const src = "https://example.com/image.jpg";
    const img = renderImage({ src, alt: "External" });
    expect(img.src).toBe(src);
  });
});

// ---------------------------------------------------------------------------
// Alt text and loading attributes
// ---------------------------------------------------------------------------

describe("ShimmerImage — alt and loading attributes", () => {
  it("passes alt text to the rendered <img>", () => {
    const img = renderImage({ src: "/api/catalog/brand-image/test", alt: "Test brand" });
    expect(img.alt).toBe("Test brand");
  });

  it("sets loading=lazy by default", () => {
    const img = renderImage({ src: "/api/catalog/brand-image/test", alt: "Test" });
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("sets loading=eager when priority=true", () => {
    const img = renderImage({ src: "/api/catalog/brand-image/test", alt: "Test", priority: true });
    expect(img.getAttribute("loading")).toBe("eager");
  });
});
