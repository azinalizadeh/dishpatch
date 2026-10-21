import type { KeyboardEvent } from 'react';

interface StepperProps {
  /** Plural noun used in labels: "More mains", "Fewer mains". */
  noun: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

/** −/+ count control; the value is a spinbutton that also answers ArrowUp/ArrowDown. */
export function Stepper({ noun, value, min, max, onChange, disabled = false }: StepperProps) {
  const canDecrease = !disabled && value > min;
  const canIncrease = !disabled && value < max;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowUp' && canIncrease) onChange(value + 1);
    else if (event.key === 'ArrowDown' && canDecrease) onChange(value - 1);
    else return;
    event.preventDefault();
  }

  const button =
    'size-11 bg-surface text-xl text-ink cursor-pointer disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <span className="inline-flex items-center overflow-hidden rounded-md border-[1.5px] border-border-ui">
      <button
        type="button"
        className={button}
        aria-label={`Fewer ${noun}`}
        disabled={!canDecrease}
        onClick={() => onChange(value - 1)}
        onKeyDown={onKeyDown}
      >
        −
      </button>
      <span
        role="spinbutton"
        tabIndex={disabled ? -1 : 0}
        aria-label={noun.charAt(0).toUpperCase() + noun.slice(1)}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-live="polite"
        className="min-w-9 text-center font-bold"
        onKeyDown={onKeyDown}
      >
        {value}
      </span>
      <button
        type="button"
        className={button}
        aria-label={`More ${noun}`}
        disabled={!canIncrease}
        onClick={() => onChange(value + 1)}
        onKeyDown={onKeyDown}
      >
        +
      </button>
    </span>
  );
}
