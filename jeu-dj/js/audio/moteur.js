// Moteur audio : deux platines, table de mixage (gain, égaliseur 3 bandes, filtre, faders, crossfader),
// effets rythmés, pré-écoute au casque, limiteur de sortie, mesures de niveau.
import { LecteurDSP } from './lecteur.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dB = (d) => 10 ** (d / 20);

/** Une platine : commande son lecteur (dans le fil audio) et tient l'état vu par le DJ. */
export class Platine {
  constructor(moteur, index) {
    this.m = moteur; this.i = index;
    this.morceau = null;
    this.pos = 0; this.v = 0; this.tMaj = 0;           // dernière position connue (échantillons du morceau) et son heure sur l'horloge audio
    this.tSaut = 0;
    this.lecture = false; this.fin = false;
    this.tempo = 1; this.curseur = 0; this.plage = 0.08;
    this.pas = 0;                                      // finesse du curseur de tempo (0 : continu) ; dépend du matériel
    this.cue = 0; this.cueTenu = false;
    this.reperes = new Array(8).fill(null);
    this.boucle = null;                                // { a, b, temps }
    this.sync = false; this.quantifier = true; this.vinyle = true; this.inverse = false;
    this.molette = { touche: false, v: 0 };
    const ctx = moteur.ctx;
    if (moteur.worklet) {
      this.noeud = new AudioWorkletNode(ctx, 'lecteur-platine', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
      this.noeud.port.onmessage = (e) => this._etat(e.data);
    } else {                                           // secours : même lecteur, dans le fil principal
      this.dsp = new LecteurDSP(ctx.sampleRate);
      this.noeud = ctx.createScriptProcessor(1024, 0, 2);
      this.noeud.onaudioprocess = (e) => {
        this.dsp.traiter(e.outputBuffer.getChannelData(0), e.outputBuffer.getChannelData(1), e.playbackTime);
        this._etat({ pos: this.dsp.pos, v: this.dsp.vitesse, lecture: this.dsp.lecture, fin: this.dsp.fin, t: e.playbackTime + e.outputBuffer.duration });
      };
    }
  }

  _etat(d) {
    if (d.t != null && d.t < this.tSaut) return;          // nouvelles antérieures à un saut programmé : périmées
    this.pos = d.pos; this.v = d.v; this.tMaj = d.t ?? this.m.ctx.currentTime;
    if (d.fin && !this.fin) { this.lecture = false; if (this.surFin) this.surFin(this); }
    this.fin = d.fin;
    if (!d.lecture && this.lecture && !this.cueTenu && d.fin) this.lecture = false;
  }

  envoyer(msg) { if (this.dsp) this.dsp.message(msg); else this.noeud.port.postMessage(msg); }

  /** morceau : { id, titre, artiste, G, D, fe, bpm, premierTemps, duree, cretes, sections… } */
  charger(morceau) {
    this.morceau = morceau;
    // le lecteur reçoit sa propre copie des échantillons
    const G = morceau.G.slice(), D = morceau.D.slice();
    if (this.dsp) this.dsp.message({ t: 'charger', G, D, fe: morceau.fe });
    else this.noeud.port.postMessage({ t: 'charger', G, D, fe: morceau.fe }, [G.buffer, D.buffer]);
    this.pos = 0; this.v = 0; this.lecture = false; this.fin = false; this.boucle = null; this.inverse = false;
    this.reperes = new Array(8).fill(null);
    this.cue = Math.max(0, morceau.premierTemps * morceau.fe);
    this.envoyer({ t: 'aller', pos: this.cue, net: true });
    this.pos = this.cue;
    this.reglerCurseur(this.curseur);
    this._inertie();
  }

  get charge() { return !!this.morceau; }
  /** Position actuelle en secondes (extrapolée entre deux nouvelles du lecteur). */
  get secondes() { return this.secondesA(this.m.ctx.currentTime); }
  /** Position (secondes du morceau) à un instant donné de l'horloge audio, proche de maintenant. */
  secondesA(t) {
    if (!this.morceau) return 0;
    return clamp(this.pos / this.morceau.fe + this.v * clamp(t - this.tMaj, 0, 0.4), 0, this.morceau.duree);
  }
  tempsA(t) { return this.morceau ? ((this.secondesA(t) - this.morceau.premierTemps) * this.morceau.bpm) / 60 : 0; }
  get bpm() { return this.morceau ? this.morceau.bpm * this.tempo : 0; }
  /** Position en temps (battements) depuis le premier temps. */
  get temps() { return this.morceau ? ((this.secondes - this.morceau.premierTemps) * this.morceau.bpm) / 60 : 0; }
  get audible() { return this.lecture || Math.abs(this.v) > 0.02; }

  _tempsVersEch(t) { return (this.morceau.premierTemps + (t * 60) / this.morceau.bpm) * this.morceau.fe; }
  _caler(ech) { return this.quantifier ? this._tempsVersEch(Math.round(((ech / this.morceau.fe - this.morceau.premierTemps) * this.morceau.bpm) / 60)) : ech; }
  _inertie() { this.envoyer({ t: 'inertie', depart: this.vinyle ? 0.05 : 0.012, arret: this.vinyle ? 0.09 : 0.015 }); }

  lire() {
    if (!this.morceau) return;
    this.lecture = true; this.fin = false;
    if (!(this.sync && this._phase(this.m.platines[1 - this.i], true))) this.envoyer({ t: 'lire' });      // SYNC : départ calé sur l'autre platine
  }
  /** Vide la platine. */
  decharger() {
    this.pause();
    this.morceau = null; this.boucle = null; this.sync = false; this.inverse = false; this.reperes = new Array(8).fill(null);
    this.envoyer({ t: 'charger', G: null, D: null, fe: 44100 });
    this.pos = 0; this.v = 0;
  }
  pause() { this.lecture = false; this.envoyer({ t: 'pause' }); }
  basculer() { if (this.lecture) this.pause(); else this.lire(); }
  aller(sec, net = true) {
    if (!this.morceau) return;
    const p = clamp(sec * this.morceau.fe, 0, this.morceau.G.length - 4);
    this.pos = p; this.tMaj = this.tSaut = this.m.ctx.currentTime;
    this.envoyer({ t: 'aller', pos: p, net });
  }

  // Touche CUE, comme sur un lecteur de club : à l'arrêt, elle pose le point de départ (et joue tant qu'on la tient) ;
  // en lecture, elle y revient et s'arrête.
  cueAppui() {
    if (!this.morceau) return;
    if (this.lecture && !this.cueTenu) { this.pause(); this.aller(this.cue / this.morceau.fe); return; }
    const ici = this.secondes * this.morceau.fe;
    if (Math.abs(ici - this.cue) > this.morceau.fe * 0.03) this.cue = this._caler(ici);
    this.aller(this.cue / this.morceau.fe);
    this.cueTenu = true;
    this.envoyer({ t: 'lire' });
  }
  cueRelache() {
    if (!this.cueTenu) return;
    this.cueTenu = false;
    if (!this.lecture) { this.envoyer({ t: 'pause' }); this.aller(this.cue / this.morceau.fe); }
  }

  /** Repère instantané n : le pose s'il est libre, sinon y saute. */
  repere(n, effacer = false) {
    if (!this.morceau) return;
    if (effacer) { this.reperes[n] = null; return; }
    if (this.reperes[n] == null) this.reperes[n] = this._caler(this.secondes * this.morceau.fe);
    else { this.aller(this.reperes[n] / this.morceau.fe); if (!this.lecture) this.lire(); }
  }

  /** Boucle automatique de `temps` battements à partir d'ici (une seconde pression la retire). */
  boucleAuto(temps) {
    if (!this.morceau) return;
    if (this.boucle && this.boucle.temps === temps) { this.sortirBoucle(); return; }
    const a = this.boucle ? this.boucle.a : this._caler(this.secondes * this.morceau.fe);
    const b = a + ((temps * 60) / this.morceau.bpm) * this.morceau.fe;
    this.boucle = { a, b, temps };
    this.envoyer({ t: 'boucle', a, b });
  }
  sortirBoucle() { this.boucle = null; this.envoyer({ t: 'boucle', a: null }); }

  /** Curseur de tempo : -1 (plus lent) à +1 (plus rapide), dans la plage choisie (±8, ±16 ou ±50 %). */
  reglerCurseur(c, exact = false) {
    this.curseur = clamp(c, -1, 1);
    let t = 1 + this.curseur * this.plage;
    if (!exact && this.pas) t = Math.round(t / this.pas) * this.pas;       // un curseur court avance par petits crans
    this.tempo = t;
    this.envoyer({ t: 'tempo', v: this.tempo });
  }
  reglerPlage(p) { this.plage = p; this.reglerCurseur(this.curseur); }
  pousser(v) { this.envoyer({ t: 'pousse', v }); }
  reglerVinyle(v) { this.vinyle = v; this._inertie(); }
  reglerInverse(v) { this.inverse = v; this.envoyer({ t: 'inverse', v }); }

  // Molette : posée sur le dessus en mode vinyle, la main tient le disque (scratch) ; sinon elle cale le tempo.
  moletteToucher(dessus) {
    this.molette.touche = true; this.molette.scratch = dessus && this.vinyle;
    if (this.molette.scratch) this.envoyer({ t: 'scratch', actif: true, v: 0 });
  }
  /** vitesse : tours de plateau par seconde, rapportés à 33 tours 1/3 (1 = vitesse normale). */
  moletteTourner(vitesse) {
    if (!this.molette.touche) return;
    if (this.molette.scratch) this.envoyer({ t: 'scratch', actif: true, v: vitesse });
    else this.pousser(clamp(vitesse * 0.25, -0.3, 0.3));
  }
  moletteLacher() {
    if (!this.molette.touche) return;
    this.molette.touche = false;
    if (this.molette.scratch) this.envoyer({ t: 'scratch', actif: false });
    this.pousser(0);
  }

  /** Aligne le tempo, puis les temps, sur l'autre platine. */
  synchroniser(autre) {
    if (!this.morceau || !autre || !autre.morceau) return false;
    let cible = autre.bpm / this.morceau.bpm;
    while (cible > 1.42) cible /= 2;                   // tempos doubles ou moitiés (hip-hop et drum & bass, par exemple)
    while (cible < 0.71) cible *= 2;
    if (Math.abs(cible - 1) > this.plage) this.plage = Math.abs(cible - 1) <= 0.16 ? 0.16 : 0.5;
    this.reglerCurseur((cible - 1) / this.plage, true);
    if (this.lecture) this._phase(autre, false);
    return true;
  }
  /** Touche SYNC : la platine suit l'autre (tempo tout de suite, temps calés au départ) jusqu'à ce qu'on la relâche ou qu'on touche au curseur. */
  basculerSync(autre) {
    if (this.sync) { this.sync = false; return false; }
    this.sync = this.synchroniser(autre);
    return this.sync;
  }
  /**
   * Fait coïncider les temps avec ceux de l'autre platine. Le saut est programmé un court instant plus tard sur l'horloge audio,
   * et exécuté par le lecteur à l'échantillon près. `demarrage` : la platine part à cet instant (on compense la mise en vitesse du plateau).
   */
  _phase(autre, demarrage) {
    if (!autre || !autre.morceau || !autre.audible || !this.morceau) return false;
    const mo = this.morceau, quand = this.m.ctx.currentTime + 0.05, per = 60 / mo.bpm;
    const k = this.bpm / autre.bpm, f = k > 1.5 ? 2 : k < 0.67 ? 0.5 : 1;
    const ici = demarrage ? this.pos / mo.fe : this.secondesA(quand), tau = demarrage ? (this.vinyle ? 0.05 : 0.012) : 0;
    let d = autre.tempsA(quand) * f + (tau * this.bpm) / 60 - ((ici - mo.premierTemps) * mo.bpm) / 60;
    d -= Math.round(d);
    let cible = ici + d * per;
    while (cible < 0) cible += per;
    this.envoyer({ t: 'caler', pos: cible * mo.fe, quand, lire: demarrage });
    this.pos = cible * mo.fe; this.tMaj = quand; this.tSaut = quand;
    if (demarrage) this.v = 0;
    return true;
  }

  /** Décale la grille de temps (morceaux importés dont le premier temps est mal détecté). */
  decalerGrille(fraction) { if (this.morceau) this.morceau.premierTemps += (fraction * 60) / this.morceau.bpm; }
}

export class Moteur {
  constructor() { this.ctx = null; this.pret = false; }

  /** À appeler depuis un clic (les navigateurs n'autorisent le son qu'après un geste). */
  async demarrer() {
    if (this.pret) { await this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext;
    const ctx = (this.ctx = new C({ latencyHint: 'interactive' }));
    try {
      await ctx.audioWorklet.addModule(new URL('./lecteur.js', import.meta.url));
      this.worklet = true;
    } catch (e) { this.worklet = false; }
    // ---- sorties
    this.salle = ctx.createGain();                     // ce que le public entend
    this.bus = ctx.createGain();                       // somme des voies après le crossfader
    this.maitre = ctx.createGain();
    this.maitre.gain.value = 0.8;
    this.limiteur = ctx.createDynamicsCompressor();
    this.limiteur.threshold.value = -2; this.limiteur.knee.value = 0; this.limiteur.ratio.value = 20; this.limiteur.attack.value = 0.002; this.limiteur.release.value = 0.12;
    this.mesureMaitre = ctx.createAnalyser();
    this.mesureMaitre.fftSize = 1024; this.mesureMaitre.smoothingTimeConstant = 0.6;
    this.duck = ctx.createGain();                      // la musique s'efface quand on parle au micro
    this.bus.connect(this.duck); this.duck.connect(this.maitre); this.maitre.connect(this.mesureMaitre); this.maitre.connect(this.limiteur); this.limiteur.connect(this.salle);
    // ---- casque : pré-écoute seule, ou d'une oreille (gauche : pré-écoute, droite : salle)
    this.busCue = ctx.createGain();
    this.casque = { mode: 'salle', melange: 0.5 };
    this.fuite = 0;                                    // ce que le casque laisse passer du son de la salle (0 : rien)
    this.versSalle = ctx.createGain(); this.versCue = ctx.createGain(); this.versCue.gain.value = 0;
    this.salle.connect(this.versSalle); this.busCue.connect(this.versCue);
    this.fusion = ctx.createChannelMerger(2);
    this.monoCue = ctx.createGain(); this.monoSalle = ctx.createGain();
    for (const n of [this.monoCue, this.monoSalle]) { n.channelCount = 1; n.channelCountMode = 'explicit'; n.gain.value = 0; }
    this.busCue.connect(this.monoCue); this.salle.connect(this.monoSalle);
    this.monoCue.connect(this.fusion, 0, 0); this.monoSalle.connect(this.fusion, 0, 1);
    this.volume = ctx.createGain();
    this.versSalle.connect(this.volume); this.versCue.connect(this.volume); this.fusion.connect(this.volume);
    this.volume.connect(ctx.destination);
    // ---- effets (envoi depuis les voies, retour sur le bus)
    this._effets();
    // ---- voies et platines
    this.platines = [new Platine(this, 0), new Platine(this, 1)];
    this.voies = this.platines.map((p) => this._voie(p));
    this.crossfader = 0; this.courbe = 'douce';
    this.reglerCrossfader(0);
    this.tampon = new Float32Array(1024); this.spectre = new Uint8Array(512);
    this.pret = true;
  }

  _voie(platine) {
    const ctx = this.ctx, v = { gain: 0, bas: 0, med: 0, aigu: 0, filtre: 0, fader: 1, cue: false, effet: false };
    v.nGain = ctx.createGain();
    v.nBas = ctx.createBiquadFilter(); v.nBas.type = 'lowshelf'; v.nBas.frequency.value = 220;
    v.nMed = ctx.createBiquadFilter(); v.nMed.type = 'peaking'; v.nMed.frequency.value = 1100; v.nMed.Q.value = 0.75;
    v.nAigu = ctx.createBiquadFilter(); v.nAigu.type = 'highshelf'; v.nAigu.frequency.value = 3600;
    v.nPB = ctx.createBiquadFilter(); v.nPB.type = 'lowpass'; v.nPB.frequency.value = 21000; v.nPB.Q.value = 0.9;
    v.nPH = ctx.createBiquadFilter(); v.nPH.type = 'highpass'; v.nPH.frequency.value = 12; v.nPH.Q.value = 0.9;
    v.mesure = ctx.createAnalyser(); v.mesure.fftSize = 512;
    v.nFader = ctx.createGain();
    v.nCross = ctx.createGain();
    v.nCue = ctx.createGain(); v.nCue.gain.value = 0;
    v.nEnvoi = ctx.createGain(); v.nEnvoi.gain.value = 0;
    platine.noeud.connect(v.nGain);
    v.nGain.connect(v.nBas); v.nBas.connect(v.nMed); v.nMed.connect(v.nAigu); v.nAigu.connect(v.nPB); v.nPB.connect(v.nPH);
    v.nPH.connect(v.mesure); v.nPH.connect(v.nFader); v.nPH.connect(v.nCue);
    v.nFader.connect(v.nCross); v.nCross.connect(this.bus);
    v.nFader.connect(v.nEnvoi); v.nEnvoi.connect(this.entreeEffet);
    v.nCue.connect(this.busCue);
    v.tampon = new Float32Array(512);
    return v;
  }

  _effets() {
    const ctx = this.ctx;
    this.entreeEffet = ctx.createGain();
    this.retourEffet = ctx.createGain(); this.retourEffet.gain.value = 0.8;
    this.retourEffet.connect(this.bus);
    // écho rythmé
    const retard = ctx.createDelay(2.5), reinj = ctx.createGain(), couleur = ctx.createBiquadFilter();
    couleur.type = 'lowpass'; couleur.frequency.value = 3800; reinj.gain.value = 0.5; retard.delayTime.value = 0.375;
    retard.connect(couleur); couleur.connect(reinj); reinj.connect(retard);
    // réverbération : réponse fabriquée (bruit qui s'éteint)
    const reverb = ctx.createConvolver(), n = Math.floor(ctx.sampleRate * 2.4), rep = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = rep.getChannelData(c); let s = 12345 + c * 777; for (let i = 0; i < n; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = (s / 2147483648 - 1) * Math.exp(-i / (ctx.sampleRate * 0.55)) * (i < 200 ? i / 200 : 1); } }
    reverb.buffer = rep;
    // flanger : très court retard balayé
    const fl = ctx.createDelay(0.05), flReinj = ctx.createGain(), lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
    fl.delayTime.value = 0.004; flReinj.gain.value = 0.6; lfo.frequency.value = 0.25; lfoGain.gain.value = 0.003;
    lfo.connect(lfoGain); lfoGain.connect(fl.delayTime); lfo.start(); fl.connect(flReinj); flReinj.connect(fl);
    this.fx = { type: 'echo', actif: false, niveau: 0.6, fraction: 0.75, voies: [true, true],
      modules: { echo: { e: retard, s: retard, retard, reinj }, reverb: { e: reverb, s: reverb }, flanger: { e: fl, s: fl, lfo } }, aiguillage: {} };
    for (const [nom, mod] of Object.entries(this.fx.modules)) {
      const g = ctx.createGain(); g.gain.value = nom === 'echo' ? 1 : 0;
      this.entreeEffet.connect(g); g.connect(mod.e); mod.s.connect(this.retourEffet);
      this.fx.aiguillage[nom] = g;
    }
  }

  // ------------------------------------------------------------------ réglages de la table
  /** valeur : -1 à 1 pour gain, bas, med, aigu et filtre ; 0 à 1 pour le fader. */
  reglerVoie(i, nom, valeur) {
    const v = this.voies[i], t = this.ctx.currentTime;
    v[nom] = valeur;
    const eq = (x) => (x >= 0 ? x * 6 : x * 26);       // +6 dB en butée haute, coupure à -26 dB en butée basse
    if (nom === 'gain') v.nGain.gain.setTargetAtTime(dB(valeur * 12), t, 0.01);
    else if (nom === 'bas') v.nBas.gain.setTargetAtTime(eq(valeur), t, 0.01);
    else if (nom === 'med') v.nMed.gain.setTargetAtTime(eq(valeur), t, 0.01);
    else if (nom === 'aigu') v.nAigu.gain.setTargetAtTime(eq(valeur), t, 0.01);
    else if (nom === 'filtre') {                       // à gauche : passe-bas qui se ferme ; à droite : passe-haut qui monte
      const pb = valeur < -0.03 ? 20000 * 2 ** (valeur * 7.2) : 21000, ph = valeur > 0.03 ? 20 * 2 ** (valeur * 8.2) : 12;
      v.nPB.frequency.setTargetAtTime(pb, t, 0.015); v.nPH.frequency.setTargetAtTime(ph, t, 0.015);
      const q = 0.9 + Math.abs(valeur) * 3.5;
      v.nPB.Q.setTargetAtTime(q, t, 0.02); v.nPH.Q.setTargetAtTime(q, t, 0.02);
    } else if (nom === 'fader') v.nFader.gain.setTargetAtTime(valeur * valeur, t, 0.008);
    else if (nom === 'cue') { v.nCue.gain.setTargetAtTime(valeur ? 1 : 0, t, 0.01); }
    else if (nom === 'effet') this._majEffet();
  }

  /** Crossfader : -1 (platine A seule) à +1 (platine B seule). */
  reglerCrossfader(x, courbe = this.courbe) {
    this.crossfader = clamp(x, -1, 1); this.courbe = courbe;
    const p = (this.crossfader + 1) / 2, t = this.ctx.currentTime;
    const [a, b] = courbe === 'coupe' ? [p < 0.96 ? 1 : (1 - p) / 0.04, p > 0.04 ? 1 : p / 0.04] : [Math.min(1, Math.cos((p * Math.PI) / 2) * 1.19), Math.min(1, Math.sin((p * Math.PI) / 2) * 1.19)];
    this.voies[0].nCross.gain.setTargetAtTime(a, t, 0.006);
    this.voies[1].nCross.gain.setTargetAtTime(b, t, 0.006);
    this.voies[0].croise = a; this.voies[1].croise = b;
  }
  /** Micro ouvert : la musique baisse d'elle-même, comme avec la fonction « talkover » d'une table de mixage. */
  reglerMicro(actif) { this.micro = actif; this.duck.gain.setTargetAtTime(actif ? 0.2 : 1, this.ctx.currentTime, 0.07); }
  reglerMaitre(v) { this.maitre.gain.setTargetAtTime(v * v * 1.25, this.ctx.currentTime, 0.01); this.niveauMaitre = v; }

  /** Écoute du DJ : 'salle' (comme le public), 'casque' (mélange pré-écoute / salle) ou 'partage' (une oreille chacun). */
  reglerCasque(mode, melange = this.casque.melange) {
    this.casque = { mode, melange };
    const t = this.ctx.currentTime, r = (n, v) => n.gain.setTargetAtTime(v, t, 0.01);
    r(this.versSalle, mode === 'salle' ? 1 : mode === 'casque' ? Math.max(melange, this.fuite) : 0);
    r(this.versCue, mode === 'casque' ? 1 - melange : 0);
    r(this.monoCue, mode === 'partage' ? 1 : 0); r(this.monoSalle, mode === 'partage' ? 1 : 0);
  }

  /** Effet : type ('echo', 'reverb', 'flanger'), fraction de temps, niveau, voies concernées. */
  reglerEffet(r) { Object.assign(this.fx, r); this._majEffet(); }
  _majEffet() {
    const t = this.ctx.currentTime, fx = this.fx;
    for (const [nom, g] of Object.entries(fx.aiguillage)) g.gain.setTargetAtTime(nom === fx.type ? 1 : 0, t, 0.02);
    this.voies.forEach((v, i) => v.nEnvoi.gain.setTargetAtTime(fx.actif && fx.voies[i] ? fx.niveau : 0, t, 0.015));
    const maitre = this.platines.find((p) => p.audible && p.morceau) || this.platines.find((p) => p.morceau);
    const temps = 60 / (maitre ? maitre.bpm : 120);
    fx.modules.echo.retard.delayTime.setTargetAtTime(clamp(temps * fx.fraction, 0.02, 2.4), t, 0.03);
    fx.modules.echo.reinj.gain.setTargetAtTime(0.35 + fx.niveau * 0.35, t, 0.03);
    fx.modules.flanger.lfo.frequency.setTargetAtTime(1 / (temps * Math.max(1, fx.fraction * 8)), t, 0.05);
  }

  // ------------------------------------------------------------------ mesures
  _crete(analyseur, tampon) {
    analyseur.getFloatTimeDomainData(tampon);
    let c = 0, s = 0;
    for (let i = 0; i < tampon.length; i++) { const a = Math.abs(tampon[i]); if (a > c) c = a; s += a * a; }
    return [c, Math.sqrt(s / tampon.length)];
  }
  /** Niveaux instantanés : crête de chaque voie (avant fader), crête et niveau moyen de la sortie. */
  niveaux() {
    if (!this.pret) return { voies: [0, 0], maitre: 0, moyen: 0, rouge: false };
    const voies = this.voies.map((v) => this._crete(v.mesure, v.tampon)[0]);
    const [c, moy] = this._crete(this.mesureMaitre, this.tampon);
    return { voies, maitre: c, moyen: moy, rouge: c > 1.0 };
  }
  /** Énergie des graves, médiums et aigus de la sortie (0 à 1), pour les lumières au rythme du son. */
  bandes() {
    if (!this.pret) return [0, 0, 0];
    this.mesureMaitre.getByteFrequencyData(this.spectre);
    const moy = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += this.spectre[i]; return s / ((b - a) * 255); };
    return [moy(1, 6), moy(8, 60), moy(90, 300)];
  }
  /** Ce que le public entend de chaque platine : 0 (rien) à 1. */
  presence(i) { const v = this.voies[i], p = this.platines[i]; return p.audible ? v.fader * v.fader * (v.croise ?? 1) * Math.min(1, dB(v.gain * 12)) : 0; }
}
