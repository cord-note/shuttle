import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useNoteStore } from '../../store/notes';
import { useFragmentStore } from '../../store/fragments';

// ── Node view (React) ─────────────────────────────────────────────────────────

function FragmentLinkView({ node }: NodeViewProps) {
  const { toNoteId, toFragmentId, label } = node.attrs as {
    linkId: string | null;
    toNoteId: string | null;
    toFragmentId: string | null;
    label: string;
  };

  const notes = useNoteStore((s) => s.notes);
  const targetNote = toNoteId ? notes.find((n) => n.id === toNoteId) : null;
  const displayLabel = targetNote?.title || label || (toFragmentId ? 'fragment' : 'note');

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!toNoteId) return;

    const { activeNoteId, setActiveNote, loadLinks } = useNoteStore.getState();

    if (toNoteId !== activeNoteId) {
      setActiveNote(toNoteId);
      loadLinks(toNoteId);
      if (toFragmentId) {
        useFragmentStore.getState().setPendingScroll(toFragmentId);
      }
    } else if (toFragmentId) {
      const el = document.querySelector(`[data-block-id="${toFragmentId}"]`) as HTMLElement | null;
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function handleMouseEnter() {
    if (toFragmentId) {
      document.querySelector(`[data-block-id="${toFragmentId}"]`)?.classList.add('fragment-highlight');
    }
  }

  function handleMouseLeave() {
    if (toFragmentId) {
      document.querySelector(`[data-block-id="${toFragmentId}"]`)?.classList.remove('fragment-highlight');
    }
  }

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      <span
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        style={{
          color: 'var(--link-color)',
          cursor: 'pointer',
          padding: '0 1px',
          transition: 'color 0.1s',
        }}
        title={toFragmentId ? `fragment in ${targetNote?.title || 'note'}` : targetNote?.title || 'note'}
      >
        {displayLabel}
      </span>
    </NodeViewWrapper>
  );
}

// ── Tiptap node definition ────────────────────────────────────────────────────

export const FragmentLinkNode = Node.create({
  name: 'fragmentLinkNode',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      linkId:       { default: null },
      toNoteId:     { default: null },
      toFragmentId: { default: null },
      label:        { default: '' },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-fragment-link]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-fragment-link': '' }, HTMLAttributes)];
  },

  addNodeView() {
    return ReactNodeViewRenderer(FragmentLinkView);
  },
});
