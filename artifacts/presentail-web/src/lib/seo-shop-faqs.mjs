// Server-side FAQ copy for category and occasion shop pages.
// These strings mirror the translation keys in src/locales/shop.ts:
//   seo.content.cat.faq.{1,2,3}.{q,a}
//   seo.content.occ.faq.{1,2,3}.{q,a}
// They use {name} and {city} as template placeholders — fill them with
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
