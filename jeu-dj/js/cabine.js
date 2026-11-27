// La cabine : deux platines et la table de mixage, entièrement manipulables (souris, doigt, clavier).
import { $, $$, clamp, creer, mmss, molette, fader, echapper } from './outils.js';

const COULEURS = ['#ff453a', '#ff9f0a', '#ffd60a', '#32d74b', '#40c8e0', '#0a84ff', '#bf5af2', '#ff375f'];
const PXS = 90;                                   // pixels par seconde de la forme d'onde défilante
const TRANCHE = 4096;

/** Forme d'onde d'un morceau, dessinée une fois pour toutes (défilante) puis recopiée à chaque image. */
class Onde {
  constructor(m) {
    const c = m.cretes, k = 1 / Math.max(c.maxi, 1e-3), larg = Math.ceil(m.duree * PXS), H = 64;
    this.h = H; this.bandes = [];
    for (let x0 = 0; x0 < larg; x0 += TRANCHE) {
      const cv = document.createElement('canvas');
      cv.width = Math.min(TRANCHE, larg - x0); cv.height = H;
      const g = cv.getContext('2d');
      for (let x = 0; x < cv.width; x++) {
        const i = Math.min(c.amp.length - 1, Math.floor(((x0 + x) / PXS) * c.parSeconde));
        const a = Math.min(1, c.amp[i] * k), b = c.bas[i] * k * 2.6, md = c.med[i] * k * 3.4, ai = c.aig[i] * k * 5;
        const mx = Math.max(b, md, ai, 1e-3), l = 90 + 165 * Math.min(1, a * 1.2);
        g.fillStyle = `rgb(${Math.round((l * (0.35 + 0.65 * b / mx)))},${Math.round(l * (0.3 + 0.7 * md / mx))},${Math.round(l * (0.35 + 0.65 * ai / mx))})`;
        const hh = Math.max(1, a * H);
        g.fillRect(x, (H - hh) / 2, 1, hh);
      }
      this.bandes.push(cv);
    }
    // vue d'ensemble
    const W = 900, vu = (this.ensemble = document.createElement('canvas'));
    vu.width = W; vu.height = 24;
    const g = vu.getContext('2d');
    for (let x = 0; x < W; x++) {
      const i0 = Math.floor((x / W) * c.amp.length), i1 = Math.max(i0 + 1, Math.floor(((x + 1) / W) * c.amp.length));
      let a = 0, b = 0;
      for (let i = i0; i < i1; i++) { if (c.amp[i] > a) a = c.amp[i]; b += c.bas[i]; }
      a *= k; b = (b / (i1 - i0)) * k * 2.6;
      g.fillStyle = `rgb(${Math.round(70 + 150 * Math.min(1, b))},${Math.round(120 + 80 * a)},${Math.round(200 - 90 * Math.min(1, b))})`;
      g.fillRect(x, 24 - a * 24, 1, a * 24);
    }
  }

  /** Dessine la fenêtre centrée sur l'instant t (secondes) dans le rectangle donné. */
  dessiner(g, x, y, w, h, t, zoom = 1) {
    const pxs = PXS * zoom, g0 = t * PXS - (w / 2 / pxs) * PXS, g1 = t * PXS + (w / 2 / pxs) * PXS;
    for (let k = Math.max(0, Math.floor(g0 / TRANCHE)); k < this.bandes.length && k * TRANCHE < g1; k++) {
      const cv = this.bandes[k], s0 = Math.max(0, g0 - k * TRANCHE), s1 = Math.min(cv.width, g1 - k * TRANCHE);
      if (s1 <= s0) continue;
      g.drawImage(cv, s0, 0, s1 - s0, this.h, x + ((k * TRANCHE + s0 - g0) / PXS) * pxs, y, ((s1 - s0) / PXS) * pxs, h);
    }
  }
}

export class Cabine {
  /** options : { modele: [nom platines, nom table], ecrans: 'integres' | 'ordinateur', precisionTempo, surAction } */
  constructor(racine, moteur, options = {}) {
    this.m = moteur; this.racine = racine; this.o = options;
    this.ondes = [null, null];
    this.cmd = { voies: [{}, {}], tempo: [] };
    this.surAction = options.surAction || (() => {});
    racine.innerHTML = '';
    this.vues = [0, 1].map((i) => this._platine(i));
    racine.insertBefore(this._table(), this.vues[1].el);
    this._clavier();
    this.equiper(options);
  }

  /** Change l'habillage selon le matériel possédé. */
  equiper(o) {
    Object.assign(this.o, o);
    this.racine.classList.toggle('ecrans-pc', this.o.ecrans === 'ordinateur');
    $$('.modele', this.racine).forEach((e, i) => { e.textContent = (this.o.modele || [])[i === 1 ? 1 : 0] || ''; });
  }

  _platine(i) {
    const p = this.m.platines[i];
    const el = creer('div', 'platine', `
      <div class="tete"><b class="lettre">${'AB'[i]}</b><span class="modele"></span><span class="charge">Aucun morceau — chargez-en un depuis l'ordinateur</span></div>
      <div class="ecran"><canvas class="onde"></canvas></div>
      <div class="corps">
        <div class="col-g">
          <div class="pads">${COULEURS.map((c, k) => `<button type="button" class="pad" data-rep="${k}" style="--c:${c}">${k + 1}</button>`).join('')}</div>
          <div class="rangee boucles"><span>Boucle</span>${[[0.5, '½'], [1, '1'], [2, '2'], [4, '4'], [8, '8'], [16, '16']].map(([t, n]) => `<button type="button" data-boucle="${t}">${n}</button>`).join('')}</div>
          <div class="rangee modes"><button type="button" data-act="vinyle" title="Mode vinyle : la main sur le plateau arrête le disque">Vinyle</button><button type="button" data-act="quant" title="Repères et boucles calés sur les temps">Quant.</button><button type="button" data-act="inverse" title="Lecture à l'envers">Inverse</button><button type="button" data-act="efface" title="Puis un repère : l'efface">Effacer</button></div>
        </div>
        <div class="col-c"><canvas class="roue"></canvas></div>
        <div class="col-d"><div class="tempo-val">0,0 %</div><div class="curseur-tempo"></div><button type="button" data-act="plage" title="Plage du curseur de tempo">±8 %</button></div>
      </div>
      <div class="transport">
        <button type="button" class="gros cue" data-act="cue">CUE</button>
        <button type="button" class="gros lecture" data-act="lecture">▶ / ❚❚</button>
        <button type="button" class="sync" data-act="sync">SYNC</button>
        <span class="groupe"><button type="button" data-act="moins" title="Ralentir un instant">−</button><i>calage</i><button type="button" data-act="plus" title="Accélérer un instant">+</button></span>
        <span class="groupe grille"><button type="button" data-act="grille-" title="Décaler la grille de temps">◀</button><i>grille</i><button type="button" data-act="grille+">▶</button></span>
      </div>`);
    el.dataset.p = i;
    this.racine.appendChild(el);
    const vue = { el, i, onde: $('.onde', el), roue: $('.roue', el), efface: false, angle: 0 };
    this.cmd.tempo[i] = fader($('.curseur-tempo', el), { min: -1, max: 1, valeur: 0, cran: 0, surChange: (v) => { p.sync = false; p.reglerCurseur(-v); this.surAction('tempo', i); } });
    // boutons
    el.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const a = b.dataset.act;
      if (b.dataset.rep != null) { p.repere(+b.dataset.rep, vue.efface); vue.efface = false; this.surAction('repere', i); }
      else if (b.dataset.boucle) { p.boucleAuto(+b.dataset.boucle); this.surAction('boucle', i); }
      else if (a === 'cue') { p.cueAppui(); b.setPointerCapture(e.pointerId); }
      else if (a === 'lecture') { p.basculer(); this.surAction('lecture', i); }
      else if (a === 'sync') { const ok = p.basculerSync(this.m.platines[1 - i]); this.cmd.tempo[i].regler(-p.curseur); this._plage(i); this.surAction('sync', i, ok); }
      else if (a === 'moins' || a === 'plus') { p.pousser(a === 'plus' ? 0.06 : -0.06); b.setPointerCapture(e.pointerId); }
      else if (a === 'plage') { p.sync = false; p.reglerPlage(p.plage === 0.08 ? 0.16 : p.plage === 0.16 ? 0.5 : 0.08); this._plage(i); }
      else if (a === 'vinyle') p.reglerVinyle(!p.vinyle);
      else if (a === 'quant') p.quantifier = !p.quantifier;
      else if (a === 'inverse') p.reglerInverse(!p.inverse);
      else if (a === 'efface') vue.efface = !vue.efface;
      else if (a === 'grille-' || a === 'grille+') p.decalerGrille(a === 'grille+' ? 0.25 : -0.25);
    });
    const relache = (e) => { const b = e.target.closest && e.target.closest('button'); if (!b) return; if (b.dataset.act === 'cue') p.cueRelache(); if (b.dataset.act === 'moins' || b.dataset.act === 'plus') p.pousser(0); };
    el.addEventListener('pointerup', relache); el.addEventListener('pointercancel', relache);
    // clic sur l'écran : se déplacer dans le morceau (vue d'ensemble, en bas)
    vue.onde.addEventListener('pointerdown', (e) => {
      if (!p.morceau) return;
      const r = vue.onde.getBoundingClientRect();
      if (e.clientY > r.bottom - r.height * 0.24) p.aller(((e.clientX - r.left) / r.width) * p.morceau.duree);
    });
    // molette : dessus = main sur le disque (scratch en mode vinyle), bord = calage
    let saisie = null;
    const angle = (e) => { const r = vue.roue.getBoundingClientRect(); return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)); };
    vue.roue.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = vue.roue.getBoundingClientRect(), d = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) / (r.width / 2);
      saisie = { a: angle(e), t: performance.now(), v: 0 };
      try { vue.roue.setPointerCapture(e.pointerId); } catch (err) { /* sans importance */ }
      p.moletteToucher(d < 0.74);
    });
    vue.roue.addEventListener('pointermove', (e) => {
      if (!saisie) return;
      const a = angle(e), t = performance.now();
      let da = a - saisie.a;
      if (da > Math.PI) da -= 2 * Math.PI;
      if (da < -Math.PI) da += 2 * Math.PI;
      const dt = Math.max(0.004, (t - saisie.t) / 1000);
      saisie.v = saisie.v * 0.5 + (da / (2 * Math.PI) / dt / 0.5556) * 0.5;       // en tours de 33 t 1/3
      saisie.a = a; saisie.t = t;
      if (p.molette.scratch) vue.angle += da;
      p.moletteTourner(saisie.v);
    });
    vue.arret = () => { if (saisie && performance.now() - saisie.t > 60) { saisie.v = 0; p.moletteTourner(0); } };
    const lacher = () => { if (saisie) { saisie = null; p.moletteLacher(); } };
    for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) vue.roue.addEventListener(ev, lacher);
    return vue;
  }

  _table() {
    const m = this.m, el = creer('div', 'table', `
      <div class="tete"><span class="modele"></span></div>
      <div class="voies">
        ${[0, 1].map((i) => `<div class="voie" data-v="${i}"><div class="m" data-r="gain"></div><div class="m" data-r="aigu"></div><div class="m" data-r="med"></div><div class="m" data-r="bas"></div><div class="m filtre" data-r="filtre"></div>
          <button type="button" class="pre" data-act="cue" title="Pré-écoute au casque">CUE</button></div>`).join(`
        <div class="milieu"><canvas class="vu"></canvas></div>`)}
      </div>
      <div class="bas-table">
        <div class="fad" data-f="0"></div>
        <div class="reglages">
          <div class="m maitre" data-r="maitre"></div>
          <div class="casque"><button type="button" data-casque="salle" title="Vous entendez la salle, comme le public">Salle</button><button type="button" data-casque="casque" title="Vous entendez le casque : mélange pré-écoute / salle">Casque</button><button type="button" data-casque="partage" title="Oreille gauche : pré-écoute ; oreille droite : salle">Partagé</button></div>
          <div class="m melange" data-r="melange"></div>
        </div>
        <div class="fad" data-f="1"></div>
      </div>
      <div class="effets">
        <span class="types">${[['echo', 'Écho'], ['reverb', 'Rév.'], ['flanger', 'Flan.']].map(([t, n]) => `<button type="button" data-fx="${t}">${n}</button>`).join('')}</span>
        <span class="fractions">${[[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1, '1']].map(([f, n]) => `<button type="button" data-frac="${f}">${n}</button>`).join('')}</span>
        <div class="m niveau" data-r="fx"></div>
        <span class="cibles"><button type="button" data-cible="0">A</button><button type="button" data-cible="1">B</button></span>
        <button type="button" class="fx-on" data-act="fx">EFFET</button>
      </div>
      <div class="cross"><span>A</span><div class="curseur-cross"></div><span>B</span><button type="button" data-act="courbe" title="Courbe du crossfader : douce (mix) ou franche (scratch)">Douce</button></div>`);
    $$('.voie', el).forEach((v) => {
      const i = +v.dataset.v;
      for (const [r, lib] of [['gain', 'GAIN'], ['aigu', 'AIGU'], ['med', 'MÉD'], ['bas', 'BAS'], ['filtre', 'FILTRE']]) {
        this.cmd.voies[i][r] = molette($(`[data-r="${r}"]`, v), { libelle: lib, surChange: (x) => { m.reglerVoie(i, r, x); this.surAction('table', i, r); } });
      }
    });
    $$('.fad', el).forEach((f) => { const i = +f.dataset.f; this.cmd.voies[i].fader = fader(f, { valeur: 1, surChange: (x) => { m.reglerVoie(i, 'fader', x); this.surAction('table', i, 'fader'); } }); });
    this.cmd.maitre = molette($('[data-r="maitre"]', el), { min: 0, max: 1, valeur: 0.8, neutre: 0.8, libelle: 'MASTER', surChange: (x) => m.reglerMaitre(x) });
    this.cmd.melange = molette($('[data-r="melange"]', el), { min: 0, max: 1, valeur: 0.5, neutre: 0.5, libelle: 'CUE ◂▸ SALLE', surChange: (x) => m.reglerCasque(m.casque.mode, x) });
    this.cmd.fx = molette($('[data-r="fx"]', el), { min: 0, max: 1, valeur: 0.6, neutre: 0.6, libelle: 'NIVEAU', surChange: (x) => m.reglerEffet({ niveau: x }) });
    this.cmd.cross = fader($('.curseur-cross', el), { min: -1, max: 1, valeur: 0, vertical: false, cran: 0, surChange: (x) => { m.reglerCrossfader(x); this.surAction('cross'); } });
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'cue') { const i = +b.closest('.voie').dataset.v; m.reglerVoie(i, 'cue', !m.voies[i].cue); if (m.casque.mode === 'salle') m.reglerCasque('casque'); }
      else if (b.dataset.casque) m.reglerCasque(b.dataset.casque);
      else if (b.dataset.fx) m.reglerEffet({ type: b.dataset.fx });
      else if (b.dataset.frac) m.reglerEffet({ fraction: +b.dataset.frac });
      else if (b.dataset.cible) { const v = m.fx.voies.slice(); v[+b.dataset.cible] = !v[+b.dataset.cible]; m.reglerEffet({ voies: v }); }
      else if (b.dataset.act === 'fx') { m.reglerEffet({ actif: !m.fx.actif }); this.surAction('effet'); }
      else if (b.dataset.act === 'courbe') { m.reglerCrossfader(m.crossfader, m.courbe === 'douce' ? 'coupe' : 'douce'); b.textContent = m.courbe === 'douce' ? 'Douce' : 'Franche'; }
    });
    this.vu = $('.vu', el);
    this.table = el;
    return el;
  }

  _clavier() {
    // Platine A : A = CUE, Z = lecture, E = SYNC · Platine B : K = CUE, L = lecture, M = SYNC · flèches : crossfader · 1-4 / 7-0 : repères
    const touches = { KeyQ: [0, 'cue'], KeyW: [0, 'lecture'], KeyE: [0, 'sync'], KeyK: [1, 'cue'], KeyL: [1, 'lecture'], Semicolon: [1, 'sync'] };
    addEventListener('keydown', (e) => {
      if (e.repeat || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || this.racine.offsetParent === null) return;
      const t = touches[e.code];
      if (t) {
        const p = this.m.platines[t[0]];
        if (t[1] === 'cue') p.cueAppui(); else if (t[1] === 'lecture') { p.basculer(); this.surAction('lecture', t[0]); }
        else { const ok = p.basculerSync(this.m.platines[1 - t[0]]); this.cmd.tempo[t[0]].regler(-p.curseur); this._plage(t[0]); this.surAction('sync', t[0], ok); }
        e.preventDefault();
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        this.cmd.cross.regler(this.m.crossfader + (e.code === 'ArrowRight' ? 0.1 : -0.1), true); e.preventDefault();
      } else if (/^Digit[1-4]$/.test(e.code)) this.m.platines[0].repere(+e.code.slice(5) - 1);
      else if (/^Digit[7890]$/.test(e.code)) this.m.platines[1].repere('7890'.indexOf(e.code.slice(5)));
    });
    addEventListener('keyup', (e) => { const t = touches[e.code]; if (t && t[1] === 'cue') this.m.platines[t[0]].cueRelache(); });
  }

  _plage(i) { $('[data-act="plage"]', this.vues[i].el).textContent = `±${Math.round(this.m.platines[i].plage * 100)} %`; }

  /** À appeler quand un morceau vient d'être chargé sur une platine. */
  charge(i) {
    const p = this.m.platines[i];
    this.ondes[i] = new Onde(p.morceau);
    this.cmd.tempo[i].regler(-p.curseur);
    $('.charge', this.vues[i].el).textContent = '';
  }
  /** Vide les deux platines (début d'une soirée). */
  vider() {
    this.m.platines.forEach((p, i) => { p.decharger(); p.reglerPlage(0.08); this.ondes[i] = null; this._plage(i); $('.charge', this.vues[i].el).textContent = 'Aucun morceau — chargez-en un depuis l\'ordinateur'; });
  }

  /** Remet la table à plat (début de soirée). */
  remettreAPlat() {
    for (let i = 0; i < 2; i++) {
      for (const r of ['gain', 'aigu', 'med', 'bas', 'filtre']) this.cmd.voies[i][r].regler(0, true);
      this.cmd.voies[i].fader.regler(1, true);
      this.cmd.tempo[i].regler(0, true);
    }
    this.cmd.cross.regler(0, true);
  }

  // ------------------------------------------------------------------ affichage, à chaque image
  dessiner() {
    const m = this.m;
    for (const vue of this.vues) { this._ecran(vue); this._roue(vue); this._boutons(vue); vue.arret(); }
    this._vumetres();
    const t = this.table;
    $$('.pre', t).forEach((b, i) => b.classList.toggle('actif', m.voies[i].cue));
    $$('[data-casque]', t).forEach((b) => b.classList.toggle('actif', b.dataset.casque === m.casque.mode));
    $$('[data-fx]', t).forEach((b) => b.classList.toggle('actif', b.dataset.fx === m.fx.type));
    $$('[data-frac]', t).forEach((b) => b.classList.toggle('actif', +b.dataset.frac === m.fx.fraction));
    $$('[data-cible]', t).forEach((b) => b.classList.toggle('actif', m.fx.voies[+b.dataset.cible]));
    $('.fx-on', t).classList.toggle('actif', m.fx.actif);
  }

  _taille(cv) {
    const r = cv.getBoundingClientRect(), k = Math.min(2, devicePixelRatio || 1), w = Math.round(r.width * k), h = Math.round(r.height * k);
    if (w > 0 && (cv.width !== w || cv.height !== h)) { cv.width = w; cv.height = h; }
    return k;
  }

  _ecran(vue) {
    const cv = vue.onde, k = this._taille(cv), g = cv.getContext('2d'), W = cv.width / k, H = cv.height / k, p = this.m.platines[vue.i], mo = p.morceau;
    if (!W) return;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.fillStyle = '#05070a'; g.fillRect(0, 0, W, H);
    g.textBaseline = 'top';
    if (!mo) { g.fillStyle = '#5c6877'; g.font = '13px system-ui'; g.textAlign = 'center'; g.fillText('Platine vide', W / 2, H / 2 - 8); return; }
    const t = p.secondes, hTexte = 30, hVue = Math.max(10, H * 0.2), hOnde = H - hTexte - hVue - 4;
    // ligne d'informations
    const etroit = W < 400;                                                  // petit écran : on ne garde que le temps restant
    g.textAlign = 'left'; g.fillStyle = '#eef2f6'; g.font = '600 13px system-ui';
    g.fillText(mo.titre, 8, 3, W * (etroit ? 0.44 : 0.5));
    g.fillStyle = '#8fa0b3'; g.font = '11px system-ui';
    g.fillText(`${mo.artiste}${mo.camelot ? '  ·  ' + mo.camelot : ''}`, 8, 17, W * (etroit ? 0.44 : 0.5));
    g.textAlign = 'right'; g.fillStyle = p.sync ? '#40c8e0' : '#ffd60a'; g.font = '700 19px system-ui';
    g.fillText(p.bpm.toFixed(1), W - 8, 2);
    g.fillStyle = '#8fa0b3'; g.font = '10px system-ui';
    g.fillText(`BPM  ${(p.tempo - 1 >= 0 ? '+' : '') + ((p.tempo - 1) * 100).toFixed(1)} %`, W - 8, 20);
    g.textAlign = 'center'; g.fillStyle = '#eef2f6'; g.font = '600 14px system-ui';
    const xT = etroit ? W * 0.6 : W * 0.66, reste = mo.duree - t;
    g.fillText(etroit ? `−${mmss(reste)}` : `${mmss(t)}  /  −${mmss(reste)}`, xT, 3);
    if (p.lecture && reste < 20) { g.fillStyle = Math.floor(performance.now() / 300) % 2 ? '#ff453a' : '#7a1f1a'; g.font = '700 10px system-ui'; g.fillText(etroit ? 'FIN' : 'FIN DU MORCEAU', xT, 19); }
    // forme d'onde défilante et grille des temps
    const y0 = hTexte, onde = this.ondes[vue.i];
    if (onde) onde.dessiner(g, 0, y0, W, hOnde, t);
    const pxs = PXS, tG = t - W / 2 / pxs, per = 60 / mo.bpm;
    for (let n = Math.ceil((tG - mo.premierTemps) / per); ; n++) {
      const x = (mo.premierTemps + n * per - tG) * pxs;
      if (x > W) break;
      g.fillStyle = n % 4 === 0 ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.16)';
      g.fillRect(x, y0, 1, n % 4 === 0 ? hOnde : hOnde * 0.3);
    }
    const marque = (ech, coul, nom) => { const x = (ech / mo.fe - tG) * pxs; if (x < -30 || x > W + 30) return; g.fillStyle = coul; g.fillRect(x - 1, y0, 2, hOnde); if (nom) { g.font = '700 9px system-ui'; g.textAlign = 'left'; g.fillText(nom, x + 3, y0 + 1); } };
    if (mo.sections) for (const s of mo.sections) marque(s.debut * mo.fe, 'rgba(255,255,255,.75)', s.nom);
    if (p.boucle) { const xa = (p.boucle.a / mo.fe - tG) * pxs, xb = (p.boucle.b / mo.fe - tG) * pxs; g.fillStyle = 'rgba(50,215,75,.22)'; g.fillRect(xa, y0, xb - xa, hOnde); }
    marque(p.cue, '#ff9f0a', 'CUE');
    p.reperes.forEach((r, n) => { if (r != null) marque(r, COULEURS[n], String(n + 1)); });
    g.fillStyle = '#fff'; g.fillRect(W / 2 - 1, y0 - 1, 2, hOnde + 2);
    // vue d'ensemble
    const yv = H - hVue;
    if (onde) g.drawImage(onde.ensemble, 0, yv, W, hVue);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, yv, (t / mo.duree) * W, hVue);
    g.fillStyle = '#fff'; g.fillRect((t / mo.duree) * W - 1, yv - 1, 2, hVue + 1);
    p.reperes.forEach((r, n) => { if (r != null) { g.fillStyle = COULEURS[n]; g.fillRect((r / mo.fe / mo.duree) * W - 1, yv, 2, hVue); } });
  }

  _roue(vue) {
    const cv = vue.roue, k = this._taille(cv), g = cv.getContext('2d'), S = Math.min(cv.width, cv.height) / k, p = this.m.platines[vue.i];
    if (!S) return;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, cv.width, cv.height);
    const c = S / 2, R = S / 2 - 2;
    if (!(p.molette.touche && p.molette.scratch)) vue.angle = p.secondes * 0.5556 * 2 * Math.PI;
    let gr = g.createRadialGradient(c, c, R * 0.2, c, c, R);
    gr.addColorStop(0, '#2b323b'); gr.addColorStop(0.72, '#1a1f26'); gr.addColorStop(0.74, '#0d1014'); gr.addColorStop(1, '#2a3038');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, R, 0, 7); g.fill();
    g.strokeStyle = '#3d4652'; g.lineWidth = 1;
    for (let n = 0; n < 60; n++) { const a = (n / 60) * 2 * Math.PI; g.beginPath(); g.moveTo(c + Math.cos(a) * R * 0.9, c + Math.sin(a) * R * 0.9); g.lineTo(c + Math.cos(a) * R * 0.98, c + Math.sin(a) * R * 0.98); g.stroke(); }
    // anneau lumineux : avancement du morceau
    if (p.morceau) {
      g.strokeStyle = p.lecture ? '#32d74b' : '#ff9f0a'; g.lineWidth = 3;
      g.beginPath(); g.arc(c, c, R * 0.8, -Math.PI / 2, -Math.PI / 2 + (p.secondes / p.morceau.duree) * 2 * Math.PI); g.stroke();
    }
    // repère tournant du plateau
    g.save(); g.translate(c, c); g.rotate(vue.angle);
    g.fillStyle = '#e8edf2'; g.fillRect(-1.5, -R * 0.7, 3, R * 0.3);
    g.restore();
    gr = g.createRadialGradient(c, c - R * 0.1, 2, c, c, R * 0.36);
    gr.addColorStop(0, '#11161c'); gr.addColorStop(1, '#05070a');
    g.fillStyle = gr; g.beginPath(); g.arc(c, c, R * 0.36, 0, 7); g.fill();
    g.fillStyle = p.molette.touche ? '#40c8e0' : '#8fa0b3'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 ${Math.round(R * 0.2)}px system-ui`;
    g.fillText(p.morceau ? (p.molette.touche ? (p.molette.scratch ? 'SCRATCH' : 'CALAGE') : p.bpm.toFixed(1)) : '—', c, c);
  }

  _boutons(vue) {
    const el = vue.el, p = this.m.platines[vue.i], bat = p.morceau ? Math.floor(p.temps) : 0;
    $('.lecture', el).classList.toggle('actif', p.lecture);
    $('.cue', el).classList.toggle('actif', !!p.morceau && (!p.lecture ? Math.abs(p.secondes * p.morceau.fe - p.cue) < p.morceau.fe * 0.05 || Math.floor(performance.now() / 400) % 2 === 0 : true));
    $$('.pad', el).forEach((b, n) => { b.classList.toggle('pose', p.reperes[n] != null); b.classList.toggle('a-effacer', vue.efface && p.reperes[n] != null); });
    $$('[data-boucle]', el).forEach((b) => b.classList.toggle('actif', !!p.boucle && p.boucle.temps === +b.dataset.boucle));
    const etats = { vinyle: p.vinyle, quant: p.quantifier, inverse: p.inverse, efface: vue.efface };
    $$('[data-act]', el).forEach((b) => { if (b.dataset.act in etats) b.classList.toggle('actif', etats[b.dataset.act]); });
    $('.sync', el).classList.toggle('battement', !!p.morceau && p.lecture && (p.temps - bat) < 0.25);
    $('.sync', el).classList.toggle('actif', p.sync);
    $('.tempo-val', el).textContent = `${(p.tempo - 1 >= 0 ? '+' : '−') + Math.abs((p.tempo - 1) * 100).toFixed(1).replace('.', ',')} %`;
    el.classList.toggle('importe', !!p.morceau && p.morceau.source === 'fichier');
  }

  _vumetres() {
    const cv = this.vu, k = this._taille(cv), g = cv.getContext('2d'), W = cv.width / k, H = cv.height / k, n = this.m.niveaux();
    if (!W) return;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, W, H);
    this.cretes = this.cretes || [0, 0, 0];
    const vals = [n.voies[0], n.maitre, n.voies[1]], seg = 14, hs = (H - 12) / seg;
    vals.forEach((v, c) => {
      this.cretes[c] = Math.max(v, this.cretes[c] * 0.93);
      const niveau = clamp((20 * Math.log10(Math.max(this.cretes[c], 1e-4)) + 36) / 39, 0, 1) * seg, x = c === 1 ? W / 2 - 7 : c === 0 ? 2 : W - 12, l = c === 1 ? 14 : 10;
      for (let s = 0; s < seg; s++) {
        const allume = s < niveau;
        g.fillStyle = s >= seg - 2 ? (allume ? '#ff453a' : '#3a1513') : s >= seg - 5 ? (allume ? '#ffd60a' : '#3a3210') : allume ? '#32d74b' : '#12301a';
        g.fillRect(x, H - 2 - (s + 1) * hs, l, hs - 1.5);
      }
    });
    g.fillStyle = '#8fa0b3'; g.font = '8px system-ui'; g.textAlign = 'center'; g.textBaseline = 'top';
    if (W >= 48) { g.fillText('A', 7, 0); g.fillText('B', W - 7, 0); }
    g.fillText('SORTIE', W / 2, 0);
    this.rouge = n.rouge;
  }
}
