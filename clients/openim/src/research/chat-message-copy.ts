/** Only copy a selection wholly inside the message that was right-clicked. */
export function selectedMessageText(root: HTMLElement, selection: Selection | null) {
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return "";
  const range = selection.getRangeAt(0);
  return root.contains(range.startContainer) && root.contains(range.endContainer)
    ? selection.toString()
    : "";
}
