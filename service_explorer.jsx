import { useState, useMemo, useCallback } from "react";
import REGISTRY from "./service_registry.yaml";

// ── Graph helpers ──
function buildGraph(services) {
  const downstream = {}, upstream = {};
  Object.keys(services).forEach(k => { downstream[k] = []; upstream[k] = []; });
  Object.entries(services).forEach(([key, svc]) => {
    (svc.upstream || []).forEach(dep => {
      if (services[dep.service]) {
        downstream[dep.service].push({ service: key, ...dep });
        upstream[key].push(dep);
      }
    });
  });
  return { downstream, upstream };
}

function getBlastRadius(key, downstream, visited = new Set()) {
  visited.add(key);
  (downstream[key] || []).forEach(d => { if (!visited.has(d.service)) getBlastRadius(d.service, downstream, visited); });
  return visited;
}

function getUpstreamCauses(key, upstream, visited = new Set()) {
  visited.add(key);
  (upstream[key] || []).forEach(d => { if (!visited.has(d.service)) getUpstreamCauses(d.service, upstream, visited); });
  return visited;
}

function getAffectedDataFlows(serviceKey, dataFlows) {
  return Object.entries(dataFlows).filter(([, df]) => df.stages.some(s => s.service === serviceKey));
}

// ── Layout ──
function computeLayout(serviceKeys, services, graph) {
  const keys = [...serviceKeys];
  const inDegree = {};
  keys.forEach(k => { inDegree[k] = 0; });
  keys.forEach(k => { (services[k]?.upstream || []).forEach(dep => { if (serviceKeys.has(dep.service)) inDegree[k]++; }); });
  const layers = [];
  let remaining = new Set(keys);
  while (remaining.size > 0) {
    const layer = [...remaining].filter(k => inDegree[k] === 0);
    if (layer.length === 0) { layers.push([...remaining]); break; }
    layers.push(layer);
    layer.forEach(k => { remaining.delete(k); (graph.downstream[k] || []).forEach(d => { if (remaining.has(d.service)) inDegree[d.service]--; }); });
  }
  const positions = {};
  const nodeW = 140, nodeH = 56, gapX = 40, gapY = 80;
  const maxLW = Math.max(...layers.map(l => l.length));
  const totalW = Math.max(800, maxLW * (nodeW + gapX));
  layers.forEach((layer, li) => {
    const lw = layer.length * (nodeW + gapX) - gapX;
    const ox = (totalW - lw) / 2;
    layer.forEach((k, i) => { positions[k] = { x: ox + i * (nodeW + gapX), y: 60 + li * (nodeH + gapY) }; });
  });
  return { positions, svgW: totalW + 40, svgH: 60 + layers.length * (nodeH + gapY) + 40, nodeW, nodeH };
}

// ── Colors ──
const STATUS = { active: { bg: "#16a34a", text: "#fff", border: "#15803d" }, deprecated: { bg: "#d97706", text: "#fff", border: "#b45309" }, migrating: { bg: "#2563eb", text: "#fff", border: "#1d4ed8" } };
const ACTION_COLORS = { produces: "#059669", transforms: "#7c3aed", stores: "#0369a1", indexes: "#0369a1", enriches: "#d97706", caches: "#64748b", serves: "#059669", consumes: "#dc2626" };
const TYPE_ICONS = { frontend: "◻", backend: "⚙", datastore: "⛁", infrastructure: "△" };
const FLOW_COLORS = { research_search: "#8b5cf6", data_ingestion: "#06b6d4", report_generation: "#f59e0b", admin_monitoring: "#6b7280" };
const DATA_TYPE_ICONS = { dataset: "📊", event: "⚡", metric: "📈", config: "⚙", auth_token: "🔑" };
const SENSITIVITY_COLORS = { public: "#22c55e", internal: "#3b82f6", confidential: "#f59e0b", restricted: "#ef4444" };

// ── Components ──
function ServiceNode({ id, svc, x, y, w, h, isHighlight, isAffected, isDimmed, onSelect }) {
  const s = STATUS[svc.status] || STATUS.active;
  const stroke = isHighlight ? "#dc2626" : isAffected ? "#f97316" : s.border;
  const icon = TYPE_ICONS[svc.type] || "?";
  return (
    <g transform={`translate(${x},${y})`} opacity={isDimmed ? 0.15 : 1} style={{ cursor: "pointer" }} onClick={() => onSelect(id)}>
      <rect width={w} height={h} rx={svc.type === "datastore" ? 20 : svc.type === "frontend" ? 4 : 10}
        fill={s.bg} stroke={stroke} strokeWidth={isHighlight ? 3 : isAffected ? 2 : 1} />
      <text x={w/2} y={h/2-6} textAnchor="middle" fill={s.text} fontSize="11" fontWeight="600" fontFamily="system-ui">{icon} {svc.name.length > 16 ? svc.name.slice(0,15)+"…" : svc.name}</text>
      <text x={w/2} y={h/2+10} textAnchor="middle" fill="rgba(255,255,255,0.7)" fontSize="9" fontFamily="system-ui">{svc.status !== "active" ? svc.status.toUpperCase() : svc.type}</text>
    </g>
  );
}

function SvcEdge({ x1, y1, x2, y2, protocol, criticality, isActive, isDimmed }) {
  const midY = (y1 + y2) / 2;
  const path = `M${x1},${y1} C${x1},${midY} ${x2},${midY} ${x2},${y2}`;
  return (
    <g opacity={isDimmed ? 0.06 : isActive ? 0.9 : 0.35}>
      <path d={path} fill="none" stroke={isActive ? "#f97316" : "#94a3b8"} strokeWidth={isActive ? 2 : 1}
        strokeDasharray={criticality === "soft" ? "4 3" : "none"} markerEnd="url(#arrow)" />
      {protocol && isActive && <text x={(x1+x2)/2+8} y={midY-4} fontSize="8" fill="#94a3b8" fontFamily="system-ui">{protocol}</text>}
    </g>
  );
}

function DataFlowPipeline({ df, selectedService, onSelectService }) {
  const stages = df.stages || [];
  const stageW = 130, stageH = 72, arrowW = 40, gap = 12;
  const totalW = stages.length * (stageW + arrowW + gap) - arrowW - gap;
  return (
    <div style={{ overflowX: "auto", padding: "8px 16px" }}>
      <svg width={Math.max(totalW + 40, 300)} height={stageH + 20} style={{ display: "block" }}>
        <defs><marker id="pipeArrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#475569"/></marker></defs>
        {stages.map((stage, i) => {
          const x = 20 + i * (stageW + arrowW + gap);
          const svc = REGISTRY.services[stage.service];
          const actionColor = ACTION_COLORS[stage.action] || "#64748b";
          const isHL = stage.service === selectedService;
          const name = svc?.name || stage.service;
          return (
            <g key={i}>
              <g style={{ cursor: "pointer" }} onClick={() => onSelectService(stage.service)}>
                <rect x={x} y={4} width={stageW} height={stageH} rx={8} fill={isHL ? "#1e293b" : "#0f172a"} stroke={isHL ? "#f97316" : "#334155"} strokeWidth={isHL ? 2 : 1}/>
                <rect x={x+4} y={8} width={stageW-8} height={16} rx={4} fill={actionColor} opacity={0.9}/>
                <text x={x+stageW/2} y={20} textAnchor="middle" fill="#fff" fontSize="9" fontWeight="600" fontFamily="system-ui">{stage.action.toUpperCase()}</text>
                <text x={x+stageW/2} y={42} textAnchor="middle" fill="#e2e8f0" fontSize="10" fontWeight="600" fontFamily="system-ui">{name.length > 18 ? name.slice(0,17)+"…" : name}</text>
                <text x={x+stageW/2} y={56} textAnchor="middle" fill="#64748b" fontSize="8" fontFamily="system-ui">{(stage.format||"").length > 20 ? stage.format.slice(0,19)+"…" : stage.format}</text>
              </g>
              {i < stages.length - 1 && <line x1={x+stageW+2} y1={4+stageH/2} x2={x+stageW+arrowW+gap-2} y2={4+stageH/2} stroke="#475569" strokeWidth={1.5} markerEnd="url(#pipeArrow)"/>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function Badge({ color, children, onClick }) {
  return <span onClick={onClick} style={{ padding: "2px 8px", fontSize: "10px", borderRadius: 3, background: color, color: "#fff", fontWeight: 500, whiteSpace: "nowrap", cursor: onClick ? "pointer" : "default" }}>{children}</span>;
}

function Tag({ children, color = "#334155" }) {
  return <span style={{ padding: "1px 6px", fontSize: "9px", borderRadius: 3, background: color, color: "#e2e8f0", fontFamily: "monospace", whiteSpace: "nowrap" }}>{children}</span>;
}

// ── Main App ──
export default function App() {
  const [mode, setMode] = useState("overview");
  const [selectedFlow, setSelectedFlow] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDataFlow, setSelectedDataFlow] = useState(null);
  const [expandedDF, setExpandedDF] = useState(null);

  const graph = useMemo(() => buildGraph(REGISTRY.services), []);

  const { visibleServices, affectedSet, highlightKey } = useMemo(() => {
    const allKeys = new Set(Object.keys(REGISTRY.services));
    if (mode === "flow" && selectedFlow) {
      const keys = new Set(Object.keys(REGISTRY.services).filter(k => (REGISTRY.services[k].business_flows || []).includes(selectedFlow)));
      return { visibleServices: keys, affectedSet: keys, highlightKey: null };
    }
    if (mode === "blast" && selectedService) return { visibleServices: allKeys, affectedSet: getBlastRadius(selectedService, graph.downstream), highlightKey: selectedService };
    if (mode === "upstream" && selectedService) return { visibleServices: allKeys, affectedSet: getUpstreamCauses(selectedService, graph.upstream), highlightKey: selectedService };
    return { visibleServices: allKeys, affectedSet: allKeys, highlightKey: null };
  }, [mode, selectedFlow, selectedService, graph]);

  const layout = useMemo(() => computeLayout(visibleServices, REGISTRY.services, graph), [visibleServices, graph]);

  const edges = useMemo(() => {
    const result = [];
    Object.entries(REGISTRY.services).forEach(([key, svc]) => {
      (svc.upstream || []).forEach(dep => {
        if (visibleServices.has(key) && visibleServices.has(dep.service) && layout.positions[key] && layout.positions[dep.service])
          result.push({ from: dep.service, to: key, protocol: dep.protocol, criticality: dep.criticality, isActive: affectedSet.has(key) && affectedSet.has(dep.service) });
      });
    });
    return result;
  }, [visibleServices, affectedSet, layout]);

  const affectedFlows = useMemo(() => {
    if (!selectedService || mode === "overview" || mode === "data") return [];
    const affected = mode === "blast" ? getBlastRadius(selectedService, graph.downstream) : getUpstreamCauses(selectedService, graph.upstream);
    const flows = new Set();
    affected.forEach(k => (REGISTRY.services[k]?.business_flows || []).forEach(f => flows.add(f)));
    return [...flows];
  }, [selectedService, mode, graph]);

  const affectedDataFlows = useMemo(() => {
    if (!selectedService || mode === "data") return [];
    return getAffectedDataFlows(selectedService, REGISTRY.data_flows);
  }, [selectedService, mode]);

  const handleServiceClick = useCallback((id) => {
    if (mode === "overview") setMode("blast");
    setSelectedService(id);
  }, [mode]);

  const filteredDataFlows = useMemo(() => {
    let entries = Object.entries(REGISTRY.data_flows);
    if (selectedDataFlow) entries = entries.filter(([k]) => k === selectedDataFlow);
    else if (selectedFlow && mode === "data") entries = entries.filter(([, df]) => df.business_flow === selectedFlow);
    return entries;
  }, [selectedDataFlow, selectedFlow, mode]);

  const svcDetail = selectedService ? REGISTRY.services[selectedService] : null;
  const isGraphMode = ["overview", "blast", "upstream", "flow"].includes(mode);

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, sans-serif", background: "#0f172a", color: "#e2e8f0", minHeight: "100vh" }}>
      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e293b", padding: "16px 20px" }}>
        <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.02em" }}>Service Dependency Explorer</div>
        <div style={{ fontSize: "11px", color: "#64748b", marginTop: 2 }}>Click a service for blast radius & affected data flows — powered by service_registry.yaml</div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 1, padding: "12px 20px 0", borderBottom: "1px solid #1e293b", overflowX: "auto" }}>
        {[
          { key: "overview", label: "Overview" },
          { key: "blast", label: "Blast Radius" },
          { key: "upstream", label: "Upstream Causes" },
          { key: "flow", label: "Business Flow" },
          { key: "data", label: "📊 Data Flows" },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => { setMode(tab.key); if (tab.key === "overview") { setSelectedService(null); setSelectedFlow(null); setSelectedDataFlow(null); } if (tab.key === "data") setSelectedDataFlow(null); }}
            style={{ padding: "8px 14px", fontSize: "12px", fontWeight: 500, border: "none", borderBottom: mode === tab.key ? "2px solid #3b82f6" : "2px solid transparent", background: "none", color: mode === tab.key ? "#e2e8f0" : "#64748b", cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Controls */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {mode === "flow" && (
          <select value={selectedFlow || ""} onChange={e => setSelectedFlow(e.target.value || null)}
            style={{ padding: "6px 10px", fontSize: "12px", borderRadius: 4, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", fontFamily: "inherit" }}>
            <option value="">All business flows</option>
            {Object.entries(REGISTRY.business_flows).map(([fk, fv]) => <option key={fk} value={fk}>{fv.name} ({fv.priority})</option>)}
          </select>
        )}
        {mode === "data" && (
          <>
            <select value={selectedFlow || ""} onChange={e => { setSelectedFlow(e.target.value || null); setSelectedDataFlow(null); }}
              style={{ padding: "6px 10px", fontSize: "12px", borderRadius: 4, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", fontFamily: "inherit" }}>
              <option value="">All business flows</option>
              {Object.entries(REGISTRY.business_flows).map(([fk, fv]) => <option key={fk} value={fk}>{fv.name}</option>)}
            </select>
            <select value={selectedDataFlow || ""} onChange={e => { setSelectedDataFlow(e.target.value || null); setExpandedDF(e.target.value || null); }}
              style={{ padding: "6px 10px", fontSize: "12px", borderRadius: 4, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", fontFamily: "inherit" }}>
              <option value="">All data flows</option>
              {Object.entries(REGISTRY.data_flows)
                .filter(([, df]) => !selectedFlow || df.business_flow === selectedFlow)
                .map(([dk, dv]) => <option key={dk} value={dk}>{dv.name}</option>)}
            </select>
          </>
        )}
        {(mode === "blast" || mode === "upstream") && (
          <select value={selectedService || ""} onChange={e => setSelectedService(e.target.value || null)}
            style={{ padding: "6px 10px", fontSize: "12px", borderRadius: 4, background: "#1e293b", color: "#e2e8f0", border: "1px solid #334155", fontFamily: "inherit" }}>
            <option value="">Select a service…</option>
            {Object.entries(REGISTRY.services).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}
          </select>
        )}
        {affectedFlows.length > 0 && (
          <div style={{ display: "flex", gap: 4, marginLeft: "auto", alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ fontSize: "10px", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Affected flows:</span>
            {affectedFlows.map(fk => <Badge key={fk} color={FLOW_COLORS[fk]}>{REGISTRY.business_flows[fk]?.name}</Badge>)}
          </div>
        )}
      </div>

      {/* Graph View */}
      {isGraphMode && (
        <div style={{ padding: "0 20px", overflow: "auto" }}>
          <svg width={layout.svgW} height={layout.svgH} style={{ display: "block", margin: "0 auto" }}>
            <defs><marker id="arrow" viewBox="0 0 10 10" refX="10" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8"/></marker></defs>
            {edges.map((e, i) => {
              const from = layout.positions[e.from], to = layout.positions[e.to];
              if (!from || !to) return null;
              return <SvcEdge key={i} x1={from.x+layout.nodeW/2} y1={from.y+layout.nodeH} x2={to.x+layout.nodeW/2} y2={to.y} protocol={e.protocol} criticality={e.criticality} isActive={e.isActive} isDimmed={mode!=="overview"&&!e.isActive}/>;
            })}
            {[...visibleServices].map(k => {
              const pos = layout.positions[k]; if (!pos) return null;
              return <ServiceNode key={k} id={k} svc={REGISTRY.services[k]} x={pos.x} y={pos.y} w={layout.nodeW} h={layout.nodeH}
                isHighlight={k===highlightKey} isAffected={affectedSet.has(k)} isDimmed={mode!=="overview"&&!affectedSet.has(k)} onSelect={handleServiceClick}/>;
            })}
          </svg>
        </div>
      )}

      {/* Data Flows View */}
      {mode === "data" && (
        <div style={{ padding: "0 20px 20px" }}>
          {filteredDataFlows.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: "#64748b" }}>No data flows found for this filter.</div>
          )}
          {filteredDataFlows.map(([dfKey, df]) => {
            const isExpanded = expandedDF === dfKey || selectedDataFlow === dfKey;
            const flowColor = FLOW_COLORS[df.business_flow] || "#475569";
            return (
              <div key={dfKey} style={{ marginBottom: 12, background: "#1e293b", borderRadius: 8, border: "1px solid #334155", overflow: "hidden" }}>
                <div onClick={() => setExpandedDF(isExpanded ? null : dfKey)}
                  style={{ padding: "12px 16px", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <span style={{ fontSize: "13px", fontWeight: 600 }}>{df.name}</span>
                    <Badge color={flowColor}>{REGISTRY.business_flows[df.business_flow]?.name}</Badge>
                    <Tag>{DATA_TYPE_ICONS[df.data_type] || "?"} {df.data_type}</Tag>
                    <Tag color={SENSITIVITY_COLORS[df.sensitivity]}>{df.sensitivity}</Tag>
                    <Tag>{df.freshness}</Tag>
                    <Tag color="#334155">{df.stages.length} stages</Tag>
                  </div>
                  <span style={{ fontSize: "16px", color: "#64748b", transition: "transform 0.2s", transform: isExpanded ? "rotate(180deg)" : "rotate(0)" }}>▾</span>
                </div>
                {isExpanded && (
                  <div style={{ borderTop: "1px solid #334155" }}>
                    <div style={{ padding: "8px 16px", fontSize: "11px", color: "#94a3b8" }}>{df.description}</div>
                    <DataFlowPipeline df={df} selectedService={selectedService} onSelectService={setSelectedService}/>
                    <div style={{ padding: "0 16px 12px", overflowX: "auto" }}>
                      <table style={{ width: "100%", fontSize: "10px", borderCollapse: "collapse" }}>
                        <thead>
                          <tr style={{ color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            {["#", "Service", "Action", "Format", "Notes"].map(h => (
                              <th key={h} style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid #334155" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {df.stages.map((stage, i) => (
                            <tr key={i} style={{ color: "#cbd5e1", cursor: "pointer" }}
                              onClick={() => setSelectedService(stage.service)}
                              onMouseOver={e => e.currentTarget.style.background="#0f172a"}
                              onMouseOut={e => e.currentTarget.style.background="transparent"}>
                              <td style={{ padding: "4px 8px", borderBottom: "1px solid #1e293b" }}>{i+1}</td>
                              <td style={{ padding: "4px 8px", borderBottom: "1px solid #1e293b", fontWeight: 600 }}>{REGISTRY.services[stage.service]?.name || stage.service}</td>
                              <td style={{ padding: "4px 8px", borderBottom: "1px solid #1e293b" }}>
                                <span style={{ padding: "1px 6px", borderRadius: 3, background: ACTION_COLORS[stage.action] || "#475569", color: "#fff", fontSize: "9px" }}>{stage.action}</span>
                              </td>
                              <td style={{ padding: "4px 8px", borderBottom: "1px solid #1e293b", fontFamily: "monospace" }}>{stage.format}</td>
                              <td style={{ padding: "4px 8px", borderBottom: "1px solid #1e293b", color: "#94a3b8" }}>{stage.notes}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Detail Panel */}
      {svcDetail && isGraphMode && (mode === "blast" || mode === "upstream") && (
        <div style={{ margin: "16px 20px", padding: "14px 18px", background: "#1e293b", borderRadius: 8, border: "1px solid #334155" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", gap: 8 }}>
            <div>
              <div style={{ fontSize: "14px", fontWeight: 600 }}>{svcDetail.name}</div>
              <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: 2 }}>{svcDetail.type} · {svcDetail.status}</div>
            </div>
            <Badge color={mode === "blast" ? "#dc2626" : "#2563eb"}>{mode === "blast" ? `${affectedSet.size-1} downstream affected` : `${affectedSet.size-1} upstream deps`}</Badge>
          </div>
          {svcDetail.upstream?.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Direct dependencies</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {svcDetail.upstream.map(dep => <Tag key={dep.service} color={dep.criticality === "hard" ? "#991b1b" : "#44403c"}>{dep.service} ({dep.protocol}, {dep.criticality})</Tag>)}
              </div>
            </div>
          )}
          {affectedDataFlows.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: "10px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Data flows through this service</div>
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {affectedDataFlows.map(([dfk, df]) => (
                  <span key={dfk} onClick={() => { setMode("data"); setSelectedDataFlow(dfk); setExpandedDF(dfk); }}
                    style={{ padding: "3px 10px", fontSize: "10px", borderRadius: 4, cursor: "pointer", background: "#0f172a", border: "1px solid #475569", color: "#e2e8f0", fontWeight: 500 }}>
                    {DATA_TYPE_ICONS[df.data_type]} {df.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{ padding: "12px 20px", display: "flex", gap: 12, flexWrap: "wrap", borderTop: "1px solid #1e293b", fontSize: "10px", color: "#64748b" }}>
        {mode !== "data" ? (
          <>
            {Object.entries(STATUS).map(([k, v]) => <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: v.bg }}/>{k}</span>)}
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ borderBottom: "2px solid #94a3b8", width: 16 }}/> hard</span>
            <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ borderBottom: "2px dashed #94a3b8", width: 16 }}/> soft</span>
            {Object.entries(TYPE_ICONS).map(([k, v]) => <span key={k}>{v} {k}</span>)}
          </>
        ) : (
          Object.entries(ACTION_COLORS).map(([k, v]) => <span key={k} style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: v }}/>{k}</span>)
        )}
      </div>
    </div>
  );
}