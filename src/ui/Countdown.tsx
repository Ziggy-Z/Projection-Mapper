import { useAppStore } from '../store/store';

/** Subtle warning in the last seconds before auto-return to Show mode. */
export function Countdown(): React.ReactElement | null {
  const remaining = useAppStore((s) => s.editCountdown);
  if (remaining == null) return null;
  return (
    <div className="countdown">
      Returning to show · <span className="mono">{remaining}</span>
    </div>
  );
}
