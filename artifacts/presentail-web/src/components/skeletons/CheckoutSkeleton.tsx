import { Skeleton } from "@/components/ui/skeleton";

function FormFieldSkeleton() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3.5 w-24 rounded-md" />
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>
  );
}

export function CheckoutSkeleton() {
  return (
    <div
      className="min-h-screen pt-24 pb-24"
      aria-label="Loading" // i18n-ignore
      role="status"
    >
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Back link + title */}
        <div className="flex items-center gap-3 mb-8">
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-6 w-32 rounded-md" />
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-10">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-3.5 w-20 rounded-md" />
              {i < 2 && <Skeleton className="h-px w-8" />}
            </div>
          ))}
        </div>

        <div className="flex flex-col lg:flex-row gap-8">
          {/* Left: form */}
          <div className="flex-1 space-y-5">
            <Skeleton className="h-5 w-40 rounded-md mb-2" />
            <div className="grid grid-cols-2 gap-4">
              <FormFieldSkeleton />
              <FormFieldSkeleton />
            </div>
            <FormFieldSkeleton />
            <FormFieldSkeleton />
            <FormFieldSkeleton />
            {/* Delivery mode buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <Skeleton className="h-16 rounded-xl" />
              <Skeleton className="h-16 rounded-xl" />
            </div>
            <FormFieldSkeleton />
            <Skeleton className="h-14 w-full rounded-xl mt-4" />
          </div>

          {/* Right: order summary */}
          <div className="lg:w-80 shrink-0">
            <div className="rounded-2xl border border-border/50 p-5 space-y-4">
              <Skeleton className="h-5 w-32 rounded-md" />
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-14 h-14 rounded-xl shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-full rounded-md" />
                    <Skeleton className="h-3.5 w-16 rounded-md" />
                  </div>
                </div>
              ))}
              <div className="border-t border-border/50 pt-4 space-y-2">
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-20 rounded-md" />
                  <Skeleton className="h-3.5 w-16 rounded-md" />
                </div>
                <div className="flex justify-between">
                  <Skeleton className="h-3.5 w-20 rounded-md" />
                  <Skeleton className="h-3.5 w-14 rounded-md" />
                </div>
                <div className="flex justify-between pt-1">
                  <Skeleton className="h-5 w-12 rounded-md" />
                  <Skeleton className="h-5 w-20 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
