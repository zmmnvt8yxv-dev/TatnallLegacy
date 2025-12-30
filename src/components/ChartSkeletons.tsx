import { SkeletonBlock } from "./Skeleton";

const chartSkeletons = Array.from({ length: 2 }, (_, index) => index);
const detailSkeletons = Array.from({ length: 6 }, (_, index) => index);

export function SummaryChartsSkeleton() {
  return (
    <div className="space-y-8">
      <div className="chart-grid">
        {chartSkeletons.map((index) => (
          <SkeletonBlock key={`summary-chart-${index}`} className="h-64" rounded="lg" />
        ))}
      </div>
      <SkeletonBlock className="h-64" rounded="lg" />
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {detailSkeletons.map((index) => (
          <SkeletonBlock key={`summary-award-${index}`} className="h-24" rounded="lg" />
        ))}
      </div>
    </div>
  );
}
