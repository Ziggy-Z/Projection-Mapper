import { useEffect } from 'react';
import { desktop } from '../model/desktop';

interface WakeLockLike {
  release: () => Promise<void>;
}

/**
 * Keeps the display awake while the piece runs. On the desktop this is a real
 * powerSaveBlocker in the main process, which the OS honours unconditionally;
 * the browser path below is best-effort and can be refused by energy saver.
 */
export function useWakeLock(): void {
  useEffect(() => {
    // On the desktop the main process owns the blocker: it is restored from
    // settings at launch and toggled from the Display panel, so it survives
    // a renderer reload after a crash.
    if (desktop) return;

    let lock: WakeLockLike | null = null;
    let disposed = false;

    const request = async (): Promise<void> => {
      const wakeLock = (navigator as { wakeLock?: { request: (t: string) => Promise<WakeLockLike> } }).wakeLock;
      if (!wakeLock) return;
      try {
        const acquired = await wakeLock.request('screen');
        if (disposed) void acquired.release();
        else lock = acquired;
      } catch {
        // Denied (e.g. energy saver) — kiosk deployment should also disable
        // OS-level sleep; this is best-effort.
      }
    };

    void request();
    const onVisibility = (): void => {
      if (document.visibilityState === 'visible') void request();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void lock?.release().catch(() => undefined);
    };
  }, []);
}
