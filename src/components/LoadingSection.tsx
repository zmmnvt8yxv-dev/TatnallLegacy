import { SectionCard } from "./SectionCard";
import { SkeletonBlock } from "./Skeleton";

type LoadingSectionProps = {
  title?: string;
  subtitle?: string;
};

const statSkeletons = Array.from({ length: 4 }, (_, index) => index);
const chartSkeletons = Array.from({ length: 2 }, (_, index) => index);

export function LoadingSection({ title = "Loading dashboard", subtitle = "Fetching the latest data…" }: LoadingSectionProps) {
  return (
    <SectionCard aria-busy="true" aria-live="polite">
      <div className="section-header">
        <div className="space-y-2">
          <SkeletonBlock className="h-4 w-36" rounded="sm" />
          <SkeletonBlock className="h-3 w-64" rounded="sm" />
        </div>
        <SkeletonBlock className="h-8 w-40" rounded="lg" />
      </div>
      <p className="sr-only">
        {title}. {subtitle}
      </p>
      <div className="grid-4">
        {statSkeletons.map((index) => (
          <SkeletonBlock key={`stat-skel-${index}`} className="h-20" rounded="lg" />
        ))}
      </div>
      <div className="chart-grid mt-6">
        {chartSkeletons.map((index) => (
          <SkeletonBlock key={`chart-skel-${index}`} className="h-64" rounded="lg" />
        ))}
      </div>
    </SectionCard>
  );
}
