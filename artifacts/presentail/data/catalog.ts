export type Product = {
  id: string;
  name: string;
  price: string;
  image: any;
  tag?: string;
};

export type Collection = {
  id: string;
  title: string;
  subtitle: string;
  count: string;
  image: any;
};

export type Category = {
  id: string;
  name: string;
  icon: string;
};

export type Occasion = {
  id: string;
  name: string;
  icon: string;
};

export const bestSellers: Product[] = [
  {
    id: "rose-whisper",
    name: "Rose Whisper",
    price: "$70",
    image: require("@/assets/images/best-roses.png"),
    tag: "Signature",
  },
  {
    id: "tulip-radiance",
    name: "Tulip Radiance",
    price: "$117",
    image: require("@/assets/images/best-birthday.png"),
    tag: "New",
  },
  {
    id: "orchid-noir",
    name: "Orchid Noir",
    price: "$95",
    image: require("@/assets/images/best-orchid.png"),
  },
  {
    id: "sweet-scarlet",
    name: "Sweet Scarlet Affair",
    price: "$160",
    image: require("@/assets/images/best-mixed.png"),
    tag: "Loved",
  },
];

export const collections: Collection[] = [
  {
    id: "vases",
    title: "Elegant Vases",
    subtitle: "Sculptural arrangements for the modern home",
    count: "24 pieces",
    image: require("@/assets/images/collection-vases.png"),
  },
  {
    id: "bundles",
    title: "Curated Bundles",
    subtitle: "Flowers, cakes & boutique gifts together",
    count: "18 pieces",
    image: require("@/assets/images/hero-gifts.png"),
  },
  {
    id: "tulips",
    title: "Tulip Season",
    subtitle: "A limited spring edition from Holland",
    count: "12 pieces",
    image: require("@/assets/images/hero-flowers.png"),
  },
];

export const categories: Category[] = [
  { id: "flowers", name: "Flowers", icon: "flower-tulip" },
  { id: "plants", name: "Plants", icon: "leaf" },
  { id: "cakes", name: "Cakes", icon: "cake-variant" },
  { id: "chocolates", name: "Chocolates", icon: "candy" },
  { id: "bears", name: "Bears", icon: "teddy-bear" },
  { id: "balloons", name: "Balloons", icon: "balloon" },
  { id: "bundles", name: "Bundles", icon: "gift" },
  { id: "wine", name: "Fine Wine", icon: "glass-wine" },
];

export const occasions: Occasion[] = [
  { id: "love", name: "Love & Romance", icon: "heart" },
  { id: "birthday", name: "Birthday", icon: "cake" },
  { id: "anniversary", name: "Anniversary", icon: "ring" },
  { id: "new-job", name: "New Job", icon: "briefcase" },
  { id: "newborn", name: "Newborn", icon: "baby-carriage" },
  { id: "sympathy", name: "Sympathy", icon: "flower" },
];

export const brands = [
  "Sablé Gourmet",
  "Halab 1881",
  "Samsung",
  "Fujifilm",
  "Bily",
  "Patchi",
  "Godiva",
];

export const reviews = [
  {
    id: "1",
    name: "Sarah K.",
    text: "A truly wonderful experience — the bouquet arrived exactly as pictured.",
    rating: 5,
  },
  {
    id: "2",
    name: "Zahra A.",
    text: "Even in times of war, they proved their excellence and reliability.",
    rating: 5,
  },
  {
    id: "3",
    name: "Roula R.",
    text: "Thank you for great service and hospitality. Truly above and beyond.",
    rating: 5,
  },
  {
    id: "4",
    name: "Sami A.",
    text: "Awesome service. The recipient was delighted from the first glance.",
    rating: 5,
  },
];
