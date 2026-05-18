import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useSearch } from "@/lib/queries";
import { useLocationSelection } from "@/contexts/LocationContext";
import { Loader2, Tag } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function SearchOverlay({ open, onClose }: Props) {
  const [, navigate] = useLocation();
  const { countryCode, city } = useLocationSelection();
  const [q, setQ] = useState("");

  const { data, isFetching } = useSearch(q, {
    countryCode: countryCode ?? undefined,
    cityId: city?.id ?? undefined,
  });

  const handleSelect = useCallback(
    (href: string) => {
      onClose();
      setQ("");
      navigate(href);
    },
    [navigate, onClose],
  );

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
        setQ("");
      }
    },
    [onClose],
  );

  const hasProducts = (data?.products?.length ?? 0) > 0;
  const hasCategories = (data?.categories?.length ?? 0) > 0;
  const showEmpty = q.length >= 2 && !isFetching && !hasProducts && !hasCategories;

  return (
    <CommandDialog open={open} onOpenChange={handleOpenChange}>
      <CommandInput
        placeholder="Search products and categories…"
        value={q}
        onValueChange={setQ}
      />
      <CommandList className="max-h-[400px]">
        {isFetching && q.length >= 2 && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Searching…
          </div>
        )}

        {showEmpty && (
          <CommandEmpty>No products or categories found for &ldquo;{q}&rdquo;</CommandEmpty>
        )}

        {!isFetching && hasCategories && (
          <CommandGroup heading="Categories">
            {data!.categories.map((cat) => (
              <CommandItem
                key={cat.slug}
                value={`category-${cat.slug}-${cat.name}`}
                onSelect={() => handleSelect(`/shop?category=${cat.slug}`)}
                className="gap-3 cursor-pointer"
              >
                <Tag className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span>{cat.name}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {!isFetching && hasProducts && (
          <CommandGroup heading="Products">
            {data!.products.map((product) => (
              <CommandItem
                key={product.slug}
                value={`product-${product.slug}-${product.name}`}
                onSelect={() => handleSelect(`/product/${product.slug}`)}
                className="gap-3 cursor-pointer"
              >
                {product.image?.uri ? (
                  <img
                    src={product.image.uri}
                    alt=""
                    className="h-9 w-9 rounded object-cover shrink-0 bg-muted"
                  />
                ) : (
                  <div className="h-9 w-9 rounded bg-muted shrink-0" />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="truncate font-medium">{product.name}</span>
                  <span className="text-xs text-muted-foreground">{product.price}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  );
}
