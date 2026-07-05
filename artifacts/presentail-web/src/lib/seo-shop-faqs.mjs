// Server-side FAQ copy and heading/intro copy for category, occasion, brand,
// and brands-listing shop pages. These strings mirror the translation keys in
// src/locales/shop.ts:
//   seo.content.cat.heading
//   seo.content.cat.introFlower
//   seo.content.cat.introNonFlower
//   seo.content.occ.heading
//   seo.content.occ.intro
//   seo.content.brand.heading
//   seo.content.brand.intro.flowers
//   seo.content.brand.intro.food
//   seo.content.brand.intro.general
//   seo.content.cat.faq.{1,2,3}.{q,a}
//   seo.content.occ.faq.{1,2,3}.{q,a}
//   seo.content.brand.faq.{1,2,3}.{q,a}
//   seo.content.brands.faq.{1,2,3}.{q,a}
// They use {name} and/or {city} as template placeholders — fill them with
// formatTemplate() from src/lib/seo.mjs before emitting JSON-LD or body HTML.
//
// KEEP IN SYNC with src/locales/shop.ts. When copy in shop.ts changes,
// update this file to match so the server-rendered output stays consistent
// with what SEOContentSection.tsx renders at runtime.
// Run `pnpm --filter @workspace/scripts run check-faq-sync` to verify.

/** @typedef {{ q: string; a: string }} FaqItem */
/** @typedef {FaqItem[]} FaqList */
/** @typedef {{ en: FaqList; ar: FaqList; fr: FaqList }} FaqCopy */
/** @typedef {{ en: string; ar: string; fr: string }} StringCopy */

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

// ---------------------------------------------------------------------------
// Heading and intro copy
// Mirror of seo.content.cat.heading / seo.content.cat.introFlower /
// seo.content.cat.introNonFlower / seo.content.occ.heading /
// seo.content.occ.intro / seo.content.brand.heading /
// seo.content.brand.intro.{flowers,food,general} in src/locales/shop.ts.
// Used by seo-inject.mjs to include heading + intro in the server-rendered
// body HTML so AI crawlers see real page content without running JS.
// ---------------------------------------------------------------------------

/** Heading for /shop?category=<slug> pages. */
export const CATEGORY_HEADING_COPY = /** @type {StringCopy} */ ({
  en: "{name} Delivery in {city}",
  ar: "توصيل {name} في {city}",
  fr: "Livraison de {name} à {city}",
});

/** Intro for flower-category pages (e.g. hand-bouquets, flower-boxes). */
export const CATEGORY_INTRO_FLOWER_COPY = /** @type {StringCopy} */ ({
  en: "Presentail brings you a curated selection of {name} delivered fresh to your door in {city}. Whether you're celebrating a birthday, marking an anniversary, or simply brightening someone's day, our expert florists hand-arrange every bouquet with care. Enjoy express same-day delivery, flexible scheduling, and the option to add chocolates, balloons, or a personalised card to make every moment unforgettable.",
  ar: "تقدم لك Presentail تشكيلة مختارة من {name} تُوصَّل طازجة إلى بابك في {city}. سواء كنت تحتفل بعيد ميلاد أو تُحيي ذكرى سنوية أو تريد ببساطة إدخال البهجة على قلب شخص عزيز، يحرص خبراؤنا من المرتّبين على تنسيق كل باقة بعناية. استمتع بتوصيل سريع في اليوم نفسه وجدولة مرنة مع إمكانية إضافة شوكولاتة أو بالونات أو بطاقة شخصية لتجعل كل لحظة لا تُنسى.",
  fr: "Presentail vous propose une sélection soigneuse de {name} livrées fraîches à votre porte à {city}. Que vous fêtiez un anniversaire, une occasion spéciale ou que vous souhaitiez simplement égayer la journée de quelqu'un, nos fleuristes experts composent chaque bouquet avec soin. Profitez d'une livraison express le jour même, d'une planification flexible et de la possibilité d'ajouter chocolats, ballons ou carte personnalisée pour rendre chaque moment inoubliable.",
});

/** Intro for non-flower category pages. */
export const CATEGORY_INTRO_NONFLOWER_COPY = /** @type {StringCopy} */ ({
  en: "Find the perfect {name} for every occasion at Presentail. Our curated collection in {city} spans premium brands and thoughtful designs, all available with same-day delivery. Add a card, flowers, or another personal touch to create a gift that truly stands out — ordered online in minutes and delivered fresh to the door.",
  ar: "اعثر على {name} المثالية لكل مناسبة في Presentail. تمتد مجموعتنا المختارة في {city} لتشمل علامات تجارية راقية وتصاميم مدروسة، وجميعها متاحة مع توصيل في اليوم نفسه. أضف بطاقة أو زهوراً أو لمسة شخصية أخرى لتقديم هدية تبرز حقاً — اطلبها عبر الإنترنت في دقائق وتُوصَّل طازجة إلى الباب.",
  fr: "Trouvez le ou la {name} idéale pour chaque occasion chez Presentail. Notre collection soigneusement sélectionnée à {city} réunit des marques premium et des designs attentionnés, tous disponibles en livraison le jour même. Ajoutez une carte, des fleurs ou une touche personnelle pour créer un cadeau qui se démarque vraiment — commandé en ligne en quelques minutes et livré frais à domicile.",
});

/** Heading for /shop?occasion=<slug> pages. */
export const OCCASION_HEADING_COPY = /** @type {StringCopy} */ ({
  en: "Send {name} Flowers & Gifts in {city}",
  ar: "أرسل زهوراً وهدايا {name} في {city}",
  fr: "Envoyez des fleurs et cadeaux pour {name} à {city}",
});

/** Intro for /shop?occasion=<slug> pages. */
export const OCCASION_INTRO_COPY = /** @type {StringCopy} */ ({
  en: "Make every {name} moment memorable with Presentail. Browse our handpicked selection of flowers, cakes, chocolates and gifts for {name} delivery in {city}, with same-day options available. From elegant hand bouquets to indulgent gift sets, our concierge team is ready to help you find the perfect send.",
  ar: "اجعل كل لحظة {name} لا تُنسى مع Presentail. تصفّح تشكيلتنا المختارة من الزهور والكيك والشوكولاتة والهدايا لتوصيل {name} في {city}، مع توفر خيارات في اليوم نفسه. من الباقات اليدوية الأنيقة إلى مجموعات الهدايا الفاخرة، فريقنا جاهز لمساعدتك في إيجاد الإرسالية المثالية.",
  fr: "Rendez chaque moment de {name} mémorable avec Presentail. Parcourez notre sélection de fleurs, gâteaux, chocolats et cadeaux pour la livraison {name} à {city}, avec des options disponibles le jour même. Des bouquets élégants aux coffrets cadeaux indulgents, notre équipe est prête à vous aider à trouver le cadeau idéal.",
});

/** Heading for /brand/<slug> pages. */
export const BRAND_HEADING_COPY = /** @type {StringCopy} */ ({
  en: "{name} Delivery in {city}",
  ar: "توصيل {name} في {city}",
  fr: "Livraison {name} à {city}",
});

/** Intro for flower-type brands on /brand/<slug> pages. */
export const BRAND_INTRO_FLOWERS_COPY = /** @type {StringCopy} */ ({
  en: "Discover {name}'s freshest arrangements delivered straight to your door in {city}. Presentail partners with {name} to bring you hand-crafted bouquets, flower boxes and floral gifts — all with same-day delivery when you order before midday. Schedule up to 30 days ahead and add chocolates, balloons or a personalised card to complete the send.",
  ar: "اكتشف أحدث تنسيقات {name} تُوصَّل مباشرةً إلى بابك في {city}. تتشارك Presentail مع {name} لتقديم باقات مصنوعة يدوياً وصناديق زهور وهدايا زهرية — مع توصيل في اليوم نفسه عند الطلب قبل الظهيرة. جدوِل قبل 30 يوماً وأضف شوكولاتة أو بالونات أو بطاقة شخصية لإتمام الإرسالية.",
  fr: "Découvrez les compositions les plus fraîches de {name} livrées directement chez vous à {city}. Presentail s'associe à {name} pour vous proposer des bouquets faits main, des boîtes de fleurs et des cadeaux floraux — tous avec livraison le jour même pour toute commande passée avant midi. Planifiez jusqu'à 30 jours à l'avance et ajoutez chocolats, ballons ou carte personnalisée pour compléter votre envoi.",
});

/** Intro for food-type brands on /brand/<slug> pages. */
export const BRAND_INTRO_FOOD_COPY = /** @type {StringCopy} */ ({
  en: "Order from {name}'s full collection in {city} through Presentail. From signature chocolates and artisan cakes to indulgent gift sets, every {name} item is quality-checked and delivered in our premium packaging. Same-day delivery is available when you order before midday, with flexible scheduling up to 30 days ahead.",
  ar: "اطلب من المجموعة الكاملة لـ {name} في {city} عبر Presentail. من الشوكولاتة المميزة والكيك الحرفي إلى مجموعات الهدايا الفاخرة، كل منتج من {name} يخضع لفحص الجودة ويُوصَّل في تغليفنا الفاخر. التوصيل في اليوم نفسه متاح عند الطلب قبل الظهيرة مع جدولة مرنة تصل إلى 30 يوماً.",
  fr: "Commandez la collection complète de {name} à {city} via Presentail. Des chocolats signatures aux gâteaux artisanaux en passant par les coffrets cadeaux gourmands, chaque article {name} est contrôlé qualité et livré dans notre emballage premium. La livraison le jour même est disponible pour toute commande passée avant midi, avec une planification flexible jusqu'à 30 jours à l'avance.",
});

/** Intro for general brands on /brand/<slug> pages. */
export const BRAND_INTRO_GENERAL_COPY = /** @type {StringCopy} */ ({
  en: "Shop {name}'s complete collection in {city} with Presentail. Our curated {name} range covers flowers, gourmet treats and luxury gifts — all available with same-day or scheduled delivery. Add a personalised card or extra treats at checkout to create the perfect send.",
  ar: "تسوّق المجموعة الكاملة لـ {name} في {city} مع Presentail. تشمل تشكيلتنا المختارة من {name} الزهور والأطعمة الراقية والهدايا الفاخرة — جميعها متاحة مع التوصيل في اليوم نفسه أو المجدول. أضف بطاقة شخصية أو مزيداً من الإضافات عند الدفع لتقديم الهدية المثالية.",
  fr: "Découvrez la collection complète de {name} à {city} avec Presentail. Notre gamme {name} couvre fleurs, gourmandises et cadeaux de luxe — tous disponibles en livraison le jour même ou planifiée. Ajoutez une carte personnalisée ou des extras lors du paiement pour créer l'envoi parfait.",
});
