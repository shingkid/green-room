import { type CSSProperties, type ReactNode } from "react";

import styles from "./Badge.module.css";

type BadgeProps = {
  color: string;
  children: ReactNode;
  onClick?: () => void;
};

export function Badge({ color, children, onClick }: BadgeProps) {
  return (
    <span
      className={`${styles.badge}${onClick ? ` ${styles.clickable}` : ""}`}
      onClick={onClick}
      style={{ "--badge-color": color } as CSSProperties}
    >
      {children}
    </span>
  );
}
