// Server-side FAQ copy and heading/intro copy for category, occasion, brand,
// brands-listing, and generic public route shop pages. These strings mirror
// the translation keys in src/locales/shop.ts:
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
//   seo.content.homepage.faq.{1,2,3}.{q,a}
//   seo.content.shop.faq.{1,2,3}.{q,a}
//   seo.content.corporate.faq.{1,2,3}.{q,a}
//   seo.content.weddings.faq.{1,2,3}.{q,a}
//   seo.content.occasions.faq.{1,2,3}.{q,a}
//   seo.content.contact.faq.{1,2,3}.{q,a}
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

// ── Generic public route FAQ copy ─────────────────────────────────────────────
// Used by buildSeoHead() in seo-inject.mjs to emit FAQPage JSON-LD in the
// initial HTML for routes whose FAQ section is rendered by SEOContentSection.
// Mirrors the translation keys listed above (homepage/shop/corporate/weddings/
// occasions/contact). Uses {city} as a template placeholder.

/** FAQ copy for the homepage (/). Uses {city} only. */
export const HOMEPAGE_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "Do you offer same-day flower delivery in {city}?",
      a: "Yes — order before midday and your flowers or gifts can be delivered the same day anywhere in {city}. You can also schedule delivery up to 30 days in advance and choose your preferred two-hour window.",
    },
    {
      q: "What gifts can I order in {city}?",
      a: "Presentail delivers fresh flowers, flower boxes, cakes, chocolates, plants, balloons, gift baskets and curated bundles in {city}. Every order can be personalised with a card message, and most products support same-day delivery.",
    },
    {
      q: "How do I track my order in {city}?",
      a: "Once your order is confirmed you receive a tracking link by SMS and email. You can check delivery status in real time from your account or via the link — no app required.",
    },
  ],
  ar: [
    {
      q: "هل تقدمون توصيل الزهور في اليوم نفسه في {city}؟",
      a: "نعم — اطلب قبل منتصف النهار ويمكن توصيل زهورك أو هداياك في اليوم نفسه في أي مكان في {city}. يمكنك أيضاً جدولة التوصيل قبل 30 يوماً واختيار النافذة الزمنية المفضلة لديك.",
    },
    {
      q: "ما الهدايا التي يمكنني طلبها في {city}؟",
      a: "يوصّل Presentail الزهور الطازجة وصناديق الزهور والكعك والشوكولاتة والنباتات والبالونات وسلال الهدايا والمجموعات المنتقاة في {city}. يمكن تخصيص كل طلب برسالة بطاقة، وتدعم معظم المنتجات التوصيل في اليوم نفسه.",
    },
    {
      q: "كيف أتابع طلبي في {city}؟",
      a: "بمجرد تأكيد طلبك، ستتلقى رابط تتبع عبر الرسائل القصيرة والبريد الإلكتروني. يمكنك التحقق من حالة التوصيل في الوقت الفعلي من حسابك أو عبر الرابط — بدون الحاجة إلى تطبيق.",
    },
  ],
  fr: [
    {
      q: "Proposez-vous la livraison de fleurs le jour même à {city} ?",
      a: "Oui — commandez avant midi et vos fleurs ou cadeaux peuvent être livrés le jour même partout à {city}. Vous pouvez également programmer la livraison jusqu'à 30 jours à l'avance et choisir votre créneau de deux heures préféré.",
    },
    {
      q: "Quels cadeaux puis-je commander à {city} ?",
      a: "Presentail livre des fleurs fraîches, des boîtes de fleurs, des gâteaux, des chocolats, des plantes, des ballons, des paniers cadeaux et des coffrets à {city}. Chaque commande peut être personnalisée avec un message de carte, et la plupart des produits bénéficient de la livraison le jour même.",
    },
    {
      q: "Comment suivre ma commande à {city} ?",
      a: "Une fois votre commande confirmée, vous recevez un lien de suivi par SMS et e-mail. Vous pouvez vérifier le statut de la livraison en temps réel depuis votre compte ou via le lien — sans application nécessaire.",
    },
  ],
});

/** FAQ copy for the /shop (no-filter) page. Uses {city} only. */
export const SHOP_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "What is the best-selling gift in {city}?",
      a: "Our hand-bouquets, flower boxes and signature chocolate boxes consistently top sales in {city}. Use the 'Best Seller' sort on this page to browse what shoppers love most right now.",
    },
    {
      q: "Can I add a personalised card to any order in {city}?",
      a: "Yes — every Presentail order includes the option to add a personalised card with a custom message. You can also add chocolates, balloons or scented candles at checkout to create the perfect gift bundle.",
    },
    {
      q: "What delivery options are available in {city}?",
      a: "We offer same-day delivery (order before midday), express 90-minute delivery in select zones, and scheduled delivery up to 30 days ahead. Choose your preferred date and two-hour time window at checkout.",
    },
  ],
  ar: [
    {
      q: "ما أكثر الهدايا مبيعاً في {city}؟",
      a: "تتصدر باقاتنا اليدوية وصناديق الزهور وعلب الشوكولاتة المميزة المبيعات باستمرار في {city}. استخدم خيار الترتيب 'الأكثر مبيعاً' في هذه الصفحة للتصفح بما يحبه المتسوقون الآن.",
    },
    {
      q: "هل يمكنني إضافة بطاقة شخصية إلى أي طلب في {city}؟",
      a: "نعم — كل طلب من Presentail يتضمن خيار إضافة بطاقة شخصية برسالة مخصصة. يمكنك أيضاً إضافة شوكولاتة أو بالونات أو شموع عطرية عند الدفع لإنشاء مجموعة الهدايا المثالية.",
    },
    {
      q: "ما خيارات التوصيل المتاحة في {city}؟",
      a: "نقدم التوصيل في اليوم نفسه (اطلب قبل منتصف النهار)، والتوصيل السريع خلال 90 دقيقة في مناطق مختارة، والتوصيل المجدول حتى 30 يوماً مقدماً. اختر التاريخ المفضل ونافذة الساعتين عند الدفع.",
    },
  ],
  fr: [
    {
      q: "Quel est le cadeau le plus vendu à {city} ?",
      a: "Nos bouquets à la main, boîtes de fleurs et coffrets chocolats signatures figurent régulièrement en tête des ventes à {city}. Utilisez le tri 'Meilleures ventes' sur cette page pour découvrir ce que les clients adorent en ce moment.",
    },
    {
      q: "Puis-je ajouter une carte personnalisée à n'importe quelle commande à {city} ?",
      a: "Oui — chaque commande Presentail offre la possibilité d'ajouter une carte personnalisée avec un message sur mesure. Vous pouvez également ajouter des chocolats, ballons ou bougies parfumées lors du paiement pour créer l'association cadeau parfaite.",
    },
    {
      q: "Quelles options de livraison sont disponibles à {city} ?",
      a: "Nous proposons la livraison le jour même (commande avant midi), la livraison express en 90 minutes dans certaines zones, et la livraison programmée jusqu'à 30 jours à l'avance. Choisissez votre date et créneau de deux heures préférés lors du paiement.",
    },
  ],
});

/** FAQ copy for the /corporate page. Uses {city} only. */
export const CORPORATE_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "What is the minimum order for corporate gifts in {city}?",
      a: "Volume pricing starts from 10 gifts. For smaller quantities, you can order standard products through the Presentail shop and add a personalised card. Contact our corporate team for tailored packages.",
    },
    {
      q: "Can you brand the packaging with our company logo in {city}?",
      a: "Yes — we offer custom ribbons, cards, sleeves and inserts printed with your logo or brand message. Our corporate team will walk you through the branding options when you submit your brief.",
    },
    {
      q: "Do you deliver corporate gifts on the same day in {city}?",
      a: "Yes — same-day delivery is available in {city} for corporate orders placed before midday. For large campaigns with multiple recipients we recommend scheduling at least 48 hours ahead to ensure smooth coordination.",
    },
  ],
  ar: [
    {
      q: "ما الحد الأدنى للطلب في خدمة هدايا الشركات في {city}؟",
      a: "تبدأ أسعار الجملة من 10 هدايا. بالنسبة للكميات الأصغر، يمكنك طلب المنتجات العادية عبر متجر Presentail وإضافة بطاقة شخصية. تواصل مع فريق الشركات للحصول على باقات مخصصة.",
    },
    {
      q: "هل يمكنكم وضع شعار شركتنا على التغليف في {city}؟",
      a: "نعم — نقدم أشرطة وبطاقات وأكمام وإدراجات مخصصة مطبوعة بشعارك أو رسالة علامتك التجارية. سيطلعك فريق الشركات على خيارات العلامة التجارية عند تقديم موجزك.",
    },
    {
      q: "هل توصلون هدايا الشركات في اليوم نفسه في {city}؟",
      a: "نعم — يتوفر التوصيل في اليوم نفسه في {city} للطلبات المؤسسية المقدَّمة قبل منتصف النهار. بالنسبة للحملات الكبيرة ذات المستلمين المتعددين، ننصح بالجدولة قبل 48 ساعة على الأقل لضمان التنسيق السلس.",
    },
  ],
  fr: [
    {
      q: "Quel est le minimum de commande pour des cadeaux d'entreprise à {city} ?",
      a: "Les tarifs volume démarrent à partir de 10 cadeaux. Pour des quantités moindres, vous pouvez commander des produits standards via la boutique Presentail et ajouter une carte personnalisée. Contactez notre équipe corporate pour des packages sur mesure.",
    },
    {
      q: "Pouvez-vous personnaliser l'emballage avec notre logo d'entreprise à {city} ?",
      a: "Oui — nous proposons des rubans, cartes, fourreaux et inserts personnalisés imprimés avec votre logo ou message de marque. Notre équipe corporate vous présentera les options de personnalisation lorsque vous soumettez votre brief.",
    },
    {
      q: "Livrez-vous les cadeaux d'entreprise le jour même à {city} ?",
      a: "Oui — la livraison le jour même est disponible à {city} pour les commandes corporate passées avant midi. Pour les grandes campagnes avec plusieurs destinataires, nous recommandons de planifier au moins 48 heures à l'avance pour une coordination fluide.",
    },
  ],
});

/** FAQ copy for the /weddings page. Uses {city} only. */
export const WEDDINGS_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "How far in advance should I book wedding flowers in {city}?",
      a: "We recommend reaching out at least 4–6 weeks before your wedding date in {city}. For peak seasons (spring and autumn) earlier booking is preferred to ensure availability of your preferred flowers and colour palette.",
    },
    {
      q: "Do you design bridal bouquets in {city}?",
      a: "Yes — our florists create hand-tied bridal bouquets, bridesmaid posies, boutonnières and flower crowns. All pieces are made on the morning of the event and delivered to your venue or hotel in {city}.",
    },
    {
      q: "Can you handle both flowers and guest gifts for our wedding in {city}?",
      a: "Absolutely. Many couples choose Presentail to handle the complete gifting experience in {city} — ceremony and reception florals alongside curated welcome boxes, chocolates and personalised notes for each guest. Ask about our combined event packages.",
    },
  ],
  ar: [
    {
      q: "قبل كم من الوقت يجب أن أحجز أزهار الزفاف في {city}؟",
      a: "ننصح بالتواصل قبل 4-6 أسابيع على الأقل من تاريخ زفافك في {city}. في مواسم الذروة (الربيع والخريف)، يُفضَّل الحجز المبكر لضمان توافر الزهور المفضلة لديك ولوحة الألوان.",
    },
    {
      q: "هل تصممون باقات العروس في {city}؟",
      a: "نعم — يصنع خبراء التزيين لدينا باقات العروس اليدوية وباقات الوصيفات والبوتونيير وأكاليل الأزهار. جميع القطع تُصنع في صباح يوم الحفل وتُوصَّل إلى مكان حفلك أو فندقك في {city}.",
    },
    {
      q: "هل يمكنكم التعامل مع الأزهار وهدايا الضيوف معاً لزفافنا في {city}؟",
      a: "بالتأكيد. يختار كثير من الأزواج Presentail للإشراف على تجربة الإهداء الكاملة في {city} — أزهار المراسم والاستقبال إلى جانب صناديق ترحيب منتقاة وشوكولاتة ورسائل شخصية لكل ضيف. اسأل عن باقاتنا المشتركة للمناسبات.",
    },
  ],
  fr: [
    {
      q: "Combien de temps à l'avance dois-je réserver des fleurs de mariage à {city} ?",
      a: "Nous recommandons de nous contacter au moins 4 à 6 semaines avant votre date de mariage à {city}. En haute saison (printemps et automne), une réservation anticipée est préférable pour garantir la disponibilité de vos fleurs et de votre palette de couleurs préférées.",
    },
    {
      q: "Créez-vous des bouquets de mariée à {city} ?",
      a: "Oui — nos fleuristes réalisent des bouquets de mariée liés à la main, des bouquets de demoiselles d'honneur, des boutonnières et des couronnes de fleurs. Toutes les pièces sont confectionnées le matin de l'événement et livrées à votre lieu de réception ou hôtel à {city}.",
    },
    {
      q: "Pouvez-vous gérer à la fois les fleurs et les cadeaux invités pour notre mariage à {city} ?",
      a: "Absolument. De nombreux couples choisissent Presentail pour gérer l'expérience cadeau complète à {city} — fleurs de cérémonie et réception avec welcome boxes sélectionnées, chocolats et notes personnalisées pour chaque invité. Renseignez-vous sur nos formules événementielles combinées.",
    },
  ],
});

/** FAQ copy for the /occasions (all-occasions listing) page. Uses {city} only. */
export const OCCASIONS_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "What are the most popular gift occasions in {city}?",
      a: "Birthdays, anniversaries and Valentine's Day are among our busiest occasions in {city}. We also see strong demand for Mother's Day, Eid, graduations and newborn gifts. Every occasion has a curated collection on Presentail.",
    },
    {
      q: "Can I send a last-minute gift for any occasion in {city}?",
      a: "Yes — same-day delivery is available in {city} for orders placed before midday. In select areas we offer express 90-minute delivery so you can send a thoughtful gift even when time is short.",
    },
    {
      q: "Do you create custom gift sets for special occasions in {city}?",
      a: "Yes — at checkout you can personalise any order with a card message and extras like chocolates, balloons or scented candles. For fully bespoke gift sets or large event orders, reach out to our concierge team directly.",
    },
  ],
  ar: [
    {
      q: "ما أكثر مناسبات الإهداء شعبية في {city}؟",
      a: "أعياد الميلاد والذكريات السنوية وعيد الحب من أكثر مناسباتنا ازدحاماً في {city}. كما نشهد طلباً كبيراً في عيد الأم والعيد والتخرج وهدايا المولودين الجدد. لكل مناسبة مجموعة منتقاة على Presentail.",
    },
    {
      q: "هل يمكنني إرسال هدية في اللحظة الأخيرة لأي مناسبة في {city}؟",
      a: "نعم — يتوفر التوصيل في اليوم نفسه في {city} للطلبات المقدَّمة قبل منتصف النهار. في مناطق مختارة نقدم التوصيل السريع خلال 90 دقيقة حتى تتمكن من إرسال هدية مدروسة حتى عندما يكون الوقت ضيقاً.",
    },
    {
      q: "هل تصنعون مجموعات هدايا مخصصة للمناسبات الخاصة في {city}؟",
      a: "نعم — عند الدفع يمكنك تخصيص أي طلب برسالة بطاقة وإضافات مثل الشوكولاتة والبالونات أو الشموع العطرية. لمجموعات الهدايا المصممة بالكامل أو طلبات المناسبات الكبيرة، تواصل مع فريق الكونسيرج لدينا مباشرة.",
    },
  ],
  fr: [
    {
      q: "Quelles sont les occasions de cadeaux les plus populaires à {city} ?",
      a: "Les anniversaires, les fêtes de mariage et la Saint-Valentin comptent parmi nos occasions les plus chargées à {city}. La fête des Mères, l'Aïd, les remises de diplômes et les cadeaux pour nouveau-nés sont également très demandés. Chaque occasion dispose d'une collection soigneusement sélectionnée sur Presentail.",
    },
    {
      q: "Puis-je envoyer un cadeau de dernière minute pour n'importe quelle occasion à {city} ?",
      a: "Oui — la livraison le jour même est disponible à {city} pour les commandes passées avant midi. Dans certaines zones, nous proposons une livraison express en 90 minutes, pour envoyer un cadeau attentionné même quand le temps manque.",
    },
    {
      q: "Créez-vous des coffrets cadeaux personnalisés pour les occasions spéciales à {city} ?",
      a: "Oui — lors du paiement, vous pouvez personnaliser toute commande avec un message de carte et des extras comme des chocolats, ballons ou bougies parfumées. Pour des coffrets entièrement sur mesure ou de grandes commandes pour événements, contactez directement notre équipe conciergerie.",
    },
  ],
});

/** FAQ copy for the /contact page. Uses {city} only. */
export const CONTACT_FAQ_COPY = /** @type {FaqCopy} */ ({
  en: [
    {
      q: "How quickly does the Presentail team respond in {city}?",
      a: "Our concierge team is available every day from 8 AM to midnight (Beirut time) and typically replies on WhatsApp within minutes. Email responses are within 24 hours for detailed or corporate enquiries.",
    },
    {
      q: "Can I change or cancel my order after placing it?",
      a: "If your order has not yet been prepared, contact us as soon as possible and we'll do our best to amend or cancel it. Once an order is in production, changes may not be possible — so reach out early via WhatsApp for the fastest response.",
    },
    {
      q: "How do I report an issue with my delivery in {city}?",
      a: "Contact us on WhatsApp or by email with your order number and a brief description of the issue. We investigate all delivery concerns promptly and will work with you to find the best resolution.",
    },
  ],
  ar: [
    {
      q: "ما مدى سرعة رد فريق Presentail في {city}؟",
      a: "يتوفر فريق الكونسيرج لدينا كل يوم من الساعة 8 صباحاً حتى منتصف الليل (بتوقيت بيروت) ويرد عادةً على واتساب في غضون دقائق. تكون ردود البريد الإلكتروني في غضون 24 ساعة للاستفسارات التفصيلية أو المؤسسية.",
    },
    {
      q: "هل يمكنني تغيير طلبي أو إلغاؤه بعد تقديمه؟",
      a: "إذا لم يُعدَّ طلبك بعد، تواصل معنا في أقرب وقت ممكن وسنبذل قصارى جهدنا لتعديله أو إلغائه. بمجرد بدء تنفيذ الطلب، قد لا تكون التغييرات ممكنة — لذا تواصل مبكراً عبر واتساب للحصول على أسرع رد.",
    },
    {
      q: "كيف أُبلّغ عن مشكلة في توصيلتي في {city}؟",
      a: "تواصل معنا عبر واتساب أو البريد الإلكتروني مع رقم طلبك ووصف مختصر للمشكلة. نتحقق من جميع مخاوف التوصيل على الفور وسنعمل معك للوصول إلى أفضل حل.",
    },
  ],
  fr: [
    {
      q: "Dans quel délai l'équipe Presentail répond-elle à {city} ?",
      a: "Notre équipe conciergerie est disponible tous les jours de 8h à minuit (heure de Beyrouth) et répond généralement sur WhatsApp en quelques minutes. Les réponses par e-mail sont sous 24 heures pour les demandes détaillées ou corporate.",
    },
    {
      q: "Puis-je modifier ou annuler ma commande après l'avoir passée ?",
      a: "Si votre commande n'a pas encore été préparée, contactez-nous dès que possible et nous ferons notre possible pour la modifier ou l'annuler. Une fois la commande en cours de production, les modifications peuvent ne plus être possibles — contactez-nous tôt via WhatsApp pour une réponse la plus rapide.",
    },
    {
      q: "Comment signaler un problème avec ma livraison à {city} ?",
      a: "Contactez-nous sur WhatsApp ou par e-mail avec votre numéro de commande et une brève description du problème. Nous traitons rapidement toutes les réclamations de livraison et travaillerons avec vous pour trouver la meilleure solution.",
    },
  ],
});
