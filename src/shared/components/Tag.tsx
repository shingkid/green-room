import { type CSSProperties, type ReactNode } from "react";

import styles from "./Tag.module.css";

type TagProps = {
  children: ReactNode;
  color?: string;
};

export function Tag({ children, color = "var(--tag-neutral)" }: TagProps) {
  return (
    <span className={styles.tag} style={{ "--tag-color": color } as CSSProperties}>
      {children}
    </span>
  );
}
