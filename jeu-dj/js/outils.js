// Petits outils communs.
export const $ = (sel, racine = document) => racine.querySelector(sel);
export const $$ = (sel, racine = document) => [...racine.querySelectorAll(sel)];
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export function creer(balise, classe = '', html = '') { const e = document.createElement(balise); if (classe) e.className = classe; if (html) e.innerHTML = html; return e; }
export function mmss(s) { s = Math.max(0, s); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`; }
export function alea(g) { let s = (g >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export const euros = (n) => Math.round(n).toLocaleString('fr-FR') + ' €';
export function echapper(t) { return String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** Bouton rotatif : on le tourne en glissant vers le haut ou le bas ; double-clic pour revenir au réglage neutre. */
export function molette(el, { min = -1, max = 1, valeur = 0, neutre = 0, libelle = '', surChange = () => {} } = {}) {
  el.classList.add('rot');
  el.innerHTML = `<i></i>${libelle ? `<span>${libelle}</span>` : ''}`;
  let v = valeur, depart = null;
  const maj = (prevenir) => { el.style.setProperty('--angle', `${-135 + ((v - min) / (max - min)) * 270}deg`); el.classList.toggle('neutre', Math.abs(v - neutre) < (max - min) * 0.02); if (prevenir) surChange(v); };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); depart = { y: e.clientY, v }; try { el.setPointerCapture(e.pointerId); } catch (err) { /* sans importance */ } });
  el.addEventListener('pointermove', (e) => {
    if (!depart) return;
    let n = clamp(depart.v + ((depart.y - e.clientY) / 130) * (max - min), min, max);
    if (Math.abs(n - neutre) < (max - min) * 0.03) n = neutre;                 // cran au réglage neutre
    if (n !== v) { v = n; maj(true); }
  });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { depart = null; });
  el.addEventListener('dblclick', () => { v = neutre; maj(true); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); v = clamp(v - Math.sign(e.deltaY) * (max - min) * 0.04, min, max); maj(true); }, { passive: false });
  maj(false);
  return { get valeur() { return v; }, regler(n, prevenir = false) { v = clamp(n, min, max); maj(prevenir); } };
}

/** Curseur linéaire (fader), vertical ou horizontal. `cran` : valeur où il s'arrête légèrement (centre du tempo ou du crossfader). */
export function fader(el, { min = 0, max = 1, valeur = 1, vertical = true, cran = null, surChange = () => {} } = {}) {
  el.classList.add('fader', vertical ? 'vertical' : 'horizontal');
  el.innerHTML = '<div class="rail"></div><div class="cap"></div>';
  const cap = el.lastChild;
  let v = valeur, actif = false;
  const maj = (prevenir) => { const p = (v - min) / (max - min); cap.style[vertical ? 'top' : 'left'] = `${(vertical ? 1 - p : p) * 100}%`; if (prevenir) surChange(v); };
  const lire = (e) => {
    const r = el.getBoundingClientRect(), marge = (vertical ? cap.offsetHeight : cap.offsetWidth) / 2;
    let p = vertical ? 1 - (e.clientY - r.top - marge) / Math.max(1, r.height - 2 * marge) : (e.clientX - r.left - marge) / Math.max(1, r.width - 2 * marge);
    let n = min + clamp(p, 0, 1) * (max - min);
    if (cran != null && Math.abs(n - cran) < (max - min) * 0.012) n = cran;
    if (n !== v) { v = n; maj(true); }
  };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); actif = true; try { el.setPointerCapture(e.pointerId); } catch (err) { /* sans importance */ } lire(e); });
  el.addEventListener('pointermove', (e) => { if (actif) lire(e); });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, () => { actif = false; });
  el.addEventListener('dblclick', () => { if (cran != null) { v = cran; maj(true); } });
  maj(false);
  return { get valeur() { return v; }, regler(n, prevenir = false) { v = clamp(n, min, max); maj(prevenir); } };
}
