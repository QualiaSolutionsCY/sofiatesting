export default function Loading() {
  return (
    <div className="container mx-auto px-4 py-8">
      {/* Page title skeleton */}
      <div className="mb-8 h-8 w-64 animate-pulse rounded bg-muted" />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Property form card skeleton */}
        <div className="rounded-lg border shadow-sm">
          <div className="border-b p-6">
            <div className="space-y-2">
              <div className="h-6 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="space-y-4 p-6">
            {/* Form fields skeletons */}
            {[1, 2, 3, 4, 5].map((i) => (
              <div className="space-y-2" key={i}>
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-10 w-full animate-pulse rounded bg-muted" />
              </div>
            ))}
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>

        {/* Listings list card skeleton */}
        <div className="rounded-lg border shadow-sm">
          <div className="border-b p-6">
            <div className="space-y-2">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-72 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="space-y-4 p-6">
            {/* Property card skeletons */}
            {[1, 2, 3].map((i) => (
              <div className="rounded-lg border p-4" key={i}>
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-2">
                    <div className="h-5 w-48 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                    <div className="h-4 w-28 animate-pulse rounded bg-muted" />
                    <div className="h-6 w-16 animate-pulse rounded-full bg-muted" />
                  </div>
                  <div className="h-9 w-20 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
