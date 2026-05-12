import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// Timestamp (ms since epoch) of the last completed onboarding. We re-show the
// picker when more than ONBOARDING_TTL_MS has elapsed since the last
// completion, so the shopper re-confirms their country / city at most once
// per day per cold start.
const ONBOARDING_AT_KEY = "@presentail/onboarding-location-at-v1";
const ONBOARDING_TTL_MS = 24 * 60 * 60 * 1000;

type OnboardingContextValue = {
  /** True once we've finished reading AsyncStorage. */
  hydrated: boolean;
  /** Show the onboarding screen when this is true. */
  needsOnboarding: boolean;
  /** Mark onboarding as complete and dismiss the screen. */
  completeOnboarding: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(ONBOARDING_AT_KEY);
        if (cancelled) return;
        const lastAt = raw ? Number(raw) : NaN;
        const fresh = Number.isFinite(lastAt) && Date.now() - lastAt < ONBOARDING_TTL_MS;
        setNeedsOnboarding(!fresh);
      } catch {
        // Best-effort: on read failure assume already onboarded so we don't
        // block the app behind a screen the user can't get past.
        if (!cancelled) setNeedsOnboarding(false);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    setNeedsOnboarding(false);
    try {
      await AsyncStorage.setItem(ONBOARDING_AT_KEY, String(Date.now()));
    } catch {
      // best-effort
    }
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({ hydrated, needsOnboarding, completeOnboarding }),
    [hydrated, needsOnboarding, completeOnboarding],
  );

  return (
    <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) {
    throw new Error("useOnboarding must be used within an OnboardingProvider");
  }
  return ctx;
}
