import { useId, useLayoutEffect, useMemo, useRef } from "react";
import { dependencyLayers } from "./dependency-graph";
import type { DependencyNode } from "./dependency-graph";
import "./dependency-graph.scss";

export function DependencyGraph({ items }: { items: DependencyNode[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const markerId = `plan-arrow-${useId().replace(/:/g, "")}`;
  const { layers, error } = useMemo(() => dependencyLayers(items), [items]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const svg = svgRef.current;
    if (!wrap || !svg) return;
    const draw = () => {
      // Read all node geometry together before updating the SVG. Exclude its old
      // extent so shrinking the window/content can also shrink the overlay.
      const origin = wrap.getBoundingClientRect();
      const nodes = new Map<
        string,
        { x: number; y: number; width: number; height: number }
      >();
      wrap.querySelectorAll<HTMLElement>("[data-node-id]").forEach((el) => {
        const rect = el.getBoundingClientRect();
        nodes.set(el.dataset.nodeId!, {
          x: rect.left - origin.left + wrap.scrollLeft,
          y: rect.top - origin.top + wrap.scrollTop,
          width: rect.width,
          height: rect.height,
        });
      });
      const W = Math.max(
        1,
        wrap.clientWidth,
        ...[...nodes.values()].map((p) => p.x + p.width + 4),
      );
      const H = Math.max(
        1,
        wrap.clientHeight,
        ...[...nodes.values()].map((p) => p.y + p.height + 10),
      );
      svg.setAttribute("width", String(W));
      svg.setAttribute("height", String(H));
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);

      const SVG_NS = "http://www.w3.org/2000/svg";
      const defs = document.createElementNS(SVG_NS, "defs");
      const marker = document.createElementNS(SVG_NS, "marker");
      marker.setAttribute("id", markerId);
      marker.setAttribute("viewBox", "0 0 10 10");
      marker.setAttribute("refX", "9");
      marker.setAttribute("refY", "5");
      marker.setAttribute("markerWidth", "6");
      marker.setAttribute("markerHeight", "6");
      marker.setAttribute("orient", "auto");
      const arrowPath = document.createElementNS(SVG_NS, "path");
      arrowPath.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
      arrowPath.setAttribute("fill", "#64748b");
      marker.appendChild(arrowPath);
      defs.appendChild(marker);
      const fragment = document.createDocumentFragment();
      fragment.appendChild(defs);

      // 统计每个节点的出入边数，用于错开箭头出入口，避免多条线重叠
      const outCount = new Map<string, number>();
      const inCount = new Map<string, number>();
      for (const st of items) {
        for (const dep of [...new Set(st.dependencies)]) {
          outCount.set(dep, (outCount.get(dep) || 0) + 1);
          inCount.set(st.id, (inCount.get(st.id) || 0) + 1);
        }
      }
      const outSeen = new Map<string, number>();
      const inSeen = new Map<string, number>();
      const port = (
        node: { y: number; height: number },
        key: string,
        total: number,
        seen: Map<string, number>,
      ) => {
        const idx = seen.get(key) || 0;
        seen.set(key, idx + 1);
        const frac = total <= 1 ? 0.5 : (idx + 0.5) / total;
        return node.y + node.height * frac;
      };

      items.forEach((st) => {
        [...new Set(st.dependencies)].forEach((dep) => {
          const from = nodes.get(dep);
          const to = nodes.get(st.id);
          if (!from || !to) return;
          const x1 = from.x + from.width;
          const y1 = port(from, dep, outCount.get(dep) || 1, outSeen);
          const x2 = to.x;
          const y2 = port(to, st.id, inCount.get(st.id) || 1, inSeen);
          const midX = x1 + Math.max(24, (x2 - x1) * 0.5);
          const path = document.createElementNS(SVG_NS, "path");
          path.setAttribute("d", `M ${x1} ${y1} H ${midX} V ${y2} H ${x2}`);
          path.setAttribute("stroke", "#64748b");
          path.setAttribute("stroke-width", "1.5");
          path.setAttribute("fill", "none");
          path.setAttribute("marker-end", `url(#${markerId})`);
          fragment.appendChild(path);
        });
      });
      svg.replaceChildren(fragment);
    };
    draw();
    let frame = 0;
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(draw);
    };
    const observer =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(schedule);
    observer?.observe(wrap);
    wrap
      .querySelectorAll<HTMLElement>("[data-node-id]")
      .forEach((node) => observer?.observe(node));
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [items, markerId, error]);

  if (!items.length) return null;
  if (error) return <p role="alert">{error}</p>;

  return (
    <div
      className="plan-graph"
      ref={wrapRef}
      role="group"
      aria-label="依赖关系图（箭头表示前置顺序，橙色表示待认领）"
    >
      <svg className="plan-graph-svg" ref={svgRef} aria-hidden="true" />
      {layers.map((layer, index) => (
        <div className="plan-graph-col" key={index}>
          {layer.map((it) => (
            <div
              className={`plan-graph-node${it.needsClaim ? " is-pending" : ""}`}
              key={it.id}
              data-node-id={it.id}
            >
              <strong>{it.title}</strong>
              <small>
                {it.dependencies.length
                  ? `前置：${it.dependencies
                      .map((id) => items.find((node) => node.id === id)?.title)
                      .join("、")}`
                  : "无前置步骤"}
                {it.needsClaim ? " · 待认领" : ""}
              </small>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
