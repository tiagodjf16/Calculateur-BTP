// Mix libre dans le club : chargement, lecture, synchronisation, mesures de niveau, lumières, fumée, effets, vues.
module.exports = async (page, { capture, attendre, clic, dj, verifier }) => {
  await capture('01_menu');
  await clic('[data-a="libre"]');
  await page.waitForSelector('[data-lieu="club"]');
  await capture('02_lieux');
  await clic('[data-lieu="' + (process.env.LIEU || 'club') + '"]');
  await page.waitForSelector('#jeu:not([hidden])');
  await attendre(1);
  verifier('moteur audio prêt', await dj((d) => d.moteur.pret), await dj((d) => ({ worklet: d.moteur.worklet, etat: d.moteur.ctx.state, fe: d.moteur.ctx.sampleRate })));
  await capture('03_salle_vide');

  // ordinateur : charger A (House 124) et B (House 122)
  await clic('[data-vue="pc"]');
  await attendre(0.3);
  await capture('04_ordinateur');
  const t0 = Date.now();
  await clic('#pc tr[data-id="1"] [data-charger="0"]');
  await page.waitForFunction(() => !!window.__dj.moteur.platines[0].morceau, null, { timeout: 60000 });
  console.log('  morceau A prêt en', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await clic('#pc tr[data-id="24"] [data-charger="1"]');
  await page.waitForFunction(() => !!window.__dj.moteur.platines[1].morceau, null, { timeout: 60000 });
  await clic('[data-vue="salle"]');
  await clic('.platine[data-p="0"] [data-act="lecture"]');
  await attendre(3);
  const n1 = await dj((d) => { const n = d.moteur.niveaux(); return { crete: +n.maitre.toFixed(3), moyen: +n.moyen.toFixed(3), pos: +d.moteur.platines[0].secondes.toFixed(2), presence: d.moteur.presence(0) }; });
  verifier('la platine A joue et la sortie reçoit du son', n1.pos > 2 && n1.moyen > 0.01, n1);

  // SYNC puis départ de B : les temps doivent tomber ensemble
  await clic('.platine[data-p="1"] [data-act="sync"]');
  await clic('.platine[data-p="1"] [data-act="lecture"]');
  await attendre(4);
  const ph = await dj((d) => { const [a, b] = d.moteur.platines, t = d.moteur.ctx.currentTime; let x = a.tempsA(t) - b.tempsA(t); x -= Math.round(x); return { bpmA: +a.bpm.toFixed(2), bpmB: +b.bpm.toFixed(2), ecartMs: +((Math.abs(x) * 60000) / a.bpm).toFixed(1), sync: b.sync }; });
  verifier('SYNC : même tempo et temps calés (< 25 ms)', Math.abs(ph.bpmA - ph.bpmB) < 0.05 && ph.ecartMs < 25, ph);
  const n2 = await dj((d) => { let c = 0, m = 0; for (let i = 0; i < 30; i++) { const n = d.moteur.niveaux(); c = Math.max(c, n.maitre); m = Math.max(m, n.moyen); } return { crete: +c.toFixed(3), moyen: +m.toFixed(3) }; });
  console.log('  niveaux avec deux morceaux :', JSON.stringify(n2));
  await attendre(6);
  await capture('05_deux_platines');
  const amb = await dj((d) => ({ ambiance: Math.round(d.jeu.etat.ambiance), dansants: d.salle.dansants, nb: d.salle.nb }));
  verifier('le public réagit à la musique', amb.dansants > 0, amb);

  // lumières
  await clic('[data-vue="pupitre"]');
  await attendre(0.3);
  await clic('[data-scene="ciseaux"]');
  await page.locator('[data-tenu="fumee"]').dispatchEvent('pointerdown', { pointerId: 1 });
  await attendre(2.4);
  await page.locator('[data-tenu="fumee"]').dispatchEvent('pointerup', { pointerId: 1 });
  await clic('[data-b="laser"]');
  await attendre(1.5);
  await capture('06_pupitre');
  const lu = await dj((d) => ({ densite: +d.jeu.lumieres.densite.toFixed(2), scene: d.jeu.lumieres.sortie.scene, projecteurs: d.jeu.lumieres.sortie.projecteurs.length, allumes: d.jeu.lumieres.sortie.projecteurs.filter((p) => p.intensite > 0.2).length }));
  verifier('fumée et scène « Ciseaux » actives', lu.densite > 0.15 && lu.scene === 'ciseaux' && lu.allumes > 3, lu);
  await clic('[data-tir="co2"]');
  await clic('[data-tir="confettis"]');
  await clic('[data-vue="salle"]');
  await attendre(0.7);
  await capture('07_cabine_effets');
  await clic('#b-vue');
  await attendre(1.2);
  await capture('08_vue_piste');
  await clic('#b-vue');
  await attendre(1.2);
  await capture('09_vue_ensemble');
  await clic('#b-vue');
  const rendu = await dj((d) => { const i = d.salle.renderer.info; return { triangles: i.render.triangles, appels: i.render.calls }; });
  console.log('  rendu :', JSON.stringify(rendu));

  // table de mixage : crossfader au clavier, effet, boucle, repère
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await clic('.table [data-act="fx"]');
  await clic('.platine[data-p="0"] [data-boucle="4"]');
  await clic('.platine[data-p="0"] [data-rep="0"]');
  await attendre(1);
  const tb = await dj((d) => ({ cross: +d.moteur.crossfader.toFixed(2), fx: d.moteur.fx.actif, boucle: !!d.moteur.platines[0].boucle, repere: d.moteur.platines[0].reperes[0] != null }));
  verifier('crossfader, effet, boucle et repère', Math.abs(tb.cross - 0.2) < 0.01 && tb.fx && tb.boucle && tb.repere, tb);
  await capture('10_fin');
  await clic('#b-quitter');
  await page.waitForSelector('#menu:not([hidden]) .grand');
  verifier('retour au menu, musique arrêtée', await dj((d) => !d.moteur.platines[0].lecture && !d.moteur.platines[1].lecture));
};
