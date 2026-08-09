import { useEffect, useRef, useState } from 'react';
import { useEditor } from '@tiptap/react';
import type { Editor } from '@tiptap/core';
import { buildExtensions } from './extensions';
import { markdownClipboardProps } from './markdownClipboard';
import { useNoteStore } from '../../store/notes';
import { api } from '@renderer/ipc';
import { parseDoc } from '@shared/blockDoc';
import type { Note } from '@shared/types';

const SAVE_DEBOUNCE_MS = 750;
const MENTION_DEBOUNCE_MS = 800;
const MIN_MENTION_TITLE_LENGTH = 3;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Ids of every fragment link node currently in the document. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectLinkIds(doc: any): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node: { type: { name: string }; attrs: Record<string, unknown> }) => {
    if (node.type.name === 'fragmentLinkNode' && node.attrs['linkId']) {
      ids.add(node.attrs['linkId'] as string);
    }
  });
  return ids;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function collectWikiLinkTargets(doc: any): Set<string> {
  const ids = new Set<string>();
  doc.descendants((node: { type: { name: string }; attrs: Record<string, unknown> }) => {
    if (node.type.name === 'wikiLink' && node.attrs['id']) {
      ids.add(node.attrs['id'] as string);
    }
  });
  return ids;
}

/** Notes named in this document's text but not actually linked to. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function computeOutboundMentions(doc: any, notes: Note[], currentNoteId: string): Note[] {
  const linkedIds = new Set<string>();
  const textParts: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  doc.descendants((node: any) => {
    if (node.type.name === 'wikiLink') {
      if (node.attrs.id) linkedIds.add(node.attrs.id as string);
      return false;
    }
    if (node.isText && node.text) textParts.push(node.text as string);
    return true;
  });
  const fullText = textParts.join(' ');
  return notes.filter((n) => {
    if (n.id === currentNoteId || linkedIds.has(n.id)) return false;
    const title = (n.title || '').trim();
    if (title.length < MIN_MENTION_TITLE_LENGTH) return false;
    return new RegExp(`(?<![\\w])${escapeRe(title)}(?![\\w])`, 'i').test(fullText);
  });
}

export interface NoteDoc {
  editor: Editor | null;
  wordCount: number;
  charCount: number;
  outboundMentions: Note[];
}

/**
 * Owns the editor instance for a note: its schema, its save cycle, and the
 * bookkeeping that has to happen on every change.
 *
 * The extension set — and therefore the document schema — is chosen from the
 * note's kind, and the editor is rebuilt when that kind changes. Only one
 * instance exists at a time; a notepad's blocks are separate fields inside one
 * ProseMirror view, never separate views.
 */
export function useNoteDoc(note: Note): NoteDoc {
  const { updateNote, notes, loadLinks } = useNoteStore();

  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [outboundMentions, setOutboundMentions] = useState<Note[]>([]);

  const noteIdRef = useRef(note.id);
  const notesRef = useRef(notes);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The edit a pending debounce is holding. Kept so switching notes or closing
  // the editor inside the debounce window can still write it.
  const pendingSave = useRef<{ noteId: string; bodyJson: string } | null>(null);
  const outboundTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeLinkIds = useRef<Set<string>>(new Set());
  const activeWikiTargets = useRef<Set<string>>(new Set());

  noteIdRef.current = note.id;
  notesRef.current = notes;

  const editor = useEditor(
    {
      extensions: buildExtensions(note.kind),
      content: parseDoc(note.bodyJson, note.kind),
      // Pasted markdown renders as real nodes; copied selections leave as
      // markdown text rather than flattened plain text.
      editorProps: markdownClipboardProps,
      onUpdate: ({ editor }) => {
        const currentIds = collectLinkIds(editor.state.doc);
        for (const id of activeLinkIds.current) {
          if (!currentIds.has(id)) api.fragments.deleteLink(id).catch(() => {});
        }
        activeLinkIds.current = currentIds;

        const currentTargets = collectWikiLinkTargets(editor.state.doc);
        let linkDeleted = false;
        for (const toId of activeWikiTargets.current) {
          if (!currentTargets.has(toId)) {
            api.links.delete(noteIdRef.current, toId).catch(() => {});
            linkDeleted = true;
          }
        }
        activeWikiTargets.current = currentTargets;
        if (linkDeleted) loadLinks(noteIdRef.current);

        const text = editor.getText();
        setCharCount(text.length);
        setWordCount(text.trim() === '' ? 0 : text.trim().split(/\s+/).length);

        if (outboundTimer.current) clearTimeout(outboundTimer.current);
        outboundTimer.current = setTimeout(() => {
          setOutboundMentions(
            computeOutboundMentions(editor.state.doc, notesRef.current, noteIdRef.current),
          );
        }, MENTION_DEBOUNCE_MS);

        if (saveTimer.current) clearTimeout(saveTimer.current);
        pendingSave.current = {
          noteId: noteIdRef.current,
          bodyJson: JSON.stringify(editor.getJSON()),
        };
        saveTimer.current = setTimeout(() => {
          const pending = pendingSave.current;
          pendingSave.current = null;
          if (pending) updateNote(pending.noteId, { bodyJson: pending.bodyJson });
        }, SAVE_DEBOUNCE_MS);
      },
    },
    // A notepad and a note have different document schemas, so switching kind
    // requires a new editor rather than new content in the old one.
    [note.kind],
  );

  // Load a different note's content into the existing editor.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    // Write the outgoing note's pending edit before its content is replaced.
    // The payload carries its own note id, so it lands on the right note.
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
      const pending = pendingSave.current;
      pendingSave.current = null;
      if (pending && pending.noteId !== note.id) {
        updateNote(pending.noteId, { bodyJson: pending.bodyJson });
      }
    }
    editor.commands.setContent(parseDoc(note.bodyJson, note.kind), false);
    activeLinkIds.current = collectLinkIds(editor.state.doc);
    activeWikiTargets.current = collectWikiLinkTargets(editor.state.doc);

    const text = editor.getText();
    setCharCount(text.length);
    setWordCount(text.trim() === '' ? 0 : text.trim().split(/\s+/).length);
    setOutboundMentions(computeOutboundMentions(editor.state.doc, notesRef.current, note.id));
  }, [note.id, editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush a pending save rather than dropping it when the editor goes away —
  // closing a note within the debounce window would otherwise lose keystrokes.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (outboundTimer.current) clearTimeout(outboundTimer.current);
      const pending = pendingSave.current;
      pendingSave.current = null;
      if (pending) updateNote(pending.noteId, { bodyJson: pending.bodyJson });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { editor, wordCount, charCount, outboundMentions };
}
