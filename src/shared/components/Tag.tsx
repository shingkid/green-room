import { type CSSProperties, type ReactNode } from "react";

type TagProps = {
  children: ReactNode;
  color?: string;
};

export function Tag({ children, color = "var(--tag-neutral)" }: TagProps) {
  return (
    <span className="tag" style={{ "--tag-color": color } as CSSProperties}>
      {children}
    </span>
  );
}
