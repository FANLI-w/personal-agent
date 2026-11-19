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
  const body = useRef<HTMLSpanElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  useLayoutEffect(() => {
    const node = body.current;
    if (!node || expanded) return;
    const measure = () => setTruncated(node.scrollHeight > node.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [expanded, text]);

  return (
    <div className="chat-source-link">
      <button
        type="button"
        className="chat-source-location"
        onClick={onLocate}
        title="定位引用消息"
      >
        <strong>{label}</strong>
        <span
          id={id}
          ref={body}
          className="chat-source-quote-text"
          data-expanded={expanded}
        >
          {text}
        </span>
      </button>
      {(truncated || expanded) && (
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
  );
}
