import { ReactRenderer } from '@tiptap/react';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { KeyHandlerRef, SuggestionListProps } from './SuggestionList';
import { followViewport, isAnchorVisible, positionNear } from './anchor';

export interface PopupSize {
  maxHeight: number;
  maxWidth: number;
}

type ListComponent<Item> = ForwardRefExoticComponent<SuggestionListProps<Item> & RefAttributes<KeyHandlerRef>>;

/**
 * Suggestion `render` factory: mounts the list in a fixed-position wrapper next
 * to the caret, flips it above when there is no room below, and follows the
 * caret while anything scrolls (hiding while the caret is scrolled out of view).
 */
export function suggestionPopup<Item>(List: ListComponent<Item>, size: PopupSize) {
  return () => {
    let renderer: ReactRenderer<KeyHandlerRef, SuggestionListProps<Item>> | null = null;
    let wrapper: HTMLDivElement | null = null;
    // Suggestion reports `items: []` with `loading: true` before every fetch;
    // keep showing the last results meanwhile instead of flashing "empty".
    let shown: Item[] = [];
    let anchor: (() => DOMRect | null) | null | undefined = null;
    let editorDom: Element | null = null;
    let unfollow: (() => void) | null = null;

    const listProps = (props: SuggestionProps<Item, Item>): SuggestionListProps<Item> => {
      if (!props.loading) shown = props.items;
      return { items: shown, command: props.command, loading: props.loading };
    };

    const place = (): void => {
      const rect = anchor?.();
      if (!wrapper || !rect) return;
      const visible = !editorDom || isAnchorVisible(rect, editorDom);
      wrapper.style.visibility = visible ? '' : 'hidden';
      if (visible) positionNear(wrapper, rect, { width: size.maxWidth, height: size.maxHeight });
    };

    const close = (): void => {
      unfollow?.();
      unfollow = null;
      wrapper?.remove();
      renderer?.destroy();
      wrapper = null;
      renderer = null;
      shown = [];
    };

    return {
      onStart(props: SuggestionProps<Item, Item>) {
        renderer = new ReactRenderer(List, {
          props: listProps(props),
          editor: props.editor,
        });
        wrapper = document.createElement('div');
        wrapper.className = 'sh-popup-anchor';
        wrapper.appendChild(renderer.element);
        document.body.appendChild(wrapper);
        anchor = props.clientRect;
        editorDom = props.editor.view.dom;
        unfollow = followViewport(place);
        place();
      },
      onUpdate(props: SuggestionProps<Item, Item>) {
        renderer?.updateProps(listProps(props));
        anchor = props.clientRect;
        place();
      },
      onKeyDown(props: SuggestionKeyDownProps): boolean {
        if (props.event.key === 'Escape') { close(); return true; }
        return renderer?.ref?.onKeyDown({ event: props.event }) ?? false;
      },
      onExit: close,
    };
  };
}
