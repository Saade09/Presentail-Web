import { useCategoryProducts } from "@/lib/queries";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import { ArrowRight, Star, ShieldCheck, Truck } from "lucide-react";
import { motion } from "framer-motion";
import heroImg from "@/assets/hero.png";
import categoryBouquets from "@/assets/category-bouquets.png";
import categoryBoxes from "@/assets/category-boxes.png";
import categoryPlants from "@/assets/category-plants.png";
import categoryCakes from "@/assets/category-cakes.png";

export default function Home() {
  const { data: featuredData, isLoading } = useCategoryProducts("hand-bouquets");
  // Just take a few for the featured strip
  const featured = featuredData?.products.slice(0, 4) || [];

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative h-[80vh] min-h-[600px] flex items-center pt-20">
        <div className="absolute inset-0 z-0">
          <img src={heroImg} alt="Luxury Floral Arrangement" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40" />
        </div>
        
        <div className="container relative z-10 mx-auto px-4 text-white text-center md:text-left">
          <motion.div 
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="max-w-2xl"
          >
            <h1 className="text-5xl md:text-7xl font-serif mb-6 leading-tight">
              Artistry in every <br/> arrangement.
            </h1>
            <p className="text-lg md:text-xl text-white/90 mb-10 font-light max-w-lg mx-auto md:mx-0">
              Beirut’s premier destination for luxury floral designs, artisanal chocolates, and unforgettable gifts.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 justify-center md:justify-start">
              <Link href="/shop">
                <Button size="lg" className="bg-gold hover:bg-goldSoft text-primary font-medium w-full sm:w-auto h-14 px-8 text-base">
                  Shop Collection
                </Button>
              </Link>
              <Link href="/shop?occasion=birthday">
                <Button variant="outline" size="lg" className="bg-transparent border-white/30 text-white hover:bg-white/10 w-full sm:w-auto h-14 px-8 text-base">
                  Shop Birthdays
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Trust Strip */}
      <section className="bg-secondary py-12 border-b">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-primary">
                <Truck className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-lg font-medium">Same-Day Delivery</h3>
              <p className="text-sm text-muted-foreground">Across Lebanon for orders placed before 2 PM.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-primary">
                <Star className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-lg font-medium">Premium Quality</h3>
              <p className="text-sm text-muted-foreground">Hand-selected stems and luxury gifting brands.</p>
            </div>
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-12 h-12 bg-background rounded-full flex items-center justify-center text-primary">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="font-serif text-lg font-medium">Secure Payment</h3>
              <p className="text-sm text-muted-foreground">Safe online checkout from anywhere in the world.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-24">
        <div className="container mx-auto px-4">
          <div className="flex items-end justify-between mb-12">
            <div>
              <h2 className="text-3xl md:text-4xl font-serif mb-4">Curated Collections</h2>
              <p className="text-muted-foreground">Explore our signature categories</p>
            </div>
            <Link href="/shop" className="hidden md:flex items-center gap-2 text-sm font-medium hover:text-primary/80 transition-colors">
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
            <Link href="/shop?category=hand-bouquets" className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted block">
              <img src={categoryBouquets} alt="Hand Bouquets" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6">
                <h3 className="text-white font-serif text-2xl">Bouquets</h3>
              </div>
            </Link>
            <Link href="/shop?category=flower-boxes" className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted block">
              <img src={categoryBoxes} alt="Flower Boxes" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6">
                <h3 className="text-white font-serif text-2xl">Boxes</h3>
              </div>
            </Link>
            <Link href="/shop?category=plants" className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted block">
              <img src={categoryPlants} alt="Plants" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6">
                <h3 className="text-white font-serif text-2xl">Plants</h3>
              </div>
            </Link>
            <Link href="/shop?category=cakes" className="group relative aspect-[3/4] rounded-2xl overflow-hidden bg-muted block">
              <img src={categoryCakes} alt="Cakes" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
              <div className="absolute bottom-0 left-0 p-6">
                <h3 className="text-white font-serif text-2xl">Cakes</h3>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-24 bg-background border-t">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-3xl md:text-4xl font-serif mb-4">The Atelier Selection</h2>
            <p className="text-muted-foreground">Our most coveted designs, hand-crafted with intention.</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-12">
            {isLoading ? (
              Array(4).fill(0).map((_, i) => (
                <div key={i} className="animate-pulse">
                  <div className="aspect-[4/5] bg-muted rounded-2xl mb-4" />
                  <div className="h-5 bg-muted rounded w-2/3 mb-2" />
                  <div className="h-4 bg-muted rounded w-1/3" />
                </div>
              ))
            ) : (
              featured.map((product, i) => (
                <ProductCard key={product.id} product={product} index={i} />
              ))
            )}
          </div>
          
          <div className="mt-16 text-center">
            <Link href="/shop">
              <Button variant="outline" size="lg" className="rounded-full px-8">
                Discover More
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
