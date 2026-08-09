import { useEffect, useRef, useState } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { DOMSerializer } from '@tiptap/pm/model';
import { ArrowUpRight, Link2Off } from 'lucide-react';
import { api } from '@renderer/ipc';
import { useNoteStore } from '../../store/notes';
import { useFragmentStore } from '../../store/fragments';
import type { BlockRefTarget } from '@shared/types';
import styles from './BlockRef.module.css';

/**
 * Renders a transclusion's source content read-only.
 *
 * Content is serialised through the editor's own schema, so a referenced block
 * renders exactly as it does in its home note — no second editor instance, and
 * no parallel set of render rules to keep in step.
 */
export default function BlockRefView({ node, editor }: NodeViewProps) {
  const refBlockId = node.attrs['refBlockId'] as string | null;
  const { setActiveNote, loadLinks } = useNoteStore();
  const { setPendingScroll } = useFragmentStore();

  const [target, setTarget] = useState<BlockRefTarget | null>(null);
  const [loading, setLoading] = useState(true);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!refBlockId) { setLoading(false); return; }
    let cancelled = false;

    api.blocks
      .resolveRef(refBlockId)
      .then((result) => { if (!cancelled) setTarget(result); })
      .catch(() => { if (!cancelled) setTarget(null); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [refBlockId]);

  // Serialise the resolved content into the read-only body.
  useEffect(() => {
    const host = contentRef.current;
    if (!host) return;
    host.replaceChildren();
    if (!target) return;

    try {
      const contentNode = editor.schema.nodeFromJSON(JSON.parse(target.contentJson));
      const dom = DOMSerializer.fromSchema(editor.schema).serializeNode(contentNode);
      host.appendChild(dom);
    } catch {
      // A block whose stored shape no longer parses against the current schema
      // is treated as unresolved rather than crashing the page around it.
      setTarget(null);
    }
  }, [target, editor]);

  function jumpToSource() {
    if (!target) return;
    setActiveNote(target.noteId);
    loadLinks(target.noteId);
    setPendingScroll(target.blockId);
  }

  if (loading) {
    return (
      <NodeViewWrapper className={styles.ref} contentEditable={false}>
        <div className={styles.loading}>Resolving reference…</div>
      </NodeViewWrapper>
    );
  }

  if (!target) {
    return (
      <NodeViewWrapper className={`${styles.ref} ${styles.unresolved}`} contentEditable={false}>
        <div className={styles.unresolvedRow}>
          <Link2Off size={13} strokeWidth={1.75} />
          <span>Referenced block no longer exists</span>
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper className={styles.ref} contentEditable={false}>
      <button className={styles.source} onClick={jumpToSource} title="Open the source block">
        <span className={styles.sourceTitle}>{target.noteTitle || 'Untitled'}</span>
        <ArrowUpRight size={12} strokeWidth={2} />
      </button>
      <div className={styles.body} ref={contentRef} />
    </NodeViewWrapper>
  );
}
