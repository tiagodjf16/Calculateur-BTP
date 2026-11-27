// Un DJ automatique joue une soirée entière en temps réel, pour vérifier l'équilibre des notes.
// SOIREE=ines18 (par défaut) · NIVEAU=bon (enchaînements calés, bons styles, demandes, lumières) ou mauvais (mauvais styles, blancs)
module.exports = async (page, { capture, attendre, clic, dj, verifier }) => {
  const soiree = process.env.SOIREE || 'ines18', niveau = process.env.NIVEAU || 'bon';
  await clic('[data-a="nouvelle"]');
  await clic('#dialogue [data-i="1"]');
  await page.waitForSelector('[data-jouer="chambre"]');
  // carrière avancée pour l'essai : toutes les soirées ouvertes, matériel de milieu de gamme
  await dj((d, id) => {
    const e = d.carriere.e;
    for (const s of ['chambre', 'ines18', 'patrick50', 'comite', 'mariage1', 'bar1', 'bar2', 'club1', 'club2', 'mariage2', 'entreprise']) e.faits[s] = { etoiles: 3, note: 12, fois: 1 };
    delete e.faits[id];
    if (id !== 'ines18' && id !== 'patrick50') { e.possede.push('art912', 'spot260', 'soundswitch', 'z1000', 'blx', 'boule', 'sparkular', 'hd25', 'rx3'); Object.assign(e.equipe, { sono: 'art912', lumieres: 'spot260', pupitre: 'soundswitch', fumee: 'z1000', micro: 'blx', casque: 'hd25', platines: 'rx3' }); }
    d.carriere.afficher('soirees');
  }, soiree);
  await clic('[data-jouer="' + soiree + '"]');
  await clic('#dialogue [data-i="1"]');
  await page.waitForSelector('#jeu:not([hidden])');
  await dj((d, niveau) => {
    const m = d.moteur, J = d.jeu, C = J.cabine.cmd, bon = niveau === 'bon';
    const R = (window.__robot = { joues: new Set(), actif: -1, etape: 'depart', journal: [], t: 0, occupe: false });
    const note = (x) => R.journal.push(Math.round(J.session.t) + ' s : ' + x);
    const choisir = () => {
      const s = J.session, voulue = s.voulue(s.t / s.d.duree), dem = s.objectifs.find((o) => o.actif && o.type === 'genre');
      let mieux = null, score = -9;
      for (const x of J.biblio.morceaux) {
        if (R.joues.has(x.id)) continue;
        const gout = s.d.gouts[x.genre] ?? 0.45;
        const sc = bon ? (dem ? (x.genre === dem.genre ? 3 : 0) : gout * 2) - Math.abs(x.energie - voulue) * 0.5 : -gout;      // le mauvais DJ prend ce que le public aime le moins
        if (sc > score) { score = sc; mieux = x; }
      }
      return mieux;
    };
    const lancer = async () => {
      R.occupe = true;
      const x = choisir(), i = R.actif < 0 ? 0 : 1 - R.actif, p = m.platines[i], ancien = R.actif;
      if (!x) { R.occupe = false; return; }
      R.joues.add(x.id);
      C.voies[i].fader.regler(0, true); C.voies[i].bas.regler(0, true);
      p.pause();
      await J.pc.charger(x.id, i);
      if (ancien < 0) { C.voies[i].fader.regler(1, true); p.lire(); note('premier morceau : ' + x.titre + ' (' + x.genre + ')'); }
      else {
        const a = m.platines[ancien], r = (x.bpm / a.bpm), ecart = Math.min(...[0.5, 1, 2].map((k) => Math.abs(r / k - 1)));
        if (bon && ecart < 0.09) {                                   // mélange calé : SYNC, entrée progressive, échange des graves
          if (!p.sync) p.basculerSync(a);
          C.voies[i].bas.regler(-1, true);
          p.lire();
          note('mélange vers ' + x.titre + ' (' + x.genre + ', ' + x.bpm + ' BPM)');
          for (let k = 1; k <= 20; k++) { await new Promise((ok) => setTimeout(ok, 300)); C.voies[i].fader.regler(k / 20, true); }
          C.voies[ancien].bas.regler(-1, true); C.voies[i].bas.regler(0, true);
          for (let k = 19; k >= 0; k--) { await new Promise((ok) => setTimeout(ok, 200)); C.voies[ancien].fader.regler(k / 20, true); }
        } else {                                                     // tempos trop éloignés : coupe franche
          p.sync = false; p.reglerCurseur(0);
          p.lire(); C.voies[i].fader.regler(1, true); C.voies[ancien].fader.regler(0, true);
          note('coupe vers ' + x.titre + ' (' + x.genre + ')');
        }
        a.pause(); C.voies[ancien].bas.regler(0, true);
      }
      R.actif = i; R.depuis = J.session.t; R.occupe = false;
    };
    R.minuteur = setInterval(() => {
      const s = J.session;
      if (!s || s.fini) { clearInterval(R.minuteur); return; }
      if (R.occupe) return;
      const L = J.lumieres, p = R.actif >= 0 ? m.platines[R.actif] : null;
      if (!p) { lancer(); return; }
      const reste = p.morceau ? p.morceau.duree - p.secondes : 0, dem = s.objectifs.find((o) => o.actif && o.type === 'genre');
      const besoin = dem && p.morceau.genre !== dem.genre && s.t - R.depuis > 8;
      if (bon ? (reste < 32 || besoin) : reste < 0.5 && !p.lecture && Math.random() < 0.25) { lancer(); return; }      // le mauvais DJ laisse des blancs
      if (!bon) return;
      // lumières : scène selon l'énergie, un peu de fumée, effets et annonces demandés
      const e = p.morceau.energie, veut = e <= 2 ? 'slow' : e >= 4 ? 'balayage' : 'pulsation';
      if (L.dispo.scenes && (L.e.scene !== veut || L.e.noir)) { L.e.scene = veut; L.e.noir = false; L._etat(); }
      if (L.dispo.fumee) L.e.fumee = L.densite < 0.25 && !(s.d.sansFumee && s.t / s.d.duree < s.d.sansFumee);
      if (L.dispo.brouillard) L.e.brouillard = !(s.d.sansFumee && s.t / s.d.duree < s.d.sansFumee);
      for (const o of s.objectifs) {
        if (!o.actif) continue;
        if (o.type === 'annonce' && !s.microOuvert) { m.reglerMicro(true); s.micro(true); setTimeout(() => { m.reglerMicro(false); s.micro(false); }, 3600); note('annonce au micro'); }
        if (o.type === 'effet') { L.tirer(o.effet); note('effet : ' + o.effet); }
        if (o.type === 'bouton' && !L.e[o.bouton]) { L.e[o.bouton] = true; L._etat(); note('bouton : ' + o.bouton); }
      }
    }, 500);
  }, niveau);
  const duree = await dj((d) => d.jeu.session.d.duree);
  console.log('  soirée « ' + soiree + ' », DJ ' + niveau + ', ' + duree + ' s en temps réel…');
  for (let k = 1; k <= 3; k++) { await attendre(duree / 4); await capture('robot_' + soiree + '_' + niveau + '_' + k); const e = await dj((d) => ({ t: Math.round(d.jeu.session.t), ambiance: Math.round(d.jeu.session.ambiance), dansants: d.salle.dansants, ...d.jeu.session.s })); console.log('  ', JSON.stringify(e)); }
  await page.waitForSelector('#dialogue:not([hidden])', { timeout: (duree / 4 + 40) * 1000 });
  await capture('robot_' + soiree + '_' + niveau + '_bilan');
  console.log('  bilan :', (await page.textContent('#dialogue')).replace(/\s+/g, ' ').slice(0, 520));
  console.log('  journal :', JSON.stringify(await dj(() => window.__robot.journal), null, 0).slice(0, 1800));
  const note = await dj((d, id) => d.carriere.e.faits[id], soiree);
  verifier(niveau === 'bon' ? 'un bon DJ obtient au moins 4 étoiles' : 'un mauvais DJ obtient au plus 2 étoiles', note && (niveau === 'bon' ? note.etoiles >= 4 : note.etoiles <= 2), note);
};
