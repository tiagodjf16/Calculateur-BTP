// Carrière : création, leçon dans la chambre, première soirée (demandes, enchaînement, bilan, paie), boutique, sauvegarde.
module.exports = async (page, { capture, attendre, clic, dj, verifier }) => {
  const charger = async (id, i) => { await clic('[data-vue="pc"]'); await clic('#pc tr[data-id="' + id + '"] [data-charger="' + i + '"]'); await page.waitForFunction(([x, k]) => { const m = window.__dj.moteur.platines[k].morceau; return !!m && m.id === x; }, [id, i], { timeout: 60000 }); await clic('[data-vue="salle"]'); };
  await clic('[data-a="nouvelle"]');
  await page.fill('#nom-dj', 'DJ Essai');
  await clic('#dialogue [data-i="1"]');
  await page.waitForSelector('[data-jouer="chambre"]');
  await capture('20_carriere');
  verifier('carrière créée : 100 €, une seule soirée ouverte', await dj((d) => d.carriere.e.argent === 100 && !document.querySelector('[data-jouer="ines18"]:not([disabled])')));

  // ---- la leçon
  await clic('[data-jouer="chambre"]');
  await capture('21_contrat');
  await clic('#dialogue [data-i="1"]');
  await page.waitForSelector('#jeu:not([hidden])');
  await attendre(0.5);
  await capture('22_chambre');
  await charger(9, 0);
  await clic('.platine[data-p="0"] [data-act="lecture"]');
  await attendre(0.6);
  await charger(10, 1);
  await dj((d) => d.jeu.cabine.cmd.voies[1].fader.regler(0, true));
  await attendre(0.4);
  await clic('.platine[data-p="1"] [data-act="sync"]');
  await clic('.platine[data-p="1"] [data-act="lecture"]');
  await attendre(0.6);
  verifier('leçon : cinq étapes franchies', await dj((d) => d.jeu.session.lecon === 5), await dj((d) => d.jeu.session.lecon));
  await capture('23_lecon');
  await dj((d) => { d.jeu.cabine.cmd.voies[1].fader.regler(1, true); d.jeu.cabine.cmd.voies[0].fader.regler(0, true); });
  await page.waitForSelector('#dialogue:not([hidden])', { timeout: 15000 });
  await capture('24_lecon_finie');
  await clic('#dialogue [data-i="0"]');
  await page.waitForSelector('[data-jouer="ines18"]:not([disabled])');
  verifier('la première soirée est ouverte, musique arrêtée', await dj((d) => !d.moteur.platines[1].lecture));

  // ---- les 18 ans d'Inès
  await clic('[data-jouer="ines18"]');
  await clic('#dialogue [data-i="1"]');
  await page.waitForSelector('#jeu:not([hidden])');
  verifier('platines vidées en début de soirée', await dj((d) => !d.moteur.platines[0].morceau && !d.moteur.platines[1].morceau));
  await charger(9, 0);                                             // Pop / Dance, 126
  await clic('.platine[data-p="0"] [data-act="lecture"]');
  await dj((d) => { d.jeu.session.t = 31; });
  await attendre(8);
  const a1 = await dj((d) => ({ ambiance: Math.round(d.jeu.session.ambiance), dansants: d.salle.dansants, info: document.querySelector('#b-info').textContent, heure: document.querySelector('#b-heure').textContent }));
  verifier('le bon style fait monter l\'ambiance', a1.ambiance > 35, a1);
  await capture('25_soiree');
  // la demande de hip-hop arrive à 16 % de la soirée
  await dj((d) => { d.jeu.session.t = d.jeu.session.d.duree * 0.16; });
  await attendre(0.6);
  verifier('demande affichée, onglet Ordinateur en alerte', await dj((d) => document.querySelectorAll('#demandes .dem').length === 1 && document.querySelector('[data-vue="pc"]').classList.contains('alerte')));
  await clic('[data-vue="pc"]');
  await attendre(0.3);
  await capture('26_demande');
  verifier('morceaux demandés signalés dans la liste', await dj(() => document.querySelectorAll('#pc .dem').length === 2));
  await charger(13, 1);                                            // Hip-hop, 92
  await dj((d) => d.jeu.cabine.cmd.voies[1].fader.regler(0, true));
  await clic('.platine[data-p="1"] [data-act="lecture"]');
  // enchaînement par coupe : B monte, A descend (tempos trop éloignés pour un mélange long)
  await dj((d) => { d.jeu.cabine.cmd.voies[1].fader.regler(1, true); d.jeu.cabine.cmd.voies[0].fader.regler(0, true); });
  await attendre(14);
  const a2 = await dj((d) => ({ ok: d.jeu.session.s.objOk, total: d.jeu.session.s.objTotal, coupes: d.jeu.session.s.coupes, ambiance: Math.round(d.jeu.session.ambiance) }));
  verifier('demande satisfaite après 12 s de hip-hop', a2.ok === 1, a2);
  // enchaînement calé : A reçoit l'autre hip-hop, SYNC, mélange de 6 s
  await charger(14, 0);
  await clic('.platine[data-p="0"] [data-act="sync"]');
  await clic('.platine[data-p="0"] [data-act="lecture"]');
  await dj((d) => d.jeu.cabine.cmd.voies[0].fader.regler(0.8, true));
  await attendre(6);
  const tr = await dj((d) => { const t = d.jeu.session.tr; return t && { duree: +t.duree.toFixed(1), ecartMoyen: +(t.ecart / t.duree).toFixed(1), galop: +t.galop.toFixed(1) }; });
  verifier('mélange calé mesuré par le jeu (écart moyen < 20 ms)', !!tr && tr.ecartMoyen < 20, tr);
  await dj((d) => d.jeu.cabine.cmd.voies[1].fader.regler(0, true));
  await attendre(1.5);
  const a3 = await dj((d) => ({ ...d.jeu.session.s, ambiance: Math.round(d.jeu.session.ambiance) }));
  verifier('enchaînement compté comme réussi', a3.propres === 1, { propres: a3.propres, passables: a3.passables, rates: a3.rates, coupes: a3.coupes });
  await capture('27_enchainement');
  // un blanc : tout s'arrête
  await clic('.platine[data-p="0"] [data-act="lecture"]');
  await attendre(4);
  const a4 = await dj((d) => ({ blancs: d.jeu.session.s.blancs, ambiance: Math.round(d.jeu.session.ambiance) }));
  verifier('le silence est compté comme un blanc et vide la piste', a4.blancs === 1 && a4.ambiance < a3.ambiance, a4);
  await clic('.platine[data-p="0"] [data-act="lecture"]');
  // fin de soirée
  await dj((d) => { d.jeu.session.t = d.jeu.session.d.duree - 1.5; });
  await page.waitForSelector('#dialogue:not([hidden])', { timeout: 15000 });
  await capture('28_bilan');
  const bilan = await page.textContent('#dialogue');
  console.log('  bilan :', bilan.replace(/\s+/g, ' ').slice(0, 420));
  await clic('#dialogue [data-i="0"]');
  await attendre(0.3);
  await capture('29_suite');
  await clic('#dialogue [data-i="0"]');
  await page.waitForSelector('[data-jouer="ines18"]');
  const e = await dj((d) => ({ argent: d.carriere.e.argent, fait: d.carriere.e.faits.ines18, rep: d.carriere.reputation }));
  verifier('soirée enregistrée et payée', e.argent > 100 && e.fait && e.fait.etoiles >= 1, e);

  // ---- boutique
  await clic('[data-o="boutique"]');
  await attendre(0.2);
  await capture('30_boutique');
  await clic('[data-acheter="hurricane"]');
  const b = await dj((d) => ({ argent: d.carriere.e.argent, possede: d.carriere.e.possede, fumee: d.carriere.e.equipe.fumee }));
  verifier('achat de la machine à fumée', b.possede.includes('hurricane') && b.fumee === 'hurricane' && b.argent === e.argent - 65, b);
  // ---- la sauvegarde survit au rechargement
  await page.reload();
  await page.waitForSelector('[data-a="continuer"]');
  verifier('carrière retrouvée après rechargement', (await page.textContent('[data-a="continuer"]')).includes('DJ Essai'));
  await capture('31_menu_continuer');
};
