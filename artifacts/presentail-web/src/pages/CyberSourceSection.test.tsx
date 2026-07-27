// @vitest-environment jsdom
//
// Unit tests for CyberSourceSection component (Microform V2, official sequence).
//
// The component follows the official Flex integration only:
//   capture-context JWT → SDK from JWT clientLibrary → new Flex(ctx) →
//   microform({styles}) → createField("number"/"securityCode") → field.load().
//
// Contract under test:
//   - onFieldsReady fires once the createField().load() sequence completes
//     without throwing (no custom iframe event tracking — that is banned).
//   - onFieldsFailed fires when the JWT has no clientLibrary, when the SDK
//     script fails to load, or when the Flex init/load() sequence throws.
//   - Containers are ALWAYS in the DOM and never display:none — hiding them
//     during load() causes the SDK to inject broken 0-height iframes.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { CyberSourceSection } from "./CyberSourceSection";

// ── Mock locale hook ──────────────────────────────────────────────────────────
vi.mock("@/contexts/LocaleContext", () => ({
  useLocale: () => ({
    t: (key: string) => key,
    locale: "en",
    setLocale: vi.fn(),
    isRTL: false,
  }),
}));

// ── Fake capture-context JWT ─────────────────────────────────────────────────
// The component reads the SDK URL, targetOrigins and expiry from the JWT
// payload (ctx[0].data), so tests must supply a structurally valid JWT.

function b64url(obj: unknown): string {
  return btoa(JSON.stringify(obj)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function makeCaptureContext(opts: { clientLibrary?: string | null } = {}): string {
  const clientLibrary =
    opts.clientLibrary === undefined
      ? "https://testflex.cybersource.com/microform/bundle/v2.12.1/flex-microform.min.js"
      : opts.clientLibrary;
  const data: Record<string, unknown> = {
    targetOrigins: [window.location.origin],
    clientLibraryIntegrity: null,
  };
  if (clientLibrary) data.clientLibrary = clientLibrary;
  const payload = {
    flx: { origin: "https://testflex.cybersource.com" },
    exp: Math.floor(Date.now() / 1000) + 900,
    ctx: [{ data, type: "mf-2.1.0" }],
  };
  return `${b64url({ kid: "test", alg: "RS256" })}.${b64url(payload)}.fakesig`;
}

// ── Flex SDK mock factory ─────────────────────────────────────────────────────

function installFlexMock(opts: { throwOnLoad?: boolean; throwOnMicroform?: boolean } = {}) {
  const loadCalls: string[] = [];
  const createFieldCalls: string[] = [];
  class FlexMock {
    constructor(_ctx: string) {}
    microform(_options: unknown) {
      if (opts.throwOnMicroform) throw new Error("microform init failed");
      return {
        createField: (type: string, _fieldOpts?: Record<string, unknown>) => {
          createFieldCalls.push(type);
          return {
            load(selector: string) {
              if (opts.throwOnLoad) throw new Error("load() threw synchronously");
              loadCalls.push(selector);
            },
          };
        },
        createToken(_o: Record<string, unknown>, cb: (err: unknown, token: string) => void) {
          cb(null, "MOCK_TOKEN");
        },
      };
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).Flex = FlexMock;
  return { loadCalls, createFieldCalls };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderSection(props: Partial<React.ComponentProps<typeof CyberSourceSection>> = {}) {
  const ref = React.createRef<import("./CyberSourceSection").CyberSourceSectionRef>();
  const onFieldsReady = vi.fn();
  const onFieldsFailed = vi.fn();
  const { unmount } = render(
    <CyberSourceSection
      captureContext={makeCaptureContext()}
      environment="test"
      onFieldsReady={onFieldsReady}
      onFieldsFailed={onFieldsFailed}
      ref={ref}
      {...props}
    />,
  );
  return { ref, onFieldsReady, onFieldsFailed, unmount };
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe("CyberSourceSection", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll("script[src*='cybersource']").forEach((el) => el.remove());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Flex;
  });

  describe("successful official sequence", () => {
    it("calls onFieldsReady after createField().load() completes for both fields", async () => {
      const { loadCalls, createFieldCalls } = installFlexMock();

      const { onFieldsReady, onFieldsFailed } = renderSection();

      await waitFor(() => {
        expect(onFieldsReady).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });

      expect(onFieldsFailed).not.toHaveBeenCalled();
      // Official sequence: exactly two fields, loaded into the two containers.
      expect(createFieldCalls).toEqual(["number", "securityCode"]);
      expect(loadCalls).toEqual(["#cs-number-container", "#cs-cvv-container"]);
    });

    it("keeps both containers in the DOM and never display:none", async () => {
      installFlexMock();
      const { onFieldsReady } = renderSection();
      await waitFor(() => expect(onFieldsReady).toHaveBeenCalled(), { timeout: 3000 });

      const numberContainer = document.getElementById("cs-number-container");
      const cvvContainer = document.getElementById("cs-cvv-container");
      expect(numberContainer).not.toBeNull();
      expect(cvvContainer).not.toBeNull();
      expect(numberContainer!.style.display).toBe("block");
      expect(cvvContainer!.style.display).toBe("block");
    });
  });

  describe("failure paths", () => {
    it("calls onFieldsFailed when load() throws synchronously", async () => {
      installFlexMock({ throwOnLoad: true });

      const { onFieldsReady, onFieldsFailed } = renderSection();

      await waitFor(() => {
        expect(onFieldsFailed).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      expect(onFieldsReady).not.toHaveBeenCalled();
    });

    it("calls onFieldsFailed when microform init throws", async () => {
      installFlexMock({ throwOnMicroform: true });

      const { onFieldsReady, onFieldsFailed } = renderSection();

      await waitFor(() => {
        expect(onFieldsFailed).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      expect(onFieldsReady).not.toHaveBeenCalled();
    });

    it("calls onFieldsFailed when the JWT has no clientLibrary (never hardcodes an SDK URL)", async () => {
      installFlexMock();

      const { onFieldsReady, onFieldsFailed } = renderSection({
        captureContext: makeCaptureContext({ clientLibrary: null }),
      });

      await waitFor(() => {
        expect(onFieldsFailed).toHaveBeenCalledTimes(1);
      }, { timeout: 3000 });
      expect(onFieldsReady).not.toHaveBeenCalled();
      // No script may have been injected — the SDK URL comes only from the JWT.
      expect(document.querySelector("script[src*='cybersource']")).toBeNull();
    });

    it("onFieldsReady never fires in a failure scenario", async () => {
      installFlexMock({ throwOnLoad: true });
      const callOrder: string[] = [];
      const { unmount } = render(
        <CyberSourceSection
          captureContext={makeCaptureContext()}
          environment="test"
          onFieldsReady={() => callOrder.push("ready")}
          onFieldsFailed={() => callOrder.push("failed")}
        />,
      );

      await waitFor(() => expect(callOrder).toContain("failed"), { timeout: 3000 });
      expect(callOrder).not.toContain("ready");
      unmount();
    });
  });

  describe("loading behaviour", () => {
    it("shows the loading hint and keeps containers visible while the SDK is loading", () => {
      // No window.Flex and a URL that will never resolve in jsdom → the
      // component stays in "loading" state.
      const { onFieldsReady } = renderSection({
        captureContext: makeCaptureContext({
          clientLibrary:
            "https://testflex.cybersource.com/microform/bundle/v2.12.1/never-loads.min.js",
        }),
      });

      expect(onFieldsReady).not.toHaveBeenCalled();
      expect(screen.getByText("checkout.cybersource.loading")).toBeTruthy();
      // Containers must be visible even during loading — hiding them would
      // make the SDK inject 0-height iframes when load() eventually runs.
      const numberContainer = document.getElementById("cs-number-container");
      expect(numberContainer).not.toBeNull();
      expect(numberContainer!.style.display).toBe("block");
    });
  });
});
