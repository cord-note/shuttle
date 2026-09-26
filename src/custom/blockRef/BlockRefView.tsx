import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import { DOMSerializer } from '@tiptap/pm/model';
import { ArrowUpRight, Link2Off } from 'lucide-react';
import type { ShuttleContextRef } from '../../context';
import type { ResolvedBlock } from '../../host';

/**
 * Read-only transclusion. The source block is rendered through this editor's
 * own schema, so it looks exactly as it does in its home note.
 */
export default function BlockRefView({ node, editor, extension }: NodeViewProps) {
  const ctx = (extension.options as { ctx: ShuttleContextRef }).ctx;
  const refBlockId = node.attrs['refBlockId'] as string | null;
  const [target, setTarget] = useState<ResolvedBlock | null>(null);
  const [loading, setLoading] = useState(true);
  const body = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!refBlockId) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    ctx.current.host.resolveBlock(refBlockId)
      .then((r) => { if (!cancelled) setTarget(r); })
      .catch((error: unknown) => {
        ctx.current.host.log('warn', 'Block reference failed to resolve', { refBlockId, error: String(error) });
        if (!cancelled) setTarget(null);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [refBlockId, ctx]);

  useEffect(() => {
    const el = body.current;
    if (!el) return;
    el.replaceChildren();
    if (!target) return;
    try {
      const content = editor.schema.nodeFromJSON(target.content);
      el.appendChild(DOMSerializer.fromSchema(editor.schema).serializeNode(content));
    } catch {
      // Stored shape no longer parses against this schema: treat as unresolved.
      setTarget(null);
    }
  }, [target, editor]);

  if (loading) {
    return <NodeViewWrapper className="sh-blockref" contentEditable={false}><div className="sh-blockref-status">Resolving reference…</div></NodeViewWrapper>;
  }

  if (!target) {
    return (
      <NodeViewWrapper className="sh-blockref is-missing" contentEditable={false}>
        <div className="sh-blockref-status"><Link2Off size={13} strokeWidth={1.75} /> Block not found</div>
      </NodeViewWrapper>
    );
  }

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
