import { describe, it, expect, afterEach } from 'bun:test';
import { Editor, type JSONContent } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { createFakeHost, type FakeHost } from '../src/testing/fakeHost';
import { noopEvents, type ShuttleContextRef } from '../src/context';
import { shuttleImage } from '../src/custom/image/image';
import { insertImageFiles, stripPendingUploads } from '../src/custom/image/upload';

let editor: Editor | null = null;
afterEach(() => { editor?.destroy(); editor = null; });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function make(host: FakeHost): { e: Editor; ctx: ShuttleContextRef } {
  const ctx: ShuttleContextRef = { current: { host, events: noopEvents, docKey: 'n' } };
  editor = new Editor({
    element: document.createElement('div'),
    extensions: [StarterKit, shuttleImage(ctx)],
    content: '<p>x</p>',
  });
  return { e: editor, ctx };
}

const images = (e: Editor) => {
  const out: Record<string, unknown>[] = [];
  e.state.doc.descendants((n) => { if (n.type.name === 'image') out.push(n.attrs); });
  return out;
};

const png = () => new File(['x'], 'pic.png', { type: 'image/png' });

describe('image upload', () => {
  it('replaces the preview with the uploaded src', async () => {
    const host = createFakeHost();
    const { e, ctx } = make(host);
    await insertImageFiles(e, ctx, [png()]);
    await sleep(0);
    expect(images(e)[0]).toMatchObject({ src: 'attachment:up1', uploadId: null, uploadError: false });
  });

  it('marks a failed upload and logs it', async () => {
    const host = createFakeHost({ uploadFails: true });
    const { e, ctx } = make(host);
    await insertImageFiles(e, ctx, [png()]);
    await sleep(0);
    expect(images(e)[0]).toMatchObject({ uploadError: true });
    expect(host.calls.logs[0]?.level).toBe('error');
  });

  it('resolves stored src through the host when rendering', () => {
    const host = createFakeHost();
    const { e } = make(host);
    e.commands.setContent({ type: 'doc', content: [{ type: 'image', attrs: { src: 'attachment:abc' } }] });
    expect(e.getHTML()).toContain('src="https://fake.local/abc"');
    expect(JSON.stringify(e.getJSON())).toContain('"src":"attachment:abc"');
  });

  it('ignores non-image files', async () => {
    const { e, ctx } = make(createFakeHost());
    await insertImageFiles(e, ctx, [new File(['x'], 'a.txt', { type: 'text/plain' })]);
    expect(images(e)).toEqual([]);
  });

  it('does not create an undo step for the background update; undo removes the whole insert', async () => {
    const host = createFakeHost();
    const originalUpload = host.uploadFile.bind(host);
    host.uploadFile = (file: File) => new Promise((resolve, reject) => {
      setTimeout(() => { originalUpload(file).then(resolve, reject); }, 600);
    });
    const { e, ctx } = make(host);
    await insertImageFiles(e, ctx, [png()]);
    e.commands.undo();
    const imgs = images(e);
    const stillBad = imgs.some(
      (a) => (typeof a['src'] === 'string' && (a['src'] as string).startsWith('blob:')) || a['uploadId'] !== null,
    );
    expect(stillBad).toBe(false);
  });

  it('keeps the order of several files dropped at one position', async () => {
    const host = createFakeHost();
    const { e, ctx } = make(host);
    const files = [
      new File(['a'], 'first.png', { type: 'image/png' }),
      new File(['b'], 'second.png', { type: 'image/png' }),
      new File(['c'], 'third.png', { type: 'image/png' }),
    ];
    await insertImageFiles(e, ctx, files);
    await sleep(0);
    expect(images(e).map((a) => a['alt'])).toEqual(['first.png', 'second.png', 'third.png']);
  });

  it('warns and cleans up when the image is gone by the time a successful upload resolves', async () => {
    const host = createFakeHost();
    const originalUpload = host.uploadFile.bind(host);
    host.uploadFile = (file: File) => new Promise((resolve, reject) => {
      setTimeout(() => { originalUpload(file).then(resolve, reject); }, 20);
    });
    const { e, ctx } = make(host);
    const pending = insertImageFiles(e, ctx, [png()]);
    e.commands.setContent('<p>other</p>');
    await pending;
    expect(images(e)).toEqual([]);
    expect(host.calls.logs.some((l) => l.level === 'warn')).toBe(true);
  });

  it('resolves stored src through data-src on HTML round trip', () => {
    const host = createFakeHost();
    const { e } = make(host);
    e.commands.setContent({ type: 'doc', content: [{ type: 'image', attrs: { src: 'attachment:abc' } }] });
    const html = e.getHTML();
    e.commands.setContent(html);
    expect(JSON.stringify(e.getJSON())).toContain('"src":"attachment:abc"');
  });
});

describe('stripPendingUploads', () => {
  it('drops images still uploading and keeps a valid doc', () => {
    const doc: JSONContent = { type: 'doc', content: [{ type: 'image', attrs: { src: 'blob:1', uploadId: 'u1' } }] };
    expect(stripPendingUploads(doc)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
  it('keeps finished images', () => {
    const doc: JSONContent = { type: 'doc', content: [{ type: 'image', attrs: { src: 'attachment:a', uploadId: null } }] };
    expect(stripPendingUploads(doc)).toEqual(doc);
  });
  it('drops a blob src even without an uploadId', () => {
    const doc: JSONContent = { type: 'doc', content: [{ type: 'image', attrs: { src: 'blob:x', uploadId: null } }] };
    expect(stripPendingUploads(doc)).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
  });
  it('replaces an emptied parent (not just doc) with a paragraph, and stays a valid document', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'blockquote', content: [{ type: 'image', attrs: { src: 'blob:1', uploadId: 'u1' } }] }],
    };
    const result = stripPendingUploads(doc);
    expect(result).toEqual({
      type: 'doc',
      content: [{ type: 'blockquote', content: [{ type: 'paragraph' }] }],
    });
    const host = createFakeHost();
    const ctx: ShuttleContextRef = { current: { host, events: noopEvents, docKey: 'n' } };
    const e = new Editor({
      element: document.createElement('div'),
      extensions: [StarterKit, shuttleImage(ctx)],
    });
    expect(() => e.schema.nodeFromJSON(result).check()).not.toThrow();
    e.destroy();
  });
});
