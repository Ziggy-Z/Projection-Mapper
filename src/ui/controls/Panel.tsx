import { useCallback, useState } from 'react';
import { IconChevronRight } from './common';

/** Collapse state lives outside the project — it is a workspace preference,
 * not part of the show. */
const STORE_KEY = 'projection-mapper.ui.collapsed.v1';

function readCollapsed(): Record<string, boolean> {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function writeCollapsed(next: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(next));
  } catch {
    /* private mode / quota — collapse state is disposable */
  }
}

/**
 * One section of a rail: a click-to-collapse header and its body. Sections
 * are flush and hairline-separated so a rail reads as one chassis rather
 * than a stack of floating cards.
 */
export function Panel(props: {
  id: string;
  title: string;
  /** Right-aligned counter or status in the header, e.g. "3". */
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}): React.ReactElement {
  const [collapsed, setCollapsed] = useState(() => readCollapsed()[props.id] ?? false);

  const toggle = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed({ ...readCollapsed(), [props.id]: next });
      return next;
    });
  }, [props.id]);

  const bodyId = `panel-body-${props.id}`;

  return (
    <section className={props.className ? `panel ${props.className}` : 'panel'}>
      <button
        type="button"
        className="panel-head"
        aria-expanded={!collapsed}
        aria-controls={bodyId}
        onClick={toggle}
      >
        <span className="twist">
          <IconChevronRight />
        </span>
        {props.title}
        {props.note != null && <span className="head-note">{props.note}</span>}
      </button>
      {!collapsed && (
        <div className="panel-body" id={bodyId}>
          {props.children}
        </div>
      )}
    </section>
  );
}
