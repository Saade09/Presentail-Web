import type { Dict } from "./types";

/**
 * campaign.ts — strings for reusable ad-campaign landing pages
 * (currently the "Flower Delivery" Google Ads landing page).
 */
export const campaignStrings: Dict = {
  "campaign.breadcrumb": { en: "Flower Delivery", ar: "توصيل الزهور" },
  "campaign.hero.title": {
    en: "Beautiful Flowers Delivered in {city} Today",
    ar: "زهور جميلة تصل إلى {city} اليوم",
  },
  "campaign.hero.subtitle": {
    en: "Fresh, hand-arranged bouquets from trusted local florists — same-day delivery, beautifully presented.",
    ar: "باقات طازجة منسّقة يدوياً من أمهر بائعي الزهور المحليين — توصيل في نفس اليوم وتقديم أنيق.",
  },
  "campaign.hero.promoTitle": { en: "10% OFF YOUR FIRST ORDER", ar: "خصم 10% على طلبك الأول" },
  "campaign.hero.promoSubtitle": {
    en: "Applied automatically at checkout — no code needed",
    ar: "يُطبّق تلقائياً عند الدفع — بدون رمز خصم",
  },
  "campaign.hero.cta": { en: "Shop Best Sellers", ar: "تسوّق الأكثر مبيعاً" },
  "campaign.hero.ctaUnder": { en: "Shop Under {amount}", ar: "تسوّق بأقل من {amount}" },
  "campaign.hero.imageAlt": {
    en: "Fresh bouquet of flowers arranged by a local florist",
    ar: "باقة زهور طازجة منسّقة من بائع زهور محلي",
  },
  "campaign.trust.rating": { en: "4.8★ Rating", ar: "تقييم 4.8★" },
  "campaign.trust.securePayment": { en: "Secure Payment", ar: "دفع آمن" },
  "campaign.trust.deliveryUpdates": { en: "Delivery Updates", ar: "تحديثات التوصيل" },
  "campaign.bestSellers.title": {
    en: "Best Sellers Available Today",
    ar: "الأكثر مبيعاً المتوفرة اليوم",
  },
  "campaign.bestSellers.viewAll": { en: "View all →", ar: "عرض الكل →" },
  "campaign.pill.romantic": { en: "Romantic", ar: "رومانسي" },
  "campaign.pill.under": { en: "Under {amount}", ar: "أقل من {amount}" },
  "campaign.reviews.title": { en: "Verified Customer Reviews", ar: "تقييمات عملاء موثّقة" },
  "campaign.stickyCta": {
    en: "Shop Flowers Available Today",
    ar: "تسوّق الزهور المتوفرة اليوم",
  },
};

export const campaignStringsFr: Record<string, string> = {
  "campaign.breadcrumb": "Livraison de fleurs",
  "campaign.hero.title": "De belles fleurs livrées à {city} aujourd'hui",
  "campaign.hero.subtitle":
    "Des bouquets frais, arrangés à la main par des fleuristes locaux de confiance — livraison le jour même, joliment présentés.",
  "campaign.hero.promoTitle": "10% DE RÉDUCTION SUR VOTRE PREMIÈRE COMMANDE",
  "campaign.hero.promoSubtitle": "Appliquée automatiquement au paiement — sans code",
  "campaign.hero.cta": "Voir les meilleures ventes",
  "campaign.hero.ctaUnder": "Acheter à moins de {amount}",
  "campaign.hero.imageAlt": "Bouquet de fleurs fraîches arrangé par un fleuriste local",
  "campaign.trust.rating": "Note 4.8★",
  "campaign.trust.securePayment": "Paiement sécurisé",
  "campaign.trust.deliveryUpdates": "Suivi de livraison",
  "campaign.bestSellers.title": "Meilleures ventes disponibles aujourd'hui",
  "campaign.bestSellers.viewAll": "Voir tout →",
  "campaign.pill.romantic": "Romantique",
  "campaign.pill.under": "Moins de {amount}",
  "campaign.reviews.title": "Avis clients vérifiés",
  "campaign.stickyCta": "Voir les fleurs disponibles aujourd'hui",
};
