import type { ComponentPropsWithoutRef, ElementType, PropsWithChildren } from "react";

type SectionCardProps<T extends ElementType> = PropsWithChildren<
  {
    as?: T;
    className?: string;
  } & ComponentPropsWithoutRef<T>
>;

export function SectionCard<T extends ElementType = "section">({
  as,
  className,
  children,
  ...props
}: SectionCardProps<T>) {
  const Component = as ?? "section";
  return (
    <Component className={`panel ${className ?? ""}`.trim()} {...props}>
      {children}
    </Component>
  );
}
