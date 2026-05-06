import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import React, { createContext, useContext, useEffect, useState } from "react";
import { I18nManager } from "react-native";
import type { Lang } from "@/lib/translations";

type LanguageContextType = {
  lang: Lang;
  setLang: (l: Lang) => void;
  isRTL: boolean;
  isReady: boolean;
};

const LanguageContext = createContext<LanguageContextType>({
  lang: "EN",
  setLang: () => {},
  isRTL: false,
  isReady: false,
});

function applyRTL(l: Lang): boolean {
  const shouldBeRTL = l === "AR";
  if (I18nManager.isRTL !== shouldBeRTL) {
    try {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
      return true;
    } catch {
      // no-op: some platforms (e.g. web) may not support forceRTL
    }
  }
  return false;
}

async function reloadForRTL() {
  try {
    if (Updates.isEnabled) {
      await Updates.reloadAsync();
    }
  } catch {
    // no-op: reload is best-effort
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("EN");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("presentail_lang")
      .then((v) => {
        const next: Lang = v === "AR" || v === "EN" || v === "FR" ? v : "EN";
        setLangState(next);
        const flipped = applyRTL(next);
        if (flipped) {
          void reloadForRTL();
        }
      })
      .finally(() => {
        setIsReady(true);
      });
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem("presentail_lang", l);
    const flipped = applyRTL(l);
    if (flipped) {
      void reloadForRTL();
    }
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, isRTL: lang === "AR", isReady }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
