// Essais du moteur audio hors navigateur : morceaux fournis, détection du tempo, lecteur de platine.
// Usage : node outils/essai-audio.mjs [dossier pour écrire des extraits .wav]
import fs from 'fs';
import { CATALOGUE, generer } from '../js/audio/synthe.js';
import { cretes, detecterTempo, estimerEnergie } from '../js/audio/analyse.js';
import { LecteurDSP } from '../js/audio/lecteur.js';

const sortie = process.argv[2];
const wav = (f, G, D, fe) => {
  const n = G.length, b = Buffer.alloc(44 + n * 4);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22);
  b.writeUInt32LE(fe, 24); b.writeUInt32LE(fe * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) { b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, G[i])) * 32767), 44 + i * 4); b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, D[i])) * 32767), 46 + i * 4); }
  fs.writeFileSync(f, b);
};
let echecs = 0;
const verifier = (nom, ok, detail = '') => { if (!ok) echecs++; console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`); };
let premier = null;
for (const m of CATALOGUE) {
  const t0 = Date.now(), r = generer(m.id, 44100);
  let crete = 0, s2 = 0, nan = 0;
  for (let i = 0; i < r.G.length; i++) { const v = r.G[i]; if (v !== v) nan++; if (Math.abs(v) > crete) crete = Math.abs(v); s2 += v * v; }
  const rms = Math.sqrt(s2 / r.G.length), d = detecterTempo(r.G, r.D, r.fe), c = cretes(r.G, r.D, r.fe);
  const rapport = d.bpm / m.bpm, bon = [1, 0.5, 2].some((k) => Math.abs(rapport - k) < 0.004);
  const per = Math.min(60 / m.bpm, 60 / d.bpm), phase = ((d.premierTemps % per) + per) % per, ecart = Math.min(phase, per - phase) * 1000;
  verifier(`${String(m.id).padStart(2)} ${m.titre.padEnd(24)} ${m.genre.padEnd(14)}`, !nan && crete <= 1 && rms > 0.08 && bon,          // le calage des temps détectés est donné pour information : le jeu connaît la grille de ses propres morceaux
    `${r.duree.toFixed(0)} s, fabriqué en ${Date.now() - t0} ms, crête ${crete.toFixed(2)}, niveau ${rms.toFixed(2)}, tempo ${m.bpm} → ${d.bpm} (temps à ${ecart.toFixed(0)} ms près), énergie estimée ${estimerEnergie(c, d.bpm)}/${m.energie}`);
  if (!premier) premier = r;
  if (sortie) { const a = Math.floor(r.sections[1].debut * r.fe), l = r.fe * 12; wav(`${sortie}/${m.id}_${m.style}.wav`, r.G.subarray(a, a + l), r.D.subarray(a, a + l), r.fe); }
}
// ---- lecteur
const fs2 = 48000, L = new LecteurDSP(fs2), G = premier.G, D = premier.D;
L.message({ t: 'charger', G, D, fe: 44100 });
const bloc = () => { const a = new Float32Array(128), b = new Float32Array(128); L.traiter(a, b); return a; };
L.message({ t: 'lire' });
for (let k = 0; k < 375; k++) bloc();                       // 1 seconde
verifier('lecture à vitesse normale : 1 s lue en 1 s', Math.abs(L.pos / 44100 - 1) < 0.02, `${(L.pos / 44100).toFixed(3)} s`);
L.message({ t: 'tempo', v: 1.08 });
const p0 = L.pos;
for (let k = 0; k < 375; k++) bloc();
verifier('tempo +8 %', Math.abs((L.pos - p0) / 44100 - 1.08) < 0.01, `${((L.pos - p0) / 44100).toFixed(3)} s`);
L.message({ t: 'boucle', a: 44100 * 4, b: 44100 * 4.5 });
L.message({ t: 'aller', pos: 44100 * 4.4, net: true });
for (let k = 0; k < 375; k++) bloc();
verifier('boucle : la lecture reste entre ses bornes', L.pos >= 44100 * 4 && L.pos < 44100 * 4.5, `${(L.pos / 44100).toFixed(3)} s`);
L.message({ t: 'boucle', a: null });
L.message({ t: 'scratch', actif: true, v: -1.5 });
const p1 = L.pos;
for (let k = 0; k < 94; k++) bloc();
verifier('scratch en arrière', L.pos < p1 - 44100 * 0.3, `${((L.pos - p1) / 44100).toFixed(3)} s`);
L.message({ t: 'scratch', actif: false });
L.message({ t: 'pause' });
for (let k = 0; k < 200; k++) bloc();
const silence = bloc();
verifier('pause : silence', silence.every((v) => v === 0) && Math.abs(L.vitesse) < 1e-4);
L.message({ t: 'aller', pos: G.length - 2000 }); L.message({ t: 'lire' });
for (let k = 0; k < 60; k++) bloc();
verifier('fin du morceau : arrêt signalé', L.fin && !L.lecture);
console.log(echecs ? `${echecs} échec(s)` : 'tout est bon');
process.exit(echecs ? 1 : 0);
