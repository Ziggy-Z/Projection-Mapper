import { resolveEventTime } from '../model/sun';
import { startFadeToBlack, startSceneTransition } from './transitions';
import { useAppStore } from './store';

/**
 * The installation clock. Every 30s it resolves each schedule event to a
 * concrete time today (clock or solar ± offset, computed locally) and fires
 * events whose time has just passed. Each event fires at most once per day;
 * events more than two minutes in the past are skipped, so a reboot doesn't
 * replay the whole evening.
 */

const CHECK_MS = 30000;
const LATE_WINDOW_MS = 120000;

const fired = new Set<string>();

function check(): void {
  const s = useAppStore.getState();
  if (s.recoveryRaw != null) return;
  const schedule = s.project.schedule;
  if (!schedule.enabled) return;
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;

  schedule.events.forEach((event, index) => {
    const at = resolveEventTime(event.at, now, schedule.location.lat, schedule.location.lon);
    if (!at) return;
    const key = `${dayKey}:${index}:${event.at}`;
    if (fired.has(key)) return;
    const delta = now.getTime() - at.getTime();
    if (delta < 0 || delta > LATE_WINDOW_MS) return;
    fired.add(key);
    if (event.action === 'fadeToScene' && event.sceneId) {
      startSceneTransition(event.sceneId, event.durationSec);
    } else if (event.action === 'fadeToBlack') {
      startFadeToBlack(event.durationSec);
    }
  });

  // Keep the fired set from growing over weeks of runtime.
  if (fired.size > 500) {
    for (const key of fired) {
      if (!key.startsWith(dayKey)) fired.delete(key);
    }
  }
}

export function initScheduler(): () => void {
  const id = window.setInterval(check, CHECK_MS);
  return () => window.clearInterval(id);
}
