// Scénario d'essai : scène d'intervention au stade (brancard sorti, victime installée), tablette réduite.
module.exports = async (page, photo) => {
  const js = (code) => page.evaluate(code);
  await page.evaluate(() => { const b = document.querySelector('#aide-tactile:not([hidden]) #aide-fermer'); if (b) b.click(); });   // téléphone : on ferme l'aide de départ
  const geste = async (id) => { await js(`window.__jeu.garde.inter.lancer('${id}')`); await page.waitForFunction(() => !window.__jeu.garde.inter.encours, null, { timeout: 90000 }); };
  console.log(await js(`(async () => { const { CAS } = await import('./js/cas.js'); const j = window.__jeu; j.jeu.accel = 12; j.vsav.moteur = true; j.vsav.freinMain = false; j.vsav.ceinture = true; j.vsav.gyro = true;
    j.garde.lancer(CAS.find((c) => c.id === 'cheville')); const c = j.garde.cible; const r = j.monde.routeProche(c.x, c.z, 100); j.vsav.placer(r.x, r.z, Math.atan2(r.dx, r.dz)); return j.garde.adresse; })()`));
  await page.waitForTimeout(1500);
  await js(`window.__jeu.garde.arriver(); window.__jeu.vsav.balisage = true;`);
  for (const g of ['gants', 'balisage', 'sortir_brancard']) await geste(g);
  await js(`window.__jeu.garde.inter.chercher('immo')`);
  await page.waitForFunction(() => !window.__jeu.garde.inter.encours, null, { timeout: 90000 });
  await js(`window.__jeu.garde.inter.basculer(true)`);
  await page.waitForTimeout(5000);
  await photo('brancard');
  for (const g of ['relevage', 'sangler']) await geste(g);
  await page.waitForTimeout(5000);
  await photo('victime');
};
