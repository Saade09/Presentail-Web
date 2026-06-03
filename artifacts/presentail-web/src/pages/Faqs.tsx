import { useLocale, type Language } from "@/contexts/LocaleContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type Group = { title: string; items: { q: string; a: string }[] };
type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  groups: Group[];
};

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "FAQs",
    title: "Frequently asked questions.",
    intro:
      "Quick answers to the questions we hear most. If yours isn't here, our concierge team is one tap away on WhatsApp.",
    groups: [
      {
        title: "Orders & delivery",
        items: [
          {
            q: "How fast can you deliver?",
            a: "Standard same-day delivery is available in Beirut, Dubai, Abu Dhabi, Nicosia and Limassol when ordered before our cut-off. Express delivers within roughly 90 minutes during 8 AM – 10 PM in select cities.",
          },
          {
            q: "Do you deliver outside the listed cities?",
            a: "Yes — we deliver across Lebanon, the United Arab Emirates and Cyprus. Some areas use a next-day window. Available areas appear at checkout once you select the destination country.",
          },
          {
            q: "Can I schedule a delivery for a future date?",
            a: "You can choose any date and time slot up to several months in advance. We'll send a reminder the day before the delivery.",
          },
          {
            q: "What happens if the recipient is not home?",
            a: "Our courier will call the recipient before arriving and coordinate a safe drop-off or a second attempt the same day where possible.",
          },
        ],
      },
      {
        title: "Payments & pricing",
        items: [
          {
            q: "Which payment methods do you accept?",
            a: "Credit and debit cards via Stripe, Apple Pay, Whish (Lebanon), Mamo (UAE), PayPal and Western Union.",
          },
          {
            q: "Which currency will I be charged in?",
            a: "Prices are shown in your selected display currency. The actual charge is processed in the local currency of the destination country.",
          },
          {
            q: "Can I get an invoice?",
            a: "Yes — every order receipt includes a downloadable invoice. For corporate orders, we can issue consolidated invoices on request.",
          },
        ],
      },
      {
        title: "Changes, refunds & quality",
        items: [
          {
            q: "Can I change or cancel my order?",
            a: "If your order has not yet been prepared, contact us as soon as possible and we'll do our best to amend or cancel it. Once an order is in production, changes may not be possible.",
          },
          {
            q: "What if something arrives damaged?",
            a: "Send us a photo within 7 days and our team will arrange a replacement, partial refund (Presentail credit) or other compensation under our 100% Customer Satisfaction Guarantee.",
          },
          {
            q: "How long do refunds take?",
            a: "Bank refunds use the original payment method and may take up to 15 business days. Presentail credit is issued immediately and is valid for 12 months.",
          },
        ],
      },
      {
        title: "Account & privacy",
        items: [
          {
            q: "Do I need an account to order?",
            a: "No — you can check out as a guest. Creating an account lets you reorder in one tap, save addresses and recipients, and earn loyalty points.",
          },
          {
            q: "How do I delete my account?",
            a: "On the website, go to My Account \u2192 Personal Information and click \u201cDelete Account\u201d at the bottom of the page. In the mobile app, tap Account \u2192 Delete account. Your data is removed within 15 days.",
          },
        ],
      },
    ],
  },
  ar: {
    eyebrow: "الأسئلة الشائعة",
    title: "الأسئلة الأكثر تكراراً.",
    intro:
      "إجابات سريعة للأسئلة الأكثر شيوعاً. إذا لم يكن سؤالك هنا، فريق الكونسيرج لدينا على بعد ضغطة على واتساب.",
    groups: [
      {
        title: "الطلبات والتوصيل",
        items: [
          {
            q: "كم تستغرق التوصيل؟",
            a: "التوصيل في اليوم نفسه متوفّر في بيروت ودبي وأبو ظبي ونيقوسيا وليماسول قبل الموعد النهائي. خدمة Express توصّل خلال نحو 90 دقيقة بين 8 ص و10 م في مدن مختارة.",
          },
          {
            q: "هل توصّلون خارج المدن المذكورة؟",
            a: "نعم — نوصّل في كل لبنان والإمارات وقبرص. بعض المناطق تستخدم فترة اليوم التالي. تظهر المناطق المتاحة عند الدفع بعد اختيار بلد الوجهة.",
          },
          {
            q: "هل يمكنني جدولة التوصيل لتاريخ مستقبلي؟",
            a: "يمكنك اختيار أي تاريخ وفترة زمنية حتى عدّة أشهر مقدّماً. سنرسل تذكيراً قبل يوم من التوصيل.",
          },
          {
            q: "ماذا يحدث إن لم يكن المستلم في المنزل؟",
            a: "سيتّصل ساعينا بالمستلم قبل الوصول وينسّق التسليم بأمان أو محاولة ثانية في اليوم نفسه عند الإمكان.",
          },
        ],
      },
      {
        title: "الدفع والأسعار",
        items: [
          {
            q: "ما طرق الدفع المقبولة؟",
            a: "بطاقات الائتمان والخصم عبر Stripe، Apple Pay، Whish (لبنان)، Mamo (الإمارات)، PayPal، وWestern Union.",
          },
          {
            q: "بأي عملة سيُحسب الدفع؟",
            a: "تُعرض الأسعار بعملة العرض المختارة. يُنفَّذ الدفع الفعلي بالعملة المحلية لبلد الوجهة.",
          },
          {
            q: "هل يمكنني الحصول على فاتورة؟",
            a: "نعم — كل إيصال طلب يتضمّن فاتورة قابلة للتنزيل. للطلبات الشركات نُصدر فواتير موحّدة عند الطلب.",
          },
        ],
      },
      {
        title: "التعديلات والاسترجاع والجودة",
        items: [
          {
            q: "هل يمكنني تعديل أو إلغاء طلبي؟",
            a: "إذا لم يبدأ تحضير طلبك، تواصل معنا في أقرب وقت وسنبذل قصارى جهدنا للتعديل أو الإلغاء. بعد بدء الإنتاج قد لا يكون التعديل ممكناً.",
          },
          {
            q: "ماذا لو وصل شيء تالف؟",
            a: "أرسل لنا صورة خلال 7 أيام وسيرتّب فريقنا بديلاً أو استرجاعاً جزئياً (رصيد بريزانتيل) أو تعويضاً آخر بموجب ضماننا 100% لرضى العميل.",
          },
          {
            q: "كم تستغرق المبالغ المستردّة؟",
            a: "تُعاد المبالغ بطريقة الدفع الأصلية وقد تستغرق حتى 15 يوم عمل. أمّا رصيد بريزانتيل فيُمنح فوراً وصالح 12 شهراً.",
          },
        ],
      },
      {
        title: "الحساب والخصوصية",
        items: [
          {
            q: "هل أحتاج حساباً للطلب؟",
            a: "لا — يمكنك الدفع كزائر. إنشاء حساب يتيح لك إعادة الطلب بضغطة واحدة وحفظ العناوين والمستلمين وجمع نقاط الولاء.",
          },
          {
            q: "كيف أحذف حسابي؟",
            a: "على الموقع، اذهب إلى حسابي ← المعلومات الشخصية وانقر على «حذف الحساب» في أسفل الصفحة. في التطبيق، اضغط الحساب ← حذف الحساب. تُزال بياناتك خلال 15 يوماً.",
          },
        ],
      },
    ],
  },
  fr: {
    eyebrow: "FAQ",
    title: "Questions fréquentes.",
    intro:
      "Des réponses rapides aux questions qu'on nous pose le plus. Si la vôtre n'est pas ici, notre équipe concierge est joignable sur WhatsApp.",
    groups: [
      {
        title: "Commandes & livraison",
        items: [
          {
            q: "Sous combien de temps livrez-vous ?",
            a: "La livraison standard le jour même est disponible à Beyrouth, Dubaï, Abou Dhabi, Nicosie et Limassol avant l'heure limite. L'Express livre sous environ 90 minutes entre 8h et 22h dans certaines villes.",
          },
          {
            q: "Livrez-vous en dehors des villes listées ?",
            a: "Oui — nous livrons partout au Liban, aux Émirats et à Chypre. Certaines zones sont en J+1. Les zones disponibles s'affichent au paiement après le choix du pays.",
          },
          {
            q: "Puis-je planifier une livraison à une date future ?",
            a: "Vous pouvez choisir n'importe quelle date et créneau, jusqu'à plusieurs mois à l'avance. Un rappel est envoyé la veille de la livraison.",
          },
          {
            q: "Que se passe-t-il si le destinataire est absent ?",
            a: "Notre coursier appelle le destinataire avant d'arriver et coordonne une remise en sécurité ou une seconde tentative le jour même si possible.",
          },
        ],
      },
      {
        title: "Paiements & tarifs",
        items: [
          {
            q: "Quels moyens de paiement acceptez-vous ?",
            a: "Cartes de crédit et de débit via Stripe, Apple Pay, Whish (Liban), Mamo (Émirats), PayPal et Western Union.",
          },
          {
            q: "Dans quelle devise serai-je débité(e) ?",
            a: "Les prix s'affichent dans la devise d'affichage choisie. Le paiement réel est traité dans la devise locale du pays de destination.",
          },
          {
            q: "Puis-je obtenir une facture ?",
            a: "Oui — chaque reçu inclut une facture téléchargeable. Pour les commandes corporate, nous émettons des factures consolidées sur demande.",
          },
        ],
      },
      {
        title: "Modifications, remboursements & qualité",
        items: [
          {
            q: "Puis-je modifier ou annuler ma commande ?",
            a: "Si votre commande n'est pas encore préparée, contactez-nous au plus vite et nous ferons notre maximum. Une fois en production, les modifications peuvent ne plus être possibles.",
          },
          {
            q: "Que faire si un article arrive abîmé ?",
            a: "Envoyez-nous une photo sous 7 jours : remplacement, remboursement partiel (crédit Presentail) ou autre compensation, dans le cadre de notre garantie 100% satisfaction.",
          },
          {
            q: "Combien de temps pour un remboursement ?",
            a: "Les remboursements bancaires utilisent le moyen de paiement initial et peuvent prendre jusqu'à 15 jours ouvrés. Le crédit Presentail est immédiat et valable 12 mois.",
          },
        ],
      },
      {
        title: "Compte & confidentialité",
        items: [
          {
            q: "Faut-il un compte pour commander ?",
            a: "Non — vous pouvez régler en tant qu'invité. Un compte permet la commande en un clic, la sauvegarde des adresses et des points fidélité.",
          },
          {
            q: "Comment supprimer mon compte ?",
            a: "Sur le site, allez dans Mon compte → Informations personnelles et cliquez sur « Supprimer le compte » en bas de la page. Dans l'application, appuyez sur Compte → Supprimer le compte. Vos données sont effacées sous 15 jours.",
          },
        ],
      },
    ],
  },
};

export default function Faqs() {
  const { language } = useLocale();
  const c = COPY[language] ?? COPY.en;

  return (
    <div className="bg-background" data-testid="faqs-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-content">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="faqs-title"
        >
          {c.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{c.intro}</p>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-3xl space-y-10">
        {c.groups.map((g) => (
          <div key={g.title}>
            <h2 className="text-2xl font-serif mb-4">{g.title}</h2>
            <Accordion type="single" collapsible className="w-full">
              {g.items.map((it, i) => (
                <AccordionItem key={i} value={`${g.title}-${i}`}>
                  <AccordionTrigger className="text-start">
                    {it.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground leading-relaxed">
                    {it.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        ))}
      </section>
    </div>
  );
}
