import { useCallback, type CSSProperties } from "react";

import {
  ACTION_COLORS,
  DATA_TYPE_ICONS,
  FLOW_COLORS,
  getStageSubtypeLabel,
  type Registry,
  type ServiceStatus,
  SENSITIVITY_COLORS,
  TABS,
  type Theme,
  TYPE_ICONS,
  type ServiceType,
  STATUS_STYLES,
  getExplorerTitle,
} from "../../domain/registry";
import { Badge } from "../../shared/components/Badge";
import { SearchableSelect } from "../../shared/components/SearchableSelect";
import { Tag } from "../../shared/components/Tag";
import { DataFlowPipeline } from "./components/DataFlowPipeline";
import { GraphCanvas } from "./components/GraphCanvas";
import { useCatalogViewModel } from "./useCatalogViewModel";
import styles from "./CatalogView.module.css";

const STATUS_STYLE_ENTRIES = Object.entries(STATUS_STYLES);
const TYPE_ICON_ENTRIES = Object.entries(TYPE_ICONS);
const ACTION_COLOR_ENTRIES = Object.entries(ACTION_COLORS);

type CatalogViewProps = {
  theme: Theme;
  registry: Registry;
  sourceLabel: string | null;
  onEditRegistry: () => void;
  onToggleTheme: () => void;
};

export function CatalogView({
  theme,
  registry,
  sourceLabel,
  onEditRegistry,
  onToggleTheme,
}: CatalogViewProps) {
  const explorerTitle = getExplorerTitle(registry.metadata.team);
  const viewModel = useCatalogViewModel(registry);
  const {
    setExpandedDataFlow,
    setImpactDirection,
    setSelectedDataFlow,
    setSelectedFlow,
  } = viewModel;

  const handleCopyMermaid = useCallback(async () => {
    if (!viewModel.mermaidExport) {
      return;
    }

    await navigator.clipboard.writeText(viewModel.mermaidExport.source);
  }, [viewModel.mermaidExport]);
  const handleDataBusinessFlowChange = useCallback(
    (value: string | null) => {
      setSelectedFlow(value);
      setSelectedDataFlow(null);
    },
    [setSelectedDataFlow, setSelectedFlow],
  );
  const handleDataFlowChange = useCallback(
    (value: string | null) => {
      setSelectedDataFlow(value);
      setExpandedDataFlow(value);
    },
    [setExpandedDataFlow, setSelectedDataFlow],
  );
  const handleSetDownstreamDirection = useCallback(() => {
    setImpactDirection("downstream");
  }, [setImpactDirection]);
  const handleSetUpstreamDirection = useCallback(() => {
    setImpactDirection("upstream");
  }, [setImpactDirection]);

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="app-header">
        <div className="header-row">
          <div>
            <div className="app-title">{explorerTitle}</div>
            <div className="app-subtitle">
              {sourceLabel
                ? `Loaded from ${sourceLabel}. Edit the registry to validate and preview changes in-browser.`
                : "Click a service for dependency impact and affected data flows."}
            </div>
          </div>
          <div className="header-actions">
            <button
              className="secondary-button"
              disabled={!viewModel.mermaidExport}
              onClick={() => {
                void handleCopyMermaid();
              }}
              type="button"
            >
              Copy Mermaid
            </button>
            <button
              className="secondary-button"
              onClick={onEditRegistry}
              type="button"
            >
              Edit registry
            </button>
            <button
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              aria-pressed={theme === "dark"}
              className="secondary-button theme-toggle-button"
              onClick={onToggleTheme}
              type="button"
            >
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
            </button>
          </div>
        </div>
      </header>

      <nav className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            className={`${styles.tab}${viewModel.mode === tab.key ? ` ${styles.tabActive}` : ""}`}
            key={tab.key}
            onClick={() => viewModel.handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className={styles.controlBar}>
        {viewModel.mode === "flow" || viewModel.mode === "data" ? (
          <SearchableSelect
            allLabel="All stakeholders"
            ariaLabel="stakeholders"
            emptyMessage="No stakeholders match."
            onChange={viewModel.setSelectedStakeholder}
            options={viewModel.stakeholderOptions}
            placeholder="Filter by stakeholder"
            value={viewModel.selectedStakeholder}
          />
        ) : null}

        {viewModel.mode === "flow" ? (
          <SearchableSelect
            allLabel="All business flows"
            ariaLabel="business flows"
            emptyMessage="No business flows match."
            onChange={viewModel.setSelectedFlow}
            options={viewModel.businessFlowOptions}
            placeholder="Filter business flows"
            value={viewModel.selectedFlow}
          />
        ) : null}

        {viewModel.mode === "data" ? (
          <>
            <SearchableSelect
              allLabel="All business flows"
              ariaLabel="business flows"
              emptyMessage="No business flows match."
              onChange={handleDataBusinessFlowChange}
              options={viewModel.dataBusinessFlowOptions}
              placeholder="Filter business flows"
              value={viewModel.selectedFlow}
            />
            <SearchableSelect
              allLabel="All data flows"
              ariaLabel="data flows"
              emptyMessage="No data flows match."
              onChange={handleDataFlowChange}
              options={viewModel.dataFlowOptions}
              placeholder="Filter data flows"
              value={viewModel.selectedDataFlow}
            />
          </>
        ) : null}

        {viewModel.mode === "impact" ? (
          <>
            <SearchableSelect
              allLabel="All services"
              ariaLabel="services"
              emptyMessage="No services match."
              onChange={viewModel.setSelectedService}
              options={viewModel.serviceOptions}
              placeholder="Select a service"
              value={viewModel.selectedService}
            />
            <div aria-label="impact direction" className={styles.directionToggle} role="group">
              <button
                className={`${styles.directionToggleButton}${viewModel.impactDirection === "downstream" ? ` ${styles.directionToggleButtonActive}` : ""}`}
                onClick={handleSetDownstreamDirection}
                type="button"
              >
                Downstream
              </button>
              <button
                className={`${styles.directionToggleButton}${viewModel.impactDirection === "upstream" ? ` ${styles.directionToggleButtonActive}` : ""}`}
                onClick={handleSetUpstreamDirection}
                type="button"
              >
                Upstream
              </button>
            </div>
          </>
        ) : null}

        {viewModel.affectedBusinessFlows.length > 0 ? (
          <div className={styles.flowSummary}>
            <span className={styles.overline}>Affected flows:</span>
            {viewModel.affectedBusinessFlows.map((flowKey) => (
              <Badge color={FLOW_COLORS[flowKey] ?? "#475569"} key={flowKey}>
                {viewModel.businessFlows[flowKey]?.name ?? flowKey}
              </Badge>
            ))}
          </div>
        ) : null}
      </section>

      {viewModel.isGraphMode ? (
        <GraphCanvas
          affectedSet={viewModel.affectedSet}
          edges={viewModel.edges}
          getOwnershipKind={viewModel.getOwnershipKind}
          highlightKey={viewModel.highlightKey}
          layout={viewModel.layout}
          mode={viewModel.mode}
          onSelectService={viewModel.handleServiceClick}
          services={viewModel.services}
          visibleServices={viewModel.visibleServices}
        />
      ) : null}

      {viewModel.mode === "data" ? (
        <section className={styles.dataSection}>
          {viewModel.filteredDataFlows.length === 0 ? (
            <div className={styles.emptyState}>No data flows found for this filter.</div>
          ) : null}

          {viewModel.filteredDataFlows.map(([flowKey, dataFlow]) => {
            const isExpanded =
              viewModel.expandedDataFlow === flowKey || viewModel.selectedDataFlow === flowKey;

            return (
              <div className={styles.panel} key={flowKey} style={{ marginBottom: 12, overflow: "hidden" }}>
                <div
                  className={styles.panelHeader}
                  onClick={() => viewModel.setExpandedDataFlow(isExpanded ? null : flowKey)}
                >
                  <div className={styles.panelHeaderMain}>
                    <span className={styles.panelTitle}>{dataFlow.name}</span>
                    <Badge color={FLOW_COLORS[dataFlow.business_flow] ?? "#475569"}>
                      {viewModel.businessFlows[dataFlow.business_flow]?.name ??
                        dataFlow.business_flow}
                    </Badge>
                    <Tag>
                      {DATA_TYPE_ICONS[dataFlow.data_type] ?? "?"} {dataFlow.data_type}
                    </Tag>
                    <Tag color={SENSITIVITY_COLORS[dataFlow.sensitivity] ?? "#475569"}>
                      {dataFlow.sensitivity}
                    </Tag>
                    <Tag>{dataFlow.freshness}</Tag>
                    <Tag color="var(--tag-neutral)">{dataFlow.stages.length} stages</Tag>
                  </div>
                  <span className={`${styles.panelChevron}${isExpanded ? ` ${styles.panelChevronExpanded}` : ""}`}>
                    ▾
                  </span>
                </div>

                {isExpanded ? (
                  <div className={styles.panelBody}>
                    <div className={styles.panelDescription}>{dataFlow.description}</div>
                    <DataFlowPipeline
                      dataFlow={dataFlow}
                      onSelectService={viewModel.setSelectedService}
                      selectedService={viewModel.selectedService}
                      services={viewModel.services}
                    />
                    <div className={styles.tableScroll}>
                      <table className={styles.dataflowTable}>
                        <thead>
                          <tr className={styles.dataflowHeader}>
                            {["#", "Service", "Action", "Format", "Notes"].map((heading) => (
                              <th key={heading}>{heading}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dataFlow.stages.map((stage, index) => {
                            const subtype = getStageSubtypeLabel(stage);
                            return (
                              <tr
                                className={styles.dataflowRow}
                                key={`${stage.service}-${index}`}
                                onClick={() => viewModel.setSelectedService(stage.service)}
                              >
                                <td>{index + 1}</td>
                                <td className={styles.dataflowServiceCell}>
                                  {viewModel.services[stage.service]?.name ?? stage.service}
                                </td>
                                <td>
                                  <span
                                    className={styles.actionPill}
                                    style={{ "--action-color": ACTION_COLORS[stage.action] ?? "#475569" } as CSSProperties}
                                  >
                                    {subtype ? `${stage.action} · ${subtype}` : stage.action}
                                  </span>
                                </td>
                                <td className={styles.monoCell}>{stage.format}</td>
                                <td className={styles.mutedCell}>{stage.notes}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      ) : null}

      {viewModel.selectedServiceDetails && viewModel.isGraphMode && viewModel.mode === "impact" ? (
        <section className={`${styles.panel} ${styles.detailsPanel}`}>
          <div className={styles.detailsHeader}>
            <div>
              <div className={styles.detailsTitle}>{viewModel.selectedServiceDetails.name}</div>
              <div className={styles.detailsMeta}>
                {viewModel.selectedServiceDetails.type} · {viewModel.selectedServiceDetails.status} ·{" "}
                {viewModel.getOwnershipKind(viewModel.selectedServiceDetails)}
              </div>
            </div>
            <Badge color={viewModel.impactDirection === "downstream" ? "#dc2626" : "#2563eb"}>
              {viewModel.impactDirection === "downstream"
                ? `${viewModel.affectedSet.size - 1} downstream affected`
                : `${viewModel.affectedSet.size - 1} upstream deps`}
            </Badge>
          </div>

          {(viewModel.selectedServiceDetails.upstream?.length ?? 0) > 0 ? (
            <div className={styles.detailsSection}>
              <div className={styles.overline}>Direct dependencies</div>
              <div className={styles.tagRow}>
                {viewModel.selectedServiceDetails.upstream?.map((dependency) => (
                  <Tag
                    color={
                      dependency.criticality === "hard"
                        ? "var(--tag-critical)"
                        : "var(--tag-muted)"
                    }
                    key={`${viewModel.selectedService}-${dependency.service}`}
                  >
                    {dependency.service} ({dependency.protocol}, {dependency.criticality})
                  </Tag>
                ))}
              </div>
            </div>
          ) : null}

          {viewModel.affectedDataFlows.length > 0 ? (
            <div className={styles.detailsSection}>
              <div className={styles.overline}>Data flows through this service</div>
              <div className={styles.tagRow}>
                {viewModel.affectedDataFlows.map(([flowKey, dataFlow]) => (
                  <span
                    className={styles.linkTag}
                    key={flowKey}
                    onClick={() => {
                      viewModel.handleTabChange("data");
                      viewModel.setSelectedDataFlow(flowKey);
                      viewModel.setExpandedDataFlow(flowKey);
                    }}
                  >
                    {DATA_TYPE_ICONS[dataFlow.data_type] ?? "?"} {dataFlow.name}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {(() => {
            const svc = viewModel.selectedServiceDetails;
            const links: Array<{ label: string; href: string }> = [];
            if (svc?.runbook) links.push({ label: "Runbook", href: svc.runbook });
            if (svc?.health_check) links.push({ label: "Health check", href: svc.health_check });
            if (svc?.dashboard) links.push({ label: "Dashboard", href: svc.dashboard });
            if (svc?.on_call) links.push({ label: "On-call", href: svc.on_call });
            if (links.length === 0) return null;
            return (
              <div className={styles.detailsSection}>
                <div className={styles.overline}>On-call</div>
                <div className={styles.tagRow}>
                  {links.map(({ label, href }) => (
                    <a
                      className={styles.linkTag}
                      href={href}
                      key={label}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {label} ↗
                    </a>
                  ))}
                  {svc?.incident_channel ? (
                    <Tag>{svc.incident_channel}</Tag>
                  ) : null}
                  {svc?.slo ? (
                    <Tag>SLO {svc.slo}</Tag>
                  ) : null}
                </div>
              </div>
            );
          })()}
        </section>
      ) : null}

      <footer className={styles.footer}>
        {viewModel.mode !== "data"
          ? [
              ...STATUS_STYLE_ENTRIES.map(([status, style]) => (
                <button
                  className={`${styles.legendItem} ${styles.legendToggle}${viewModel.visibleStatusSet.has(status as ServiceStatus) ? "" : ` ${styles.legendToggleOff}`}`}
                  key={status}
                  onClick={() => viewModel.handleToggleStatus(status as ServiceStatus)}
                  type="button"
                >
                  <span
                    className={styles.legendSwatch}
                    style={{ "--legend-color": style.bg } as CSSProperties}
                  />
                  {status}
                </button>
              )),
              <button
                className={`${styles.legendItem} ${styles.legendToggle}${viewModel.visibleOwnershipSet.has("internal") ? "" : ` ${styles.legendToggleOff}`}`}
                key="internal-owner"
                onClick={() => viewModel.handleToggleOwnership("internal")}
                type="button"
              >
                <span className={`${styles.legendNodeSample} ${styles.legendNodeSampleInternal}`} />
                team-owned
              </button>,
              <button
                className={`${styles.legendItem} ${styles.legendToggle}${viewModel.visibleOwnershipSet.has("external") ? "" : ` ${styles.legendToggleOff}`}`}
                key="external-owner"
                onClick={() => viewModel.handleToggleOwnership("external")}
                type="button"
              >
                <span className={`${styles.legendNodeSample} ${styles.legendNodeSampleExternal}`} />
                external
              </button>,
              <span className={styles.legendItem} key="hard">
                <span className={styles.legendLine} />
                hard
              </span>,
              <span className={styles.legendItem} key="soft">
                <span className={`${styles.legendLine} ${styles.legendLineSoft}`} />
                soft
              </span>,
              ...TYPE_ICON_ENTRIES.map(([type, icon]) => (
                <button
                  className={`${styles.legendItem} ${styles.legendToggle}${viewModel.visibleTypeSet.has(type as ServiceType) ? "" : ` ${styles.legendToggleOff}`}`}
                  key={type}
                  onClick={() => viewModel.handleToggleType(type as ServiceType)}
                  type="button"
                >
                  {icon} {type}
                </button>
              )),
            ]
          : ACTION_COLOR_ENTRIES.map(([action, color]) => (
              <span className={styles.legendItem} key={action}>
                <span
                  className={styles.legendSwatch}
                  style={{ "--legend-color": color } as CSSProperties}
                />
                {action}
              </span>
            ))}
      </footer>
    </div>
  );
}
