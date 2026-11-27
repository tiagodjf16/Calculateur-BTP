// Lecteur d'une platine : lit un morceau à vitesse variable, échantillon par échantillon.
// Tempo, calage (« pitch bend »), scratch à la molette, démarrage et freinage du plateau, lecture inversée, boucles.
// Le même code tourne dans un AudioWorklet (fil audio) ou, à défaut, dans le fil principal.

export class LecteurDSP {
  constructor(frequenceSortie) {
    this.fs = frequenceSortie;
    this.G = null; this.D = null;       // canaux gauche et droit du morceau
    this.n = 0;
    this.ratio = 1;                     // fréquence du morceau / fréquence de sortie
    this.pos = 0;                       // position de lecture, en échantillons du morceau (réel)
    this.lecture = false;
    this.tempo = 1;                     // vitesse voulue (1 = vitesse d'origine)
    this.pousse = 0;                    // calage momentané (± quelques %)
    this.vitesse = 0;                   // vitesse réelle du plateau (lissée)
    this.scratch = false;
    this.vScratch = 0;
    this.inverse = false;
    this.depart = 0.015;                // temps de mise en vitesse (s)
    this.arret = 0.02;                  // temps d'arrêt (s) : court comme un lecteur numérique, long comme un vinyle
    this.boucle = null;                 // { a, b } en échantillons
    this.fin = false;
    this.attente = null;                // { pos, quand, lire } : saut programmé à un instant précis de l'horloge audio
  }

  charger(G, D, fe) {
    this.G = G; this.D = D || G;
    this.n = G ? G.length : 0;
    this.ratio = fe / this.fs;
    this.pos = 0; this.lecture = false; this.vitesse = 0; this.boucle = null; this.fin = false; this.scratch = false; this.pousse = 0; this.attente = null;
  }

  message(m) {
    switch (m.t) {
      case 'charger': this.charger(m.G, m.D, m.fe); break;
      case 'lire': if (this.n) { this.lecture = true; this.fin = false; } break;
      case 'pause': this.lecture = false; if (this.attente && this.attente.lire) this.attente = null; break;
      case 'caler': this.attente = { pos: m.pos, quand: m.quand, lire: !!m.lire }; break;
      case 'aller': this.pos = Math.max(0, Math.min(this.n - 2, m.pos)); this.fin = false; if (m.net) this.vitesse = this.lecture ? this.tempo : 0; break;
      case 'tempo': this.tempo = m.v; break;
      case 'pousse': this.pousse = m.v; break;
      case 'scratch': this.scratch = m.actif; this.vScratch = m.v || 0; break;
      case 'inverse': this.inverse = m.v; break;
      case 'inertie': this.depart = m.depart; this.arret = m.arret; break;
      case 'boucle': this.boucle = m.a == null ? null : { a: m.a, b: m.b }; break;
      default:
    }
  }

  /** Remplit un bloc de sortie. `maintenant` : heure de l'horloge audio au début du bloc (pour les sauts programmés). */
  traiter(sG, sD, maintenant = 0) {
    const a = this.attente, n = sG.length;
    if (a && this.n >= 4) {
      const i0 = Math.round((a.quand - maintenant) * this.fs);
      if (i0 < n) {                                   // l'instant tombe dans ce bloc (ou vient de passer) : on saute à l'échantillon près
        const k = Math.max(0, i0);
        if (k > 0) this._bloc(sG, sD, 0, k);
        this.attente = null;
        // instant déjà passé : on rattrape le retard, à la vitesse de croisière si la platine démarre
        this.pos = Math.max(1, Math.min(this.n - 4, a.pos + (i0 < 0 ? -i0 * (a.lire ? this.tempo : this.vitesse) * this.ratio : 0)));
        if (a.lire) { this.lecture = true; this.fin = false; }
        this._bloc(sG, sD, k, n);
        return;
      }
    }
    this._bloc(sG, sD, 0, n);
  }

  _bloc(sG, sD, debut, n) {
    const G = this.G, D = this.D;
    if (!G || this.n < 4) { sG.fill(0, debut, n); if (sD !== sG) sD.fill(0, debut, n); return; }
    const cible = this.scratch ? this.vScratch : this.lecture ? (this.inverse ? -1 : 1) * (this.tempo + this.pousse) : 0;
    const tc = this.scratch ? 0.006 : Math.abs(cible) > Math.abs(this.vitesse) ? this.depart : this.arret;
    const k = 1 - Math.exp(-1 / (Math.max(tc, 0.001) * this.fs));
    let pos = this.pos, v = this.vitesse;
    const N = this.n, r = this.ratio, b = this.boucle;
    for (let i = debut; i < n; i++) {
      v += (cible - v) * k;
      pos += v * r;
      if (b && !this.scratch) {
        if (v >= 0 && pos >= b.b) pos -= b.b - b.a;
        else if (v < 0 && pos < b.a && pos > b.a - 4 * Math.abs(v * r) - 2) pos += b.b - b.a;
      }
      if (pos < 1) { pos = 1; if (v < 0) { v = 0; if (!this.scratch) this.lecture = false; } }
      if (pos >= N - 3) { pos = N - 3; v = 0; if (!this.scratch) { this.lecture = false; this.fin = true; } }
      if (Math.abs(v) < 1e-5) { sG[i] = 0; sD[i] = 0; continue; }
      // interpolation d'Hermite sur 4 points
      const j = pos | 0, f = pos - j;
      const g0 = G[j - 1], g1 = G[j], g2 = G[j + 1], g3 = G[j + 2];
      sG[i] = g1 + 0.5 * f * (g2 - g0 + f * (2 * g0 - 5 * g1 + 4 * g2 - g3 + f * (3 * (g1 - g2) + g3 - g0)));
      const d0 = D[j - 1], d1 = D[j], d2 = D[j + 1], d3 = D[j + 2];
      sD[i] = d1 + 0.5 * f * (d2 - d0 + f * (2 * d0 - 5 * d1 + 4 * d2 - d3 + f * (3 * (d1 - d2) + d3 - d0)));
    }
    this.pos = pos; this.vitesse = v;
  }
}

if (typeof registerProcessor === 'function') {
  // eslint-disable-next-line no-undef
  registerProcessor('lecteur-platine', class extends AudioWorkletProcessor {
    constructor() {
      super();
      // eslint-disable-next-line no-undef
      this.dsp = new LecteurDSP(sampleRate);
      this.blocs = 0;
      this.port.onmessage = (e) => this.dsp.message(e.data);
    }

    process(entrees, sorties) {
      const s = sorties[0];
      // eslint-disable-next-line no-undef
      const t = currentTime;
      this.dsp.traiter(s[0], s[1] || s[0], t);
      // eslint-disable-next-line no-undef
      if (++this.blocs % 4 === 0) this.port.postMessage({ pos: this.dsp.pos, v: this.dsp.vitesse, lecture: this.dsp.lecture, fin: this.dsp.fin, t: t + s[0].length / sampleRate });
      return true;
    }
  });
}
