import type { SelectedMention } from "./group-mentions";

/** Read CKEditor's paragraphs and identity-bearing mentions in one UTF-16 coordinate space. */
export function readMentionComposer(html: string) {
  const document = new DOMParser().parseFromString(html, "text/html");
  let text = "";
  const mentions: SelectedMention[] = [];
  const visit = (node: Node) => {
    if (node.nodeType === 3) {
      text += (node.textContent || "").replace(/\u00a0/g, " ");
      return;
    }
    if (node.nodeType !== 1) return;
    const element = node as Element;
    if (["SCRIPT", "STYLE"].includes(element.tagName)) return;
    if (element.tagName === "BR") {
      text += "\n";
      return;
    }
    const start = text.length;
    for (const child of element.childNodes) visit(child);
    const contactId = element.getAttribute("data-contact-id");
    if (contactId && element.classList.contains("mention"))
      mentions.push({ contactId, start, end: text.length });
    if (element.tagName === "P" && element.nextSibling) text += "\n";
  };
  for (const node of document.body.childNodes) visit(node);
  const leading = text.length - text.trimStart().length;
  return {
    text: text.trim(),
    mentions: mentions.map((m) => ({
      ...m,
      start: m.start - leading,
      end: m.end - leading,
    })),
  };
}
