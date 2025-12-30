import type { HTMLAttributes } from "react";

type SkeletonBlockProps = HTMLAttributes<HTMLDivElement> & {
  rounded?: "sm" | "md" | "lg";
};

const roundedMap = {
  sm: "rounded-md",
  md: "rounded-lg",
  lg: "rounded-2xl",
};

export function SkeletonBlock({ className = "", rounded = "md", ...props }: SkeletonBlockProps) {
  return <div className={`skeleton ${roundedMap[rounded]} ${className}`.trim()} {...props} />;
}
