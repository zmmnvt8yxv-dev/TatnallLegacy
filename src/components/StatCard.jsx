import React from "react";
import { Card, CardHeader, CardContent } from "@/components/ui/card.jsx";

export default function StatCard({ label, value, subtext }) {
  return (
    <Card className="shadow-soft border-ink-100">
      <CardHeader className="pb-2">
        <span className="text-xs font-bold text-ink-500 uppercase tracking-wider">{label}</span>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-display text-ink-900">{value}</div>
        {subtext && <p className="text-xs text-ink-400 mt-1">{subtext}</p>}
      </CardContent>
    </Card>
  );
}
