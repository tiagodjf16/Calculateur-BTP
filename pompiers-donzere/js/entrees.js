// Clavier (positions physiques des touches : ZQSD sur AZERTY = WASD sur QWERTY) et commandes tactiles.
import { clamp } from './outils.js';

export class Entrees {
  constructor() {
    this.bas = new Set();
    this.frappes = [];
    this.manette = { x: 0, y: 0 };
    this.tactile = matchMedia('(pointer: coarse)').matches;
    this.bloque = false;                      // vrai quand une fenêtre (tablette bilan…) a le clavier
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (/^(Space|Arrow|Tab|F1$)/.test(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.bas.add(e.code);
      this.frappes.push(e.code);
    });
    addEventListener('keyup', (e) => this.bas.delete(e.code));
    addEventListener('blur', () => this.bas.clear());
    this._manette();
    document.querySelectorAll('[data-touche]').forEach((b) => {
      const code = b.dataset.touche, tenu = b.hasAttribute('data-tenu');
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); if (tenu) this.bas.add(code); this.frappes.push(code); });
      if (tenu) for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => this.bas.delete(code));
    });
  }

  _manette() {
    const zone = document.getElementById('manette'), pouce = document.getElementById('pouce');
    if (!zone) return;
    let id = null;
    const bouger = (e) => {
      const r = zone.getBoundingClientRect(), R = r.width / 2;
      let dx = (e.clientX - r.left - R) / R, dy = (e.clientY - r.top - R) / R;
      const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; }
      this.manette.x = dx; this.manette.y = dy;
      pouce.style.transform = `translate(${dx * R * 0.55}px, ${dy * R * 0.55}px)`;
    };
    zone.addEventListener('pointerdown', (e) => { id = e.pointerId; zone.setPointerCapture(id); bouger(e); });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) bouger(e); });
    const fin = (e) => { if (e.pointerId === id) { id = null; this.manette.x = this.manette.y = 0; pouce.style.transform = ''; } };
    zone.addEventListener('pointerup', fin);
    zone.addEventListener('pointercancel', fin);
  }

  /** Touches enfoncées depuis le dernier appel. */
  lire() { const f = this.frappes; this.frappes = []; return this.bloque ? [] : f; }

  tenue(...codes) { return !this.bloque && codes.some((c) => this.bas.has(c)); }

  commande() {
    if (this.bloque) return { avant: 0, arriere: 0, direction: 0, frein: 0 };
    const m = this.manette, seuil = 0.18;
    const avant = this.tenue('KeyW', 'ArrowUp') ? 1 : m.y < -seuil ? clamp((-m.y - seuil) / (1 - seuil), 0, 1) : 0;
    const arriere = this.tenue('KeyS', 'ArrowDown') ? 1 : m.y > seuil ? clamp((m.y - seuil) / (1 - seuil), 0, 1) : 0;
    let direction = (this.tenue('KeyA', 'ArrowLeft') ? 1 : 0) - (this.tenue('KeyD', 'ArrowRight') ? 1 : 0);
    if (!direction && Math.abs(m.x) > 0.12) direction = -m.x;
    return { avant, arriere, direction, frein: this.tenue('Space') ? 1 : 0 };
  }
}
