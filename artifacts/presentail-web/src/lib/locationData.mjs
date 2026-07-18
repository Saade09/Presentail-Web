// Per-country business metadata for the Presentail LocalBusiness schema and
// NAP (Name, Address, Phone) consistency checks.
//
// This is the single source of truth for contact data used in JSON-LD and the
// NAP consistency CI guard. Update here whenever Presentail's business details
// change — the check-nap-consistency script will catch any drift against
// Contact.tsx automatically.
//
// Phone and email must match the constants in src/pages/Contact.tsx.
// Opening hours use schema.org openingHours format: "Mo-Su HH:MM-HH:MM".

/**
 * @typedef {{
 *   phone: string;
 *   email: string;
 *   openingHours: string[];
 *   priceRange: string;
 *   deliveryRadius: string;
 *   mapUrl: string;
 *   serviceAreas: string[];
 *   currenciesAccepted: string;
 *   paymentAccepted: string;
 * }} CountryLocationData
 */

/** @type {Record<string, CountryLocationData>} */
export const LOCATION_DATA = {
  lb: {
    phone: "+9613136532",
    email: "hello@presentail.com",
    openingHours: ["Mo-Su 08:00-24:00"],
    priceRange: "$$$",
    deliveryRadius: "All of Lebanon",
    mapUrl:
      "https://www.google.com/maps/search/?api=1&query=Karam+w+Mwannes+Abdel+Wahab+El+Inglizi+Achrafieh+Beirut+Lebanon",
    serviceAreas: [
      "Akkar",
      "Aley",
      "Baabda",
      "Baalbeck",
      "Batroun",
      "Bcharré",
      "Beirut",
      "Bint Jbeil",
      "Chouf",
      "Hasbaya",
      "Hermel",
      "Jbeil",
      "Jezzine",
      "Kesserwan",
      "Koura",
      "Marjayoun",
      "Metn",
      "Minnieh-Denniyeh",
      "Nabatieh",
      "Rachaiya",
      "Sidon",
      "Tripoli",
      "Tyre",
      "West Bekaa",
      "Zahle",
      "Zghorta",
    ],
    currenciesAccepted: "USD, LBP",
    paymentAccepted: "Credit Card, Apple Pay, Google Pay, Cash on Delivery",
  },
  ae: {
    phone: "+9613136532",
    email: "hello@presentail.com",
    openingHours: ["Mo-Su 08:00-24:00"],
    priceRange: "$$$",
    deliveryRadius: "All of UAE",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Presentail+Dubai+UAE",
    serviceAreas: [
      "Abu Dhabi",
      "Ajman",
      "Dubai",
      "Fujairah",
      "Ras Al Khaimah",
      "Sharjah",
      "Umm Al Quwain",
    ],
    currenciesAccepted: "AED",
    paymentAccepted: "Credit Card, Apple Pay, Google Pay",
  },
  cy: {
    phone: "+9613136532",
    email: "hello@presentail.com",
    openingHours: ["Mo-Su 08:00-24:00"],
    priceRange: "$$$",
    deliveryRadius: "All of Cyprus",
    mapUrl: "https://www.google.com/maps/search/?api=1&query=Presentail+Limassol+Cyprus",
    serviceAreas: ["Larnaca", "Limassol", "Nicosia", "Paphos"],
    currenciesAccepted: "EUR",
    paymentAccepted: "Credit Card, Apple Pay, Google Pay",
  },
};
