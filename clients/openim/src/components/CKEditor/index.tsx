import "./index.scss";
import "ckeditor5/ckeditor5.css";

import { CKEditor } from "@ckeditor/ckeditor5-react";
import { ClassicEditor, Essentials, Paragraph, Mention, type Editor } from "ckeditor5";
import type { GroupMentionContact } from "@/research/group-mentions";
import {
  forwardRef,
  ForwardRefRenderFunction,
  memo,
  useImperativeHandle,
  useRef,
} from "react";

export type CKEditorRef = {
  focus: (moveToEnd?: boolean) => void;
  insertText: (text: string) => void;
  insertMention: (contact: GroupMentionContact) => void;
};

interface CKEditorProps {
  value: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  onEnter?: () => void;
  mentionContacts?: GroupMentionContact[];
}

function identityMentions(editor: Editor) {
  editor.conversion.for("upcast").elementToAttribute({
    view: { name: "span", classes: "mention", attributes: ["data-mention", "data-contact-id"] },
    model: { key: "mention", value: (item: Parameters<Mention["toMentionAttribute"]>[0]) => editor.plugins.get(Mention).toMentionAttribute(item, { contactId: item.getAttribute("data-contact-id") }) },
    converterPriority: "high",
  });
  editor.conversion.for("downcast").attributeToElement({
    model: "mention",
    view: (value, { writer }) => value?.contactId ? writer.createAttributeElement("span", {
      class: "mention", "data-mention": value.id, "data-contact-id": value.contactId,
    }, { priority: 20, id: value.uid }) : undefined,
    converterPriority: "high",
  });
}

const mentionItem = (contact: GroupMentionContact) => ({
  id: `@${contact.id}`, text: `@${contact.displayName}`, contactId: contact.id,
  name: contact.displayName, description: contact.ownerLabel || (contact.agent ? "群内助手" : "群成员"), agent: contact.agent,
});

export interface EmojiData {
  src: string;
  alt: string;
}

const keyCodes = {
  delete: 46,
  backspace: 8,
};

interface KeyDownData {
  keyCode: number;
  shiftKey: boolean;
  preventDefault: () => void;
  isComposing?: boolean;
  domEvent?: KeyboardEvent;
}

const Index: ForwardRefRenderFunction<CKEditorRef, CKEditorProps> = (
  { value, placeholder, onChange, onEnter, mentionContacts = [] },
  ref,
) => {
  const ckEditor = useRef<ClassicEditor | null>(null);
  const enter = useRef(onEnter);
  enter.current = onEnter;
  const members = useRef(mentionContacts);
  members.current = mentionContacts;

  const focus = (moveToEnd = false) => {
    const editor = ckEditor.current;

    if (editor) {
      const model = editor.model;
      const view = editor.editing.view;
      const root = model.document.getRoot();
      if (moveToEnd && root) {
        const range = model.createRange(model.createPositionAt(root, "end"));

        model.change((writer) => {
          writer.setSelection(range);
        });
      }
      view.focus();
    }
  };

  const listenKeydown = (editor: ClassicEditor) => {
    editor.editing.view.document.on(
      "keydown",
      (evt, data: KeyDownData) => {
        if (
          data.keyCode === 13 &&
          !data.shiftKey &&
          !data.isComposing &&
          !data.domEvent?.isComposing &&
          !editor.editing.view.document.isComposing
        ) {
          data.preventDefault();
          evt.stop();
          enter.current?.();
          return;
        }
        if (data.keyCode === keyCodes.backspace || data.keyCode === keyCodes.delete) {
          const selection = editor.model.document.selection;
          const hasSelectContent = !editor.model.getSelectedContent(selection).isEmpty;
          const hasEditorContent = Boolean(editor.getData());

          if (!hasEditorContent) {
            return;
          }

          if (hasSelectContent) return;
        }
      },
      { priority: "high" },
    );
  };

  useImperativeHandle(
    ref,
    () => ({
      focus,
      insertText: (text) => {
        const editor = ckEditor.current;
        if (!editor) return;
        editor.model.change((writer) => {
          editor.model.insertContent(writer.createText(text), editor.model.document.selection);
        });
        editor.editing.view.focus();
      },
      insertMention: (contact) => {
        const editor = ckEditor.current;
        if (!editor || !members.current.some(c => c.id === contact.id && !c.external && !c.unavailable)) return;
        editor.execute("mention", { marker: "@", mention: mentionItem(contact), text: `@${contact.displayName}` });
        editor.editing.view.focus();
      },
    }),
    [],
  );

  return (
    <CKEditor
      editor={ClassicEditor}
      data={value}
      config={{
        placeholder,
        toolbar: [],
        image: {
          toolbar: [],
          insert: {
            type: "inline",
          },
        },
        plugins: [Essentials, Paragraph, Mention, identityMentions],
        mention: { dropdownLimit: 12, feeds: [{
          marker: "@", minimumCharacters: 0,
          feed: query => members.current.filter(c => !c.external && !c.unavailable &&
            `${c.displayName} ${c.ownerLabel || ""}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).map(mentionItem),
          itemRenderer: item => {
            const entry = item as ReturnType<typeof mentionItem>;
            const row = document.createElement("span"); row.className = "chat-mention-option";
            const avatar = document.createElement("span"); avatar.className = "chat-mention-avatar";
            avatar.textContent = entry.agent ? "AI" : entry.name.slice(0, 1);
            const label = document.createElement("span");
            const name = document.createElement("strong"); name.textContent = entry.name;
            const description = document.createElement("small"); description.textContent = entry.description;
            label.append(name, description); row.append(avatar, label); return row;
          },
        }] },
      }}
      onReady={(editor) => {
        ckEditor.current = editor;
        listenKeydown(editor);
        focus(true);
      }}
      onChange={(event, editor) => {
        const data = editor.getData();
        onChange?.(data);
      }}
    />
  );
};

export default memo(forwardRef(Index));
