import TaskItem from '@tiptap/extension-task-item';

let animInjected = false;
function ensureAnim() {
  if (animInjected || typeof document === 'undefined') return;
  animInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes corddb-check-pop {
      0%   { transform: scale(0.55); opacity: 0; }
      65%  { transform: scale(1.06); opacity: 1; }
      100% { transform: scale(1);    opacity: 1; }
    }
  `;
  document.head.appendChild(s);
}

const NS = 'http://www.w3.org/2000/svg';

function updateVisual(box: HTMLElement, tick: SVGPolylineElement, checked: boolean) {
  ensureAnim();
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#7aa2f7';

  box.style.background = checked ? accent + '28' : 'transparent';

  if (checked) {
    tick.setAttribute('stroke', accent);
    tick.style.opacity = '1';
    const parent = tick.parentElement;
    if (parent) {
      parent.removeChild(tick);
      tick.style.animation = '';
      void parent.getBoundingClientRect();
      tick.style.animation = 'corddb-check-pop 0.16s cubic-bezier(0.16, 1, 0.3, 1) both';
      parent.appendChild(tick);
    }
  } else {
    tick.style.opacity = '0';
    tick.style.animation = '';
  }
}

export const CustomTaskItem = TaskItem.configure({ nested: true }).extend({
  addNodeView() {
    const parentRenderer = this.parent?.();
    return (props) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = (parentRenderer as any)?.(props);
      if (!view) return {};

      const li = view.dom as HTMLElement;
      li.style.cssText = [
        'position: relative',
        'padding-left: 1.5em',
        'margin-bottom: 0.25em',
        'list-style: none',
        'display: block',
      ].join('; ');

      const label = li.querySelector<HTMLElement>(':scope > label');
      if (label) {
        label.style.cssText = [
          'position: absolute',
          'left: 0',
          'top: 0.2em',
          'line-height: 1',
          'cursor: pointer',
          'user-select: none',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'width: 1em',
          'height: 1em',
          'overflow: visible',
        ].join('; ');

        const input = label.querySelector<HTMLInputElement>('input[type="checkbox"]');
        if (input) {
          input.style.cssText = [
            'position: absolute',
            'inset: 0',
            'opacity: 0',
            'width: 100%',
            'height: 100%',
            'margin: 0',
            'cursor: pointer',
            'z-index: 1',
          ].join('; ');

          const box = document.createElement('span');
          box.style.cssText = [
            'display: block',
            'width: 13px',
            'height: 13px',
            'border-radius: 3px',
            'border: 1.5px solid rgba(128,128,128,0.45)',
            'flex-shrink: 0',
            'position: relative',
            'overflow: visible',
            'transition: background 0.12s ease',
          ].join('; ');

          const svg = document.createElementNS(NS, 'svg');
          svg.setAttribute('viewBox', '0 0 13 13');
          svg.style.cssText = [
            'position: absolute',
            'top: -1px',
            'left: -1px',
            'width: 15px',
            'height: 15px',
            'overflow: visible',
            'pointer-events: none',
          ].join('; ');

          const tick = document.createElementNS(NS, 'polyline');
          tick.setAttribute('points', '2,5.5 5,8.5 11,2.5');
          tick.setAttribute('stroke-width', '2');
          tick.setAttribute('fill', 'none');
          tick.setAttribute('stroke-linecap', 'round');
          tick.setAttribute('stroke-linejoin', 'round');
          tick.style.opacity = '0';

          svg.appendChild(tick);
          box.appendChild(svg);
          label.appendChild(box);

          const isChecked = () => li.getAttribute('data-checked') === 'true';
          updateVisual(box, tick, isChecked());

          const observer = new MutationObserver(() => updateVisual(box, tick, isChecked()));
          observer.observe(li, { attributes: true, attributeFilter: ['data-checked'] });

          const themeObserver = new MutationObserver(() => updateVisual(box, tick, isChecked()));
          themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-scheme'] });

          const origDestroy = view.destroy?.bind(view);
          view.destroy = () => {
            observer.disconnect();
            themeObserver.disconnect();
            origDestroy?.();
          };
        }
      }

      return view;
    };
  },
});
