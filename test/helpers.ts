import { Editor, type JSONContent } from '@tiptap/core';
import { buildExtensions } from '../src/extensions';
import { createFakeHost, type FakeHost } from '../src/testing/fakeHost';
import { noopEvents, type ShuttleContextRef, type ShuttleUiEvents } from '../src/context';
import type { ShuttleMode } from '../src/host';

export interface Made {
  editor: Editor;
  host: FakeHost;
  ctx: ShuttleContextRef;
}

export function makeEditor(opts: {
  mode?: ShuttleMode;
  content?: JSONContent | string;
  host?: FakeHost;
  events?: Partial<ShuttleUiEvents>;
} = {}): Made {
  const host = opts.host ?? createFakeHost();
  const ctx: ShuttleContextRef = { current: { host, events: { ...noopEvents, ...opts.events }, docKey: 'n-self' } };
  const editor = new Editor({
    element: document.createElement('div'),
    extensions: buildExtensions(opts.mode ?? 'note', ctx, { reactViews: false, twitchParent: 'localhost' }),
    content: opts.content ?? '<p></p>',
  });
  return { editor, host, ctx };
}

/** Drop generated ids so documents can be compared structurally. */
export function stripIds(node: JSONContent): JSONContent {
  const attrs = node.attrs ? { ...node.attrs } : undefined;
  if (attrs) {
    delete attrs['blockId'];
    if (node.type === 'heading') { delete attrs['id']; delete attrs['data-toc-id']; }
  }
  return {
    ...node,
    ...(attrs ? { attrs } : {}),
    ...(node.content ? { content: node.content.map(stripIds) } : {}),
  };
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
