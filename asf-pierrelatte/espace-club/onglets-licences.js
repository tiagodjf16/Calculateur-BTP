/* Suivi des licences : tous les licenciés du club (ceux des effectifs) avec l'état de leur licence et leur paiement,
   modifiables à la main en un appui.
   - Données : sur chaque joueur des documents effectifs/… (lus par les coachs et le bureau seulement, jamais par le public) :
     licEtat ("validee" | "incomplete" | "attente" | "aucune"), licPaie ("payee" | "partiel" | "non"), licVerse (€ déjà versés),
     licNote (ce qui manque), licMaj (date du dernier changement).
   - Onglet « Suivi des licences » dans Mes équipes : compteurs (à vérifier, à compléter, pas payées…), recherche, filtre par
     équipe, fiche de chaque licence, ajout d'une licence à la main, export CSV pour les relances. Un coach ne voit que ses équipes.
   - Import Footclubs (onglet Effectifs) : lit aussi l'état et le paiement quand le fichier a ces colonnes (sinon on choisit
     « validées » ou « en cours » pour tout le fichier), met à jour les joueurs déjà là au lieu de les ignorer, et range
     l'école de foot en U6 · U7, U8 · U9 et U10 · U11.
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONGLETS === "undefined" || typeof RUBRIQUES === "undefined" || typeof ONG === "undefined") return;
  const e = ONG.e;
  const K = "suivi-licences";
  const ETATS = [["validee", "Validée", "✅"], ["incomplete", "Incomplète", "🟠"], ["attente", "En attente", "⏳"], ["aucune", "Pas de licence", "⛔"]];
  const PAIES = [["payee", "Payée", "💶"], ["partiel", "En partie", "🟡"], ["non", "Pas payée", "🔴"]];
  const libEtat = k => (ETATS.find(x => x[0] === k) || ["", "À vérifier", "❔"]);
  const libPaie = k => (PAIES.find(x => x[0] === k) || ["", "Paiement ?", "❔"]);
  const euros = v => { const n = +v; return isFinite(n) && n > 0 ? (Math.round(n * 100) / 100).toLocaleString("fr-FR") + " €" : ""; };
  const chiffres = v => String(v || "").replace(/\D/g, "").slice(0, 12);
  const sansAccent = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  /* ---------------- l'onglet ---------------- */
  if (!ONGLETS.some(o => o[0] === K)){
    const i = ONGLETS.findIndex(o => o[0] === "effectifs");
    ONGLETS.splice(i < 0 ? ONGLETS.length : i + 1, 0, [K, "Suivi des licences", "entraineur", "Mon équipe", "Toutes les licences : état du dossier et paiement"]);
  }
  const rub = RUBRIQUES.find(r => r[0] === "equipes");
  if (rub && !rub[3].includes(K)){
    const i = rub[3].indexOf("effectifs");
    rub[3].splice(i < 0 ? rub[3].length : i + 1, 0, K);
    rub[4] = "Compos, entraînements, effectifs et licences";
  }
  if (typeof ICONES === "object" && ICONES) ICONES[K] = "M5 3h10l4 4v14H5zM15 3v4h4M8.5 12.5l2 2 4-4.5M8 18h8";

  /* ---------------- données ---------------- */
  const docs = () => Object.entries(S.effectifs || {}).filter(([, d]) => d && Array.isArray(d.joueurs));
  const mesEquipes = () => { try { return peutBureau() ? null : equipesAutorisees(); } catch(err){ return null; } };
  function licences(){
    const autor = mesEquipes(), out = [], vus = new Set();
    docs().forEach(([cle, d]) => {
      const eq = d.equipe || cle;
      if (autor && !autor.includes(eq)) return;
      (d.joueurs || []).forEach(j => { if (!j || !j.nom || vus.has(cle + "|" + j.id)) return; vus.add(cle + "|" + j.id); out.push({ cle, equipe: eq, j }); });
    });
    return out;
  }
  /* ordre des équipes : seniors, féminines, puis les jeunes du plus grand au plus petit, vétérans, le reste */
  const ordreEq = n => { const s = String(n || ""), m = s.match(/^U\s?(\d+)/i);
    return /^s[ée]nior/i.test(s) ? "0" + s : /f[ée]minin/i.test(s) ? "1" + s : m ? "2" + String(100 - +m[1]).padStart(3, "0") + s : /v[ée]t[ée]ran/i.test(s) ? "8" + s : "9" + s; };
  /* écritures d'un même document l'une après l'autre (deux appuis rapides ne s'écrasent pas) */
  const files = new Map();
  function majDoc(cle, fn){
    const p = (files.get(cle) || Promise.resolve()).then(async () => {
      const d = (S.effectifs || {})[cle] || { equipe: cle, joueurs: [] };
      const doc = fn({ ...d, joueurs: [...(d.joueurs || [])] }); if (!doc) return false;
      const ok = await ecrire(() => S.db.doc("effectifs/" + cle).set({ ...doc, joueurs: doc.joueurs }));
      if (ok) S.effectifs = { ...(S.effectifs || {}), [cle]: doc };
      return ok;
    });
    files.set(cle, p.catch(() => {}));
    return p;
  }
  const aujourdhuiIso = () => new Date().toISOString().slice(0, 10);
  async function majJoueur(cle, id, patch, message){
    const ok = await majDoc(cle, d => ({ ...d, joueurs: d.joueurs.map(j => j.id === id ? { ...j, ...patch, licMaj: aujourdhuiIso() } : j) }));
    if (ok && message) toast(message);
    if (S.ui.onglet === K) rendrePanneau();
    return ok;
  }

  /* ---------------- dessin de l'onglet ---------------- */
  const FILTRES = [
    ["tous", "Toutes", () => true],
    ["verifier", "À vérifier", x => !x.j.licEtat],
    ["afaire", "À compléter", x => x.j.licEtat === "incomplete" || x.j.licEtat === "attente"],
    ["validee", "Validées", x => x.j.licEtat === "validee"],
    ["nonpaye", "Pas payées", x => x.j.licPaie === "non"],
    ["partiel", "Payées en partie", x => x.j.licPaie === "partiel"],
    ["sansnum", "Sans numéro", x => !chiffres(x.j.licence)],
  ];
  const cleCherche = x => sansAccent(`${x.j.nom} ${x.j.licence || ""} ${x.equipe} ${x.j.licNote || ""}`);
  const AIDE = `<ol>
      <li><b>Toutes les licences du club</b> sont ici : celles des effectifs de chaque équipe.</li>
      <li>Touche une personne pour changer <b>l'état de sa licence</b> (validée, incomplète, en attente) et <b>son paiement</b>
        (payée, en partie avec le montant déjà versé, pas payée). Chaque appui s'enregistre tout de suite.</li>
      <li>Les pastilles du haut trient la liste : <b>À compléter</b> et <b>Pas payées</b> pour savoir qui relancer.
        <b>Exporter</b> donne la liste (Excel) pour les relances.</li>
      <li>Pour remplir d'un coup : <b>Importer depuis Footclubs</b> (onglet Effectifs). Les joueurs déjà là sont mis à jour.</li></ol>
    <p>Le numéro de licence ouvre l'espace joueur de la personne.</p>`;
  function ligne(x, ouvert){
    const j = x.j, et = libEtat(j.licEtat), pa = libPaie(j.licPaie), num = chiffres(j.licence), cle = `${x.cle}|${j.id}`;
    const verse = euros(j.licVerse);
    return `<details class="lic-l" data-lic-cle="${e(x.cle)}" data-lic-id="${e(j.id)}" data-cherche="${e(cleCherche(x))}" ${ouvert === cle ? "open" : ""}>
      <summary><span class="lic-nom"><b>${e(j.nom)}</b><small>${e(x.equipe)} · ${num ? "N° " + e(num) : "<i>pas de numéro</i>"}</small></span>
        <span class="lic-badges"><span class="lic-b e-${e(j.licEtat || "x")}">${et[2]} ${e(et[1])}</span>
        <span class="lic-b p-${e(j.licPaie || "x")}">${pa[2]} ${e(j.licPaie === "partiel" && verse ? verse + " versés" : pa[1])}</span></span>
        <span class="lic-fl" aria-hidden="true">▾</span></summary>
      <div class="lic-edit">
        <div class="lic-ch"><span class="lic-ch-t">État de la licence</span><div class="lic-seg" role="group" aria-label="État de la licence">
          ${ETATS.map(([k, l, ic]) => `<button type="button" data-lic-etat="${k}" aria-pressed="${j.licEtat === k}">${ic} ${l}</button>`).join("")}</div></div>
        <div class="lic-ch"><span class="lic-ch-t">Paiement</span><div class="lic-seg" role="group" aria-label="Paiement">
          ${PAIES.map(([k, l, ic]) => `<button type="button" data-lic-paie="${k}" aria-pressed="${j.licPaie === k}">${ic} ${l}</button>`).join("")}</div></div>
        <div class="lic-champs">
          <label>Déjà versé (€)<input type="number" min="0" step="1" inputmode="decimal" data-lic-champ="licVerse" value="${e(j.licVerse || "")}" placeholder="0"></label>
          <label>N° de licence<input inputmode="numeric" autocomplete="off" maxlength="14" data-lic-champ="licence" value="${e(num)}" placeholder="10 chiffres"></label>
          <label class="lic-note">Ce qui manque, remarque<input data-lic-champ="licNote" maxlength="160" value="${e(j.licNote || "")}" placeholder="Ex. : certificat médical, photo, 2e chèque…"></label>
        </div>
        ${j.licMaj ? `<p class="lic-maj">Modifié le ${e(String(j.licMaj).split("-").reverse().join("/"))}</p>` : ""}
      </div></details>`;
  }
  function panSuivi(){
    const u = S.ui.lic = S.ui.lic || { filtre: "tous", eq: "", q: "", ouvert: "" };
    const tout = licences();
    const eqs = [...new Set(tout.map(x => x.equipe))].sort((a, b) => ordreEq(a).localeCompare(ordreEq(b)));
    if (u.eq && !eqs.includes(u.eq)) u.eq = "";
    const dansEq = tout.filter(x => !u.eq || x.equipe === u.eq);
    const f = FILTRES.find(x => x[0] === u.filtre) || FILTRES[0];
    const l = dansEq.filter(f[2]).sort((a, b) => ordreEq(a.equipe).localeCompare(ordreEq(b.equipe)) || String(a.j.nom).localeCompare(String(b.j.nom)));
    const n = k => dansEq.filter(FILTRES.find(x => x[0] === k)[2]).length;
    const verse = dansEq.reduce((s, x) => s + (+x.j.licVerse > 0 && x.j.licPaie !== "payee" ? +x.j.licVerse : 0), 0);
    const parEq = new Map(); l.forEach(x => { if (!parEq.has(x.equipe)) parEq.set(x.equipe, []); parEq.get(x.equipe).push(x); });
    const liste = l.length ? [...parEq].map(([eq, xs]) => `<section class="lic-groupe"><h3>${e(eq)} <span>${xs.length}</span></h3>${xs.map(x => ligne(x, u.ouvert)).join("")}</section>`).join("")
      : ONG.vide(tout.length ? "Personne dans ce tri" : "Aucune licence pour l'instant", tout.length ? "Choisis une autre pastille ou une autre équipe."
        : "Importe la liste depuis Footclubs (onglet Effectifs), ou ajoute une licence à la main.", `<button type="button" class="btn bleu" data-lic-import>📥 Importer depuis Footclubs</button>`);
    const opt = eqs.map(q => `<option ${q === u.eq ? "selected" : ""}>${e(q)}</option>`).join("");
    const eqAjout = (() => { let l2 = []; try { l2 = mesEquipes() || toutesEquipes(); } catch(err){} return [...new Set([...l2, ...eqs])].filter(q => !/^u6 à u11$/i.test(q)).sort((a, b) => ordreEq(a).localeCompare(ordreEq(b))); })();
    const ajout = ONG.pli("lic-ajout", "Ajouter une licence à la main", `<form class="lic-ajout" data-lic-ajout>
        <label>Prénom et NOM<input name="nom" required placeholder="Lucas MARTIN"></label>
        <label>Équipe<select name="equipe" required>${eqAjout.map(q => `<option ${q === u.eq ? "selected" : ""}>${e(q)}</option>`).join("")}</select></label>
        <label>N° de licence<input name="licence" inputmode="numeric" maxlength="14" placeholder="si tu l'as"></label>
        <label>État<select name="licEtat">${ETATS.map(([k, l2]) => `<option value="${k}" ${k === "attente" ? "selected" : ""}>${l2}</option>`).join("")}</select></label>
        <label>Paiement<select name="licPaie">${PAIES.map(([k, l2]) => `<option value="${k}" ${k === "non" ? "selected" : ""}>${l2}</option>`).join("")}</select></label>
        <label>Déjà versé (€)<input name="licVerse" type="number" min="0" step="1" inputmode="decimal" placeholder="0"></label>
        <div class="lic-ajout-bt"><button class="btn bleu">Ajouter</button></div></form>`, false, "+");
    return `<div class="ong-lic">
      ${ONG.aide("lic-aide", "Comment ça marche ?", AIDE)}
      ${ONG.barre("Suivi des licences", `${tout.length} licence${tout.length > 1 ? "s" : ""}${mesEquipes() ? " dans tes équipes" : " au club"}${verse ? ` · ${euros(verse)} déjà versés sur les paiements en cours` : ""}`,
        `<button type="button" class="btn contour" data-lic-csv>⬇ Exporter</button><button type="button" class="btn bleu" data-lic-import>📥 Importer depuis Footclubs</button>`)}
      <div class="lic-filtres" role="group" aria-label="Trier les licences">${FILTRES.map(([k, l2]) => `<button type="button" class="acc-chip ${u.filtre === k ? "on" : ""}" data-lic-filtre="${k}">${l2}<span>${n(k)}</span></button>`).join("")}</div>
      <div class="lic-outils"><label class="lic-cherche"><span aria-hidden="true">🔍</span><input type="search" data-lic-q placeholder="Chercher un nom, un numéro…" value="${e(u.q)}" aria-label="Chercher une licence"></label>
        ${eqs.length > 1 ? `<label class="lic-eq"><span class="sr">Équipe</span><select data-lic-eq aria-label="Équipe"><option value="">Toutes les équipes</option>${opt}</select></label>` : ""}</div>
      ${ajout}
      <div class="lic-liste">${liste}</div>
      <p class="lic-rien" hidden>Aucune licence ne correspond à la recherche.</p>
    </div>`;
  }
  const rendreAvant = window.rendrePanneau;
  window.rendrePanneau = function(){
    if (S.ui.onglet !== K) return rendreAvant.apply(this, arguments);
    const p = document.getElementById("panneau"); if (!p) return;
    const y = window.scrollY, foc = document.activeElement && document.activeElement.matches && document.activeElement.matches("[data-lic-q]");
    p.innerHTML = panSuivi();
    try { const ec = typeof encartCle === "function" && encartCle(); if (ec) p.insertAdjacentHTML("afterbegin", ec); } catch(err){}
    filtrerRecherche();
    requestAnimationFrame(() => window.scrollTo(0, y));
    if (foc){ const i = p.querySelector("[data-lic-q]"); if (i){ i.focus(); const v = i.value; i.value = ""; i.value = v; } }
  };
  function filtrerRecherche(){
    const p = document.getElementById("panneau"); if (!p || S.ui.onglet !== K) return;
    const q = sansAccent((S.ui.lic || {}).q || "").trim();
    let n = 0;
    p.querySelectorAll(".lic-groupe").forEach(g => {
      let m = 0; g.querySelectorAll(".lic-l").forEach(d => { const ok = !q || d.dataset.cherche.includes(q); d.hidden = !ok; if (ok) m++; });
      g.hidden = !m; n += m;
    });
    const rien = p.querySelector(".lic-rien"); if (rien) rien.hidden = !(q && !n && p.querySelector(".lic-groupe"));
  }

  /* ---------------- gestes ---------------- */
  const ligneDe = el => el.closest(".lic-l");
  document.addEventListener("click", async ev => {
    const t = ev.target; if (!t || !t.closest || S.ui.onglet !== K) return;
    const u = S.ui.lic = S.ui.lic || { filtre: "tous", eq: "", q: "", ouvert: "" };
    const fb = t.closest("[data-lic-filtre]");
    if (fb){ u.filtre = fb.dataset.licFiltre; rendrePanneau(); return; }
    if (t.closest("[data-lic-import]")){
      S.ui.onglet = "effectifs"; S.ui.effOuvert = "import"; S.ui.importLic = null;
      try { S.ui.derniers = { ...(S.ui.derniers || {}), equipes: "effectifs" }; } catch(err){}
      rendreEspace(); window.scrollTo(0, 0); return;
    }
    if (t.closest("[data-lic-csv]")){ exporter(); return; }
    const be = t.closest("[data-lic-etat]"), bp = t.closest("[data-lic-paie]");
    if (be || bp){
      const d = ligneDe(t); if (!d) return;
      u.ouvert = `${d.dataset.licCle}|${d.dataset.licId}`;
      const patch = be ? { licEtat: be.dataset.licEtat } : { licPaie: bp.dataset.licPaie };
      if (bp && bp.dataset.licPaie === "non") patch.licVerse = "";
      be ? be.setAttribute("aria-pressed", "true") : bp.setAttribute("aria-pressed", "true");
      await majJoueur(d.dataset.licCle, d.dataset.licId, patch, be ? `Licence : ${libEtat(patch.licEtat)[1].toLowerCase()}.` : `Paiement : ${libPaie(patch.licPaie)[1].toLowerCase()}.`);
    }
  });
  document.addEventListener("toggle", ev => {
    const d = ev.target; if (!d || !d.matches || !d.matches(".lic-l")) return;
    const u = S.ui.lic = S.ui.lic || {}; const cle = `${d.dataset.licCle}|${d.dataset.licId}`;
    if (d.open) u.ouvert = cle; else if (u.ouvert === cle) u.ouvert = "";
  }, true);
  document.addEventListener("input", ev => {
    const t = ev.target; if (!t || !t.matches || !t.matches("[data-lic-q]")) return;
    (S.ui.lic = S.ui.lic || {}).q = t.value; filtrerRecherche();
  });
  document.addEventListener("change", async ev => {
    const t = ev.target; if (!t || !t.matches || S.ui.onglet !== K) return;
    if (t.matches("[data-lic-eq]")){ (S.ui.lic = S.ui.lic || {}).eq = t.value; rendrePanneau(); return; }
    if (t.matches("[data-lic-champ]")){
      const d = ligneDe(t); if (!d) return;
      const k = t.dataset.licChamp; let v = t.value.trim();
      if (k === "licence"){ v = chiffres(v); if (v && v.length < 6){ toast("Numéro de licence trop court : des chiffres (10 en général).", true); return; } }
      if (k === "licVerse"){ v = v === "" ? "" : Math.max(0, Math.round(+v.replace(",", ".") * 100) / 100); if (v !== "" && !isFinite(v)) return; }
      const patch = { [k]: v };
      // un montant versé : le paiement passe « en partie » (sauf s'il est déjà noté payé)
      if (k === "licVerse" && v > 0){ const j = ((S.effectifs || {})[d.dataset.licCle] || { joueurs: [] }).joueurs.find(x => x.id === d.dataset.licId); if (j && j.licPaie !== "payee") patch.licPaie = "partiel"; }
      S.ui.lic.ouvert = `${d.dataset.licCle}|${d.dataset.licId}`;
      await majJoueur(d.dataset.licCle, d.dataset.licId, patch, k === "licence" ? "Numéro de licence enregistré." : k === "licVerse" ? "Montant enregistré." : "Remarque enregistrée.");
    }
  });
  document.addEventListener("submit", async ev => {
    const f = ev.target; if (!f || !f.matches || !f.matches("[data-lic-ajout]")) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    const d = Object.fromEntries(new FormData(f)), nom = String(d.nom || "").trim().replace(/\s+/g, " "), eq = String(d.equipe || "").trim();
    if (nom.length < 3 || !eq){ toast("Indique le prénom, le nom et l'équipe.", true); return; }
    const num = chiffres(d.licence);
    const deja = licences().find(x => (num && chiffres(x.j.licence) === num) || slug(x.j.nom) === slug(nom));
    if (deja){ toast(`${deja.j.nom} est déjà dans ${deja.equipe} : modifie sa licence dans la liste.`, true); return; }
    const cle = (docs().find(([, x]) => x.equipe === eq) || [slug(eq)])[0];
    const j = { id: uid(), nom, num: "", poste: "", licence: num, age: 0, sexe: "", licEtat: d.licEtat || "attente", licPaie: d.licPaie || "non",
      licVerse: +d.licVerse > 0 ? +d.licVerse : "", licMaj: aujourdhuiIso() };
    try { const a = ageEquipe(eq); if (a) j.age = a; } catch(err){}
    const ok = await majDoc(cle, x => ({ ...x, equipe: x.equipe || eq, joueurs: [...x.joueurs, j] }));
    if (ok){ toast(`${nom} ajouté à ${eq}.`); S.ui.lic.ouvert = `${cle}|${j.id}`; rendrePanneau(); }
  }, true);

  function exporter(){
    const l = licences().sort((a, b) => ordreEq(a.equipe).localeCompare(ordreEq(b.equipe)) || String(a.j.nom).localeCompare(String(b.j.nom)));
    const cel = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const csv = "﻿" + [["Équipe", "Nom", "N° de licence", "État", "Paiement", "Déjà versé (€)", "Ce qui manque", "Modifié le"].map(cel).join(";"),
      ...l.map(x => [x.equipe, x.j.nom, chiffres(x.j.licence), x.j.licEtat ? libEtat(x.j.licEtat)[1] : "À vérifier", x.j.licPaie ? libPaie(x.j.licPaie)[1] : "",
        x.j.licVerse || "", x.j.licNote || "", x.j.licMaj ? String(x.j.licMaj).split("-").reverse().join("/") : ""].map(cel).join(";"))].join("\n");
    try { S.downloads.save({ filename: `licences-asf-pierrelatte-${aujourdhuiIso()}.csv`, data: csv }); toast("Liste exportée."); }
    catch(err){ toast("Export impossible ici.", true); }
  }

  /* =====================================================================================
     Import Footclubs (onglet Effectifs) : état, paiement, mises à jour, école de foot
     ===================================================================================== */
  // l'école de foot en trois équipes (U6 · U7, U8 · U9, U10 · U11), comme dans « Accès et rôles »
  try { if (typeof REPARTITION_LIC === "object"){ REPARTITION_LIC.U7 = "U6 · U7"; REPARTITION_LIC.U9 = "U8 · U9"; REPARTITION_LIC.U11 = "U10 · U11"; } } catch(err){}
  const estEcoleTout = n => /^\s*u\s?6\s*(à|a|-)\s*u\s?11\s*$/i.test(String(n || ""));

  /* ce que dit une case « état » ou « paiement » du fichier */
  function lireEtat(v){
    const s = sansAccent(v).trim(); if (!s) return "";
    if (/refus|annul|aucune|sans licence/.test(s)) return "aucune";
    if (/incomplet|complet(er)?\b|manqu|piece|certificat|photo|justif|bloqu/.test(s)) return "incomplete";
    if (/non valid|a valider|attente|en cours|saisi|transmis|envoy|demand|instruction|signature/.test(s)) return "attente";
    if (/valid|accept|qualifi|delivr|edit|imprim|active|ok\b/.test(s)) return "validee";
    return "";
  }
  function lirePaie(v){
    const s = sansAccent(v).trim(); if (!s) return null;
    const m = s.replace(/\s/g, "").replace(",", ".").match(/^(\d+(\.\d+)?)€?$/);
    if (m){ const n = +m[1]; return n > 0 ? { licPaie: "partiel", licVerse: n } : { licPaie: "non", licVerse: "" }; }
    if (/non|impay|aucun|a payer|en attente|^0/.test(s)) return { licPaie: "non" };
    if (/partiel|en partie|acompte|reste|echeanc|1\/|2\//.test(s)) return { licPaie: "partiel" };
    if (/pay|regl|solde|oui|ok|encaiss|complet/.test(s)) return { licPaie: "payee" };
    return null;
  }
  /* on relit le même fichier pour y trouver les colonnes « état » et « paiement » (l'application ne les garde pas) */
  async function lignesDu(f){
    if (/\.xlsx?$/i.test(f.name)){
      if (!window.XLSX) await new Promise((ok, ko) => { const s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
    }
    const txt = await f.text();
    const sep = (txt.split("\n")[0].match(/;/g) || []).length ? ";" : (txt.includes("\t") ? "\t" : ",");
    return txt.split(/\r?\n/).map(l => l.split(sep).map(c => c.replace(/^"|"$/g, "").trim()));
  }
  window.addEventListener("change", async ev => {
    const t = ev.target; if (!t || !t.matches || !t.matches("[data-fichier-licencies]")) return;
    const f = t.files && t.files[0]; S.ui.importPlus = null; if (!f) return;
    try {
      const lignes = await lignesDu(f);
      const iTete = lignes.findIndex(r => (r || []).some(c => /^nom\b/i.test(String(c || "").trim()))); if (iTete < 0) return;
      const tete = lignes[iTete].map(c => sansAccent(c));
      const col = re => tete.findIndex(c => re.test(c));
      const cNom = col(/^nom/); let cPre = col(/^prenom/); if (cPre === cNom) cPre = -1;
      let cNum = col(/numero\s*(de\s*)?licence/); if (cNum < 0) cNum = tete.findIndex(c => /licence|num/.test(c) && !/type|statut|etat/.test(c));
      const cEtat = col(/statut|etat|validation|situation/), cPaie = col(/paie|pay|regl|cotis|montant|verse|solde|reste/);
      const parNum = {}, parNom = {};
      lignes.slice(iTete + 1).forEach(r => {
        if (!r || !r[cNom]) return;
        const v = {};
        if (cEtat >= 0){ const x = lireEtat(r[cEtat]); if (x) v.licEtat = x; }
        if (cPaie >= 0){ const x = lirePaie(r[cPaie]); if (x) Object.assign(v, x); }
        if (!Object.keys(v).length) return;
        const num = cNum >= 0 ? chiffres(r[cNum]) : "";
        if (num) parNum[num] = v;
        const nom = String(r[cNom]).trim(), pre = cPre >= 0 ? String(r[cPre] || "").trim() : "";
        [`${pre} ${nom}`, `${nom} ${pre}`, nom].forEach(n => { if (n.trim()) parNom[slug(n)] = v; });
      });
      S.ui.importPlus = { colEtat: cEtat >= 0 ? lignes[iTete][cEtat] : "", colPaie: cPaie >= 0 ? lignes[iTete][cPaie] : "", parNum, parNom };
      if (S.ui.onglet === "effectifs") setTimeout(() => { if (S.ui.importLic) rendrePanneau(); }, 60);
    } catch(err){ S.ui.importPlus = null; }
  }, true);
  const plusDe = x => {
    const p = S.ui.importPlus || {};
    const lu = (x.licence && p.parNum && p.parNum[chiffres(x.licence)]) || (p.parNom && p.parNom[slug(x.nom)]) || null;
    if (lu) return lu;
    const choix = S.ui.importEtat || "";
    return choix ? { licEtat: choix } : {};
  };

  /* l'aperçu de l'import : ce qui sera lu ou appliqué pour l'état des licences */
  if (typeof window.panEffectifs === "function"){
    const effAvant = window.panEffectifs;
    window.panEffectifs = function(){
      const h = effAvant.apply(this, arguments);
      if (!S.ui.importLic) return h;
      return ONG.transformer(h, racine => {
        const bt = racine.querySelector('[data-a="repartir-import-lic"]'); if (!bt) return;
        const p = S.ui.importPlus || {}, choix = S.ui.importEtat || "";
        const lu = p.colEtat || p.colPaie;
        const bloc = document.createElement("div"); bloc.className = "lic-import";
        bloc.innerHTML = `<b>🎫 État des licences</b>
          ${lu ? `<p>Lu dans le fichier : ${[p.colEtat ? `état (colonne « ${e(p.colEtat)} »)` : "", p.colPaie ? `paiement (colonne « ${e(p.colPaie)} »)` : ""].filter(Boolean).join(" et ")}.</p>` : ""}
          <label>${lu ? "Pour les lignes sans état" : "Les licences de ce fichier sont"}<select data-import-etat>
            <option value="" ${!choix ? "selected" : ""}>Ne pas changer leur état</option>
            <option value="validee" ${choix === "validee" ? "selected" : ""}>✅ Validées</option>
            <option value="attente" ${choix === "attente" ? "selected" : ""}>⏳ En cours (pas encore validées)</option>
            <option value="incomplete" ${choix === "incomplete" ? "selected" : ""}>🟠 Incomplètes</option></select></label>
          <p class="lic-import-n">Les joueurs déjà dans l'appli sont mis à jour (numéro, catégorie, état, paiement) ; l'école de foot va en U6 · U7, U8 · U9 et U10 · U11. Tu pourras tout corriger dans « Suivi des licences ».</p>`;
        bt.before(bloc);
      });
    };
  }
  document.addEventListener("change", ev => {
    const t = ev.target; if (!t || !t.matches || !t.matches("[data-import-etat]")) return;
    S.ui.importEtat = t.value;
  });

  /* « Répartir les licenciés dans leurs équipes » : ajoute les nouveaux, met à jour ceux qui sont déjà là */
  window.addEventListener("click", async ev => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-a="repartir-import-lic"]');
    if (!b || !S.ui.importLic) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (b.disabled) return; b.disabled = true;
    try { await importer(S.ui.importLic); } finally { b.disabled = false; }
  }, true);
  async function importer(l){
    const cibleDe = x => REPARTITION_LIC[x.cat] || x.cat || "Sans équipe";
    // copie de travail de tous les documents d'effectifs
    const travail = {}; docs().forEach(([cle, d]) => { travail[cle] = { ...d, joueurs: [...(d.joueurs || [])] }; });
    const cleEq = eq => (Object.entries(travail).find(([, d]) => d.equipe === eq) || [slug(eq)])[0];
    const changes = new Set();
    let ajoutes = 0, maj = 0, deplaces = 0;
    for (const x of l){
      const num = chiffres(x.licence), extra = plusDe(x), cible = cibleDe(x);
      let ou = null;
      for (const [cle, d] of Object.entries(travail)){
        const i = d.joueurs.findIndex(j => j && ((num && chiffres(j.licence) === num) || slug(j.nom || "") === slug(x.nom)));
        if (i >= 0){ ou = [cle, i]; break; }
      }
      if (ou){
        const [cle, i] = ou, d = travail[cle], j = d.joueurs[i];
        const nv = { ...j };
        if (num && !chiffres(j.licence)) nv.licence = num;
        if (!j.age && x.age) nv.age = x.age;
        if (!j.sexe && x.sexe) nv.sexe = x.sexe;
        Object.assign(nv, extra);
        const change = JSON.stringify(nv) !== JSON.stringify(j);
        // un enfant de l'ancienne équipe « U6 à U11 » passe dans sa nouvelle équipe (U6 · U7, U8 · U9 ou U10 · U11)
        if (estEcoleTout(d.equipe) && cible !== d.equipe && /^U(6|8|10) · U(7|9|11)$/.test(cible)){
          d.joueurs.splice(i, 1); changes.add(cle);
          const c2 = cleEq(cible); travail[c2] = travail[c2] || { equipe: cible, joueurs: [] };
          travail[c2].joueurs.push(change ? { ...nv, licMaj: aujourdhuiIso() } : nv); changes.add(c2); deplaces++;
        } else if (change){ d.joueurs[i] = { ...nv, licMaj: aujourdhuiIso() }; changes.add(cle); maj++; }
      } else {
        const c2 = cleEq(cible); travail[c2] = travail[c2] || { equipe: cible, joueurs: [] };
        travail[c2].joueurs.push({ id: uid(), nom: x.nom, num: "", poste: "", licence: num, age: x.age || 0, sexe: x.sexe || "", ...extra, ...(Object.keys(extra).length ? { licMaj: aujourdhuiIso() } : {}) });
        changes.add(c2); ajoutes++;
      }
    }
    for (const cle of changes){
      const doc = travail[cle];
      const ok = await ecrire(() => S.db.doc("effectifs/" + cle).set({ ...doc, joueurs: doc.joueurs }));
      if (!ok){ toast("Enregistrement refusé : vérifie ta connexion.", true); return; }
      S.effectifs = { ...(S.effectifs || {}), [cle]: doc };
    }
    let nDates = 0; try { nDates = await envoyerNaissances(l); } catch(err){}
    S.ui.importLic = null; S.ui.importCat = null; S.ui.importPlus = null;
    const morceaux = [ajoutes ? `${ajoutes} licencié${ajoutes > 1 ? "s" : ""} ajouté${ajoutes > 1 ? "s" : ""}` : "", maj ? `${maj} mis à jour` : "",
      deplaces ? (deplaces > 1 ? `${deplaces} enfants rangés dans leur équipe de l'école de foot` : "1 enfant rangé dans son équipe de l'école de foot") : ""].filter(Boolean);
    toast((morceaux.length ? morceaux.join(", ") + "." : "Rien de nouveau : tout était déjà à jour.") + (nDates ? ` ${nDates} dates de naissance enregistrées.` : ""));
    rendrePanneau();
  }

  /* ---------------- styles ---------------- */
  const css = document.createElement("style");
  const P = "body.sur-espace #panneau .ong-lic";
  css.textContent = `
${P} .lic-filtres{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 12px}
${P} .lic-outils{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 14px}
${P} .lic-cherche{flex:1 1 240px;display:flex;align-items:center;gap:8px;padding:0 12px;border-radius:12px;background:rgba(5,11,31,.45);border:1px solid rgba(143,168,240,.25)}
${P} .lic-cherche input{flex:1;min-width:0;border:0!important;background:none!important;box-shadow:none!important;padding:12px 0!important}
${P} .lic-eq{flex:0 1 230px}
${P} .lic-eq select{width:100%}
${P} .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
${P} .lic-groupe{margin:0 0 18px}
${P} .lic-groupe h3{display:flex;align-items:center;gap:8px;margin:0 0 8px;font:800 17px var(--display);letter-spacing:.3px}
${P} .lic-groupe h3 span{font:700 12px var(--corps);padding:2px 8px;border-radius:999px;background:rgba(143,168,240,.18)}
${P} .lic-l{border-radius:14px;background:linear-gradient(135deg,rgba(25,48,110,.55),rgba(10,22,56,.6));border:1px solid rgba(143,168,240,.18);margin:0 0 8px}
${P} .lic-l>summary{list-style:none;display:grid;grid-template-columns:minmax(0,1fr) auto 18px;gap:10px;align-items:center;padding:12px 14px;cursor:pointer}
${P} .lic-l>summary::-webkit-details-marker{display:none}
${P} .lic-nom{display:grid;min-width:0}
${P} .lic-nom b{font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${P} .lic-nom small{color:#AFC0EA;font-size:13px}
${P} .lic-badges{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
${P} .lic-b{padding:4px 10px;border-radius:999px;font:700 12.5px var(--corps);white-space:nowrap;background:rgba(143,168,240,.16);color:#DCE4FA}
${P} .lic-b.e-validee,${P} .lic-b.p-payee{background:rgba(34,197,94,.18);color:#86EFAC}
${P} .lic-b.e-incomplete{background:rgba(245,158,11,.2);color:#FCD34D}
${P} .lic-b.e-attente{background:rgba(47,107,255,.25);color:#BFD3FF}
${P} .lic-b.e-aucune,${P} .lic-b.p-non{background:rgba(239,68,68,.2);color:#FCA5A5}
${P} .lic-b.p-partiel{background:rgba(250,204,21,.18);color:#FDE68A}
${P} .lic-fl{color:#AFC0EA;transition:transform .2s}
${P} .lic-l[open] .lic-fl{transform:rotate(180deg)}
${P} .lic-edit{display:grid;gap:12px;padding:4px 14px 14px;border-top:1px solid rgba(143,168,240,.14)}
${P} .lic-ch{display:grid;gap:6px;margin-top:10px}
${P} .lic-ch-t{font:800 12px var(--corps);letter-spacing:.08em;text-transform:uppercase;color:#AFC0EA}
${P} .lic-seg{display:flex;gap:6px;flex-wrap:wrap}
${P} .lic-seg button{min-height:42px;padding:8px 12px;border-radius:12px;border:1px solid rgba(143,168,240,.3);background:rgba(5,11,31,.4);color:#DCE4FA;font:700 14px var(--corps);cursor:pointer}
${P} .lic-seg button[aria-pressed="true"]{background:var(--bleu,#2F6BFF);border-color:var(--bleu,#2F6BFF);color:#fff}
${P} .lic-champs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
${P} .lic-champs .lic-note{grid-column:1/-1}
${P} .lic-maj{margin:0;color:#8FA2D6;font-size:12.5px}
${P} .lic-ajout{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:end}
${P} .lic-ajout-bt{display:flex;align-items:end}
${P} .lic-ajout-bt .btn{width:100%;min-height:46px}
${P} .lic-rien{color:#AFC0EA}
body.sur-espace #panneau .lic-import{margin:0 0 12px;padding:12px 14px;border-radius:12px;background:rgba(47,107,255,.12);border:1px solid rgba(143,168,240,.3);display:grid;gap:8px}
body.sur-espace #panneau .lic-import p{margin:0;color:#C9D4F2;font-size:14px}
body.sur-espace #panneau .lic-import label{display:grid;gap:4px;max-width:420px}
:root[data-theme="light"] ${P} .lic-l{background:var(--carte);border-color:#D6DEF5}
:root[data-theme="light"] ${P} .lic-nom small,:root[data-theme="light"] ${P} .lic-ch-t{color:var(--texte-doux)}
:root[data-theme="light"] ${P} .lic-seg button{background:#fff;color:var(--texte);border-color:#C9D4F2}
:root[data-theme="light"] ${P} .lic-seg button[aria-pressed="true"]{color:#fff}
:root[data-theme="light"] ${P} .lic-b{color:#1E2A4A}
@media (max-width:700px){
  ${P} .lic-l>summary{grid-template-columns:minmax(0,1fr) 18px}
  ${P} .lic-badges{grid-column:1/-1;grid-row:2;justify-content:flex-start}
  ${P} .lic-ajout{grid-template-columns:minmax(0,1fr)}
  ${P} .lic-champs{grid-template-columns:minmax(0,1fr)}
}`;
  document.head.appendChild(css);
})();
