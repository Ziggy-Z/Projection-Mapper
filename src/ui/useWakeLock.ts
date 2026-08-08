import { useEffect } from 'react';

interface WakeLockLike {
  release: () => Promise<void>;
}

/** Keeps the display awake while the piece runs. Reacquires after tab
 * visibility changes (the lock is released by the browser on hide). */
export function useWakeLock(): void {
  useEffect(() => {
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
