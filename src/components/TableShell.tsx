import type { CSSProperties, PropsWithChildren } from "react";

type TableShellProps = PropsWithChildren<{
  id?: string;
  className?: string;
  style?: CSSProperties;
}>;

export function TableShell({ id, className, style, children }: TableShellProps) {
  return (
    <div id={id} className={`tablewrap ${className ?? ""}`.trim()} style={style}>
      {children}
    </div>
  );
}
