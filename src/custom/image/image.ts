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
          parseHTML: (el: HTMLElement) => el.getAttribute('src'),
          renderHTML: (attrs: Record<string, unknown>) => {
            const src = attrs['src'] as string | null;
            return src ? { src: ctx.current.host.resolveFileSrc(src) } : {};
          },
        },
        uploadId: { default: null, rendered: false },
        uploadError: {
          default: false,
          renderHTML: (attrs: Record<string, unknown>) => (attrs['uploadError'] ? { 'data-upload-error': '' } : {}),
        },
      };
    },

    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        ...(this.parent?.() ?? []),
        new Plugin({
          key: new PluginKey('imageRetry'),
          props: {
            handleClickOn(_view, _pos, node) {
              const uploadId = node.attrs['uploadId'] as string | null;
              if (node.type.name !== 'image' || !node.attrs['uploadError'] || !uploadId) return false;
              retryUpload(editor, ctx, uploadId);
              return true;
            },
          },
        }),
      ];
    },
  }).configure({ allowBase64: false });
}
