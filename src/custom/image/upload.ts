import type { Editor, JSONContent } from '@tiptap/core';
import { nanoid } from 'nanoid';
import type { ShuttleContextRef } from '../../context';

interface Pending {
  file: File;
  preview: string;
}

const WARN_MESSAGE = 'Upload finished after its image was removed or its note was closed';

/** Files of uploads still in flight or failed, per editor, for retry. */
const pendingByEditor = new WeakMap<Editor, Map<string, Pending>>();

function pendingFor(editor: Editor): Map<string, Pending> {
  let map = pendingByEditor.get(editor);
  if (!map) { map = new Map(); pendingByEditor.set(editor, map); }
  return map;
}

/**
 * Patches the image node carrying `uploadId`, if it is still in the
 * document. The update never enters undo history — it is a background
 * status change, not a user edit, so undoing the original insert must
 * remove the image outright rather than reverting it to its preview.
 * Returns whether a matching node was found.
 */
function setImageAttrs(editor: Editor, uploadId: string, attrs: Record<string, unknown>): boolean {
  if (editor.isDestroyed) return false;
  const { tr } = editor.state;
  let found = false;
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'image' && node.attrs['uploadId'] === uploadId) {
      tr.setNodeMarkup(pos, undefined, { ...node.attrs, ...attrs });
      found = true;
    }
  });
  if (found) {
    tr.setMeta('addToHistory', false);
    editor.view.dispatch(tr);
  }
  return found;
}

async function runUpload(editor: Editor, ctx: ShuttleContextRef, uploadId: string): Promise<void> {
  const pending = pendingFor(editor).get(uploadId);
  if (!pending) return;
  try {
    const { src } = await ctx.current.host.uploadFile(pending.file);
    const found = setImageAttrs(editor, uploadId, { src, uploadId: null, uploadError: false });
    if (!found) {
      ctx.current.host.log('warn', WARN_MESSAGE, { name: pending.file.name, src });
    }
    URL.revokeObjectURL(pending.preview);
    pendingFor(editor).delete(uploadId);
  } catch (error) {
    const found = setImageAttrs(editor, uploadId, { uploadError: true });
    if (found) {
      ctx.current.host.log('error', 'Image upload failed', { name: pending.file.name, error: String(error) });
    } else {
      ctx.current.host.log('warn', WARN_MESSAGE, { name: pending.file.name, error: String(error) });
      URL.revokeObjectURL(pending.preview);
      pendingFor(editor).delete(uploadId);
    }
  }
}

/**
 * Insert image files at `pos` (or the selection) and upload them. Each image
 * shows a local preview until the host returns its permanent `src`. All
 * nodes are built and inserted together, in order, before any upload starts,
 * so several files dropped at one position land in the order given.
 */
export async function insertImageFiles(
  editor: Editor,
  ctx: ShuttleContextRef,
  files: File[],
  pos?: number,
): Promise<void> {
  const imageFiles = files.filter((file) => file.type.startsWith('image/'));
  if (imageFiles.length === 0) return;

  const uploadIds: string[] = [];
  const nodes = imageFiles.map((file) => {
    const uploadId = nanoid(10);
    const preview = URL.createObjectURL(file);
    pendingFor(editor).set(uploadId, { file, preview });
    uploadIds.push(uploadId);
    return { type: 'image', attrs: { src: preview, alt: file.name, uploadId } };
  });

  if (pos === undefined) editor.chain().focus().insertContent(nodes).run();
  else editor.chain().insertContentAt(pos, nodes).run();

  await Promise.all(uploadIds.map((uploadId) => runUpload(editor, ctx, uploadId)));
}

/** Retry a failed upload, if its file is still held. */
export function retryUpload(editor: Editor, ctx: ShuttleContextRef, uploadId: string): void {
  if (!pendingFor(editor).has(uploadId)) return;
  setImageAttrs(editor, uploadId, { uploadError: false });
  void runUpload(editor, ctx, uploadId);
}

function isPending(attrs: Record<string, unknown> | undefined): boolean {
  if (!attrs) return false;
  if (attrs['uploadId']) return true;
  const src = attrs['src'];
  return typeof src === 'string' && src.startsWith('blob:');
}

function stripNode(node: JSONContent): JSONContent | null {
  if (node.type === 'image' && isPending(node.attrs)) return null;
  if (!node.content) return node;
  const content = node.content.map(stripNode).filter((n): n is JSONContent => n !== null);
  if (node.content.length > 0 && content.length === 0) {
    return { ...node, content: [{ type: 'paragraph' }] };
  }
  return { ...node, content };
}

/**
 * The document as it should be saved: images without a permanent `src` yet
 * (uploading, failed, or still pointing at a blob preview) are left out, so
 * nothing points at a blob URL. A node emptied by this never ends up with no
 * content — it gets a single empty paragraph instead, which also covers
 * `doc` itself, so there is no special case for the root.
 */
export function stripPendingUploads(doc: JSONContent): JSONContent {
  return stripNode(doc) ?? { type: 'doc', content: [{ type: 'paragraph' }] };
}
