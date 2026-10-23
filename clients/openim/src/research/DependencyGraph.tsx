import { useLayoutEffect, useMemo, useRef } from "react";
import "./dependency-graph.scss";

export type DependencyNode = {
  id: string;
  title: string;
  dependencies: string[];
  pending?: boolean;
};

/** 按依赖深度计算每个子任务所在的层号。 */
function computeLayers(items: DependencyNode[]) {
  const deps: Record<string, string[]> = {};
  items.forEach((it) => {
    deps[it.id] = it.dependencies || [];
  });
  const memo: Record<string, number> = {};
  const depth = (id: string): number => {
    if (memo[id] !== undefined) return memo[id];
    const pred = deps[id] || [];
    if (!pred.length) {
      memo[id] = 0;
      return 0;
    }
    let m = 0;
    pred.forEach((x) => {
      m = Math.max(m, depth(x) + 1);
    });
    memo[id] = m;
    return m;
  };
  items.forEach((it) => depth(it.id));

  const byLayer: Record<number, DependencyNode[]> = {};
  items.forEach((it) => {
    const l = memo[it.id];
    (byLayer[l] = byLayer[l] || []).push(it);
  });
  const layers = Object.keys(byLayer)
    .map(Number)
    .sort((a, b) => a - b);
  return { layers, byLayer };
}

/** 沿 offsetParent 链累加，得到 node 相对 ancestor 的左上角坐标。 */
function relativePos(node: HTMLElement, ancestor: HTMLElement) {
  let x = 0;
  let y = 0;
  let el: HTMLElement | null = node;
  while (el && el !== ancestor) {
    x += el.offsetLeft;
    y += el.offsetTop;
    el = el.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

export function DependencyGraph({ items }: { items: DependencyNode[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const { layers, byLayer } = useMemo(() => computeLayers(items), [items]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg) return;
    // 清空上一次画的箭头，再按当前布局重画。
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const W = Math.max(1, wrap.scrollWidth);
    const H = Math.max(1, wrap.scrollHeight);
    svg.setAttribute("width", String(W));
    svg.setAttribute("height", String(H));
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

    const SVG_NS = "http://www.w3.org/2000/svg";
    const defs = document.createElementNS(SVG_NS, "defs");
    const marker = document.createElementNS(SVG_NS, "marker");
    marker.setAttribute("id", "plan-arrow");
    marker.setAttribute("viewBox", "0 0 10 10");
    marker.setAttribute("refX", "9");
    marker.setAttribute("refY", "5");
    marker.setAttribute("markerWidth", "6");
    marker.setAttribute("markerHeight", "6");
    marker.setAttribute("orient", "auto");
    const arrowPath = document.createElementNS(SVG_NS, "path");
    arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
    arrowPath.setAttribute("fill", "#9aa5b1");
    marker.appendChild(arrowPath);
    defs.appendChild(marker);
    svg.appendChild(defs);

    const nodes: Record<string, HTMLElement> = {};
    wrap.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
      const id = el.dataset.nodeId;
      if (id) nodes[id] = el;
    });

    items.forEach((st) => {
      (st.dependencies || []).forEach((dep) => {
        const from = nodes[dep];
        const to = nodes[st.id];
        if (!from || !to) return;
        const p1 = relativePos(from, wrap);
        const p2 = relativePos(to, wrap);
        const x1 = p1.x + from.offsetWidth;
        const y1 = p1.y + from.offsetHeight / 2;
        const x2 = p2.x;
        const y2 = p2.y + to.offsetHeight / 2;
        const dx = Math.max(24, (x2 - x1) * 0.45);
        const path = document.createElementNS(SVG_NS, "path");
        path.setAttribute(
          "d",
          `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
        );
        path.setAttribute("stroke", "#9aa5b1");
        path.setAttribute("stroke-width", "1.5");
        path.setAttribute("fill", "none");
        path.setAttribute("marker-end", "url(#plan-arrow)");
        svg.appendChild(path);
      });
    });
  }, [items, layers]);

  if (!items.length) return null;

  return (
    <div className="plan-graph" ref={wrapRef} aria-label="依赖关系图">
      <svg className="plan-graph-svg" ref={svgRef} aria-hidden="true" />
      {layers.map((layer) => (
        <div className="plan-graph-col" key={layer}>
          {byLayer[layer].map((it) => (
            <div
              className={`plan-graph-node${it.pending ? " is-pending" : ""}`}
              key={it.id}
              data-node-id={it.id}
            >
              {it.id} {it.title}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
