// Shimmering placeholder shown while a feed loads.
export function PostSkeleton() {
  return (
    <div className="card flex gap-3 px-4 py-4">
      <div className="skeleton h-10 w-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2 py-1">
        <div className="skeleton h-3 w-40 rounded" />
        <div className="skeleton h-3 w-full rounded" />
        <div className="skeleton h-3 w-4/5 rounded" />
        <div className="mt-3 flex gap-10">
          <div className="skeleton h-3 w-8 rounded" />
          <div className="skeleton h-3 w-8 rounded" />
          <div className="skeleton h-3 w-8 rounded" />
        </div>
      </div>
    </div>
  );
}

export function PostSkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div>
      {Array.from({ length: count }).map((_, i) => (
        <PostSkeleton key={i} />
      ))}
    </div>
  );
}
