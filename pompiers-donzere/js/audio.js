// Sons synthétisés (Web Audio) : moteur diesel, deux-tons des sapeurs-pompiers, klaxon, alarme de ceinture,
// clignotants, radio, pompe à carburant, portes, chocs. Aucun fichier son : tout est généré.
import { clamp } from './outils.js';

export class Sons {
  constructor() { this.ctx = null; this.muet = false; }

  /** À appeler depuis un clic (les navigateurs n'autorisent le son qu'après un geste). */
  demarrer() {
    if (this.ctx) return;
    try {
      const C = (this.ctx = new (window.AudioContext || window.webkitAudioContext)());
      this.maitre = C.createGain();
      this.maitre.gain.value = 0.8;
      this.maitre.connect(C.destination);
      // bruit blanc partagé
      const n = C.sampleRate * 2, tampon = C.createBuffer(1, n, C.sampleRate), d = tampon.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      this.bruit = tampon;
      this._moteur();
      this._deuxTons();
      this._klaxon();
      this._pompe();
    } catch (e) { this.ctx = null; }
  }

  couper(muet) { this.muet = muet; if (this.ctx) this.maitre.gain.value = muet ? 0 : 0.8; }

  _source(boucle = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.bruit; s.loop = boucle;
    return s;
  }

  _moteur() {
    const C = this.ctx;
    const g = (this.gMoteur = C.createGain());
    g.gain.value = 0;
    const filtre = (this.fMoteur = C.createBiquadFilter());
    filtre.type = 'lowpass'; filtre.frequency.value = 500; filtre.Q.value = 1.2;
    this.oscM = [1, 2.01, 0.5].map((mult, i) => {
      const o = C.createOscillator(), og = C.createGain();
      o.type = i === 2 ? 'square' : 'sawtooth';
      og.gain.value = [0.5, 0.22, 0.35][i];
      o.connect(og); og.connect(filtre); o.start();
      return { o, mult };
    });
    // claquement diesel : bruit filtré, haché à la fréquence des explosions
    const b = this._source(), bf = C.createBiquadFilter(), bg = (this.gClaque = C.createGain());
    bf.type = 'bandpass'; bf.frequency.value = 1700; bf.Q.value = 0.8;
    bg.gain.value = 0.12;
    const hache = (this.hache = C.createOscillator()), hg = C.createGain();
    hache.type = 'square'; hg.gain.value = 0.1;
    hache.connect(hg); hg.connect(bg.gain); hache.start();
    b.connect(bf); bf.connect(bg); bg.connect(filtre); b.start();
    // roulement des pneus
    const r = this._source(), rf = C.createBiquadFilter(), rg = (this.gRoule = C.createGain());
    rf.type = 'lowpass'; rf.frequency.value = 420;
    rg.gain.value = 0;
    r.connect(rf); rf.connect(rg); rg.connect(this.maitre); r.start();
    filtre.connect(g); g.connect(this.maitre);
  }

  /** regime 0..1, charge 0..1, vitesse m/s */
  moteur(marche, regime, charge, vitesse, interieur) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, f = 24 + regime * 88;
    for (const { o, mult } of this.oscM) o.frequency.setTargetAtTime(f * mult, t, 0.05);
    this.hache.frequency.setTargetAtTime(f * 2, t, 0.05);
    this.fMoteur.frequency.setTargetAtTime(260 + regime * 700 + charge * 900, t, 0.08);
    this.gMoteur.gain.setTargetAtTime(marche ? (0.11 + charge * 0.1) * (interieur ? 0.7 : 1) : 0, t, 0.12);
    this.gRoule.gain.setTargetAtTime(clamp(vitesse / 30, 0, 1) * 0.16, t, 0.2);
  }

  _deuxTons() {
    const C = this.ctx;
    const g = (this.gSirene = C.createGain());
    g.gain.value = 0;
    const f = C.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 0.55;
    this.oscS = [1, 1.004, 2].map((mult, i) => {
      const o = C.createOscillator(), og = C.createGain();
      o.type = 'sawtooth'; og.gain.value = i === 2 ? 0.25 : 0.5;
      o.connect(og); og.connect(f); o.start();
      return { o, mult };
    });
    f.connect(g); g.connect(this.maitre);
    this.sireneActive = false;
  }

  /** Deux-tons réglementaire des sapeurs-pompiers : si (488 Hz) – la (435 Hz), cadence lente. */
  deuxTons(actif, interieur) {
    if (!this.ctx) return;
    const C = this.ctx, t = C.currentTime;
    this.gSirene.gain.setTargetAtTime(actif ? (interieur ? 0.1 : 0.17) : 0, t, 0.04);
    if (!actif) { this.sireneActive = false; return; }
    if (!this.sireneActive) { this.sireneActive = true; this.sireneProg = t; this.sireneTon = 0; }
    while (this.sireneProg < t + 0.4) {             // on programme les notes un peu en avance
      const note = this.sireneTon % 2 === 0 ? 488 : 435;
      for (const { o, mult } of this.oscS) o.frequency.setValueAtTime(note * mult, this.sireneProg);
      this.sireneProg += 1.05;
      this.sireneTon++;
    }
  }

  _klaxon() {
    const C = this.ctx, g = (this.gKlaxon = C.createGain());
    g.gain.value = 0;
    for (const fq of [410, 515]) {
      const o = C.createOscillator();
      o.type = 'sawtooth'; o.frequency.value = fq;
      o.connect(g); o.start();
    }
    const f = C.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6;
    g.connect(f); f.connect(this.maitre);
  }

  klaxon(actif) { if (this.ctx) this.gKlaxon.gain.setTargetAtTime(actif ? 0.16 : 0, this.ctx.currentTime, 0.015); }

  _pompe() {
    const C = this.ctx, s = this._source(), f = C.createBiquadFilter(), g = (this.gPompe = C.createGain());
    f.type = 'bandpass'; f.frequency.value = 240; f.Q.value = 2.5;
    g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(this.maitre); s.start();
  }

  pompe(actif) { if (this.ctx) this.gPompe.gain.setTargetAtTime(actif ? 0.5 : 0, this.ctx.currentTime, 0.08); }

  /** Petit son ponctuel : suite de notes [fréquence, durée]. */
  bip(notes, type = 'sine', volume = 0.12) {
    if (!this.ctx) return;
    const C = this.ctx;
    let t = C.currentTime + 0.01;
    for (const [fq, duree] of notes) {
      if (fq > 0) {
        const o = C.createOscillator(), g = C.createGain();
        o.type = type; o.frequency.value = fq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(volume, t + 0.012);
        g.gain.setValueAtTime(volume, t + duree - 0.03);
        g.gain.linearRampToValueAtTime(0, t + duree);
        o.connect(g); g.connect(this.maitre);
        o.start(t); o.stop(t + duree + 0.02);
      }
      t += duree;
    }
  }

  /** Bruit bref (porte, choc, clic). */
  coup(frequence = 300, duree = 0.18, volume = 0.5) {
    if (!this.ctx) return;
    const C = this.ctx, s = this._source(false), f = C.createBiquadFilter(), g = C.createGain(), t = C.currentTime;
    f.type = 'lowpass'; f.frequency.value = frequence;
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duree);
    s.connect(f); f.connect(g); g.connect(this.maitre);
    s.start(t, Math.random()); s.stop(t + duree + 0.05);
  }

  ceinture() { this.bip([[1180, 0.14], [0, 0.1], [1180, 0.14]], 'sine', 0.09); }
  clic() { this.coup(2400, 0.03, 0.25); }
  radio() { this.bip([[1320, 0.07], [0, 0.04], [1760, 0.09]], 'square', 0.05); }
  /** Appel sélectif : la tonalité qui annonce un départ en intervention. */
  alerte() { this.bip([[1240, 0.16], [1530, 0.16], [1860, 0.16], [1240, 0.16], [1530, 0.16], [1860, 0.3], [0, 0.15], [960, 0.45]], 'square', 0.08); }
  porte() { this.coup(420, 0.22, 0.6); }
  choc(force) { this.coup(700, 0.35, clamp(force / 12, 0.3, 1)); }
  reussite() { this.bip([[660, 0.12], [880, 0.12], [1100, 0.22]], 'triangle', 0.1); }
  erreur() { this.bip([[300, 0.16], [220, 0.26]], 'sawtooth', 0.06); }
  moniteur() { this.bip([[980, 0.07]], 'sine', 0.05); }
  charge() { this.bip([[500, 0.5], [700, 0.5], [1000, 0.6], [1500, 0.5]], 'sawtooth', 0.04); }
}
