/* Onglet « Affiches matchs » (rubrique Communication) : les affiches de matchs avec des matchs tapés à la main.
   Rencontres et résultats du week-end, foot animation (plateaux avec plusieurs adversaires, scores par adversaire),
   vétérans, jour de match, résultat d'un match. On peut reprendre les matchs du calendrier puis compléter ou corriger.
   Le serveur dessine les affiches (POST api/affiches.php?manuel=1) exactement comme celles du lundi : feuille à domicile,
   feuille à l'extérieur, en story, publication 1080 × 1350 ou Facebook 1080 × 2160, et écrit le message de l'annonce.
   Publication : stories Facebook / Instagram, annonce Facebook / Instagram (api/publier.php), ou téléchargement.
   Ajouté sans modifier le script de l'application. Les listes restent dans ce navigateur. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONGLETS === "undefined" || typeof RUBRIQUES === "undefined" || typeof rendrePanneau !== "function") return;
  const OUTILS = window.ASFP_AFF;                                       // outils communs, fournis par evenements.js (chargé avant)
  if (!OUTILS) return;
  const { sansEmoji, serieDePublication, enregistrerImage, styleCadre } = OUTILS;

  /* ---------- types d'affiche ---------- */
  const TYPES = {
    "rencontres":     { ico: "📅", nom: "Rencontres", sous: "du week-end", fam: "champ", res: false },
    "resultats":      { ico: "📊", nom: "Résultats", sous: "du week-end", fam: "champ", res: true },
    "fal-rencontres": { ico: "🧒", nom: "Foot animation", sous: "rencontres", fam: "fal", res: false },
    "fal-resultats":  { ico: "🧒", nom: "Foot animation", sous: "résultats", fam: "fal", res: true },
    "vet-rencontres": { ico: "🍺", nom: "Vétérans", sous: "rencontres", fam: "vet", res: false },
    "vet-resultats":  { ico: "🍺", nom: "Vétérans", sous: "résultats", fam: "vet", res: true },
    "match":          { ico: "⚽", nom: "Jour de match", sous: "un match", fam: "seul", res: false },
    "score":          { ico: "🏁", nom: "Résultat", sous: "d'un match", fam: "seul", res: true },
  };
  const FORMATS = [["story", "Story", "1080 × 1920", "9/16"], ["carre", "Annonce", "1080 × 1350", "4/5"], ["fb", "Facebook", "1080 × 2160", "1/2"]];
  const CATS_FAL = (typeof ONGLETS_ANIM_CAL !== "undefined" && Array.isArray(ONGLETS_ANIM_CAL)) ? ONGLETS_ANIM_CAL
    : ["U6 · U7", "U8 · U9", "U10 · U11 Avenir", "U10 · U11 Espoir", "U13 · équipe 3", "U13 · équipe 4"];
  const MAX = 12;

  /* ---------- état (gardé dans ce navigateur) ---------- */
  const CLE = "asfp-affiches-matchs";
  const samediDe = d => { try { return weekend(d).sam; } catch(e){ return d || ""; } };
  function nouveau(t, samedi){
    const fam = TYPES[t].fam;
    const m = { dom: true, equipe: fam === "vet" ? "Vétérans" : "", comp: fam === "fal" ? "Plateau" : "", adv: "", date: samedi, heure: "", adresse: "", bp: "", bc: "" };
    if (fam === "fal"){ m.equipe = CATS_FAL[0]; m.adversaires = ""; m.resultats = [{ adv: "", bp: "", bc: "" }]; }
    return m;
  }
  function charger(){
    let d = null;
    try { d = JSON.parse(localStorage.getItem(CLE) || "null"); } catch(e){}
    const E = { type: "rencontres", fmt: "carre", samedis: {}, auto: {}, titre: "", sponsors: true, listes: {}, msgs: {},
      pub: { fb_pub: true, ig_pub: true, fb_story: false, ig_story: false }, etat: "", enCours: "" };
    if (d && typeof d === "object"){
      if (TYPES[d.type]) E.type = d.type;
      if (FORMATS.some(f => f[0] === d.fmt)) E.fmt = d.fmt;
      if (d.samedis && typeof d.samedis === "object") for (const t of Object.keys(TYPES)) if (typeof d.samedis[t] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.samedis[t])) E.samedis[t] = d.samedis[t];
      if (d.auto && typeof d.auto === "object") for (const t of Object.keys(TYPES)) if (d.auto[t] && typeof d.auto[t].samedi === "string") E.auto[t] = { samedi: d.auto[t].samedi, modifie: !!d.auto[t].modifie, source: d.auto[t].source || "" };
      if (typeof d.titre === "string") E.titre = d.titre;
      if (typeof d.sponsors === "boolean") E.sponsors = d.sponsors;
      if (d.pub && typeof d.pub === "object") for (const k of Object.keys(E.pub)) if (typeof d.pub[k] === "boolean") E.pub[k] = d.pub[k];
      if (d.listes && typeof d.listes === "object") for (const t of Object.keys(TYPES)) if (Array.isArray(d.listes[t])) E.listes[t] = d.listes[t].slice(0, MAX).filter(x => x && typeof x === "object");
      if (d.msgs && typeof d.msgs === "object") for (const t of Object.keys(TYPES)) if (d.msgs[t] && typeof d.msgs[t].msg === "string") E.msgs[t] = { msg: d.msgs[t].msg, libre: !!d.msgs[t].libre };
    }
    for (const t of Object.keys(TYPES)){ if (!E.listes[t]) E.listes[t] = []; if (!E.msgs[t]) E.msgs[t] = { msg: "", libre: false }; }
    return E;
  }
  const E = () => S.ui.affMatchs || (S.ui.affMatchs = charger());
  const L = () => E().listes[E().type];
  /* week-end par défaut : le prochain pour les rencontres, le dernier commencé pour les résultats */
  function samediParDefaut(t){
    if (!TYPES[t].res) return samediDe();
    const d = new Date(); d.setHours(12, 0, 0, 0); const j = d.getDay();
    d.setDate(d.getDate() - (j === 6 ? 0 : j === 0 ? 1 : j + 1));
    return iso(d);
  }
  const SAM = () => E().samedis[E().type] || samediParDefaut(E().type);
  const marquer = () => { const a = E().auto[E().type]; if (a) a.modifie = true; };
  const T = () => TYPES[E().type];
  let saveT;
  function sauver(){
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const e = E();
      try { localStorage.setItem(CLE, JSON.stringify({ type: e.type, fmt: e.fmt, samedis: e.samedis, auto: e.auto, titre: e.titre, sponsors: e.sponsors, pub: e.pub, listes: e.listes, msgs: e.msgs })); } catch(err){}
    }, 300);
  }

  /* ---------- données envoyées au serveur ---------- */
  const lignes = s => String(s || "").split(/\r?\n|,/).map(x => x.trim()).filter(Boolean);
  const nombre = v => (v === "" || v === null || v === undefined || isNaN(+v)) ? null : Math.max(0, Math.min(99, Math.round(+v)));
  // les émojis ne vont que dans le message : la police de l'affiche ne les a pas
  const net = v => sansEmoji(String(v || "")).trim();
  function matchServeur(m, t){
    const o = { equipe: t.fam === "vet" ? "Vétérans" : net(m.equipe), comp: net(m.comp), adv: net(m.adv),
      dom: !!m.dom, date: m.date || "", heure: m.heure || "", adresse: m.dom ? "" : net(m.adresse) };
    if (t.fam === "fal"){
      o.adversaires = lignes(sansEmoji(m.adversaires));
      o.resultats = (m.resultats || []).map(r => ({ adv: net(r.adv), bp: nombre(r.bp), bc: nombre(r.bc) })).filter(r => r.adv);
    } else if (t.res){ o.bp = nombre(m.bp); o.bc = nombre(m.bc); }
    return o;
  }
  // instantané de l'affiche : ce qui part à la publication ne bouge plus si on continue à taper pendant l'envoi
  const instantane = () => JSON.parse(JSON.stringify({ type: E().type, titre: E().titre, sponsors: E().sponsors, samedi: SAM(), liste: L() }));
  const donnees = (lieu, fmt, s = instantane()) => ({ type: s.type, lieu: lieu || "", format: fmt, titre: net(s.titre), sponsors: s.sponsors, samedi: s.samedi,
    matchs: s.liste.map(m => matchServeur(m, TYPES[s.type])) });
  /* ce qui manque à un match pour être sur l'affiche (le serveur l'ignore sinon) */
  function manque(m, t = T()){
    const x = [];
    if (!m.date) x.push("la date");
    if (t.fam === "fal"){
      if (!m.dom && !String(m.adv || "").trim() && !String(m.adresse || "").trim()) x.push("le club qui reçoit");
      if (t.res && !(m.resultats || []).some(r => String(r.adv || "").trim() && nombre(r.bp) !== null && nombre(r.bc) !== null)) x.push("au moins un score");
    } else if (!String(m.adv || "").trim()) x.push("l'adversaire");
    return x;
  }
  /* feuilles à dessiner : domicile et/ou extérieur (une seule pour un match seul) */
  function feuilles(s){
    const t = s ? TYPES[s.type] : T(), l = s ? s.liste : L();
    if (t.fam === "seul") return [null];
    const ok = l.filter(m => !manque(m, t).length);
    const f = ["dom", "ext"].filter(l => ok.some(m => !!m.dom === (l === "dom")));
    return f.length ? f : ["dom"];
  }
  const api = () => (window.ASFP_API || "/api");
  async function image(lieu, fmt, s){
    const r = await fetch(api() + "/affiches.php?manuel=1&v=" + Date.now().toString(36), { method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(donnees(lieu, fmt, s)) });
    const type = r.headers.get("Content-Type") || "";
    if (!r.ok || !type.startsWith("image/")) throw new Error(((await r.text().catch(() => "")) || `erreur ${r.status}`).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160));
    return r.blob();
  }

  /* ---------- message de l'annonce ---------- */
  const maj1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function messageSeul(){
    const m = L()[0]; if (!m) return "";
    const adv = typeof joliClub === "function" ? joliClub(m.adv) : m.adv, eq = String(m.equipe || "").trim() || "équipe";
    const quand = m.date ? maj1(dateLongue(m.date)) + (m.heure ? " · " + hFr(m.heure) : "") : "";
    const lieu = m.dom ? (typeof ADRESSE_STADE === "string" ? ADRESSE_STADE : "Stade Gustave Jaume, Pierrelatte") : (String(m.adresse || "").trim() || "Chez " + adv);
    if (E().type === "score"){
      const bp = nombre(m.bp), bc = nombre(m.bc);
      if (bp === null || bc === null) return "";
      const sc = m.dom ? `Pierrelatte ${bp} – ${bc} ${adv}` : `${adv} ${bc} – ${bp} Pierrelatte`;
      const iss = bp > bc ? "✅ Victoire de nos " + eq + " !" : bp < bc ? "❌ Défaite de nos " + eq + "." : "🤝 Match nul pour nos " + eq + ".";
      return [`🏁 Résultat · ${eq}${m.comp ? " · " + m.comp : ""}`, "", sc, iss, "", "Merci à nos supporters 💙🤍", "#ASFPierrelatte"].join("\n");
    }
    return [`⚽ ${m.comp || "Match"} · ${eq}`, "", `🆚 ${m.dom ? `Pierrelatte – ${adv}` : `${adv} – Pierrelatte`}`, quand && `📅 ${quand}`, `📍 ${lieu}`, "",
      m.dom ? `Venez nombreux encourager nos ${eq} ! 💙🤍` : `Tous derrière nos ${eq} ! 💙🤍`, "#ASFPierrelatte"].filter(x => x !== "" || true).join("\n").replace(/\n{3,}/g, "\n\n");
  }
  let msgT, msgJeton = 0;
  function majMessage(tout){
    const e = E(), t = e.type, mm = e.msgs[t];
    if (mm.libre) return;
    clearTimeout(msgT);
    msgT = setTimeout(async () => {
      const j = ++msgJeton;
      let txt = "";
      if (TYPES[t].fam === "seul") txt = messageSeul();
      else try {
        const r = await fetch(api() + "/affiches.php?manuel=1&message=1", { method: "POST", credentials: "same-origin", cache: "no-store",
          headers: { "Content-Type": "application/json" }, body: JSON.stringify(donnees("", "carre")) });
        txt = r.ok ? (await r.text()).trim() : "";
      } catch(err){}
      if (j !== msgJeton || e.type !== t || mm.libre) return;
      mm.msg = txt; sauver();
      const z = document.getElementById("am-msg");
      if (z && document.activeElement !== z) z.value = txt;
      const lb = document.getElementById("am-libre"); if (lb) lb.hidden = true;
    }, tout ? 0 : 1200);
  }

  /* ---------- le panneau ---------- */
  const champ = (i, k, l, val, attrs = "", type = "text") => `<label>${l}<input type="${type}" data-am="${k}" data-i="${i}" value="${esc(val ?? "")}" ${attrs}></label>`;
  function carteMatch(m, i, n){
    const t = T(), fal = t.fam === "fal", seul = t.fam === "seul";
    const x = manque(m);
    const lieuBtns = `<div class="am-lieu" role="group" aria-label="Lieu">
      <button type="button" class="as-fmt ${m.dom ? "on" : ""}" data-am-a="dom" data-i="${i}" data-k="1">🏠 À domicile</button>
      <button type="button" class="as-fmt ${!m.dom ? "on" : ""}" data-am-a="dom" data-i="${i}" data-k="0">✈️ À l'extérieur</button></div>`;
    let corps;
    if (fal){
      corps = `<label>Catégorie<select data-am="equipe" data-i="${i}">${[...new Set([...CATS_FAL, m.equipe].filter(Boolean))].map(c => `<option ${c === m.equipe ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        <label>Type<select data-am="comp" data-i="${i}">${["Plateau", "Brassage"].map(c => `<option ${c === m.comp ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        ${champ(i, "date", "Date", m.date, "", "date")}${champ(i, "heure", "Heure", m.heure, "", "time")}
        ${m.dom ? "" : champ(i, "adv", "Chez (club qui reçoit)", m.adv, `maxlength="60" list="am-clubs" placeholder="C.O. Donzérois"`)}
        ${m.dom ? "" : champ(i, "adresse", "Stade, ville", m.adresse, `maxlength="120" placeholder="Stade Marcel Pagnol, Donzère"`)}
        ${t.res ? `<div class="am-plein"><b class="ps-lab">Les matchs du plateau</b>${(m.resultats || []).map((r, j) => `<div class="am-score">
            <input data-am="r-adv" data-i="${i}" data-j="${j}" value="${esc(r.adv)}" maxlength="60" list="am-clubs" placeholder="Adversaire" aria-label="Adversaire">
            <input type="number" min="0" max="99" inputmode="numeric" data-am="r-bp" data-i="${i}" data-j="${j}" value="${esc(r.bp)}" aria-label="Buts de Pierrelatte" placeholder="Nous">
            <span>–</span>
            <input type="number" min="0" max="99" inputmode="numeric" data-am="r-bc" data-i="${i}" data-j="${j}" value="${esc(r.bc)}" aria-label="Buts de l'adversaire" placeholder="Eux">
            <button type="button" class="btn contour petit" data-am-a="r-suppr" data-i="${i}" data-j="${j}" aria-label="Retirer ce match">✕</button></div>`).join("")}
            ${(m.resultats || []).length < 6 ? `<button type="button" class="btn contour petit" data-am-a="r-ajout" data-i="${i}">+ Un match du plateau</button>` : ""}</div>`
          : `<label class="am-plein">Contre (un club par ligne)<textarea data-am="adversaires" data-i="${i}" rows="3" placeholder="Donzère&#10;Montélimar&#10;Malataverne">${esc(m.adversaires || "")}</textarea></label>`}`;
    } else {
      corps = `${t.fam === "vet" ? "" : champ(i, "equipe", "Équipe", m.equipe, `maxlength="40" list="am-equipes" placeholder="Seniors 1"`)}
        ${champ(i, "comp", "Compétition", m.comp, `maxlength="40" placeholder="D1, Régional 2, Coupe de la Drôme…"`)}
        ${champ(i, "adv", "Adversaire", m.adv, `maxlength="60" list="am-clubs" placeholder="FC Péageois"`)}
        ${champ(i, "date", "Date", m.date, "", "date")}${champ(i, "heure", "Heure", m.heure, "", "time")}
        ${m.dom ? "" : champ(i, "adresse", "Stade, ville (facultatif)", m.adresse, `maxlength="120" placeholder="Stade municipal, Bourg-de-Péage"`)}
        ${t.res ? `<div class="am-plein am-score am-score-match"><span>Score : Pierrelatte</span>
            <input type="number" min="0" max="99" inputmode="numeric" data-am="bp" data-i="${i}" value="${esc(m.bp)}" aria-label="Buts de Pierrelatte">
            <span>–</span>
            <input type="number" min="0" max="99" inputmode="numeric" data-am="bc" data-i="${i}" value="${esc(m.bc)}" aria-label="Buts de l'adversaire">
            <span>${esc(m.adv || "adversaire")}</span></div>` : ""}`;
    }
    return `<div class="am-match" data-am-carte="${i}">
      <div class="am-match-tete"><b>${seul ? "Le match" : `Match ${i + 1}`}</b>${lieuBtns}
        ${seul ? "" : `<span class="am-ordre"><button type="button" class="btn contour petit" data-am-a="haut" data-i="${i}" ${i ? "" : "disabled"} aria-label="Monter">↑</button><button type="button" class="btn contour petit" data-am-a="bas" data-i="${i}" ${i < n - 1 ? "" : "disabled"} aria-label="Descendre">↓</button></span>`}
        <button type="button" class="btn contour petit" data-am-a="suppr" data-i="${i}" aria-label="Supprimer ce match">✕</button></div>
      <div class="am-champs">${corps}</div>
      <p class="am-manque" data-am-manque="${i}" ${x.length ? "" : "hidden"}>⚠️ Il manque ${x.join(" et ")} : ce match ne sera pas sur l'affiche.</p>
    </div>`;
  }
  function panAffMatchs(){
    const e = E(), t = T(), l = L();
    if (!S.heberge) return `<div class="carte af-carte"><div class="af-tete"><h2>Affiches matchs</h2></div>
      <p class="quoi">Les affiches sont dessinées par le serveur du club : ouvre l'espace club depuis le site en ligne (asf-pierrelatte.fr).</p></div>`;
    const seul = t.fam === "seul", fs = feuilles(), F = FORMATS.find(f => f[0] === e.fmt) || FORMATS[1];
    const nomF = f => f === "dom" ? "À domicile" : f === "ext" ? "À l'extérieur" : "L'affiche";
    const opt = (k, lb, res) => `<label class="af-choix ${e.pub[k] ? "on" : ""}"><input type="checkbox" data-am-pub="${k}" aria-label="${lb} ${res}" ${e.pub[k] ? "checked" : ""}>${lb}</label>`;
    const clubs = [...new Set([...(S.matchs || []).map(m => m.adv), ...(S.matchsAnimation || []).flatMap(m => [m.adv, ...(m.adversaires || [])])]
      .filter(Boolean).map(x => String(x).trim()))].sort((a, b) => a.localeCompare(b)).slice(0, 400);
    const equipes = (() => { try { return toutesEquipes(); } catch(err){ return []; } })();
    return `<div class="ev-zone am-zone">
    <datalist id="am-clubs">${clubs.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <datalist id="am-equipes">${equipes.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <div class="carte af-carte">
      <div class="af-tete"><h2>Affiches matchs</h2><small>Les matchs du week-end se mettent tout seuls : ajoute ou corrige ce qui manque</small></div>
      <div class="am-types" role="group" aria-label="Type d'affiche">${Object.entries(TYPES).map(([k, x]) => `<button type="button" class="ev-type" aria-pressed="${k === e.type}" data-am-a="type" data-k="${k}"><span>${x.ico}</span>${esc(x.nom)}<small>${esc(x.sous)}</small></button>`).join("")}</div>
    </div>
    <div class="ev-grille">
      <section class="carte af-carte ev-ecrire" aria-labelledby="am-h-ecrire">
        <div class="af-tete"><h2 id="am-h-ecrire">✏️ ${seul ? "Le match" : "Les matchs de l'affiche"}</h2><small>${esc(t.nom + " · " + t.sous)}</small></div>
        <div class="am-haut">
          <label>Week-end du<input type="date" data-am-g="samedi" value="${esc(SAM())}"></label>
          <button type="button" class="btn contour" data-am-a="reprendre">↺ Reprendre les matchs automatiques</button>
        </div>
        ${(() => { const a = e.auto[e.type];
          if (a && a.charge) return `<p class="am-source">⏳ Chargement des matchs automatiques du week-end…</p>`;
          if (a && a.samedi === SAM() && !a.modifie) return `<p class="am-source">✅ Matchs automatiques du week-end${a.source === "app" ? " (repris du calendrier de l'app)" : ", comme les affiches du lundi"}. Ajoute ou corrige ce qui manque : matchs, scores, plateaux…</p>`;
          if (a && a.modifie) return `<p class="am-source">✏️ Liste modifiée à la main. « ↺ Reprendre les matchs automatiques » pour revenir à celle du calendrier.</p>`;
          return ""; })()}
        <div class="am-liste">${l.map((m, i) => carteMatch(m, i, l.length)).join("") || ((e.auto[e.type] || {}).charge ? "" : `<p class="quoi am-vide">Aucun match automatique pour ce week-end : ajoute-les à la main.</p>`)}</div>
        ${seul && l.length ? "" : l.length < MAX ? `<button type="button" class="btn bleu am-ajout" data-am-a="ajout">+ Ajouter un match</button>` : `<p class="quoi">${MAX} matchs au plus : fais deux affiches.</p>`}
        <div class="am-options">
          <label>Titre (facultatif)<input data-am-g="titre" maxlength="80" value="${esc(e.titre)}" placeholder="${esc(t.nom)}"></label>
          <label class="ev-case"><input type="checkbox" data-am-g="sponsors" ${e.sponsors ? "checked" : ""}> Bandeau des partenaires</label>
          ${l.length ? `<button type="button" class="btn contour petit" data-am-a="vider">🗑️ Tout effacer</button>` : ""}
        </div>
      </section>
      <section class="carte af-carte ev-apercu" aria-labelledby="am-h-apercu">
        <div class="af-tete"><h2 id="am-h-apercu">👀 ${fs.length > 1 ? "Les affiches" : "L'affiche"}</h2></div>
        <div class="ev-formats" role="group" aria-label="Format de l'aperçu">${FORMATS.map(([k, lb, d]) => `<button type="button" class="as-fmt ${k === e.fmt ? "on" : ""}" aria-pressed="${k === e.fmt}" data-am-a="fmt" data-k="${k}" title="${d}">${lb}</button>`).join("")}</div>
        <div class="am-apercus">${fs.map(f => `<figure class="am-fig"><div class="ev-cadre" style="${fs.length > 1 ? `aspect-ratio:${F[3]}` : styleCadre(F[3])}"><img data-am-img="${f || "seul"}" class="charge" alt="Aperçu : ${nomF(f)}"></div>${fs.length > 1 ? `<figcaption>${nomF(f)}</figcaption>` : ""}</figure>`).join("")}</div>
        <p class="ev-erreur" id="am-erreur" hidden></p>
        <p class="ev-taille" id="am-taille">${F[1]} · ${F[2]}</p>
      </section>
      <section class="carte af-carte ev-message" aria-labelledby="am-h-msg">
        <div class="af-tete"><h2 id="am-h-msg">💬 Message de l'annonce</h2><small>Publié sous l'annonce · une story n'a pas de texte : tout doit être sur l'affiche</small></div>
        <textarea id="am-msg" data-am-msg aria-labelledby="am-h-msg" rows="14" maxlength="2200">${esc(e.msgs[e.type].msg)}</textarea>
        <p class="ev-libre" id="am-libre" ${e.msgs[e.type].libre ? "" : "hidden"}>✋ Message modifié à la main : il ne suit plus les matchs. ↺ pour le refaire.</p>
        <div class="btns"><button type="button" class="btn contour petit" data-am-a="msg-auto">↺ Refaire le message à partir des matchs</button>
          <button type="button" class="btn contour petit" data-am-a="msg-copier">📋 Copier</button></div>
      </section>
      <section class="carte af-carte ev-publier" aria-labelledby="am-h-pub">
        <div class="af-tete"><h2 id="am-h-pub">📣 Publier</h2><small>La bonne taille est choisie toute seule</small></div>
        <div class="ps-reseau" role="group" aria-label="Facebook"><span class="ps-reseau-nom">📘 Facebook</span><div class="af-choix-l">${opt("fb_pub", "Annonce", "Facebook")}${opt("fb_story", "Story", "Facebook")}</div></div>
        <div class="ps-reseau" role="group" aria-label="Instagram"><span class="ps-reseau-nom">📸 Instagram</span><div class="af-choix-l">${opt("ig_pub", "Annonce", "Instagram")}${opt("ig_story", "Story", "Instagram")}</div></div>
        <p class="ev-note">Annonce : dans le fil de la page, avec le message, montrée en entier (domicile et extérieur ensemble) · Story : une par feuille, plein écran pendant 24 h, sans texte.</p>
        <button type="button" class="btn bleu af-go" data-am-a="publier" ${e.enCours ? "disabled" : ""}>${esc(e.enCours || "📣 Publier maintenant")}</button>
        ${e.etat ? `<p class="af-etat" id="am-etat">${esc(e.etat)}</p>` : `<p class="af-etat" id="am-etat" hidden></p>`}
        <b class="ps-lab ev-lab">Ou les poster toi-même</b>
        <div class="ev-dl">${fs.flatMap(f => FORMATS.map(([k, lb, d]) => `<button type="button" class="btn contour petit" data-am-a="dl" data-f="${f || ""}" data-k="${k}">⬇️ ${fs.length > 1 ? (f === "dom" ? "Domicile · " : "Extérieur · ") : ""}${lb} <small>${d}</small></button>`)).join("")}</div>
      </section>
    </div></div>`;
  }

  /* ---------- aperçus (dessinés par le serveur, une requête par feuille) ---------- */
  let apT, apJeton = 0;
  const urls = {};
  function majApercus(tout){
    clearTimeout(apT);
    apT = setTimeout(async () => {
      const j = ++apJeton, e = E(), fmt = e.fmt;
      const imgs = [...document.querySelectorAll("[data-am-img]")];
      const err = document.getElementById("am-erreur");
      imgs.forEach(i => i.classList.add("charge"));
      for (const i of imgs){
        const f = i.dataset.amImg === "seul" ? null : i.dataset.amImg;
        if (T().fam === "seul" && !L().length){ i.removeAttribute("src"); i.classList.remove("charge"); continue; }
        try {
          const b = await image(f, fmt);
          if (j !== apJeton) return;
          if (urls[i.dataset.amImg]) URL.revokeObjectURL(urls[i.dataset.amImg]);
          urls[i.dataset.amImg] = URL.createObjectURL(b);
          i.src = urls[i.dataset.amImg]; i.classList.remove("charge");
          if (err) err.hidden = true;
        } catch(x){
          if (j !== apJeton) return;
          i.classList.remove("charge");
          if (err){ err.hidden = false; err.textContent = "Aperçu indisponible : " + x.message + (/403|coach|bureau/i.test(x.message) ? "" : " · vérifie que api/affiches.php est bien la dernière version."); }
        }
      }
    }, tout ? 0 : 900);
  }
  function majManques(){
    L().forEach((m, i) => {
      const z = document.querySelector(`[data-am-manque="${i}"]`); if (!z) return;
      const x = manque(m); z.hidden = !x.length; z.textContent = x.length ? `⚠️ Il manque ${x.join(" et ")} : ce match ne sera pas sur l'affiche.` : "";
    });
  }
  /* la liste des feuilles a changé (un match passe à l'extérieur…) : on redessine le panneau */
  let feuillesAvant = "";
  function apresSaisie(){
    sauver(); majManques(); majMessage();
    const f = feuilles().join(",");
    if (f !== feuillesAvant){ feuillesAvant = f; rendrePanneau(); return; }
    majApercus();
  }

  /* garder le champ en cours de saisie quand le panneau est redessiné */
  function memoFocus(){
    const a = document.activeElement;
    if (!a || !a.matches || !a.matches("#panneau [data-am], #panneau [data-am-g], #panneau [data-am-msg]")) return null;
    const sel = a.dataset.amMsg !== undefined ? "[data-am-msg]" : a.dataset.amG ? `[data-am-g="${a.dataset.amG}"]`
      : `[data-am="${a.dataset.am}"][data-i="${a.dataset.i}"]${a.dataset.j !== undefined ? `[data-j="${a.dataset.j}"]` : ""}`;
    let d = null, f = null; try { d = a.selectionStart; f = a.selectionEnd; } catch(err){}
    return { sel, d, f };
  }
  function rendreFocus(m){
    if (!m) return;
    const a = document.querySelector("#panneau " + m.sel); if (!a) return;
    a.focus({ preventScroll: true });
    try { if (m.d !== null && m.d !== undefined) a.setSelectionRange(m.d, m.f); } catch(err){}
  }

  /* ---------- reprendre les matchs connus de l'application pour ce week-end ---------- */
  function depuisCalendrier(){
    const e = E(), t = T(), sam = SAM();
    let jours;
    try { jours = typeof plage === "function" ? plage(sam) : null; } catch(err){ jours = null; }
    if (!Array.isArray(jours) || jours.length < 3){
      const j = jd(sam), ven = new Date(j); ven.setDate(j.getDate() - 1); const dim = new Date(j); dim.setDate(j.getDate() + 1);
      jours = [iso(ven), sam, iso(dim)];
    }
    const dans = m => jours.includes(m.date);
    const vet = m => /^vet-/.test(String(m.id || "")) || /v[ée]t[ée]ran/i.test(String(m.equipe || ""));
    const estFal = m => { try { return typeof EST_FAL === "function" ? EST_FAL(m) : /^(pl|fal)-/.test(String(m.id || "")); } catch(err){ return false; } };
    const joueM = m => typeof m.bp === "number" && typeof m.bc === "number";
    const tri = (a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || ""));
    const nous = a => /pierrelatte|atom'?\s*sports?/i.test(String(a || ""));
    if (t.fam === "fal"){
      const tous = [...(S.matchsAnimation || []), ...(S.matchs || []).filter(estFal)].filter(dans);
      // une fiche du favori FFF (fal-) ne sert que s'il n'y a pas déjà la fiche saisie (pl-) pour la même catégorie et le même jour
      const cleCat = m => (m.date || "") + "|" + slug(String(m.equipe || "").replace(/\s*·\s*équipe\s*/i, " "));
      const saisies = new Set(tous.filter(m => !/^fal-/.test(String(m.id || ""))).map(cleCat));
      return tous.filter(m => !/^fal-/.test(String(m.id || "")) || !saisies.has(cleCat(m))).sort(tri).slice(0, MAX).map(m => {
        const adv = (m.adversaires && m.adversaires.length ? m.adversaires : (m.participants || []).map(q => q && q.nom)).filter(a => a && !nous(a));
        return { dom: !!m.dom, equipe: String(m.equipe || CATS_FAL[0]), comp: /brassage/i.test(m.comp || "") ? "Brassage" : "Plateau",
          adv: m.dom ? "" : String(m.adv || ""), date: m.date, heure: m.heure || "", adresse: m.dom ? "" : String(m.adresse || ""), bp: "", bc: "",
          adversaires: adv.join("\n"),
          resultats: (m.resultats || []).length ? m.resultats.map(r => ({ adv: String(r.adv || ""), bp: r.bp ?? "", bc: r.bc ?? "" })) : [{ adv: "", bp: "", bc: "" }] };
      });
    }
    let l = (S.matchs || []).filter(m => dans(m) && !estFal(m) && (t.fam === "vet" ? vet(m) : !vet(m)));
    if (!t.res) l = l.filter(m => !joueM(m) || t.fam === "seul");
    else if (t.fam === "seul") l = l.filter(joueM);
    l.sort(tri);
    if (t.fam === "seul") l = t.res ? l.slice(-1) : l.slice(0, 1);
    return l.slice(0, MAX).map(m => ({ dom: !!m.dom, equipe: t.fam === "vet" ? "Vétérans" : (typeof eqDe === "function" ? eqDe(m) : m.equipe),
      comp: String(m.comp || ""), adv: String(m.adv || ""), date: m.date, heure: m.heure || "", adresse: m.dom ? "" : String(m.adresse || ""),
      bp: joueM(m) ? m.bp : "", bc: joueM(m) ? m.bc : "" }));
  }

  /* ---------- matchs automatiques : ceux des affiches du lundi, donnés par le serveur ---------- */
  const nousMeme = a => /pierrelatte|atom'?\s*sports?/i.test(String(a || ""));
  function versListe(m, t){
    const fam = TYPES[t].fam;
    const cat = String(m.equipe || "");
    const o = { dom: !!m.dom, equipe: fam === "vet" ? "Vétérans" : fam === "fal" ? (CATS_FAL.find(c => c.toUpperCase() === cat.toUpperCase()) || cat || CATS_FAL[0]) : cat,
      comp: fam === "fal" ? (/brassage/i.test(m.comp || "") ? "Brassage" : "Plateau") : String(m.comp || ""),
      adv: fam === "fal" && m.dom ? "" : String(m.adv || ""), date: m.date || "", heure: m.heure || "", adresse: m.dom ? "" : String(m.adresse || ""),
      bp: m.bp ?? "", bc: m.bc ?? "" };
    if (fam === "fal"){
      o.adversaires = (m.adversaires || []).filter(a => a && !nousMeme(a)).join("\n");
      o.resultats = (m.resultats || []).length ? m.resultats.map(r => ({ adv: String(r.adv || ""), bp: r.bp ?? "", bc: r.bc ?? "" })) : [{ adv: "", bp: "", bc: "" }];
      o.bp = o.bc = "";
    }
    return o;
  }
  // un seul match : le prochain à jouer (jour de match) ou le dernier joué (résultat)
  function choisirSeul(l, t){
    const joue = m => m.bp !== "" && m.bp !== null && m.bc !== "" && m.bc !== null;
    const tri = [...l].sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
    if (t === "score"){ const j = tri.filter(joue); return j.length ? [j[j.length - 1]] : tri.slice(-1); }
    const n = tri.filter(m => !joue(m)); return n.length ? [n[0]] : tri.slice(0, 1);
  }
  let autoJeton = 0;
  async function chargerAuto(demande){
    const e = E(), t = e.type, sam = SAM(), j = ++autoJeton;
    e.auto[t] = { samedi: sam, modifie: false, charge: true };
    if (S.ui.onglet === "affmatchs") rendrePanneau();
    let l, source = "serveur";
    try {
      const r = await fetch(api() + "/affiches.php?plan=1&type=" + encodeURIComponent(t) + "&date=" + encodeURIComponent(sam), { credentials: "same-origin", cache: "no-store" });
      const d = r.ok ? await r.json() : null;
      if (!d || !Array.isArray(d.matchs)) throw new Error("réponse " + r.status);
      l = d.matchs.map(m => versListe(m, t));
    } catch(err){ source = "app"; l = depuisCalendrier(); }                 // serveur pas à jour ou hors ligne : données de l'app
    if (j !== autoJeton) return;
    if (TYPES[t].fam === "seul") l = choisirSeul(l, t);
    e.listes[t] = l.slice(0, MAX); e.auto[t] = { samedi: sam, modifie: false, source };
    e.msgs[t] = { msg: "", libre: false };
    sauver();
    if (S.ui.onglet === "affmatchs" && e.type === t){ rendrePanneau(); majMessage(true); }
    if (demande) toast(l.length ? `${l.length} match${l.length > 1 ? "s" : ""} automatique${l.length > 1 ? "s" : ""} : ajoute ou corrige ce qui manque.` : "Aucun match automatique ce week-end : ajoute-les à la main.");
  }

  /* ---------- publication : chaque format part au bon endroit ---------- */
  async function publier(){
    const e = E(), t = T(), c = e.pub;
    const z = document.getElementById("am-msg");
    if (z && z.value !== e.msgs[e.type].msg){ e.msgs[e.type].msg = z.value; e.msgs[e.type].libre = true; }
    const texte = (z ? z.value : e.msgs[e.type].msg) || "";
    if (!L().some(m => !manque(m).length)){ toast("Ajoute au moins un match complet.", true); return; }
    if (!c.fb_pub && !c.ig_pub && !c.fb_story && !c.ig_story){ toast("Choisis où publier : annonce ou story, Facebook ou Instagram.", true); return; }
    const snap = instantane(), fs = feuilles(snap), deux = fs.length > 1;
    const envois = [], story = k => k + "_story", annonce = k => k + "_pub";
    if (c.fb_story || c.ig_story) envois.push({ fmts: fs.map(() => "story"), nom: "Story " + [c.fb_story && "Facebook", c.ig_story && "Instagram"].filter(Boolean).join(" et "), fb: c.fb_story, ig: c.ig_story, pub: false, story: true, texte, cle: story });
    if (c.fb_pub && c.ig_pub && !deux) envois.push({ fmts: ["carre"], nom: "Annonce Facebook et Instagram", fb: true, ig: true, pub: true, story: false, texte, cle: annonce });
    else {
      if (c.fb_pub) envois.push({ fmts: fs.map(() => deux ? "fb" : "carre"), nom: "Annonce Facebook", fb: true, ig: false, pub: true, story: false, texte, cle: annonce });
      if (c.ig_pub) envois.push({ fmts: fs.map(() => "carre"), nom: "Annonce Instagram", fb: false, ig: true, pub: true, story: false, texte, cle: annonce });
    }
    const quoi = deux ? "les affiches domicile et extérieur" : "l'affiche";
    if (!confirm(`Publier maintenant ${quoi} « ${t.nom} ${t.sous} » ?\n\n${envois.map(x => "• " + x.nom + (x.story ? " (sans texte)" : " (avec le message)")).join("\n")}`)) return;
    sauver();
    const bouton = () => document.querySelector('[data-am-a="publier"]');
    const dire = m => { e.enCours = m; const b = bouton(); if (b){ b.disabled = true; b.textContent = m; } };
    dire("Préparation…");
    const r = await serieDePublication({ envois, pub: e.pub, dire, preparer: async x => {
      const l = [];
      for (const [k, f] of fs.entries()) l.push(new File([await image(f, x.fmts[k], snap)], `asf-pierrelatte-${snap.type}${f ? "-" + f : ""}-${x.fmts[k]}.jpg`, { type: "image/jpeg" }));
      return l;
    } });
    e.enCours = ""; e.etat = r.etat; sauver();
    toast(r.toutBon ? "Publié." : "Publication incomplète : regarde le détail sous le bouton.", !r.toutBon);
    rendrePanneau();
  }
  async function telecharger(btn){
    const f = btn.dataset.f || null, fmt = btn.dataset.k, avant = btn.innerHTML;
    btn.disabled = true; btn.textContent = "Préparation…";
    try {
      const b = await image(f, fmt);
      enregistrerImage(b, `asf-pierrelatte-${E().type}${f ? (f === "dom" ? "-domicile" : "-exterieur") : ""}-${fmt === "story" ? "story" : fmt === "fb" ? "facebook" : "annonce"}.jpg`);
    } catch(err){ toast("Affiche indisponible : " + err.message, true); }
    btn.disabled = false; btn.innerHTML = avant;
  }

  /* ---------- branchement dans l'application ---------- */
  if (!ONGLETS.some(o => o[0] === "affmatchs")){
    const i = ONGLETS.findIndex(o => o[0] === "affiches");
    ONGLETS.splice(i < 0 ? ONGLETS.length : i + 1, 0, ["affmatchs", "Affiches matchs", "bureau", "Publication", "Affiches de matchs avec les matchs tapés à la main"]);
  }
  const com = RUBRIQUES.find(r => r[0] === "com");
  if (com && !com[3].includes("affmatchs")){
    const i = com[3].indexOf("affiches");
    com[3].splice(i < 0 ? 0 : i + 1, 0, "affmatchs");
  }
  if (typeof ICONES === "object" && ICONES) ICONES.affmatchs = "M4 4h16v16H4zM4 9h16M9 4v16M13 13h4M13 16h3";
  const peutVoir = () => { try { return typeof ongletsVisibles === "function" && ongletsVisibles().some(o => o[0] === "affmatchs"); } catch(err){ return false; } };
  function allerAffMatchs(){
    S.ui.onglet = "affmatchs"; S.ui.compo = null; S.ui.tournoi = null; S.ui.tirage = null;
    try { S.ui.derniers = { ...(S.ui.derniers || {}), [rubriqueDe("affmatchs")[0]]: "affmatchs" }; } catch(err){}
    S.ui.rubOuverte = null;
    rendreEspace(); window.scrollTo(0, 0);
  }
  const rendreAvant = window.rendrePanneau;
  window.rendrePanneau = function(){
    if (S.ui.onglet !== "affmatchs") return rendreAvant.apply(this, arguments);
    const p = document.getElementById("panneau"); if (!p) return;
    const m = memoFocus(), y = window.scrollY;
    feuillesAvant = feuilles().join(",");
    p.innerHTML = panAffMatchs();
    try { const ec = typeof encartCle === "function" && encartCle(); if (ec) p.insertAdjacentHTML("afterbegin", ec); } catch(err){}
    requestAnimationFrame(() => window.scrollTo(0, y));
    rendreFocus(m);
    const e = E(), au = e.auto[e.type];
    if (!(au && (au.charge || au.samedi === SAM())) && (!L().length || (au && !au.modifie))){ chargerAuto(false); return; }
    majApercus(true);
    if (!e.msgs[e.type].libre && !e.msgs[e.type].msg) majMessage(true);
  };
  if (typeof window.panAffiches === "function"){
    const affichesAvant = window.panAffiches;
    window.panAffiches = function(){
      const h = affichesAvant.apply(this, arguments);
      if (!S.heberge || !peutVoir()) return h;
      return `<button type="button" class="carte af-reglages ev-raccourci" data-am-a="aller"><span>🖊️</span><div><b>Affiches matchs</b><small>Rencontres, résultats, foot animation, vétérans : les matchs se mettent tout seuls, tu ajoutes ce qui manque · onglet Affiches matchs</small></div><span class="af-fl">›</span></button>` + h;
    };
  }

  /* ---------- écouteurs (attributs data-am*, à part de ceux de l'application) ---------- */
  function saisie(t){
    const e = E();
    if (t.dataset.amG){
      const k = t.dataset.amG, v = t.type === "checkbox" ? t.checked : t.value;
      if (k === "samedi"){
        if (!v || v === SAM()) return;
        e.samedis[e.type] = v; sauver();
        const a = e.auto[e.type];
        if (!L().length || !a || !a.modifie) chargerAuto(false);          // pas encore touchée : les matchs du nouveau week-end
        else { L().forEach(m => { if (!m.date) m.date = v; }); rendrePanneau(); }
        return;
      }
      if (e[k] === v) return;
      e[k] = v;
      apresSaisie(); return;
    }
    const m = L()[+t.dataset.i]; if (!m) return;
    marquer();
    const k = t.dataset.am;
    if (/^r-/.test(k)){ const r = (m.resultats || [])[+t.dataset.j]; if (!r) return; const kk = k.slice(2); if (r[kk] === t.value) return; r[kk] = t.value; }
    else { if (m[k] === t.value) return; m[k] = t.value; }
    apresSaisie();
  }
  ["input", "change"].forEach(ty => document.addEventListener(ty, ev => {
    const t = ev.target; if (!t.matches) return;
    if (t.matches("[data-am], [data-am-g]")){ saisie(t); return; }
    if (t.matches("[data-am-msg]") && ty === "input"){ const mm = E().msgs[E().type]; mm.msg = t.value; mm.libre = true; sauver(); const lb = document.getElementById("am-libre"); if (lb) lb.hidden = false; return; }
    if (t.matches("[data-am-pub]") && ty === "change"){
      E().pub[t.dataset.amPub] = t.checked;
      const l = t.closest(".af-choix"); if (l) l.classList.toggle("on", t.checked);
      sauver();
    }
  }));
  document.addEventListener("click", async ev => {
    const b = ev.target.closest && ev.target.closest("[data-am-a]"); if (!b) return;
    const a = b.dataset.amA, e = E(), l = L(), i = +b.dataset.i;
    if (a === "aller"){ allerAffMatchs(); return; }
    if (e.enCours && !["fmt", "msg-copier", "dl"].includes(a)){ if (a !== "publier") toast("Publication en cours : attends la fin.", true); return; }
    if (a === "type"){ e.type = b.dataset.k; e.etat = ""; sauver(); rendrePanneau(); return; }
    if (a === "fmt"){ e.fmt = b.dataset.k; sauver(); rendrePanneau(); return; }
    if (a === "ajout"){
      const der = l[l.length - 1];
      const m = nouveau(e.type, SAM()); marquer();
      if (der){ m.date = der.date || m.date; if (T().fam === "fal") m.equipe = der.equipe; }
      l.push(m); sauver(); rendrePanneau(); majMessage();
      setTimeout(() => { const c = document.querySelector(`[data-am-carte="${l.length - 1}"]`); if (c){ c.scrollIntoView({ behavior: "smooth", block: "center" }); const f = c.querySelector("input:not([type=date]):not([type=time]), select"); if (f) f.focus({ preventScroll: true }); } }, 60);
      return;
    }
    if (a === "suppr"){
      const m = l[i]; if (!m) return;
      const vide = !String(m.adv || "").trim() && !String(m.adversaires || "").trim() && !(m.resultats || []).some(r => String(r.adv || "").trim());
      if (!vide && !confirm("Supprimer ce match de l'affiche ?")) return;
      l.splice(i, 1); marquer(); sauver(); rendrePanneau(); majMessage(); return;
    }
    if (a === "haut" || a === "bas"){
      const j = a === "haut" ? i - 1 : i + 1; if (j < 0 || j >= l.length) return;
      [l[i], l[j]] = [l[j], l[i]]; marquer(); sauver(); rendrePanneau(); majMessage(); return;
    }
    if (a === "dom"){ const m = l[i]; if (!m) return; m.dom = b.dataset.k === "1"; marquer(); sauver(); rendrePanneau(); majMessage(); return; }
    if (a === "r-ajout"){ const m = l[i]; if (!m) return; (m.resultats = m.resultats || []).push({ adv: "", bp: "", bc: "" }); marquer(); sauver(); rendrePanneau(); return; }
    if (a === "r-suppr"){ const m = l[i]; if (!m) return; (m.resultats || []).splice(+b.dataset.j, 1); if (!m.resultats.length) m.resultats.push({ adv: "", bp: "", bc: "" }); marquer(); sauver(); rendrePanneau(); majMessage(); return; }
    if (a === "reprendre"){
      const au = e.auto[e.type];
      if (l.length && (!au || au.modifie) && !confirm("Remplacer ta liste par les matchs automatiques du week-end ?")) return;
      await chargerAuto(true); return;
    }
    if (a === "vider"){
      if (!confirm("Effacer tous les matchs de cette affiche ?")) return;
      e.listes[e.type] = []; e.msgs[e.type] = { msg: "", libre: false }; e.etat = ""; marquer(); sauver(); rendrePanneau(); return;
    }
    if (a === "msg-auto"){
      if (e.msgs[e.type].libre && !confirm("Remplacer le message écrit à la main par un message refait à partir des matchs ?")) return;
      e.msgs[e.type].libre = false; majMessage(true); return;
    }
    if (a === "msg-copier"){
      const z = document.getElementById("am-msg");
      try { await navigator.clipboard.writeText(z ? z.value : ""); toast("Message copié"); } catch(err){ if (z) z.select(); toast("Sélectionne le texte et copie-le"); }
      return;
    }
    if (a === "dl"){ await telecharger(b); return; }
    if (a === "publier"){ if (!e.enCours) await publier(); return; }
  });

  /* ---------- styles ---------- */
  const css = document.createElement("style");
  css.id = "affiches-matchs-css";
  css.textContent = `
.am-types{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.am-types .ev-type small{font:600 12.5px var(--corps);color:var(--texte-doux)}
.am-haut{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;margin-bottom:14px}
.am-haut label{display:flex;flex-direction:column;gap:6px}
.am-liste{display:grid;gap:12px}
.am-vide{margin:0}
.am-source{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:rgba(143,168,240,.1);font:600 14px var(--corps)}
.am-match{border:1px solid var(--ligne);border-radius:14px;padding:12px;background:var(--fond)}
.am-match-tete{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.am-match-tete > b{font:800 16px var(--corps);margin-right:auto}
.am-lieu{display:flex;gap:6px;flex-wrap:wrap}
.am-ordre{display:flex;gap:4px}
.am-champs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.am-champs label{display:flex;flex-direction:column;gap:6px;min-width:0}
.am-champs .am-plein{grid-column:1/-1}
.am-score{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}
.am-score input[type=number]{width:64px;text-align:center;font-weight:800}
.am-score input:not([type]){flex:1 1 160px;min-width:0}
.am-score-match span{font-weight:700}
.am-manque{margin:10px 0 0;padding:8px 10px;border-radius:10px;background:rgba(232,131,58,.14);font-size:14px}
.am-manque[hidden]{display:none}
.am-ajout{width:100%;margin-top:12px}
.am-options{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;margin-top:16px;padding-top:14px;border-top:1px solid var(--ligne)}
.am-options label:first-child{display:flex;flex-direction:column;gap:6px;flex:1 1 220px}
.am-apercus{display:grid;gap:12px}
.ev-publier #am-etat{white-space:pre-line}
.am-apercus:has(.am-fig + .am-fig){grid-template-columns:1fr 1fr}
.am-fig{margin:0}
.am-fig figcaption{text-align:center;font:700 13px var(--corps);margin-top:6px;color:var(--texte-doux)}
@media (max-width:560px){
  .am-types{grid-template-columns:repeat(2,minmax(0,1fr))}
  .am-champs{grid-template-columns:minmax(0,1fr)}
}`;
  document.head.appendChild(css);
})();
