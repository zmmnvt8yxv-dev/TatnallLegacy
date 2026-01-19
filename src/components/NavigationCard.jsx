import React from "react";
import { Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card.jsx";

export default function NavigationCard({ to, title, description }) {
  return (
    <Link to={to} className="block group no-underline">
      <Card className="h-full shadow-soft hover:shadow-md transition-shadow duration-200 border-ink-100 group-hover:border-accent-200">
        <CardHeader>
          <CardTitle className="text-xl font-display text-ink-900 group-hover:text-accent-700 transition-colors">
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-ink-500 mb-4">{description}</p>
          <div className="text-accent-600 text-sm font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
            Open →
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
