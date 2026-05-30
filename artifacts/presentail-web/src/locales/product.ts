import type { Dict } from "./types";

export const productStrings: Dict = {
  "product.toast.addedTitle": { en: "Added to cart", ar: "تمت الإضافة إلى الحقيبة" },
  "product.toast.addedDesc": { en: "{name} added to your bag.", ar: "تمت إضافة {name} إلى حقيبتك." },
  "product.notFound": { en: "Product Not Found", ar: "المنتج غير موجود" },
  "product.returnShop": { en: "Return to Shop", ar: "العودة إلى المتجر" },
  "product.addToCart": { en: "Add to Cart", ar: "أضف إلى الحقيبة" },
  "product.outOfStock": { en: "Out of Stock", ar: "غير متوفر" },
  "product.share.aria": { en: "Share product", ar: "مشاركة المنتج" },
  "product.share.copied.title": { en: "Link copied", ar: "تم نسخ الرابط" },
  "product.share.copied.desc": { en: "Product link copied to clipboard.", ar: "تم نسخ رابط المنتج إلى الحافظة." },
  "product.share.unavailable.title": { en: "Sharing unavailable", ar: "المشاركة غير متاحة" },
  "product.share.unavailable.desc": { en: "Couldn't share or copy the product link.", ar: "تعذرت مشاركة رابط المنتج أو نسخه." },
};

export const productStringsFr: Record<string, string> = {
  "product.toast.addedTitle": "Ajouté au panier",
  "product.toast.addedDesc": "{name} ajouté à votre panier.",
  "product.notFound": "Produit introuvable",
  "product.returnShop": "Retour à la boutique",
  "product.addToCart": "Ajouter au panier",
  "product.outOfStock": "Rupture de stock",
  "product.share.aria": "Partager le produit",
  "product.share.copied.title": "Lien copié",
  "product.share.copied.desc": "Lien du produit copié dans le presse-papiers.",
  "product.share.unavailable.title": "Partage indisponible",
  "product.share.unavailable.desc": "Impossible de partager ou de copier le lien du produit.",
};
