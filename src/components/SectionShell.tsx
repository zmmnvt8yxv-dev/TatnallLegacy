import type { PropsWithChildren, ReactNode } from "react";
import { SectionCard } from "./SectionCard";

type SectionShellProps = PropsWithChildren<{
  id: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}>;

export function SectionShell({ id, title, subtitle, actions, children }: SectionShellProps) {
  return (
    <SectionCard id={id} aria-labelledby={`${id}-title`}>
      <div className="section-header">
        <div className="space-y-1">
          <h2 id={`${id}-title`} className="text-xl font-semibold">
            {title}
          </h2>
          {subtitle ? <p className="section-subtitle">{subtitle}</p> : null}
        </div>
        {actions ? <div className="controls row">{actions}</div> : null}
      </div>
      {children}
    </SectionCard>
  );
}
