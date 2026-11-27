// Import de fichiers audio du joueur : détection du tempo et du premier temps, lecture, réglage de la grille.
// FICHIERS : chemins séparés par « | » (par défaut, deux WAV fabriqués par l'essai dans le dossier DOSSIER_AUDIO).
const path = require('path');
module.exports = async (page, { capture, attendre, clic, dj, verifier }) => {
  const dossier = process.env.DOSSIER_AUDIO;
  const fichiers = process.env.FICHIERS ? process.env.FICHIERS.split('|') : [path.join(dossier, 'Les Cousins Funk - Paillettes.wav'), path.join(dossier, 'hangar_12.wav')];
  await clic('[data-a="libre"]');
  await clic('[data-lieu="fetes"]');
  await page.waitForSelector('#jeu:not([hidden])');
  await clic('[data-vue="pc"]');
  await page.setInputFiles('#pc input[type=file]', fichiers);
  await attendre(0.5);
  const lignes = await dj((d) => d.jeu.biblio.morceaux.filter((m) => m.source === 'fichier').map((m) => ({ id: m.id, titre: m.titre, artiste: m.artiste, genre: m.genre })));
  verifier('fichiers ajoutés à la bibliothèque (titre et artiste tirés du nom)', lignes.length === fichiers.length && lignes[0].titre === 'Paillettes' && lignes[0].artiste === 'Les Cousins Funk', lignes);
  await capture('40_importes');
  const t0 = Date.now();
  await clic('#pc tr[data-id="f1"] [data-charger="0"]');
  await page.waitForFunction(() => { const m = window.__dj.moteur.platines[0].morceau; return !!m && m.id === 'f1'; }, null, { timeout: 120000 });
  const a = await dj((d) => { const m = d.moteur.platines[0].morceau, per = 60 / m.bpm; let ph = (m.premierTemps - 0.37) / per; ph -= Math.round(ph); return { bpm: m.bpm, premierTemps: +m.premierTemps.toFixed(3), ecartMs: Math.round(Math.abs(ph) * per * 1000), duree: Math.round(m.duree), energie: m.energie }; });
  console.log('  analyse en', ((Date.now() - t0) / 1000).toFixed(1), 's');
  verifier('tempo détecté (116 BPM) et premier temps à moins de 25 ms', [58, 116, 232].some((x) => Math.abs(a.bpm - x) < 0.3) && a.ecartMs < 25, a);
  await clic('[data-vue="salle"]');
  await clic('.platine[data-p="0"] [data-act="lecture"]');
  await attendre(2.5);
  const n = await dj((d) => ({ pos: +d.moteur.platines[0].secondes.toFixed(1), importe: document.querySelector('.platine[data-p="0"]').classList.contains('importe'), grille: getComputedStyle(document.querySelector('.platine[data-p="0"] .grille')).display }));
  verifier('le fichier importé se lit, boutons de grille affichés', n.pos > 1.5 && n.importe && n.grille !== 'none', n);
  await clic('.platine[data-p="0"] [data-act="grille+"]');
  const g = await dj((d) => +d.moteur.platines[0].morceau.premierTemps.toFixed(3));
  verifier('le bouton de grille décale les temps d\'un quart de temps', Math.abs(g - a.premierTemps - 60 / a.bpm / 4) < 0.002, g);
  // second fichier sur B, calé par SYNC sur le premier
  await clic('[data-vue="pc"]');
  await clic('#pc tr[data-id="f2"] [data-charger="1"]');
  await page.waitForFunction(() => { const m = window.__dj.moteur.platines[1].morceau; return !!m && m.id === 'f2'; }, null, { timeout: 120000 });
  await clic('[data-vue="salle"]');
  await clic('.platine[data-p="1"] [data-act="sync"]');
  await clic('.platine[data-p="1"] [data-act="lecture"]');
  await attendre(3);
  const s = await dj((d) => { const [x, y] = d.moteur.platines; return { bpmA: +x.bpm.toFixed(1), bpmB: +y.bpm.toFixed(1), origineB: y.morceau.bpm, plage: y.plage }; });
  verifier('second fichier détecté (132 BPM) et ramené au tempo du premier par SYNC', Math.abs(s.origineB - 132) < 0.3 && Math.abs(s.bpmA - s.bpmB) < 0.2, s);
  await capture('41_fichiers_sur_platines');
};
