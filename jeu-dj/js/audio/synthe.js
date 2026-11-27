// Morceaux fournis avec le jeu. Ils sont entièrement fabriqués ici, note par note (aucun enregistrement) :
// batterie, basse, accords et mélodie synthétisés, structure pensée pour le mix (intro et fin en batterie seule).
// Fonctionne dans un navigateur (fil secondaire) comme dans Node.

const TAU = Math.PI * 2;
const hz = (n) => 440 * 2 ** ((n - 69) / 12);
export function alea(g) { let s = (g >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ------------------------------------------------------------------ percussions (tampons mono)
function kick(fe, { f0 = 165, f1 = 47, duree = 0.36, chute = 0.045, clic = 0.5, dur = 1.6 } = {}) {
  const n = Math.floor(fe * duree), t = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const s = i / fe;
    ph += (TAU * (f1 + (f0 - f1) * Math.exp(-s / chute))) / fe;
    const env = Math.exp(-s / (duree * 0.3)) * Math.min(1, (n - i) / (fe * 0.012));
    t[i] = Math.tanh((Math.sin(ph) * env + (i < fe * 0.003 ? clic * (1 - i / (fe * 0.003)) : 0)) * dur) / Math.tanh(dur);
  }
  return t;
}
function bruit(fe, duree, rnd, { chute = 0.05, haut = 0, bas = 20000, attaque = 0.0005 } = {}) {
  const n = Math.floor(fe * duree), t = new Float32Array(n);
  const ah = 1 - Math.exp((-TAU * haut) / fe), ab = 1 - Math.exp((-TAU * Math.min(bas, fe * 0.45)) / fe);
  let lh = 0, lb = 0;
  for (let i = 0; i < n; i++) {
    const s = i / fe, x = rnd() * 2 - 1;
    lh += ah * (x - lh);
    lb += ab * ((haut ? x - lh : x) - lb);
    t[i] = lb * Math.exp(-s / chute) * Math.min(1, s / attaque) * Math.min(1, (n - i) / (fe * 0.004));
  }
  return t;
}
function caisse(fe, rnd, { ton = 190, chute = 0.11, souffle = 0.9, duree = 0.28 } = {}) {
  const b = bruit(fe, duree, rnd, { chute, haut: 900, bas: 9000 });
  for (let i = 0; i < b.length; i++) { const s = i / fe; b[i] = b[i] * souffle + Math.sin(TAU * (ton + 60 * Math.exp(-s / 0.02)) * s) * Math.exp(-s / 0.06) * 0.7; }
  return b;
}
function clap(fe, rnd) {
  const n = Math.floor(fe * 0.3), t = new Float32Array(n), b = bruit(fe, 0.3, rnd, { chute: 0.09, haut: 700, bas: 4200 });
  for (let i = 0; i < n; i++) {
    const s = i / fe;
    let env = Math.exp(-Math.max(0, s - 0.022) / 0.08);
    for (const d of [0, 0.009, 0.018]) if (s >= d && s < d + 0.008) env = Math.max(env, 1.2 * (1 - (s - d) / 0.008));
    t[i] = (b[i] / Math.max(1e-6, Math.exp(-s / 0.09))) * env * 0.5;
  }
  return t;
}
function tom(fe, f, duree = 0.2) {
  const n = Math.floor(fe * duree), t = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) { const s = i / fe; ph += (TAU * f * (1 + 0.5 * Math.exp(-s / 0.03))) / fe; t[i] = Math.sin(ph) * Math.exp(-s / (duree * 0.35)); }
  return t;
}

// ------------------------------------------------------------------ voix mélodiques
const blep = (p, dp) => (p < dp ? ((p / dp) * 2 - (p / dp) ** 2 - 1) : p > 1 - dp ? (((p - 1) / dp) ** 2 + ((p - 1) / dp) * 2 + 1) : 0);
/** Une note : oscillateurs (scie, carré, sinus, triangle) désaccordés, enveloppe, filtre passe-bas à enveloppe. */
function voix(fe, o) {
  const rel = o.rel ?? 0.06, n = Math.floor(fe * (o.duree + rel)), t = new Float32Array(n);
  const nv = o.nvoix || 1, ph = [], inc = [];
  for (let k = 0; k < nv; k++) { ph.push((k * 0.371) % 1); inc.push((o.f * 2 ** (((k - (nv - 1) / 2) * (o.desaccord || 0)) / 1200)) / fe); }
  const att = o.att ?? 0.004, tenue = o.tenue ?? 1, declin = o.declin ?? 0.2, q = 1 - (o.res ?? 0.2);
  let bas = 0, bande = 0;
  for (let i = 0; i < n; i++) {
    const s = i / fe;
    let x = 0;
    for (let k = 0; k < nv; k++) {
      const p = ph[k], dp = inc[k];
      if (o.onde === 'scie') x += 2 * p - 1 - blep(p, dp);
      else if (o.onde === 'carre') x += (p < 0.5 ? 1 : -1) + blep(p, dp) - blep((p + 0.5) % 1, dp);
      else if (o.onde === 'triangle') x += 4 * Math.abs(p - 0.5) - 1;
      else x += Math.sin(TAU * p);
      ph[k] = p + dp >= 1 ? p + dp - 1 : p + dp;
    }
    x /= Math.sqrt(nv);
    const niveau = 1 - (1 - tenue) * Math.min(1, s / declin);
    const env = Math.min(1, s / att) * (s < o.duree ? niveau : niveau * Math.max(0, 1 - (s - o.duree) / rel));
    if (o.coupure) {
      const fc = Math.min(o.coupure * (1 + (o.envFiltre || 0) * Math.exp(-s / (o.declinFiltre || 0.12))), fe * 0.16);
      const f1 = 2 * Math.sin((Math.PI * fc) / fe);
      bas += f1 * bande;
      bande += f1 * (x - bas - q * bande);
      x = bas;
    }
    t[i] = x * env;
  }
  return t;
}

// ------------------------------------------------------------------ styles : rythmes, basses, timbres
// Rythmes sur 16 pas par mesure : K grosse caisse, S caisse claire, C clap, H charley fermé, O charley ouvert, R rim, T tom.
const STYLES = {
  house: { K: 'x...x...x...x...', C: '....x.......x...', O: '..x...x...x...x.', H: 'x.xxx.xxx.xxx.xx', basse: 'contretemps', pompe: 0.55, accords: 'tenus', lead: 'motif' },
  deep: { K: 'x...x...x...x...', C: '....x.......x...', O: '..x...x...x...x.', H: '....x.......x.x.', R: '...x......x.....', basse: 'groove', pompe: 0.45, accords: 'stabs', lead: 'rare' },
  techno: { K: 'x...x...x...x...', C: '....x.......x...', O: '..x...x...x...x.', H: 'xxxxxxxxxxxxxxxx', R: '......x......x..', basse: 'roulement', pompe: 0.6, accords: 'aucun', lead: 'acide' },
  disco: { K: 'x...x...x...x...', S: '....x.......x...', O: '..x...x...x...x.', H: 'x.x.x.x.x.x.x.x.', basse: 'octaves', pompe: 0.2, accords: 'funk', lead: 'motif' },
  pop: { K: 'x...x...x...x...', C: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', O: '..............x.', basse: 'croches', pompe: 0.4, accords: 'tenus', lead: 'motif' },
  annees80: { K: 'x.......x.x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', T: '..............xx', basse: 'croches', pompe: 0.1, accords: 'tenus', lead: 'arpege', grosseCaisse: 1 },
  hiphop: { K: 'x.....x...x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', O: '......x.........', basse: 'longue', pompe: 0.15, accords: 'stabs', lead: 'rare', swing: 0.28 },
  latino: { K: 'x...x...x...x...', S: '...x..x....x..x.', H: 'x.x.x.x.x.x.x.x.', R: '..x.....x.x.....', basse: 'dembow', pompe: 0.2, accords: 'stabs', lead: 'motif' },
  dnb: { K: 'x.........x.....', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', O: '......x.......x.', basse: 'reese', pompe: 0.3, accords: 'tenus', lead: 'rare' },
  trance: { K: 'x...x...x...x...', C: '....x.......x...', O: '..x...x...x...x.', H: 'xxxxxxxxxxxxxxxx', basse: 'contretemps', pompe: 0.65, accords: 'supersaw', lead: 'arpege' },
  slow: { K: 'x.......x.x.....', R: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', basse: 'longue', pompe: 0, accords: 'piano', lead: 'chant', doux: 1 },
  rock: { K: 'x.....x.x.......', S: '....x.......x...', H: 'x.x.x.x.x.x.x.x.', O: '..............x.', basse: 'croches', pompe: 0, accords: 'guitare', lead: 'motif' },
};
// Suites d'accords : [décalage de la fondamentale en demi-tons, 'm' mineur / 'M' majeur]
const SUITES = {
  min1: [[0, 'm'], [8, 'M'], [3, 'M'], [10, 'M']], min2: [[0, 'm'], [5, 'm'], [8, 'M'], [7, 'M']], min3: [[0, 'm'], [10, 'M'], [8, 'M'], [10, 'M']],
  min4: [[0, 'm'], [3, 'M'], [10, 'M'], [5, 'm']], maj1: [[0, 'M'], [7, 'M'], [9, 'm'], [5, 'M']], maj2: [[0, 'M'], [9, 'm'], [5, 'M'], [7, 'M']],
  maj3: [[0, 'M'], [5, 'M'], [9, 'm'], [7, 'M']], un: [[0, 'm'], [0, 'm'], [0, 'm'], [10, 'M']],
};
// Structure d'un morceau, en mesures. bat : 1 batterie légère, 2 complète ; e : énergie ressentie par le public (0 à 1).
const FORME = [
  { nom: 'Intro', m: 8, bat: 1, basse: 0, acc: 0, lead: 0, e: 0.45 },
  { nom: 'Couplet', m: 16, bat: 2, basse: 1, acc: 1, lead: 0, e: 0.75 },
  { nom: 'Pause', m: 8, bat: 0, basse: 0, acc: 1, lead: 1, e: 0.4, montee: 1 },
  { nom: 'Refrain', m: 16, bat: 2, basse: 1, acc: 1, lead: 1, e: 1 },
  { nom: 'Fin', m: 8, bat: 1, basse: 1, acc: 0, lead: 0, e: 0.5 },
];
const FORME_COURTE = [
  { nom: 'Intro', m: 4, bat: 1, basse: 0, acc: 1, lead: 0, e: 0.4 },
  { nom: 'Couplet', m: 12, bat: 2, basse: 1, acc: 1, lead: 1, e: 0.7 },
  { nom: 'Pause', m: 4, bat: 0, basse: 0, acc: 1, lead: 1, e: 0.4, montee: 1 },
  { nom: 'Refrain', m: 12, bat: 2, basse: 1, acc: 1, lead: 1, e: 0.9 },
  { nom: 'Fin', m: 4, bat: 1, basse: 1, acc: 1, lead: 0, e: 0.4 },
];
const CAMELOT_MIN = ['5A', '12A', '7A', '2A', '9A', '4A', '11A', '6A', '1A', '8A', '3A', '10A'];      // do mineur = 5A, do# mineur = 12A…
const CAMELOT_MAJ = ['8B', '3B', '10B', '5B', '12B', '7B', '2B', '9B', '4B', '11B', '6B', '1B'];
const NOTES = ['Do', 'Do♯', 'Ré', 'Mi♭', 'Mi', 'Fa', 'Fa♯', 'Sol', 'La♭', 'La', 'Si♭', 'Si'];

function morceau(id, titre, artiste, genre, style, bpm, ton, suite, energie, extra = {}) {
  const mineur = SUITES[suite][0][1] === 'm';
  return { id, titre, artiste, genre, style, bpm, ton, suite, energie, graine: 1000 + id * 7919, tonalite: `${NOTES[ton % 12]} ${mineur ? 'mineur' : 'majeur'}`,
    camelot: (mineur ? CAMELOT_MIN : CAMELOT_MAJ)[ton % 12], ...extra };
}
/** Catalogue : artistes et titres inventés pour le jeu. energie : 1 (calme) à 5 (pleine piste). */
export const CATALOGUE = [
  morceau(1, 'Minuit sur le Rhône', 'Léa Marchetti', 'House', 'house', 124, 57, 'min1', 4),
  morceau(2, 'Terrasse d\'été', 'Villa Sofia', 'House', 'house', 122, 60, 'maj2', 3),
  morceau(3, 'Velours', 'Nord Quai', 'Deep house', 'deep', 120, 62, 'min4', 2),
  morceau(4, 'Après la pluie', 'Maison Ondine', 'Deep house', 'deep', 118, 53, 'min2', 2),
  morceau(5, 'Hangar 12', 'KRZ', 'Techno', 'techno', 132, 55, 'un', 5),
  morceau(6, 'Signal faible', 'Atelier Brut', 'Techno', 'techno', 128, 52, 'un', 4),
  morceau(7, 'Paillettes', 'Les Cousins Funk', 'Disco / Funk', 'disco', 116, 59, 'min3', 4),
  morceau(8, 'Boule à facettes', 'Studio Garonne', 'Disco / Funk', 'disco', 120, 64, 'min1', 4),
  morceau(9, 'Tout le monde danse', 'Camille & Co', 'Pop / Dance', 'pop', 126, 60, 'maj1', 4),
  morceau(10, 'Plein soleil', 'Juno Clair', 'Pop / Dance', 'pop', 120, 67, 'maj3', 3),
  morceau(11, 'Néon rose', 'Les Synthés du Dimanche', 'Années 80', 'annees80', 118, 62, 'maj1', 4),
  morceau(12, 'Cassette', 'Rétro Vision', 'Années 80', 'annees80', 112, 57, 'min3', 3),
  morceau(13, 'Quartier Nord', 'Samy Delta', 'Hip-hop / R&B', 'hiphop', 92, 58, 'min2', 3),
  morceau(14, 'Minuit moins le quart', 'Inès Loup', 'Hip-hop / R&B', 'hiphop', 88, 53, 'min4', 2),
  morceau(15, 'Caliente', 'Los Vecinos', 'Latino', 'latino', 96, 57, 'min1', 4),
  morceau(16, 'Playa Bonita', 'Rico Almendra', 'Latino', 'latino', 100, 62, 'min2', 4),
  morceau(17, 'Vitesse lumière', 'Subzone', 'Drum & bass', 'dnb', 174, 53, 'min3', 5),
  morceau(18, 'Aurore', 'Lumen', 'Trance', 'trance', 138, 57, 'min1', 5),
  morceau(19, 'Zénith', 'Altaïr', 'Trance', 'trance', 136, 55, 'min4', 5),
  morceau(20, 'Notre première danse', 'Clara Vidal', 'Slow', 'slow', 72, 60, 'maj2', 1, { courte: 1 }),
  morceau(21, 'Jusqu\'au matin', 'Paul Arnaud', 'Slow', 'slow', 66, 65, 'maj1', 1, { courte: 1 }),
  morceau(22, 'Samedi soir', 'Les Blousons', 'Rock', 'rock', 148, 57, 'maj3', 4, { courte: 1 }),
  morceau(23, 'Route 7', 'Jacky & les Chromes', 'Rock', 'rock', 160, 52, 'maj1', 5, { courte: 1 }),
  morceau(24, 'Dernier métro', 'Nuit Blanche', 'House', 'house', 126, 54, 'min2', 5),
];

/** Durée d'un morceau du catalogue, en secondes, sans le fabriquer. */
export function dureeDe(m) { return ((m.courte ? FORME_COURTE : FORME).reduce((s, f) => s + f.m, 0) * 16 * 60) / m.bpm / 4 + 2.5; }

/** Fabrique un morceau du catalogue. Renvoie { G, D, fe, bpm, premierTemps, duree, sections }. */
export function generer(id, fe = 44100, progres = () => {}) {
  const m = CATALOGUE.find((c) => c.id === id);
  if (!m) throw new Error('Morceau inconnu : ' + id);
  const st = STYLES[m.style], rnd = alea(m.graine), forme = m.courte ? FORME_COURTE : FORME;
  const temps = 60 / m.bpm, pas = temps / 4, nbMes = forme.reduce((s, f) => s + f.m, 0);
  const n = Math.floor((nbMes * 16 * pas + 2.5) * fe);
  const bG = new Float32Array(n), bD = new Float32Array(n), mG = new Float32Array(n), mD = new Float32Array(n);     // batterie, musique
  const poser = (dG, dD, t, deb, gain = 1, pan = 0) => {
    const i0 = Math.round(deb * fe), gg = gain * Math.min(1, 1 - pan), gd = gain * Math.min(1, 1 + pan);
    const fin = Math.min(t.length, n - i0);
    for (let i = 0; i < fin; i++) { dG[i0 + i] += t[i] * gg; dD[i0 + i] += t[i] * gd; }
  };
  const doux = st.doux ? 0.6 : 1;
  const kit = {
    K: kick(fe, m.style === 'techno' ? { f0: 150, f1: 44, duree: 0.4, dur: 2.4 } : m.style === 'hiphop' || m.style === 'latino' ? { f0: 130, f1: 42, duree: 0.45, chute: 0.06 } : st.doux ? { f0: 110, f1: 50, duree: 0.3, clic: 0.15, dur: 1 } : {}),
    S: caisse(fe, rnd, st.grosseCaisse ? { chute: 0.2, duree: 0.42, ton: 170 } : m.style === 'dnb' ? { ton: 220, chute: 0.09 } : {}),
    C: clap(fe, rnd),
    H: bruit(fe, 0.06, rnd, { chute: 0.016, haut: 7000 }),
    O: bruit(fe, 0.32, rnd, { chute: 0.1, haut: 6000 }),
    R: tom(fe, 820, 0.05),
    T: tom(fe, 130, 0.25),
    crash: bruit(fe, 1.8, rnd, { chute: 0.5, haut: 4500 }),
  };
  const gains = { K: 0.95, S: 0.5, C: 0.5, H: 0.14, O: 0.2, R: 0.22, T: 0.4 }, pans = { H: 0.15, O: -0.2, R: 0.3, C: 0.05 };
  const cache = new Map();
  const note = (cle, o) => { let t = cache.get(cle); if (!t) { t = voix(fe, o); cache.set(cle, t); } return t; };
  // motif mélodique de deux mesures, tiré sur la gamme pentatonique
  const penta = SUITES[m.suite][0][1] === 'm' ? [0, 3, 5, 7, 10, 12, 15] : [0, 2, 4, 7, 9, 12, 14];
  const motif = [];
  for (let s = 0; s < 32; s++) if (rnd() < (st.lead === 'rare' ? 0.16 : 0.34) || s === 0) motif.push([s, penta[Math.floor(rnd() * penta.length)], rnd() < 0.3 ? 3 : 2]);
  const coups = [];                      // instants des grosses caisses (pour l'effet de pompe)
  const sections = [];
  let mes = 0;
  for (const f of forme) {
    sections.push({ nom: f.nom, debut: mes * 16 * pas, energie: f.e });
    for (let b = 0; b < f.m; b++, mes++) {
      const t0 = mes * 16 * pas, [dec, qual] = SUITES[m.suite][Math.floor(b / (m.style === 'slow' ? 1 : 2)) % 4], fond = m.ton + dec - 24;
      const tierce = qual === 'm' ? 3 : 4, derniere = b === f.m - 1;
      // ---- batterie
      if (f.bat) for (const [inst, motifB] of Object.entries(st)) {
        if (!kit[inst] || typeof motifB !== 'string') continue;
        if (f.bat === 1 && (inst === 'S' || inst === 'C' || inst === 'T') && b < f.m / 2 && f.nom === 'Intro') continue;
        for (let s = 0; s < 16; s++) {
          if (motifB[s] !== 'x') continue;
          if (derniere && inst === 'K' && s >= 12 && f.bat === 2) continue;                      // respiration avant la section suivante
          const t = t0 + (s + (s % 2 ? (st.swing || 0) : 0)) * pas;
          const accent = inst === 'H' ? (s % 4 === 0 ? 1 : 0.55 + rnd() * 0.2) : 1;
          poser(bG, bD, kit[inst], t, gains[inst] * accent * doux, pans[inst] || 0);
          if (inst === 'K') coups.push(t);
        }
      }
      if (f.bat === 2 && derniere) for (let s = 12; s < 16; s++) poser(bG, bD, kit.S, t0 + s * pas, 0.22 + (s - 12) * 0.08);            // roulement de fin de section
      if (b === 0 && f.bat === 2) poser(bG, bD, kit.crash, t0, 0.22, -0.1);
      // ---- basse
      if (f.basse) {
        const f0 = hz(fond + (fond < 31 ? 12 : 0));
        const jouer = (s, lon, oct = 0, g = 0.5) => poser(mG, mD, note(`b${fond}:${oct}:${lon}`, st.basse === 'reese'
          ? { onde: 'scie', f: f0 * 2 ** oct, duree: lon * pas, nvoix: 3, desaccord: 22, coupure: 420, res: 0.3, rel: 0.05 }
          : st.basse === 'roulement' ? { onde: 'sinus', f: f0 * 2 ** oct, duree: lon * pas, att: 0.012, rel: 0.03 }
          : { onde: st.doux ? 'sinus' : 'scie', f: f0 * 2 ** oct, duree: lon * pas * 0.9, coupure: 380, envFiltre: 3.5, declinFiltre: 0.09, res: 0.35, tenue: 0.75, rel: 0.04 }), t0 + s * pas, g);
        if (st.basse === 'contretemps') for (let s = 2; s < 16; s += 4) jouer(s, 2);
        else if (st.basse === 'octaves') for (let s = 0; s < 16; s += 2) jouer(s, 1.6, (s / 2) % 2, 0.45);
        else if (st.basse === 'croches') for (let s = 0; s < 16; s += 2) jouer(s, 1.7, 0, 0.42);
        else if (st.basse === 'groove') for (const s of [0, 3, 6, 10, 13]) jouer(s, s === 0 ? 3 : 2, s === 10 ? 1 : 0, 0.45);
        else if (st.basse === 'dembow') for (const s of [0, 3, 6, 8, 11, 14]) jouer(s, 2, 0, 0.5);
        else if (st.basse === 'roulement') for (let s = 0; s < 16; s++) { if (s % 4 !== 0) jouer(s, 1, 0, 0.42); }
        else jouer(0, st.basse === 'reese' ? 16 : 7, 0, st.basse === 'reese' ? 0.38 : 0.55), st.basse === 'longue' && jouer(10, 5, 0, 0.5);
      }
      // ---- accords
      if (f.acc && st.accords !== 'aucun') {
        const notesAcc = [fond + 24, fond + 24 + tierce, fond + 31, fond + 36];
        const jouerAcc = (s, lon, g, o) => notesAcc.forEach((nn, k) => poser(mG, mD, note(`a${nn}:${lon}:${o.onde}:${o.coupure}`, { ...o, f: hz(nn), duree: lon * pas }), t0 + s * pas, g, (k - 1.5) * 0.22));
        if (st.accords === 'tenus') jouerAcc(0, 16, 0.085, { onde: 'scie', nvoix: 3, desaccord: 14, coupure: f.nom === 'Pause' ? 1400 : 2200, att: 0.06, rel: 0.25, res: 0.1 });
        else if (st.accords === 'supersaw') jouerAcc(0, 16, 0.075, { onde: 'scie', nvoix: 5, desaccord: 26, coupure: f.nom === 'Pause' ? 1800 : 4200, att: 0.03, rel: 0.3, res: 0.1 });
        else if (st.accords === 'stabs') for (const s of [0, 6, 11]) jouerAcc(s, 2, 0.1, { onde: 'scie', nvoix: 2, desaccord: 10, coupure: 1500, envFiltre: 2, tenue: 0.3, declin: 0.15, rel: 0.12 });
        else if (st.accords === 'funk') for (const s of [2, 5, 8, 11, 14]) jouerAcc(s, 1, 0.085, { onde: 'carre', coupure: 2600, tenue: 0.2, declin: 0.06, rel: 0.05 });
        else if (st.accords === 'guitare') for (let s = 0; s < 16; s += 2) jouerAcc(s, 1.5, 0.07, { onde: 'scie', nvoix: 2, desaccord: 8, coupure: 2400, tenue: 0.5, declin: 0.1, rel: 0.05, res: 0.3 });
        else if (st.accords === 'piano') for (const s of [0, 8]) jouerAcc(s, 8, 0.15, { onde: 'triangle', nvoix: 2, desaccord: 5, coupure: 3000, envFiltre: 1, tenue: 0.25, declin: 0.9, rel: 0.4, att: 0.003 });
      }
      // ---- mélodie
      if (f.lead && st.lead !== 'acide') {
        const base = m.ton + 12;
        if (st.lead === 'arpege') {
          const arp = [fond + 36, fond + 36 + tierce, fond + 43, fond + 48, fond + 43, fond + 36 + tierce];
          for (let s = 0; s < 16; s++) poser(mG, mD, note(`l${arp[s % 6]}`, { onde: 'carre', f: hz(arp[s % 6]), duree: pas * 0.8, coupure: 3200, envFiltre: 1.5, tenue: 0.4, declin: 0.08, rel: 0.08 }), t0 + s * pas, 0.075, s % 2 ? 0.35 : -0.35);
        } else for (const [s, deg, lon] of motif) {
          if (Math.floor(s / 16) !== b % 2) continue;
          const o = st.lead === 'chant' ? { onde: 'sinus', nvoix: 2, desaccord: 6, att: 0.04, rel: 0.25 } : { onde: 'scie', nvoix: 2, desaccord: 12, coupure: 2800, envFiltre: 1.2, tenue: 0.6, declin: 0.2, rel: 0.15 };
          const t = t0 + (s % 16) * pas, ng = st.lead === 'chant' ? 0.16 : 0.1;
          poser(mG, mD, note(`m${deg}:${lon}:${o.onde}`, { ...o, f: hz(base + deg), duree: lon * pas * (st.lead === 'chant' ? 2 : 1) }), t, ng, 0.1);
          poser(mG, mD, cache.get(`m${deg}:${lon}:${o.onde}`), t + 3 * pas, ng * 0.3, -0.5);                 // écho
        }
      }
      if (st.lead === 'acide' && f.basse) for (let s = 0; s < 16; s++) {
        if ((s * 7 + mes * 3) % 5 > 2) continue;
        const nn = m.ton - 12 + [0, 0, 12, 3, 0, 10, 0, 7][(s + mes) % 8];
        poser(mG, mD, note(`ac${nn}:${f.nom === 'Refrain' ? 1 : 0}`, { onde: 'scie', f: hz(nn), duree: pas * 0.7, coupure: f.nom === 'Refrain' ? 900 : 500, envFiltre: 5, declinFiltre: 0.06, res: 0.78, tenue: 0.5, rel: 0.03 }), t0 + s * pas, 0.13, 0.1);
      }
      // ---- montée avant le refrain : souffle qui s'ouvre et roulement
      if (f.montee && b >= f.m - 2) for (let s = 0; s < 16; s += b === f.m - 1 ? 1 : 2) poser(bG, bD, kit.S, t0 + s * pas, 0.1 + ((b - (f.m - 2)) * 16 + s) * 0.008);
    }
    progres(mes / nbMes * 0.8);
  }
  // effet de pompe : la musique s'efface un instant à chaque grosse caisse
  if (st.pompe) for (const t of coups) {
    const i0 = Math.round(t * fe), l = Math.floor(fe * 0.26);
    for (let i = 0; i < l && i0 + i < n; i++) { const g = 1 - st.pompe * Math.exp(-i / (fe * 0.07)) * (i < 60 ? i / 60 : 1); mG[i0 + i] *= g; mD[i0 + i] *= g; }
  }
  // mélange, écrêtage doux, mise à niveau
  let crete = 0;
  for (let i = 0; i < n; i++) {
    const g = Math.tanh((bG[i] + mG[i]) * 1.5), d = Math.tanh((bD[i] + mD[i]) * 1.5);
    bG[i] = g; bD[i] = d;
    const a = Math.max(Math.abs(g), Math.abs(d));
    if (a > crete) crete = a;
  }
  const k = 0.92 / Math.max(crete, 1e-3);
  for (let i = 0; i < n; i++) { bG[i] *= k; bD[i] *= k; }
  progres(1);
  return { G: bG, D: bD, fe, bpm: m.bpm, premierTemps: 0, duree: n / fe, sections };
}
