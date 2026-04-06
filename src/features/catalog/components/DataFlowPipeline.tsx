import { useState } from "react";

import { ACTION_COLORS, type DataFlow, type DataFlowAction, type DataFlowStage, type Service } from "../../../domain/registry";
import { formatServiceLabel } from "../../../domain/catalog";
import styles from "./DataFlowPipeline.module.css";

const ALL_ACTIONS: DataFlowAction[] = [
  "produces",
  "transforms",
  "stores",
  "indexes",
  "enriches",
  "caches",
  "serves",
  "consumes",
];

type DataFlowPipelineProps = {
  dataFlow: DataFlow;
  dataFlowKey: string;
  selectedService: string | null;
  services: Record<string, Service>;
  onSelectService: (serviceKey: string) => void;
  editMode?: boolean;
  onReorderStages?: (newStages: DataFlowStage[]) => void;
  onAddStage?: (stage: DataFlowStage, atIndex: number) => void;
  availableServices?: string[];
};

export function DataFlowPipeline({
  dataFlow,
  selectedService,
  services,
  onSelectService,
  editMode = false,
  onReorderStages,
  onAddStage,
  availableServices = [],
}: DataFlowPipelineProps) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [newServiceKey, setNewServiceKey] = useState<string>(() => availableServices[0] ?? "");
  const [newAction, setNewAction] = useState<DataFlowAction>("produces");

  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  function handleDrop(e: React.DragEvent, targetIndex: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === targetIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const newStages = [...dataFlow.stages];
    const [moved] = newStages.splice(dragIndex, 1);
    newStages.splice(targetIndex, 0, moved);
    onReorderStages?.(newStages);
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleDragEnd() {
    setDragIndex(null);
    setDragOverIndex(null);
  }

  function handleConfirmAdd() {
    if (!newServiceKey || insertAt === null) return;
    onAddStage?.({ service: newServiceKey, action: newAction }, insertAt);
    setInsertAt(null);
    setNewServiceKey(availableServices[0] ?? "");
    setNewAction("produces");
  }

  if (editMode) {
    return (
      <div className={styles.pipelineScroll}>
        <div className={styles.editPipeline}>
          {dataFlow.stages.map((stage, index) => {
            const service = services[stage.service];
            const isDropTarget = dragOverIndex === index && dragIndex !== null && dragIndex !== index;
            const isDragging = dragIndex === index;

            return (
              <div key={`${stage.service}-${index}`} className={styles.editStageWrapper}>
                {isDropTarget && dragIndex !== null && dragIndex > index ? (
                  <div className={styles.dropIndicator} />
                ) : null}
                <div
                  className={`${styles.editStage}${isDragging ? ` ${styles.editStageDragging}` : ""}`}
                  draggable
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragStart={() => handleDragStart(index)}
                  onDrop={(e) => handleDrop(e, index)}
                >
                  <div
                    className={styles.editStageAction}
                    style={{ background: ACTION_COLORS[stage.action] ?? "#64748b" }}
                  >
                    {stage.action.toUpperCase()}
                  </div>
                  <div className={styles.editStageName}>
                    {formatServiceLabel(service?.name ?? stage.service, 18)}
                  </div>
                  {stage.format ? (
                    <div className={styles.editStageFormat}>{stage.format}</div>
                  ) : null}
                  <div className={styles.dragHandle} title="Drag to reorder">⠿</div>
                </div>
                {isDropTarget && dragIndex !== null && dragIndex < index ? (
                  <div className={styles.dropIndicator} />
                ) : null}
                {onAddStage && insertAt !== index + 1 ? (
                  <button
                    className={styles.addStageBtn}
                    onClick={() => {
                      setInsertAt(index + 1);
                      setNewServiceKey(availableServices[0] ?? "");
                      setNewAction("produces");
                    }}
                    title="Insert stage after this one"
                    type="button"
                  >
                    +
                  </button>
                ) : null}
                {insertAt === index + 1 ? (
                  <div className={styles.addStageForm}>
                    <select
                      onChange={(e) => setNewServiceKey(e.target.value)}
                      value={newServiceKey}
                    >
                      {availableServices.map((key) => (
                        <option key={key} value={key}>
                          {services[key]?.name ?? key}
                        </option>
                      ))}
                    </select>
                    <select
                      onChange={(e) => setNewAction(e.target.value as DataFlowAction)}
                      value={newAction}
                    >
                      {ALL_ACTIONS.map((a) => (
                        <option key={a} value={a}>{a}</option>
                      ))}
                    </select>
                    <button className="primary-button" onClick={handleConfirmAdd} type="button">
                      Add
                    </button>
                    <button className="secondary-button" onClick={() => setInsertAt(null)} type="button">
                      Cancel
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
          {onAddStage && insertAt !== 0 ? (
            <button
              className={styles.addStageBtnFirst}
              onClick={() => {
                setInsertAt(0);
                setNewServiceKey(availableServices[0] ?? "");
                setNewAction("produces");
              }}
              title="Insert stage at beginning"
              type="button"
            >
              + Add first stage
            </button>
          ) : null}
          {insertAt === 0 ? (
            <div className={styles.addStageForm}>
              <select onChange={(e) => setNewServiceKey(e.target.value)} value={newServiceKey}>
                {availableServices.map((key) => (
                  <option key={key} value={key}>
                    {services[key]?.name ?? key}
                  </option>
                ))}
              </select>
              <select
                onChange={(e) => setNewAction(e.target.value as DataFlowAction)}
                value={newAction}
              >
                {ALL_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
              <button className="primary-button" onClick={handleConfirmAdd} type="button">
                Add
              </button>
              <button className="secondary-button" onClick={() => setInsertAt(null)} type="button">
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // Non-edit mode: original SVG rendering
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

          return (
            <g key={`${stage.service}-${index}`}>
              <g className={styles.pipelineStage} onClick={() => onSelectService(stage.service)}>
                <rect
                  fill={
                    isSelected
                      ? "var(--pipeline-stage-bg-selected)"
                      : "var(--pipeline-stage-bg)"
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
                  fill={ACTION_COLORS[stage.action] ?? "#64748b"}
                  height={16}
                  opacity={0.9}
                  rx={4}
                  width={stageW - 8}
                  x={x + 4}
                  y={8}
                />
                <text
                  fill="#fff"
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
                  fill="var(--text-primary)"
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
                  fill="var(--text-subtle)"
                  fontFamily="system-ui"
                  fontSize="8"
                  textAnchor="middle"
                  x={x + stageW / 2}
                  y={56}
                >
                  {formatServiceLabel(stage.format ?? "", 20)}
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
