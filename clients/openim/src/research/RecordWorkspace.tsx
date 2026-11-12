import type { ReactNode } from "react";
import "./record-workspace.scss";

/** A page, not a drawer: lists and their selected content keep their own scroll. */
export function RecordWorkspace({
  list,
  children,
  label,
  footer,
}: {
  list: ReactNode;
  children: ReactNode;
  label: string;
  footer?: ReactNode;
}) {
  return (
    <section className="record-workspace" aria-label={label}>
      <aside className="record-workspace-list">{list}</aside>
      <div className="record-workspace-detail">
        <div className="record-workspace-detail-scroll">{children}</div>
        {footer && <footer className="record-workspace-footer">{footer}</footer>}
      </div>
    </section>
  );
}
