import { Skeleton } from "@/components/ui/skeleton";

function ProductCardSkeleton() {
  return (
    <div className="space-y-3 flex-shrink-0 w-[calc(50%-8px)] sm:w-56">
      <Skeleton className="aspect-square rounded-2xl w-full" />
      <Skeleton className="h-4 w-4/5 rounded-md" />
      <Skeleton className="h-3 w-1/2 rounded-md" />
    </div>
  );
}

function RailSkeleton() {
  return (
    <div className="py-8">
      <Skeleton className="h-6 w-48 mb-5 rounded-md" />
      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <ProductCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function HomePageSkeleton() {
  return (
    <div
      className="min-h-screen px-5"
      aria-label="Loading" // i18n-ignore
      role="status"
    >
      {/* Hero banner */}
      <Skeleton className="w-full rounded-2xl mt-2" style={{ height: "clamp(220px, 42vw, 520px)" }} />

      {/* First product rail */}
      <RailSkeleton />

      {/* Collections grid */}
      <div className="py-6">
        <Skeleton className="h-6 w-40 mb-5 rounded-md" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      </div>

      {/* Second product rail */}
      <RailSkeleton />
    </div>
  );
}
