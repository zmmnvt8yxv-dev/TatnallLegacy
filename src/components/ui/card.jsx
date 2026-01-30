import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef(({
  className,
  variant = "default",
  clickable = false,
  highlighted = false,
  ...props
}, ref) => {
  const variantClasses = {
    default: "bg-[var(--bg-card)] border-[var(--border)]",
    highlighted: "bg-[var(--accent-light)] border-[var(--accent)]",
    success: "bg-[var(--success-light)] border-[var(--success)]",
    warning: "bg-[var(--warning-light)] border-[var(--warning)]",
    danger: "bg-[var(--danger-light)] border-[var(--danger)]",
    ghost: "bg-transparent border-transparent",
  };

  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border shadow-sm transition-all duration-150",
        "text-[var(--text-primary)]",
        variantClasses[highlighted ? "highlighted" : variant],
        clickable && "cursor-pointer hover:shadow-md hover:-translate-y-0.5 hover:border-[var(--border-strong)]",
        className
      )}
      {...props}
    />
  );
});
Card.displayName = "Card"

const CardHeader = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-5 pb-0", className)}
    {...props}
  />
));
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-[var(--text-primary)]",
      className
    )}
    {...props}
  />
));
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-[var(--text-muted)]", className)}
    {...props}
  />
));
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-5", className)} {...props} />
));
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-5 pt-0", className)}
    {...props}
  />
));
CardFooter.displayName = "CardFooter"

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent }
