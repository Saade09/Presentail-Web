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

  // ── Beirut paid-search hero variant (v2) — used only on en-lb/beirut ──
  "campaign.v2.badge.open": {
    en: "All Lebanon branches open now",
    ar: "جميع فروعنا في لبنان مفتوحة الآن",
  },
  "campaign.v2.badge.closed": {
    en: "Branches reopen 9 AM · order online now",
    ar: "تفتح الفروع الساعة 9 صباحاً · اطلب عبر الإنترنت الآن",
  },
  "campaign.v2.hero.title": {
    en: "Flowers delivered in {city} today",
    ar: "زهور تصل إلى {city} اليوم",
  },
  "campaign.v2.hero.sub1": {
    en: "Hand-arranged this morning by our Achrafieh florists. ",
    ar: "نسّقها هذا الصباح بائعو الزهور لدينا في الأشرفية. ",
  },
  "campaign.v2.hero.subQ": {
    en: "Don't have their address?",
    ar: "لا تعرف عنوان المستلم؟",
  },
  "campaign.v2.hero.sub2": {
    en: " Order anyway — we'll collect it from the recipient for you.",
    ar: " اطلب على أي حال — سنحصل عليه من المستلم بدلاً منك.",
  },
  // Calm state (>2 h to cutoff): plain one-line statement — no ticking number.
  // A ten-hour countdown signals there is no urgency; a plain statement does not.
  "campaign.v2.countdown.staticLine1": {
    en: "Order by 10 PM for delivery today",
    ar: "اطلب قبل 10 مساءً للتوصيل اليوم",
  },
  // Urgent state (≤2 h to cutoff): live ticking counter with prefix + suffix.
  // Rendered inline: "{prefix} [1h 24m 30s] {suffix}"
  "campaign.v2.countdown.urgentPrefix": { en: "Only", ar: "فقط" },
  "campaign.v2.countdown.urgentSuffix": {
    en: "left for delivery today",
    ar: "متبقية للتوصيل اليوم",
  },
  // Closed state (past 10 PM Beirut): page must not promise same-day delivery.
  "campaign.v2.countdown.closedMessage": {
    en: "Order now · delivery tomorrow",
    ar: "اطلب الآن · التوصيل غداً",
  },
  // Legacy keys — no longer referenced in JSX but kept so old bundles do not
  // throw a missing-key warning during a rolling deploy.
  "campaign.v2.countdown.line1": { en: "Order within", ar: "اطلب خلال" },
  "campaign.v2.countdown.line2Prefix": { en: "for delivery ", ar: "ليصل الطلب " },
  "campaign.v2.countdown.line2Bold": { en: "today", ar: "اليوم" },
  "campaign.v2.countdown.closedLine1": {
    en: "Today's orders are closed",
    ar: "أُغلقت طلبات اليوم",
  },
  "campaign.v2.countdown.closedLine2": { en: "Next delivery slot", ar: "موعد التوصيل التالي" },
  "campaign.v2.countdown.closedValue": { en: "Tomorrow, 9 AM", ar: "غداً، 9 صباحاً" },
  "campaign.v2.countdown.staticValue": {
    en: "for delivery today",
    ar: "للتوصيل اليوم",
  },
  // Heading for the secondary add-on section (chocolates, cakes, balloons)
  // shown below the reviews on the Beirut paid-search variant.
  "campaign.v2.addons.title": {
    en: "Add Something Special",
    ar: "أضف شيئاً مميزاً",
  },
  "campaign.v2.cta.shop": { en: "Shop best sellers", ar: "تسوّق الأكثر مبيعاً" },
  "campaign.v2.cta.whatsapp": { en: "Order on WhatsApp", ar: "اطلب عبر واتساب" },
  "campaign.v2.cta.hint": {
    en: "Not sure what to send? Tell us the occasion and budget.",
    ar: "غير متأكد ماذا ترسل؟ أخبرنا بالمناسبة والميزانية.",
  },
  "campaign.v2.trust.address.title": { en: "No address needed", ar: "لا حاجة للعنوان" },
  "campaign.v2.trust.address.sub": {
    en: "We collect it from the recipient",
    ar: "نحصل عليه من المستلم",
  },
  "campaign.v2.trust.tracking.title": { en: "Live order tracking", ar: "تتبّع مباشر للطلب" },
  "campaign.v2.trust.tracking.sub": {
    en: "Real-time updates until it lands",
    ar: "تحديثات لحظية حتى وصول الطلب",
  },
  "campaign.v2.trust.delivery.title": { en: "Express Delivery", ar: "توصيل سريع" },
  "campaign.v2.trust.delivery.sub": {
    en: "90 minute delivery available on all products",
    ar: "توصيل خلال 90 دقيقة متاح لجميع المنتجات",
  },
  "campaign.v2.trust.rating.title": { en: "4.8 out of 5", ar: "4.8 من 5" },
  "campaign.v2.trust.rating.sub": {
    en: "1,240 verified Trustpilot reviews",
    ar: "1,240 تقييماً موثّقاً على Trustpilot",
  },
  "campaign.v2.sticky.sub": {
    en: "No address needed · order by 10 PM",
    ar: "لا حاجة للعنوان · اطلب قبل 10 مساءً",
  },
  "campaign.v2.hero.imageAlt": {
    en: "Fresh hand-arranged bouquet from our Beirut florists",
    ar: "باقة زهور طازجة منسّقة يدوياً من بائعي الزهور لدينا في بيروت",
  },
  "campaign.v2.whatsappPrefill": {
    en: "Hi! I'd like to order flowers for delivery in Beirut today. Can you help me choose?",
    ar: "مرحباً! أودّ طلب زهور لتوصيلها في بيروت اليوم. هل يمكنكم مساعدتي في الاختيار؟",
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

  // ── Beirut paid-search hero variant (v2) ──
  "campaign.v2.badge.open": "Toutes nos boutiques au Liban sont ouvertes",
  "campaign.v2.badge.closed": "Réouverture à 9 h · commandez en ligne dès maintenant",
  "campaign.v2.hero.title": "Fleurs livrées à {city} aujourd'hui",
  "campaign.v2.hero.sub1": "Arrangées ce matin par nos fleuristes d'Achrafieh. ",
  "campaign.v2.hero.subQ": "Vous n'avez pas leur adresse ?",
  "campaign.v2.hero.sub2": " Commandez quand même — nous la demanderons au destinataire pour vous.",
  "campaign.v2.countdown.line1": "Commandez dans les",
  "campaign.v2.countdown.line2Prefix": "pour une livraison ",
  "campaign.v2.countdown.line2Bold": "aujourd'hui",
  "campaign.v2.countdown.closedLine1": "Les commandes du jour sont clôturées",
  "campaign.v2.countdown.closedLine2": "Prochain créneau de livraison",
  "campaign.v2.countdown.closedValue": "Demain, 9 h",
  "campaign.v2.countdown.staticLine1": "Commandez avant 22 h",
  "campaign.v2.countdown.staticValue": "pour la livraison aujourd'hui",
  "campaign.v2.addons.title": "Ajoutez quelque chose de spécial",
  "campaign.v2.cta.shop": "Voir les meilleures ventes",
  "campaign.v2.cta.whatsapp": "Commander sur WhatsApp",
  "campaign.v2.cta.hint": "Vous hésitez ? Dites-nous l'occasion et le budget.",
  "campaign.v2.trust.address.title": "Aucune adresse requise",
  "campaign.v2.trust.address.sub": "Nous la demandons au destinataire",
  "campaign.v2.trust.tracking.title": "Suivi de commande en direct",
  "campaign.v2.trust.tracking.sub": "Mises à jour en temps réel jusqu'à la livraison",
  "campaign.v2.trust.delivery.title": "Livraison gratuite dès $90",
  "campaign.v2.trust.delivery.sub": "Tarif fixe en dessous · tout le Liban",
  "campaign.v2.trust.rating.title": "4.8 sur 5",
  "campaign.v2.trust.rating.sub": "1 240 avis vérifiés sur Trustpilot",
  "campaign.v2.sticky.sub": "Aucune adresse requise · commandez avant 22 h",
  "campaign.v2.hero.imageAlt": "Bouquet frais arrangé à la main par nos fleuristes de Beyrouth",
  "campaign.v2.whatsappPrefill":
    "Bonjour ! Je souhaite commander des fleurs à livrer à Beyrouth aujourd'hui. Pouvez-vous m'aider à choisir ?",
};
