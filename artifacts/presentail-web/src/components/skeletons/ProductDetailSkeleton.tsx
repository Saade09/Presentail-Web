import { Skeleton } from "@/components/ui/skeleton";

export function ProductDetailSkeleton() {
  return (
    <div
      className="container mx-auto px-4 sm:px-6 lg:px-12 xl:px-20 max-w-6xl pt-12 pb-24"
      aria-label="Loading" // i18n-ignore
      role="status"
    >
      {/* Breadcrumb */}
      <Skeleton className="h-4 w-64 mb-8 rounded-md" />

      <div className="grid lg:grid-cols-2 gap-10 lg:gap-16">
        {/* Image gallery */}
        <div className="space-y-3">
          <Skeleton className="aspect-square rounded-3xl w-full" />
          <div className="flex gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="w-16 h-16 rounded-xl shrink-0" />
            ))}
          </div>
        </div>

        {/* Info panel */}
        <div className="space-y-5">
          <div className="space-y-2">
            <Skeleton className="h-9 w-3/4 rounded-md" />
            <Skeleton className="h-7 w-28 rounded-md" />
          </div>

          {/* Delivery options block */}
          <Skeleton className="h-28 w-full rounded-2xl" />

          {/* Description lines */}
          <div className="space-y-2">
            <Skeleton className="h-4 w-full rounded-md" />
            <Skeleton className="h-4 w-5/6 rounded-md" />
            <Skeleton className="h-4 w-4/6 rounded-md" />
          </div>

          {/* Add to cart button */}
          <Skeleton className="h-14 w-full rounded-xl" />

          {/* Benefits row */}
          <div className="flex gap-4 pt-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 flex-1 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
