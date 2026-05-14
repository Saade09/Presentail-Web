import { useLocale, type Language } from "@/contexts/LocaleContext";

type Row = { area: string; standard: string; express: string };
type CountryBlock = {
  country: string;
  currency: string;
  rows: Row[];
  notes: string[];
};

type Copy = {
  eyebrow: string;
  title: string;
  intro: string;
  countries: CountryBlock[];
  columns: { area: string; standard: string; express: string };
  windowsHeading: string;
  windows: { title: string; body: string }[];
  expressHeading: string;
  expressBody: string;
};

const COPY: Record<Language, Copy> = {
  en: {
    eyebrow: "Delivery Rates",
    title: "Transparent delivery fees, every order.",
    intro:
      "We deliver across Lebanon, the United Arab Emirates and Cyprus seven days a week. Standard delivery is included in your selected slot; Express prioritises your order for delivery within ~90 minutes.",
    columns: { area: "Area", standard: "Standard", express: "Express" },
    countries: [
      {
        country: "Lebanon",
        currency: "USD",
        rows: [
          { area: "Beirut", standard: "$5", express: "$15" },
          { area: "Mount Lebanon", standard: "$7", express: "$15" },
          { area: "North Lebanon (Tripoli, Byblos)", standard: "$10", express: "—" },
          { area: "South Lebanon (Saida, Tyre)", standard: "$10", express: "—" },
          { area: "Bekaa (Zahle, Baalbek)", standard: "$12", express: "—" },
        ],
        notes: [
          "Free delivery on orders above the free-shipping threshold shown at checkout.",
          "Same-day delivery available until 10:00 PM in Beirut.",
        ],
      },
      {
        country: "United Arab Emirates",
        currency: "AED",
        rows: [
          { area: "Dubai", standard: "AED 30", express: "AED 55" },
          { area: "Abu Dhabi", standard: "AED 40", express: "AED 75" },
          { area: "Sharjah / Ajman", standard: "AED 40", express: "—" },
          { area: "Other Emirates", standard: "AED 60", express: "—" },
        ],
        notes: [
          "Same-day delivery available for orders placed before 4:00 PM.",
          "Express slots subject to florist availability.",
        ],
      },
      {
        country: "Cyprus",
        currency: "EUR",
        rows: [
          { area: "Nicosia / Limassol", standard: "€8", express: "€20" },
          { area: "Larnaca / Paphos", standard: "€10", express: "—" },
        ],
        notes: ["Same-day delivery available for orders placed before 3:00 PM."],
      },
    ],
    windowsHeading: "Delivery windows",
    windows: [
      {
        title: "Morning",
        body: "9:00 AM – 12:00 PM. Best for surprise breakfast deliveries and office sends.",
      },
      {
        title: "Afternoon",
        body: "12:00 PM – 5:00 PM. Our most popular slot for celebrations and gifts at home.",
      },
      {
        title: "Evening",
        body: "5:00 PM – 10:00 PM (Lebanon) / 5:00 PM – 9:00 PM (UAE & Cyprus).",
      },
    ],
    expressHeading: "Express delivery",
    expressBody:
      "Express prioritises your order ahead of others in the queue and delivers within roughly 90 minutes of preparation. Available in select cities between 8:00 AM and 10:00 PM, subject to florist capacity.",
  },
  ar: {
    eyebrow: "أسعار التوصيل",
    title: "رسوم توصيل واضحة لكل طلب.",
    intro:
      "نوصّل في لبنان والإمارات العربية المتحدة وقبرص سبعة أيام في الأسبوع. التوصيل العادي مشمول في الفترة التي تختارها؛ خدمة Express تمنح طلبك الأولوية للتوصيل خلال نحو 90 دقيقة.",
    columns: { area: "المنطقة", standard: "عادي", express: "Express" },
    countries: [
      {
        country: "لبنان",
        currency: "USD",
        rows: [
          { area: "بيروت", standard: "$5", express: "$15" },
          { area: "جبل لبنان", standard: "$7", express: "$15" },
          { area: "شمال لبنان (طرابلس، جبيل)", standard: "$10", express: "—" },
          { area: "جنوب لبنان (صيدا، صور)", standard: "$10", express: "—" },
          { area: "البقاع (زحلة، بعلبك)", standard: "$12", express: "—" },
        ],
        notes: [
          "توصيل مجاني للطلبات فوق حدّ الشحن المجاني الظاهر في الدفع.",
          "توصيل في اليوم نفسه حتى الساعة 10 مساءً في بيروت.",
        ],
      },
      {
        country: "الإمارات العربية المتحدة",
        currency: "AED",
        rows: [
          { area: "دبي", standard: "AED 30", express: "AED 55" },
          { area: "أبو ظبي", standard: "AED 40", express: "AED 75" },
          { area: "الشارقة / عجمان", standard: "AED 40", express: "—" },
          { area: "بقية الإمارات", standard: "AED 60", express: "—" },
        ],
        notes: [
          "توصيل في اليوم نفسه للطلبات قبل الساعة 4 عصراً.",
          "فترات Express خاضعة لتوفّر منسّقي الأزهار.",
        ],
      },
      {
        country: "قبرص",
        currency: "EUR",
        rows: [
          { area: "نيقوسيا / ليماسول", standard: "€8", express: "€20" },
          { area: "لارنكا / بافوس", standard: "€10", express: "—" },
        ],
        notes: ["توصيل في اليوم نفسه للطلبات قبل الساعة 3 عصراً."],
      },
    ],
    windowsHeading: "فترات التوصيل",
    windows: [
      {
        title: "صباحاً",
        body: "9:00 ص – 12:00 ظ. مناسبة لمفاجآت الصباح وتوصيل المكاتب.",
      },
      {
        title: "بعد الظهر",
        body: "12:00 ظ – 5:00 م. الفترة الأكثر طلباً للاحتفالات والهدايا المنزلية.",
      },
      {
        title: "مساءً",
        body: "5:00 م – 10:00 م (لبنان) / 5:00 م – 9:00 م (الإمارات وقبرص).",
      },
    ],
    expressHeading: "خدمة Express",
    expressBody:
      "تمنح Express طلبك الأولوية على غيره وتوصّله خلال نحو 90 دقيقة بعد التحضير. متوفّرة في مدن مختارة بين 8 صباحاً و10 مساءً، حسب طاقة منسّقي الأزهار.",
  },
  fr: {
    eyebrow: "Tarifs de livraison",
    title: "Des frais de livraison clairs, à chaque commande.",
    intro:
      "Nous livrons au Liban, aux Émirats arabes unis et à Chypre, sept jours sur sept. La livraison standard est incluse dans le créneau choisi ; l'Express donne la priorité à votre commande pour une livraison sous 90 minutes environ.",
    columns: { area: "Zone", standard: "Standard", express: "Express" },
    countries: [
      {
        country: "Liban",
        currency: "USD",
        rows: [
          { area: "Beyrouth", standard: "5 $", express: "15 $" },
          { area: "Mont Liban", standard: "7 $", express: "15 $" },
          { area: "Nord Liban (Tripoli, Byblos)", standard: "10 $", express: "—" },
          { area: "Sud Liban (Saïda, Tyr)", standard: "10 $", express: "—" },
          { area: "Bekaa (Zahlé, Baalbek)", standard: "12 $", express: "—" },
        ],
        notes: [
          "Livraison gratuite à partir du seuil affiché au paiement.",
          "Livraison le jour même jusqu'à 22h00 à Beyrouth.",
        ],
      },
      {
        country: "Émirats arabes unis",
        currency: "AED",
        rows: [
          { area: "Dubaï", standard: "30 AED", express: "55 AED" },
          { area: "Abou Dhabi", standard: "40 AED", express: "75 AED" },
          { area: "Charjah / Ajman", standard: "40 AED", express: "—" },
          { area: "Autres Émirats", standard: "60 AED", express: "—" },
        ],
        notes: [
          "Livraison le jour même pour les commandes passées avant 16h00.",
          "Créneaux Express selon la disponibilité du fleuriste.",
        ],
      },
      {
        country: "Chypre",
        currency: "EUR",
        rows: [
          { area: "Nicosie / Limassol", standard: "8 €", express: "20 €" },
          { area: "Larnaca / Paphos", standard: "10 €", express: "—" },
        ],
        notes: [
          "Livraison le jour même pour les commandes passées avant 15h00.",
        ],
      },
    ],
    windowsHeading: "Créneaux de livraison",
    windows: [
      {
        title: "Matin",
        body: "9h00 – 12h00. Idéal pour les surprises matinales et les livraisons au bureau.",
      },
      {
        title: "Après-midi",
        body: "12h00 – 17h00. Notre créneau le plus populaire pour les célébrations.",
      },
      {
        title: "Soir",
        body: "17h00 – 22h00 (Liban) / 17h00 – 21h00 (Émirats et Chypre).",
      },
    ],
    expressHeading: "Livraison Express",
    expressBody:
      "Express donne la priorité à votre commande et la livre sous environ 90 minutes après préparation. Disponible dans certaines villes entre 8h00 et 22h00, selon la capacité du fleuriste.",
  },
};

export default function DeliveryRates() {
  const { language } = useLocale();
  const c = COPY[language] ?? COPY.en;

  return (
    <div className="bg-background" data-testid="delivery-rates-page" lang={language}>
      <section className="container mx-auto px-4 pt-16 pb-12 md:pt-24 md:pb-16 max-w-4xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {c.eyebrow}
        </p>
        <h1
          className="text-4xl md:text-5xl font-serif leading-tight mb-6"
          data-testid="delivery-rates-title"
        >
          {c.title}
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed">{c.intro}</p>
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-5xl space-y-10">
        {c.countries.map((cb) => (
          <div key={cb.country}>
            <h2 className="text-2xl md:text-3xl font-serif mb-4">
              {cb.country}{" "}
              <span className="text-base text-muted-foreground font-sans">
                ({cb.currency})
              </span>
            </h2>
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">{c.columns.area}</th>
                    <th className="px-4 py-3 font-medium">{c.columns.standard}</th>
                    <th className="px-4 py-3 font-medium">{c.columns.express}</th>
                  </tr>
                </thead>
                <tbody>
                  {cb.rows.map((r) => (
                    <tr key={r.area} className="border-t border-border">
                      <td className="px-4 py-3">{r.area}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.standard}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.express}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cb.notes.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
                {cb.notes.map((n, i) => (
                  <li key={i}>— {n}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <section className="container mx-auto px-4 pb-12 md:pb-16 max-w-5xl">
        <h2 className="text-2xl md:text-3xl font-serif mb-8">
          {c.windowsHeading}
        </h2>
        <div className="grid gap-6 md:grid-cols-3">
          {c.windows.map((w) => (
            <div
              key={w.title}
              className="rounded-lg border border-border p-6 bg-card"
            >
              <h3 className="font-serif text-lg mb-3">{w.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {w.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-4xl">
        <div className="rounded-lg bg-primary text-primary-foreground p-8 md:p-12">
          <h2 className="text-2xl md:text-3xl font-serif mb-3">
            {c.expressHeading}
          </h2>
          <p className="opacity-90 leading-relaxed">{c.expressBody}</p>
        </div>
      </section>
    </div>
  );
}
