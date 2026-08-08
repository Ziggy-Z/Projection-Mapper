import type { Renderer } from './gl/renderer';

/** The live renderer instance, for UI readouts (frame time) and debugging.
 * Kept out of the store so stats polling never routes through React state. */
let renderer: Renderer | null = null;

export function setRenderer(r: Renderer | null): void {
  renderer = r;
}

export function getRenderer(): Renderer | null {
  return renderer;
}
