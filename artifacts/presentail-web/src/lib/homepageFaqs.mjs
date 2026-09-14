/**
 * Homepage FAQ copy shared by the browser and the Node SEO injector.
 *
 * Keep this list at exactly six items. The homepage renders these items as
 * collapsed rows and the server uses the same output for FAQPage JSON-LD.
 */
const COPY = {
  en: [
    {
      q: "Do you offer same-day flower delivery in {city}?",
      a: "Yes — eligible flowers and gifts can be delivered the same day in {city}. The delivery dates and windows available for your address are shown at checkout.",
    },
    {
      q: "Which areas of {city} does Presentail deliver to?",
      a: "Presentail delivers flowers and gifts across {city} and the delivery areas shown when you enter the recipient's address at checkout.",
    },
    {
      q: "Can I schedule a delivery in {city} for a future date?",
      a: "Yes. Choose a future delivery date and an available time window at checkout so your gift arrives when you need it.",
    },
    {
      q: "Can I add a personalised card message to my order?",
      a: "Yes. Add a personalised card message at checkout and we will include it with your flowers or gift.",
    },
    {
      q: "What can I order for delivery in {city}?",
      a: "You can order fresh flowers, flower boxes, cakes, chocolates, plants, balloons, gift baskets and curated gifts, subject to local availability.",
    },
    {
      q: "How do I track my Presentail order?",
      a: "After your order is confirmed, we send tracking updates by SMS and email. You can also check the delivery status from your account.",
    },
  ],
  ar: [
    {
      q: "هل تقدمون توصيل الزهور في اليوم نفسه في {city}؟",
      a: "نعم — يمكن توصيل الزهور والهدايا المؤهلة في اليوم نفسه في {city}. تظهر تواريخ ونوافذ التوصيل المتاحة لعنوانك عند الدفع.",
    },
    {
      q: "إلى أي مناطق في {city} توصل Presentail؟",
      a: "توصّل Presentail الزهور والهدايا في أنحاء {city} وفي مناطق التوصيل التي تظهر عند إدخال عنوان المستلم عند الدفع.",
    },
    {
      q: "هل يمكنني جدولة التوصيل في {city} لتاريخ مستقبلي؟",
      a: "نعم. اختر تاريخ توصيل مستقبلياً ونافذة زمنية متاحة عند الدفع لتصل هديتك في الموعد الذي تريده.",
    },
    {
      q: "هل يمكنني إضافة رسالة شخصية إلى طلبي؟",
      a: "نعم. أضف رسالة شخصية إلى البطاقة عند الدفع وسنرفقها مع الزهور أو الهدية.",
    },
    {
      q: "ماذا يمكنني طلبه للتوصيل في {city}؟",
      a: "يمكنك طلب الزهور الطازجة وصناديق الزهور والكعك والشوكولاتة والنباتات والبالونات وسلال الهدايا والهدايا المختارة، وفقاً للتوفر المحلي.",
    },
    {
      q: "كيف أتابع طلب Presentail الخاص بي؟",
      a: "بعد تأكيد طلبك، نرسل تحديثات التتبع عبر الرسائل القصيرة والبريد الإلكتروني. يمكنك أيضاً التحقق من حالة التوصيل من حسابك.",
    },
  ],
  fr: [
    {
      q: "Proposez-vous la livraison de fleurs le jour même à {city} ?",
      a: "Oui — les fleurs et cadeaux éligibles peuvent être livrés le jour même à {city}. Les dates et créneaux disponibles pour votre adresse s'affichent au paiement.",
    },
    {
      q: "Dans quels quartiers de {city} Presentail livre-t-il ?",
      a: "Presentail livre des fleurs et des cadeaux à {city}, dans les zones de livraison affichées lorsque vous saisissez l'adresse du destinataire au paiement.",
    },
    {
      q: "Puis-je programmer une livraison à {city} pour une date ultérieure ?",
      a: "Oui. Choisissez une date future et un créneau disponible au paiement pour que votre cadeau arrive au moment souhaité.",
    },
    {
      q: "Puis-je ajouter un message personnalisé à ma commande ?",
      a: "Oui. Ajoutez un message personnalisé à la carte au paiement et nous l'inclurons avec vos fleurs ou votre cadeau.",
    },
    {
      q: "Que puis-je commander à livrer à {city} ?",
      a: "Vous pouvez commander des fleurs fraîches, des boîtes de fleurs, des gâteaux, des chocolats, des plantes, des ballons, des paniers et des cadeaux sélectionnés, selon les disponibilités locales.",
    },
    {
      q: "Comment suivre ma commande Presentail ?",
      a: "Après confirmation de votre commande, nous envoyons les mises à jour de suivi par SMS et e-mail. Vous pouvez aussi consulter le statut depuis votre compte.",
    },
  ],
};

function format(value, city) {
  return value.replaceAll("{city}", city || "");
}

export function buildHomepageFaqs(city, lang = "en") {
  const items = COPY[lang] ?? COPY.en;
  return items.map(({ q, a }) => ({
    question: format(q, city),
    answer: format(a, city),
  }));
}

export const HOMEPAGE_FAQ_COUNT = 6;