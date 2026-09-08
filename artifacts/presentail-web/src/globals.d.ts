type FbqFunction = {
  (event: "init", pixelId: string): void;
  (event: "track", eventName: string, params?: Record<string, unknown>, options?: { eventID?: string }): void;
  (event: "trackSingle", pixelId: string, eventName: string, params?: Record<string, unknown>, options?: { eventID?: string }): void;
  (event: "trackCustom", eventName: string, params?: Record<string, unknown>): void;
  (event: "trackSingleCustom", pixelId: string, eventName: string, params?: Record<string, unknown>): void;
  callMethod?: (...args: unknown[]) => void;
  push: FbqFunction;
  loaded: boolean;
  version: string;
  queue: unknown[];
};

declare global {
  // ── Apple Pay types ─────────────────────────────────────────────────────────
  // Minimal Apple Pay JS API surface used by web checkout wallet section.
  namespace ApplePayJS {
    interface ApplePayPaymentRequest {
      countryCode: string;
      currencyCode: string;
      total: { label: string; amount: string };
      supportedNetworks: string[];
      merchantCapabilities: string[];
    }
    interface ApplePayValidateMerchantEvent extends Event {
      validationURL: string;
    }
    interface ApplePayPayment {
      token: unknown;
    }
    interface ApplePayPaymentAuthorizedEvent extends Event {
      payment: ApplePayPayment;
    }
  }

  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
    __presentailMetaInitializedPixels?: string[];
    __presentailMetaInitialPageView?: {
      pixelId: string;
      pathname: string;
      eventId: string;
      sourceUrl: string;
      relayed: boolean;
    };
    ApplePaySession?: {
      new(version: number, request: ApplePayJS.ApplePayPaymentRequest): {
        begin(): void;
        abort(): void;
        completeMerchantValidation(merchantSession: unknown): void;
        completePayment(result: { status: number }): void;
        onvalidatemerchant: ((event: ApplePayJS.ApplePayValidateMerchantEvent) => void) | null;
        onpaymentauthorized: ((event: ApplePayJS.ApplePayPaymentAuthorizedEvent) => void) | null;
        oncancel: ((event: Event) => void) | null;
      };
      canMakePayments(): boolean;
      canMakePaymentsWithActiveCard(merchantIdentifier: string): Promise<boolean>;
      readonly STATUS_SUCCESS: number;
      readonly STATUS_FAILURE: number;
    };
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string;
            callback: (response: { credential: string }) => void;
            auto_select?: boolean;
            cancel_on_tap_outside?: boolean;
          }) => void;
          prompt: (
            notification?: (n: {
              isNotDisplayed: () => boolean;
              isSkippedMoment: () => boolean;
            }) => void
          ) => void;
          renderButton: (
            parent: HTMLElement,
            options: {
              theme?: string;
              size?: string;
              text?: string;
              width?: number;
            }
          ) => void;
          cancel: () => void;
        };
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            ux_mode?: "popup" | "redirect";
            callback: (response: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
            // GSI reports popup-level failures (shopper closed the popup,
            // popup blocked) here — NOT via `callback`, which simply never
            // fires in those cases.
            error_callback?: (error: {
              type: "popup_failed_to_open" | "popup_closed" | "unknown" | string;
              message?: string;
            }) => void;
          }) => {
            requestAccessToken: () => void;
          };
        };
      };
    };
    AppleID?: {
      auth: {
        init: (config: {
          clientId: string;
          scope: string;
          redirectURI: string;
          usePopup: boolean;
        }) => void;
        signIn: () => Promise<{
          authorization: {
            id_token: string;
            code: string;
            state?: string;
          };
          user?: {
            name?: { firstName?: string; lastName?: string } | null;
            email?: string | null;
          } | null;
        }>;
      };
    };
  }
}

export {};
