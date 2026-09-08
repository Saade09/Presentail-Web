// Shared commercial city-template copy for the client pages and the
// crawler-facing server fallback. Keep city as data, rather than interpolating
// it at either call site, so both renderers select exactly the same market copy.
const COPY = {
  corporate: {
    en: {
      lb: ["Corporate gifting planned around your Lebanon delivery", "For teams sending to {city}, one approved brief becomes a recipient plan with quantities, card copy, office or home addresses, and a delivery sequence.", ["Share recipients in stages while headcounts are moving.", "Resolve address, building-access, and card-message questions before dispatch.", "Use one contact for employee moments, client thanks, and seasonal campaigns."], "Browse gift occasions", "Talk through a delivery plan"],
      ae: ["A delivery-ready corporate plan for the UAE", "Sending gifts in {city} often means towers, reception desks, hotel concierge teams, and precise hand-off windows. We capture those delivery notes with the brief before dispatch.", ["Group recipients by office, building, or event venue.", "Add contact names and access instructions to each recipient.", "Schedule campaigns around onboarding, client meetings, and regional holidays."], "Explore gifting occasions", "Discuss UAE delivery details"],
      cy: ["Corporate gifts coordinated for Cyprus teams and guests", "For deliveries in {city}, organisers can map gifts to offices, homes, and hospitality stays without losing the personal note behind each send.", ["Plan employee recognition, conference welcomes, and client follow-ups from one list.", "Keep delivery notes separate from gift messages.", "Confirm timing and location details early for multi-stop campaigns."], "See occasion ideas", "Plan a Cyprus campaign"],
    },
    ar: {
      lb: ["هدايا شركات منظّمة لتوصيلك في لبنان", "للفرق التي ترسل إلى {city}، نحوّل موجزاً معتمداً إلى خطة مستلمين عملية تشمل الكميات ونصوص البطاقات والعناوين وتسلسل التوصيل.", ["يمكن مشاركة المستلمين على دفعات حين لا يكون العدد النهائي ثابتاً.", "نراجع العنوان ودخول المبنى ورسالة البطاقة قبل جولة التوصيل.", "نقطة اتصال واحدة لهدايا الموظفين وشكر العملاء والحملات الموسمية."], "تصفّح مناسبات الهدايا", "ناقش خطة التوصيل"],
      ae: ["خطة هدايا شركات جاهزة للتوصيل في الإمارات", "إرسال الهدايا في {city} قد يتطلّب التنسيق مع الأبراج والاستقبال وفرق كونسيرج الفنادق ومواعيد تسليم دقيقة. نجمع هذه الملاحظات ضمن موجزك قبل الإرسال.", ["رتّب المستلمين بحسب المكتب أو المبنى أو موقع المناسبة.", "أضف أسماء جهات الاتصال وتعليمات الدخول لكل مستلم.", "نسّق الحملات حول التوظيف الجديد واجتماعات العملاء والعطلات الإقليمية."], "استكشف مناسبات الإهداء", "ناقش تفاصيل التوصيل في الإمارات"],
      cy: ["هدايا شركات منسّقة للفرق والضيوف في قبرص", "للتوصيل في {city}، نساعد المنظّمين على توزيع الهدايا بين المكاتب والمنازل وإقامات الضيافة مع الحفاظ على اللمسة الشخصية.", ["خطّط لتقدير الموظفين وترحيب المؤتمرات ومتابعة العملاء من قائمة واحدة.", "افصل ملاحظات التوصيل عن رسائل الهدايا.", "أكّد التوقيت وتفاصيل المكان مبكراً للحملات متعددة المحطات."], "اطّلع على أفكار المناسبات", "خطّط لحملة في قبرص"],
    },
    fr: {
      lb: ["Des cadeaux corporate organisés pour votre livraison au Liban", "Pour les équipes qui envoient à {city}, un brief validé devient un plan destinataires concret : quantités, textes des cartes, adresses et ordre de livraison.", ["Envoyez les destinataires par vagues lorsque l'effectif évolue.", "Nous clarifions adresse, accès et message avant la tournée.", "Un interlocuteur unique pour les temps forts collaborateurs, clients et saisonniers."], "Voir les occasions cadeaux", "Échanger sur un plan de livraison"],
      ae: ["Un plan corporate prêt à livrer aux Émirats", "Envoyer des cadeaux à {city} implique souvent des tours, réceptions, conciergeries d'hôtel et créneaux de remise précis. Ces consignes sont intégrées au brief avant l'expédition.", ["Regroupez les destinataires par bureau, immeuble ou lieu.", "Ajoutez nom du contact et consignes d'accès à chaque destinataire.", "Programmez autour des arrivées, rendez-vous clients et fêtes régionales."], "Explorer les occasions", "Parler des livraisons aux Émirats"],
      cy: ["Des cadeaux corporate coordonnés à Chypre", "Pour les livraisons à {city}, nous répartissons les cadeaux entre bureaux, domiciles et séjours hôteliers sans perdre l'attention personnelle de chaque envoi.", ["Gérez remerciements d'équipe, accueils de conférence et suivis clients depuis une liste.", "Distinguez consignes de livraison et mot cadeau.", "Validez tôt créneau et lieu pour les campagnes à plusieurs arrêts."], "Découvrir les idées d'occasions", "Planifier une campagne à Chypre"],
    },
  },
  weddings: {
    en: {
      lb: ["Event delivery planned around your Lebanon venue", "For celebrations in {city}, your venue plan and event timing shape a considered floral and gifting run. Ceremony pieces, room gifts, and personal bouquets can each have their own hand-off notes.", ["Bring venue, photographer, or planner into the early brief.", "Keep guest welcome gifts and event florals on one coordinated schedule.", "Confirm access, collection, and on-site contact details before the event day."], "Browse celebration gifts", "Discuss your event details"],
      ae: ["Wedding flowers and gifts coordinated for UAE venues", "In {city}, hotel ballrooms, private homes, and event spaces can have distinct access and loading arrangements. We capture those details with your design direction before delivery and installation.", ["Share the venue contact and access window with your guest count.", "Coordinate guest-room gifts separately from ceremony and reception set-up.", "Use one event brief for flowers, welcome boxes, and finishing touches."], "Explore celebration gifting", "Plan a UAE event"],
      cy: ["Celebrations thoughtfully coordinated across Cyprus", "For a wedding or gathering in {city}, we turn the guest journey into a clear service plan: what arrives at the venue, what waits in rooms, and which details need a named hand-off.", ["Map florals, favours, and welcome boxes to guest moments.", "Discuss venue access and installation timing before finalising the run sheet.", "Keep personal messages and delivery directions distinct for a polished arrival."], "See gifts for celebrations", "Talk through a Cyprus event"],
    },
    ar: {
      lb: ["توصيل مناسبتك منظّم حول موقعك في لبنان", "للاحتفالات في {city}، نستخدم خطة المكان وتوقيت المناسبة لوضع مسار مدروس للأزهار والهدايا مع ملاحظات تسليم مستقلة للقطع وهدايا الغرف والباقات.", ["أشرك المكان أو المصوّر أو منظّم الحفل في الموجز المبكر.", "نسّق هدايا الترحيب وأزهار المناسبة ضمن جدول واحد.", "أكّد تفاصيل الدخول والاستلام وجهة الاتصال في الموقع قبل يوم المناسبة."], "تصفّح هدايا الاحتفالات", "ناقش تفاصيل مناسبتك"],
      ae: ["أزهار وهدايا الأعراس منسّقة لمواقع الإمارات", "في {city}، قد يكون لكل قاعة فندق أو منزل خاص أو مساحة مناسبات ترتيبات دخول وتحميل مختلفة. نوثّق هذه التفاصيل إلى جانب رؤيتك التصميمية قبل التوصيل والتركيب.", ["أرسل جهة اتصال المكان ونافذة الدخول مع عدد الضيوف.", "نسّق هدايا غرف الضيوف بصورة مستقلة عن تجهيز المراسم.", "استخدم موجزاً واحداً للأزهار وصناديق الترحيب واللمسات الأخيرة."], "استكشف هدايا الاحتفالات", "خطّط لمناسبة في الإمارات"],
      cy: ["احتفالات منسّقة بعناية في قبرص", "لعرس أو لقاء في {city}، نحوّل رحلة الضيف إلى خطة خدمة واضحة: ما يصل إلى الموقع، وما ينتظر في الغرف، وأي التفاصيل تحتاج تسليماً لشخص محدد.", ["وزّع الأزهار والهدايا وصناديق الترحيب على لحظات الضيوف.", "ناقش دخول الموقع وتوقيت التركيب قبل تثبيت الجدول.", "افصل الرسائل الشخصية عن تعليمات التوصيل لوصول أنيق."], "شاهد هدايا الاحتفالات", "ناقش مناسبة في قبرص"],
    },
    fr: {
      lb: ["Une livraison événementielle pensée pour votre lieu au Liban", "Pour les célébrations à {city}, nous partons de votre plan de lieu et de votre timing pour organiser fleurs et cadeaux. Pièces de cérémonie, cadeaux de chambre et bouquets peuvent suivre des consignes distinctes.", ["Associez le lieu, le photographe ou le wedding planner au brief.", "Réunissez cadeaux d'accueil et fleurs dans un même calendrier.", "Validez accès, reprise et contact sur place avant le jour J."], "Voir les cadeaux de célébration", "Échanger sur votre événement"],
      ae: ["Fleurs et cadeaux de mariage coordonnés pour les lieux aux Émirats", "À {city}, une salle d'hôtel, une maison privée ou un espace événementiel peuvent avoir des règles d'accès et de chargement propres. Elles sont intégrées à votre direction créative avant l'installation.", ["Partagez le contact du lieu et la fenêtre d'accès avec votre nombre d'invités.", "Distinguez les cadeaux en chambre de l'installation de cérémonie.", "Centralisez fleurs, welcome boxes et finitions dans un seul brief."], "Explorer les cadeaux de célébration", "Planifier un événement aux Émirats"],
      cy: ["Des célébrations coordonnées avec soin à Chypre", "Pour un mariage ou une réception à {city}, nous transformons le parcours invité en plan de service clair : ce qui arrive au lieu, ce qui attend en chambre et les détails qui demandent une remise nominative.", ["Associez fleurs, faveurs et welcome boxes aux moments vécus par les invités.", "Abordez accès au lieu et créneau d'installation avant de finaliser le déroulé.", "Séparez mots personnels et consignes de livraison pour une arrivée soignée."], "Découvrir les cadeaux de célébration", "Parler d'un événement à Chypre"],
    },
  },
};

export function getCommercialServiceCopy(page, lang, country, city) {
  const pageCopy = COPY[page];
  if (!pageCopy) return null;
  const market = String(country || "lb").toLowerCase();
  // Greek intentionally uses English copy, but retains the selected country
  // market; it must never silently fall back to Lebanon for Cyprus.
  const languageCopy = pageCopy[lang] ?? pageCopy.en;
  const selected = languageCopy[market] ?? languageCopy.lb;
  const [heading, bodyTemplate, details, occasionsLabel, contactLabel] = selected;
  return {
    market,
    heading,
    body: bodyTemplate.replaceAll("{city}", city || ""),
    details,
    occasionsLabel,
    contactLabel,
  };
}