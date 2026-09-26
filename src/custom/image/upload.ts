import type { Editor, JSONContent } from '@tiptap/core';
import { nanoid } from 'nanoid';
import type { ShuttleContextRef } from '../../context';

interface Pending {
  file: File;
  preview: string;
}

/** Files of uploads still in flight or failed, per editor, for retry. */
const pendingByEditor = new WeakMap<Editor, Map<string, Pending>>();

function pendingFor(editor: Editor): Map<string, Pending> {
  let map = pendingByEditor.get(editor);
  if (!map) { map = new Map(); pendingByEditor.set(editor, map); }
  return map;
}

function setImageAttrs(editor: Editor, uploadId: string, attrs: Record<string, unknown>): void {
  if (editor.isDestroyed) return;
  const { tr } = editor.state;
  let found = false;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs['uploadId'] === uploadId) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
      found = true;
    }
  });
  if (found) editor.view.dispatch(tr);
}

async function runUpload(editor: Editor, ctx: ShuttleContextRef, uploadId: string): Promise<void> {
  const pending = pendingFor(editor).get(uploadId);
  if (!pending) return;
  try {
    const { src } = await ctx.current.host.uploadFile(pending.file);
    setImageAttrs(editor, uploadId, { src, uploadId: null, uploadError: false });
    URL.revokeObjectURL(pending.preview);
    pendingFor(editor).delete(uploadId);
  } catch (error) {
    ctx.current.host.log('error', 'Image upload failed', { name: pending.file.name, error: String(error) });
    setImageAttrs(editor, uploadId, { uploadError: true });
  }
}

/**
 * Insert image files at `pos` (or the selection) and upload them. Each image
 * shows a local preview until the host returns its permanent `src`.
 */
export async function insertImageFiles(
  editor: Editor,
  ctx: ShuttleContextRef,
  files: File[],
  pos?: number,
): Promise<void> {
  const uploads: Promise<void>[] = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const uploadId = nanoid(10);
    const preview = URL.createObjectURL(file);
    pendingFor(editor).set(uploadId, { file, preview });
    const node = { type: 'image', attrs: { src: preview, alt: file.name, uploadId } };
    if (pos === undefined) editor.chain().focus().insertContent(node).run();
    else editor.chain().insertContentAt(pos, node).run();
    uploads.push(runUpload(editor, ctx, uploadId));
  }
  await Promise.all(uploads);
}

/** Retry a failed upload, if its file is still held. */
export function retryUpload(editor: Editor, ctx: ShuttleContextRef, uploadId: string): void {
  if (!pendingFor(editor).has(uploadId)) return;
  setImageAttrs(editor, uploadId, { uploadError: false });
  void runUpload(editor, ctx, uploadId);
}

/**
 * The document as it should be saved: images without a permanent `src` yet
 * (uploading or failed) are left out, so nothing points at a blob URL.
 */
export function stripPendingUploads(doc: JSONContent): JSONContent {
  const walk = (node: JSONContent): JSONContent | null => {
    if (node.type === 'image' && node.attrs?.['uploadId']) return null;
    if (!node.content) return node;
    const content = node.content.map(walk).filter((n): n is JSONContent => n !== null);
    return { ...node, content };
  };
  const out = walk(doc) ?? { type: 'doc', content: [] };
  if (out.type === 'doc' && (out.content?.length ?? 0) === 0) return { type: 'doc', content: [{ type: 'paragraph' }] };
  return out;
}
