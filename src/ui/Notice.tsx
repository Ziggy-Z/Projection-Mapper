import { useEffect } from 'react';
import { useAppStore } from '../store/store';

export function Notice(): React.ReactElement | null {
  const notice = useAppStore((s) => s.notice);
  const setNotice = useAppStore((s) => s.setNotice);
  useEffect(() => {
    if (notice == null) return;
    const id = window.setTimeout(() => setNotice(null), 5000);
    return () => window.clearTimeout(id);
  }, [notice, setNotice]);
  if (notice == null) return null;
  return <div className="notice">{notice}</div>;
}
