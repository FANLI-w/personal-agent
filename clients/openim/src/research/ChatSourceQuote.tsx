import { RollbackOutlined } from "@ant-design/icons";
import { useId, useLayoutEffect, useRef, useState } from "react";

/** Keep the source navigation and expanding the quote as separate controls. */
export function ChatSourceQuote({
  label,
  text,
  onLocate,
}: {
  label: string;
  text: string;
  onLocate: () => void;
}) {
  const id = useId();
  const preview = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [clipped, setClipped] = useState(false);
  const summary = text.trim().replace(/\s+/g, " ");
  useLayoutEffect(() => {
    const node = preview.current;
    if (!node) return;
    const measure = () => setClipped(node.scrollWidth > node.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [summary]);

  return (
    <div className="chat-source-link">
      <div className="chat-source-summary">
        <button
          type="button"
          className="chat-source-location"
          onClick={onLocate}
          title="定位引用消息"
        >
          <RollbackOutlined aria-hidden />
          <span className="chat-source-label">{label}</span>
          <span className="chat-source-preview" ref={preview}>{summary}</span>
        </button>
        {(clipped || expanded || text.trim().includes("\n")) && (
          <button
            type="button"
            className="chat-source-toggle"
            aria-controls={id}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? "收起引用" : "展开引用"}
          </button>
        )}
      </div>
      <div id={id} className="chat-source-quote-text" hidden={!expanded}>{text}</div>
    </div>
  );
}
