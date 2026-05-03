import { useProducts, useCategoryProducts, useOccasionProducts, type Product } from "@/lib/queries";
import { ProductCard } from "@/components/ProductCard";
import { useSearch, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState, useMemo } from "react";
import { Filter, SlidersHorizontal } from "lucide-react";

const CATEGORIES = [
  { slug: "hand-bouquets", label: "Hand Bouquets" },
  { slug: "flower-boxes", label: "Flower Boxes" },
  { slug: "plants", label: "Plants" },
  { slug: "cakes", label: "Cakes" },
  { slug: "chocolate", label: "Chocolate" },
  { slug: "bundles", label: "Bundles" },
];

const OCCASIONS = [
  { slug: "birthday", label: "Birthday" },
  { slug: "love-romance", label: "Love & Romance" },
  { slug: "congratulations", label: "Congratulations" },
  { slug: "thank-you", label: "Thank You" },
  { slug: "condolences", label: "Condolences" },
];

export default function Shop() {
  const searchString = useSearch();
  const searchParams = useMemo(() => new URLSearchParams(searchString), [searchString]);

  const category = searchParams.get("category") || "";
  const occasion = searchParams.get("occasion") || "";

  // Pick the right endpoint: category-products and occasion-products actually
  // filter on the backend; the generic /woo/products endpoint ignores
  // category/occasion params, so we route filtered views through the
  // dedicated endpoints.
  const allProducts = useProducts({}, !category && !occasion);
  const categoryProducts = useCategoryProducts(category);
  const occasionProducts = useOccasionProducts(occasion);

  const isLoading = category
    ? categoryProducts.isLoading
    : occasion
      ? occasionProducts.isLoading
      : allProducts.isLoading;

  const sourceProducts: Product[] = useMemo(() => {
    if (category) return categoryProducts.data?.products ?? [];
    if (occasion) {
      // occasion endpoint groups by sub-occasion slug; flatten and dedupe.
      const groups = occasionProducts.data?.groups ?? [];
      const seen = new Set<string>();
      const flat: Product[] = [];
      for (const g of groups) {
        for (const p of g.products) {
          if (seen.has(p.id)) continue;
          seen.add(p.id);
          flat.push(p);
        }
      }
      return flat;
    }
    return allProducts.data?.products ?? [];
  }, [category, occasion, categoryProducts.data, occasionProducts.data, allProducts.data]);

  const [sort, setSort] = useState("featured");

  const products = useMemo(() => {
    const p = [...sourceProducts];
    if (sort === "price-asc") p.sort((a, b) => a.priceValue - b.priceValue);
    if (sort === "price-desc") p.sort((a, b) => b.priceValue - a.priceValue);
    return p;
  }, [sourceProducts, sort]);

  const pageTitle = category
    ? CATEGORIES.find((c) => c.slug === category)?.label ?? category
    : occasion
      ? OCCASIONS.find((o) => o.slug === occasion)?.label ?? occasion
      : "All Collection";

  return (
    <div className="min-h-screen pt-24 pb-24">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 mb-12 pb-8 border-b">
          <div>
            <h1 className="text-4xl md:text-5xl font-serif mb-4" data-testid="text-shop-title">{pageTitle}</h1>
            <p className="text-muted-foreground text-lg max-w-xl">
              Browse our curated selection of luxury floral designs and premium gifts, thoughtfully crafted for delivery in Lebanon.
            </p>
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto">
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="w-[180px] bg-background" data-testid="select-sort">
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="featured">Featured</SelectItem>
                <SelectItem value="price-asc">Price: Low to High</SelectItem>
                <SelectItem value="price-desc">Price: High to Low</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" className="md:hidden" data-testid="button-mobile-filters">
              <Filter className="w-4 h-4 mr-2" /> Filters
            </Button>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          <div className="hidden md:block w-64 shrink-0 space-y-8">
            <div>
              <h3 className="font-serif text-lg mb-4">Categories</h3>
              <ul className="space-y-3">
                {CATEGORIES.map((c) => (
                  <li key={c.slug}>
                    <Link
                      href={`/shop?category=${c.slug}`}
                      className={`text-sm hover:text-primary transition-colors ${category === c.slug ? "font-medium text-primary" : "text-muted-foreground"}`}
                      data-testid={`link-category-${c.slug}`}
                    >
                      {c.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="font-serif text-lg mb-4">Occasions</h3>
              <ul className="space-y-3">
                {OCCASIONS.map((o) => (
                  <li key={o.slug}>
                    <Link
                      href={`/shop?occasion=${o.slug}`}
                      className={`text-sm hover:text-primary transition-colors ${occasion === o.slug ? "font-medium text-primary" : "text-muted-foreground"}`}
                      data-testid={`link-occasion-${o.slug}`}
                    >
                      {o.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {(category || occasion) && (
              <Link href="/shop" className="text-sm font-medium text-primary hover:underline" data-testid="link-clear-filters">
                Clear all filters
              </Link>
            )}
          </div>

          <div className="flex-1">
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
                {Array(6).fill(0).map((_, i) => (
                  <div key={i} className="space-y-3">
                    <Skeleton className="aspect-[4/5] rounded-2xl" />
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/3" />
                  </div>
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="text-center py-24 bg-muted/30 rounded-2xl border border-dashed">
                <h3 className="font-serif text-2xl mb-3">No products found</h3>
                <p className="text-muted-foreground mb-6">We couldn't find any products matching your current filters.</p>
                <Button asChild variant="outline" data-testid="button-clear-filters">
                  <Link href="/shop">Clear Filters</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-10">
                {products.map((product, i) => (
                  <ProductCard key={product.id} product={product} index={i} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
