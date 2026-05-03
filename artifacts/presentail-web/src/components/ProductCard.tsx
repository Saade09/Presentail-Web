import { Product } from "@/lib/queries";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/contexts/CartContext";
import { useToast } from "@/hooks/use-toast";
import { useLocale } from "@/contexts/LocaleContext";

export function ProductCard({ product, index = 0 }: { product: Product; index?: number }) {
  const { addItem } = useCart();
  const { toast } = useToast();
  const { t } = useLocale();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    addItem(product);
    toast({
      title: t("product.toast.addedTitle"),
      description: t("product.toast.addedDesc", { name: product.name }),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: index * 0.1 }}
      className="group relative"
      data-testid={`card-product-${product.id}`}
    >
      <Link href={`/product/${product.id}`}>
        <div className="aspect-[4/5] bg-secondary/50 rounded-2xl overflow-hidden relative mb-4">
          {product.image?.uri ? (
            <img
              src={product.image.uri}
              alt={product.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 font-serif text-2xl">
              P
            </div>
          )}
          {product.tag && (
            <div className="absolute top-4 left-4 bg-background/90 backdrop-blur text-xs font-medium px-3 py-1 rounded-full uppercase tracking-wider">
              {product.tag}
            </div>
          )}
          
          <div className="absolute bottom-4 right-4 translate-y-12 opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <Button size="icon" className="rounded-full shadow-xl bg-background text-foreground hover:bg-gold hover:text-white" onClick={handleAddToCart} aria-label={t("product.addToCart")}>
              <ShoppingBag className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="space-y-1">
          <h3 className="font-serif text-lg line-clamp-1">{product.name}</h3>
          <p className="text-muted-foreground text-sm font-medium">{product.price}</p>
        </div>
      </Link>
    </motion.div>
  );
}
