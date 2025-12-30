import type { PropsWithChildren, ReactNode } from "react";
import { motion } from "framer-motion";
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
    <motion.div
      className="chart-card motion-card"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      whileHover={{ y: -3 }}
    >
      <Card className="h-full">
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
    </motion.div>
  );
}
