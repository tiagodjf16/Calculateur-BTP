// Fil secondaire : fabrique les morceaux fournis et analyse les fichiers importés, sans bloquer l'affichage.
import { generer } from './synthe.js';
import { cretes, detecterTempo, estimerEnergie } from './analyse.js';

/** Exécute un travail ; `progres` reçoit un nombre de 0 à 1. Sert aussi dans le fil principal, à défaut de fil secondaire. */
export function travailler(m, progres = () => {}) {
  if (m.t === 'generer') {
    const r = generer(m.id, m.fe, (p) => progres(p * 0.9));
    return { ...r, cretes: cretes(r.G, r.D, r.fe) };
  }
  if (m.t === 'analyser') {
    progres(0.2);
    const c = cretes(m.G, m.D, m.fe);
    progres(0.5);
    const d = detecterTempo(m.G, m.D, m.fe);
    return { G: m.G, D: m.D, fe: m.fe, bpm: d.bpm, premierTemps: d.premierTemps, duree: m.G.length / m.fe, cretes: c, energie: estimerEnergie(c, d.bpm), sections: null };
  }
  throw new Error('Travail inconnu');
}

if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  self.onmessage = (e) => {
    const m = e.data;
    try {
      const r = travailler(m, (p) => self.postMessage({ cle: m.cle, progres: p }));
      self.postMessage({ cle: m.cle, ok: r }, [r.G.buffer, r.D.buffer, r.cretes.amp.buffer, r.cretes.bas.buffer, r.cretes.med.buffer, r.cretes.aig.buffer]);
    } catch (err) {
      self.postMessage({ cle: m.cle, erreur: String((err && err.message) || err) });
    }
  };
}
