import type { ShuttleHost } from './host';

export interface MathEditRequest {
  kind: 'inline' | 'block';
  latex: string;
  pos: number;
}

/**
 * Requests from inside the editor for UI the React layer owns. Extensions
 * cannot open React modals themselves, so they ask through these.
 */
export interface ShuttleUiEvents {
  openRefPicker(): void;
  editMath(request: MathEditRequest): void;
  openFind(): void;
  pickImage(): void;
}

export interface ShuttleContext {
  host: ShuttleHost;
  events: ShuttleUiEvents;
  /** Identity of the loaded document (Cord: the note id). */
  docKey: string;
}

/**
 * Extensions are built once per editor but the host, events and document can
 * change underneath them, so they read through a ref, never a captured value.
 */
export interface ShuttleContextRef {
  current: ShuttleContext;
}

export const noopEvents: ShuttleUiEvents = {
  openRefPicker() {},
  editMath() {},
  openFind() {},
  pickImage() {},
};
