import * as React from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Trophy, Medal, Star } from "lucide-react"

const badgeVariants = cva(
    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-all duration-150",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-[var(--accent-light)] text-[var(--accent)]",
                secondary:
                    "border-[var(--border)] bg-[var(--bg-card)] text-[var(--text-secondary)]",
                destructive:
                    "border-transparent bg-[var(--danger-light)] text-[var(--danger)]",
                outline:
                    "border-[var(--border)] text-[var(--text-secondary)]",
                success:
                    "border-transparent bg-[var(--success-light)] text-[var(--success)]",
                warning:
                    "border-transparent bg-[var(--warning-light)] text-[var(--warning)]",
                // Championship variants
                championship:
                    "border-transparent bg-[var(--gold-light)] text-[var(--gold)]",
                // Rank variants
                gold:
                    "border-transparent bg-[var(--gold-light)] text-[var(--gold)]",
                silver:
                    "border-transparent bg-[var(--silver-light)] text-[var(--silver)]",
                bronze:
                    "border-transparent bg-[var(--bronze-light)] text-[var(--bronze)]",
                // Position variants for fantasy
                QB: "border-transparent bg-red-500/15 text-red-500 dark:bg-red-400/15 dark:text-red-400",
                RB: "border-transparent bg-green-500/15 text-green-500 dark:bg-green-400/15 dark:text-green-400",
                WR: "border-transparent bg-blue-500/15 text-blue-500 dark:bg-blue-400/15 dark:text-blue-400",
                TE: "border-transparent bg-orange-500/15 text-orange-500 dark:bg-orange-400/15 dark:text-orange-400",
                K: "border-transparent bg-purple-500/15 text-purple-500 dark:bg-purple-400/15 dark:text-purple-400",
                DEF: "border-transparent bg-slate-500/15 text-slate-600 dark:bg-slate-400/15 dark:text-slate-400",
                // Win/Loss variants
                win: "border-transparent bg-[var(--success-light)] text-[var(--success)]",
                loss: "border-transparent bg-[var(--danger-light)] text-[var(--danger)]",
                tie: "border-transparent bg-[var(--silver-light)] text-[var(--text-muted)]",
            },
            size: {
                default: "px-2.5 py-0.5 text-xs",
                sm: "px-2 py-0.5 text-[10px]",
                lg: "px-3 py-1 text-sm",
            }
        },
        defaultVariants: {
            variant: "default",
            size: "default",
        },
    }
)

function Badge({
    className,
    variant,
    size,
    icon,
    children,
    ...props
}) {
    // Auto-add icons for certain variants
    const getIcon = () => {
        if (icon) return icon;
        if (variant === "championship") return <Trophy className="w-3 h-3" />;
        if (variant === "gold") return <Medal className="w-3 h-3" />;
        if (variant === "silver") return <Medal className="w-3 h-3" />;
        if (variant === "bronze") return <Medal className="w-3 h-3" />;
        return null;
    };

    const iconElement = getIcon();

    return (
        <div className={cn(badgeVariants({ variant, size }), className)} {...props}>
            {iconElement}
            {children}
        </div>
    )
}

// Helper component for rank badges
function RankBadge({ rank, ...props }) {
    const variant = rank === 1 ? "gold" : rank === 2 ? "silver" : rank === 3 ? "bronze" : "secondary";
    const label = rank === 1 ? "1st" : rank === 2 ? "2nd" : rank === 3 ? "3rd" : `${rank}th`;
    return <Badge variant={variant} {...props}>{label}</Badge>;
}

// Helper component for position badges
function PositionBadge({ position, ...props }) {
    const validPositions = ["QB", "RB", "WR", "TE", "K", "DEF"];
    const variant = validPositions.includes(position) ? position : "secondary";
    return <Badge variant={variant} {...props}>{position}</Badge>;
}

// Helper component for championship badges
function ChampionshipBadge({ count, ...props }) {
    return (
        <Badge variant="championship" {...props}>
            {count}x Champion
        </Badge>
    );
}

export { Badge, badgeVariants, RankBadge, PositionBadge, ChampionshipBadge }
