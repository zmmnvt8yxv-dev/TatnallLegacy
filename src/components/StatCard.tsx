import type { ReactNode } from "react";

type StatCardProps = {
  label: string;
  value: ReactNode;
  caption?: string;
};

export function StatCard({ label, value, caption }: StatCardProps) {
  return (
    <div className="stat">
      <h3>{label}</h3>
      <p>{value}</p>
      {caption ? <span className="text-xs text-muted">{caption}</span> : null}
    </div>
  );
}
