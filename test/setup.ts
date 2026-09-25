// A Tiptap `Editor` creates an `EditorView`, which needs a DOM. Registered once
// for the whole run, before any test module builds an editor.
import { GlobalRegistrator } from '@happy-dom/global-registrator';

if (typeof globalThis.document === 'undefined') {
  GlobalRegistrator.register();
}

// Lets react-dom's `act` flush effects without warnings.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
