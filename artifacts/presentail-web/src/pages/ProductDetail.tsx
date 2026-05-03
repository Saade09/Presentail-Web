import { useRoute, Link } from "wouter";
import { useProducts, useCategoryProducts } from "@/lib/queries";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { Minus, Plus, ShoppingBag, ArrowLeft, ShieldCheck, Truck } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { useToast } from "@/hooks/use-toast";

export default function ProductDetail() {
  const [, params] = useRoute("/product/:slug");
  const slug = params?.slug;
  const { toast } = useToast();
  
  const { data: allData, isLoading } = useProducts();
  const product = allData?.products?.find(p => p.id === slug);
  
  // Get similar products
  const { data: categoryData } = useCategoryProducts(product?.category || "bundles");
  const similar = categoryData?.products?.filter(p => p.id !== slug).slice(0, 4) || [];

  const [qty, setQty] = useState(1);
  const { addItem } = useCart();

  const handleAdd = () => {
    if (product) {
      addItem(product, qty);
      toast({
        title: "Added to cart",
        description: `${qty}x ${product.name} added to your bag.`,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 pt-32 pb-24">
        <div className="grid md:grid-cols-2 gap-12 lg:gap-24">
          <Skeleton className="aspect-square md:aspect-[4/5] rounded-3xl" />
          <div className="space-y-8 pt-8">
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-8 w-1/4" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="container mx-auto px-4 pt-32 pb-24 text-center">
        <h1 className="font-serif text-3xl mb-4">Product Not Found</h1>
        <Button asChild variant="outline">
          <Link href="/shop">Return to Shop</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-24 pb-24 bg-background">
      <div className="container mx-auto px-4">
        <Link href="/shop" className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="w-4 h-4 mr-2" /> Back to Shop
        </Link>

        <div className="grid md:grid-cols-2 gap-12 lg:gap-24 mb-24">
          {/* Images */}
          <div className="bg-secondary/30 rounded-3xl overflow-hidden aspect-square md:aspect-[4/5] relative">
            {product.image?.uri ? (
              <img src={product.image.uri} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-muted-foreground font-serif text-4xl">
                Presentail
              </div>
            )}
            {product.tag && (
              <div className="absolute top-6 left-6 bg-background/90 backdrop-blur text-sm font-medium px-4 py-1.5 rounded-full uppercase tracking-wider">
                {product.tag}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex flex-col justify-center">
            <h1 className="text-4xl md:text-5xl font-serif leading-tight mb-4">{product.name}</h1>
            <p className="text-2xl font-medium text-primary mb-8">{product.price}</p>
            
            {product.description && (
              <div className="prose prose-sm md:prose-base text-muted-foreground mb-10">
                <p>{product.description}</p>
              </div>
            )}

            <div className="space-y-6 mb-10 border-t border-b py-8">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium w-24">Quantity</span>
                <div className="flex items-center border rounded-full overflow-hidden bg-background">
                  <button onClick={() => setQty(Math.max(1, qty - 1))} className="px-4 py-2 hover:bg-secondary transition-colors" disabled={qty <= 1}>
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="w-12 text-center font-medium">{qty}</span>
                  <button onClick={() => setQty(qty + 1)} className="px-4 py-2 hover:bg-secondary transition-colors">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            <Button 
              size="lg" 
              className="w-full h-14 text-base rounded-xl mb-8" 
              onClick={handleAdd}
              disabled={!product.inStock}
            >
              <ShoppingBag className="w-5 h-5 mr-2" />
              {product.inStock ? "Add to Cart" : "Out of Stock"}
            </Button>

            <div className="grid grid-cols-2 gap-4 mt-auto">
              <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-xl">
                <Truck className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">Same-day delivery in Lebanon</span>
              </div>
              <div className="flex items-center gap-3 p-4 bg-secondary/50 rounded-xl">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <span className="text-sm font-medium">100% Secure Checkout</span>
              </div>
            </div>
          </div>
        </div>

        {/* Similar Products */}
        {similar.length > 0 && (
          <div className="pt-16 border-t">
            <h2 className="text-3xl font-serif mb-10">You May Also Like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {similar.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
