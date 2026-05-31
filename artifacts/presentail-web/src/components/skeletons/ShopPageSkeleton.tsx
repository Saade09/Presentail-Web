import { Skeleton } from "@/components/ui/skeleton";

function GridCardSkeleton() {
  return (
    <div className="space-y-3">
      <Skeleton className="aspect-square rounded-2xl w-full" />
      <Skeleton className="h-4 w-4/5 rounded-md" />
      <Skeleton className="h-3 w-1/2 rounded-md" />
    </div>
  );
}

export function ShopPageSkeleton() {
  return (
    <div
      className="min-h-screen pt-24 pb-24"
      aria-label="Loading" // i18n-ignore
      role="status"
    >
      <div className="container mx-auto px-4">
        {/* Page header */}
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between gap-6 mb-12 pb-8 border-b">
          <div className="space-y-3">
            <Skeleton className="h-10 w-56 rounded-md" />
            <Skeleton className="h-4 w-80 rounded-md" />
          </div>
          <Skeleton className="h-9 w-40 rounded-lg shrink-0" />
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="hidden md:block w-64 shrink-0 space-y-8">
            <div className="space-y-3">
              <Skeleton className="h-5 w-28 rounded-md" />
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-32 rounded-md" />
              ))}
            </div>
            <div className="space-y-3">
              <Skeleton className="h-5 w-24 rounded-md" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-3.5 w-28 rounded-md" />
              ))}
            </div>
          </div>

          {/* Product grid */}
          <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <GridCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
