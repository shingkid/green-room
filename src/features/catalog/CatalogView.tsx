import { useCallback, type CSSProperties } from "react";

import {
  ACTION_COLORS,
  DATA_TYPE_ICONS,
  FLOW_COLORS,
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
import { downloadTextFile } from "../../shared/browser";
import { Badge } from "../../shared/components/Badge";
import { SearchableSelect } from "../../shared/components/SearchableSelect";
import { Tag } from "../../shared/components/Tag";
import { DataFlowPipeline } from "./components/DataFlowPipeline";
import { GraphCanvas } from "./components/GraphCanvas";
import { useCatalogViewModel } from "./useCatalogViewModel";

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

  const handleCopyMermaid = useCallback(async () => {
    if (!viewModel.mermaidExport) {
      return;
    }

    await navigator.clipboard.writeText(viewModel.mermaidExport.source);
  }, [viewModel.mermaidExport]);

  const handleDownloadMermaid = useCallback(() => {
    if (!viewModel.mermaidExport) {
      return;
    }

    downloadTextFile(viewModel.mermaidExport.filename, viewModel.mermaidExport.source);
  }, [viewModel.mermaidExport]);

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
              disabled={!viewModel.mermaidExport}
              onClick={handleDownloadMermaid}
              type="button"
            >
              Download .mmd
            </button>
            <button className="secondary-button" onClick={onEditRegistry} type="button">
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

      <nav className="app-tabs">
        {TABS.map((tab) => (
          <button
            className={`app-tab${viewModel.mode === tab.key ? " app-tab-active" : ""}`}
            key={tab.key}
            onClick={() => viewModel.handleTabChange(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="control-bar">
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
              onChange={(value) => {
                viewModel.setSelectedFlow(value);
                viewModel.setSelectedDataFlow(null);
              }}
              options={viewModel.dataBusinessFlowOptions}
              placeholder="Filter business flows"
              value={viewModel.selectedFlow}
            />
            <SearchableSelect
              allLabel="All data flows"
              ariaLabel="data flows"
              emptyMessage="No data flows match."
              onChange={(value) => {
                viewModel.setSelectedDataFlow(value);
                viewModel.setExpandedDataFlow(value);
              }}
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
            <div aria-label="impact direction" className="direction-toggle" role="group">
              <button
                className={`direction-toggle-button${viewModel.impactDirection === "downstream" ? " direction-toggle-button-active" : ""}`}
                onClick={() => viewModel.setImpactDirection("downstream")}
                type="button"
              >
                Downstream
              </button>
              <button
                className={`direction-toggle-button${viewModel.impactDirection === "upstream" ? " direction-toggle-button-active" : ""}`}
                onClick={() => viewModel.setImpactDirection("upstream")}
                type="button"
              >
                Upstream
              </button>
            </div>
          </>
        ) : null}

        {viewModel.affectedBusinessFlows.length > 0 ? (
          <div className="flow-summary">
            <span className="overline">Affected flows:</span>
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
        <section className="data-section">
          {viewModel.filteredDataFlows.length === 0 ? (
            <div className="empty-state">No data flows found for this filter.</div>
          ) : null}

          {viewModel.filteredDataFlows.map(([flowKey, dataFlow]) => {
            const isExpanded =
              viewModel.expandedDataFlow === flowKey || viewModel.selectedDataFlow === flowKey;

            return (
              <div className="panel" key={flowKey} style={{ marginBottom: 12, overflow: "hidden" }}>
                <div
                  className="panel-header"
                  onClick={() => viewModel.setExpandedDataFlow(isExpanded ? null : flowKey)}
                >
                  <div className="panel-header-main">
                    <span className="panel-title">{dataFlow.name}</span>
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
                  <span className={`panel-chevron${isExpanded ? " panel-chevron-expanded" : ""}`}>
                    ▾
                  </span>
                </div>

                {isExpanded ? (
                  <div className="panel-body">
                    <div className="panel-description">{dataFlow.description}</div>
                    <DataFlowPipeline
                      dataFlow={dataFlow}
                      onSelectService={viewModel.setSelectedService}
                      selectedService={viewModel.selectedService}
                      services={viewModel.services}
                    />
                    <div className="table-scroll">
                      <table className="dataflow-table">
                        <thead>
                          <tr className="dataflow-header">
                            {["#", "Service", "Action", "Format", "Notes"].map((heading) => (
                              <th key={heading}>{heading}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {dataFlow.stages.map((stage, index) => (
                            <tr
                              className="dataflow-row"
                              key={`${stage.service}-${index}`}
                              onClick={() => viewModel.setSelectedService(stage.service)}
                            >
                              <td>{index + 1}</td>
                              <td className="dataflow-service-cell">
                                {viewModel.services[stage.service]?.name ?? stage.service}
                              </td>
                              <td>
                                <span
                                  className="action-pill"
                                  style={{ "--action-color": ACTION_COLORS[stage.action] ?? "#475569" } as CSSProperties}
                                >
                                  {stage.action}
                                </span>
                              </td>
                              <td className="mono-cell">{stage.format}</td>
                              <td className="muted-cell">{stage.notes}</td>
                            </tr>
                          ))}
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
        <section className="panel details-panel">
          <div className="details-header">
            <div>
              <div className="details-title">{viewModel.selectedServiceDetails.name}</div>
              <div className="details-meta">
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
            <div className="details-section">
              <div className="overline">Direct dependencies</div>
              <div className="tag-row">
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
            <div className="details-section">
              <div className="overline">Data flows through this service</div>
              <div className="tag-row">
                {viewModel.affectedDataFlows.map(([flowKey, dataFlow]) => (
                  <span
                    className="link-tag"
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
        </section>
      ) : null}

      <footer className="app-footer">
        {viewModel.mode !== "data"
          ? [
              ...Object.entries(STATUS_STYLES).map(([status, style]) => (
                <button
                  className={`legend-item legend-toggle${viewModel.visibleStatusSet.has(status as ServiceStatus) ? "" : " legend-toggle-off"}`}
                  key={status}
                  onClick={() => viewModel.handleToggleStatus(status as ServiceStatus)}
                  type="button"
                >
                  <span
                    className="legend-swatch"
                    style={{ "--legend-color": style.bg } as CSSProperties}
                  />
                  {status}
                </button>
              )),
              <button
                className={`legend-item legend-toggle${viewModel.visibleOwnershipSet.has("internal") ? "" : " legend-toggle-off"}`}
                key="internal-owner"
                onClick={() => viewModel.handleToggleOwnership("internal")}
                type="button"
              >
                <span className="legend-node-sample legend-node-sample-internal" />
                team-owned
              </button>,
              <button
                className={`legend-item legend-toggle${viewModel.visibleOwnershipSet.has("external") ? "" : " legend-toggle-off"}`}
                key="external-owner"
                onClick={() => viewModel.handleToggleOwnership("external")}
                type="button"
              >
                <span className="legend-node-sample legend-node-sample-external" />
                external
              </button>,
              <span className="legend-item" key="hard">
                <span className="legend-line legend-line-hard" />
                hard
              </span>,
              <span className="legend-item" key="soft">
                <span className="legend-line legend-line-soft" />
                soft
              </span>,
              ...Object.entries(TYPE_ICONS).map(([type, icon]) => (
                <button
                  className={`legend-item legend-toggle${viewModel.visibleTypeSet.has(type as ServiceType) ? "" : " legend-toggle-off"}`}
                  key={type}
                  onClick={() => viewModel.handleToggleType(type as ServiceType)}
                  type="button"
                >
                  {icon} {type}
                </button>
              )),
            ]
          : Object.entries(ACTION_COLORS).map(([action, color]) => (
              <span className="legend-item" key={action}>
                <span
                  className="legend-swatch"
                  style={{ "--legend-color": color } as CSSProperties}
                />
                {action}
              </span>
            ))}
      </footer>
    </div>
  );
}
