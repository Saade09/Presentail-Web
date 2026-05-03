import { Link, useLocation } from "wouter";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDeliveryLocations } from "@/lib/queries";
import { ShoppingBag, User, Search, Menu, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export function Navbar() {
  const { itemCount } = useCart();
  const { user } = useAuth();
  const [location] = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const { data: locations } = useDeliveryLocations();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const defaultLocation =
    locations?.countries.find((c) => c.code === "LB")?.cities[0]?.name || "Beirut";

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "bg-background/90 backdrop-blur-md border-b" : "bg-transparent"
      }`}
    >
      <div className="container mx-auto px-4 h-20 flex items-center justify-between">
        <div className="flex items-center gap-4 md:gap-8">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[300px] sm:w-[400px]">
              <nav className="flex flex-col gap-4 mt-8">
                <Link href="/shop" className="text-lg font-serif">Shop</Link>
                <Link href="/shop?category=hand-bouquets" className="text-lg font-serif">Occasions</Link>
                <Link href="/brands" className="text-lg font-serif">Brands</Link>
                <Link href="/about" className="text-lg font-serif">About</Link>
              </nav>
            </SheetContent>
          </Sheet>

          <Link href="/" className="text-2xl font-serif font-bold text-primary tracking-tight">
            PRESENTAIL
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/shop" className="text-sm font-medium hover:text-primary/80 transition-colors">Shop</Link>
            <Link href="/shop?category=hand-bouquets" className="text-sm font-medium hover:text-primary/80 transition-colors">Occasions</Link>
            <Link href="/brands" className="text-sm font-medium hover:text-primary/80 transition-colors">Brands</Link>
            <Link href="/about" className="text-sm font-medium hover:text-primary/80 transition-colors">About</Link>
          </nav>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="hidden lg:flex items-center gap-1.5 text-sm text-muted-foreground bg-secondary/50 px-3 py-1.5 rounded-full">
            <MapPin className="w-4 h-4" />
            <span>Delivering to <strong className="text-foreground font-medium">{defaultLocation}</strong></span>
          </div>

          <Button variant="ghost" size="icon" className="hidden sm:flex">
            <Search className="w-5 h-5" />
          </Button>

          <Link href={user ? "/account" : "/auth"}>
            <Button variant="ghost" size="icon">
              <User className="w-5 h-5" />
            </Button>
          </Link>

          <Link href="/cart">
            <Button variant="ghost" size="icon" className="relative">
              <ShoppingBag className="w-5 h-5" />
              <AnimatePresence>
                {itemCount > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute 1 top-1.5 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground"
                  >
                    {itemCount}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
