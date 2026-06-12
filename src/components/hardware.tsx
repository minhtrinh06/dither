import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

/* ---------------------------------------------------------------------------
   Tactile hardware primitives for the DITHER DT-1 terminal.
   Every control is a real focusable element with full keyboard support;
   the physicality is purely presentational.
--------------------------------------------------------------------------- */

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const snap = (v: number, step: number) => Math.round(v / step) * step;
const slug = (s: string) => s.toLowerCase().replace(/\W+/g, '-');

/* ---- Rotary knob (role=slider, drag vertically or use arrow keys) ---- */

export function Knob(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const { label, min, max, step, value, onChange } = props;
  const format = props.format ?? String;
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; v: number } | null>(null);
  const id = `knob-${slug(label)}`;

  const set = (v: number) => {
    const next = clamp(snap(v, step), min, max);
    if (next !== value) onChange(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    drag.current = { y: e.clientY, v: value };
    setDragging(true);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    // A ~150px vertical travel sweeps the whole range.
    const dv = ((drag.current.y - e.clientY) / 150) * (max - min);
    set(drag.current.v + dv);
  };

  const endDrag = () => {
    drag.current = null;
    setDragging(false);
  };

  const big = Math.max(step, snap((max - min) / 8, step));
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = value + step;
    else if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = value - step;
    else if (e.key === 'PageUp') next = value + big;
    else if (e.key === 'PageDown') next = value - big;
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    set(next);
  };

  const angle = -135 + ((value - min) / (max - min)) * 270;

  return (
    <div className="knob-block">
      <span className="hw-label" id={id}>
        {label}
      </span>
      <div
        className={`knob ${dragging ? 'knob-dragging' : ''}`}
        role="slider"
        tabIndex={0}
        aria-labelledby={id}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-orientation="vertical"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      >
        <span className="knob-ticks" aria-hidden="true">
          {Array.from({ length: 11 }, (_, i) => (
            <span
              key={i}
              className="knob-tick"
              style={{ transform: `rotate(${-135 + i * 27}deg)` }}
            />
          ))}
        </span>
        <div className="knob-cap" style={{ transform: `rotate(${angle}deg)` }}>
          <span className="knob-pointer" />
        </div>
      </div>
      <span className="lcd">{format(value)}</span>
    </div>
  );
}

/* ---- Latching key group (radiogroup with roving tabindex) ---- */

export function KeyGroup<T extends string>(props: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  items: { id: T; title: string; render: ReactNode }[];
  className?: string;
}) {
  const { label, value, onChange, items, className } = props;
  const refs = useRef(new Map<T, HTMLButtonElement>());

  const move = (e: KeyboardEvent<HTMLButtonElement>, dir: 1 | -1 | 'first' | 'last') => {
    e.preventDefault();
    const i = items.findIndex((it) => it.id === value);
    const next =
      dir === 'first'
        ? items[0]
        : dir === 'last'
          ? items[items.length - 1]
          : items[(i + dir + items.length) % items.length];
    onChange(next.id);
    refs.current.get(next.id)?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') move(e, 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') move(e, -1);
    else if (e.key === 'Home') move(e, 'first');
    else if (e.key === 'End') move(e, 'last');
  };

  return (
    <div className={`keygroup ${className ?? ''}`} role="radiogroup" aria-label={label}>
      {items.map((it) => {
        const checked = it.id === value;
        return (
          <button
            key={it.id}
            ref={(el) => {
              if (el) refs.current.set(it.id, el);
              else refs.current.delete(it.id);
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            title={it.title}
            className={`key ${checked ? 'key-down' : ''}`}
            onClick={() => onChange(it.id)}
            onKeyDown={onKeyDown}
          >
            {it.render}
            <span className="key-led" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/* ---- Slide fader (native range input in a machined slot) ---- */

export function Fader(props: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const format = props.format ?? String;
  return (
    <label className="fader-block">
      <span className="hw-label">{props.label}</span>
      <span className="lcd">{format(props.value)}</span>
      <input
        className="fader"
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        aria-valuetext={format(props.value)}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

/* ---- Momentary push button ---- */

export function PushButton(props: {
  children: ReactNode;
  onClick: () => void;
  variant?: 'plain' | 'primary';
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`pbtn ${props.variant === 'primary' ? 'pbtn-primary' : ''} ${props.className ?? ''}`}
      disabled={props.disabled}
      aria-label={props.ariaLabel}
      onClick={props.onClick}
    >
      <span className="pbtn-cap">{props.children}</span>
    </button>
  );
}

/* ---- Status LED ---- */

export function Led(props: {
  on: boolean;
  color: 'green' | 'amber' | 'red';
  blink?: boolean;
  label?: string;
}) {
  return (
    <span className="led-block">
      <span
        className={`led led-${props.color} ${props.on ? 'led-on' : ''} ${
          props.on && props.blink ? 'led-blink' : ''
        }`}
        aria-hidden="true"
      />
      {props.label && <span className="led-label">{props.label}</span>}
    </span>
  );
}
