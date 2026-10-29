import { useEffect, useState } from 'react';

const floor = (time: number) => time - (time % 60_000);

export function useMinute(): number {
  const [now, setNow] = useState(() => floor(Date.now()));
  useEffect(() => {
    const timer = setInterval(() => setNow(floor(Date.now())), 15_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
