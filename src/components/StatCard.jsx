import React from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

export default function StatCard({
  label,
  value,
  subtext,
  icon,
  trend,
  trendValue,
  size = "md",
  className,
  highlight = false,
}) {
  const sizeClasses = {
    sm: "p-3",
    md: "p-5",
    lg: "p-6",
  };

  const valueSizeClasses = {
    sm: "text-xl",
    md: "text-2xl",
    lg: "text-3xl",
  };

  return (
    <div
      className={cn(
        "rounded-xl border transition-all duration-150",
        sizeClasses[size],
        highlight
          ? "bg-[var(--accent-light)] border-[var(--accent)]"
          : "bg-[var(--bg-card)] border-[var(--border)] hover:border-[var(--border-strong)] hover:shadow-md",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">
            {label}
          </p>
          <div className={cn(
            "font-bold tracking-tight text-[var(--text-primary)]",
            valueSizeClasses[size]
          )}>
            {value}
          </div>
          {subtext && (
            <p className="text-sm text-[var(--text-muted)] mt-1 truncate">
              {subtext}
            </p>
          )}
          {trend && (
            <div className={cn(
              "flex items-center gap-1 mt-2 text-sm font-medium",
              trend === "up" ? "text-[var(--success)]" : "text-[var(--danger)]"
            )}>
              {trend === "up" ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              {trendValue && <span>{trendValue}</span>}
            </div>
          )}
        </div>
        {icon && (
          <div className={cn(
            "flex-shrink-0 p-2.5 rounded-lg",
            highlight
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--bg-card-hover)] text-[var(--text-muted)]"
          )}>
            {icon}
          </div>
        )}
      </div>
    </div>
  );
}

// Compact stat display for inline use
export function StatDisplay({ label, value, className }) {
  return (
    <div className={cn("text-center", className)}>
      <div className="text-lg font-bold text-[var(--text-primary)]">{value}</div>
      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider">{label}</div>
    </div>
  );
}
