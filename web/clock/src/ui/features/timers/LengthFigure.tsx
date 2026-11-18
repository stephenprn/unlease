/**
 * A timer's length as a figure: the numbers large in Signika SemiBold, tabular, each unit after it
 * small in the second ink (`5 min`, `1 h 30 min`), as the phone sets them. One name for a screen reader.
 */
import { lengthParts, lengthSentence } from '@unlease/clock/services/timers';

import tools from '../tools.module.css';

export function LengthFigure({ seconds, size }: { readonly seconds: number; readonly size: number }) {
  return (
    <span className={tools.figureLength} style={{ ['--figure-size' as string]: `${size}px` }} role="img" aria-label={lengthSentence(seconds)}>
      {lengthParts(seconds).map(([value, unit], index) => (
        <span key={index} className={tools.figurePart}>
          <span className={tools.figureValue}>{value}</span>
          <span className={tools.figureUnit}>{unit}</span>
        </span>
      ))}
    </span>
  );
}
