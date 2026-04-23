import type { ReactNode } from "react";

import styles from "./GraphWorkspace.module.css";

type GraphWorkspaceProps = {
  graph: ReactNode;
  controls: ReactNode;
  details: ReactNode;
  showDetails: boolean;
};

export function GraphWorkspace({ graph, controls, details, showDetails }: GraphWorkspaceProps) {
  return (
    <section className={styles.workspace} data-testid="graph-workspace">
      <div className={styles.graphArea}>
        <div className={styles.controls}>{controls}</div>
        {graph}
      </div>
      {showDetails ? (
        <aside className={styles.detailsDock} data-testid="graph-workspace-dock">
          {details}
        </aside>
      ) : null}
    </section>
  );
}
