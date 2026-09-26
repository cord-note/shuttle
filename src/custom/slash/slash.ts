import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { createElement } from 'react';
import type { ShuttleContextRef } from '../../context';
import type { ShuttleMode } from '../../host';
import { createSuggestionList } from '../../ui/SuggestionList';
import { suggestionPopup } from '../../ui/suggestionPopup';
import { slashPluginKey } from '../pluginKeys';
import { filterSlashItems, type SlashItem } from './items';

export { slashPluginKey };

const SlashList = createSuggestionList<SlashItem>({
  itemKey: (i) => i.title,
  group: (i) => i.group,
  renderItem: (i) => [
    createElement('span', { key: 'i', className: 'sh-popup-icon' }, i.icon),
    createElement('span', { key: 't' }, i.title),
  ],
  empty: 'No results',
});

/** The `/` menu, on the official Suggestion utility. */
export function slashCommand(ctx: ShuttleContextRef, mode: ShuttleMode) {
  return Extension.create({
    name: 'slashCommand',
    addProseMirrorPlugins() {
      return [
        Suggestion<SlashItem, SlashItem>({
          pluginKey: slashPluginKey,
          editor: this.editor,
          char: '/',
          allowSpaces: false,
          startOfLine: false,
          // Never in code: a `/` there is text, and "Text" would unwrap the code block.
          allow: ({ state, range }) => {
            const $from = state.doc.resolve(range.from);
            return !$from.parent.type.spec.code && !$from.marks().some((m) => m.type.spec.code);
          },
          items: ({ query }) => filterSlashItems(query, mode),
          command: ({ editor, range, props }) => props.run({ editor, range, ctx }),
          render: suggestionPopup(SlashList, { maxHeight: 260, maxWidth: 240 }),
        }),
      ];
    },
  });
}
