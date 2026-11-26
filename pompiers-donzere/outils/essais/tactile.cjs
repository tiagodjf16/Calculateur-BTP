// Scénario d'essai au doigt (téléphone émulé) : préparation du VSAV, conduite au volant et aux pédales, menu Plus,
// présentation sur les lieux, gestes sur la tablette, bilan, plein de carburant. Chaque étape est vérifiée.
module.exports = async (page, photo, doigts) => {
  const js = (code) => page.evaluate(code);
  const attendre = (s) => page.waitForTimeout(s * 1000);
  const toucher = (sel) => page.locator(sel).first().tap();
  const verifier = (nom, ok, detail = '') => console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${nom}${detail ? ' — ' + detail : ''}`);
  const etat = () => js(`(() => { const j = window.__jeu, v = j.vsav; return { moteur: v.moteur, ceinture: v.ceinture, frein: v.freinMain, gyro: v.gyro, sirene: v.deuxTons, codes: v.codes, v: +v.v.toFixed(2), x: +v.x.toFixed(1), z: +v.z.toFixed(1), cap: +v.cap.toFixed(3), carb: +v.carburant.toFixed(1), jeu: j.jeu.etat, phase: j.garde.phase, mode: j.entrees.mode, pause: j.jeu.pause }; })()`);

  // 1. aide de départ
  let e = await etat();
  verifier('mode tactile et aide affichée', e.mode === 'tactile' && e.pause && await page.locator('#aide-tactile').isVisible());
  await photo('1_aide');
  await toucher('#aide-fermer');
  e = await etat();
  verifier('aide fermée, jeu en marche', !e.pause && !(await page.locator('#aide-tactile').isVisible()));

  // 2. préparation : moteur, ceinture, frein à main, avertisseurs
  for (const id of ['moteur', 'ceinture', 'freinmain', 'gyro', 'sirene']) await toucher(`#tactile [data-id="${id}"]`);
  await attendre(0.6);
  e = await etat();
  verifier('moteur, ceinture, frein desserré, gyrophares, deux-tons', e.moteur && e.ceinture && !e.frein && e.gyro && e.sirene, JSON.stringify(e));
  await toucher('#tactile [data-id="sirene"]');

  // 3. conduite sur une longue ligne droite (N7) : un doigt sur l'accélérateur, un autre sur le volant
  await js(`(() => { const j = window.__jeu, h = j.monde.hopital; const r = j.monde.routeProche(h.x, h.z + 260, 300); j.vsav.placer(r.x, r.z, Math.atan2(r.dx * (r.dz >= 0 ? 1 : -1), Math.abs(r.dz))); j.garde.delai = 999; j.jeu.accel = 3; })()`);
  await attendre(1);
  const [gx, gy] = await doigts.sur('#ped-gaz b'), [vx, vy] = await doigts.sur('#volant'), [fx, fy] = await doigts.sur('#ped-frein b');
  const depart = await etat();
  await doigts.poser(1, gx, gy);
  await page.waitForFunction(() => window.__jeu.vsav.v > 3, null, { timeout: 30000 }).catch(() => {});
  let e2 = await etat();
  verifier('le véhicule avance', e2.v > 3 && Math.hypot(e2.x - depart.x, e2.z - depart.z) > 1, `v=${e2.v} m/s, ${Math.hypot(e2.x - depart.x, e2.z - depart.z).toFixed(1)} m`);
  verifier('pédale enfoncée affichée', await js(`document.querySelector('#ped-gaz').classList.contains('tenu')`));
  await doigts.poser(2, vx, vy);
  await doigts.bouger(2, vx + 16, vy);                  // volant légèrement à droite
  await attendre(0.9);
  await photo('2_conduite');
  e = await etat();
  verifier('le volant fait tourner', Math.abs(e.cap - e2.cap) > 0.01 && await js('window.__jeu.entrees.volant > 0.2'), `cap ${e2.cap} -> ${e.cap}`);
  await doigts.lever(2);
  await attendre(0.2);
  verifier('volant relâché : retour au centre', await js('window.__jeu.entrees.volant === 0'));
  await doigts.lever(1);
  // 4. frein : arrêt complet, sans repartir en arrière tant que la pédale reste enfoncée
  await doigts.poser(3, fx, fy);
  await page.waitForFunction(() => Math.abs(window.__jeu.vsav.v) < 0.02, null, { timeout: 30000 }).catch(() => {});
  await attendre(1.2);
  e = await etat();
  verifier('la pédale de gauche freine jusqu\'à l\'arrêt, sans reculer', Math.abs(e.v) < 0.05, `v=${e.v}`);
  await doigts.lever(3);
  await attendre(0.4);
  await doigts.poser(3, fx, fy);                        // véhicule arrêté : la même pédale fait reculer
  await attendre(1.6);
  e = await etat();
  verifier('à l\'arrêt, la pédale de gauche fait reculer', e.v < -0.3, `v=${e.v}`);
  await doigts.lever(3);
  await doigts.poser(3, fx, fy);                        // en marche arrière, elle freine
  await page.waitForFunction(() => Math.abs(window.__jeu.vsav.v) < 0.02, null, { timeout: 30000 }).catch(() => {});
  await doigts.lever(3);
  await js('window.__jeu.jeu.accel = 1');

  // 5. menu Plus
  await toucher('#tactile [data-id="plus"]');
  await attendre(0.3);
  verifier('menu Plus ouvert', await page.locator('#plus').isVisible());
  await photo('3_plus');
  await toucher('#plus [data-id="codes"]');
  await toucher('#plus [data-id="detresse"]');
  await attendre(0.4);
  e = await etat();
  verifier('feux allumés depuis le menu Plus', e.codes);
  await toucher('#plus [data-id="detresse"]');
  await page.touchscreen.tap(Math.round((await js('innerWidth')) / 2), Math.round((await js('innerHeight')) * 0.36));
  await attendre(0.3);
  verifier('menu Plus refermé en touchant l\'image', !(await page.locator('#plus').isVisible()));

  // 6. départ en intervention, présentation sur les lieux
  await js(`(async () => { const { CAS } = await import('./js/cas.js'); const j = window.__jeu; j.jeu.accel = 12;
    j.garde.lancer(CAS.find((c) => c.id === 'hemorragie_bras')); const c = j.garde.cible; const r = j.monde.routeProche(c.x, c.z, 100); j.vsav.placer(r.x, r.z, Math.atan2(r.dx, r.dz)); })()`);
  await attendre(2.5);
  await photo('4_alerte');
  verifier('bandeau « Se présenter sur les lieux »', /présenter/.test(await page.locator('#action').innerText()));
  await toucher('#action');
  await attendre(1.2);
  e = await etat();
  verifier('intervention ouverte en touchant le bandeau', e.jeu === 'intervention' && await page.locator('.tab-cadre').isVisible(), e.jeu);
  await photo('5_tablette');

  // 7. gestes au doigt sur la tablette
  const onglets = await js(`(async () => { const { GESTES } = await import('./js/cas.js'); return Object.fromEntries(Object.entries(GESTES).map(([k, g]) => [k, g[0]])); })()`);
  const geste = async (id) => {
    await toucher(`#tab-onglets [data-onglet="${onglets[id]}"]`);
    const b = page.locator(`#tab-gestes [data-geste="${id}"]`);
    if (await b.getAttribute('data-lot')) {              // matériel resté au VSAV : un premier appui l'envoie chercher
      await b.tap();
      await page.waitForFunction(() => !window.__jeu.garde.inter.encours, null, { timeout: 60000 });
    }
    await page.locator(`#tab-gestes [data-geste="${id}"]`).tap();
    await page.waitForFunction(() => !window.__jeu.garde.inter.encours, null, { timeout: 60000 });
  };
  for (const g of ['gants', 'hemorragie_recherche', 'compression', 'pansement_compressif', 'conscience', 'respiration', 'spo2', 'pouls', 'tension', 'allonger']) await geste(g);
  await photo('6_gestes');
  const faits = await js('window.__jeu.garde.inter.faits.size');
  verifier('dix gestes réalisés au doigt', faits >= 10, faits + ' gestes');
  verifier('bandeau des constantes rempli', (await page.locator('#tab-vitales span').count()) >= 4);
  for (const g of ['interrogatoire', 'couvrir', 'bilan_radio', 'sortir_brancard']) await geste(g);
  await toucher('#tab-voir');
  await attendre(4);
  await photo('7_scene');
  verifier('tablette réduite pour voir la scène', await js(`document.querySelector('#tablette').classList.contains('reduit')`));
  await toucher('#tab-voir');
  for (const g of ['relevage', 'sangler', 'charger']) await geste(g);
  await attendre(5);
  e = await etat();
  verifier('victime chargée, départ vers l\'hôpital', e.phase === 'transport', e.phase);

  // 8. arrivée à l'hôpital, bilan
  await js(`(() => { const j = window.__jeu, h = j.monde.hopital; j.vsav.placer(h.x, h.z + 30, Math.PI); })()`);
  await attendre(1.5);
  verifier('écran de bilan', await page.locator('.bilan-cadre').isVisible());
  await photo('8_bilan');
  await page.locator('#bilan-suite').tap();
  await attendre(0.8);
  e = await etat();
  verifier('retour disponible', e.jeu === 'conduite' && e.phase === 'attente', `${e.jeu}/${e.phase}`);

  // 9. plein de carburant : moteur coupé, appui maintenu sur le bandeau
  await js(`(() => { const j = window.__jeu, s = j.monde.station; j.jeu.accel = 3; j.garde.delai = 999; j.vsav.placer(s.x, s.z, j.vsav.cap); j.vsav.v = 0; })()`);
  await attendre(1);
  if ((await etat()).moteur) await toucher('#tactile [data-id="moteur"]');
  await attendre(1);
  const avant = (await etat()).carb;
  const [ax, ay] = await doigts.sur('#action');
  await doigts.poser(4, ax, ay);
  await attendre(2.5);
  await photo('9_plein');
  await doigts.lever(4);
  e = await etat();
  verifier('plein en maintenant le bandeau', e.carb > avant + 2, `${avant} L -> ${e.carb} L`);
};
