import { useState, useMemo, useCallback } from "react";
import REGISTRY from "./service_registry.yaml";

// ── Graph computation ──
function buildGraph(services) {
  const downstream = {};
  const upstream = {};
  Object.keys(services).forEach(k => { downstream[k] = []; upstream[k] = []; });
  Object.entries(services).forEach(([key, svc]) => {
    (svc.upstream || []).forEach(dep => {
      if (services[dep.service]) {
        downstream[dep.service] = downstream[dep.service] || [];
        downstream[dep.service].push({ service: key, ...dep });
        upstream[key].push(dep);
      }
    });
  });
  return { downstream, upstream };
}

function getBlastRadius(serviceKey, downstream, visited = new Set()) {
  visited.add(serviceKey);
  (downstream[serviceKey] || []).forEach(d => {
    if (!visited.has(d.service)) getBlastRadius(d.service, downstream, visited);
  });
  return visited;
}

function getUpstreamCauses(serviceKey, upstream, visited = new Set()) {
  visited.add(serviceKey);
  (upstream[serviceKey] || []).forEach(d => {
    if (!visited.has(d.service)) getUpstreamCauses(d.service, upstream, visited);
  });
  return visited;
}

// ── Layout: topological sort into layers ──
function computeLayout(serviceKeys, services, graph) {
  const keys = [...serviceKeys];
  const inDegree = {};
  keys.forEach(k => { inDegree[k] = 0; });
  keys.forEach(k => {
    (services[k]?.upstream || []).forEach(dep => {
      if (serviceKeys.has(dep.service)) inDegree[k]++;
    });
  });

  const layers = [];
  const placed = new Set();
  let remaining = new Set(keys);

  while (remaining.size > 0) {
    const layer = [...remaining].filter(k => inDegree[k] === 0);
    if (layer.length === 0) {
      layers.push([...remaining]);
      break;
    }
    layers.push(layer);
    layer.forEach(k => {
      placed.add(k);
      remaining.delete(k);
      (graph.downstream[k] || []).forEach(d => {
        if (remaining.has(d.service)) inDegree[d.service]--;
      });
    });
  }

  const positions = {};
  const nodeW = 140, nodeH = 56, gapX = 40, gapY = 80;
  const maxLayerWidth = Math.max(...layers.map(l => l.length));
  const totalWidth = Math.max(800, maxLayerWidth * (nodeW + gapX));

  layers.forEach((layer, li) => {
    const layerWidth = layer.length * (nodeW + gapX) - gapX;
    const offsetX = (totalWidth - layerWidth) / 2;
    layer.forEach((k, i) => {
      positions[k] = {
        x: offsetX + i * (nodeW + gapX),
        y: 60 + li * (nodeH + gapY),
      };
    });
  });

  const svgW = totalWidth + 40;
  const svgH = 60 + layers.length * (nodeH + gapY) + 40;
  return { positions, svgW, svgH, nodeW, nodeH };
}

// ── Colors & styles ──
const STATUS_COLORS = {
  active: { bg: "#16a34a", text: "#fff", border: "#15803d" },
  deprecated: { bg: "#d97706", text: "#fff", border: "#b45309" },
  migrating: { bg: "#2563eb", text: "#fff", border: "#1d4ed8" },
};

const TYPE_ICONS = {
  frontend: "◻",
  backend: "⚙",
  datastore: "⛁",
  infrastructure: "△",
};

const FLOW_COLORS = {
  research_search: "#8b5cf6",
  data_ingestion: "#06b6d4",
  report_generation: "#f59e0b",
  admin_monitoring: "#6b7280",
};

// ── Components ──
function ServiceNode({ id, svc, x, y, w, h, isHighlight, isAffected, isDimmed, onSelect }) {
  const status = STATUS_COLORS[svc.status] || STATUS_COLORS.active;
  const opacity = isDimmed ? 0.2 : 1;
  const strokeW = isHighlight ? 3 : isAffected ? 2 : 1;
  const stroke = isHighlight ? "#dc2626" : isAffected ? "#f97316" : status.border;
  const icon = TYPE_ICONS[svc.type] || "?";

  return (
    <g
      transform={`translate(${x}, ${y})`}
      opacity={opacity}
      style={{ cursor: "pointer" }}
      onClick={() => onSelect(id)}
    >
      <rect
        width={w} height={h} rx={svc.type === "datastore" ? 20 : svc.type === "frontend" ? 4 : 10}
        fill={status.bg} stroke={stroke} strokeWidth={strokeW}
      />
      <text x={w/2} y={h/2 - 6} textAnchor="middle" fill={status.text}
        fontSize="11" fontWeight="600" fontFamily="system-ui, sans-serif">
        {icon} {svc.name.length > 16 ? svc.name.slice(0, 15) + "…" : svc.name}
      </text>
      <text x={w/2} y={h/2 + 10} textAnchor="middle" fill="rgba(255,255,255,0.7)"
        fontSize="9" fontFamily="system-ui, sans-serif">
        {svc.status !== "active" ? svc.status.toUpperCase() : svc.type}
      </text>
    </g>
  );
}

function Edge({ x1, y1, x2, y2, protocol, criticality, isActive, isDimmed }) {
  const midY = (y1 + y2) / 2;
  const path = `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
  const opacity = isDimmed ? 0.08 : isActive ? 0.9 : 0.35;
  const dash = criticality === "soft" ? "4 3" : "none";
  const color = isActive ? "#f97316" : "#94a3b8";

  return (
    <g opacity={opacity}>
      <path d={path} fill="none" stroke={color} strokeWidth={isActive ? 2 : 1}
        strokeDasharray={dash} markerEnd="url(#arrow)" />
      {protocol && isActive && (
        <text x={(x1 + x2) / 2 + 8} y={midY - 4}
          fontSize="8" fill="#94a3b8" fontFamily="system-ui, sans-serif">
          {protocol}
        </text>
      )}
    </g>
  );
}

// ── Main App ──
export default function App() {
  const [mode, setMode] = useState("overview"); // overview | flow | blast | upstream
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [selectedService, setSelectedService] = useState(null);

  const graph = useMemo(() => buildGraph(REGISTRY.services), []);

  const { visibleServices, affectedSet, highlightKey } = useMemo(() => {
    const allKeys = new Set(Object.keys(REGISTRY.services));

    if (mode === "flow" && selectedFlow) {
      const keys = new Set(Object.keys(REGISTRY.services).filter(k =>
        (REGISTRY.services[k].business_flows || []).includes(selectedFlow)
      ));
      return { visibleServices: keys, affectedSet: keys, highlightKey: null };
    }

    if (mode === "blast" && selectedService) {
      const affected = getBlastRadius(selectedService, graph.downstream);
      return { visibleServices: allKeys, affectedSet: affected, highlightKey: selectedService };
    }

    if (mode === "upstream" && selectedService) {
      const causes = getUpstreamCauses(selectedService, graph.upstream);
      return { visibleServices: allKeys, affectedSet: causes, highlightKey: selectedService };
    }

    return { visibleServices: allKeys, affectedSet: allKeys, highlightKey: null };
  }, [mode, selectedFlow, selectedService, graph]);

  const layout = useMemo(
    () => computeLayout(visibleServices, REGISTRY.services, graph),
    [visibleServices, graph]
  );

  const edges = useMemo(() => {
    const result = [];
    Object.entries(REGISTRY.services).forEach(([key, svc]) => {
      (svc.upstream || []).forEach(dep => {
        if (visibleServices.has(key) && visibleServices.has(dep.service) &&
            layout.positions[key] && layout.positions[dep.service]) {
          result.push({
            from: dep.service, to: key,
            protocol: dep.protocol, criticality: dep.criticality,
            isActive: affectedSet.has(key) && affectedSet.has(dep.service),
          });
        }
      });
    });
    return result;
  }, [visibleServices, affectedSet, layout]);

  const handleServiceClick = useCallback((id) => {
    if (mode === "overview") {
      setMode("blast");
      setSelectedService(id);
    } else {
      setSelectedService(id);
    }
  }, [mode]);

  const affectedFlows = useMemo(() => {
    if (!selectedService || mode === "overview") return [];
    const affected = mode === "blast"
      ? getBlastRadius(selectedService, graph.downstream)
      : getUpstreamCauses(selectedService, graph.upstream);
    const flows = new Set();
    affected.forEach(k => {
      (REGISTRY.services[k]?.business_flows || []).forEach(f => flows.add(f));
    });
    return [...flows];
  }, [selectedService, mode, graph]);

  const svcDetail = selectedService ? REGISTRY.services[selectedService] : null;

  return (
    <div style={{ fontFamily: "'IBM Plex Sans', system-ui, sans-serif", background: "#0f172a", color: "#e2e8f0", minHeight: "100vh" }}>
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e293b", padding: "16px 20px" }}>
        <div style={{ fontSize: "15px", fontWeight: 600, letterSpacing: "-0.02em" }}>
          Service Dependency Explorer
        </div>
        <div style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}>
          Click any service to see blast radius • Powered by service_registry.yaml
        </div>
      </div>

      {/* Mode Tabs */}
      <div style={{ display: "flex", gap: 1, padding: "12px 20px 0", borderBottom: "1px solid #1e293b" }}>
        {[
          { key: "overview", label: "Overview" },
          { key: "blast", label: "Blast Radius" },
          { key: "upstream", label: "Upstream Causes" },
          { key: "flow", label: "Business Flow" },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => { setMode(tab.key); if (tab.key === "overview") { setSelectedService(null); setSelectedFlow(null); }}}
            style={{
              padding: "8px 16px", fontSize: "12px", fontWeight: 500, border: "none",
              borderBottom: mode === tab.key ? "2px solid #3b82f6" : "2px solid transparent",
              background: "none", color: mode === tab.key ? "#e2e8f0" : "#64748b",
              cursor: "pointer", fontFamily: "inherit",
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {mode === "flow" && (
          <div style={{ display: "flex", gap: 6 }}>
            {Object.entries(REGISTRY.business_flows).map(([fk, fv]) => (
              <button key={fk}
                onClick={() => setSelectedFlow(fk)}
                style={{
                  padding: "5px 12px", fontSize: "11px", borderRadius: 4, border: "none",
                  background: selectedFlow === fk ? FLOW_COLORS[fk] : "#1e293b",
                  color: "#fff", cursor: "pointer", fontFamily: "inherit", fontWeight: 500,
                }}>
                {fv.name}
              </button>
            ))}
          </div>
        )}

        {(mode === "blast" || mode === "upstream") && (
          <select
            value={selectedService || ""}
            onChange={e => setSelectedService(e.target.value || null)}
            style={{
              padding: "6px 10px", fontSize: "12px", borderRadius: 4,
              background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155",
              fontFamily: "inherit",
            }}>
            <option value="">Select a service…</option>
            {Object.entries(REGISTRY.services).map(([k, v]) => (
              <option key={k} value={k}>{v.name}</option>
            ))}
          </select>
        )}

        {/* Affected flows badge */}
        {affectedFlows.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginLeft: "auto", alignItems: "center" }}>
            <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Affected flows:
            </span>
            {affectedFlows.map(fk => (
              <span key={fk} style={{
                padding: "2px 8px", fontSize: "10px", borderRadius: 3,
                background: FLOW_COLORS[fk] || "#475569", color: "#fff", fontWeight: 500,
              }}>
                {REGISTRY.business_flows[fk]?.name || fk}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Graph */}
      <div style={{ padding: "0 20px", overflow: "auto" }}>
        <svg width={layout.svgW} height={layout.svgH} style={{ display: "block", margin: "0 auto" }}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5"
              markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
            </marker>
          </defs>

          {/* Edges */}
          {edges.map((e, i) => {
            const from = layout.positions[e.from];
            const to = layout.positions[e.to];
            if (!from || !to) return null;
            return (
              <Edge key={i}
                x1={from.x + layout.nodeW / 2} y1={from.y + layout.nodeH}
                x2={to.x + layout.nodeW / 2} y2={to.y}
                protocol={e.protocol} criticality={e.criticality}
                isActive={e.isActive}
                isDimmed={mode !== "overview" && !e.isActive}
              />
            );
          })}

          {/* Nodes */}
          {[...visibleServices].map(k => {
            const pos = layout.positions[k];
            if (!pos) return null;
            const svc = REGISTRY.services[k];
            const isHL = k === highlightKey;
            const isAff = affectedSet.has(k);
            const isDimmed = mode !== "overview" && !isAff;
            return (
              <ServiceNode key={k} id={k} svc={svc}
                x={pos.x} y={pos.y} w={layout.nodeW} h={layout.nodeH}
                isHighlight={isHL} isAffected={isAff} isDimmed={isDimmed}
                onSelect={handleServiceClick}
              />
            );
          })}
        </svg>
      </div>

      {/* Detail Panel */}
      {svcDetail && (mode === "blast" || mode === "upstream") && (
        <div style={{
          margin: "16px 20px", padding: "14px 18px", background: "#1e293b",
          borderRadius: 8, border: "1px solid #334155",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>{svcDetail.name}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: 2 }}>
                {svcDetail.type} · {svcDetail.status}
              </div>
            </div>
            <div style={{
              padding: "3px 10px", fontSize: "11px", borderRadius: 4, fontWeight: 600,
              background: mode === "blast" ? "#dc2626" : "#2563eb", color: "#fff",
            }}>
              {mode === "blast"
                ? `${affectedSet.size - 1} downstream affected`
                : `${affectedSet.size - 1} upstream dependencies`
              }
            </div>
          </div>

          {/* Upstream list */}
          {svcDetail.upstream?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                Direct dependencies
              </div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {svcDetail.upstream.map(dep => (
                  <span key={dep.service} style={{
                    padding: "2px 8px", fontSize: "10px", borderRadius: 3,
                    background: dep.criticality === "hard" ? "#991b1b" : "#44403c",
                    color: "#fef2f2", fontFamily: "'IBM Plex Mono', monospace",
                  }}>
                    {dep.service} ({dep.protocol}, {dep.criticality})
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{
        padding: "12px 20px", display: "flex", gap: 16, flexWrap: "wrap",
        borderTop: "1px solid #1e293b", fontSize: "10px", color: "#64748b",
      }}>
        {Object.entries(STATUS_COLORS).map(([k, v]) => (
          <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: v.bg, display: "inline-block" }} />
            {k}
          </span>
        ))}
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ borderBottom: "2px solid #94a3b8", width: 16, display: "inline-block" }} />
          hard dep
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ borderBottom: "2px dashed #94a3b8", width: 16, display: "inline-block" }} />
          soft dep
        </span>
        {Object.entries(TYPE_ICONS).map(([k, v]) => (
          <span key={k}>{v} {k}</span>
        ))}
      </div>
    </div>
  );
}
