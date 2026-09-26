import { PluginKey } from '@tiptap/pm/state';

/**
 * Keys of the suggestion plugins, in a module with no React dependency so
 * that code which only needs to read their state (keybindings, tests) does
 * not pull in the popup views.
 */

/** The `/` menu. Exported so tests can check the menu opens after a programmatic `/`. */
export const slashPluginKey = new PluginKey('slashCommand');

/** The `[[` note-link autocomplete. */
export const wikiLinkPluginKey = new PluginKey('wikiLinkSuggestion');
