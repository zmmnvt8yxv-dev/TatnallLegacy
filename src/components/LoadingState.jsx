import React from "react";
import { Loader2 } from "lucide-react";

export default function LoadingState({ label = "Loading data...", message }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="relative">
        <div className="w-16 h-16 rounded-full bg-[var(--accent-light)] flex items-center justify-center mb-4">
          <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
        </div>
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">{label}</h3>
      <p className="text-sm text-[var(--text-muted)]">
        {message || "Please wait while we fetch the latest league data."}
      </p>

      {/* Skeleton preview */}
      <div className="mt-8 w-full max-w-md space-y-3">
        <div className="h-4 bg-[var(--bg-card-hover)] rounded animate-pulse w-full" />
        <div className="h-4 bg-[var(--bg-card-hover)] rounded animate-pulse w-3/4" />
        <div className="h-4 bg-[var(--bg-card-hover)] rounded animate-pulse w-5/6" />
      </div>
    </div>
  );
}
