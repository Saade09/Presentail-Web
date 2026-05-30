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
  "order.backHome": { en: "Back to home", ar: "العودة إلى الرئيسية" },
  "order.fail.cantFind": { en: "We couldn't find your pending order to finalize. If you were charged, contact us with your payment reference.", ar: "لم نتمكن من العثور على طلبك المعلّق لإتمامه. إذا تم خصم المبلغ، يرجى التواصل معنا مع رقم مرجع الدفع." },
  "order.fail.missing": { en: "Pending order missing.", ar: "الطلب المعلّق مفقود." },
  "order.fail.couldntRead": { en: "Could not read pending order.", ar: "تعذّرت قراءة الطلب المعلّق." },
  "order.fail.couldntCreate": { en: "Order could not be created.", ar: "تعذّر إنشاء الطلب." },
  "order.fail.failed": { en: "Order finalization failed.", ar: "فشل إتمام الطلب." },
  "order.trackOrder": { en: "Track order", ar: "تتبّع الطلب" },

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
  "order.backHome": "Retour à l'accueil",
  "order.fail.cantFind": "Nous n'avons pas trouvé votre commande en attente. Si vous avez été débité, contactez-nous avec votre référence de paiement.",
  "order.fail.missing": "Commande en attente introuvable.",
  "order.fail.couldntRead": "Impossible de lire la commande en attente.",
  "order.fail.couldntCreate": "La commande n'a pas pu être créée.",
  "order.fail.failed": "Échec de la finalisation de la commande.",
  "order.trackOrder": "Suivre la commande",

  "payments.waysToPay": "Moyens de paiement",
};
