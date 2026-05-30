import type { Dict } from "./types";

export const commonStrings: Dict = {
  "notFound.title": { en: "404 Page Not Found", ar: "404 الصفحة غير موجودة" },
  "notFound.desc": { en: "Did you forget to add the page to the router?", ar: "هل نسيت إضافة الصفحة إلى الموجّه؟" },
  "common.scrollLeft": { en: "Scroll left", ar: "التمرير يساراً" },
  "common.scrollRight": { en: "Scroll right", ar: "التمرير يميناً" },
  "currency.useAutomatic": { en: "Use automatic (detected)", ar: "استخدام التلقائي (مكتشف)" },
  "currency.rememberChoice": { en: "Remember my choice", ar: "تذكّر اختياري" },
};

export const commonStringsFr: Record<string, string> = {
  "notFound.title": "404 Page introuvable",
  "notFound.desc": "Avez-vous oublié d'ajouter la page au routeur ?",
  "common.scrollLeft": "Défiler à gauche",
  "common.scrollRight": "Défiler à droite",
  "currency.useAutomatic": "Utiliser automatique (détecté)",
  "currency.rememberChoice": "Mémoriser mon choix",
};
