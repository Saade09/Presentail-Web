/**
 * Shared suggested-messages catalog used by both the Presentail Expo mobile
 * app and the Vite web storefront. Mirrors the "SUGGESTED MESSAGES" popup on
 * presentail.com/lebanon/checkout so shoppers see the same content regardless
 * of platform.
 *
 * Categories are language-neutral ids; per-language UI labels for the tab
 * strip live in each artifact's translations file. Message bodies stay
 * verbatim per language. The source site only ships English + Arabic; the
 * French copy below is brand-approved Presentail copy used by the mobile app
 * (which exposes French as a UI language).
 *
 * Keep this file dependency-free so it works in both the React Native
 * (Hermes) and the Vite (browser) runtimes.
 */

export type SuggestedMessageLang = "en" | "ar" | "fr";

export const SUGGESTED_MESSAGE_LANGS: readonly SuggestedMessageLang[] = [
  "en",
  "ar",
  "fr",
] as const;

export type SuggestedMessageCategoryId =
  | "general"
  | "love"
  | "birthday"
  | "graduation"
  | "getWellSoon"
  | "newBabyBorn"
  | "thankYou"
  | "sympathy";

export const SUGGESTED_MESSAGE_CATEGORIES: readonly SuggestedMessageCategoryId[] = [
  "general",
  "love",
  "birthday",
  "graduation",
  "getWellSoon",
  "newBabyBorn",
  "thankYou",
  "sympathy",
] as const;

type Catalog = Record<
  SuggestedMessageCategoryId,
  Record<SuggestedMessageLang, readonly string[]>
>;

const CATALOG: Catalog = {
  general: {
    en: [
      "A small gesture to remind you how much you mean to me.",
      "Just a little something to brighten your day and remind you how special you are.",
      "No special occasion, just a small reminder that you're always on my mind.",
      "No reason needed, just sending some love your way.",
      "A little surprise, just to brighten your day as you always brighten mine.",
      "A thoughtful gift to make your day a little brighter.",
      "Sending you a small token of love and appreciation.",
      "A simple surprise to remind you how loved you are.",
      "Just because you deserve something beautiful today.",
      "A little gift filled with warmth, love, and happy thoughts.",
    ],
    ar: [
      "لفتة بسيطة لأذكّرك كم تعني لي.",
      "شيء صغير ليُضيء يومك ويذكّرك كم أنت مميّز.",
      "لا مناسبة خاصة، فقط تذكير صغير بأنّك دائماً في بالي.",
      "لا حاجة لسبب، فقط أرسل لك بعض الحب.",
      "مفاجأة صغيرة لتُضيء يومك كما تُضيء أنت أيامي دائماً.",
      "هدية مدروسة لتجعل يومك أجمل قليلاً.",
      "أرسل لك علامة صغيرة على المحبة والتقدير.",
      "مفاجأة بسيطة لتذكّرك كم أنت محبوب.",
      "فقط لأنّك تستحق شيئاً جميلاً اليوم.",
      "هدية صغيرة مليئة بالدفء والحب والأفكار السعيدة.",
    ],
    fr: [
      "Un petit geste pour te rappeler combien tu comptes pour moi.",
      "Une petite attention pour illuminer ta journée et te rappeler combien tu es spécial(e).",
      "Pas d'occasion particulière, juste un petit rappel que tu es toujours dans mes pensées.",
      "Sans raison, juste un peu d'amour qui vient vers toi.",
      "Une petite surprise pour égayer ta journée, comme tu égaies les miennes.",
      "Un cadeau choisi avec soin pour rendre ta journée un peu plus belle.",
      "Un petit signe d'amour et de reconnaissance.",
      "Une simple surprise pour te rappeler combien tu es aimé(e).",
      "Parce que tu mérites quelque chose de beau aujourd'hui.",
      "Un petit cadeau plein de chaleur, d'amour et de pensées joyeuses.",
    ],
  },
  love: {
    en: [
      "Every day with you feels like a gift.",
      "You are my favorite hello and my hardest goodbye.",
      "Just a reminder that I love you, today and always.",
      "My heart is, and always will be, yours.",
      "You are the best part of every day.",
      "Loving you is the easiest thing I'll ever do.",
      "Thank you for being my person.",
      "With you, even the simplest moments feel magical.",
      "I fall for you a little more every single day.",
      "Forever isn't long enough when I'm with you.",
    ],
    ar: [
      "كل يوم معك يبدو وكأنّه هدية.",
      "أنت أجمل تحية وأصعب وداع.",
      "تذكير بسيط أنّي أحبّك، اليوم ودائماً.",
      "قلبي لك، وسيبقى لك إلى الأبد.",
      "أنت أجمل ما في كل يوم.",
      "حبّك هو أسهل شيء سأفعله في حياتي.",
      "شكراً لأنّك إلى جانبي.",
      "معك، حتى أبسط اللحظات تبدو ساحرة.",
      "أقع في حبّك أكثر كل يوم.",
      "حتى الأبد ليس كافياً حين أكون معك.",
    ],
    fr: [
      "Chaque jour à tes côtés est un véritable cadeau.",
      "Tu es mon plus beau bonjour et mon plus difficile au revoir.",
      "Un simple rappel que je t'aime, aujourd'hui et pour toujours.",
      "Mon cœur est à toi, et le sera toujours.",
      "Tu es la plus belle partie de chacune de mes journées.",
      "T'aimer est la chose la plus simple au monde.",
      "Merci d'être la personne qui partage ma vie.",
      "Avec toi, même les instants les plus simples deviennent magiques.",
      "Je tombe un peu plus amoureux(se) de toi chaque jour.",
      "L'éternité ne suffira jamais quand je suis avec toi.",
    ],
  },
  birthday: {
    en: [
      "Wishing you a magical birthday filled with joy and love.",
      "Happy birthday! May this year bring you everything you've dreamed of.",
      "Another year of you — and that's the best gift the world could ask for.",
      "Cheers to another beautiful year of being wonderful you.",
      "Happy birthday to someone who deserves the world.",
      "May your birthday be as special as you are to me.",
      "Wishing you endless happiness on your special day.",
      "Here's to a year full of new adventures and beautiful memories.",
      "Happy birthday — celebrate big, you deserve it!",
      "May every candle on your cake bring a wish that comes true.",
    ],
    ar: [
      "أتمنى لك عيد ميلاد ساحر مليء بالفرح والحب.",
      "عيد ميلاد سعيد! أتمنى أن يحقّق لك هذا العام كل ما حلمت به.",
      "سنة أخرى من وجودك — وهذه أجمل هدية يمكن للعالم أن يقدّمها.",
      "نخب عام جميل آخر من كونك أنت الرائع.",
      "عيد ميلاد سعيد لمن يستحق العالم كلّه.",
      "أتمنى أن يكون عيد ميلادك مميّزاً كما أنت مميّز عندي.",
      "أتمنى لك سعادة لا تنتهي في يومك الخاص.",
      "نخب عام مليء بمغامرات جديدة وذكريات جميلة.",
      "عيد ميلاد سعيد — احتفل كثيراً، فأنت تستحق ذلك!",
      "أتمنى أن تتحقّق أمنية مع كل شمعة على كعكتك.",
    ],
    fr: [
      "Je te souhaite un anniversaire magique, rempli de joie et d'amour.",
      "Joyeux anniversaire ! Que cette année t'apporte tout ce dont tu as rêvé.",
      "Une année de plus à tes côtés — le plus beau cadeau qui soit.",
      "À une nouvelle belle année auprès de la personne merveilleuse que tu es.",
      "Joyeux anniversaire à quelqu'un qui mérite le monde entier.",
      "Que ton anniversaire soit aussi spécial que tu l'es pour moi.",
      "Je te souhaite un bonheur infini en ce jour si particulier.",
      "À une année remplie de nouvelles aventures et de beaux souvenirs.",
      "Joyeux anniversaire — fête-le en grand, tu le mérites !",
      "Que chaque bougie sur ton gâteau exauce un de tes vœux.",
    ],
  },
  graduation: {
    en: [
      "Congratulations, graduate! The world is yours now.",
      "All your hard work has finally paid off — so proud of you!",
      "Today you close one chapter and open an even brighter one.",
      "So proud of everything you've achieved. The best is yet to come.",
      "Cheers to the graduate! Big things are waiting for you.",
      "Your dedication brought you here — and will take you even further.",
      "Wishing you every success on this exciting new journey.",
      "You did it! May this be the first of many achievements.",
      "Congratulations on this incredible milestone.",
      "The future is bright, and so are you. Congratulations!",
    ],
    ar: [
      "مبروك التخرّج! العالم بين يديك الآن.",
      "كل تعبك أتى ثماره أخيراً — فخور/ة بك جداً!",
      "اليوم تطوي فصلاً وتفتح آخر أكثر إشراقاً.",
      "فخور/ة بكل ما حقّقته. والأجمل لم يأتِ بعد.",
      "نخب الخرّيج! تنتظرك أمور عظيمة.",
      "اجتهادك أوصلك إلى هنا — وسيأخذك إلى أبعد من ذلك.",
      "أتمنى لك كل النجاح في هذه الرحلة الجديدة المثيرة.",
      "لقد فعلتها! أتمنى أن يكون هذا أول إنجاز من إنجازات كثيرة.",
      "ألف مبروك على هذا الإنجاز الرائع.",
      "المستقبل مشرق، وأنت كذلك. مبروك!",
    ],
    fr: [
      "Félicitations, jeune diplômé(e) ! Le monde t'appartient.",
      "Tous tes efforts ont enfin porté leurs fruits — tellement fier(e) de toi !",
      "Aujourd'hui tu refermes un chapitre et en ouvres un encore plus lumineux.",
      "Si fier(e) de tout ce que tu as accompli. Le meilleur reste à venir.",
      "Bravo au/à la diplômé(e) ! De grandes choses t'attendent.",
      "Ton engagement t'a mené(e) jusqu'ici — et te portera encore plus loin.",
      "Je te souhaite plein de succès dans cette nouvelle aventure.",
      "Tu l'as fait ! Que ce ne soit que le premier d'une longue série de succès.",
      "Félicitations pour cette belle étape franchie.",
      "L'avenir est radieux, et toi aussi. Félicitations !",
    ],
  },
  getWellSoon: {
    en: [
      "Sending healing thoughts and lots of love your way.",
      "Wishing you a quick and easy recovery.",
      "Take all the time you need to rest — we're thinking of you.",
      "Get well soon! Looking forward to seeing your smile again.",
      "Sending you warm wishes for a speedy recovery.",
      "A little something to brighten your day while you rest.",
      "Hoping you feel a little better with every passing day.",
      "Rest, recover, and know that you are deeply loved.",
      "Sending strength, love, and a big virtual hug.",
      "Wishing you comfort, healing, and brighter days ahead.",
    ],
    ar: [
      "أرسل لك أفكار شفاء وكثيراً من الحب.",
      "أتمنى لك شفاءً عاجلاً وسهلاً.",
      "خذ كل الوقت الذي تحتاجه للراحة — نحن نفكّر بك.",
      "ألف سلامة! نتطلّع إلى رؤية ابتسامتك من جديد.",
      "أرسل لك أحرّ التمنيات بالشفاء العاجل.",
      "شيء صغير ليُضيء يومك خلال فترة راحتك.",
      "أتمنى أن تشعر بتحسّن أكثر مع كل يوم.",
      "ارتح، اشفَ، واعلم أنّك محبوب جداً.",
      "أرسل لك القوّة والحب وعناقاً كبيراً.",
      "أتمنى لك الراحة والشفاء وأياماً أكثر إشراقاً.",
    ],
    fr: [
      "Je t'envoie de bonnes pensées et beaucoup d'amour.",
      "Je te souhaite un rétablissement rapide et tout en douceur.",
      "Prends tout le temps qu'il te faut pour te reposer — on pense à toi.",
      "Prompt rétablissement ! J'ai hâte de revoir ton sourire.",
      "Tous mes vœux sincères de prompt rétablissement.",
      "Une petite attention pour illuminer ton repos.",
      "J'espère que tu te sentiras un peu mieux chaque jour.",
      "Repose-toi, guéris, et sache que tu es profondément aimé(e).",
      "Je t'envoie courage, amour et un grand câlin virtuel.",
      "Je te souhaite réconfort, guérison et des jours meilleurs.",
    ],
  },
  newBabyBorn: {
    en: [
      "Congratulations on your beautiful new arrival!",
      "Welcoming your little one to the world with so much love.",
      "Wishing your growing family endless joy and sweet baby cuddles.",
      "So happy for you — enjoy every tiny, precious moment.",
      "A little miracle has arrived. Congratulations!",
      "Sending love to your beautiful new family of three (or more!).",
      "May your hearts and home be filled with baby giggles.",
      "Congratulations on the newest love of your life.",
      "Welcome to the world, little one. You are so loved already.",
      "Wishing you sleepless nights filled with the sweetest cuddles.",
    ],
    ar: [
      "مبروك على المولود الجديد الجميل!",
      "نرحّب بصغيركم إلى العالم بكثير من الحب.",
      "أتمنى لعائلتكم المتنامية فرحاً لا ينتهي وعناقات صغيرة.",
      "سعيد/ة لكم كثيراً — استمتعوا بكل لحظة صغيرة وثمينة.",
      "وصلت معجزة صغيرة. مبروك!",
      "أرسل الحب إلى عائلتكم الجديدة الجميلة.",
      "أتمنى أن تمتلئ قلوبكم وبيتكم بضحكات الأطفال.",
      "مبروك على الحب الجديد في حياتكم.",
      "أهلاً بك في العالم أيها الصغير. أنت محبوب من الآن.",
      "أتمنى لكم ليالي بلا نوم مليئة بأجمل العناقات.",
    ],
    fr: [
      "Félicitations pour cette belle arrivée !",
      "Bienvenue à votre petit(e) trésor dans ce monde, avec tout notre amour.",
      "Je souhaite à votre famille qui s'agrandit beaucoup de joie et de tendres câlins.",
      "Tellement heureux(se) pour vous — profitez de chaque petit moment précieux.",
      "Un petit miracle est arrivé. Félicitations !",
      "Tout mon amour à votre belle nouvelle famille.",
      "Que vos cœurs et votre maison se remplissent des rires de bébé.",
      "Félicitations pour ce nouvel amour de votre vie.",
      "Bienvenue au monde, petit(e) être. Tu es déjà tellement aimé(e).",
      "Je vous souhaite des nuits sans sommeil remplies des plus doux câlins.",
    ],
  },
  thankYou: {
    en: [
      "Thank you, from the bottom of my heart.",
      "Words can't express how grateful I am for you.",
      "A small thank-you for everything you do.",
      "Your kindness means the world to me.",
      "Thank you for being you — I appreciate you so much.",
      "I'm so thankful to have you in my life.",
      "Just a little something to say thank you.",
      "Your support has meant more than you'll ever know.",
      "Thank you for always being there when it matters most.",
      "With deepest gratitude — thank you for everything.",
    ],
    ar: [
      "شكراً لك من كل قلبي.",
      "الكلمات لا تكفي للتعبير عن امتناني لك.",
      "شكر بسيط على كل ما تفعله.",
      "لطفك يعني لي العالم.",
      "شكراً لأنّك أنت — أقدّرك كثيراً.",
      "ممتن/ة جداً لوجودك في حياتي.",
      "شيء بسيط لأقول شكراً.",
      "دعمك يعني أكثر مما يمكن أن تتخيّل.",
      "شكراً لأنّك دائماً بجانبي حين يهمّ الأمر.",
      "بأعمق الامتنان — شكراً على كل شيء.",
    ],
    fr: [
      "Merci, du fond du cœur.",
      "Les mots ne suffisent pas à exprimer ma gratitude.",
      "Un petit merci pour tout ce que tu fais.",
      "Ta gentillesse compte énormément pour moi.",
      "Merci d'être toi — j'apprécie tellement ta présence.",
      "Je suis tellement reconnaissant(e) de t'avoir dans ma vie.",
      "Une petite attention pour te dire merci.",
      "Ton soutien a compté plus que tu ne l'imagines.",
      "Merci d'être toujours là quand ça compte vraiment.",
      "Avec toute ma gratitude — merci pour tout.",
    ],
  },
  sympathy: {
    en: [
      "With deepest sympathy and heartfelt condolences.",
      "Thinking of you and your family during this difficult time.",
      "Sending you love, strength, and comfort.",
      "There are no words, only love. Holding you close.",
      "May beautiful memories bring you comfort in the days ahead.",
      "With caring thoughts and quiet love.",
      "Wishing you peace, comfort, and the strength to get through.",
      "We are so sorry for your loss. Please know we are here for you.",
      "May you find moments of peace amid the sorrow.",
      "Holding you and your loved ones in our thoughts and prayers.",
    ],
    ar: [
      "بأحرّ التعازي وأصدق المواساة.",
      "نفكّر بك وبعائلتك في هذا الوقت الصعب.",
      "أرسل لك الحب والقوّة والراحة.",
      "لا تكفي الكلمات، فقط الحب. نحن معك.",
      "أتمنى أن تمنحك الذكريات الجميلة العزاء في الأيام المقبلة.",
      "بأفكار حانية وحب هادئ.",
      "أتمنى لك السلام والراحة والقوّة لتجاوز هذا.",
      "نأسف لخسارتك. اعلم أنّنا هنا من أجلك.",
      "أتمنى أن تجد لحظات سلام وسط الحزن.",
      "نحملك وأحبّاءك في أفكارنا وصلواتنا.",
    ],
    fr: [
      "Avec mes plus sincères condoléances.",
      "Je pense à toi et à ta famille en ces moments difficiles.",
      "Je t'envoie amour, force et réconfort.",
      "Les mots manquent, seul l'amour reste. Je suis avec toi.",
      "Que les beaux souvenirs t'apportent du réconfort dans les jours à venir.",
      "Avec des pensées tendres et un amour discret.",
      "Je te souhaite paix, réconfort et la force de traverser cette épreuve.",
      "Nous sommes profondément désolés pour ta perte. Sache que nous sommes là pour toi.",
      "Puisses-tu trouver des moments de paix au milieu du chagrin.",
      "Toi et tes proches êtes dans nos pensées et nos prières.",
    ],
  },
};

export function getSuggestedMessages(
  category: SuggestedMessageCategoryId,
  lang: SuggestedMessageLang,
): readonly string[] {
  return CATALOG[category][lang];
}
