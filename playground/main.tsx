import { StrictMode, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { JSONContent } from '@tiptap/core';
import { ShuttleEditor, createFakeHost, type ShuttleMode } from '../src';
import '../src/styles/shuttle.css';

const NOTES = [
  { id: 'n-alpha', title: 'Alpha' },
  { id: 'n-beta', title: 'Beta' },
  { id: 'n-gamma', title: 'Gamma Ray' },
];

function App() {
  const [mode, setMode] = useState<ShuttleMode>('notepad');
  const [docKey, setDocKey] = useState('n-alpha');
  const [docs, setDocs] = useState<Record<string, JSONContent>>({});
  const [stats, setStats] = useState({ words: 0, characters: 0 });
  const host = useMemo(() => {
    const h = createFakeHost({
      notes: NOTES,
      blocks: [{ id: 'b-beta-1', noteId: 'n-beta', type: 'paragraph', text: 'A block that lives in Beta', level: null }],
      resolved: [{
        blockId: 'b-beta-1', noteId: 'n-beta', noteTitle: 'Beta',
        content: { type: 'paragraph', content: [{ type: 'text', text: 'A block that lives in Beta' }] },
      }],
    });
    return { ...h, openNote: (id: string) => setDocKey(id) };
  }, []);

  return (
    <main>
      <header>
        {NOTES.map((n) => (
          <button key={n.id} onClick={() => setDocKey(n.id)} disabled={n.id === docKey}>{n.title}</button>
        ))}
        <button onClick={() => setMode(mode === 'note' ? 'notepad' : 'note')}>mode: {mode}</button>
        <span className="stats">{stats.words} words · {stats.characters} chars</span>
      </header>
      <ShuttleEditor
        docKey={docKey}
        doc={docs[docKey] ?? null}
        mode={mode}
        host={host}
        outline
        onChange={(key, doc) => setDocs((d) => ({ ...d, [key]: doc }))}
        onStats={setStats}
      />
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
