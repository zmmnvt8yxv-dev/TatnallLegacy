import * as React from "react";
import { cn } from "@/lib/utils";

// Generate a consistent color based on name string
function stringToColor(str) {
  if (!str) return "hsl(220, 15%, 50%)";

  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash % 360);
  return `hsl(${hue}, 65%, 50%)`;
}

// Get initials from name
function getInitials(name) {
  if (!name) return "?";

  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

const sizeClasses = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-10 h-10 text-sm",
  lg: "w-14 h-14 text-lg",
  xl: "w-20 h-20 text-xl",
};

const Avatar = React.forwardRef(
  ({ name, image, size = "md", className, showRing = false, ringColor, ...props }, ref) => {
    const initials = getInitials(name);
    const bgColor = stringToColor(name);

    return (
      <div
        ref={ref}
        className={cn(
          "relative inline-flex items-center justify-center rounded-full font-semibold",
          "flex-shrink-0 overflow-hidden",
          sizeClasses[size],
          showRing && "ring-2 ring-offset-2 ring-offset-[var(--bg-primary)]",
          showRing && (ringColor || "ring-[var(--accent)]"),
          className
        )}
        style={{ backgroundColor: image ? undefined : bgColor }}
        title={name}
        {...props}
      >
        {image ? (
          <img
            src={image}
            alt={name || "Avatar"}
            className="w-full h-full object-cover"
            onError={(e) => {
              // Fallback to initials on error
              e.target.style.display = "none";
            }}
          />
        ) : (
          <span className="text-white select-none">{initials}</span>
        )}
      </div>
    );
  }
);
Avatar.displayName = "Avatar";

// Avatar with label (name beside it)
function AvatarWithLabel({
  name,
  image,
  size = "md",
  subtitle,
  className,
  labelClassName,
  reverse = false,
  ...props
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3",
        reverse && "flex-row-reverse",
        className
      )}
    >
      <Avatar name={name} image={image} size={size} {...props} />
      <div className={cn(reverse && "text-right", labelClassName)}>
        <div className="font-medium text-[var(--text-primary)]">{name}</div>
        {subtitle && (
          <div className="text-sm text-[var(--text-muted)]">{subtitle}</div>
        )}
      </div>
    </div>
  );
}

// Avatar group (stacked avatars)
function AvatarGroup({
  avatars = [],
  max = 4,
  size = "sm",
  className,
}) {
  const visible = avatars.slice(0, max);
  const remaining = avatars.length - max;

  return (
    <div className={cn("flex -space-x-2", className)}>
      {visible.map((avatar, index) => (
        <Avatar
          key={avatar.name || index}
          name={avatar.name}
          image={avatar.image}
          size={size}
          className="ring-2 ring-[var(--bg-primary)]"
        />
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            "relative inline-flex items-center justify-center rounded-full",
            "bg-[var(--bg-card-hover)] text-[var(--text-muted)]",
            "ring-2 ring-[var(--bg-primary)]",
            "font-medium",
            sizeClasses[size]
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  );
}

export { Avatar, AvatarWithLabel, AvatarGroup };
