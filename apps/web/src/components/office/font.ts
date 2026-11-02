/** Resolves the page font (next/font assigns a generated family name). */
export function uiFont(): string {
  if (typeof document === 'undefined') return 'ui-sans-serif, system-ui, sans-serif';
  return getComputedStyle(document.body).fontFamily || 'ui-sans-serif, system-ui, sans-serif';
}
