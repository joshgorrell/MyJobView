export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Hero skeleton */}
      <div className="rounded-2xl border border-gray-200 bg-white p-8 h-48">
        <div className="h-4 w-32 bg-gray-100 rounded mb-4" />
        <div className="h-10 w-48 bg-gray-100 rounded mb-3" />
        <div className="h-6 w-24 bg-gray-100 rounded" />
        <div className="mt-6 h-3 w-full bg-gray-100 rounded-full" />
      </div>

      {/* KPI grid skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 h-32">
            <div className="h-3 w-24 bg-gray-100 rounded mb-3" />
            <div className="h-8 w-20 bg-gray-100 rounded mb-2" />
            <div className="h-3 w-16 bg-gray-100 rounded" />
          </div>
        ))}
      </div>

      {/* Chart + leaderboard skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white p-5 h-72">
          <div className="h-4 w-32 bg-gray-100 rounded mb-4" />
          <div className="h-56 w-full bg-gray-50 rounded" />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5 h-72">
          <div className="h-4 w-40 bg-gray-100 rounded mb-4" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 rounded-lg bg-gray-50" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
