/* Favori « ⚽ Faits de match ASF » : il s'exécute sur epreuves.fff.fr, dans le navigateur du dirigeant, sur la page du club.
   Les données du club (liste des matchs, détail d'un match) ne sont données qu'aux demandes faites comme celles de la page de
   la FFF : le favori regarde donc une demande de la page (en touchant « semaine précédente » dans l'onglet Matchs, ou en
   attendant que le dirigeant le fasse), puis fait les siennes de la même façon.
   1. la liste des matchs du club, mois par mois : la première fois toute la saison, ensuite les deux derniers mois ;
   2. pour chaque match joué, son détail : buts, cartons, remplacements (« momentsForts »), le stade quand on joue à l'extérieur ;
   3. il ouvre le site du club avec ces données dans l'adresse (#faits=…) : un coach ou le bureau les range d'un bouton.
   En cas d'échec, un diagnostic à copier (noms des en-têtes, jamais leurs valeurs). Pas de commentaire « // » : code sur une ligne. */
(async () => {
  const CL = "2177", SITE = "https://asf-pierrelatte.fr", PAGE = "https://epreuves.fff.fr/competition/club/504261-atom-sp-pierrelatte";
  if (!/(^|\.)epreuves\.fff\.fr$/.test(location.hostname)) { if (confirm("Ce favori s'utilise sur la page du club, sur le site de la FFF (epreuves.fff.fr). L'ouvrir maintenant ?")) location.href = PAGE; return; }
  const T = x => String(x == null ? "" : x).replace(/\s+/g, " ").trim();
  const ancien = document.getElementById("asf-faits"); if (ancien) ancien.remove();
  const box = document.createElement("div"); box.id = "asf-faits";
  box.style.cssText = "position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;padding:14px 16px;border-radius:14px;background:#0F2257;color:#fff;font:600 16px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45)";
  document.body.appendChild(box);
  const dire = t => { box.textContent = "⚽ ASF Pierrelatte · " + t; };
  const pause = n => new Promise(r => setTimeout(r, n));
  const diag = { page: location.pathname, vues: [], statuts: [], bouton: "" };

  /* 1. regarder une demande de données faite par la page elle-même */
  const vues = [];
  const noter = (url, h) => { try { if (/\/api\/data\//.test(String(url))) vues.push({ url: String(url), h: h || {} }); } catch (x) {} };
  const versObjet = src => { const h = {}; try { if (!src) return h; if (typeof Headers !== "undefined" && src instanceof Headers) src.forEach((v, k) => { h[k] = v; }); else if (Array.isArray(src)) src.forEach(p => { h[p[0]] = p[1]; }); else Object.keys(src).forEach(k => { h[k] = src[k]; }); } catch (x) {} return h; };
  const fetchPage = window.fetch;
  window.fetch = function (input, init) {
    try { const u = typeof input === "string" ? input : (input && input.url) || ""; noter(u, Object.assign(versObjet(input && input.headers), versObjet(init && init.headers))); } catch (x) {}
    return fetchPage.apply(this, arguments);
  };
  const XP = XMLHttpRequest.prototype, xOpen = XP.open, xSet = XP.setRequestHeader, xSend = XP.send;
  XP.open = function (m, u) { this.__asf = { url: String(u), h: {} }; return xOpen.apply(this, arguments); };
  XP.setRequestHeader = function (k, v) { try { if (this.__asf) this.__asf.h[k] = v; } catch (x) {} return xSet.apply(this, arguments); };
  XP.send = function () { try { if (this.__asf) noter(this.__asf.url, this.__asf.h); } catch (x) {} return xSend.apply(this, arguments); };
  const rendre = () => { window.fetch = fetchPage; XP.open = xOpen; XP.setRequestHeader = xSet; XP.send = xSend; };
  const attendre = async ms => { const t0 = Date.now(); while (!vues.length && Date.now() - t0 < ms) await pause(200); return vues.length > 0; };
  const bouton = [...document.querySelectorAll("button, a, [role=button]")].find(b => /semaine\s+pr[ée]c[ée]dente|mois\s+pr[ée]c[ée]dent/i.test(b.textContent || ""));
  if (bouton) { diag.bouton = T(bouton.textContent).slice(0, 40); dire("préparation : je touche « " + diag.bouton + " »…"); try { bouton.click(); } catch (x) {} }
  if (!(await attendre(bouton ? 5000 : 0))) {
    dire("touche « Semaine précédente » dans l'onglet Matchs du club, sur cette page : le favori continue tout seul.");
    await attendre(90000);
  }
  const STD = /^(accept|content-type|accept-language|cache-control|pragma)$/i;
  const modele = vues[vues.length - 1];
  const entete = {};
  if (modele) Object.keys(modele.h).forEach(k => { if (!STD.test(k)) entete[k] = modele.h[k]; });
  diag.vues = vues.slice(-5).map(v => ({ url: v.url.replace(location.origin, "").slice(0, 140), entetes: Object.keys(v.h).map(k => k + " (" + String(v.h[k]).length + " car.)") }));
  rendre();
  if (!modele) { dire("aucune demande de la page vue : ouvre la page du club sur la FFF, onglet Matchs, puis touche à nouveau le favori."); setTimeout(() => box.remove(), 12000); return; }

  /* 2. les demandes du favori, faites comme celles de la page */
  const lire = async u => {
    const r = await fetch(u, { headers: Object.assign({ Accept: "application/ld+json, application/json, text/plain, */*" }, entete), credentials: "include" });
    diag.statuts.push(r.status + " " + u.replace(/\?.*$/, "").slice(0, 60));
    if (!r.ok) throw new Error("réponse " + r.status);
    return r.json();
  };
  const n = new Date(), an = n.getMonth() >= 7 ? n.getFullYear() : n.getFullYear() - 1, KS = "asf-faits-saison-" + an;
  let premier = false; try { premier = !localStorage.getItem(KS); } catch (x) {}
  const debut = premier ? new Date(an, 7, 1) : new Date(n.getFullYear(), n.getMonth() - 1, 1);
  const mois = []; for (let d = new Date(debut); d <= n; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) mois.push(new Date(d));
  const borne = (d, fin) => { const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"); return (fin ? y + "-" + m + "-" + String(new Date(y, d.getMonth() + 1, 0).getDate()).padStart(2, "0") + "T23:59:59" : y + "-" + m + "-01T00:00:00") + "%2B00:00"; };
  const liste = [], erreurs = [];
  for (const d of mois) {
    const nomMois = d.toLocaleDateString("fr-FR", { month: "long" });
    dire("liste des matchs de " + nomMois + "…");
    try {
      for (let p = 1; p <= 10; p++) {
        const j = await lire("/api/data/matches?dateDebut=" + borne(d) + "&dateFin=" + borne(d, 1) + "&clNo=" + CL + "&itemsPerPage=20&pagination=true&page=" + p);
        const l = j["hydra:member"] || j.member || [];
        l.forEach(e => liste.push(e && (e.donneesFormatees || e)));
        if (l.length < 20) break;
        await pause(250);
      }
    } catch (x) { erreurs.push(nomMois + " (" + x.message + ")"); if (!liste.length) break; }
    await pause(250);
  }
  const auj = Date.now();
  const joues = [...new Map(liste.filter(d => d && d.maNo && (d.joue === true || /jou/i.test(T(d.maStatutLib))) && !/non/i.test(T(d.maStatutLib)) && !(Date.parse(d.date) > auj)).map(d => [T(d.maNo), d])).values()];
  const montrerDiag = titre => {
    box.textContent = "";
    const p = document.createElement("div"); p.textContent = "⚽ ASF Pierrelatte · " + titre; box.appendChild(p);
    const b = document.createElement("button"); b.type = "button"; b.textContent = "📋 Copier le diagnostic";
    b.style.cssText = "margin:10px 8px 0 0;padding:11px 14px;border:0;border-radius:10px;background:#D02E26;color:#fff;font:700 15px system-ui,-apple-system,sans-serif";
    const txt = JSON.stringify(Object.assign({ v: 2, quand: new Date().toISOString(), erreurs, cookies: document.cookie.split(";").map(c => c.split("=")[0].trim()).filter(Boolean) }, diag), null, 1);
    b.onclick = () => { const ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0"; document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, txt.length); let ok = false; try { ok = document.execCommand("copy"); } catch (x) {} ta.remove(); if (!ok && navigator.clipboard) navigator.clipboard.writeText(txt).then(() => { b.textContent = "✔ Copié"; }); else b.textContent = ok ? "✔ Copié : colle-le dans la conversation" : "Copie impossible"; };
    box.appendChild(b);
    const x = document.createElement("button"); x.type = "button"; x.textContent = "✕"; x.style.cssText = b.style.cssText.replace("#D02E26", "#33415C"); x.onclick = () => box.remove(); box.appendChild(x);
  };
  if (!joues.length) { montrerDiag(liste.length ? "aucun match joué sur cette période." : "la FFF refuse encore la liste des matchs. Touche « Copier le diagnostic » et envoie-le à la personne qui s'occupe du site."); return; }

  /* 3. le détail de chaque match joué */
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
    await pause(250);
  }
  if (!out.length) { montrerDiag("la FFF n'a pas donné le détail des matchs. Touche « Copier le diagnostic » et envoie-le à la personne qui s'occupe du site."); return; }
  try { localStorage.setItem(KS, "1"); } catch (x) {}
  dire(out.length + " match(s) lu(s) : ouverture du site du club…");
  location.href = SITE + "/?faits=1#faits=" + encodeURIComponent(JSON.stringify({ type: "asf-faits", v: 1, lu: new Date().toISOString(), saison: premier, erreurs: erreurs.slice(0, 20), matchs: out }));
})();
