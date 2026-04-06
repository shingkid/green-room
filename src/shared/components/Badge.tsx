import { type CSSProperties, type ReactNode } from "react";

type BadgeProps = {
  color: string;
  children: ReactNode;
  onClick?: () => void;
};

export function Badge({ color, children, onClick }: BadgeProps) {
  return (
    <span
      className={`badge${onClick ? " badge-clickable" : ""}`}
      onClick={onClick}
      style={{ "--badge-color": color } as CSSProperties}
    >
      {children}
    </span>
  );
}
