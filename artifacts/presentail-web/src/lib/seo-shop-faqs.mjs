// Server-side FAQ copy for category, occasion, brand, and brands-listing shop pages.
// These strings mirror the translation keys in src/locales/shop.ts:
//   seo.content.cat.faq.{1,2,3}.{q,a}
//   seo.content.occ.faq.{1,2,3}.{q,a}
//   seo.content.brand.faq.{1,2,3}.{q,a}
//   seo.content.brands.faq.{1,2,3}.{q,a}
// They use {name} and/or {city} as template placeholders — fill them with
// formatTemplate() from src/lib/seo.mjs before emitting JSON-LD.
//
// KEEP IN SYNC with src/locales/shop.ts. When copy in shop.ts changes,
// update this file to match so the server-rendered JSON-LD stays consistent
// with what SEOContentSection.tsx renders at runtime.

/** @typedef {{ q: string; a: string }} FaqItem */
/** @typedef {FaqItem[]} FaqList */
/** @typedef {{ en: FaqList; ar: FaqList; fr: FaqList }} FaqCopy */

/** FAQ copy for /shop?category=<slug> pages. */
export const CATEGORY_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "How fast can you deliver {name} in {city}?",
      a: "Presentail offers same-day {name} delivery in {city} when you order before midday. We also offer scheduled delivery for up to 30 days in advance — choose your preferred date and two-hour time window at checkout.",
    },
    {
      q: "Can I schedule a {name} delivery in advance?",
      a: "Yes. You can schedule your delivery up to 30 days ahead. At checkout, simply pick the date and two-hour delivery window that suits you, and we'll take care of the rest.",
    },
    {
      q: "What extras can I add to my {name} order?",
      a: "When ordering {name} in {city}, you can add a personalised card, chocolates, balloons, scented candles, and more. Browse the extras section at checkout to see everything available for your order.",
    },
  ],
  ar: [
    {
      q: "كم من الوقت تستغرق توصيل {name} في {city}؟",
      a: "تقدم Presentail توصيل {name} في اليوم نفسه في {city} عند الطلب قبل الظهيرة. كما نوفر توصيلاً مجدولاً يصل إلى 30 يوماً مقدماً — اختر تاريخك المفضل ونافذة توصيل مدتها ساعتان عند الدفع.",
    },
    {
      q: "هل يمكنني جدولة توصيل {name} مسبقاً؟",
      a: "نعم. يمكنك جدولة توصيلك قبل 30 يوماً. عند الدفع، اختر ببساطة التاريخ ونافذة التوصيل المكوّنة من ساعتين التي تناسبك، وسنتكفّل بالباقي.",
    },
    {
      q: "ما الإضافات التي يمكنني إضافتها إلى طلب {name}؟",
      a: "عند طلب {name} في {city}، يمكنك إضافة بطاقة شخصية وشوكولاتة وبالونات وشموع عطرية والمزيد. تصفّح قسم الإضافات عند الدفع لترى كل ما هو متاح لطلبك.",
    },
  ],
  fr: [
    {
      q: "Quel est le délai de livraison de {name} à {city} ?",
      a: "Presentail propose la livraison de {name} le jour même à {city} pour toute commande passée avant midi. Nous offrons également une livraison programmée jusqu'à 30 jours à l'avance — choisissez votre date préférée et votre créneau de deux heures lors du paiement.",
    },
    {
      q: "Puis-je programmer une livraison de {name} à l'avance ?",
      a: "Oui. Vous pouvez programmer votre livraison jusqu'à 30 jours à l'avance. Lors du paiement, choisissez simplement la date et le créneau de deux heures qui vous conviennent, et nous nous occupons du reste.",
    },
    {
      q: "Quels extras puis-je ajouter à ma commande de {name} ?",
      a: "Lors de la commande de {name} à {city}, vous pouvez ajouter une carte personnalisée, des chocolats, des ballons, des bougies parfumées et bien plus encore. Consultez la section extras lors du paiement pour voir tout ce qui est disponible pour votre commande.",
    },
  ],
});

/** FAQ copy for /brand/<slug> pages. */
export const BRAND_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "How do I order {name} delivery in {city}?",
      a: "Browse the {name} collection above and add items to your cart. At checkout, enter your delivery address in {city}, choose a date and two-hour time window, and complete your payment. {name} orders are fulfilled by Presentail and delivered same-day or on your scheduled date.",
    },
    {
      q: "Is same-day {name} delivery available in {city}?",
      a: "Yes — same-day delivery is available in {city} when you order before midday. You can also schedule delivery up to 30 days in advance for birthdays, anniversaries and other special occasions.",
    },
    {
      q: "Can I include a personalised message with my {name} order?",
      a: "Absolutely. At checkout you can add a personalised card with a custom message. You can also add chocolates, balloons, scented candles and other extras to complete your {name} gift.",
    },
  ],
  ar: [
    {
      q: "كيف أطلب توصيل {name} في {city}؟",
      a: "تصفّح مجموعة {name} أعلاه وأضف المنتجات إلى سلتك. عند الدفع، أدخل عنوان التوصيل في {city} واختر تاريخاً ونافذة زمنية مدتها ساعتان، ثم أكمل الدفع. تُنفَّذ طلبات {name} من قِبل Presentail وتُوصَّل في اليوم نفسه أو في التاريخ المجدول.",
    },
    {
      q: "هل يتوفر توصيل {name} في اليوم نفسه في {city}؟",
      a: "نعم — يتوفر التوصيل في اليوم نفسه في {city} عند الطلب قبل الظهيرة. كما يمكنك جدولة التوصيل قبل 30 يوماً لأعياد الميلاد والذكريات السنوية والمناسبات الخاصة الأخرى.",
    },
    {
      q: "هل يمكنني إرفاق رسالة شخصية مع طلب {name}؟",
      a: "بالتأكيد. يمكنك عند الدفع إضافة بطاقة شخصية مع رسالة مخصصة. كما يمكنك إضافة شوكولاتة وبالونات وشموع عطرية وغيرها من الإضافات لإتمام هدية {name}.",
    },
  ],
  fr: [
    {
      q: "Comment commander la livraison {name} à {city} ?",
      a: "Parcourez la collection {name} ci-dessus et ajoutez des articles à votre panier. Lors du paiement, saisissez votre adresse de livraison à {city}, choisissez une date et un créneau de deux heures, puis finalisez votre paiement. Les commandes {name} sont traitées par Presentail et livrées le jour même ou à la date programmée.",
    },
    {
      q: "La livraison {name} le jour même est-elle disponible à {city} ?",
      a: "Oui — la livraison le jour même est disponible à {city} pour toute commande passée avant midi. Vous pouvez également programmer la livraison jusqu'à 30 jours à l'avance pour les anniversaires, fêtes et autres occasions spéciales.",
    },
    {
      q: "Puis-je inclure un message personnalisé avec ma commande {name} ?",
      a: "Absolument. Lors du paiement, vous pouvez ajouter une carte personnalisée avec un message sur mesure. Vous pouvez également ajouter des chocolats, ballons, bougies parfumées et d'autres extras pour compléter votre cadeau {name}.",
    },
  ],
});

/** FAQ copy for the /brands listing page. Uses {city} only (no {name}). */
export const BRANDS_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "Which gift brands deliver in {city}?",
      a: "Presentail works with a curated selection of premium brands in {city}, including florists, chocolatiers, cake studios and lifestyle gift brands. The full list is shown above and is updated regularly as we onboard new partners.",
    },
    {
      q: "Can I order from multiple brands in one delivery?",
      a: "Yes — you can add items from different brands to a single cart and check out in one transaction. Presentail coordinates delivery so everything arrives together.",
    },
    {
      q: "Do all brands offer same-day delivery in {city}?",
      a: "Most of our brand partners offer same-day delivery in {city} when you order before midday. Delivery availability by brand and time slot is shown at checkout.",
    },
  ],
  ar: [
    {
      q: "ما علامات الهدايا التي توصّل في {city}؟",
      a: "تتعاون Presentail مع تشكيلة مختارة من العلامات الراقية في {city}، تشمل محلات الزهور وصنّاع الشوكولاتة واستوديوهات الكيك وعلامات هدايا الأسلوب الحياتي. القائمة الكاملة تظهر أعلاه وتُحدَّث باستمرار مع انضمام شركاء جدد.",
    },
    {
      q: "هل يمكنني الطلب من علامات متعددة في توصيلة واحدة؟",
      a: "نعم — يمكنك إضافة منتجات من علامات مختلفة إلى سلة واحدة والدفع في معاملة واحدة. تنسّق Presentail التوصيل لتصل جميع الطلبات معاً.",
    },
    {
      q: "هل تقدم جميع العلامات توصيلاً في اليوم نفسه في {city}؟",
      a: "معظم شركائنا من العلامات يقدمون التوصيل في اليوم نفسه في {city} عند الطلب قبل الظهيرة. يتم عرض توفر التوصيل حسب العلامة والفترة الزمنية عند الدفع.",
    },
  ],
  fr: [
    {
      q: "Quelles marques cadeaux livrent à {city} ?",
      a: "Presentail collabore avec une sélection de marques premium à {city}, notamment des fleuristes, chocolatiers, ateliers de gâteaux et marques cadeaux lifestyle. La liste complète est affichée ci-dessus et mise à jour régulièrement au fil des nouveaux partenariats.",
    },
    {
      q: "Puis-je commander auprès de plusieurs marques en une seule livraison ?",
      a: "Oui — vous pouvez ajouter des articles de différentes marques à un seul panier et passer commande en une seule transaction. Presentail coordonne la livraison pour que tout arrive ensemble.",
    },
    {
      q: "Toutes les marques proposent-elles la livraison le jour même à {city} ?",
      a: "La plupart de nos marques partenaires proposent la livraison le jour même à {city} pour toute commande passée avant midi. La disponibilité de livraison par marque et créneau horaire est indiquée lors du paiement.",
    },
  ],
});

/** FAQ copy for /shop?occasion=<slug> pages. */
export const OCCASION_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "What gifts can I send for {name} in {city}?",
      a: "Presentail offers a wide range of {name} gifts in {city}, including fresh flower bouquets, flower boxes, cakes, chocolates, plants and curated gift sets. Browse the collection above to find the perfect match for your recipient.",
    },
    {
      q: "Is same-day {name} gift delivery available in {city}?",
      a: "Yes — same-day delivery is available in {city} when you place your order before midday. You can also schedule delivery up to 30 days ahead for extra peace of mind.",
    },
    {
      q: "Do you deliver {name} gifts on weekends in {city}?",
      a: "Presentail delivers seven days a week in {city}, including weekends and most public holidays. Check the checkout for available slots on your chosen date.",
    },
  ],
  ar: [
    {
      q: "ما الهدايا التي يمكنني إرسالها لـ {name} في {city}؟",
      a: "تقدم Presentail مجموعة واسعة من هدايا {name} في {city}، تشمل باقات الزهور الطازجة وصناديق الزهور والكيك والشوكولاتة والنباتات ومجموعات الهدايا المنسّقة. تصفّح المجموعة أعلاه للعثور على الهدية المثالية لمن تحب.",
    },
    {
      q: "هل يتوفر توصيل هدايا {name} في اليوم نفسه في {city}؟",
      a: "نعم — يتوفر التوصيل في اليوم نفسه في {city} عند تقديم طلبك قبل الظهيرة. يمكنك أيضاً جدولة التوصيل قبل 30 يوماً لراحة بال إضافية.",
    },
    {
      q: "هل توصّلون هدايا {name} في عطلات نهاية الأسبوع في {city}؟",
      a: "تعمل Presentail سبعة أيام في الأسبوع في {city}، بما في ذلك عطلات نهاية الأسبوع ومعظم الأعياد الرسمية. تحقق من المواعيد المتاحة عند الدفع للتاريخ الذي تختاره.",
    },
  ],
  fr: [
    {
      q: "Quels cadeaux puis-je envoyer pour {name} à {city} ?",
      a: "Presentail propose une large gamme de cadeaux pour {name} à {city}, notamment des bouquets de fleurs fraîches, des boîtes de fleurs, des gâteaux, des chocolats, des plantes et des coffrets cadeaux. Parcourez la collection ci-dessus pour trouver l'accord parfait pour votre destinataire.",
    },
    {
      q: "La livraison de cadeaux {name} le jour même est-elle disponible à {city} ?",
      a: "Oui — la livraison le jour même est disponible à {city} pour toute commande passée avant midi. Vous pouvez également programmer la livraison jusqu'à 30 jours à l'avance pour plus de sérénité.",
    },
    {
      q: "Livrez-vous des cadeaux {name} le week-end à {city} ?",
      a: "Presentail livre sept jours sur sept à {city}, y compris les week-ends et la plupart des jours fériés. Vérifiez les créneaux disponibles lors du paiement pour la date de votre choix.",
    },
  ],
});
