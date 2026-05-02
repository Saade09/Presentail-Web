import { useEffect, useState } from "react";

import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

const MIN_VISIBLE_MS = 900;

type Options = {
  fontsLoaded: boolean;
};

/**
 * Resolves once fonts, stored language preference, RTL setup, and auth bootstrap
 * have completed. Includes a minimum-visible-time guard so a fast init doesn't
 * cause the splash to flicker.
 */
export function useAppInitialization({ fontsLoaded }: Options): { ready: boolean } {
  const { isReady: langReady } = useLanguage();
  const { ready: authReady } = useAuth();

  const [minTimeElapsed, setMinTimeElapsed] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setMinTimeElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(id);
  }, []);

  const ready = fontsLoaded && langReady && authReady && minTimeElapsed;

  return { ready };
}
