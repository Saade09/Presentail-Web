import { Skeleton } from "@/components/ui/skeleton";

export function AccountSkeleton() {
  return (
    <div
      className="min-h-screen pt-24 pb-24 bg-background"
      aria-label="Loading" // i18n-ignore
      role="status"
    >
      <div className="container mx-auto px-4 max-w-6xl">
        {/* Title */}
        <Skeleton className="h-9 w-40 mb-8 rounded-md" />

        <div className="flex gap-7 items-start">
          {/* Sidebar */}
          <div className="hidden md:flex flex-col w-52 shrink-0 rounded-2xl border border-border/50 p-4 gap-1">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="w-4 h-4 rounded-sm" />
                <Skeleton className="h-3.5 w-24 rounded-md" />
              </div>
            ))}
            <div className="mt-2 border-t border-border/50 pt-2">
              <div className="flex items-center gap-3 px-3 py-2.5">
                <Skeleton className="w-4 h-4 rounded-sm" />
                <Skeleton className="h-3.5 w-16 rounded-md" />
              </div>
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-6">
            {/* Shortcut cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-20 rounded-2xl" />
              ))}
            </div>

            {/* Profile form */}
            <div className="rounded-2xl border border-border/50 p-5 space-y-4">
              <Skeleton className="h-5 w-28 rounded-md" />
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-20 rounded-md" />
                  <Skeleton className="h-10 rounded-lg" />
                </div>
                <div className="space-y-1.5">
                  <Skeleton className="h-3.5 w-20 rounded-md" />
                  <Skeleton className="h-10 rounded-lg" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-16 rounded-md" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-14 rounded-md" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
              <Skeleton className="h-10 w-32 rounded-lg" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
