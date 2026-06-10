type FbqFunction = {
  (event: "init", pixelId: string): void;
  (event: "track", eventName: string, params?: Record<string, unknown>): void;
  (event: "trackSingle", pixelId: string, eventName: string, params?: Record<string, unknown>): void;
  (event: "trackCustom", eventName: string, params?: Record<string, unknown>): void;
  (event: "trackSingleCustom", pixelId: string, eventName: string, params?: Record<string, unknown>): void;
  callMethod?: (...args: unknown[]) => void;
  push: FbqFunction;
  loaded: boolean;
  version: string;
  queue: unknown[];
};

declare global {
  interface Window {
    fbq?: FbqFunction;
    _fbq?: FbqFunction;
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
