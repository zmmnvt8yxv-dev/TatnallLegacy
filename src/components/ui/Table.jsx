import * as React from "react";
import { cn } from "@/lib/utils";
import { ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

const Table = React.forwardRef(({ className, ...props }, ref) => (
  <div className="w-full overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--bg-card)]">
    <table
      ref={ref}
      className={cn("w-full text-sm", className)}
      {...props}
    />
  </div>
));
Table.displayName = "Table";

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn(
      "bg-[var(--bg-secondary)] border-b border-[var(--border)]",
      className
    )}
    {...props}
  />
));
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn("divide-y divide-[var(--border)]", className)} {...props} />
));
TableBody.displayName = "TableBody";

const TableRow = React.forwardRef(({ className, isClickable, isHighlighted, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "transition-colors duration-150",
      "hover:bg-[var(--bg-card-hover)]",
      isClickable && "cursor-pointer",
      isHighlighted && "bg-[var(--accent-light)]",
      className
    )}
    {...props}
  />
));
TableRow.displayName = "TableRow";

const TableHead = React.forwardRef(
  ({ className, align = "left", sortable, sortDirection, onSort, children, ...props }, ref) => {
    const alignClass = {
      left: "text-left",
      center: "text-center",
      right: "text-right",
    }[align];

    const SortIcon = () => {
      if (!sortable) return null;
      if (sortDirection === "asc") return <ChevronUp className="w-4 h-4" />;
      if (sortDirection === "desc") return <ChevronDown className="w-4 h-4" />;
      return <ChevronsUpDown className="w-4 h-4 opacity-50" />;
    };

    return (
      <th
        ref={ref}
        className={cn(
          "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]",
          "sticky top-0 z-10 bg-[var(--bg-secondary)] backdrop-blur-sm",
          alignClass,
          sortable && "cursor-pointer select-none hover:text-[var(--text-primary)]",
          className
        )}
        onClick={sortable ? onSort : undefined}
        {...props}
      >
        <div className={cn(
          "flex items-center gap-1",
          align === "center" && "justify-center",
          align === "right" && "justify-end"
        )}>
          {children}
          <SortIcon />
        </div>
      </th>
    );
  }
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef(({ className, align = "left", ...props }, ref) => {
  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  }[align];

  return (
    <td
      ref={ref}
      className={cn(
        "px-4 py-3 text-[var(--text-primary)]",
        alignClass,
        className
      )}
      {...props}
    />
  );
});
TableCell.displayName = "TableCell";

// Rank cell with medal styling for top 3
const RankCell = React.forwardRef(({ rank, className, ...props }, ref) => {
  const getRankStyle = () => {
    if (rank === 1) return "bg-[var(--gold-light)] text-[var(--gold)] font-bold";
    if (rank === 2) return "bg-[var(--silver-light)] text-[var(--silver)] font-semibold";
    if (rank === 3) return "bg-[var(--bronze-light)] text-[var(--bronze)] font-semibold";
    return "text-[var(--text-muted)]";
  };

  return (
    <td
      ref={ref}
      className={cn("px-4 py-3 text-center", className)}
      {...props}
    >
      <span className={cn(
        "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm",
        getRankStyle()
      )}>
        {rank}
      </span>
    </td>
  );
});
RankCell.displayName = "RankCell";

export {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
  RankCell,
};
