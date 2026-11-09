import { useEffect, useRef } from 'react';
import { NodeViewWrapper, type NodeViewProps } from '@tiptap/react';
import type { ShuttleContextRef } from '../../context';

/** A box the host draws its tag view into, or a placeholder without a host. */
export default function TagViewView({ node, extension, deleteNode }: NodeViewProps) {
  const ctx = (extension.options as { ctx: ShuttleContextRef }).ctx;
  const viewId = node.attrs['viewId'] as string | null;
  const box = useRef<HTMLDivElement>(null);
  const canDraw = Boolean(ctx.current.host.renderTagView);

  useEffect(() => {
    const el = box.current;
    const draw = ctx.current.host.renderTagView;
    if (!el || !viewId || !draw) return;
    return draw(el, viewId, { remove: deleteNode });
  }, [viewId, ctx, deleteNode]);

  return (
    <NodeViewWrapper className="sh-tagview" contentEditable={false}>
      {viewId && canDraw
        ? <div ref={box} className="sh-tagview-body" />
        : <div className="sh-tagview-status">Tag view</div>}
    </NodeViewWrapper>
  );
}
