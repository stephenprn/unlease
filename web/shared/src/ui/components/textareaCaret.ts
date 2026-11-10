/**
 * Where a character of a textarea is drawn, in the window's coordinates: a hidden twin of the field
 * (its box, its font, its wrapping) holds the text up to it, then a marker whose box is read. For a
 * menu by the caret (« @ » in a plain field), as a rich field reads its selection's rectangle.
 */

/** What makes the twin wrap and measure as the field does. */
const COPIED = [
  'boxSizing',
  'width',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderRightWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'fontFamily',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'fontVariant',
  'fontStretch',
  'fontFeatureSettings',
  'fontVariationSettings',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textIndent',
  'textTransform',
  'tabSize',
] as const;

export function textareaCaretRect(field: HTMLTextAreaElement, position: number): DOMRect {
  const box = field.getBoundingClientRect();
  const style = getComputedStyle(field);
  const twin = document.createElement('div');
  for (const key of COPIED) twin.style[key] = style[key];
  twin.style.position = 'fixed';
  twin.style.visibility = 'hidden';
  twin.style.top = '0';
  twin.style.left = '-9999px';
  twin.style.whiteSpace = 'pre-wrap';
  twin.style.overflowWrap = 'break-word';
  twin.style.borderStyle = 'solid';
  twin.style.overflow = 'hidden';
  twin.textContent = field.value.slice(0, position);
  const marker = document.createElement('span');
  // The character itself, or a stand-in at the end, so the marker has a line's height.
  marker.textContent = field.value.slice(position, position + 1) || '​';
  twin.appendChild(marker);
  document.body.appendChild(twin);
  const twinBox = twin.getBoundingClientRect();
  const mark = marker.getBoundingClientRect();
  twin.remove();
  const left = box.left + (mark.left - twinBox.left) - field.scrollLeft;
  const top = box.top + (mark.top - twinBox.top) - field.scrollTop;
  const height = mark.height || parseFloat(style.lineHeight) || 20;
  // Kept inside the field when the caret's line is scrolled out of it.
  const clampedTop = Math.max(box.top, Math.min(box.bottom - height, top));
  return new DOMRect(Math.min(left, box.right - 1), clampedTop, 1, height);
}
