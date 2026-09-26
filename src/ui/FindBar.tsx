import { useEffect, useState } from 'react';
import type { Editor } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { ChevronDown, ChevronUp, X } from 'lucide-react';

/** Find and replace on the official FindAndReplace extension. */
export function FindBar({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const [term, setTerm] = useState('');
  const [replacement, setReplacement] = useState('');
  const { count, index } = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      count: e.storage.findAndReplace.results.length,
      index: e.storage.findAndReplace.currentIndex,
    }),
  });

  useEffect(() => { editor.commands.setSearchTerm(term); }, [term, editor]);
  useEffect(() => { editor.commands.setReplaceTerm(replacement); }, [replacement, editor]);
  // Highlights must not outlive the bar (ShuttleEditor closes it on a note switch).
  useEffect(() => () => { if (!editor.isDestroyed) editor.commands.clearSearch(); }, [editor]);

  const close = (): void => { onClose(); editor.commands.focus(); };

  return (
    <div className="sh-findbar" role="search">
      <input
        autoFocus
        placeholder="Find"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) editor.commands.goToPreviousResult();
            else editor.commands.goToNextResult();
          }
          if (e.key === 'Escape') { e.preventDefault(); close(); }
        }}
      />
      <span className="sh-findbar-count">{count === 0 ? '0/0' : `${(index ?? 0) + 1}/${count}`}</span>
      <button type="button" title="Previous" onClick={() => editor.commands.goToPreviousResult()}><ChevronUp size={13} /></button>
      <button type="button" title="Next" onClick={() => editor.commands.goToNextResult()}><ChevronDown size={13} /></button>
      <input
        placeholder="Replace"
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } }}
      />
      <button type="button" onClick={() => editor.commands.replace()}>Replace</button>
      <button type="button" onClick={() => editor.commands.replaceAll()}>All</button>
      <button type="button" title="Close" onClick={close}><X size={13} /></button>
    </div>
  );
}
