interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

/** On/off control (03-design.md › host): a `role=switch` button, toggled by click, Enter or Space. */
export function Switch({ label, checked, onChange, disabled = false }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-14 shrink-0 cursor-pointer rounded-pill border-[1.5px] transition-colors duration-[200ms] ease-dp after:absolute after:-inset-2 after:content-[''] disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'border-primary bg-primary' : 'border-border-ui bg-border-ui'
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute top-[2px] left-[2px] size-6 rounded-full bg-surface shadow-e1 transition-transform duration-[200ms] ease-dp motion-reduce:transition-none ${
          checked ? 'translate-x-6' : ''
        }`}
      />
    </button>
  );
}
