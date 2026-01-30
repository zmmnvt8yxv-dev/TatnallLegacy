import * as React from "react";
import { cn } from "@/lib/utils";
import { Search, Calendar, Users, Trophy, Inbox, FileQuestion, AlertCircle } from "lucide-react";
import { Button } from "./button";

const iconMap = {
  search: Search,
  calendar: Calendar,
  users: Users,
  trophy: Trophy,
  inbox: Inbox,
  question: FileQuestion,
  alert: AlertCircle,
};

function EmptyState({
  icon = "inbox",
  title,
  description,
  action,
  actionLabel,
  className,
  size = "md",
}) {
  const IconComponent = typeof icon === "string" ? iconMap[icon] || Inbox : icon;

  const sizeClasses = {
    sm: {
      container: "py-8",
      icon: "w-10 h-10",
      iconWrapper: "p-3",
      title: "text-base",
      description: "text-sm",
    },
    md: {
      container: "py-12",
      icon: "w-12 h-12",
      iconWrapper: "p-4",
      title: "text-lg",
      description: "text-sm",
    },
    lg: {
      container: "py-16",
      icon: "w-16 h-16",
      iconWrapper: "p-5",
      title: "text-xl",
      description: "text-base",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        classes.container,
        className
      )}
    >
      <div
        className={cn(
          "rounded-full bg-[var(--bg-card-hover)] text-[var(--text-muted)] mb-4",
          classes.iconWrapper
        )}
      >
        <IconComponent className={classes.icon} strokeWidth={1.5} />
      </div>

      {title && (
        <h3
          className={cn(
            "font-semibold text-[var(--text-primary)] mb-1",
            classes.title
          )}
        >
          {title}
        </h3>
      )}

      {description && (
        <p
          className={cn(
            "text-[var(--text-muted)] max-w-md mb-4",
            classes.description
          )}
        >
          {description}
        </p>
      )}

      {action && actionLabel && (
        <Button onClick={action} variant="outline" size="sm">
          {actionLabel}
        </Button>
      )}
    </div>
  );
}

// Specific empty states for common scenarios
function NoMatchupsEmpty({ onReset }) {
  return (
    <EmptyState
      icon={Users}
      title="No Matchups Found"
      description="These rivals haven't faced off yet! Try selecting different owners or check back after the season begins."
      action={onReset}
      actionLabel={onReset ? "Reset Selection" : undefined}
    />
  );
}

function NoResultsEmpty({ query, onReset }) {
  return (
    <EmptyState
      icon="search"
      title="No Results Found"
      description={query ? `No results match "${query}". Try adjusting your search or filters.` : "No results match your criteria."}
      action={onReset}
      actionLabel={onReset ? "Clear Filters" : undefined}
    />
  );
}

function NoDataEmpty({ type = "data" }) {
  return (
    <EmptyState
      icon="inbox"
      title={`No ${type} Available`}
      description={`There's no ${type.toLowerCase()} to display at this time.`}
    />
  );
}

export {
  EmptyState,
  NoMatchupsEmpty,
  NoResultsEmpty,
  NoDataEmpty,
};
