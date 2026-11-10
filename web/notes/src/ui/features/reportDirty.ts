/**
 * A dialog's form tells the dialog around it whether it holds changes, so the dialog's own dismissal
 * (Escape, the scrim, Back) asks before losing them (`useUnsaved`, held where the `Layer` is). Gone,
 * the form holds nothing.
 */
import { useEffect } from 'react';

export function useReportDirty(dirty: boolean, report: (dirty: boolean) => void): void {
  useEffect(() => {
    report(dirty);
  }, [dirty, report]);
  useEffect(() => () => report(false), [report]);
}
