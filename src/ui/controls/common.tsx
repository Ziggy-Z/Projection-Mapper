/** Small shared controls and the 16px/1.25px-stroke icon set. */

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconChevronUp(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...strokeProps}>
      <path d="M4 10l4-4 4 4" />
    </svg>
  );
}

export function IconChevronDown(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...strokeProps}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function IconCross(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...strokeProps}>
      <path d="M5 5l6 6M11 5l-6 6" />
    </svg>
  );
}

export function IconPlus(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...strokeProps}>
      <path d="M8 4v8M4 8h8" />
    </svg>
  );
}

export function IconDuplicate(): React.ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" {...strokeProps}>
      <rect x="5.5" y="5.5" width="7" height="7" rx="1" />
      <path d="M10.5 3.5h-7v7" />
    </svg>
  );
}

export function IconButton(props: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={props.danger ? 'icon-btn danger' : 'icon-btn'}
      title={props.title}
      aria-label={props.title}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

/** Flat square toggle — a lit indicator, not a consumer switch. */
export function Toggle(props: {
  label?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title?: string;
}): React.ReactElement {
  return (
    <label className="toggle" title={props.title}>
      <button
        type="button"
        role="switch"
        aria-checked={props.checked}
        aria-label={props.label}
        className={props.checked ? 'toggle-box on' : 'toggle-box'}
        onClick={() => props.onChange(!props.checked)}
      />
      {props.label && <span className="toggle-label">{props.label}</span>}
    </label>
  );
}

export function ColorField(props: {
  label: string;
  value: string;
  onChange: (hex: string) => void;
}): React.ReactElement {
  return (
    <div className="numfield">
      <span className="nf-label">{props.label}</span>
      <span className="color-field">
        <input
          type="color"
          aria-label={props.label}
          value={/^#[0-9a-fA-F]{6}$/.test(props.value) ? props.value : '#000000'}
          onChange={(e) => props.onChange(e.target.value.toUpperCase())}
        />
        <span className="mono color-hex">{props.value.toUpperCase()}</span>
      </span>
    </div>
  );
}

export function SelectField<T extends string>(props: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
}): React.ReactElement {
  return (
    <div className="numfield">
      <span className="nf-label">{props.label}</span>
      <select
        className="select"
        aria-label={props.label}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value as T)}
      >
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
