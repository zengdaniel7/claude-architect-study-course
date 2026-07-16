import { json } from "@codemirror/lang-json";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { useEffect, useRef } from "react";

export function CodeEditor({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;

  useEffect(() => {
    if (!host.current) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        json(),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ "aria-label": label }),
        EditorView.theme({
          "&": { minHeight: "220px", fontSize: "18px" },
          ".cm-content": { padding: "18px", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
          ".cm-scroller": { lineHeight: "1.6" },
          "&.cm-focused": { outline: "4px solid #f2b544", outlineOffset: "3px" }
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) changeRef.current(update.state.doc.toString());
        })
      ]
    });
    const view = new EditorView({ state, parent: host.current });
    viewRef.current = view;
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [label]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
  }, [value]);

  return <div className="code-editor" ref={host} />;
}
