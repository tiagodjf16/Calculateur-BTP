/* Favori « ⚽ Faits de match ASF » : il s'exécute sur epreuves.fff.fr, dans le navigateur du dirigeant.
   1. la liste des matchs du club (toutes les équipes), mois par mois : la première fois toute la saison, ensuite les deux derniers mois ;
   2. pour chaque match joué, son détail : buts, cartons, remplacements (« momentsForts »), et le stade quand on joue à l'extérieur ;
   3. il ouvre le site du club avec ces données dans l'adresse (#faits=…) : un coach ou le bureau les range d'un bouton.
   Rien n'est écrit sur le site sans ce bouton. Pas de commentaire « // » : le code est mis sur une seule ligne. */
(async () => {
  const CL = "2177", SITE = "https://asf-pierrelatte.fr", PAGE = "https://epreuves.fff.fr/animation-loisir/cdg/125/club/2177";
  if (!/(^|\.)epreuves\.fff\.fr$/.test(location.hostname)) { if (confirm("Ce favori s'utilise sur le site de la FFF (epreuves.fff.fr). L'ouvrir maintenant ?")) location.href = PAGE; return; }
  const T = x => String(x == null ? "" : x).replace(/\s+/g, " ").trim();
  const box = document.createElement("div");
  box.style.cssText = "position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;padding:14px 16px;border-radius:14px;background:#0F2257;color:#fff;font:600 16px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45)";
  document.body.appendChild(box);
  const dire = t => { box.textContent = "⚽ ASF Pierrelatte · " + t; };
  dire("lecture des matchs sur la FFF…");
  let jeton = "";
  try { const s = document.getElementById("ng-state") || document.querySelector('script[type="application/json"]'), m = s && s.textContent.match(/"token"\s*:\s*"([^"]{10,})"/); if (m) jeton = m[1]; } catch (x) {}
  const lire = async u => {
    const h = { Accept: "application/ld+json, application/json" };
    let r = await fetch(u, { headers: h, credentials: "include" });
    if ((r.status === 401 || r.status === 403) && jeton) { h["X-Competition"] = jeton; r = await fetch(u, { headers: h, credentials: "include" }); }
    if (!r.ok) throw new Error("réponse " + r.status);
    return r.json();
  };
  const pause = n => new Promise(r => setTimeout(r, n));
  const n = new Date(), an = n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1, KS = "asf-faits-saison-" + an;
  let premier = false; try { premier = !localStorage.getItem(KS); } catch (x) {}
  const debut = premier ? new Date(an, 7, 1) : new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const mois = []; for (let d = new Date(debut); d <= n; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) mois.push(new Date(d));
  const borne = (d, fin) => { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"); return fin ? y + "-" + m + "-" + String(new Date(y, d.getMonth() + 1, 0).getDate()).padStart(2, "0") + "T23:59:59+00:00" : y + "-" + m + "-01T00:00:00+00:00"; };
  const liste = [], erreurs = [];
  for (const d of mois) {
    const nomMois = d.toLocaleDateString("fr-FR", { month: "long" });
    dire("liste des matchs de " + nomMois + "…");
    try {
      for (let p = 1; p <= 10; p++) {
        const q = "clNo=" + CL + "&dateDebut=" + encodeURIComponent(borne(d)) + "&dateFin=" + encodeURIComponent(borne(d, 1)) + "&itemsPerPage=20&pagination=true&page=" + p;
        let j; try { j = await lire("/api/data//matches?" + q); } catch (x) { j = await lire("/api/data/matches?" + q); }
        const l = j["hydra:member"] || j.member || [];
        l.forEach(e => liste.push(e && (e.donneesFormatees || e)));
        if (l.length < 20) break;
        await pause(150);
      }
    } catch (x) { erreurs.push(nomMois + " (" + x.message + ")"); }
  }
  const auj = Date.now();
  const joues = [...new Map(liste.filter(d => d && d.maNo && (d.joue === true || /jou/i.test(T(d.maStatutLib))) && !/non/i.test(T(d.maStatutLib)) && !(Date.parse(d.date) > auj)).map(d => [T(d.maNo), d])).values()];
  if (!joues.length) {
    dire(erreurs.length ? "la FFF n'a pas répondu (" + erreurs.join(", ") + "). Recharge la page de la FFF, puis touche à nouveau le favori." : "aucun match joué trouvé sur cette période.");
    setTimeout(() => box.remove(), 9000); return;
  }
  const nom = p => p ? T([p.prenom, p.nom].filter(Boolean).join(" ")) : "";
  const out = []; let k = 0;
  for (const d0 of joues) {
    dire("lecture des matchs joués… " + (++k) + "/" + joues.length);
    try {
      const j = await lire("/api/data/matches/" + T(d0.maNo)), d = j.donneesFormatees || j, r = d.recevant || {}, v = d.visiteur || {};
      const ici = T(r.club && r.club.clNo) === CL ? "r" : T(v.club && v.club.clNo) === CL ? "v" : "";
      if (!ici) continue;
      const nous = ici === "r" ? r : v, eux = ici === "r" ? v : r, st = d.stade || {}, cp = d.competition || {}, jo = d.journee || {};
      out.push({ no: T(d.maNo), d: T(d.date), cp: T((cp.donneesFormatees || cp).nom), tr: T(jo.tourNom || (jo.pjNo ? "Journée " + jo.pjNo : "")),
        dom: ici === "r", nq: T(nous.club && nous.club.nom), eq: T(nous.equipe && nous.equipe.id), adv: T(eux.club && eux.club.nom), bn: nous.buts, ba: eux.buts,
        st: ici === "v" ? [T(st.nom), [].concat(st.adresse || []).map(T).filter(Boolean).join(", ")].filter(Boolean).join(", ").slice(0, 160) : "",
        m: (d.momentsForts || []).slice(0, 60).map(x => [T(x.type).slice(0, 30), +x.minute || 0, +x.minuteProlongation || 0, x.clubType === (ici === "r" ? "recevant" : "visiteur") ? "n" : "a", nom(x.joueur).slice(0, 60), nom(x.remplacant).slice(0, 60)]) });
    } catch (x) { erreurs.push("match " + T(d0.maNo) + " (" + x.message + ")"); }
    await pause(150);
  }
  if (!out.length) { dire("la FFF n'a pas donné le détail des matchs. Recharge la page de la FFF, puis touche à nouveau le favori."); setTimeout(() => box.remove(), 9000); return; }
  try { localStorage.setItem(KS, "1"); } catch (x) {}
  dire(out.length + " match(s) lu(s) : ouverture du site du club…");
  location.href = SITE + "/?faits=1#faits=" + encodeURIComponent(JSON.stringify({ type: "asf-faits", v: 1, lu: new Date().toISOString(), saison: premier, erreurs: erreurs.slice(0, 20), matchs: out }));
})();
