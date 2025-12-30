import type { PropsWithChildren } from "react";

export function Card({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={`rounded-2xl border border-border bg-surface shadow-soft ${className}`.trim()}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <div className={`px-4 pt-4 ${className}`.trim()}>{children}</div>;
}

export function CardTitle({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <h3 className={`text-sm font-semibold uppercase tracking-[0.2em] text-muted ${className}`.trim()}>{children}</h3>;
}

export function CardContent({ children, className = "" }: PropsWithChildren<{ className?: string }>) {
  return <div className={`px-4 pb-4 ${className}`.trim()}>{children}</div>;
}
