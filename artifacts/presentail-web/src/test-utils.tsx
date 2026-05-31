import React, { type ReactNode } from "react";
import { render, type RenderOptions, type RenderResult } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LocaleContext } from "@/contexts/LocaleContext";

export const DEFAULT_LOCALE = {
  language: "en" as const,
  setLanguage: () => {},
  dir: "ltr" as const,
  t: (key: string) => key,
  countryName: (_code: string, fallback: string) => fallback,
  cityName: (_id: string, fallback: string) => fallback,
};

type LocaleOverride = Partial<typeof DEFAULT_LOCALE>;

type ProviderOptions = {
  locale?: LocaleOverride;
};

function createWrapper({ locale }: ProviderOptions = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const localeValue = { ...DEFAULT_LOCALE, ...locale };
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={qc}>
        <LocaleContext.Provider value={localeValue}>
          {children}
        </LocaleContext.Provider>
      </QueryClientProvider>
    );
  };
}

export function renderWithProviders(
  ui: React.ReactElement,
  options: ProviderOptions & Omit<RenderOptions, "wrapper"> = {},
): RenderResult {
  const { locale, ...renderOptions } = options;
  return render(ui, { wrapper: createWrapper({ locale }), ...renderOptions });
}
