// Bibliothèque musicale : morceaux fournis par le jeu (fabriqués à la demande) et fichiers audio importés par le joueur.
import { CATALOGUE, dureeDe } from './synthe.js';
import { travailler } from './fabrique.js';

const GARDES = 2;                        // morceaux prêts gardés en mémoire (ceux des platines sont confiés à leur lecteur)

export class Bibliotheque {
  constructor(moteur) {
    this.moteur = moteur;
    this.morceaux = CATALOGUE.map((m) => ({ ...m, source: 'jeu', duree: dureeDe(m), joue: 0, favori: false }));
    this.cache = new Map();              // id -> données audio
    this.attentes = new Map();           // id -> promesse en cours
    this.travaux = new Map();
    this.cle = 0; this.nImport = 0;
    this.surChange = () => {};
    try {
      this.ouvrier = new Worker(new URL('./fabrique.js', import.meta.url), { type: 'module' });
      this.ouvrier.onmessage = (e) => this._reponse(e.data);
      this.ouvrier.onerror = () => this._sansOuvrier();
    } catch (e) { this.ouvrier = null; }
  }

  _sansOuvrier() {                       // le fil secondaire n'a pas pu démarrer : on refait les travaux en cours ici
    this.ouvrier = null;
    for (const [cle, t] of this.travaux) { this.travaux.delete(cle); this._local(t.msg, t.progres).then(t.ok, t.ko); }
  }
  _reponse(d) {
    const t = this.travaux.get(d.cle);
    if (!t) return;
    if (d.progres != null) { t.progres(d.progres); return; }
    this.travaux.delete(d.cle);
    if (d.erreur) t.ko(new Error(d.erreur)); else t.ok(d.ok);
  }
  async _local(msg, progres) { await new Promise((r) => setTimeout(r, 30)); return travailler(msg, progres); }
  _travail(msg, transfert, progres = () => {}) {
    if (!this.ouvrier) return this._local(msg, progres);
    return new Promise((ok, ko) => {
      const cle = ++this.cle;
      this.travaux.set(cle, { ok, ko, progres, msg });
      this.ouvrier.postMessage({ ...msg, cle }, transfert || []);
    });
  }

  fiche(id) { return this.morceaux.find((m) => m.id === id); }

  /** Données audio d'un morceau (fabrication ou décodage à la première demande). */
  obtenir(id, progres = () => {}) {
    if (this.cache.has(id)) { const d = this.cache.get(id); this.cache.delete(id); if (d.G) { this.cache.set(id, d); return Promise.resolve(d); } }      // sans échantillons : il est parti sur une platine, on le refait
    if (this.attentes.has(id)) return this.attentes.get(id);
    const f = this.fiche(id);
    const p = (async () => {
      let r;
      if (f.source === 'jeu') r = await this._travail({ t: 'generer', id, fe: 44100 }, null, progres);
      else {
        progres(0.05);
        const tampon = await this.moteur.ctx.decodeAudioData(await f.fichier.arrayBuffer());
        const G = tampon.getChannelData(0).slice(), D = (tampon.numberOfChannels > 1 ? tampon.getChannelData(1) : tampon.getChannelData(0)).slice();
        r = await this._travail({ t: 'analyser', G, D, fe: tampon.sampleRate }, [G.buffer, D.buffer], (x) => progres(0.3 + x * 0.7));
        if (f.grille) { r.bpm = f.grille.bpm; r.premierTemps = f.grille.premierTemps; }       // réglages déjà faits par le joueur
        f.bpm = r.bpm; f.energie = f.energie || r.energie;
      }
      f.duree = r.duree;
      const d = { ...f, ...r, id };
      this.cache.set(id, d);
      this.attentes.delete(id);
      this._alleger();
      this.surChange();
      return d;
    })();
    p.catch(() => this.attentes.delete(id));
    this.attentes.set(id, p);
    return p;
  }

  _alleger() {
    for (const [id, d] of [...this.cache]) if (!d.G) this.cache.delete(id);
    for (const id of [...this.cache.keys()]) { if (this.cache.size <= GARDES) break; this.cache.delete(id); }
  }

  /** Ajoute des fichiers audio du joueur (MP3, WAV, OGG, FLAC, M4A… selon le navigateur). */
  importer(fichiers) {
    const ajoutes = [];
    for (const fichier of fichiers) {
      if (!/^audio\//.test(fichier.type) && !/\.(mp3|wav|ogg|oga|flac|m4a|aac|opus|webm)$/i.test(fichier.name)) continue;
      const nom = fichier.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ');
      const [artiste, titre] = nom.includes(' - ') ? nom.split(' - ', 2) : ['', nom];
      const f = { id: 'f' + ++this.nImport, titre: titre.trim(), artiste: artiste.trim() || 'Fichier importé', genre: 'Importé', bpm: null, tonalite: '', camelot: '', energie: null,
        source: 'fichier', fichier, duree: null, joue: 0, favori: false };
      this.morceaux.push(f);
      ajoutes.push(f);
    }
    this.surChange();
    return ajoutes;
  }
}
