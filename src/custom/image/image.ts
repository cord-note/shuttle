import Image from '@tiptap/extension-image';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import type { ShuttleContextRef } from '../../context';
import { retryUpload } from './upload';

/**
 * The official Image node with three additions: stored `src` values are
 * resolved through the host when rendered, uploads carry transient
 * `uploadId` / `uploadError` attributes, and clicking a failed image retries.
 */
export function shuttleImage(ctx: ShuttleContextRef) {
  return Image.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        src: {
          default: null,
          // `data-src` carries the platform-neutral stored value through an
          // HTML copy/paste round trip; `src` alone would leak the resolved
          // (host-specific) URL back in as the stored value.
          parseHTML: (el: HTMLElement) => el.getAttribute('data-src') ?? el.getAttribute('src'),
          renderHTML: (attrs: Record<string, unknown>) => {
            const src = attrs['src'] as string | null;
            return src ? { src: ctx.current.host.resolveFileSrc(src), 'data-src': src } : {};
          },
        },
        uploadId: { default: null, rendered: false },
        uploadError: {
          default: false,
          renderHTML: (attrs: Record<string, unknown>) => (attrs['uploadError']
            ? { 'data-upload-error': '', title: 'Upload failed — click to retry' }
            : {}),
        },
      };
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      const name = this.name;
      return [
        ...(this.parent?.() ?? []),
        new Plugin({
          key: new PluginKey('imageRetry'),
          props: {
            handleClickOn(_view, _pos, node) {
              const uploadId = node.attrs['uploadId'] as string | null;
              if (node.type.name !== name || !node.attrs['uploadError'] || !uploadId) return false;
              retryUpload(editor, ctx, uploadId);
              return true;
            },
          },
        }),
      ];
    },
  }).configure({ allowBase64: false });
}
