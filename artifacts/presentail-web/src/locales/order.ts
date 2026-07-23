import type { Dict } from "./types";

export const orderStrings: Dict = {
  "order.finalizing": { en: "Finalizing your order…", ar: "جارٍ إتمام طلبك…" },
  "order.dontClose": { en: "Please don't close this window.", ar: "يرجى عدم إغلاق هذه النافذة." },
  "order.confirmed": { en: "Order Confirmed!", ar: "تم تأكيد الطلب!" },
  "order.failed": { en: "Order Failed", ar: "فشل الطلب" },
  "order.thanks": { en: "Thank you for choosing Presentail. Your beautiful arrangement is being prepared with care.", ar: "شكراً لاختيارك Presentail. يتم تحضير باقتك الجميلة بعناية." },
  "order.failGeneric": { en: "Something went wrong while processing your payment. Please try again.", ar: "حدث خطأ أثناء معالجة دفعتك. يرجى المحاولة مرة أخرى." },
  "order.reference": { en: "Order Reference", ar: "رقم الطلب" },
  "order.continueShopping": { en: "Continue Shopping", ar: "متابعة التسوّق" },
  "order.returnCheckout": { en: "Return to Checkout", ar: "العودة إلى الدفع" },
  "order.retry": { en: "Retry order", ar: "إعادة محاولة الطلب" },
  "order.backHome": { en: "Back to home", ar: "العودة إلى الرئيسية" },
  "order.processing.title": { en: "Processing your payment…", ar: "جارٍ معالجة الدفع…" },
  "order.processing.desc": { en: "Klarna is reviewing your application. This usually takes just a moment — please don't close this page.", ar: "Klarna يراجع طلبك. هذا عادةً يستغرق لحظة — يرجى عدم إغلاق هذه الصفحة." },
  "order.fail.cantFind": { en: "We couldn't find your pending order to finalize. If you were charged, contact us with your payment reference.", ar: "لم نتمكن من العثور على طلبك المعلّق لإتمامه. إذا تم خصم المبلغ، يرجى التواصل معنا مع رقم مرجع الدفع." },
  "order.fail.missing": { en: "Pending order missing.", ar: "الطلب المعلّق مفقود." },
  "order.fail.couldntCreate": { en: "Order could not be created.", ar: "تعذّر إنشاء الطلب." },
  "order.fail.failed": { en: "Order finalization failed.", ar: "فشل إتمام الطلب." },
  "order.fail.exhausted": { en: "We've tried several times but couldn't finalize your order. Please contact us with your payment reference below so we can help.", ar: "حاولنا عدة مرات لكن لم نتمكن من إتمام طلبك. يرجى التواصل معنا مع رقم مرجع الدفع أدناه لمساعدتك." },

  "order.summary.items": { en: "Items Ordered", ar: "المنتجات المطلوبة" },
  "order.summary.personalisation": { en: "Personalisation", ar: "التخصيص" },
  "order.summary.cardMessage": { en: "Card Message", ar: "رسالة البطاقة" },
  "order.summary.cardTo": { en: "To", ar: "إلى" },
  "order.summary.cardFrom": { en: "From", ar: "من" },
  "order.summary.delivery": { en: "Delivery", ar: "التوصيل" },
  "order.summary.subtotal": { en: "Subtotal", ar: "المجموع الفرعي" },
  "order.summary.deliveryFee": { en: "Delivery Fee", ar: "رسوم التوصيل" },
  "order.summary.total": { en: "Total", ar: "الإجمالي" },
  "order.summary.paymentMethod": { en: "Payment Method", ar: "طريقة الدفع" },
  // eslint-disable-next-line presentail/no-orphan-translation-key
  "order.summary.pay.card": { en: "Card", ar: "بطاقة" },
  // eslint-disable-next-line presentail/no-orphan-translation-key
  "order.summary.pay.paypal": { en: "PayPal", ar: "PayPal" },
  // eslint-disable-next-line presentail/no-orphan-translation-key
  "order.summary.pay.whish": { en: "Whish", ar: "ويش" },
  // eslint-disable-next-line presentail/no-orphan-translation-key
  "order.summary.pay.mamo": { en: "Mamo", ar: "مامو" },
  // eslint-disable-next-line presentail/no-orphan-translation-key
  "order.summary.pay.wallet": { en: "Apple / Google Pay", ar: "Apple / Google Pay" },
  // eslint-disable-next-line presentail/no-orphan-translation-key
  "order.summary.pay.apple_pay": { en: "Apple Pay", ar: "Apple Pay" },
  // eslint-disable-next-line presentail/no-orphan-translation-key
  "order.summary.pay.google_pay": { en: "Google Pay", ar: "Google Pay" },
  // eslint-disable-next-line presentail/no-orphan-translation-key
  "order.summary.pay.western": { en: "Western Union", ar: "ويسترن يونيون" },
  // eslint-disable-next-line presentail/no-orphan-translation-key
  "order.summary.pay.klarna": { en: "Klarna", ar: "Klarna" },

  "order.section.gifts": { en: "Your Gifts", ar: "هداياك" },
  "order.section.recipient": { en: "Recipient", ar: "المستلم" },
  "order.section.recipientDetails": { en: "Recipient Details", ar: "تفاصيل المستلم" },
  "order.section.deliveryAddress": { en: "Delivery Address", ar: "عنوان التوصيل" },
  "order.section.summary": { en: "Order Summary", ar: "ملخص الطلب" },
  "order.summary.discount": { en: "Discount", ar: "خصم" },
  "order.action.viewOrders": { en: "View my orders", ar: "استعراض طلباتي" },
  "order.action.contact": { en: "Need help? Contact us", ar: "هل تحتاج مساعدة؟ تواصل معنا" },

  "payments.waysToPay": { en: "Ways to Pay", ar: "طرق الدفع" },
};

export const orderStringsFr: Record<string, string> = {
  "order.finalizing": "Finalisation de votre commande…",
  "order.dontClose": "Veuillez ne pas fermer cette fenêtre.",
  "order.confirmed": "Commande confirmée !",
  "order.failed": "Échec de la commande",
  "order.thanks": "Merci d'avoir choisi Presentail. Votre composition est préparée avec soin.",
  "order.failGeneric": "Une erreur est survenue lors du traitement de votre paiement. Veuillez réessayer.",
  "order.reference": "Référence de la commande",
  "order.continueShopping": "Continuer mes achats",
  "order.returnCheckout": "Retour au paiement",
  "order.retry": "Réessayer la commande",
  "order.backHome": "Retour à l'accueil",
  "order.processing.title": "Traitement de votre paiement…",
  "order.processing.desc": "Klarna examine votre demande. Cela ne prend généralement qu'un moment — veuillez ne pas fermer cette page.",
  "order.fail.cantFind": "Nous n'avons pas trouvé votre commande en attente. Si vous avez été débité, contactez-nous avec votre référence de paiement.",
  "order.fail.missing": "Commande en attente introuvable.",
  "order.fail.couldntCreate": "La commande n'a pas pu être créée.",
  "order.fail.failed": "Échec de la finalisation de la commande.",
  "order.fail.exhausted": "Nous avons essayé plusieurs fois sans parvenir à finaliser votre commande. Veuillez nous contacter avec votre référence de paiement ci-dessous afin que nous puissions vous aider.",

  "order.summary.items": "Articles commandés",
  "order.summary.personalisation": "Personnalisation",
  "order.summary.cardMessage": "Message de la carte",
  "order.summary.cardTo": "À",
  "order.summary.cardFrom": "De",
  "order.summary.delivery": "Livraison",
  "order.summary.subtotal": "Sous-total",
  "order.summary.deliveryFee": "Frais de livraison",
  "order.summary.total": "Total",
  "order.summary.paymentMethod": "Mode de paiement",
  "order.summary.pay.card": "Carte",
  "order.summary.pay.paypal": "PayPal",
  "order.summary.pay.whish": "Whish",
  "order.summary.pay.mamo": "Mamo",
  "order.summary.pay.wallet": "Apple / Google Pay",
  "order.summary.pay.apple_pay": "Apple Pay",
  "order.summary.pay.google_pay": "Google Pay",
  "order.summary.pay.western": "Western Union",
  "order.summary.pay.klarna": "Klarna",

  "order.section.gifts": "Vos cadeaux",
  "order.section.recipient": "Destinataire",
  "order.section.recipientDetails": "Détails du destinataire",
  "order.section.deliveryAddress": "Adresse de livraison",
  "order.section.summary": "Récapitulatif",
  "order.summary.discount": "Remise",
  "order.action.viewOrders": "Voir mes commandes",
  "order.action.contact": "Besoin d'aide ? Contactez-nous",

  "payments.waysToPay": "Moyens de paiement",
};
