// Analyse d'un morceau : forme d'onde colorée (graves, médiums, aigus), tempo et position des temps, énergie.

/** Forme d'onde : `parSeconde` tranches par seconde, avec l'amplitude et le niveau de chaque bande. */
export function cretes(G, D, fe, parSeconde = 150) {
  const pas = Math.round(fe / parSeconde), nb = Math.floor(G.length / pas);
  const amp = new Float32Array(nb), bas = new Float32Array(nb), med = new Float32Array(nb), aig = new Float32Array(nb);
  const ab = 1 - Math.exp((-2 * Math.PI * 180) / fe), am = 1 - Math.exp((-2 * Math.PI * 2600) / fe);
  let lb = 0, lm = 0, maxi = 1e-6;
  for (let k = 0; k < nb; k++) {
    let a = 0, sb = 0, sm = 0, sa = 0;
    for (let i = k * pas, f = i + pas; i < f; i++) {
      const x = (G[i] + D[i]) * 0.5;
      lb += ab * (x - lb);
      lm += am * (x - lm);
      const v = Math.abs(x);
      if (v > a) a = v;
      sb += lb * lb; sm += (lm - lb) * (lm - lb); sa += (x - lm) * (x - lm);
    }
    amp[k] = a; bas[k] = Math.sqrt(sb / pas); med[k] = Math.sqrt(sm / pas); aig[k] = Math.sqrt(sa / pas);
    if (a > maxi) maxi = a;
  }
  return { amp, bas, med, aig, parSeconde: fe / pas, maxi };
}

/**
 * Tempo (battements par minute) et instant du premier temps.
 * 1) période approchée par autocorrélation de l'enveloppe des attaques ; 2) réglage fin en cherchant, sur toute la durée,
 * la grille de temps régulière qui tombe le mieux sur les attaques.
 */
export function detecterTempo(G, D, fe) {
  const saut = Math.round(fe / 200), F = fe / saut, total = Math.floor(G.length / saut);
  const debut = Math.floor(total * 0.12), nb = Math.min(total - debut, Math.floor(F * 110));
  if (nb < F * 8) return { bpm: 120, premierTemps: 0, confiance: 0 };
  // enveloppe des attaques : hausse du niveau d'une tranche à l'autre, graves renforcés (la grosse caisse marque les temps)
  const env = new Float32Array(nb), grave = new Float32Array(nb), ab = 1 - Math.exp((-2 * Math.PI * 150) / fe);
  let lb = 0, pb = 0, pt = 0, moy = 0;
  for (let k = 0; k < nb; k++) {
    let eb = 0, et = 0;
    for (let i = (debut + k) * saut, f = i + saut; i < f; i++) { const x = (G[i] + D[i]) * 0.5; lb += ab * (x - lb); eb += lb * lb; et += x * x; }
    eb = Math.sqrt(eb / saut); et = Math.sqrt(et / saut);
    env[k] = Math.max(0, eb - pb) * 2.5 + Math.max(0, et - pt);
    grave[k] = eb;
    pb = eb; pt = et; moy += env[k];
  }
  moy /= nb;
  for (let k = 0; k < nb; k++) env[k] -= moy;
  // autocorrélation pour des périodes de 60 à 200 battements par minute (et leurs multiples, qui confirment la pulsation)
  const lagMax = Math.ceil((60 / 60) * F * 8) + 2, ac = new Float32Array(lagMax + 1), nA = Math.min(nb, Math.floor(F * 60));
  for (let l = 1; l <= lagMax; l++) { let s2 = 0; for (let k = 0; k + l < nA; k++) s2 += env[k] * env[k + l]; ac[l] = s2 / (nA - l); }
  const lire = (t, l) => { const i = Math.floor(l); return i + 1 <= lagMax ? t[i] + (t[i + 1] - t[i]) * (l - i) : 0; };
  let bpm = 120, score = -1e9;
  for (let b = 60; b <= 200; b += 0.25) {
    const T = (60 / b) * F;
    // la mesure entière (4 temps) et la double mesure se répètent : c'est l'indice le plus sûr
    const s2 = lire(ac, T) + 0.5 * lire(ac, 2 * T) + 0.8 * lire(ac, 4 * T) + 0.4 * lire(ac, 8 * T);
    const pond = s2 * Math.exp(-0.5 * (Math.log2(b / 120) / 0.9) ** 2);             // à égalité, on préfère un tempo courant
    if (pond > score) { score = pond; bpm = b; }
  }
  // réglage fin : grille de temps sur toute la fenêtre
  const lireEnv = (p) => { const i = Math.floor(p); return i + 1 < nb ? env[i] + (env[i + 1] - env[i]) * (p - i) : 0; };
  const grille = (b) => {
    const T = (60 / b) * F;
    let mieux = -1e9, phase = 0;
    for (let ph = 0; ph < T; ph += 1) { let s2 = 0; for (let p = ph; p < nb - 1; p += T) s2 += lireEnv(p); if (s2 > mieux) { mieux = s2; phase = ph; } }
    return [mieux * T, phase];
  };
  let phase = 0;
  const centre = bpm;
  score = -1e9;
  for (let b = centre * 0.985; b <= centre * 1.015; b += 0.01) { const [s2, ph] = grille(b); if (s2 > score) { score = s2; bpm = b; phase = ph; } }
  if (Math.abs(bpm - Math.round(bpm)) < 0.06) { bpm = Math.round(bpm); phase = grille(bpm)[1]; }
  // le temps tombe sur la grosse caisse : parmi les quatre doubles-croches, celle où le grave est le plus fort juste après
  {
    const T = (60 / bpm) * F;
    let mieux = -1, choix = phase;
    for (let q = 0; q < 4; q++) {
      const ph = (phase + (q * T) / 4) % T;
      let s2 = 0;
      for (let p = ph; p < nb - 12; p += T) { const i = Math.round(p); s2 += Math.max(grave[i + 2], grave[i + 4], grave[i + 6], grave[i + 8]); }
      if (s2 > mieux * (q ? 1.12 : 1)) { mieux = s2; choix = ph; }
    }
    phase = choix;
  }
  const periode = 60 / bpm;
  let t = (debut + phase) / F - 0.5 / F;
  t -= Math.floor(t / periode) * periode;
  return { bpm: Math.round(bpm * 100) / 100, premierTemps: t, confiance: score / Math.max(1e-9, moy * nb) };
}

/** Énergie ressentie d'un morceau importé, de 1 (calme) à 5 : d'après le tempo et la densité du son. */
export function estimerEnergie(c, bpm) {
  let s2 = 0;
  for (let k = 0; k < c.amp.length; k++) s2 += c.amp[k];
  const densite = s2 / Math.max(1, c.amp.length) / Math.max(c.maxi, 1e-6);          // 0 (très aéré) à 1 (mur de son)
  let b = bpm;
  while (b < 80) b *= 2;
  while (b > 180) b /= 2;
  const e = (b < 95 ? 2.4 : b < 112 ? 3 : b < 124 ? 3.6 : 4.3) + (densite - 0.45) * 3;
  return Math.max(1, Math.min(5, Math.round(e)));
}
