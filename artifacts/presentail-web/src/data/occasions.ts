export const OCCASION_OPTIONS = [
  { value: "birthday",          label: "Birthday Gifts",    img: "/catalog/occasions/birthday.webp" },
  { value: "love-romance",      label: "Love & Romance",    img: "/catalog/occasions/love-romance.webp" },
  { value: "anniversary",       label: "Anniversary",       emoji: "💍" },
  { value: "wedding",           label: "Wedding",           emoji: "💒" },
  { value: "get-well-soon",     label: "Get Well Soon",     emoji: "🌸" },
  { value: "thank-you",         label: "Thank You",         img: "/catalog/occasions/thank-you.webp" },
  { value: "im-sorry",          label: "I'm Sorry",         emoji: "🕊️" },
  { value: "new-born",          label: "New Born",          emoji: "👶" },
  { value: "congratulations",   label: "Congratulations",   emoji: "🎊" },
  { value: "graduation",        label: "Graduation",        emoji: "🎓" },
  { value: "condolences",       label: "Funeral",           img: "/catalog/occasions/condolences.webp" },
  { value: "summer-collection", label: "Summer Collection", img: "/catalog/categories/lux-arrangements.avif" },
] as const;

export type OccasionOption = (typeof OCCASION_OPTIONS)[number];
