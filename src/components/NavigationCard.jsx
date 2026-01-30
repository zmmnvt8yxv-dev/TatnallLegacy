import React from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";
import { ChevronRight } from "lucide-react";

export default function NavigationCard({ to, title, description, icon: Icon }) {
  return (
    <Link to={to} className="block group no-underline">
      <Card className="h-full shadow-sm hover:shadow-md transition-all duration-200 border-[var(--border)] hover:border-[var(--accent)] group-hover:-translate-y-0.5">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="p-2 rounded-lg bg-[var(--accent-light)] text-[var(--accent)]">
                <Icon size={20} />
              </div>
            )}
            <CardTitle className="text-lg font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent)] transition-colors">
              {title}
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--text-muted)] mb-4">{description}</p>
          <div className="text-[var(--accent)] text-sm font-medium flex items-center gap-1 group-hover:gap-2 transition-all">
            <span>Open</span>
            <ChevronRight size={16} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
