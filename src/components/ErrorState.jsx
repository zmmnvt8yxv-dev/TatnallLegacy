import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button.jsx";

export default function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-16 h-16 rounded-full bg-[var(--danger-light)] flex items-center justify-center mb-4">
        <AlertCircle className="w-8 h-8 text-[var(--danger)]" />
      </div>
      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-1">We hit a snag</h3>
      <p className="text-sm text-[var(--text-muted)] text-center max-w-md mb-4">
        {message || "Unable to load league data. Please try again."}
      </p>
      {onRetry && (
        <Button onClick={onRetry} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Try Again
        </Button>
      )}
    </div>
  );
}
