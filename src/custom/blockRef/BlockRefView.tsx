import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { DOMSerializer } from '@tiptap/pm/model';
import { ArrowUpRight, Link2Off } from 'lucide-react';
import type { ShuttleContextRef } from '../../context';
import type { ResolvedBlock } from '../../host';

type ViewState =
  | { status: 'loading'; target: null }
  | { status: 'missing'; target: null }
  | { status: 'ok'; target: ResolvedBlock };

/**
 * Read-only transclusion. The source block is rendered through this editor's
 * own schema, so it looks exactly as it does in its home note.
 */
export default function BlockRefView({ node, editor, extension }: NodeViewProps) {
  const ctx = (extension.options as { ctx: ShuttleContextRef }).ctx;
  const refBlockId = node.attrs['refBlockId'] as string | null;
  const [view, setView] = useState<ViewState>({ status: 'loading', target: null });
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!refBlockId) { setView({ status: 'missing', target: null }); return; }
    let cancelled = false;
    setView({ status: 'loading', target: null });
    ctx.current.host.resolveBlock(refBlockId)
      .then((r) => {
        if (cancelled) return;
        setView(r ? { status: 'ok', target: r } : { status: 'missing', target: null });
      })
      .catch((error: unknown) => {
        ctx.current.host.log('warn', 'Block reference failed to resolve', { refBlockId, error: String(error) });
        if (!cancelled) setView({ status: 'missing', target: null });
      });
    return () => { cancelled = true; };
  }, [refBlockId, ctx]);

  // The body element only exists in the DOM while `status === 'ok'`, so this
  // effect runs whenever that state (and therefore the ref) actually changes.
  useEffect(() => {
    if (view.status !== 'ok') return;
    const el = body.current;
    if (!el) return;
    el.replaceChildren();
    try {
      const content = editor.schema.nodeFromJSON(view.target.content);
      el.appendChild(DOMSerializer.fromSchema(editor.schema).serializeNode(content));
    } catch {
      // Stored shape no longer parses against this schema: treat as unresolved.
      ctx.current.host.log('warn', 'Transcluded block no longer fits the schema', { refBlockId });
      setView({ status: 'missing', target: null });
    }
  }, [view, editor, ctx, refBlockId]);

  if (view.status === 'loading') {
    return <NodeViewWrapper className="sh-blockref" contentEditable={false}><div className="sh-blockref-status">Resolving reference…</div></NodeViewWrapper>;
  }

  if (view.status === 'missing') {
    return (
      <NodeViewWrapper className="sh-blockref is-missing" contentEditable={false}>
        <div className="sh-blockref-status"><Link2Off size={13} strokeWidth={1.75} /> Block not found</div>
      </NodeViewWrapper>
    );
  }

  const { target } = view;
  return (
    <NodeViewWrapper className="sh-blockref" contentEditable={false}>
      <button
        type="button"
        className="sh-blockref-source"
        onClick={() => ctx.current.host.openNote(target.noteId, target.blockId)}
        title="Open the source block"
      >
        {target.noteTitle || 'Untitled'} <ArrowUpRight size={12} strokeWidth={2} />
      </button>
      <div className="sh-blockref-body" ref={body} />
    </NodeViewWrapper>
  );
}
