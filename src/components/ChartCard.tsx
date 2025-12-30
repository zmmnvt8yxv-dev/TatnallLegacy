import type { PropsWithChildren, ReactNode } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/Card";

type ChartCardProps = PropsWithChildren<{
  title: string;
  subtitle?: string;
  description?: string;
  actions?: ReactNode;
  footer?: ReactNode;
}>;

export function ChartCard({ title, subtitle, description, actions, footer, children }: ChartCardProps) {
  return (
    <Card className="chart-card">
      <CardHeader className="chart-card__header">
        <div>
          <CardTitle>{title}</CardTitle>
          {subtitle ? <p className="chart-card__subtitle">{subtitle}</p> : null}
          {description ? <p className="chart-card__description">{description}</p> : null}
        </div>
        {actions ? <div className="chart-card__actions">{actions}</div> : null}
      </CardHeader>
      <CardContent className="chart-card__content">{children}</CardContent>
      {footer ? <div className="chart-card__footer">{footer}</div> : null}
    </Card>
  );
}
