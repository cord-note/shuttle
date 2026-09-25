import { ReactRenderer } from '@tiptap/react';
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import type { KeyHandlerRef, SuggestionListProps } from './SuggestionList';

export interface PopupSize {
  maxHeight: number;
  maxWidth: number;
}

type ListComponent<Item> = ForwardRefExoticComponent<SuggestionListProps<Item> & RefAttributes<KeyHandlerRef>>;

/**
 * Suggestion `render` factory: mounts the list in a fixed-position wrapper,
 * flips it above the caret when there is no room below and keeps it on screen.
 */
export function suggestionPopup<Item>(List: ListComponent<Item>, size: PopupSize) {
  return () => {
    let renderer: ReactRenderer<KeyHandlerRef, SuggestionListProps<Item>> | null = null;
    let wrapper: HTMLDivElement | null = null;
    // Suggestion reports `items: []` with `loading: true` before every fetch;
    // keep showing the last results meanwhile instead of flashing "empty".
    let shown: Item[] = [];

    const listProps = (props: SuggestionProps<Item, Item>): SuggestionListProps<Item> => {
      if (!props.loading) shown = props.items;
      return { items: shown, command: props.command, loading: props.loading };
    };

    const place = (clientRect: (() => DOMRect | null) | null | undefined): void => {
      const rect = clientRect?.();
      if (!wrapper || !rect) return;
      const below = rect.bottom + 4;
      const top = below + size.maxHeight > window.innerHeight ? rect.top - size.maxHeight - 4 : below;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - size.maxWidth - 8));
      wrapper.style.top = `${top}px`;
      wrapper.style.left = `${left}px`;
    };

    const close = (): void => {
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
        place(props.clientRect);
      },
      onUpdate(props: SuggestionProps<Item, Item>) {
        renderer?.updateProps(listProps(props));
        place(props.clientRect);
      },
      onKeyDown(props: SuggestionKeyDownProps): boolean {
        if (props.event.key === 'Escape') { close(); return true; }
        return renderer?.ref?.onKeyDown({ event: props.event }) ?? false;
      },
      onExit: close,
    };
  };
}
