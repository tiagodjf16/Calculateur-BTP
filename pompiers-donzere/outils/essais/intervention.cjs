// Scénario d'essai : une intervention complète (hémorragie), de l'alerte au bilan.
module.exports = async (page, photo) => {
  const js = (code) => page.evaluate(code);
  const attendre = (s) => page.waitForTimeout(s * 1000);
  const geste = async (id) => {
    await js(`window.__jeu.garde.inter.lancer('${id}')`);
    await page.waitForFunction(() => !window.__jeu.garde.inter.encours, null, { timeout: 60000 });
  };
  console.log(await js(`(async () => { const { CAS } = await import('./js/cas.js'); const j = window.__jeu; j.jeu.accel = 12; j.vsav.moteur = true; j.vsav.freinMain = false; j.vsav.ceinture = true; j.vsav.gyro = true;
    j.garde.lancer(CAS.find((c) => c.id === (window.__cas || 'hemorragie_bras'))); const c = j.garde.cible; const r = j.monde.routeProche(c.x, c.z, 100); j.vsav.placer(r.x, r.z, Math.atan2(r.dx, r.dz)); return j.garde.adresse; })()`));
  await attendre(2);
  await photo('1_alerte');
  await js(`window.__jeu.garde.arriver()`);
  await attendre(1);
  for (const g of ['gants', 'hemorragie_recherche', 'compression', 'pansement_compressif', 'conscience', 'respiration', 'spo2', 'pouls', 'tension', 'allonger']) await geste(g);
  await photo('2_tablette');
  for (const g of ['interrogatoire', 'couvrir', 'bilan_radio', 'sortir_brancard']) await geste(g);
  await js(`window.__jeu.garde.inter.basculer(true)`);
  await attendre(4);
  await photo('3_brancard');
  for (const g of ['relevage', 'sangler']) await geste(g);
  await attendre(2);
  await photo('4_installe');
  await geste('charger');
  await attendre(5);
  console.log('phase :', await js(`window.__jeu.garde.phase`));
  await js(`(() => { const j = window.__jeu, h = j.monde.hopital; const r = j.monde.routeProche(h.x, h.z + 120, 300); j.vsav.placer(r.x, r.z, Math.atan2(-r.dx, -r.dz)); })()`);
  await attendre(1.5);
  await photo('5_transport');
  await js(`(() => { const j = window.__jeu, h = j.monde.hopital; j.vsav.placer(h.x, h.z + 30, Math.PI); })()`);
  await attendre(1.5);
  await photo('6_bilan');
};
