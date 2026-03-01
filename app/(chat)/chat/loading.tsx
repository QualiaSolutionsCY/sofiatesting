export default function Loading() {
  return (
    <div className="flex h-full flex-col">
      {/* Header skeleton */}
      <div className="border-b px-4 py-3">
        <div className="h-6 w-32 animate-pulse rounded bg-muted" />
      </div>

      {/* Messages area skeleton */}
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {/* Message bubble 1 */}
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>

        {/* Message bubble 2 */}
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>

        {/* Message bubble 3 */}
        <div className="flex items-start gap-3">
          <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>

      {/* Input area skeleton */}
      <div className="border-t p-4">
        <div className="flex items-center gap-2">
          <div className="h-10 flex-1 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 w-10 animate-pulse rounded-lg bg-muted" />
        </div>
      </div>
    </div>
  );
}
