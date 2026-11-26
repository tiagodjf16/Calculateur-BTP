// Petites fonctions communes.
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Rapproche `v` de `cible` de façon fluide, indépendamment du nombre d'images par seconde. */
export const amorti = (v, cible, taux, dt) => v + (cible - v) * (1 - Math.exp(-taux * dt));
export const $ = (s) => document.querySelector(s);

/** Générateur pseudo-aléatoire reproductible. */
export function alea(graine) {
  let a = graine >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Écart d'angle a - b ramené entre -PI et PI. */
export function ecartAngle(a, b) {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Point (x, z) dans le polygone p = [x0, z0, x1, z1, …] ? */
export function dansPolygone(x, z, p) {
  let dedans = false;
  for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
    const xi = p[i], zi = p[i + 1], xj = p[j], zj = p[j + 1];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) dedans = !dedans;
  }
  return dedans;
}

/** Point le plus proche de (x, z) sur le segment a-b. Renvoie [px, pz, t]. */
export function procheSegment(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? clamp(((x - ax) * dx + (z - az) * dz) / l2, 0, 1) : 0;
  return [ax + dx * t, az + dz * t, t];
}

export const kmh = (ms) => ms * 3.6;
export const formatTemps = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
