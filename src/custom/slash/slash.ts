import { Extension } from '@tiptap/core';
import Suggestion from '@tiptap/suggestion';
import { PluginKey } from '@tiptap/pm/state';
import { createElement } from 'react';
import type { ShuttleContextRef } from '../../context';
import type { ShuttleMode } from '../../host';
import { createSuggestionList } from '../../ui/SuggestionList';
import { suggestionPopup } from '../../ui/suggestionPopup';
import { filterSlashItems, type SlashItem } from './items';

/** Exported so tests can check the menu opens after a programmatic `/`. */
export const slashPluginKey = new PluginKey('slashCommand');

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
          items: ({ query }) => filterSlashItems(query, mode),
          command: ({ editor, range, props }) => props.run({ editor, range, ctx }),
          render: suggestionPopup(SlashList, { maxHeight: 260, maxWidth: 240 }),
        }),
      ];
    },
  });
}
