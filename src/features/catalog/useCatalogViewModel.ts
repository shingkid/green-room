import { useCallback, useEffect, useMemo, useState } from "react";

import type { Edge, Node } from "@xyflow/react";
import type { ServiceEdgeData } from "@features/catalog/components/edges/ServiceEdge";

import {
  buildDataFlowMermaid,
  buildGraph,
  buildGraphMermaid,
  collectReachable,
  computeLayout,
  getAffectedDataFlows,
  slugify,
} from "@domain/catalog";
import {
  ALL_OWNERSHIP_KINDS,
  ALL_SERVICE_STATUSES,
  ALL_SERVICE_TYPES,
  GRAPH_MODES,
  type ImpactDirection,
  type Mode,
  type OwnershipKind,
  type Registry,
  type Service,
  type ServiceStatus,
  type ServiceType,
} from "@domain/registry";

function priorityRank(priority: string) {
  const match = /^P(\d+)$/.exec(priority.trim().toUpperCase());

  if (!match) {
    return Number.MAX_SAFE_INTEGER;
  }

  return Number.parseInt(match[1], 10);
}

function compareBusinessFlowEntries(
  left: [string, { name: string; priority: string }],
  right: [string, { name: string; priority: string }],
) {
  const priorityDelta = priorityRank(left[1].priority) - priorityRank(right[1].priority);

  if (priorityDelta !== 0) {
    return priorityDelta;
  }

  const nameDelta = left[1].name.localeCompare(right[1].name);

  if (nameDelta !== 0) {
    return nameDelta;
  }

  return left[0].localeCompare(right[0]);
}

export function useCatalogViewModel(registry: Registry) {
  const services = registry.services;
  const businessFlows = registry.business_flows;
  const dataFlows = registry.data_flows;
  const serviceEntries = useMemo(() => Object.entries(services), [services]);
  const businessFlowEntries = useMemo(() => Object.entries(businessFlows), [businessFlows]);
  const dataFlowEntries = useMemo(() => Object.entries(dataFlows), [dataFlows]);

  const [mode, setMode] = useState<Mode>("overview");
  const [impactDirection, setImpactDirection] = useState<ImpactDirection>("downstream");
  const [visibleStatuses, setVisibleStatuses] = useState<Set<ServiceStatus>>(
    () => new Set(ALL_SERVICE_STATUSES),
  );
  const [visibleTypes, setVisibleTypes] = useState<Set<ServiceType>>(
    () => new Set(ALL_SERVICE_TYPES),
  );
  const [visibleOwnershipKinds, setVisibleOwnershipKinds] = useState<Set<OwnershipKind>>(
    () => new Set(ALL_OWNERSHIP_KINDS),
  );
  const [selectedStakeholder, setSelectedStakeholder] = useState<string | null>(null);
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);
  const [selectedService, setSelectedService] = useState<string | null>(null);
  const [selectedDataFlow, setSelectedDataFlow] = useState<string | null>(null);
  const [expandedDataFlow, setExpandedDataFlow] = useState<string | null>(null);
  const [showHosting, setShowHosting] = useState(false);

  const graph = useMemo(() => buildGraph(services), [services]);
  const impactedServices = useMemo(() => {
    if (!selectedService) {
      return null;
    }

    return collectReachable(
      selectedService,
      impactDirection === "downstream" ? graph.downstream : graph.upstream,
    );
  }, [graph, impactDirection, selectedService]);
  const stakeholderOptions = useMemo(() => {
    const stakeholders = new Set<string>();

    for (const [, flow] of businessFlowEntries) {
      for (const stakeholder of flow.stakeholders) {
        stakeholders.add(stakeholder);
      }
    }

    return [...stakeholders]
      .sort((left, right) => left.localeCompare(right))
      .map((stakeholder) => ({
        label: stakeholder,
        value: stakeholder,
      }));
  }, [businessFlowEntries]);
  const eligibleFlowEntries = useMemo(
    () =>
      businessFlowEntries.filter(
        ([, flow]) => !selectedStakeholder || flow.stakeholders.includes(selectedStakeholder),
      ),
    [businessFlowEntries, selectedStakeholder],
  );
  const eligibleFlowKeys = useMemo(
    () => new Set(eligibleFlowEntries.map(([flowKey]) => flowKey)),
    [eligibleFlowEntries],
  );
  const businessFlowOptions = useMemo(
    () =>
      [...eligibleFlowEntries].sort(compareBusinessFlowEntries).map(([flowKey, flow]) => ({
        label: `${flow.name} (${flow.priority})`,
        searchText: `${flowKey} ${flow.description} ${flow.stakeholders.join(" ")}`,
        value: flowKey,
      })),
    [eligibleFlowEntries],
  );
  const dataBusinessFlowOptions = useMemo(
    () =>
      [...eligibleFlowEntries].sort(compareBusinessFlowEntries).map(([flowKey, flow]) => ({
        label: flow.name,
        searchText: `${flowKey} ${flow.description} ${flow.stakeholders.join(" ")}`,
        value: flowKey,
      })),
    [eligibleFlowEntries],
  );
  const serviceOptions = useMemo(
    () =>
      serviceEntries
        .map(([serviceKey, service]) => ({
          label: service.name,
          searchText: `${serviceKey} ${service.type} ${service.status} ${service.description}`,
          value: serviceKey,
        }))
        .sort((left, right) => left.label.localeCompare(right.label)),
    [serviceEntries],
  );
  const eligibleDataFlowEntries = useMemo(
    () =>
      dataFlowEntries.filter(
        ([, dataFlow]) =>
          eligibleFlowKeys.has(dataFlow.business_flow) &&
          (!selectedFlow || dataFlow.business_flow === selectedFlow),
      ),
    [dataFlowEntries, eligibleFlowKeys, selectedFlow],
  );
  const dataFlowOptions = useMemo(
    () =>
      eligibleDataFlowEntries.map(([flowKey, dataFlow]) => ({
        label: dataFlow.name,
        searchText: `${flowKey} ${dataFlow.description} ${dataFlow.data_type} ${dataFlow.sensitivity}`,
        value: flowKey,
      })),
    [eligibleDataFlowEntries],
  );
  const isGraphMode = GRAPH_MODES.includes(mode);
  const visibleStatusSet = visibleStatuses;
  const visibleTypeSet = visibleTypes;
  const visibleOwnershipSet = visibleOwnershipKinds;
  const getOwnershipKind = useCallback(
    (service: Service) => (service.owner === registry.metadata.team_id ? "internal" : "external"),
    [registry.metadata.team_id],
  );
  const isServiceVisibleInGraph = useCallback(
    (service: Service) =>
      visibleStatusSet.has(service.status) &&
      visibleTypeSet.has(service.type) &&
      visibleOwnershipSet.has(getOwnershipKind(service)),
    [getOwnershipKind, visibleOwnershipSet, visibleStatusSet, visibleTypeSet],
  );

  useEffect(() => {
    if (selectedFlow && !eligibleFlowKeys.has(selectedFlow)) {
      setSelectedFlow(null);
    }
  }, [eligibleFlowKeys, selectedFlow]);

  useEffect(() => {
    const validDataFlowKeys = new Set(eligibleDataFlowEntries.map(([flowKey]) => flowKey));

    // Data-flow choices depend on both stakeholder and business-flow filters, so clear stale
    // selections as soon as upstream filters make them invalid.
    if (selectedDataFlow && !validDataFlowKeys.has(selectedDataFlow)) {
      setSelectedDataFlow(null);
    }
  }, [eligibleDataFlowEntries, selectedDataFlow]);

  useEffect(() => {
    const service = selectedService ? services[selectedService] : null;

    if (service && isGraphMode && !isServiceVisibleInGraph(service)) {
      setSelectedService(null);
    }
  }, [isGraphMode, isServiceVisibleInGraph, selectedService, services]);

  const { affectedSet, highlightKey, visibleServices } = useMemo(() => {
    const allServices = new Set(
      serviceEntries
        .filter(([, service]) => isServiceVisibleInGraph(service))
        .map(([serviceKey]) => serviceKey),
    );

    if (mode === "flow") {
      const flowServices = new Set(
        serviceEntries
          .filter(([, service]) => {
            if (!isServiceVisibleInGraph(service)) {
              return false;
            }

            const flowKeys = service.business_flows ?? [];

            if (selectedFlow) {
              return flowKeys.includes(selectedFlow);
            }

            if (selectedStakeholder) {
              return flowKeys.some((flowKey) => eligibleFlowKeys.has(flowKey));
            }

            return true;
          })
          .map(([key]) => key),
      );

      return {
        affectedSet: flowServices,
        highlightKey: null,
        // Business Flow mode narrows the graph itself to the selected flow context rather than
        // merely highlighting matching services within the full topology.
        visibleServices: selectedFlow || selectedStakeholder ? flowServices : allServices,
      };
    }

    if (mode === "impact" && selectedService && impactedServices) {
      return {
        // Impact mode keeps the full visible graph on screen and uses affectedSet/highlightKey
        // to drive emphasis instead of removing unrelated services from the layout.
        affectedSet: impactedServices,
        highlightKey: selectedService,
        visibleServices: allServices,
      };
    }

    return {
      affectedSet: allServices,
      highlightKey: null,
      visibleServices: allServices,
    };
  }, [
    eligibleFlowKeys,
    impactedServices,
    mode,
    selectedFlow,
    selectedService,
    selectedStakeholder,
    serviceEntries,
    isServiceVisibleInGraph,
  ]);

  const [rfNodes, setRfNodes] = useState<Node[]>([]);

  useEffect(() => {
    let cancelled = false;
    computeLayout(visibleServices, services, graph, showHosting, registry.hosting).then(
      ({ rfNodes: nodes }) => {
        if (!cancelled) setRfNodes(nodes);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [graph, registry.hosting, services, showHosting, visibleServices]);

  const rfEdges = useMemo<Edge<ServiceEdgeData>[]>(() => {
    const result: Edge<ServiceEdgeData>[] = [];

    for (const [serviceKey, service] of serviceEntries) {
      for (const [index, dependency] of (service.upstream ?? []).entries()) {
        if (!visibleServices.has(serviceKey) || !visibleServices.has(dependency.service)) {
          continue;
        }
        const isActive = affectedSet.has(serviceKey) && affectedSet.has(dependency.service);
        result.push({
          id: `${serviceKey}:${index}:${dependency.service}`,
          source: dependency.service,
          target: serviceKey,
          type: "serviceEdge",
          data: {
            protocol: dependency.protocol,
            criticality: dependency.criticality,
            isActive,
            isDimmed: mode !== "overview" && !isActive,
          },
        });
      }
    }

    return result;
  }, [affectedSet, mode, serviceEntries, visibleServices]);

  const affectedBusinessFlows = useMemo(() => {
    if (!selectedService || mode === "overview" || mode === "data") {
      return [];
    }

    const affectedServices = impactedServices;
    if (!affectedServices) {
      return [];
    }
    const flowKeys = new Set<string>();

    for (const serviceKey of affectedServices) {
      for (const flowKey of services[serviceKey]?.business_flows ?? []) {
        flowKeys.add(flowKey);
      }
    }

    return [...flowKeys];
  }, [impactedServices, mode, selectedService, services]);

  const affectedDataFlows = useMemo(() => {
    if (!selectedService || mode === "data") {
      return [];
    }

    return getAffectedDataFlows(selectedService, dataFlows);
  }, [dataFlows, mode, selectedService]);

  const filteredDataFlows = useMemo(() => {
    let entries = eligibleDataFlowEntries;

    if (selectedDataFlow) {
      entries = entries.filter(([key]) => key === selectedDataFlow);
    }

    return entries;
  }, [eligibleDataFlowEntries, selectedDataFlow]);

  const selectedServiceDetails = selectedService ? services[selectedService] : null;
  const mermaidExport = useMemo(() => {
    const teamSlug = slugify(registry.metadata.team) || "green-room";
    const mermaidEdges = rfEdges.map((e) => ({
      from: e.source,
      to: e.target,
      protocol: e.data?.protocol,
      criticality: e.data?.criticality,
    }));

    if (mode === "overview") {
      return buildGraphMermaid({
        edges: mermaidEdges,
        filenameStem: `${teamSlug}-overview`,
        registry,
        serviceKeys: visibleServices,
        title: `${registry.metadata.team} overview`,
      });
    }

    if (mode === "impact") {
      if (!selectedService) {
        return null;
      }

      const selectedServiceName = services[selectedService]?.name ?? selectedService;
      const impactedServices = new Set(
        [...affectedSet].filter((serviceKey) => visibleServices.has(serviceKey)),
      );

      // Export only the reachable subgraph, even though the on-screen impact view keeps unrelated
      // nodes dimmed for context.
      return buildGraphMermaid({
        edges: mermaidEdges.filter(
          (edge) => impactedServices.has(edge.from) && impactedServices.has(edge.to),
        ),
        filenameStem: `${teamSlug}-impact-${slugify(selectedServiceName) || slugify(selectedService) || "service"}-${impactDirection}`,
        registry,
        serviceKeys: impactedServices,
        title: `${selectedServiceName} ${impactDirection} impact`,
      });
    }

    if (mode === "flow") {
      const flowLabel = selectedFlow
        ? (businessFlows[selectedFlow]?.name ?? selectedFlow)
        : selectedStakeholder
          ? `${selectedStakeholder} business flows`
          : "business flows";

      return buildGraphMermaid({
        edges: mermaidEdges,
        filenameStem: `${teamSlug}-flow-${slugify(flowLabel) || "all"}`,
        registry,
        serviceKeys: visibleServices,
        title: `${registry.metadata.team} ${flowLabel}`,
      });
    }

    const selectedDataFlowName = selectedDataFlow
      ? (dataFlows[selectedDataFlow]?.name ?? selectedDataFlow)
      : null;
    const lineageLabel =
      selectedDataFlowName ??
      (selectedFlow ? (businessFlows[selectedFlow]?.name ?? selectedFlow) : "data-lineage");

    // Data mode has no separate graph canvas, so export mirrors the currently visible expanded
    // filter result rather than any transient UI expansion state.
    return buildDataFlowMermaid({
      dataFlowEntries: filteredDataFlows,
      filenameStem: `${teamSlug}-lineage-${slugify(lineageLabel) || "all"}`,
      registry,
      title: `${registry.metadata.team} ${lineageLabel}`,
    });
  }, [
    affectedSet,
    businessFlows,
    dataFlows,
    filteredDataFlows,
    impactDirection,
    mode,
    registry,
    rfEdges,
    selectedDataFlow,
    selectedFlow,
    selectedService,
    selectedStakeholder,
    services,
    visibleServices,
  ]);

  const handleServiceClick = useCallback(
    (serviceKey: string) => {
      if (mode === "overview") {
        setMode("impact");
        setImpactDirection("downstream");
      }

      setSelectedService(serviceKey);
    },
    [mode],
  );

  const handleTabChange = useCallback((nextMode: Mode) => {
    setMode(nextMode);

    if (nextMode === "overview") {
      setSelectedStakeholder(null);
      setSelectedService(null);
      setSelectedFlow(null);
      setSelectedDataFlow(null);
    }

    if (nextMode === "data") {
      setSelectedDataFlow(null);
    }
  }, []);

  const handleToggleStatus = useCallback((status: ServiceStatus) => {
    setVisibleStatuses((currentStatuses) => {
      const nextStatuses = new Set(currentStatuses);

      if (nextStatuses.has(status)) {
        nextStatuses.delete(status);
      } else {
        nextStatuses.add(status);
      }

      return nextStatuses;
    });
  }, []);

  const handleToggleType = useCallback((type: ServiceType) => {
    setVisibleTypes((currentTypes) => {
      const nextTypes = new Set(currentTypes);

      if (nextTypes.has(type)) {
        nextTypes.delete(type);
      } else {
        nextTypes.add(type);
      }

      return nextTypes;
    });
  }, []);

  const handleToggleOwnership = useCallback((ownershipKind: OwnershipKind) => {
    setVisibleOwnershipKinds((currentKinds) => {
      const nextKinds = new Set(currentKinds);

      if (nextKinds.has(ownershipKind)) {
        nextKinds.delete(ownershipKind);
      } else {
        nextKinds.add(ownershipKind);
      }

      return nextKinds;
    });
  }, []);

  const handleToggleHosting = useCallback(() => {
    setShowHosting((prev) => !prev);
  }, []);

  return {
    affectedBusinessFlows,
    affectedDataFlows,
    affectedSet,
    businessFlowOptions,
    businessFlows,
    dataBusinessFlowOptions,
    dataFlowOptions,
    dataFlows,
    expandedDataFlow,
    filteredDataFlows,
    getOwnershipKind,
    handleServiceClick,
    handleTabChange,
    handleToggleHosting,
    handleToggleOwnership,
    handleToggleStatus,
    handleToggleType,
    highlightKey,
    impactDirection,
    isGraphMode,
    mermaidExport,
    mode,
    rfEdges,
    rfNodes,
    selectedDataFlow,
    selectedFlow,
    selectedService,
    selectedServiceDetails,
    selectedStakeholder,
    serviceOptions,
    services,
    setExpandedDataFlow,
    setImpactDirection,
    setSelectedDataFlow,
    setSelectedFlow,
    setSelectedService,
    setSelectedStakeholder,
    showHosting,
    stakeholderOptions,
    visibleOwnershipSet,
    visibleServices,
    visibleStatusSet,
    visibleTypeSet,
  };
}
