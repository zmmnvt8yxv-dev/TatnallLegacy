import * as React from "react";
import { cn } from "@/lib/utils";

// Base skeleton component
function Skeleton({ className, ...props }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-[var(--bg-card-hover)]",
        className
      )}
      {...props}
    />
  );
}

// Skeleton for text lines
function SkeletonText({ lines = 1, className }) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-4",
            i === lines - 1 && lines > 1 ? "w-3/4" : "w-full"
          )}
        />
      ))}
    </div>
  );
}

// Skeleton for a card
function SkeletonCard({ className, showImage = false }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5",
        className
      )}
    >
      {showImage && <Skeleton className="h-32 w-full mb-4 rounded-lg" />}
      <Skeleton className="h-4 w-1/3 mb-3" />
      <Skeleton className="h-8 w-2/3 mb-2" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

// Skeleton for stat cards
function SkeletonStat({ className }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5",
        className
      )}
    >
      <Skeleton className="h-3 w-16 mb-2" />
      <Skeleton className="h-8 w-24 mb-1" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

// Skeleton for table rows
function SkeletonTable({ rows = 5, columns = 4, className }) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden",
        className
      )}
    >
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 bg-[var(--bg-secondary)] border-b border-[var(--border)]">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div
          key={rowIndex}
          className="flex gap-4 px-4 py-4 border-b border-[var(--border)] last:border-0"
        >
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className={cn(
                "h-4 flex-1",
                colIndex === 0 ? "max-w-[120px]" : ""
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Skeleton for avatar
function SkeletonAvatar({ size = "md", className }) {
  const sizeClasses = {
    sm: "w-8 h-8",
    md: "w-10 h-10",
    lg: "w-14 h-14",
  };

  return (
    <Skeleton
      className={cn("rounded-full", sizeClasses[size], className)}
    />
  );
}

// Skeleton for avatar with text
function SkeletonAvatarWithText({ className }) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <SkeletonAvatar />
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

// Skeleton for page header
function SkeletonPageHeader({ className }) {
  return (
    <div className={cn("space-y-2 mb-8", className)}>
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-5 w-96" />
    </div>
  );
}

// Skeleton grid for multiple cards
function SkeletonGrid({ count = 4, columns = 2, className }) {
  return (
    <div
      className={cn(
        "grid gap-4",
        columns === 2 && "grid-cols-1 md:grid-cols-2",
        columns === 3 && "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
        columns === 4 && "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
        className
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export {
  Skeleton,
  SkeletonText,
  SkeletonCard,
  SkeletonStat,
  SkeletonTable,
  SkeletonAvatar,
  SkeletonAvatarWithText,
  SkeletonPageHeader,
  SkeletonGrid,
};
