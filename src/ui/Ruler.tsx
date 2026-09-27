import { useEffect, useRef, useState } from 'react';

export interface LineWidthRange {
  min: number;
  max: number;
}

const STEP = 10;
const KEY_STEP = 20;
const KEY_STEP_LARGE = 100;

interface RulerProps {
  /** The text column's width in px, as the host stores it. */
  width: number;
  range: LineWidthRange;
  /** Width while a handle is being dragged, so the column can follow live. */
  onPreview: (width: number | null) => void;
  onChange: (width: number) => void;
}

/**
 * A strip under the toolbar with a handle at each edge of the text column.
 * The column stays centred, so dragging either handle changes the width by
 * twice the distance moved. The width is committed on release.
 */
export function Ruler({ width, range, onPreview, onChange }: RulerProps) {
  const track = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const latest = useRef({ onPreview, onChange, range });
  latest.current = { onPreview, onChange, range };

  const clamp = (w: number): number => {
    const available = track.current?.getBoundingClientRect().width ?? Infinity;
    const max = Math.min(latest.current.range.max, available);
    return Math.max(latest.current.range.min, Math.min(max, Math.round(w / STEP) * STEP));
  };

  const widthAt = (clientX: number): number => {
    const rect = track.current?.getBoundingClientRect();
    if (!rect) return width;
    return clamp(2 * Math.abs(clientX - (rect.left + rect.width / 2)));
  };

  useEffect(() => {
    if (!dragging) return;
    const move = (e: MouseEvent): void => latest.current.onPreview(widthAt(e.clientX));
    const up = (e: MouseEvent): void => {
      setDragging(false);
      latest.current.onPreview(null);
      latest.current.onChange(widthAt(e.clientX));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging]); // eslint-disable-line react-hooks/exhaustive-deps

  const handle = (side: 'left' | 'right') => (
    <div
      className="sh-ruler-handle"
      data-side={side}
      role="slider"
      tabIndex={0}
      aria-label={side === 'left' ? 'Left margin' : 'Right margin'}
      aria-orientation="horizontal"
      aria-valuemin={range.min}
      aria-valuemax={Number.isFinite(range.max) ? range.max : undefined}
      aria-valuenow={width}
      aria-valuetext={`${width}px text width`}
      onPointerDown={(e) => { e.preventDefault(); setDragging(true); }}
      onKeyDown={(e) => {
        const outward = side === 'left' ? 'ArrowLeft' : 'ArrowRight';
        const inward = side === 'left' ? 'ArrowRight' : 'ArrowLeft';
        if (e.key !== outward && e.key !== inward) return;
        e.preventDefault();
        const step = e.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
        onChange(clamp(width + (e.key === outward ? step : -step)));
      }}
    />
  );

  return (
    <div className={`sh-ruler${dragging ? ' is-dragging' : ''}`} ref={track}>
      <div className="sh-ruler-column">
        {handle('left')}
        {handle('right')}
      </div>
    </div>
  );
}
