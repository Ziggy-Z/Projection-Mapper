/** Small shared controls and the 16px/1.5px-stroke icon set. */

const strokeProps = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Icon(props: { children: React.ReactNode; size?: number }): React.ReactElement {
  const s = props.size ?? 16;
  return (
    <svg width={s} height={s} viewBox="0 0 16 16" {...strokeProps} aria-hidden="true">
      {props.children}
    </svg>
  );
}

export function IconChevronUp(): React.ReactElement {
  return (
    <Icon>
      <path d="M4 10l4-4 4 4" />
    </Icon>
  );
}

export function IconChevronDown(): React.ReactElement {
  return (
    <Icon>
      <path d="M4 6l4 4 4-4" />
    </Icon>
  );
}

export function IconChevronRight(props: { size?: number }): React.ReactElement {
  return (
    <Icon size={props.size ?? 12}>
      <path d="M6 3.5l4.5 4.5L6 12.5" />
    </Icon>
  );
}

export function IconCross(): React.ReactElement {
  return (
    <Icon>
      <path d="M5 5l6 6M11 5l-6 6" />
    </Icon>
  );
}

export function IconPlus(): React.ReactElement {
  return (
    <Icon>
      <path d="M8 4v8M4 8h8" />
    </Icon>
  );
}

export function IconDuplicate(): React.ReactElement {
  return (
    <Icon>
      <rect x="5.5" y="5.5" width="7" height="7" rx="1.5" />
      <path d="M10.5 3.5h-7v7" />
    </Icon>
  );
}

export function IconSave(): React.ReactElement {
  return (
    <Icon>
      <path d="M8 2.5v7M5 7l3 3 3-3M3 12.5h10" />
    </Icon>
  );
}

export function IconOpen(): React.ReactElement {
  return (
    <Icon>
      <path d="M8 10.5v-7M5 6l3-3 3 3M3 12.5h10" />
    </Icon>
  );
}

export function IconFile(): React.ReactElement {
  return (
    <Icon>
      <path d="M9 2.5H4.5v11h7V5z" />
      <path d="M9 2.5V5h2.5" />
    </Icon>
  );
}

export function IconGrid(): React.ReactElement {
  return (
    <Icon>
      <rect x="2.5" y="2.5" width="11" height="11" rx="1.5" />
      <path d="M6.2 2.5v11M9.8 2.5v11M2.5 6.2h11M2.5 9.8h11" />
    </Icon>
  );
}

export function IconHandles(): React.ReactElement {
  return (
    <Icon>
      <path d="M3 5.5v-2.5h2.5M13 5.5v-2.5h-2.5M3 10.5v2.5h2.5M13 10.5v2.5h-2.5" />
      <circle cx="8" cy="8" r="1.25" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconDim(): React.ReactElement {
  return (
    <Icon>
      <circle cx="8" cy="8" r="3.25" />
      <path d="M8 1.5v1.5M8 13v1.5M1.5 8h1.5M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1" />
    </Icon>
  );
}

export function IconHelp(): React.ReactElement {
  return (
    <Icon>
      <circle cx="8" cy="8" r="5.75" />
      <path d="M6.4 6.3a1.6 1.6 0 113.05.7c-.25.6-1.45.85-1.45 1.85" />
      <circle cx="8" cy="11.2" r="0.7" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function IconButton(props: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  pressed?: boolean;
}): React.ReactElement {
  return (
    <button
      type="button"
      className={props.danger ? 'icon-btn danger' : 'icon-btn'}
      title={props.title}
      aria-label={props.title}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

/** Pill switch — reads as on/off across the room. */
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
