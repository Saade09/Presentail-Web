import { Link } from "wouter";

export function Footer() {
  return (
    <footer className="bg-primary text-primary-foreground pt-20 pb-10">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="md:col-span-1">
            <h3 className="text-2xl font-serif font-bold mb-6">PRESENTAIL</h3>
            <p className="text-primary-foreground/70 text-sm leading-relaxed mb-6">
              Beirut's premium florist and gifting house. Confident, generous, unhurried.
            </p>
            <div className="text-sm text-primary-foreground/70">
              <p>Rue Gouraud, Gemmayzeh</p>
              <p>Beirut, Lebanon</p>
            </div>
          </div>
          
          <div>
            <h4 className="font-serif text-lg mb-6">Shop</h4>
            <ul className="space-y-4 text-sm text-primary-foreground/80">
              <li><Link href="/shop?category=hand-bouquets" className="hover:text-gold transition-colors">Hand Bouquets</Link></li>
              <li><Link href="/shop?category=flower-boxes" className="hover:text-gold transition-colors">Flower Boxes</Link></li>
              <li><Link href="/shop?category=plants" className="hover:text-gold transition-colors">Plants</Link></li>
              <li><Link href="/shop?category=cakes" className="hover:text-gold transition-colors">Cakes</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif text-lg mb-6">Occasions</h4>
            <ul className="space-y-4 text-sm text-primary-foreground/80">
              <li><Link href="/shop?occasion=birthday" className="hover:text-gold transition-colors">Birthday</Link></li>
              <li><Link href="/shop?occasion=love-romance" className="hover:text-gold transition-colors">Romance</Link></li>
              <li><Link href="/shop?occasion=congratulations" className="hover:text-gold transition-colors">Congratulations</Link></li>
              <li><Link href="/shop?occasion=condolences" className="hover:text-gold transition-colors">Condolences</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-serif text-lg mb-6">Help</h4>
            <ul className="space-y-4 text-sm text-primary-foreground/80">
              <li><a href="#" className="hover:text-gold transition-colors">Contact Us</a></li>
              <li><a href="#" className="hover:text-gold transition-colors">Delivery Info</a></li>
              <li><a href="#" className="hover:text-gold transition-colors">FAQ</a></li>
              <li><a href="#" className="hover:text-gold transition-colors">Terms & Conditions</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-primary-foreground/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-primary-foreground/50">
            © {new Date().getFullYear()} Presentail Lebanon. All rights reserved.
          </p>
          <div className="flex items-center gap-4 opacity-50 grayscale mix-blend-luminosity">
            <span className="text-xs">Secure payments by Stripe & Mamo</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
