// Commandes : clavier (positions physiques des touches : ZQSD sur AZERTY = WASD sur QWERTY) et écran tactile
// (volant, pédales, boutons). L'affichage (« clavier » ou « tactile ») suit la dernière commande utilisée.
import { clamp } from './outils.js';

const trait = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const ICONES = {
  moteur: trait('<path d="M12 3v8"/><path d="M6.4 6.6a8 8 0 1 0 11.2 0"/>'),
  ceinture: trait('<circle cx="12" cy="5.2" r="2.6" fill="currentColor" stroke="none"/><path d="M6.5 21c0-6.2 1.8-9.3 5.5-9.3s5.5 3.1 5.5 9.3"/><path d="M7.4 12.4 17 20.4" stroke-width="2.7"/>'),
  freinmain: trait('<circle cx="12" cy="12" r="5.6"/><path d="M4.4 7.4a9.2 9.2 0 0 0 0 9.2M19.6 7.4a9.2 9.2 0 0 1 0 9.2"/><path d="M10.7 15v-6h1.9a1.9 1.9 0 0 1 0 3.8h-1.9"/>'),
  vue: trait('<path d="M3.5 8h3.2l1.6-2.2h7.4L17.3 8h3.2v11h-17z"/><circle cx="12" cy="13.2" r="3.4"/>'),
  plus: trait('<circle cx="5" cy="12" r="1.7" fill="currentColor"/><circle cx="12" cy="12" r="1.7" fill="currentColor"/><circle cx="19" cy="12" r="1.7" fill="currentColor"/>'),
  gyro: trait('<path d="M7.2 17v-4.2a4.8 4.8 0 0 1 9.6 0V17z" fill="currentColor"/><path d="M5 20h14"/><path d="M12 2.6v2.2M4.6 5.6l1.6 1.6M19.4 5.6l-1.6 1.6"/>'),
  sirene: trait('<path d="M3.5 9.8v4.4h3.2l4.8 4V5.8l-4.8 4z" fill="currentColor"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.6a7.8 7.8 0 0 1 0 10.8"/>'),
  klaxon: trait('<path d="M3.5 10.2v3.6l3 .7 9 4.3V5.2l-9 4.3z"/><path d="M7 14.8v3.4h2.8v-2.1"/><path d="M18.6 9.8c.9.7.9 3.7 0 4.4M20.8 7.6c1.6 2 1.6 6.8 0 8.8"/>'),
  cligauche: trait('<path d="M11 5.2 4 12l7 6.8v-4h9V9.2h-9z" fill="currentColor"/>'),
  clidroit: trait('<path d="M13 5.2 20 12l-7 6.8v-4H4V9.2h9z" fill="currentColor"/>'),
  detresse: trait('<path d="M12 3.6 21.2 20H2.8z"/><path d="M12 9.6 16 17H8z"/>'),
  codes: trait('<path d="M10 6c5 0 8.5 2.4 8.5 6s-3.500 6-8.5 6z"/><path d="M3 7.6l4.200 1.2M3 12h4.200M3 16.400l4.200-1.200"/>'),
  balisage: trait('<path d="M9.800 4h4.400l3.800 14H6z"/><path d="M3.800 20.200h16.400M8.400 10.400h7.200M7.200 14.400h9.600"/>'),
  replacer: trait('<path d="M4.200 12a7.800 7.800 0 1 1 2.300 5.500"/><path d="M4 18.600v-5.200h5.200"/>'),
  qualite: trait('<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>'),
  aide: trait('<circle cx="12" cy="12" r="8.600"/><path d="M9.600 9.600a2.500 2.500 0 1 1 3.600 2.300c-.800.500-1.200 1-1.200 2"/><circle cx="12" cy="16.900" r=".6" fill="currentColor"/>'),
};

// [code envoyé au jeu, identifiant, libellé, maintenu ?]
const GAUCHE = [['KeyM', 'moteur', 'Moteur'], ['KeyC', 'ceinture', 'Ceinture'], ['KeyP', 'freinmain', 'Frein P'], ['KeyV', 'vue', 'Caméra'], ['Plus', 'plus', 'Plus']];
const DROITE = [['KeyG', 'gyro', 'Gyro'], ['KeyT', 'sirene', '2 tons'], ['KeyK', 'klaxon', 'Klaxon', true]];
const AUTRES = [['KeyQ', 'cligauche', 'Clignotant gauche'], ['KeyZ', 'detresse', 'Détresse'], ['KeyE', 'clidroit', 'Clignotant droit'],
  ['KeyL', 'codes', 'Feux'], ['KeyB', 'balisage', 'Balisage'], ['KeyR', 'replacer', 'Replacer sur la route'],
  ['Qualite', 'qualite', 'Qualité'], ['Aide', 'aide', 'Aide']];
const TOUCHES_JEU = /^(Key[WASDMCPGTBLQEZVHRKF]|Arrow|Space|Escape|Tab)/;

export class Entrees {
  constructor() {
    this.bas = new Set();
    this.frappes = [];
    this.volant = 0;                           // tactile : −1 (gauche) … 1 (droite)
    this.pedale = { gaz: false, frein: false, recul: false };
    this.vitesse = 0;
    this.bloque = false;                       // vrai quand une fenêtre (tablette, bilan…) a la main
    this.mode = '';
    this.surMode = null;                       // rappel quand l'affichage change de mode
    addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
      if (/^(Space|Arrow|Tab|F1$)/.test(e.code)) e.preventDefault();
      if (e.repeat) return;
      if (TOUCHES_JEU.test(e.code)) this.definirMode('clavier');
      this.bas.add(e.code);
      this.frappes.push(e.code);
    });
    addEventListener('keyup', (e) => this.bas.delete(e.code));
    addEventListener('blur', () => this._relacher());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this._relacher(); });
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.definirMode('tactile'); }, { capture: true, passive: true });
    // téléphone : ni zoom par pincement, ni menu sur un appui long
    for (const ev of ['gesturestart', 'gesturechange']) addEventListener(ev, (e) => e.preventDefault());
    addEventListener('contextmenu', (e) => { if (this.tactile) e.preventDefault(); });
    this._boutons();
    this._volant();
    this._pedales();
    const doigt = matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(any-pointer: fine)').matches);
    this.definirMode(doigt ? 'tactile' : 'clavier');
  }

  get tactile() { return this.mode === 'tactile'; }

  definirMode(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    document.documentElement.dataset.mode = mode;
    if (mode !== 'tactile') this._relacher();
    if (this.surMode) this.surMode(mode);
  }

  _relacher() {
    this.bas.clear();
    this.volant = 0;
    this.pedale.gaz = this.pedale.frein = false;
    document.querySelectorAll('#tactile .tenu').forEach((e) => e.classList.remove('tenu'));
    const p = document.getElementById('volant-pouce');
    if (p) p.style.transform = '';
  }

  // ------------------------------------------------------------------ boutons (tactile) et éléments cliquables
  _boutons() {
    const bouton = ([code, id, nom, tenu]) => `<button type="button" data-touche="${code}" data-id="${id}"${tenu ? ' data-tenu' : ''} aria-label="${nom}">${ICONES[id]}<span>${nom}</span></button>`;
    const poser = (sel, liste) => { const e = document.querySelector(sel); if (e) e.innerHTML = liste.map(bouton).join(''); };
    poser('#boutons-g', GAUCHE);
    poser('#boutons-d', DROITE);
    poser('#plus', AUTRES);
    this.boutons = Object.fromEntries([...document.querySelectorAll('#tactile [data-id]')].map((b) => [b.dataset.id, b]));
    document.querySelectorAll('[data-touche]').forEach((b) => {
      const code = b.dataset.touche, tenu = b.hasAttribute('data-tenu');
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (tenu) { this.bas.add(code); b.classList.add('tenu'); try { b.setPointerCapture(e.pointerId); } catch (err) { /* sans importance */ } }
        this.frappes.push(code);
      });
      if (tenu) for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) b.addEventListener(ev, () => { this.bas.delete(code); b.classList.remove('tenu'); });
      // au doigt, pas de « clic » après coup : il tomberait sur ce qui vient d'apparaître sous le doigt (tablette, aide…)
      b.addEventListener('touchend', (ev) => { if (ev.cancelable) ev.preventDefault(); });
    });
  }

  /** Volant : une glissière ; le pouce se déplace à gauche ou à droite, et revient au centre quand on le lâche. */
  _volant() {
    const zone = document.getElementById('volant'), pouce = document.getElementById('volant-pouce');
    if (!zone) return;
    let id = null;
    const bouger = (e) => {
      const r = zone.getBoundingClientRect(), course = Math.max(10, (r.width - pouce.offsetWidth) / 2 - 4);
      const x = clamp((e.clientX - (r.left + r.width / 2)) / course, -1, 1);
      this.volant = x;
      pouce.style.transform = `translateX(${(x * course).toFixed(1)}px)`;
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      id = e.pointerId;
      try { zone.setPointerCapture(id); } catch (err) { /* sans importance */ }
      zone.classList.add('tenu');
      bouger(e);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === id) bouger(e); });
    const fin = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.volant = 0;
      pouce.style.transform = '';
      zone.classList.remove('tenu');
    };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(ev, fin);
  }

  /** Pédales : celle de droite avance ; celle de gauche freine, ou recule si on l'enfonce véhicule arrêté. */
  _pedales() {
    const tenir = (sel, debut, fin) => {
      const el = document.querySelector(sel);
      if (!el) return;
      let id = null;
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        id = e.pointerId;
        try { el.setPointerCapture(id); } catch (err) { /* sans importance */ }
        el.classList.add('tenu');
        debut();
      });
      const lacher = (e) => { if (e.pointerId !== id) return; id = null; el.classList.remove('tenu'); fin(); };
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, lacher);
    };
    tenir('#ped-gaz', () => { this.pedale.gaz = true; }, () => { this.pedale.gaz = false; });
    tenir('#ped-frein', () => { this.pedale.frein = true; this.pedale.recul = Math.abs(this.vitesse) < 0.6; }, () => { this.pedale.frein = false; });
  }

  /** Reflète l'état du véhicule sur les boutons tactiles (allumé, à faire…). */
  etat(v) {
    const b = this.boutons;
    const mettre = (id, classe, oui) => { if (b[id]) b[id].classList.toggle(classe, !!oui); };
    mettre('moteur', 'actif', v.moteur);
    mettre('ceinture', 'actif', v.ceinture);
    mettre('ceinture', 'rappel', v.moteur && !v.ceinture);
    mettre('freinmain', 'serre', v.freinMain);
    mettre('gyro', 'actif', v.gyro);
    mettre('sirene', 'actif', v.deuxTons);
    mettre('codes', 'actif', v.codes);
    mettre('balisage', 'actif', v.balisage);
    mettre('cligauche', 'actif', v.clignotant === -1);
    mettre('clidroit', 'actif', v.clignotant === 1);
    mettre('detresse', 'actif', v.clignotant === 2);
    const recul = Math.abs(v.v) < 0.6 ? !this.pedale.frein || this.pedale.recul : this.pedale.frein && this.pedale.recul;
    if (recul !== this._recul) {
      this._recul = recul;
      const nom = document.getElementById('ped-frein-nom');
      if (nom) nom.textContent = recul ? 'Reculer' : 'Frein';
    }
  }

  /** Touches enfoncées depuis le dernier appel. */
  lire() { const f = this.frappes; this.frappes = []; return this.bloque ? [] : f; }

  tenue(...codes) { return !this.bloque && codes.some((c) => this.bas.has(c)); }

  /** Commande de conduite. `v` : vitesse du véhicule (m/s), pour distinguer frein et marche arrière au tactile. */
  commande(v = 0) {
    this.vitesse = v;
    if (this.bloque) return { avant: 0, arriere: 0, direction: 0, frein: 0 };
    const p = this.pedale;
    let avant = this.tenue('KeyW', 'ArrowUp') ? 1 : 0, arriere = this.tenue('KeyS', 'ArrowDown') ? 1 : 0, frein = this.tenue('Space') ? 1 : 0;
    let direction = (this.tenue('KeyA', 'ArrowLeft') ? 1 : 0) - (this.tenue('KeyD', 'ArrowRight') ? 1 : 0);
    if (p.gaz) avant = 1;                                  // en marche arrière, le véhicule freine de lui-même
    if (p.frein) { if (p.recul) arriere = 1; else frein = 1; }
    if (!direction && Math.abs(this.volant) > 0.05) direction = -Math.sign(this.volant) * Math.pow(Math.abs(this.volant), 1.3);
    return { avant, arriere, direction, frein };
  }
}
