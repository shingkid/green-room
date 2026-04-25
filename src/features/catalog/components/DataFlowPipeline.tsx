import { getStageSubtypeLabel, type DataFlow, type Service } from "@domain/registry";
import { formatServiceLabel } from "@domain/catalog";
import styles from "./DataFlowPipeline.module.css";

type DataFlowPipelineProps = {
  dataFlow: DataFlow;
  selectedService: string | null;
  services: Record<string, Service>;
  onSelectService: (serviceKey: string) => void;
};

export function DataFlowPipeline({
  dataFlow,
  selectedService,
  services,
  onSelectService,
}: DataFlowPipelineProps) {
  const stageW = 130;
  const stageH = 72;
  const arrowW = 40;
  const gap = 12;
  const totalW = dataFlow.stages.length * (stageW + arrowW + gap) - arrowW - gap;

  return (
    <div className={styles.pipelineScroll}>
      <svg height={stageH + 20} width={Math.max(totalW + 40, 300)}>
        <defs>
          <marker
            id="pipeArrow"
            markerHeight="8"
            markerWidth="8"
            orient="auto"
            refX="10"
            refY="5"
            viewBox="0 0 10 10"
          >
            <path d="M0 0 L10 5 L0 10 z" fill="var(--pipeline-arrow)" />
          </marker>
        </defs>
        {dataFlow.stages.map((stage, index) => {
          const x = 20 + index * (stageW + arrowW + gap);
          const service = services[stage.service];
          const isSelected = stage.service === selectedService;
          const subtype = getStageSubtypeLabel(stage);
          const detail = subtype
            ? `${subtype}${stage.format ? ` · ${stage.format}` : ""}`
            : (stage.format ?? "");

          return (
            <g key={`${stage.service}-${index}`}>
              <g className={styles.pipelineStage} onClick={() => onSelectService(stage.service)}>
                <rect
                  fill={
                    isSelected ? "var(--pipeline-stage-bg-selected)" : "var(--pipeline-stage-bg)"
                  }
                  height={stageH}
                  rx={8}
                  stroke={
                    isSelected
                      ? "var(--pipeline-stage-stroke-selected)"
                      : "var(--pipeline-stage-stroke)"
                  }
                  strokeWidth={isSelected ? 2 : 1}
                  width={stageW}
                  x={x}
                  y={4}
                />
                <rect
                  fill={`var(--action-${stage.action}, var(--color-text-muted))`}
                  height={16}
                  opacity={0.9}
                  rx={4}
                  width={stageW - 8}
                  x={x + 4}
                  y={8}
                />
                <text
                  fill="var(--color-text-primary)"
                  fontFamily="system-ui"
                  fontSize="9"
                  fontWeight="600"
                  textAnchor="middle"
                  x={x + stageW / 2}
                  y={20}
                >
                  {stage.action.toUpperCase()}
                </text>
                <text
                  fill="var(--color-text-primary)"
                  fontFamily="system-ui"
                  fontSize="10"
                  fontWeight="600"
                  textAnchor="middle"
                  x={x + stageW / 2}
                  y={42}
                >
                  {formatServiceLabel(service?.name ?? stage.service, 18)}
                </text>
                <text
                  fill="var(--color-text-muted)"
                  fontFamily="system-ui"
                  fontSize="8"
                  textAnchor="middle"
                  x={x + stageW / 2}
                  y={56}
                >
                  {formatServiceLabel(detail, 20)}
                </text>
              </g>
              {index < dataFlow.stages.length - 1 ? (
                <line
                  markerEnd="url(#pipeArrow)"
                  stroke="var(--pipeline-arrow)"
                  strokeWidth={1.5}
                  x1={x + stageW + 2}
                  x2={x + stageW + arrowW + gap - 2}
                  y1={4 + stageH / 2}
                  y2={4 + stageH / 2}
                />
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
