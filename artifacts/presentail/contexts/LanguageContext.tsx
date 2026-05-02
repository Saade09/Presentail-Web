import AsyncStorage from "@react-native-async-storage/async-storage";
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

function applyRTL(l: Lang) {
  const shouldBeRTL = l === "AR";
  if (I18nManager.isRTL !== shouldBeRTL) {
    try {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
    } catch {
      // no-op: some platforms (e.g. web) may not support forceRTL
    }
  }
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("EN");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem("presentail_lang")
      .then((v) => {
        if (v === "AR" || v === "EN" || v === "FR") {
          setLangState(v);
          applyRTL(v);
        } else {
          applyRTL("EN");
        }
      })
      .finally(() => {
        setIsReady(true);
      });
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    AsyncStorage.setItem("presentail_lang", l);
    applyRTL(l);
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, isRTL: lang === "AR", isReady }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
