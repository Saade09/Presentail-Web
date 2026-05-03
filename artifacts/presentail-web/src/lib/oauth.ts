// Lazy loaders + thin wrappers for the third-party Sign-In SDKs we expose
// on the web auth page. The SDKs are loaded on-demand (the first time the
// shopper clicks the button) so they don't slow the initial page render.
//
// Both helpers throw a translated, user-readable Error on failure / cancel
// so the caller can surface it via the toast system uniformly.

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (resp: { credential?: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
            ux_mode?: "popup" | "redirect";
          }) => void;
          prompt: (cb?: (notification: any) => void) => void;
        };
        oauth2: {
          initTokenClient: (cfg: any) => any;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (cfg: {
          clientId: string;
          scope?: string;
          redirectURI: string;
          state?: string;
          nonce?: string;
          usePopup?: boolean;
        }) => void;
        signIn: () => Promise<{
          authorization: { id_token: string; code: string; state?: string };
          user?: {
            email?: string;
            name?: { firstName?: string; lastName?: string };
          };
        }>;
      };
    };
  }
}

const GIS_SRC = "https://accounts.google.com/gsi/client";
const APPLE_SRC =
  "https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js";

const scriptCache = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = scriptCache.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${src}"]`,
    );
    if (existing && existing.dataset.loaded === "1") {
      resolve();
      return;
    }
    const el = existing ?? document.createElement("script");
    el.src = src;
    el.async = true;
    el.defer = true;
    el.onload = () => {
      el.dataset.loaded = "1";
      resolve();
    };
    el.onerror = () => {
      scriptCache.delete(src);
      reject(new Error(`Failed to load ${src}`));
    };
    if (!existing) document.head.appendChild(el);
  });
  scriptCache.set(src, p);
  return p;
}

export function getGoogleClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "").trim();
}

export function getAppleServiceId(): string {
  return String(import.meta.env.VITE_APPLE_SERVICE_ID ?? "").trim();
}

export function getAppleRedirectUri(): string {
  const explicit = String(import.meta.env.VITE_APPLE_REDIRECT_URI ?? "").trim();
  if (explicit) return explicit;
  if (typeof window !== "undefined") return window.location.origin + "/auth";
  return "";
}

export type GoogleSignInResult = { credential: string };

// Trigger Google Sign-In. We use the OAuth2 token-client `requestAccessToken`
// path *with* `id_token` style by initializing the GIS Identity client and
// calling `prompt()`. The library calls our callback with `{ credential }`
// holding a JWT we POST to the API.
export function signInWithGoogle(): Promise<GoogleSignInResult> {
  const clientId = getGoogleClientId();
  if (!clientId) {
    return Promise.reject(
      new Error(
        "Google sign-in isn't configured. Please set VITE_GOOGLE_CLIENT_ID.",
      ),
    );
  }
  return loadScript(GIS_SRC).then(
    () =>
      new Promise<GoogleSignInResult>((resolve, reject) => {
        const gis = window.google?.accounts?.id;
        if (!gis) {
          reject(new Error("Google Sign-In failed to load. Please try again."));
          return;
        }
        let settled = false;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };
        try {
          gis.initialize({
            client_id: clientId,
            ux_mode: "popup",
            cancel_on_tap_outside: false,
            callback: (resp) => {
              if (resp?.credential) {
                finish(() => resolve({ credential: resp.credential! }));
              } else {
                finish(() =>
                  reject(new Error("Google sign-in was cancelled.")),
                );
              }
            },
          });
          gis.prompt((notification: any) => {
            // If the One-Tap prompt cannot be shown (e.g., 3p cookies
            // blocked), surface a helpful error rather than hanging.
            try {
              if (
                notification?.isNotDisplayed?.() ||
                notification?.isSkippedMoment?.()
              ) {
                const reason =
                  notification?.getNotDisplayedReason?.() ??
                  notification?.getSkippedReason?.() ??
                  "blocked";
                finish(() =>
                  reject(
                    new Error(
                      `Google sign-in could not open (${reason}). Please allow third-party cookies and try again.`,
                    ),
                  ),
                );
              }
            } catch {
              // notification API differences across versions — ignore
            }
          });
        } catch (e: any) {
          finish(() =>
            reject(new Error(e?.message ?? "Google sign-in failed.")),
          );
        }
      }),
  );
}

export type AppleSignInResult = {
  idToken: string;
  user?: { name?: { firstName?: string | null; lastName?: string | null } | null };
};

export function signInWithApple(): Promise<AppleSignInResult> {
  const clientId = getAppleServiceId();
  if (!clientId) {
    return Promise.reject(
      new Error(
        "Apple sign-in isn't configured. Please set VITE_APPLE_SERVICE_ID.",
      ),
    );
  }
  const redirectURI = getAppleRedirectUri();
  return loadScript(APPLE_SRC).then(async () => {
    const apple = window.AppleID?.auth;
    if (!apple) {
      throw new Error("Apple Sign-In failed to load. Please try again.");
    }
    apple.init({
      clientId,
      scope: "name email",
      redirectURI,
      usePopup: true,
    });
    try {
      const r = await apple.signIn();
      const idToken = r?.authorization?.id_token;
      if (!idToken) throw new Error("Apple sign-in was cancelled.");
      return {
        idToken,
        user: r.user
          ? {
              name: {
                firstName: r.user.name?.firstName ?? null,
                lastName: r.user.name?.lastName ?? null,
              },
            }
          : undefined,
      };
    } catch (e: any) {
      // Apple JS rejects with `{ error: 'popup_closed_by_user' }` etc.
      const code = e?.error ?? e?.code ?? "";
      if (
        code === "popup_closed_by_user" ||
        code === "user_cancelled_authorize" ||
        code === "user_trigger_new_signin_flow"
      ) {
        throw new Error("Apple sign-in was cancelled.");
      }
      throw new Error(e?.message ?? "Apple sign-in failed.");
    }
  });
}
