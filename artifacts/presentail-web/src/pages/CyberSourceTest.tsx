// Standalone CyberSource Microform V2 test route — /cybersource-test
//
// Contains ONLY the official integration sequence:
//   1. capture-context request
//   2. SDK loading from the JWT's clientLibrary (with SRI integrity)
//   3. two empty containers
//   4. new Flex(captureContext)
//   5. microform.createField("number") / microform.createField("securityCode")
//   6. field .load() calls
//
// No checkout logic, no conditional hiding, no custom iframe handling and no
// payment-routing state.  Dev-only diagnostic page — the backing API endpoint
// returns 404 in production.

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  try {
    const parts = jwt.split(".");
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

// Dev-only diagnostic labels — not user-facing, intentionally untranslated.
const PAGE_TITLE = "CyberSource Microform test"; // i18n-ignore
const CARD_NUMBER_LABEL = "Card number"; // i18n-ignore

export default function CyberSourceTest() {
  const [status, setStatus] = useState("requesting capture context…");
  const [diag, setDiag] = useState<Record<string, unknown> | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;

    (async () => {
      try {
        // 1. capture-context request
        const resp = await apiFetch<{
          ok: boolean;
          captureContext?: string;
          message?: string;
        }>(
          `/payment/cybersource/test-capture-context?pageOrigin=${encodeURIComponent(window.location.origin)}`,
        );
        if (cancelled) return;
        if (!resp.ok || !resp.captureContext) {
          setStatus(`capture context failed: ${resp.message ?? "unknown error"}`); // i18n-ignore
          return;
        }
        const captureContext = resp.captureContext;

        // Diagnostics from the JWT payload
        const payload = decodeJwtPayload(captureContext);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ctx = Array.isArray((payload as any)?.ctx) ? (payload as any).ctx[0]?.data : undefined;
        const jwtTargetOrigins: string[] = Array.isArray(ctx?.targetOrigins) ? ctx.targetOrigins : [];
        const sdkUrl: string | null = ctx?.clientLibrary ?? null;
        const sdkIntegrity: string | null = ctx?.clientLibraryIntegrity ?? null;
        const currentOrigin = window.location.origin;
        const ancestorOrigins =
          typeof window.location.ancestorOrigins !== "undefined"
            ? Array.from(window.location.ancestorOrigins)
            : [];
        const nowSec = Math.floor(Date.now() / 1000);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const exp = typeof (payload as any)?.exp === "number" ? (payload as any).exp : null;
        const info = {
          currentOrigin,
          jwtTargetOrigins,
          originAllowed: jwtTargetOrigins.includes(currentOrigin),
          sdkUrl,
          iframeSrc: null as string | null,
          ancestorOrigins,
          blockedAncestors: ancestorOrigins.filter((o) => !jwtTargetOrigins.includes(o)),
          jwtExpiresInSec: exp != null ? exp - nowSec : null,
          jwtExpired: exp != null ? exp <= nowSec : null,
        };
        console.log("[cybersource-test] origin check:", info);
        setDiag(info);

        if (!sdkUrl) {
          setStatus("JWT missing clientLibrary — cannot load SDK");
          return;
        }

        // 2. SDK loading from clientLibrary (unchanged, with SRI)
        setStatus("loading SDK…");
        await new Promise<void>((resolve, reject) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((window as any).Flex) { resolve(); return; }
          const s = document.createElement("script");
          s.src = sdkUrl;
          s.async = true;
          if (sdkIntegrity) {
            s.integrity = sdkIntegrity;
            s.crossOrigin = "anonymous";
          }
          s.onload = () => resolve();
          s.onerror = () => reject(new Error(`SDK failed to load: ${sdkUrl}`)); // i18n-ignore
          document.head.appendChild(s);
        });
        if (cancelled) return;

        // 4. new Flex(captureContext)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Flex = (window as any).Flex;
        const flex = new Flex(captureContext);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const microform = (flex as any).microform({});

        // 5. createField + 6. load()
        const numberField = microform.createField("number");
        const securityCodeField = microform.createField("securityCode");
        numberField.load("#cs-test-number");
        securityCodeField.load("#cs-test-cvv");

        setStatus("fields loaded — try typing digits below");

        setTimeout(() => {
          const ni = document.querySelector<HTMLIFrameElement>("#cs-test-number iframe");
          const finalInfo = { ...info, iframeSrc: ni?.src ?? null };
          console.log("[cybersource-test] after load():", finalInfo);
          setDiag(finalInfo);
        }, 1500);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (e: any) {
        if (!cancelled) setStatus(`error: ${e?.message ?? String(e)}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ maxWidth: 480, margin: "40px auto", padding: 16, fontFamily: "monospace" }}>
      <h1 style={{ fontSize: 18, marginBottom: 12 }}>{PAGE_TITLE}</h1>
      <p style={{ fontSize: 13, marginBottom: 16 }} data-testid="cs-test-status">{status}</p>

      {/* 3. two empty containers — always visible */}
      <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>{CARD_NUMBER_LABEL}</label>
      <div
        id="cs-test-number"
        style={{ display: "block", minHeight: 44, border: "1px solid #ccc", borderRadius: 6, padding: "0 8px", marginBottom: 12, background: "white" }}
      />
      <label style={{ display: "block", fontSize: 12, marginBottom: 4 }}>CVV</label>
      <div
        id="cs-test-cvv"
        style={{ display: "block", minHeight: 44, border: "1px solid #ccc", borderRadius: 6, padding: "0 8px", background: "white", maxWidth: 120 }}
      />

      {diag && (
        <pre style={{ fontSize: 11, marginTop: 20, whiteSpace: "pre-wrap", wordBreak: "break-all", background: "#f5f5f5", padding: 8, borderRadius: 6 }}>
          {JSON.stringify(diag, null, 2)}
        </pre>
      )}
    </div>
  );
}
