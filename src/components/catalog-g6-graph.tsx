"use client";
import * as React from "react";
import { Maximize2, Plus, RotateCcw, Trash2, ZoomIn, ZoomOut } from "lucide-react";

interface PG { id: string; code: string; name: string }
interface PR { id: string; groupId: string | null; name: string; blockSystem: string | null; constructionTypeId: string | null }
interface CT { id: string; code: string; name: string }

interface Props {
  projectGroups: PG[];
  projects: PR[];
  constructionTypes: CT[];
}

interface MindNode {
  id: string;
  label: string;
  sub: string;
  unit: string;
  level: number;
  parentId: string | null;
  childIds: string[];
}

interface EditableTree {
  nodeMap: Map<string, MindNode>;
  rootIds: string[];
}

type GraphNodeData = MindNode & {
  count: number;
  collapsed: boolean;
  hasChildren: boolean;
  selected: boolean;
} & Record<string, unknown>;

interface GraphNode extends Record<string, unknown> {
  id: string;
  data: GraphNodeData;
  style: {
    x: number;
    y: number;
    size: number;
  };
}

interface GraphEdge {
  source: string;
  target: string;
}

interface GraphLike {
  destroy: () => void;
  fitView: () => Promise<void> | void;
  getZoom?: () => number;
  zoomTo?: (zoom: number) => void;
  setData: (data: { nodes: GraphNode[]; edges: GraphEdge[] }) => void;
  render: () => Promise<void>;
  getNodeData?: (id: string) => { data?: GraphNodeData; style?: { x?: number; y?: number } };
  on: (eventName: string, handler: (event: unknown) => void) => void;
}

type G6Datum = {
  data?: Partial<GraphNodeData>;
  style?: {
    x?: number;
    y?: number;
    size?: unknown;
  };
};

type G6NodeEvent = {
  itemId?: string;
  client?: { x: number; y: number };
};

interface TooltipState {
  x: number;
  y: number;
  data: GraphNodeData;
}

type ZoneKey = "B" | "T" | "N";

const LEVEL_LABELS = ["", "Project", "Type", "Item", "Block/System"];
const LEVEL_UNITS = ["", "types", "items", "blocks", ""];
const ZONE_META: Record<ZoneKey, { label: string; color: string; description: string }> = {
  B: { label: "Miền Bắc", color: "#ff1f2d", description: "Mã dự án bắt đầu bằng B" },
  T: { label: "Miền Trung", color: "#ffe70c", description: "Mã dự án bắt đầu bằng T" },
  N: { label: "Miền Nam", color: "#05a7e8", description: "Mã dự án bắt đầu bằng N" },
};

const LEVEL_COLORS: Record<number, string> = {
  1: "#ef4444",
  2: "#2563eb",
  3: "#059669",
  4: "#7c3aed",
};

function nodeSizeByLevel(level: number) {
  if (level === 1) return 74;
  if (level === 2) return 60;
  if (level === 3) return 52;
  return 44;
}

function nodeSize(d: G6Datum) {
  const size = d.style?.size;
  return typeof size === "number" ? size : 56;
}

function shortText(value: string, max: number) {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1))}...`;
}

function makeId(...parts: string[]) {
  return parts.map((part) => encodeURIComponent(part)).join("-");
}

function buildTree(projectGroups: PG[], projects: PR[], constructionTypes: CT[]): EditableTree {
  const ctById = new Map(constructionTypes.map((c) => [c.id, c]));
  const nodeMap = new Map<string, MindNode>();
  const rootIds: string[] = [];

  const addNode = (node: MindNode) => {
    nodeMap.set(node.id, node);
    return node.id;
  };

  for (const group of projectGroups) {
    const groupItems = projects.filter((p) => p.groupId === group.id);
    if (groupItems.length === 0) continue;

    const l1Id = makeId("L1", group.id);
    rootIds.push(l1Id);

    const ctMap = new Map<string, PR[]>();
    for (const project of groupItems) {
      const key = project.constructionTypeId ?? "__none__";
      if (!ctMap.has(key)) ctMap.set(key, []);
      ctMap.get(key)!.push(project);
    }

    addNode({
      id: l1Id,
      label: group.code,
      sub: group.name,
      unit: LEVEL_UNITS[1],
      level: 1,
      parentId: null,
      childIds: [],
    });

    for (const [ctId, ctItems] of ctMap.entries()) {
      const ct = ctId !== "__none__" ? ctById.get(ctId) : null;
      const l2Id = makeId("L2", group.id, ctId);
      nodeMap.get(l1Id)!.childIds.push(l2Id);

      const hmMap = new Map<string, PR[]>();
      for (const project of ctItems) {
        if (!hmMap.has(project.name)) hmMap.set(project.name, []);
        hmMap.get(project.name)!.push(project);
      }

      addNode({
        id: l2Id,
        label: ct ? ct.code : "Undefined",
        sub: ct ? ct.name : "Undefined",
        unit: LEVEL_UNITS[2],
        level: 2,
        parentId: l1Id,
        childIds: [],
      });

      for (const [hmName, hmItems] of hmMap.entries()) {
        const l3Id = makeId("L3", group.id, ctId, hmName);
        nodeMap.get(l2Id)!.childIds.push(l3Id);

        const blocks = [...new Set(hmItems.map((p) => p.blockSystem).filter(Boolean) as string[])];
        addNode({
          id: l3Id,
          label: hmName,
          sub: hmName,
          unit: LEVEL_UNITS[3],
          level: 3,
          parentId: l2Id,
          childIds: [],
        });

        for (const blockName of blocks) {
          const l4Id = makeId("L4", group.id, ctId, hmName, blockName);
          nodeMap.get(l3Id)!.childIds.push(l4Id);
          addNode({
            id: l4Id,
            label: blockName,
            sub: blockName,
            unit: LEVEL_UNITS[4],
            level: 4,
            parentId: l3Id,
            childIds: [],
          });
        }
      }
    }
  }

  return { nodeMap, rootIds };
}

function cloneTree(tree: EditableTree): EditableTree {
  return {
    rootIds: [...tree.rootIds],
    nodeMap: new Map([...tree.nodeMap.entries()].map(([id, node]) => [id, { ...node, childIds: [...node.childIds] }])),
  };
}

function descendantIds(id: string, nodeMap: Map<string, MindNode>) {
  const result: string[] = [];
  const visit = (nodeId: string) => {
    const node = nodeMap.get(nodeId);
    if (!node) return;
    for (const childId of node.childIds) {
      result.push(childId);
      visit(childId);
    }
  };
  visit(id);
  return result;
}

function collapsedAllRoots(nodeMap: Map<string, MindNode>, rootIds: string[]) {
  const collapsed = new Set<string>();
  for (const rootId of rootIds) {
    collapsed.add(rootId);
    for (const childId of descendantIds(rootId, nodeMap)) collapsed.add(childId);
  }
  return collapsed;
}

function collapsedWithOpenRoot(nodeMap: Map<string, MindNode>, rootIds: string[], openRootId: string) {
  const collapsed = collapsedAllRoots(nodeMap, rootIds);
  collapsed.delete(openRootId);
  for (const childId of descendantIds(openRootId, nodeMap)) collapsed.add(childId);
  return collapsed;
}

function buildVisibleGraph(
  tree: EditableTree,
  rootIds: string[],
  collapsedIds: Set<string>,
  selectedId: string | null,
  manualPositions: Map<string, { x: number; y: number }>,
) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const visibleIds = new Set<string>();
  const yById = new Map<string, number>();
  const xById = new Map<string, number>();
  let cursorY = 54;

  const isVisibleLeaf = (id: string) => {
    const node = tree.nodeMap.get(id);
    return !node || node.childIds.length === 0 || collapsedIds.has(id);
  };

  const measure = (id: string): number => {
    const node = tree.nodeMap.get(id);
    if (!node) return 0;
    visibleIds.add(id);

    if (isVisibleLeaf(id)) {
      yById.set(id, cursorY);
      xById.set(id, 120 + (node.level - 1) * 180);
      cursorY += node.level >= 4 ? 76 : 58;
      return yById.get(id)!;
    }

    const childYs = node.childIds.map(measure);
    const y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    yById.set(id, y);
    xById.set(id, 120 + (node.level - 1) * 180);
    return y;
  };

  for (const rootId of rootIds) {
    measure(rootId);
    cursorY += 30;
  }

  for (const id of visibleIds) {
    const node = tree.nodeMap.get(id);
    if (!node) continue;
    const hasChildren = node.childIds.length > 0;
    const manual = manualPositions.get(id);
    nodes.push({
      id,
      data: {
        ...node,
        count: node.childIds.length,
        collapsed: collapsedIds.has(id),
        hasChildren,
        selected: selectedId === id,
      },
      style: {
        x: manual?.x ?? xById.get(id) ?? 0,
        y: manual?.y ?? yById.get(id) ?? 0,
        size: nodeSizeByLevel(node.level),
      },
    });

    if (!collapsedIds.has(id)) {
      for (const childId of node.childIds) {
        if (!visibleIds.has(childId)) continue;
        edges.push({ source: id, target: childId });
      }
    }
  }

  return { nodes, edges };
}

function firstVisibleParent(id: string, tree: EditableTree) {
  return tree.nodeMap.get(id)?.parentId ?? null;
}

export function CatalogG6Graph({ projectGroups, projects, constructionTypes }: Props) {
  const initialTree = React.useMemo(
    () => buildTree(projectGroups, projects, constructionTypes),
    [projectGroups, projects, constructionTypes],
  );
  const initialCollapsed = React.useMemo(
    () => collapsedAllRoots(initialTree.nodeMap, initialTree.rootIds),
    [initialTree],
  );

  const containerRef = React.useRef<HTMLDivElement>(null);
  const graphRef = React.useRef<GraphLike | null>(null);
  const treeRef = React.useRef<EditableTree>(initialTree);
  const collapsedIdsRef = React.useRef<Set<string>>(initialCollapsed);
  const activeRootIdsRef = React.useRef<string[]>(initialTree.rootIds);
  const selectedIdRef = React.useRef<string | null>(null);
  const manualPositionsRef = React.useRef<Map<string, { x: number; y: number }>>(new Map());
  const idCounterRef = React.useRef(0);

  const [tree, setTree] = React.useState<EditableTree>(() => initialTree);
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(() => initialCollapsed);
  const [activeRootIds, setActiveRootIds] = React.useState<string[]>(() => initialTree.rootIds);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [tooltip, setTooltip] = React.useState<TooltipState | null>(null);
  const [containerWidth, setContainerWidth] = React.useState(400);
  const [selectedZone, setSelectedZone] = React.useState<ZoneKey | null>(null);

  React.useEffect(() => {
    const nextTree = buildTree(projectGroups, projects, constructionTypes);
    const nextCollapsed = collapsedAllRoots(nextTree.nodeMap, nextTree.rootIds);
    manualPositionsRef.current = new Map();
    treeRef.current = nextTree;
    collapsedIdsRef.current = nextCollapsed;
    activeRootIdsRef.current = nextTree.rootIds;
    selectedIdRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTree(nextTree);
    setCollapsedIds(nextCollapsed);
    setActiveRootIds(nextTree.rootIds);
    setSelectedId(null);
    setSelectedZone(null);
  }, [projectGroups, projects, constructionTypes]);

  React.useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    setContainerWidth(container.clientWidth || 400);
    let cancelled = false;
    let graph: GraphLike | null = null;

    import("@antv/g6").then((G6) => {
      if (cancelled) return;

      graph = new G6.Graph({
        container,
        autoFit: "view",
        padding: [36, 64, 36, 36],
        data: { nodes: [], edges: [] },
        node: {
          type: "circle",
          style: {
            x: (d: G6Datum) => d.style?.x ?? 0,
            y: (d: G6Datum) => d.style?.y ?? 0,
            size: (d: G6Datum) => nodeSize(d),
            fill: (d: G6Datum) => LEVEL_COLORS[d.data?.level ?? 4] ?? "#64748b",
            fillOpacity: (d: G6Datum) => (d.data?.selected ? 0.98 : 0.88),
            stroke: (d: G6Datum) => {
              if (d.data?.selected) return "#0f172a";
              return "#ffffff";
            },
            lineWidth: (d: G6Datum) => (d.data?.selected ? 4 : 2),
            shadowColor: (d: G6Datum) => LEVEL_COLORS[d.data?.level ?? 4] ?? "#64748b",
            shadowBlur: (d: G6Datum) => (d.data?.selected ? 18 : 10),
            shadowOffsetX: 0,
            shadowOffsetY: 4,
            cursor: "pointer",
            labelText: (d: G6Datum) => {
              const label = d.data?.label ?? "";
              const count = d.data?.count ?? 0;
              const collapsed = d.data?.collapsed;
              if (collapsed && count > 0) return `${shortText(label, 10)}\n+${count}`;
              return shortText(label, d.data?.level === 1 ? 10 : 8);
            },
            labelFill: "#ffffff",
            labelFontSize: (d: G6Datum) => (d.data?.level === 1 ? 11 : 10),
            labelFontWeight: 700,
            labelFontFamily: "ui-sans-serif, system-ui, sans-serif",
            labelTextAlign: "center",
            labelTextBaseline: "middle",
            labelWordWrap: true,
            labelMaxWidth: (d: G6Datum) => {
              const size = nodeSize(d);
              return Math.max(30, size * 0.78);
            },
            labelLineHeight: 12,
            labelPlacement: "center",
            badges: (d: G6Datum) => {
              const count = d.data?.count ?? 0;
              if (!d.data?.hasChildren || count <= 0) return [];
              return [{
                text: d.data?.collapsed ? String(count) : "-",
                placement: "right",
                offsetX: 8,
                fill: "#ffffff",
                stroke: "#111827",
                lineWidth: 1,
                fontSize: 9,
                fillOpacity: 1,
                padding: [1, 4],
              }];
            },
          } as never,
        },
        edge: {
          type: "line",
          style: {
            stroke: "#94a3b8",
            lineWidth: 1.5,
            strokeOpacity: 0.7,
            endArrow: false,
          },
        },
        layout: {
          type: "d3-force",
          preventOverlap: true,
          nodeSize: (d: G6Datum) => nodeSize(d) + 18,
          linkDistance: (edge: { source?: { data?: Partial<GraphNodeData> } }) => {
            const sourceLevel = edge.source?.data?.level ?? 1;
            if (sourceLevel === 1) return 180;
            if (sourceLevel === 2) return 140;
            return 105;
          },
          nodeStrength: (d: G6Datum) => (d.data?.level === 1 ? -900 : -520),
          edgeStrength: 0.42,
          collideStrength: 1,
          alpha: 0.9,
          alphaMin: 0.001,
          alphaDecay: 0.028,
          velocityDecay: 0.32,
          iterations: 360,
        },
        behaviors: ["zoom-canvas", "drag-canvas", "drag-element"],
        animation: true,
      }) as unknown as GraphLike;
      const activeGraph = graph;

      activeGraph.on("node:click", (evt: unknown) => {
        const id = (evt as G6NodeEvent).itemId;
        if (!id) return;
        const currentTree = treeRef.current;
        const node = currentTree.nodeMap.get(id);
        if (!node) return;

        selectedIdRef.current = id;
        setSelectedId(id);

        if (node.childIds.length === 0) return;
        let nextCollapsed: Set<string>;
        if (node.level === 1) {
          nextCollapsed = collapsedIdsRef.current.has(id)
            ? collapsedWithOpenRoot(currentTree.nodeMap, activeRootIdsRef.current, id)
            : collapsedAllRoots(currentTree.nodeMap, activeRootIdsRef.current);
        } else if (collapsedIdsRef.current.has(id)) {
          nextCollapsed = new Set(collapsedIdsRef.current);
          nextCollapsed.delete(id);
        } else {
          nextCollapsed = new Set(collapsedIdsRef.current);
          nextCollapsed.add(id);
          for (const childId of descendantIds(id, currentTree.nodeMap)) nextCollapsed.add(childId);
        }
        collapsedIdsRef.current = nextCollapsed;
        setCollapsedIds(nextCollapsed);
      });

      activeGraph.on("node:dragend", (evt: unknown) => {
        const id = (evt as G6NodeEvent).itemId;
        if (!id) return;
        const nodeData = activeGraph.getNodeData?.(id);
        const x = nodeData?.style?.x;
        const y = nodeData?.style?.y;
        if (typeof x === "number" && typeof y === "number") {
          manualPositionsRef.current.set(id, { x, y });
        }
      });

      activeGraph.on("node:pointerenter", (evt: unknown) => {
        const event = evt as G6NodeEvent;
        const id = event.itemId;
        if (!id || !event.client) return;
        const nodeData = activeGraph.getNodeData?.(id)?.data;
        if (!nodeData) return;
        const canvasRect = container.getBoundingClientRect();
        setTooltip({
          x: event.client.x - canvasRect.left,
          y: event.client.y - canvasRect.top,
          data: nodeData,
        });
      });

      activeGraph.on("node:pointerleave", () => setTooltip(null));
      activeGraph.on("canvas:click", () => setTooltip(null));

      graphRef.current = activeGraph;
    });

    return () => {
      cancelled = true;
      setTooltip(null);
      if (graph) {
        try { graph.destroy(); } catch { /* ignore */ }
      }
      if (graphRef.current) {
        try { graphRef.current.destroy(); } catch { /* ignore */ }
        graphRef.current = null;
      }
    };
  }, []);

  React.useEffect(() => {
    treeRef.current = tree;
    collapsedIdsRef.current = collapsedIds;
    activeRootIdsRef.current = activeRootIds;
    selectedIdRef.current = selectedId;
    const graph = graphRef.current;
    if (!graph) return;

    graph.setData(buildVisibleGraph(tree, activeRootIds, collapsedIds, selectedId, manualPositionsRef.current));
    graph.render().then(() => {
      graph.fitView();
    });
  }, [tree, activeRootIds, collapsedIds, selectedId]);

  const selectedNode = selectedId ? tree.nodeMap.get(selectedId) ?? null : null;

  const selectZone = React.useCallback((zone: ZoneKey) => {
    const currentTree = treeRef.current;
    const nextRootIds = projectGroups
      .filter((group) => group.code.trim().toUpperCase().startsWith(zone))
      .map((group) => makeId("L1", group.id))
      .filter((rootId) => currentTree.nodeMap.has(rootId));
    const nextCollapsed = collapsedAllRoots(currentTree.nodeMap, nextRootIds);
    activeRootIdsRef.current = nextRootIds;
    collapsedIdsRef.current = nextCollapsed;
    selectedIdRef.current = null;
    manualPositionsRef.current = new Map();
    setSelectedZone(zone);
    setActiveRootIds(nextRootIds);
    setCollapsedIds(nextCollapsed);
    setSelectedId(null);
  }, [projectGroups]);

  const showAllRoots = React.useCallback(() => {
    const currentTree = treeRef.current;
    const nextCollapsed = collapsedAllRoots(currentTree.nodeMap, currentTree.rootIds);
    activeRootIdsRef.current = currentTree.rootIds;
    collapsedIdsRef.current = nextCollapsed;
    selectedIdRef.current = null;
    manualPositionsRef.current = new Map();
    setSelectedZone(null);
    setActiveRootIds(currentTree.rootIds);
    setCollapsedIds(nextCollapsed);
    setSelectedId(null);
  }, []);

  const updateSelectedNode = React.useCallback((patch: Partial<Pick<MindNode, "label" | "sub">>) => {
    const id = selectedIdRef.current;
    if (!id) return;
    setTree((prev) => {
      const next = cloneTree(prev);
      const node = next.nodeMap.get(id);
      if (!node) return prev;
      next.nodeMap.set(id, { ...node, ...patch });
      return next;
    });
  }, []);

  const addRoot = React.useCallback(() => {
    const id = `U-root-${Date.now()}-${idCounterRef.current++}`;
    setTree((prev) => {
      const next = cloneTree(prev);
      next.rootIds.push(id);
      next.nodeMap.set(id, {
        id,
        label: "New project",
        sub: "New project",
        unit: LEVEL_UNITS[1],
        level: 1,
        parentId: null,
        childIds: [],
      });
      return next;
    });
    setSelectedId(id);
    selectedIdRef.current = id;
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      collapsedIdsRef.current = next;
      return next;
    });
  }, []);

  const addChild = React.useCallback(() => {
    const parentId = selectedIdRef.current;
    if (!parentId) return;
    setTree((prev) => {
      const next = cloneTree(prev);
      const parent = next.nodeMap.get(parentId);
      if (!parent) return prev;
      const childLevel = parent.level + 1;
      const childId = `U-${Date.now()}-${idCounterRef.current++}`;
      const child: MindNode = {
        id: childId,
        label: `New node ${parent.childIds.length + 1}`,
        sub: `New node ${parent.childIds.length + 1}`,
        unit: LEVEL_UNITS[childLevel] ?? "children",
        level: childLevel,
        parentId,
        childIds: [],
      };
      next.nodeMap.set(parentId, { ...parent, childIds: [...parent.childIds, childId] });
      next.nodeMap.set(childId, child);
      selectedIdRef.current = childId;
      setSelectedId(childId);
      setCollapsedIds((prevCollapsed) => {
        const openParent = new Set(prevCollapsed);
        openParent.delete(parentId);
        collapsedIdsRef.current = openParent;
        return openParent;
      });
      return next;
    });
  }, []);

  const deleteSelected = React.useCallback(() => {
    const id = selectedIdRef.current;
    if (!id) return;
    setTree((prev) => {
      const next = cloneTree(prev);
      const node = next.nodeMap.get(id);
      if (!node) return prev;
      const idsToDelete = [id, ...descendantIds(id, next.nodeMap)];
      for (const deleteId of idsToDelete) {
        next.nodeMap.delete(deleteId);
        manualPositionsRef.current.delete(deleteId);
      }
      if (node.parentId) {
        const parent = next.nodeMap.get(node.parentId);
        if (parent) {
          next.nodeMap.set(node.parentId, { ...parent, childIds: parent.childIds.filter((childId) => childId !== id) });
        }
      } else {
        next.rootIds = next.rootIds.filter((rootId) => rootId !== id);
      }
      const nextSelectedId = firstVisibleParent(id, prev);
      selectedIdRef.current = nextSelectedId;
      setSelectedId(nextSelectedId);
      setCollapsedIds((prevCollapsed) => {
        const nextCollapsed = new Set(prevCollapsed);
        idsToDelete.forEach((deleteId) => nextCollapsed.delete(deleteId));
        collapsedIdsRef.current = nextCollapsed;
        return nextCollapsed;
      });
      return next;
    });
  }, []);

  const collapseAll = React.useCallback(() => {
    const nextCollapsed = collapsedAllRoots(treeRef.current.nodeMap, activeRootIdsRef.current);
    collapsedIdsRef.current = nextCollapsed;
    setCollapsedIds(nextCollapsed);
  }, []);

  const expandSelectedRoot = React.useCallback(() => {
    const id = selectedIdRef.current;
    const currentTree = treeRef.current;
    const selected = id ? currentTree.nodeMap.get(id) : null;
    const rootId = selected?.level === 1
      ? selected.id
      : selected?.parentId
        ? currentTree.nodeMap.get(selected.parentId)?.parentId ?? selected.parentId
        : activeRootIdsRef.current[0];
    if (!rootId) return;
    const nextCollapsed = collapsedWithOpenRoot(currentTree.nodeMap, activeRootIdsRef.current, rootId);
    collapsedIdsRef.current = nextCollapsed;
    setCollapsedIds(nextCollapsed);
  }, []);

  const fitView = React.useCallback(() => graphRef.current?.fitView(), []);
  const zoomIn = React.useCallback(() => {
    const z = graphRef.current?.getZoom?.() ?? 1;
    graphRef.current?.zoomTo?.(z * 1.25);
  }, []);
  const zoomOut = React.useCallback(() => {
    const z = graphRef.current?.getZoom?.() ?? 1;
    graphRef.current?.zoomTo?.(z * 0.8);
  }, []);
  const resetPositions = React.useCallback(() => {
    manualPositionsRef.current = new Map();
    graphRef.current?.setData(buildVisibleGraph(treeRef.current, activeRootIdsRef.current, collapsedIdsRef.current, selectedIdRef.current, manualPositionsRef.current));
    graphRef.current?.render().then(() => graphRef.current?.fitView());
  }, []);

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
      style={{ height: "calc(100vh - 300px)", minHeight: 500 }}
    >
      <div className="absolute left-3 top-3 z-10 flex max-w-[360px] flex-col gap-2 rounded-lg border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
          <div className="relative h-[220px] overflow-hidden rounded border border-slate-200 bg-sky-50">
            <div
              role="img"
              aria-label="Vietnam project zones"
              className="h-full w-full bg-cover bg-center"
              style={{ backgroundImage: "url('/vietnam-region-map.png')" }}
            />
            <button
              type="button"
              aria-label="Lọc dự án miền Bắc mã B"
              onClick={() => selectZone("B")}
              className="absolute left-[2%] top-[3%] h-[23%] w-[96%] rounded outline-none ring-offset-2 hover:ring-2 hover:ring-red-500 focus-visible:ring-2 focus-visible:ring-red-500"
            />
            <button
              type="button"
              aria-label="Lọc dự án miền Trung mã T"
              onClick={() => selectZone("T")}
              className="absolute left-[25%] top-[25%] h-[25%] w-[72%] rounded outline-none ring-offset-2 hover:ring-2 hover:ring-yellow-400 focus-visible:ring-2 focus-visible:ring-yellow-400"
            />
            <button
              type="button"
              aria-label="Lọc dự án miền Nam mã N"
              onClick={() => selectZone("N")}
              className="absolute left-[32%] top-[49%] h-[48%] w-[56%] rounded outline-none ring-offset-2 hover:ring-2 hover:ring-sky-500 focus-visible:ring-2 focus-visible:ring-sky-500"
            />
          </div>

          <div className="min-w-0">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-700">
                  {selectedZone ? ZONE_META[selectedZone].label : "Chọn vùng trên bản đồ"}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {selectedZone ? ZONE_META[selectedZone].description : "Đỏ B, vàng T, xanh lam N"}
                </p>
              </div>
              {selectedZone ? (
                <span
                  className="inline-flex size-3 flex-shrink-0 rounded-full border border-white shadow"
                  style={{ background: ZONE_META[selectedZone].color }}
                />
              ) : null}
            </div>

            <div className="rounded border border-slate-100 bg-slate-50/70 px-2 py-2">
              <p className="text-xs font-semibold text-slate-700">
                {activeRootIds.length} node Level 1
              </p>
              <p className="mt-1 text-[11px] leading-snug text-slate-500">
                Click vùng màu để chỉ hiện các node Level 1 của vùng đó. Click node Level 1 trên graph để xổ Level 2.
              </p>
              <button
                type="button"
                onClick={showAllRoots}
                className="mt-2 rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Tất cả
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" onClick={addRoot} title="Add project" className="grid size-8 place-items-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50">
            <Plus className="size-4" />
          </button>
          <button type="button" onClick={addChild} disabled={!selectedNode} title="Add child" className="grid size-8 place-items-center rounded border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40">
            <Plus className="size-4" />
          </button>
          <button type="button" onClick={deleteSelected} disabled={!selectedNode} title="Delete selected" className="grid size-8 place-items-center rounded border border-slate-200 text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40">
            <Trash2 className="size-4" />
          </button>
          <button type="button" onClick={expandSelectedRoot} title="Open selected project" className="rounded border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Open
          </button>
          <button type="button" onClick={collapseAll} title="Collapse all" className="rounded border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">
            Collapse
          </button>
        </div>

        {selectedNode ? (
          <div className="grid gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {LEVEL_LABELS[selectedNode.level] ?? `Level ${selectedNode.level}`}
            </div>
            <input
              value={selectedNode.label}
              onChange={(event) => updateSelectedNode({ label: event.target.value })}
              className="h-8 rounded border border-slate-200 px-2 text-sm font-semibold text-slate-800 outline-none focus:border-blue-400"
            />
            <textarea
              value={selectedNode.sub}
              onChange={(event) => updateSelectedNode({ sub: event.target.value })}
              rows={2}
              className="resize-none rounded border border-slate-200 px-2 py-1.5 text-xs text-slate-600 outline-none focus:border-blue-400"
            />
          </div>
        ) : (
          <div className="text-xs text-slate-500">Select a node to edit it in real time.</div>
        )}
      </div>

      <div className="absolute right-3 top-3 z-10 flex flex-col gap-1">
        <button type="button" onClick={fitView} title="Fit view" className="grid size-7 place-items-center rounded border border-slate-200 bg-white shadow-sm text-slate-500 hover:bg-slate-50">
          <Maximize2 className="size-3.5" />
        </button>
        <button type="button" onClick={zoomIn} title="Zoom in" className="grid size-7 place-items-center rounded border border-slate-200 bg-white shadow-sm text-slate-500 hover:bg-slate-50">
          <ZoomIn className="size-3.5" />
        </button>
        <button type="button" onClick={zoomOut} title="Zoom out" className="grid size-7 place-items-center rounded border border-slate-200 bg-white shadow-sm text-slate-500 hover:bg-slate-50">
          <ZoomOut className="size-3.5" />
        </button>
        <button type="button" onClick={resetPositions} title="Reset drag positions" className="grid size-7 place-items-center rounded border border-slate-200 bg-white shadow-sm text-slate-500 hover:bg-slate-50">
          <RotateCcw className="size-3.5" />
        </button>
      </div>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 max-w-[260px] rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            transform: tooltip.x > containerWidth / 2 ? "translateX(-110%)" : undefined,
          }}
        >
          <div className="pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {LEVEL_LABELS[tooltip.data.level] ?? `Level ${tooltip.data.level}`}
          </div>
          <p className="text-sm font-semibold leading-snug text-slate-800">{tooltip.data.sub}</p>
          {tooltip.data.count > 0 && (
            <p className="mt-0.5 text-xs text-slate-500">
              {tooltip.data.count} {tooltip.data.unit}
            </p>
          )}
          {tooltip.data.hasChildren && (
            <p className="mt-1 text-[11px] text-slate-400">
              Click to {tooltip.data.collapsed ? "expand" : "collapse"}
            </p>
          )}
        </div>
      )}

      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
    </div>
  );
}
