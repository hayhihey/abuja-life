// Small, DOM-free helpers shared by the whole engine.

export const clamp = (v, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, v));

/** Full naira string: ₦1,250,000 */
export function ngn(n) {
  const r = Math.round(n || 0);
  return (r < 0 ? '-' : '') + '₦' + Math.abs(r).toLocaleString('en-US');
}

/** Compact naira string for the HUD: ₦850k, ₦1.25M, ₦2.4B */
export function ngnShort(n) {
  const a = Math.abs(n || 0);
  const sg = n < 0 ? '-' : '';
  if (a >= 1e9) return `${sg}₦${+(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sg}₦${+(a / 1e6).toFixed(2)}M`;
  if (a >= 1e4) return `${sg}₦${Math.round(a / 1e3)}k`;
  return `${sg}₦${Math.round(a).toLocaleString('en-US')}`;
}

export const pad2 = (n) => String(n).padStart(2, '0');

export const sum = (arr, fn = (x) => x) => arr.reduce((a, x) => a + fn(x), 0);

/** Round to a "nice" naira figure (nearest 500) so prices don't look robotic. */
export const nice = (n, step = 500) => Math.max(step, Math.round(n / step) * step);

export function uid(prefix = 'id') {
  return prefix + '_' + Math.random().toString(36).slice(2, 9);
}
