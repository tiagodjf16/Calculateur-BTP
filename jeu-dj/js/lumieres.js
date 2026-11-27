// Jeux de lumière : le pupitre de commande et le calcul, à chaque image, de ce que fait chaque projecteur.
import { $, $$, clamp, fader } from './outils.js';

export const PALETTE = [['Rouge', '#ff2d20'], ['Ambre', '#ff9500'], ['Jaune', '#ffe01a'], ['Vert', '#2bdc4f'], ['Cyan', '#19d3e6'], ['Bleu', '#1667ff'], ['Violet', '#a43cf0'], ['Rose', '#ff2d87'], ['Blanc', '#fff4e0']];
const SCENES = [
  ['ambiance', 'Ambiance', 'Couleur fixe et douce : accueil, repas, début de soirée.'],
  ['pulsation', 'Pulsation', 'Tout bat sur la grosse caisse.'],
  ['poursuite', 'Poursuite', 'Les projecteurs s\'allument l\'un après l\'autre, au tempo.'],
  ['balayage', 'Balayage', 'Les lyres balaient la piste d\'avant en arrière.'],
  ['ciseaux', 'Ciseaux', 'Les faisceaux se croisent : pour les moments forts.'],
  ['slow', 'Slow', 'Lumière chaude et basse, faisceaux sur la boule à facettes.'],
  ['plein', 'Plein feu', 'Tout en blanc : fin de soirée ou annonce.'],
];
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const RVB = PALETTE.map(([, h]) => hex(h));

export class Lumieres {
  constructor(el, moteur) {
    this.el = el; this.m = moteur;
    this.e = { scene: 'ambiance', couleur: 5, auto: true, vitesse: 0.5, gradateur: 0.85, sync: 'son', noir: false,
      strobo: false, aveuglant: false, laser: false, boule: false, uv: false, brouillard: false, fumee: false };
    this.inst = null;                       // installation de la soirée (matériel disponible)
    this.densite = 0;                       // fumée dans la salle, 0 à 1
    this.chauffe = 0; this.temps = 0; this.battement = 0; this.phase = 0; this.tap = [];
    this.tirs = { confettis: 0, etincelles: 0, co2: 0 };
    this.stats = { changements: 0, stroboTenu: 0, noirTenu: 0 };
    this.sortie = { projecteurs: [], ambiance: [0, 0, 0], flash: 0 };
    this.surTir = () => {};
    this._construire();
  }

  /** Adapte le pupitre au matériel de la soirée. */
  installer(inst) {
    this.inst = inst;
    const L = inst.lumieres, n = inst.pupitre.niveau, fx = inst.effets;
    this.dispo = { scenes: n >= 2, vitesse: n >= 2, tempo: n >= 3, strobo: L.strobo > 0 && n >= 2, aveuglant: L.aveuglants > 0 && n >= 2, laser: L.laser > 0 && n >= 2,
      boule: !!fx.boule, uv: !!fx.uv, fumee: !!inst.fumee && !inst.fumee.brouillard, brouillard: !!inst.fumee && inst.fumee.brouillard, confettis: !!fx.confettis, etincelles: !!fx.etincelles, co2: !!fx.co2,
      lumiere: L.pars + L.lyres + L.derbys > 0 };
    Object.assign(this.e, { scene: 'ambiance', noir: false, strobo: false, aveuglant: false, laser: false, boule: false, uv: false, brouillard: false, fumee: false, sync: n >= 3 ? 'tempo' : 'son', auto: true });
    this.densite = 0; this.chauffe = 0; this.tirs = { confettis: fx.confettis ? 1 : 0, etincelles: fx.etincelles ? 2 : 0, co2: fx.co2 ? 99 : 0 };
    this.stats = { changements: 0, stroboTenu: 0, noirTenu: 0 };
    // liste des projecteurs : type et rang dans son groupe
    this.projecteurs = [];
    for (const [type, nb] of [['par', L.pars], ['lyre', L.lyres], ['derby', L.derbys], ['laser', L.laser], ['strobo', L.strobo], ['aveuglant', L.aveuglants]]) for (let k = 0; k < nb; k++) this.projecteurs.push({ type, k, nb });
    this.sortie.projecteurs = this.projecteurs.map((p) => ({ type: p.type, couleur: [0, 0, 0], intensite: 0, pan: 0, tilt: 0 }));
    this._etat();
    $('.pup-note', this.el).textContent = !this.dispo.lumiere ? 'Vous n\'avez aucun jeu de lumière : passez à la boutique.' : n === 1 ? 'Sans pupitre, les projecteurs suivent le son tout seuls. Vous ne choisissez que la couleur, ou le noir.'
      : n === 2 ? 'Pupitre manuel : scènes, couleurs et vitesse à la main. Le calage sur le tempo demande un pilotage relié aux platines.' : 'Lumières calées sur le tempo des platines.';
  }

  _construire() {
    const el = this.el;
    el.innerHTML = [
      '<div class="pup-col"><h3>Scènes</h3><div class="pup-rangee scenes">', SCENES.map(([id, nom, aide]) => '<button type="button" data-scene="' + id + '" title="' + aide + '">' + nom + '</button>').join(''),
      '<button type="button" data-b="noir" title="Tout éteindre">Noir</button></div>',
      '<h3>Couleur</h3><div class="pup-rangee couleurs">', PALETTE.map(([nom, h], k) => '<button type="button" class="pastille" data-couleur="' + k + '" style="--c:' + h + '" title="' + nom + '"></button>').join(''),
      '<button type="button" data-b="auto" title="La couleur change toute seule, toutes les 8 mesures">Auto</button></div>',
      '<h3>Rythme</h3><div class="pup-rangee rythme"><button type="button" data-sync="tempo" title="Suit le tempo de la platine que le public entend">Tempo</button><button type="button" data-sync="son" title="Réagit aux graves">Au son</button>',
      '<button type="button" data-sync="manuel" title="Vitesse réglée à la main">Manuel</button><button type="button" data-b="tap" title="Tapez en rythme pour donner le tempo">TAP</button></div></div>',
      '<div class="pup-col"><div class="pup-faders"><div><div class="f-grad"></div>Intensité</div><div><div class="f-vit"></div>Vitesse</div>',
      '<div class="pup-rangee" style="flex:1"><button type="button" class="flash" data-tenu="strobo" title="Maintenir">Stroboscope</button><button type="button" class="flash" data-tenu="aveuglant" title="Maintenir : éclaire le public">Aveuglants</button>',
      '<button type="button" data-b="laser">Laser</button><button type="button" data-b="boule">Boule à facettes</button><button type="button" data-b="uv">Lumière noire</button></div></div>',
      '<h3>Fumée et effets spéciaux</h3><div class="pup-rangee speciaux"><button type="button" data-tenu="fumee" title="Maintenir pour envoyer une bouffée">Fumée</button><button type="button" data-b="brouillard" title="Voile léger et continu">Brouillard</button>',
      '<button type="button" data-tir="co2" title="Jet de CO₂">Jet CO₂</button><button type="button" data-tir="confettis" title="Un seul tir par soirée">Confettis</button><button type="button" data-tir="etincelles" title="Deux allumages par soirée">Étincelles</button></div>',
      '<div class="pup-jauge"><div class="jauge" style="width:100%"><i></i><span>Fumée dans la salle</span></div></div></div><p class="pup-note"></p>',
    ].join('');
    this.cmdGrad = fader($('.f-grad', el), { valeur: this.e.gradateur, surChange: (v) => { this.e.gradateur = v; } });
    this.cmdVit = fader($('.f-vit', el), { valeur: this.e.vitesse, surChange: (v) => { this.e.vitesse = v; } });
    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b || b.disabled) return;
      const e = this.e;
      if (b.dataset.scene) { if (e.scene !== b.dataset.scene || e.noir) this.stats.changements++; e.scene = b.dataset.scene; e.noir = false; this.dernierChangement = this.temps; }
      else if (b.dataset.couleur) { e.couleur = +b.dataset.couleur; e.auto = false; this.stats.changements++; this.dernierChangement = this.temps; }
      else if (b.dataset.sync) e.sync = b.dataset.sync;
      else if (b.dataset.tir) this.tirer(b.dataset.tir);
      else if (b.dataset.b === 'tap') this._tap();
      else if (b.dataset.b) { e[b.dataset.b] = !e[b.dataset.b]; if (b.dataset.b === 'noir') this.dernierChangement = this.temps; }
      this._etat();
    });
    const tenir = (ev, etat) => { const b = ev.target.closest && ev.target.closest('[data-tenu]'); if (!b || b.disabled) return; this.e[b.dataset.tenu] = etat; b.classList.toggle('tenu', etat); if (etat) { try { b.setPointerCapture(ev.pointerId); } catch (err) { /* sans importance */ } } };
    el.addEventListener('pointerdown', (ev) => tenir(ev, true));
    for (const t of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(t, (ev) => tenir(ev, false));
    this._etat();
  }

  _tap() {
    const t = performance.now();
    this.tap = this.tap.filter((x) => t - x < 3000).concat(t);
    if (this.tap.length >= 3) { const d = (this.tap[this.tap.length - 1] - this.tap[0]) / (this.tap.length - 1); this.bpmTap = 60000 / d; this.e.sync = 'manuel'; this.phase = 0; this._etat(); }
  }

  tirer(nom) {
    if (!this.dispo || !this.dispo[nom] || this.tirs[nom] <= 0) return false;
    if (nom === 'co2' && this.temps - (this.dernierCo2 || -9) < 3) return false;
    this.tirs[nom]--;
    if (nom === 'co2') this.dernierCo2 = this.temps;
    this.surTir(nom);
    this._etat();
    return true;
  }

  _etat() {
    const el = this.el, e = this.e, d = this.dispo || {};
    $$('[data-scene]', el).forEach((b) => { b.classList.toggle('actif', !e.noir && e.scene === b.dataset.scene); b.disabled = !d.scenes && b.dataset.scene !== 'ambiance'; });
    $$('[data-couleur]', el).forEach((b) => b.classList.toggle('actif', !e.auto && e.couleur === +b.dataset.couleur));
    $$('[data-sync]', el).forEach((b) => { b.classList.toggle('actif', e.sync === b.dataset.sync); b.disabled = b.dataset.sync === 'tempo' ? !d.tempo : b.dataset.sync === 'manuel' ? !d.vitesse : false; });
    $$('[data-b]', el).forEach((b) => { const n = b.dataset.b; if (n !== 'tap') b.classList.toggle('actif', !!e[n]); if (n in d) b.disabled = !d[n]; if (n === 'tap') b.disabled = !d.vitesse; });
    $$('[data-tenu]', el).forEach((b) => { b.disabled = !d[b.dataset.tenu]; });
    $$('[data-tir]', el).forEach((b) => { const n = b.dataset.tir; b.disabled = !d[n] || this.tirs[n] <= 0; });
  }

  /** Tempo et position dans la mesure de ce que le public entend (ou null). */
  _maitre() {
    const m = this.m;
    if (!m.pret) return null;
    const i = m.presence(0) >= m.presence(1) ? 0 : 1, p = m.platines[i];
    return p.morceau && p.audible && m.presence(i) > 0.03 ? p : null;
  }

  /** Avance d'un pas de temps et calcule la sortie de chaque projecteur. `energie` : 0 à 1, ce que le public ressent. */
  maj(dt) {
    const e = this.e, s = this.sortie, m = this.m;
    this.temps += dt;
    const [graves] = m.pret ? m.bandes() : [0];
    this.battement = Math.max(graves > 0.62 ? 1 : 0, this.battement - dt * 5);          // impulsion à chaque grosse caisse
    const maitre = this._maitre();
    let bpm = 120;
    if (e.sync === 'tempo' && this.dispo.tempo && maitre) { bpm = maitre.bpm; this.phase = maitre.temps; }
    else { bpm = e.sync === 'manuel' ? (this.bpmTap || 60 + e.vitesse * 120) : 90 + graves * 60; this.phase += (dt * bpm) / 60; }
    const ph = this.phase, temps = ph - Math.floor(ph), coup = e.sync === 'son' || !this.dispo.tempo ? this.battement : Math.exp(-temps * 5);
    // fumée : la machine doit rechauffer entre deux bouffées ; le brouillard est continu
    const f = this.inst && this.inst.fumee;
    if (f) {
      if (e.fumee && this.chauffe <= 0) { this.densite += dt * 0.22 * f.debit; this.jet = (this.jet || 0) + dt; if (this.jet > 2.5) { this.chauffe = f.pause; this.jet = 0; } }
      else { if (!e.fumee) this.jet = Math.max(0, (this.jet || 0) - dt); this.chauffe = Math.max(0, this.chauffe - dt); }
      if (e.brouillard) this.densite += dt * 0.012 * f.debit * (this.densite < 0.4 ? 1 : 0.15);
    }
    this.densite = clamp(this.densite - dt * (0.006 + this.densite * 0.012), 0, 1);
    const jg = $('.pup-jauge i', this.el);
    if (jg) jg.style.width = Math.round(this.densite * 100) + '%';
    // couleur
    if (e.auto) e.couleurAuto = Math.floor(ph / 32) % 8;
    const ic = e.auto ? e.couleurAuto : e.couleur, c1 = RVB[ic], c2 = RVB[(ic + 3) % 8];
    const scene = this.dispo && !this.dispo.scenes ? 'pulsation' : e.scene, g = e.noir ? 0 : e.gradateur;
    if (e.strobo) this.stats.stroboTenu += dt;
    if (e.noir || !this.dispo.lumiere) this.stats.noirTenu += dt;
    const strobo = e.strobo && Math.floor(this.temps * 22) % 2 === 0 ? 1 : 0;
    let somme = [0, 0, 0], nb = 0;
    this.projecteurs.forEach((p, i) => {
      const o = s.projecteurs[i], rang = p.nb > 1 ? p.k / (p.nb - 1) : 0.5, pair = p.k % 2;
      let I = 0, coul = c1, pan = 0, tilt = 0;
      if (p.type === 'par') {
        coul = pair && scene !== 'ambiance' && scene !== 'slow' ? c2 : c1;
        I = scene === 'ambiance' ? 0.7 : scene === 'slow' ? 0.35 : scene === 'plein' ? 1 : scene === 'pulsation' ? 0.25 + 0.75 * coup
          : scene === 'poursuite' ? (Math.floor(ph * 2) % p.nb === p.k ? 1 : 0.08) : 0.35 + 0.65 * ((Math.floor(ph) + pair) % 2);
        if (scene === 'plein') coul = RVB[8];
        if (scene === 'slow') coul = RVB[1];
      } else if (p.type === 'lyre') {
        const t = ph * 0.5;
        I = scene === 'ambiance' ? 0.3 : scene === 'slow' ? 0.55 : scene === 'plein' ? 1 : scene === 'pulsation' ? 0.3 + 0.7 * coup : 0.9;
        coul = scene === 'plein' ? RVB[8] : scene === 'slow' ? RVB[8] : pair ? c1 : c2;
        if (scene === 'ambiance') { pan = (rang - 0.5) * 0.8; tilt = 0.5 + Math.sin(this.temps * 0.2 + p.k) * 0.08; }
        else if (scene === 'slow') { pan = (0.5 - rang) * 1.0; tilt = 0.12; }                       // tournées vers la boule, au centre
        else if (scene === 'balayage') { pan = (rang - 0.5) * 0.9; tilt = 0.55 + Math.sin(t * Math.PI) * 0.45; }
        else if (scene === 'ciseaux') { pan = (pair ? 1 : -1) * Math.sin(t * Math.PI) * 0.9; tilt = 0.6 + Math.cos(t * Math.PI * 2) * 0.15; }
        else if (scene === 'poursuite') { pan = Math.sin(t * Math.PI + rang * Math.PI * 2) * 0.8; tilt = 0.6 + Math.cos(t * Math.PI + rang * Math.PI * 2) * 0.3; }
        else { pan = (rang - 0.5) * 1.2 + Math.sin(t * Math.PI * 0.5 + p.k) * 0.25; tilt = 0.65 + coup * 0.1; }
      } else if (p.type === 'derby') { I = scene === 'ambiance' || scene === 'slow' ? 0.15 : 0.8; coul = pair ? c2 : c1; pan = this.temps * (0.4 + e.vitesse) * (pair ? 1 : -1) + ph * 0.5; }
      else if (p.type === 'laser') { I = e.laser ? 1 : 0; coul = RVB[3]; pan = Math.sin(ph * Math.PI * 0.25) * 0.8; tilt = 0.5 + Math.sin(ph * Math.PI * 0.5) * 0.2; }
      else if (p.type === 'strobo') { I = strobo; coul = RVB[8]; }
      else if (p.type === 'aveuglant') { I = e.aveuglant ? 1 : 0; coul = RVB[1]; }
      if (p.type !== 'strobo' && p.type !== 'aveuglant' && p.type !== 'laser') I *= g;
      if (e.noir && p.type !== 'strobo' && p.type !== 'aveuglant') I = 0;
      o.intensite = I; o.couleur = coul; o.pan = pan; o.tilt = tilt;
      if (p.type === 'par' || p.type === 'lyre') { for (let k = 0; k < 3; k++) somme[k] += coul[k] * I; nb++; }
    });
    s.ambiance = nb ? somme.map((v) => v / nb) : [0, 0, 0];
    s.flash = Math.max(strobo && this.dispo.strobo ? 1 : 0, e.aveuglant && this.dispo.aveuglant ? 0.8 : 0);
    s.boule = e.boule && this.dispo.boule ? 1 : 0; s.uv = e.uv && this.dispo.uv ? 1 : 0; s.densite = this.densite; s.fumee = e.fumee && this.chauffe <= 0 && !!f && !f.brouillard;
    s.mouvement = scene === 'ambiance' || scene === 'slow' || scene === 'plein' ? 0.2 : 1; s.scene = scene; s.noir = e.noir || !this.dispo.lumiere;
    return s;
  }
}
