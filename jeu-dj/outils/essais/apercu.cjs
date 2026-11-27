// Aperçu rapide : menu, mix libre dans un lieu (LIEU=club par défaut), onglets. Sert à juger la mise en page sur un écran donné.
module.exports = async (page, { capture, attendre, clic, dj }) => {
  const lieu = process.env.LIEU || 'club';
  await capture('a1_menu');
  await clic('[data-a="libre"]');
  await page.waitForSelector('[data-lieu]');
  await capture('a2_lieux');
  await clic('[data-lieu="' + lieu + '"]');
  await page.waitForSelector('#jeu:not([hidden])');
  await dj(async (d) => { const m = await d.jeu.biblio.obtenir(5); d.moteur.platines[0].charger(m); d.jeu.cabine.charge(0); d.moteur.platines[0].lire(); });
  await attendre(10);
  await capture('a3_' + lieu);
  await clic('[data-vue="pc"]'); await attendre(0.3); await capture('a4_pc');
  await clic('[data-vue="pupitre"]'); await attendre(0.3); await capture('a5_pupitre');
  await clic('[data-vue="aide"]'); await attendre(0.3); await capture('a6_aide');
  await clic('[data-vue="salle"]');
};
