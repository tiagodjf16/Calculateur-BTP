/* Licences du club : suivi, import Footclubs et catégories des jeunes.
   - Onglet « Suivi des licences » (Mes équipes) : toutes les licences du club, l'état de chacune (validée, incomplète, en attente,
     pas de licence) et son paiement (payée, en partie avec le montant, pas payée), modifiables en un appui ; tris pour les
     relances, changement d'équipe, ajout à la main, export. Un coach ne voit que ses équipes ; le bureau voit aussi les
     dirigeants et éducateurs et les licences « à ranger ».
   - Catégories des jeunes : l'école de foot est en trois équipes, U6 · U7, U8 · U9 et U10 · U11. L'ancienne « U6 à U11 »
     disparaît des listes de l'espace club dès qu'elle est vide, et « Ranger les catégories » y range les enfants (et les
     licences d'anciens imports mal placées), met à jour les équipes gérées des coachs et l'équipe des comptes joueurs.
   - Import Footclubs (onglet Effectifs) : le fichier est lu ici (Excel, CSV, ou lignes copiées depuis Footclubs) — ligne des
     titres trouvée même sous un titre, accents des CSV « Windows », dates Excel ; la catégorie vient de la sous-catégorie
     Footclubs, sinon de l'année de naissance ; les dirigeants, éducateurs et arbitres vont à part ; l'état et le paiement
     sont lus quand le fichier a ces colonnes ; les joueurs déjà là sont mis à jour, jamais en double.
   Données : sur chaque joueur des documents effectifs/… (lus par les coachs et le bureau seulement) : licEtat, licPaie,
   licVerse (€ versés), licNote, licMaj. Les licences sans équipe de joueurs sont dans effectifs/hors-equipe, champ « licencies »
   (pas de champ « equipe » ni de « joueurs » remplis : l'application et le serveur ne les prennent pas pour une équipe).
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONGLETS === "undefined" || typeof RUBRIQUES === "undefined" || typeof ONG === "undefined") return;
  const e = ONG.e;
  const K = "suivi-licences";
  const HORS = "hors-equipe", NOM_HORS = "Dirigeants et éducateurs", NOM_RANGER = "À ranger";
  const ECOLE = ["U6 · U7", "U8 · U9", "U10 · U11"];
  const ETATS = [["validee", "Validée", "✅"], ["incomplete", "Incomplète", "🟠"], ["attente", "En attente", "⏳"], ["aucune", "Pas de licence", "⛔"]];
  const PAIES = [["payee", "Payée", "💶"], ["partiel", "En partie", "🟡"], ["non", "Pas payée", "🔴"]];
  const libEtat = k => (ETATS.find(x => x[0] === k) || ["", "À vérifier", "❔"]);
  const libPaie = k => (PAIES.find(x => x[0] === k) || ["", "Paiement ?", "❔"]);
  const euros = v => { const n = +v; return isFinite(n) && n > 0 ? (Math.round(n * 100) / 100).toLocaleString("fr-FR") + " €" : ""; };
  const chiffres = v => String(v == null ? "" : v).replace(/\D/g, "").slice(0, 12);
  const sansAccent = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const estEcoleTout = n => /^\s*u\s?6\s*(à|a|-)\s*u\s?11\s*$/i.test(String(n || ""));
  const aujourdhuiIso = () => new Date().toISOString().slice(0, 10);
  const pl = (n, s, p) => `${n} ${n > 1 ? (p || s + "s") : s}`;

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

  /* répartition Footclubs → équipes du club : l'école de foot en trois équipes */
  try {
    if (typeof REPARTITION_LIC === "object"){
      REPARTITION_LIC.U5 = "U6 · U7"; REPARTITION_LIC.U7 = "U6 · U7"; REPARTITION_LIC.U9 = "U8 · U9"; REPARTITION_LIC.U11 = "U10 · U11";
    }
  } catch(err){}

  /* ---------------- données ---------------- */
  const bureau = () => { try { return !!peutBureau(); } catch(err){ return false; } };
  const mesEquipes = () => { try { return bureau() ? null : equipesAutorisees(); } catch(err){ return null; } };
  /* documents d'équipe (pas le document des licences hors équipe) */
  const docs = () => Object.entries(S.effectifs || {}).filter(([cle, d]) => cle !== HORS && d && Array.isArray(d.joueurs));
  const docHors = () => { const d = (S.effectifs || {})[HORS]; return d && typeof d === "object" ? d : null; };
  const licenciesHors = () => { const d = docHors(); return d && Array.isArray(d.licencies) ? d.licencies : []; };
  const nomEq = (cle, d) => d.equipe || cle;
  function licences(){
    const autor = mesEquipes(), out = [], vus = new Set();
    docs().forEach(([cle, d]) => {
      const eq = nomEq(cle, d);
      if (autor && !autor.includes(eq)) return;
      (d.joueurs || []).forEach(j => { if (!j || !j.nom || vus.has(cle + "|" + j.id)) return; vus.add(cle + "|" + j.id); out.push({ cle, equipe: eq, j }); });
    });
    if (!autor) licenciesHors().forEach(j => { if (j && j.nom) out.push({ cle: HORS, equipe: j.aRanger ? NOM_RANGER : NOM_HORS, j, hors: true }); });
    return out;
  }
  /* équipes « connues » : celles du club (sauf l'ancienne U6 à U11), celles de la répartition Footclubs, des matchs, l'école de foot */
  function equipesConnues(){
    const s = new Set(ECOLE);
    try { (C().equipes || []).forEach(x => { if (x && x.nom && !estEcoleTout(x.nom)) s.add(x.nom); }); } catch(err){}
    try { Object.values(REPARTITION_LIC).forEach(n => s.add(n)); } catch(err){}
    try { (S.matchs || []).forEach(m => { if (m && m.equipe && !estEcoleTout(m.equipe)) s.add(m.equipe); }); } catch(err){}
    try { Object.keys(REPARTITION_LIC).forEach(n => s.add(n)); } catch(err){}
    return s;
  }
  /* documents d'équipe à ranger : l'ancienne « U6 à U11 », et les équipes inventées par d'anciens imports (« Libre / U9 », « Dirigeant »…) */
  function docsARanger(){
    const connues = equipesConnues();
    return docs().filter(([cle, d]) => (d.joueurs || []).length && (estEcoleTout(d.equipe) || !connues.has(nomEq(cle, d))));
  }
  const ecoleVide = () => !docs().some(([, d]) => estEcoleTout(d.equipe) && (d.joueurs || []).length);
  /* l'équipe des choix (selects) */
  function equipesChoix(){
    let l = [];
    try { l = mesEquipes() || toutesEquipes(); } catch(err){}
    l = [...new Set([...l, ...ECOLE])].filter(q => !estEcoleTout(q));
    return l.sort((a, b) => ordreEq(a).localeCompare(ordreEq(b)));
  }
  /* ordre des équipes : seniors, féminines, puis les jeunes du plus grand au plus petit, vétérans, le reste */
  const ordreEq = n => { const s = String(n || ""), m = s.match(/^U\s?(\d+)/i);
    return s === NOM_RANGER ? "/" : /^s[ée]nior/i.test(s) ? "0" + s : /f[ée]minin/i.test(s) ? "1" + s : m ? "2" + String(100 - +m[1]).padStart(3, "0") + s
      : /v[ée]t[ée]ran/i.test(s) ? "8" + s : s === NOM_HORS ? "93" : "9" + s; };

  /* écritures d'un même document l'une après l'autre (deux appuis rapides ne s'écrasent pas) */
  const files = new Map();
  function majDoc(cle, fn){
    const p = (files.get(cle) || Promise.resolve()).then(async () => {
      const base = (S.effectifs || {})[cle];
      const d = base ? { ...base } : (cle === HORS ? { titre: NOM_HORS, joueurs: [], licencies: [] } : { equipe: cle, joueurs: [] });
      d.joueurs = [...(d.joueurs || [])]; if (cle === HORS) d.licencies = [...(d.licencies || [])];
      const doc = fn(d); if (!doc) return false;
      const ok = await ecrire(() => S.db.doc("effectifs/" + cle).set(doc));
      if (ok) S.effectifs = { ...(S.effectifs || {}), [cle]: doc };
      return ok;
    });
    files.set(cle, p.catch(() => {}));
    return p;
  }
  const champListe = cle => cle === HORS ? "licencies" : "joueurs";
  async function majJoueur(cle, id, patch, message){
    const k = champListe(cle);
    const ok = await majDoc(cle, d => ({ ...d, [k]: d[k].map(j => j.id === id ? { ...j, ...patch, licMaj: aujourdhuiIso() } : j) }));
    if (ok && message) toast(message);
    if (S.ui.onglet === K) rendrePanneau();
    return ok;
  }
  const cleDeLEquipe = eq => (docs().find(([cle, d]) => nomEq(cle, d) === eq) || [slug(eq)])[0];
  /* déplacer une licence : d'une équipe à une autre, vers les dirigeants, ou depuis « à ranger » */
  async function deplacer(cleSrc, id, vers){
    const src = (S.effectifs || {})[cleSrc]; if (!src) return false;
    const j = (src[champListe(cleSrc)] || []).find(x => x.id === id); if (!j) return false;
    const versHors = vers === NOM_HORS;
    const cleDst = versHors ? HORS : cleDeLEquipe(vers);
    if (cleDst === cleSrc && !(cleSrc === HORS && j.aRanger && versHors)) return true;
    const copie = { ...j, licMaj: aujourdhuiIso() }; delete copie.aRanger;
    if (!versHors){ try { if (!copie.age){ const a = ageEquipe(vers); if (a) copie.age = a; } } catch(err){} }
    if (cleDst === cleSrc){ return majJoueur(cleSrc, id, { aRanger: false }, `${j.nom} : ${vers}.`); }
    // d'abord l'ajout, puis le retrait : en cas de coupure, la licence est en double, jamais perdue
    const ok1 = await majDoc(cleDst, d => {
      const k = champListe(cleDst);
      if (d[k].some(x => x.id === copie.id)) copie.id = uid();
      return { ...d, ...(versHors ? {} : { equipe: d.equipe || vers }), [k]: [...d[k], copie] };
    });
    if (!ok1) return false;
    const k = champListe(cleSrc);
    const ok2 = await majDoc(cleSrc, d => ({ ...d, [k]: d[k].filter(x => x.id !== id) }));
    if (ok2) toast(`${j.nom} est maintenant dans ${vers}.`);
    return ok2;
  }

  /* ---------------- l'âge et l'équipe d'un licencié ---------------- */
  /* fin de la saison en cours : de juillet à décembre, la saison finit l'année suivante */
  const saisonFin = () => { const d = new Date(); return d.getMonth() >= 6 ? d.getFullYear() + 1 : d.getFullYear(); };
  /* groupe Footclubs (U7, U9…, Seniors, Vétérans, Féminines) à partir de l'âge de catégorie et du sexe, comme l'application */
  function groupe(age, sexe){
    if (sexe === "F" && (age >= 16 || age === 99)) return "Féminines";
    if (age === 100) return "Vétérans";
    if (age === 99) return "Seniors";
    if (age === 20) return "U20";
    if (age >= 1 && age <= 5) return "U5";
    if (age) return "U" + (age % 2 ? age : age + 1);
    return "";
  }
  const equipeDuGroupe = g => { try { return REPARTITION_LIC[g] || g; } catch(err){ return g; } };
  const NON_JOUEUR = /dirig|educat|entraineur|animat|arbitr|techni|benevol|medic|kine|soign|accompagn|president|tresori|secretai|encadr|staff|delegu/;
  /* catégorie d'une ligne du fichier : la sous-catégorie Footclubs d'abord, puis l'année de naissance */
  function categorie(catBrut, typeBrut, naissance, sexe){
    const c = sansAccent(catBrut), t = sansAccent(typeBrut);
    if (NON_JOUEUR.test(t) || (NON_JOUEUR.test(c) && !/\bu\s?-?\s?\d{1,2}\b/.test(c))) return { hors: true };
    let age = 0;
    const m = c.match(/\bu\s?-?\s?(\d{1,2})\b/) || c.match(/-\s?(\d{1,2})\s?ans/);
    if (m) age = +m[1];
    else if (/veteran|\+\s?3[0-9]\s?ans/.test(c)) age = 100;
    else if (/senior|libre|loisir|futsal|entreprise/.test(c)) age = 99;
    if (!age && /^\d{4}-/.test(naissance || "")){
      const n = saisonFin() - +naissance.slice(0, 4);
      age = n >= 20 ? 99 : Math.max(1, n);
    }
    if (age > 20 && age < 99) age = 99;
    const g = groupe(age, sexe);
    return g ? { groupe: g, age: age >= 99 ? (age === 100 ? 100 : 99) : age, equipe: equipeDuGroupe(g) } : { aRanger: true };
  }
  /* équipe proposée pour un joueur déjà enregistré (rangement) : son âge, sinon le nom de son ancienne équipe */
  function equipeProposee(j, eqActuelle){
    let age = +j.age || 0;
    if (!age && /^\d{4}-/.test(j.naissance || "")){ const n = saisonFin() - +j.naissance.slice(0, 4); age = n >= 20 ? 99 : n; }
    if (!age && !estEcoleTout(eqActuelle)){
      const r = categorie(eqActuelle, "", "", j.sexe || "");
      if (r.hors) return NOM_HORS;
      if (r.equipe) return r.equipe;
    }
    if (!age) return "";
    const g = groupe(age >= 99 ? age : age, j.sexe || "");
    return g ? equipeDuGroupe(g) : "";
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
  const cleCherche = x => sansAccent(`${x.j.nom} ${x.j.licence || ""} ${x.equipe} ${x.j.licNote || ""} ${x.j.type || ""}`);
  const AIDE = `<ol>
      <li><b>Toutes les licences du club</b> sont ici, rangées par équipe (le bureau voit aussi les dirigeants et éducateurs).</li>
      <li>Touche une personne pour changer <b>l'état de sa licence</b> (validée, incomplète, en attente) et <b>son paiement</b>
        (payée, en partie avec le montant déjà versé, pas payée). Chaque appui s'enregistre tout de suite.</li>
      <li>Les pastilles du haut trient la liste : <b>À compléter</b> et <b>Pas payées</b> pour savoir qui relancer.
        <b>Exporter</b> donne la liste (Excel) pour les relances.</li>
      <li>Pour tout remplir d'un coup : <b>Importer depuis Footclubs</b>. Chacun va dans l'équipe de sa catégorie
        (U6 · U7, U8 · U9, U10 · U11, U13…) ; ceux qui sont déjà là sont mis à jour, jamais en double.</li></ol>
    <p>Dans Footclubs : <b>Licences → Éditions et Extractions → Édition des licenciés</b>, format <b>Extraction MS Excel</b> ; le fichier
      arrive dans <b>Travaux demandés</b> (l'engrenage sous ton nom). Le numéro de licence ouvre l'espace joueur de la personne.</p>`;
  function ligne(x, ouvert, choixEq){
    const j = x.j, et = libEtat(j.licEtat), pa = libPaie(j.licPaie), num = chiffres(j.licence), cle = `${x.cle}|${j.id}`;
    const verse = euros(j.licVerse);
    const sousTitre = [x.hors && j.type ? j.type : x.equipe, num ? "N° " + num : ""].filter(Boolean).map(e).join(" · ") + (num ? "" : `${x.hors && j.type ? " · " : ""}<i>pas de numéro</i>`);
    const peutDeplacer = bureau() || (mesEquipes() || []).includes(x.equipe);
    return `<details class="lic-l ${x.equipe === NOM_RANGER ? "lic-aranger" : ""}" data-lic-cle="${e(x.cle)}" data-lic-id="${e(j.id)}" data-cherche="${e(cleCherche(x))}" ${ouvert === cle ? "open" : ""}>
      <summary><span class="lic-nom"><b>${e(j.nom)}</b><small>${sousTitre}</small></span>
        <span class="lic-badges"><span class="lic-b e-${e(j.licEtat || "x")}">${et[2]} ${e(et[1])}</span>
        <span class="lic-b p-${e(j.licPaie || "x")}">${pa[2]} ${e(j.licPaie === "partiel" && verse ? verse + " versés" : pa[1])}</span></span>
        <span class="lic-fl" aria-hidden="true">▾</span></summary>
      <div class="lic-edit">
        ${peutDeplacer ? `<div class="lic-ch"><span class="lic-ch-t">Équipe</span><select data-lic-deplacer aria-label="Équipe de ${e(j.nom)}">
          ${x.equipe === NOM_RANGER ? `<option value="" selected>Choisis son équipe…</option>` : ""}
          ${choixEq.map(q => `<option ${q === x.equipe ? "selected" : ""}>${e(q)}</option>`).join("")}</select></div>` : ""}
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
  function bandeauRanger(){
    if (!bureau()) return "";
    const l = docsARanger(), n = l.reduce((s, [, d]) => s + d.joueurs.length, 0);
    if (!n) return "";
    const noms = l.map(([cle, d]) => `« ${e(nomEq(cle, d))} »`).join(", ");
    return `<div class="lic-ranger"><div><b>🧹 ${pl(n, "licence")} dans d'anciennes catégories</b>
      <span>${noms}. « Ranger » met chacun dans son équipe (U6 · U7, U8 · U9, U10 · U11…) d'après son âge ; ceux dont on ne connaît pas l'âge
      vont dans « À ranger », en haut de la liste. Le plus simple reste de réimporter le fichier Footclubs : tout se range tout seul.</span></div>
      <button type="button" class="btn bleu" data-lic-ranger>Ranger les catégories</button></div>`;
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
    const choixEq = [...equipesChoix(), ...(bureau() ? [NOM_HORS] : [])];
    const parEq = new Map(); l.forEach(x => { if (!parEq.has(x.equipe)) parEq.set(x.equipe, []); parEq.get(x.equipe).push(x); });
    const liste = l.length ? [...parEq].map(([eq, xs]) => `<section class="lic-groupe ${eq === NOM_RANGER ? "lic-groupe-aranger" : ""}"><h3>${eq === NOM_RANGER ? "📦 " : ""}${e(eq)} <span>${xs.length}</span></h3>
        ${eq === NOM_RANGER ? `<p class="lic-aide-ranger">On ne connaît pas leur catégorie : choisis l'équipe de chacun (touche le nom).</p>` : ""}${xs.map(x => ligne(x, u.ouvert, choixEq)).join("")}</section>`).join("")
      : ONG.vide(tout.length ? "Personne dans ce tri" : "Aucune licence pour l'instant", tout.length ? "Choisis une autre pastille ou une autre équipe."
        : "Importe la liste depuis Footclubs, ou ajoute une licence à la main.", `<button type="button" class="btn bleu" data-lic-import>📥 Importer depuis Footclubs</button>`);
    const opt = eqs.map(q => `<option ${q === u.eq ? "selected" : ""}>${e(q)}</option>`).join("");
    const ajout = ONG.pli("lic-ajout", "Ajouter une licence à la main", `<form class="lic-ajout" data-lic-ajout>
        <label>Prénom et NOM<input name="nom" required placeholder="Lucas MARTIN"></label>
        <label>Équipe<select name="equipe" required>${choixEq.map(q => `<option ${q === u.eq ? "selected" : ""}>${e(q)}</option>`).join("")}</select></label>
        <label>N° de licence<input name="licence" inputmode="numeric" maxlength="14" placeholder="si tu l'as"></label>
        <label>État<select name="licEtat">${ETATS.map(([k, l2]) => `<option value="${k}" ${k === "attente" ? "selected" : ""}>${l2}</option>`).join("")}</select></label>
        <label>Paiement<select name="licPaie">${PAIES.map(([k, l2]) => `<option value="${k}" ${k === "non" ? "selected" : ""}>${l2}</option>`).join("")}</select></label>
        <label>Déjà versé (€)<input name="licVerse" type="number" min="0" step="1" inputmode="decimal" placeholder="0"></label>
        <div class="lic-ajout-bt"><button class="btn bleu">Ajouter</button></div></form>`, false, "+");
    return `<div class="ong-lic">
      ${ONG.aide("lic-aide", "Comment ça marche ?", AIDE)}
      ${ONG.barre("Suivi des licences", `${pl(tout.length, "licence")}${mesEquipes() ? " dans tes équipes" : " au club"}${verse ? ` · ${euros(verse)} déjà versés sur les paiements en cours` : ""}`,
        `<button type="button" class="btn contour" data-lic-csv>⬇ Exporter</button><button type="button" class="btn bleu" data-lic-import>📥 Importer depuis Footclubs</button>`)}
      ${bandeauRanger()}
      <div class="lic-filtres" role="group" aria-label="Trier les licences">${FILTRES.map(([k, l2]) => `<button type="button" class="acc-chip ${u.filtre === k ? "on" : ""}" data-lic-filtre="${k}">${l2}<span>${n(k)}</span></button>`).join("")}</div>
      <div class="lic-outils"><label class="lic-cherche"><span aria-hidden="true">🔍</span><input type="search" data-lic-q placeholder="Chercher un nom, un numéro…" value="${e(u.q)}" aria-label="Chercher une licence"></label>
        ${eqs.length > 1 ? `<label class="lic-eq"><span class="sr">Équipe</span><select data-lic-eq aria-label="Équipe"><option value="">Toutes les équipes</option>${opt}</select></label>` : ""}</div>
      ${ajout}
      <div class="lic-liste">${liste}</div>
      <p class="lic-rien" hidden>Aucune licence ne correspond à la recherche.</p>
    </div>`;
  }

  /* ---------------- dessin : l'onglet, et plus d'« U6 à U11 » dans les listes une fois vide ---------------- */
  const rendreAvant = window.rendrePanneau;
  window.rendrePanneau = function(){
    // l'équipe choisie était l'ancienne « U6 à U11 », désormais vide : on passe à U6 · U7
    try { if (estEcoleTout(S.ui.eq) && ecoleVide()) S.ui.eq = ECOLE[0]; } catch(err){}
    // le bureau range l'école de foot tout seul (une fois les données arrivées)
    try { if (!ecoleEchec && !ecoleEnCours && bureau() && (!clubFait || !ecoleVide())) setTimeout(ecoleAuto, 400); } catch(err){}
    if (S.ui.onglet !== K){
      const r = rendreAvant.apply(this, arguments);
      try { nettoyerListes(); } catch(err){}
      return r;
    }
    const p = document.getElementById("panneau"); if (!p) return;
    const y = window.scrollY, foc = document.activeElement && document.activeElement.matches && document.activeElement.matches("[data-lic-q]");
    p.innerHTML = panSuivi();
    try { const ec = typeof encartCle === "function" && encartCle(); if (ec) p.insertAdjacentHTML("afterbegin", ec); } catch(err){}
    filtrerRecherche();
    requestAnimationFrame(() => window.scrollTo(0, y));
    if (foc){ const i = p.querySelector("[data-lic-q]"); if (i){ i.focus(); const v = i.value; i.value = ""; i.value = v; } }
  };
  /* les listes d'équipes de l'espace club : U6 · U7, U8 · U9, U10 · U11 à la place de « U6 à U11 » (gardée tant qu'elle a des joueurs) */
  function nettoyerListes(){
    const p = document.getElementById("panneau"); if (!p) return;
    const vide = ecoleVide();
    p.querySelectorAll("select").forEach(s => {
      const opts = [...s.options], ec = opts.find(o => estEcoleTout(o.value || o.textContent));
      if (!ec) return;
      // les trois équipes de l'école de foot, à la place de l'ancienne, si la liste ne les a pas déjà
      const manquent = ECOLE.filter(n => !opts.some(o => (o.value || o.textContent) === n));
      const aDesEquipes = opts.some(o => /^(u\d|s[ée]nior|f[ée]minin|v[ée]t)/i.test(o.value || o.textContent));
      if (aDesEquipes) manquent.forEach(n => { const o = document.createElement("option"); o.value = n; o.textContent = n; s.insertBefore(o, ec); });
      if (vide && !ec.selected) ec.remove();
    });
  }
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

  /* ---------------- gestes de l'onglet ---------------- */
  const ligneDe = el => el.closest(".lic-l");
  const trouver = (cle, id) => (((S.effectifs || {})[cle] || {})[champListe(cle)] || []).find(x => x.id === id);
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
    const br = t.closest("[data-lic-ranger]");
    if (br){ if (br.disabled) return; br.disabled = true; try { await rangerCategories(); } finally { br.disabled = false; } return; }
    const be = t.closest("[data-lic-etat]"), bp = t.closest("[data-lic-paie]");
    if (be || bp){
      const d = ligneDe(t); if (!d) return;
      u.ouvert = `${d.dataset.licCle}|${d.dataset.licId}`;
      const patch = be ? { licEtat: be.dataset.licEtat } : { licPaie: bp.dataset.licPaie };
      if (bp && bp.dataset.licPaie === "non") patch.licVerse = "";
      (be || bp).setAttribute("aria-pressed", "true");
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
    const d = ligneDe(t); if (!d) return;
    if (t.matches("[data-lic-deplacer]")){
      if (!t.value) return;
      S.ui.lic.ouvert = "";
      t.disabled = true;
      await deplacer(d.dataset.licCle, d.dataset.licId, t.value);
      rendrePanneau(); return;
    }
    if (t.matches("[data-lic-champ]")){
      const k = t.dataset.licChamp; let v = t.value.trim();
      if (k === "licence"){ v = chiffres(v); if (v && v.length < 6){ toast("Numéro de licence trop court : des chiffres (10 en général).", true); return; } }
      if (k === "licVerse"){ v = v === "" ? "" : Math.max(0, Math.round(+v.replace(",", ".") * 100) / 100); if (v !== "" && !isFinite(v)) return; }
      const patch = { [k]: v };
      // un montant versé : le paiement passe « en partie » (sauf s'il est déjà noté payé)
      if (k === "licVerse" && v > 0){ const j = trouver(d.dataset.licCle, d.dataset.licId); if (j && j.licPaie !== "payee") patch.licPaie = "partiel"; }
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
    const deja = [...licences(), ...licenciesHors().map(j => ({ j, equipe: NOM_HORS }))].find(x => (num && chiffres(x.j.licence) === num) || (!num && slug(x.j.nom) === slug(nom)));
    if (deja){ toast(`${deja.j.nom} est déjà dans ${deja.equipe} : modifie sa licence dans la liste.`, true); return; }
    const j = { id: uid(), nom, num: "", poste: "", licence: num, age: 0, sexe: "", licEtat: d.licEtat || "attente", licPaie: d.licPaie || "non",
      licVerse: +d.licVerse > 0 ? +d.licVerse : "", licMaj: aujourdhuiIso() };
    const versHors = eq === NOM_HORS, cle = versHors ? HORS : cleDeLEquipe(eq);
    if (!versHors){ try { const a = ageEquipe(eq); if (a) j.age = a; } catch(err){} }
    const ok = await majDoc(cle, x => versHors ? { ...x, licencies: [...x.licencies, j] } : { ...x, equipe: x.equipe || eq, joueurs: [...x.joueurs, j] });
    if (ok){ toast(`${nom} ajouté à ${eq}.`); S.ui.lic.ouvert = `${cle}|${j.id}`; rendrePanneau(); }
  }, true);

  function exporter(){
    const l = licences().sort((a, b) => ordreEq(a.equipe).localeCompare(ordreEq(b.equipe)) || String(a.j.nom).localeCompare(String(b.j.nom)));
    const cel = v => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
    const csv = "﻿" + [["Équipe", "Nom", "N° de licence", "Type", "État", "Paiement", "Déjà versé (€)", "Ce qui manque", "Modifié le"].map(cel).join(";"),
      ...l.map(x => [x.equipe, x.j.nom, chiffres(x.j.licence), x.j.type || "", x.j.licEtat ? libEtat(x.j.licEtat)[1] : "À vérifier", x.j.licPaie ? libPaie(x.j.licPaie)[1] : "",
        x.j.licVerse || "", x.j.licNote || "", x.j.licMaj ? String(x.j.licMaj).split("-").reverse().join("/") : ""].map(cel).join(";"))].join("\n");
    try { S.downloads.save({ filename: `licences-asf-pierrelatte-${aujourdhuiIso()}.csv`, data: csv }); toast("Liste exportée."); }
    catch(err){ toast("Export impossible ici.", true); }
  }

  /* =====================================================================================
     Ranger les catégories : l'ancienne « U6 à U11 » et les équipes inventées par d'anciens imports
     ===================================================================================== */
  async function rangerCategories(opts = {}){
    const aRanger = docsARanger().filter(([, d]) => !opts.seulementEcole || estEcoleTout(d.equipe));
    const travail = {}; docs().forEach(([cle, d]) => { travail[cle] = { ...d, joueurs: [...d.joueurs] }; });
    const hors = { ...(docHors() || { titre: NOM_HORS }), joueurs: [], licencies: [...licenciesHors()] };
    let ranges = 0, versRanger = 0, versHors = 0;
    const changes = new Set();
    for (const [cle, d0] of aRanger){
      const d = travail[cle], eqAct = nomEq(cle, d0), garde = [];
      for (const j of d.joueurs){
        const cible = equipeProposee(j, eqAct);
        if (cible === NOM_HORS){ hors.licencies.push({ ...j, type: j.type || eqAct, licMaj: aujourdhuiIso() }); versHors++; changes.add(HORS); continue; }
        if (cible && cible !== eqAct){
          const c2 = (Object.entries(travail).find(([k, x]) => nomEq(k, x) === cible) || [slug(cible)])[0];
          travail[c2] = travail[c2] || { equipe: cible, joueurs: [] };
          if (!travail[c2].equipe) travail[c2].equipe = cible;
          const dejaLa = travail[c2].joueurs.some(x => (chiffres(x.licence) && chiffres(x.licence) === chiffres(j.licence)) || (!chiffres(x.licence) && slug(x.nom || "") === slug(j.nom || "")));
          if (!dejaLa) travail[c2].joueurs.push({ ...j, age: j.age || 0 });
          changes.add(c2); ranges++; continue;
        }
        if (estEcoleTout(eqAct) || !cible){ hors.licencies.push({ ...j, aRanger: true, licMaj: aujourdhuiIso() }); versRanger++; changes.add(HORS); continue; }
        garde.push(j);
      }
      if (garde.length !== d.joueurs.length){ d.joueurs = garde; changes.add(cle); }
    }
    // d'abord les équipes qui reçoivent, puis celles qui se vident (en cas de coupure : en double, jamais perdu)
    const ordre = [...changes].sort((a, b) => (travail[a] && travail[a].joueurs.length === 0 ? 1 : 0) - (travail[b] && travail[b].joueurs.length === 0 ? 1 : 0));
    for (const cle of ordre){
      const doc = cle === HORS ? hors : travail[cle];
      const ok = await ecrire(() => S.db.doc("effectifs/" + cle).set(doc));
      if (!ok){ if (!opts.silencieux) toast("Enregistrement refusé : vérifie ta connexion, puis recommence.", true); return null; }
      S.effectifs = { ...(S.effectifs || {}), [cle]: doc };
    }
    // l'ancienne « U6 à U11 » vidée est supprimée (sinon son nom resterait dans les listes d'équipes)
    for (const cle of [...changes]){
      const d = travail[cle];
      if (cle !== HORS && d && estEcoleTout(d.equipe) && !d.joueurs.length){
        try { await S.db.doc("effectifs/" + cle).delete(); const x = { ...(S.effectifs || {}) }; delete x[cle]; S.effectifs = x; } catch(err){}
      }
    }
    // les coachs qui géraient « U6 à U11 » gèrent maintenant les trois équipes ; les comptes joueurs vont dans leur nouvelle équipe
    const comptes = changes.size ? await rangerComptes() : "";
    const bilan = [ranges ? `${pl(ranges, "licence rangée", "licences rangées")} dans leur équipe` : "", versRanger ? `${versRanger} à ranger à la main (dans « Suivi des licences »)` : "",
      versHors ? `${versHors} avec les dirigeants et éducateurs` : "", comptes].filter(Boolean).join(", ");
    if (opts.silencieux) return bilan;
    toast(bilan ? bilan + "." : "Tout était déjà rangé.");
    rendrePanneau();
    return bilan;
  }

  /* =====================================================================================
     L'école de foot en trois équipes partout, tout seul : à l'ouverture de l'espace club par le bureau, une fois
     - la liste des équipes du club (Réglages → Le club, et le site public) : « U6 à U11 » devient U6 · U7, U8 · U9, U10 · U11 ;
     - les enfants encore dans « U6 à U11 » vont dans leur équipe d'après leur âge (âge inconnu : « À ranger »).
     ===================================================================================== */
  const DESC_ECOLE = { "U6 · U7": "Premiers pas : jeux, ballon et plaisir.", "U8 · U9": "Découverte du jeu, en plateaux.", "U10 · U11": "Apprentissage du jeu à 8, en plateaux." };
  const equipesSansEcoleTout = eqs => {
    const i = eqs.findIndex(x => x && estEcoleTout(x.nom)); if (i < 0) return null;
    const vieux = eqs[i];
    const nouv = ECOLE.filter(n => !eqs.some(x => x && x.nom === n)).map(n => ({ ...vieux, nom: n, niveau: vieux.niveau || "École de foot", desc: DESC_ECOLE[n] }));
    return [...eqs.slice(0, i), ...nouv, ...eqs.slice(i + 1)].filter(x => !(x && estEcoleTout(x.nom)));
  };
  let clubFait = false, ecoleEnCours = false, ecoleEchec = false;
  async function ecoleAuto(){
    if (ecoleEnCours || ecoleEchec || !bureau() || !S.db || !S.compte) return;
    ecoleEnCours = true;
    const morceaux = [];
    try {
      if (!clubFait){
        clubFait = true;
        try {
          const d = await S.db.doc("site/club").get();
          const club = d && d.exists ? d.data() : null, base = club || C();
          const equipes = Array.isArray(base.equipes) ? equipesSansEcoleTout(base.equipes) : null;
          if (equipes){
            const doc = { ...base, equipes };
            if (await ecrire(() => S.db.doc("site/club").set(doc))){
              S.club = doc; morceaux.push("équipes du club : U6 · U7, U8 · U9, U10 · U11");
              // une fiche « Le club » déjà ouverte reprend la même liste (sinon un enregistrement remettrait « U6 à U11 »)
              if (S.ui.club && Array.isArray(S.ui.club.equipes)){ const l = equipesSansEcoleTout(S.ui.club.equipes); if (l) S.ui.club.equipes = l; }
            } else ecoleEchec = true;
          }
        } catch(err){}
      }
      if (!ecoleEchec && !ecoleVide()){
        const r = await rangerCategories({ seulementEcole: true, silencieux: true });
        if (r === null) ecoleEchec = true; else if (r) morceaux.push("enfants : " + r);
      }
    } finally { ecoleEnCours = false; }
    if (morceaux.length){ toast("École de foot rangée — " + morceaux.join(" ; ") + "."); rendrePanneau(); }
  }
  async function rangerComptes(){
    let coachs = 0, joueurs = 0;
    try {
      const p = { ...(S.permissions || {}) }; let change = false;
      Object.entries(p).forEach(([k, v]) => {
        if (v && Array.isArray(v.equipes) && v.equipes.some(estEcoleTout)){
          p[k] = { ...v, equipes: [...new Set(v.equipes.flatMap(n => estEcoleTout(n) ? ECOLE : [n]))] }; change = true; coachs++;
        }
      });
      let liste = null; try { liste = (await appelAuth("comptes")).comptes || []; } catch(err){ liste = null; }
      if (liste){
        // coachs dont l'équipe principale est « U6 à U11 », sans équipes cochées : les trois équipes
        liste.filter(c => c.role !== "joueur" && estEcoleTout(c.equipe)).forEach(c => {
          const k = "c" + c.id, v = p[k] || {};
          if (!Array.isArray(v.equipes) || !v.equipes.length){ p[k] = { ...v, equipes: [...ECOLE] }; change = true; coachs++; }
        });
        // comptes joueurs : l'équipe de leur fiche dans les effectifs
        for (const c of liste.filter(c => c.role === "joueur" && estEcoleTout(c.equipe) && +c.actif)){
          const nom = slug(c.joueur_nom || c.nom || "");
          const ou = docs().find(([, d]) => (d.joueurs || []).some(j => slug(j.nom || "") === nom));
          if (!ou || estEcoleTout(ou[1].equipe)) continue;
          try { await appelAuth("maj", { id: c.id, role: c.role, equipe: ou[1].equipe, joueurNom: c.joueur_nom || "", actif: 1 }); joueurs++; } catch(err){ break; }
        }
      }
      if (change){ await ecrire(() => S.db.doc("site/permissions").set(p)); S.permissions = p; }
    } catch(err){}
    return [coachs ? `${pl(coachs, "coach")} sur les nouvelles équipes` : "", joueurs ? `${pl(joueurs, "compte joueur")} mis à jour` : ""].filter(Boolean).join(", ");
  }

  /* =====================================================================================
     Import Footclubs : lecture du fichier (ou des lignes copiées)
     ===================================================================================== */
  const T = c => sansAccent(c instanceof Date ? "" : c).replace(/[\s_.]+/g, " ").trim();
  const COL = {
    nom: c => /^nom\b/.test(c) && !/prenom|club|structure|equipe|fichier|centre|categorie|ligue|district/.test(c),
    prenom: c => /^prenom/.test(c),
    nomPrenom: c => /^(nom (et |- |\/ )?prenom|identite|licencie|joueur|nom complet)/.test(c),
    licence: c => /(^| )(n ?°?|no|num(ero)?) ?(de )?licen|licen\w* ?(n ?°?|no|num)/.test(c) || (/^licen/.test(c) && !/type|statut|etat|date|cat|valid|saison|categorie/.test(c)),
    naissance: c => /naiss|^nee? le|^ne\(e\) le|date de nais/.test(c),
    categorie: c => /sous ?-?cat/.test(c),
    categorie2: c => /cat(egorie)?\b/.test(c) && !/type/.test(c),
    sexe: c => /^(sexe|genre)\b/.test(c),
    type: c => /^type\b|type (de )?licen|nature|famille de licen/.test(c) && !/piece|certif|document/.test(c),
    etat: c => /^(statut|etat)\b|statut|etat (de la )?(licen|demande|dossier)|validation|situation/.test(c),
    paie: c => /paie|pay|regl|cotis|montant|verse|solde|reste a/.test(c),
  };
  /* la ligne des titres : celle qui a le plus de colonnes reconnues (nom + au moins une autre) */
  function trouverTete(lignes){
    let best = -1, score = 0;
    lignes.slice(0, 40).forEach((r, i) => {
      const c = (r || []).map(T);
      const has = k => c.some(COL[k]);
      const s = (has("nom") || has("nomPrenom") ? 2 : 0) + ["prenom", "licence", "naissance", "categorie", "categorie2", "sexe", "type"].filter(has).length;
      if ((has("nom") || has("nomPrenom")) && s > score){ score = s; best = i; }
    });
    return score >= 3 ? best : (score >= 2 ? best : -1);
  }
  const dateIso = v => {
    if (v instanceof Date && !isNaN(v)) return new Date(v.getTime() - v.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (typeof v === "number" && v > 3000 && v < 80000){ const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    const s = String(v == null ? "" : v).trim(), m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
    if (m){ const an = m[3].length === 2 ? (+m[3] > 30 ? "19" : "20") + m[3] : m[3]; return `${an}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
  };
  const capPrenom = p => /[a-zà-ÿ]/.test(p) ? p : p.toLowerCase().replace(/(^|[\s-'])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  function lireEtat(v){
    const s = sansAccent(v).trim(); if (!s) return "";
    if (/refus|annul|aucune|sans licence|radi|suspend/.test(s)) return "aucune";
    if (/incomplet|a completer|manqu|piece|certificat|photo|justif|bloqu|anomal/.test(s)) return "incomplete";
    if (/non valid|a valider|attente|en cours|saisi|transmis|envoy|demand|instruction|signature|brouillon|enregistree/.test(s)) return "attente";
    if (/valid|accept|qualifi|delivr|edit|imprim|active|\bok\b/.test(s)) return "validee";
    return "";
  }
  function lirePaie(v){
    const s = sansAccent(v).trim(); if (!s) return null;
    const m = s.replace(/\s/g, "").replace(",", ".").match(/^(\d+(\.\d+)?)(€|eur)?$/);
    if (m){ const n = +m[1]; return n > 0 ? { licPaie: "partiel", licVerse: n } : { licPaie: "non", licVerse: "" }; }
    if (/non|impay|aucun|a payer|en attente|^0/.test(s)) return { licPaie: "non" };
    if (/partiel|en partie|acompte|reste|echeanc|\d\/\d/.test(s)) return { licPaie: "partiel" };
    if (/pay|regl|solde|oui|ok|encaiss|complet/.test(s)) return { licPaie: "payee" };
    return null;
  }
  /* un CSV : séparateur le plus fréquent, guillemets, accents « Windows » */
  function decoder(buf){
    const u8 = new Uint8Array(buf);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(u8).replace(/^﻿/, ""); }
    catch(err){ return new TextDecoder("windows-1252").decode(u8); }
  }
  function csvLignes(txt){
    const premieres = txt.split(/\r?\n/).filter(l => l.trim()).slice(0, 12);
    const compte = c => premieres.reduce((s, l) => s + (l.split(c).length - 1), 0);
    const sep = [";", "\t", ","].sort((a, b) => compte(b) - compte(a))[0];
    const out = []; let ligne = [], champ = "", guill = false;
    for (let i = 0; i < txt.length; i++){
      const c = txt[i];
      if (guill){ if (c === '"'){ if (txt[i + 1] === '"'){ champ += '"'; i++; } else guill = false; } else champ += c; continue; }
      if (c === '"' && !champ.trim()){ guill = true; champ = ""; continue; }
      if (c === sep){ ligne.push(champ.trim()); champ = ""; continue; }
      if (c === "\n" || c === "\r"){ if (c === "\r" && txt[i + 1] === "\n") i++; ligne.push(champ.trim()); out.push(ligne); ligne = []; champ = ""; continue; }
      champ += c;
    }
    if (champ.trim() !== "" || ligne.length){ ligne.push(champ.trim()); out.push(ligne); }
    return out.filter(l => l.some(x => x !== ""));
  }
  async function chargerXlsx(){
    if (window.XLSX) return;
    await new Promise((ok, ko) => { const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  async function lignesDuFichier(f){
    const buf = await f.arrayBuffer();
    const debut = new Uint8Array(buf.slice(0, 8));
    const binaire = (debut[0] === 0x50 && debut[1] === 0x4B) || (debut[0] === 0xD0 && debut[1] === 0xCF);   // xlsx (zip) ou xls
    const texte = !binaire ? decoder(buf) : "";
    if (binaire || /^\s*<(html|table|\?xml)/i.test(texte)){
      await chargerXlsx();
      const wb = XLSX.read(binaire ? buf : texte, { type: binaire ? "array" : "string", cellDates: true });
      // la feuille qui a la meilleure ligne de titres et le plus de lignes
      let mieux = null;
      wb.SheetNames.forEach(n => {
        const l = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" });
        const i = trouverTete(l); if (i < 0) return;
        if (!mieux || l.length - i > mieux.l.length - mieux.i) mieux = { l, i };
      });
      return mieux ? mieux.l : XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
    }
    return csvLignes(texte);
  }
  /* des lignes (tableau de tableaux) → les licences reconnues */
  function analyser(lignes){
    const iTete = trouverTete(lignes);
    if (iTete < 0) throw new Error("je ne trouve pas la ligne des titres (Nom, Prénom, N° de licence…)");
    const tete = lignes[iTete].map(T), brute = lignes[iTete].map(c => String(c == null ? "" : c).trim());
    const col = (k, sauf = []) => tete.findIndex((c, i) => COL[k](c) && !sauf.includes(i));
    const cNom = col("nom"), cNomPre = cNom < 0 ? col("nomPrenom") : -1, cPre = col("prenom");
    let cCat = col("categorie"); if (cCat < 0) cCat = col("categorie2");
    const cNum = col("licence", [cCat]), cNai = col("naissance"), cSexe = col("sexe"), cType = col("type", [cCat]);
    const cEtat = col("etat", [cType, cCat]), cPaie = col("paie", [cNum]);
    const cel = (r, c) => c >= 0 ? r[c] : "";
    const txt = (r, c) => { const v = cel(r, c); return v instanceof Date ? "" : String(v == null ? "" : v).replace(/\s+/g, " ").trim(); };
    const liste = [], ignores = [];
    lignes.slice(iTete + 1).forEach((r, k) => {
      if (!r) return;
      let nom = txt(r, cNom >= 0 ? cNom : cNomPre), pre = cPre >= 0 ? txt(r, cPre) : "";
      if (!nom && !pre) return;
      if (/^(total|nombre|nb)\b/i.test(nom)) return;
      if (!pre && nom.includes(",")){ [nom, pre] = nom.split(",").map(x => x.trim()); }
      if (!pre){ const m = nom.match(/^([A-ZÀ-Þ'’\- ]+?)\s+([A-ZÀ-Þ][a-zà-ÿ].*)$/); if (m){ nom = m[1].trim(); pre = m[2].trim(); } }
      const affiche = ((pre ? capPrenom(pre) + " " : "") + nom.toUpperCase()).replace(/\s+/g, " ").trim();
      if (affiche.replace(/[^a-zà-ÿ]/gi, "").length < 3){ ignores.push(iTete + 2 + k); return; }
      const naissance = dateIso(cel(r, cNai));
      const sx = sansAccent(txt(r, cSexe)), catBrut = txt(r, cCat), typeBrut = txt(r, cType);
      const sexe = /^f|fem/.test(sx) ? "F" : /^(m|h|masc)/.test(sx) ? "M" : (/\bf\b|feminin|\bf\s*\(/.test(sansAccent(catBrut)) ? "F" : "M");
      const cat = categorie(catBrut, typeBrut, naissance, sexe);
      const extra = {};
      if (cEtat >= 0){ const x = lireEtat(txt(r, cEtat)); if (x) extra.licEtat = x; }
      if (cPaie >= 0){ const x = lirePaie(txt(r, cPaie)); if (x) Object.assign(extra, x); }
      liste.push({ nom: affiche, licence: chiffres(cel(r, cNum)), naissance, sexe, catBrut, type: typeBrut || (cat.hors ? catBrut : ""),
        cat: cat.hors ? NOM_HORS : cat.aRanger ? NOM_RANGER : cat.groupe, age: cat.age || 0,
        equipe: cat.hors ? NOM_HORS : cat.aRanger ? NOM_RANGER : cat.equipe, hors: !!cat.hors, aRanger: !!cat.aRanger, extra });
    });
    if (!liste.length) throw new Error("aucune licence trouvée sous la ligne des titres");
    const vu = k => k >= 0 ? `« ${brute[k]} »` : "";
    return { liste, ignores, colonnes: { nom: vu(cNom >= 0 ? cNom : cNomPre), prenom: vu(cPre), licence: vu(cNum), categorie: vu(cCat), naissance: vu(cNai),
      type: vu(cType), etat: vu(cEtat), paie: vu(cPaie) } };
  }
  function proposer(res, source){
    S.ui.importLic = res.liste; S.ui.importInfo = { colonnes: res.colonnes, ignores: res.ignores, source };
    S.ui.importCat = null; S.ui.importEtat = S.ui.importEtat || "";
    S.ui.effOuvert = "import";
    rendrePanneau();
  }
  // le fichier choisi dans Effectifs : lu ici, l'application ne le lit pas (sa lecture perdait des lignes et des catégories)
  window.addEventListener("change", async ev => {
    const t = ev.target; if (!t || !t.matches || !t.matches("[data-fichier-licencies]")) return;
    ev.stopImmediatePropagation();
    const f = t.files && t.files[0]; if (!f) return;
    try { proposer(analyser(await lignesDuFichier(f)), f.name); }
    catch(err){ toast("Fichier illisible : " + (err && err.message || "format inattendu"), true); }
    t.value = "";
  }, true);
  // les lignes copiées depuis Footclubs (avec la ligne des titres) : même lecture ; sans titres, l'application s'en charge
  window.addEventListener("click", ev => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-a="import-licencies"]'); if (!b) return;
    const z = document.getElementById("txt-licencies"); if (!z || !z.value.trim()) return;
    let res = null;
    try { const l = csvLignes(z.value); if (trouverTete(l) >= 0) res = analyser(l); } catch(err){ res = null; }
    if (!res) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    z.value = "";
    proposer(res, "lignes copiées");
  }, true);

  /* l'aperçu de l'import : ce qui a été lu, où chacun va, l'état à appliquer, un seul bouton */
  if (typeof window.panEffectifs === "function"){
    const effAvant = window.panEffectifs;
    window.panEffectifs = function(){
      const h = effAvant.apply(this, arguments);
      if (!S.ui.importLic) return h;
      return ONG.transformer(h, racine => {
        const bt = racine.querySelector('[data-a="repartir-import-lic"]'); if (!bt) return;
        const l = S.ui.importLic, info = S.ui.importInfo || {}, cols = info.colonnes || {}, choix = S.ui.importEtat || "";
        const parEq = new Map(); l.forEach(x => parEq.set(x.equipe, (parEq.get(x.equipe) || 0) + 1));
        const plan = [...parEq].sort((a, b) => ordreEq(a[0]).localeCompare(ordreEq(b[0])))
          .map(([q, n]) => `<li class="${q === NOM_RANGER ? "lic-imp-aranger" : ""}"><b>${n}</b> ${e(q === NOM_RANGER ? "sans catégorie : iront dans « À ranger »" : q)}</li>`).join("");
        const avecEtat = l.filter(x => x.extra && x.extra.licEtat).length, avecPaie = l.filter(x => x.extra && x.extra.licPaie).length;
        const lus = [["nom", "nom"], ["prenom", "prénom"], ["licence", "n° de licence"], ["categorie", "catégorie"], ["naissance", "naissance"], ["type", "type"], ["etat", "état"], ["paie", "paiement"]]
          .filter(([k]) => cols[k]).map(([k, l2]) => `${l2} ${cols[k]}`).join(", ");
        const bloc = document.createElement("div"); bloc.className = "lic-import";
        bloc.innerHTML = `<div class="lic-imp-tete"><b>📄 ${pl(l.length, "licence trouvée", "licences trouvées")}</b>${info.source ? `<small>${e(info.source)}</small>` : ""}</div>
          <ul class="lic-imp-plan">${plan}</ul>
          <p class="lic-imp-cols">Colonnes lues : ${lus || "—"}.${info.ignores && info.ignores.length ? ` ${pl(info.ignores.length, "ligne ignorée")} (sans nom lisible : ligne${info.ignores.length > 1 ? "s" : ""} ${info.ignores.slice(0, 8).join(", ")}${info.ignores.length > 8 ? "…" : ""}).` : ""}</p>
          ${avecEtat || avecPaie ? `<p>État lu pour ${avecEtat}, paiement lu pour ${avecPaie}.</p>` : ""}
          <label>${avecEtat ? "Pour les licences sans état dans le fichier" : "Les licences de ce fichier sont"}<select data-import-etat>
            <option value="" ${!choix ? "selected" : ""}>Ne pas changer leur état</option>
            <option value="validee" ${choix === "validee" ? "selected" : ""}>✅ Validées</option>
            <option value="attente" ${choix === "attente" ? "selected" : ""}>⏳ En cours (pas encore validées)</option>
            <option value="incomplete" ${choix === "incomplete" ? "selected" : ""}>🟠 Incomplètes</option></select></label>
          <p class="lic-imp-n">Chacun va dans l'équipe de sa catégorie. Ceux qui sont déjà dans l'appli sont mis à jour (numéro, état, paiement), jamais en double ;
            les enfants de l'ancienne « U6 à U11 » passent dans leur nouvelle équipe. Tu pourras tout corriger dans « Suivi des licences ».</p>
          <div class="lic-imp-bts"><button class="btn bleu" data-a="repartir-import-lic">Mettre les ${l.length} licences dans l'appli</button>
            <button class="btn danger petit" data-a="annuler-import-lic">Annuler</button></div>`;
        // l'aperçu de l'application (une catégorie vers l'équipe affichée) est remplacé par celui-ci
        const carteJaune = bt.closest(".carte"), res = racine.querySelector('.rangee, .ong-eff-res');
        const ancre = res || carteJaune;
        ancre.before(bloc);
        if (res) res.remove();
        if (carteJaune && carteJaune !== res && carteJaune.contains(bt)) carteJaune.remove();
      });
    };
  }
  document.addEventListener("change", ev => {
    const t = ev.target; if (!t || !t.matches || !t.matches("[data-import-etat]")) return;
    S.ui.importEtat = t.value;
  });

  /* « Mettre les licences dans l'appli » : ajoute les nouveaux, met à jour ceux qui sont déjà là, range les mal placés */
  window.addEventListener("click", async ev => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-a="repartir-import-lic"]');
    if (!b || !S.ui.importLic) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (b.disabled) return; b.disabled = true; b.textContent = "Enregistrement…";
    try { await importer(S.ui.importLic); } finally { b.disabled = false; }
  }, true);
  async function importer(l){
    const choix = S.ui.importEtat || "";
    const connues = equipesConnues();
    const travail = {}; docs().forEach(([cle, d]) => { travail[cle] = { ...d, joueurs: [...(d.joueurs || [])] }; });
    const hors = { ...(docHors() || { titre: NOM_HORS }), joueurs: [], licencies: [...licenciesHors()] };
    const cleEq = eq => (Object.entries(travail).find(([k, d]) => nomEq(k, d) === eq) || [slug(eq)])[0];
    const malRange = cle => cle !== HORS && travail[cle] && (estEcoleTout(travail[cle].equipe) || !connues.has(nomEq(cle, travail[cle])));
    const memePersonne = (j, x) => {
      const a = chiffres(j.licence), b = chiffres(x.licence);
      if (a && b) return a === b;
      return slug(j.nom || "") === slug(x.nom || "");
    };
    const changes = new Set();
    let ajoutes = 0, maj = 0, deplaces = 0, horsN = 0, aRangerN = 0;
    const appliquer = (j, x) => {
      const nv = { ...j };
      if (x.licence && !chiffres(j.licence)) nv.licence = x.licence;
      if (x.age && (!j.age || j.age !== x.age) && !x.hors) nv.age = x.age;
      if (x.sexe && !j.sexe) nv.sexe = x.sexe;
      if (x.type && x.hors) nv.type = x.type;
      Object.assign(nv, x.extra || {});
      if (choix && !(x.extra && x.extra.licEtat)) nv.licEtat = choix;
      return nv;
    };
    // les joueurs d'abord : une personne qui a une licence de joueur et une de dirigeant reste dans son équipe
    const ordre = [...l].sort((a, b) => (a.hors ? 1 : 0) - (b.hors ? 1 : 0));
    const traites = [];
    for (const x of ordre){
      if (traites.some(y => memePersonne(y, x))){ continue; }
      traites.push(x);
      // où est-il déjà ?
      let ou = null;
      for (const [cle, d] of Object.entries(travail)){ const i = d.joueurs.findIndex(j => j && memePersonne(j, x)); if (i >= 0){ ou = [cle, i]; break; } }
      let ouHors = ou ? -1 : hors.licencies.findIndex(j => j && memePersonne(j, x));
      if (x.hors){
        if (ou){ const [cle, i] = ou, d = travail[cle], nv = appliquer(d.joueurs[i], { ...x, hors: false, type: "" });
          if (JSON.stringify(nv) !== JSON.stringify(d.joueurs[i])){ d.joueurs[i] = { ...nv, licMaj: aujourdhuiIso() }; changes.add(cle); maj++; } continue; }
        if (ouHors >= 0){ const j = hors.licencies[ouHors], nv = appliquer(j, x); delete nv.aRanger;
          if (JSON.stringify(nv) !== JSON.stringify(j)){ hors.licencies[ouHors] = { ...nv, licMaj: aujourdhuiIso() }; changes.add(HORS); maj++; } continue; }
        hors.licencies.push({ id: uid(), nom: x.nom, licence: x.licence, type: x.type || "", sexe: x.sexe || "", ...(x.extra || {}), ...(choix && !(x.extra && x.extra.licEtat) ? { licEtat: choix } : {}), licMaj: aujourdhuiIso() });
        changes.add(HORS); horsN++; continue;
      }
      if (x.aRanger){
        if (ou){ const [cle, i] = ou, d = travail[cle], nv = appliquer(d.joueurs[i], x);
          if (JSON.stringify(nv) !== JSON.stringify(d.joueurs[i])){ d.joueurs[i] = { ...nv, licMaj: aujourdhuiIso() }; changes.add(cle); maj++; } continue; }
        if (ouHors >= 0){ const j = hors.licencies[ouHors], nv = appliquer(j, x); if (JSON.stringify(nv) !== JSON.stringify(j)){ hors.licencies[ouHors] = nv; changes.add(HORS); maj++; } continue; }
        hors.licencies.push({ id: uid(), nom: x.nom, licence: x.licence, sexe: x.sexe || "", aRanger: true, ...(x.extra || {}), ...(choix && !(x.extra && x.extra.licEtat) ? { licEtat: choix } : {}), licMaj: aujourdhuiIso() });
        changes.add(HORS); aRangerN++; continue;
      }
      const cible = x.equipe;
      if (ou){
        const [cle, i] = ou, d = travail[cle], j = d.joueurs[i], nv = appliquer(j, x), change = JSON.stringify(nv) !== JSON.stringify(j);
        // déjà dans une équipe : on le laisse (un coach a pu le surclasser), sauf s'il est dans une ancienne catégorie
        if (malRange(cle) && nomEq(cle, d) !== cible){
          d.joueurs.splice(i, 1); changes.add(cle);
          const c2 = cleEq(cible); travail[c2] = travail[c2] || { equipe: cible, joueurs: [] };
          if (!travail[c2].equipe) travail[c2].equipe = cible;
          travail[c2].joueurs.push({ ...nv, licMaj: aujourdhuiIso() }); changes.add(c2); deplaces++;
        } else if (change){ d.joueurs[i] = { ...nv, licMaj: aujourdhuiIso() }; changes.add(cle); maj++; }
        continue;
      }
      if (ouHors >= 0){
        // il était « à ranger » ou avec les dirigeants : il rejoint son équipe de joueurs
        const j = hors.licencies[ouHors]; hors.licencies.splice(ouHors, 1); changes.add(HORS);
        const nv = appliquer(j, x); delete nv.aRanger; delete nv.type;
        const c2 = cleEq(cible); travail[c2] = travail[c2] || { equipe: cible, joueurs: [] };
        if (!travail[c2].equipe) travail[c2].equipe = cible;
        travail[c2].joueurs.push({ num: "", poste: "", ...nv, licMaj: aujourdhuiIso() }); changes.add(c2); deplaces++;
        continue;
      }
      const c2 = cleEq(cible); travail[c2] = travail[c2] || { equipe: cible, joueurs: [] };
      if (!travail[c2].equipe) travail[c2].equipe = cible;
      const nouveau = { id: uid(), nom: x.nom, num: "", poste: "", licence: x.licence, age: x.age || 0, sexe: x.sexe || "", ...(x.extra || {}) };
      if (choix && !(x.extra && x.extra.licEtat)) nouveau.licEtat = choix;
      if (nouveau.licEtat || nouveau.licPaie) nouveau.licMaj = aujourdhuiIso();
      travail[c2].joueurs.push(nouveau); changes.add(c2); ajoutes++;
    }
    // d'abord les équipes qui reçoivent, puis celles qui se vident (en cas de coupure : en double, jamais perdu)
    const ordreEcr = [...changes].sort((a, b) => ((a !== HORS && travail[a] && !travail[a].joueurs.length) ? 1 : 0) - ((b !== HORS && travail[b] && !travail[b].joueurs.length) ? 1 : 0));
    for (const cle of ordreEcr){
      const doc = cle === HORS ? hors : travail[cle];
      const ok = await ecrire(() => S.db.doc("effectifs/" + cle).set(doc));
      if (!ok){ toast("Enregistrement refusé : vérifie ta connexion, puis recommence (rien n'est perdu).", true); rendrePanneau(); return; }
      S.effectifs = { ...(S.effectifs || {}), [cle]: doc };
    }
    let nDates = 0; try { nDates = await envoyerNaissances(l.filter(x => !x.hors)); } catch(err){}
    let comptes = ""; if (deplaces && bureau()) { try { comptes = await rangerComptes(); } catch(err){} }
    S.ui.importLic = null; S.ui.importCat = null; S.ui.importInfo = null;
    const morceaux = [ajoutes ? `${pl(ajoutes, "licence ajoutée", "licences ajoutées")}` : "", maj ? `${maj} mise${maj > 1 ? "s" : ""} à jour` : "",
      deplaces ? `${pl(deplaces, "licence rangée", "licences rangées")} dans sa nouvelle équipe` : "", horsN ? `${horsN} dirigeant${horsN > 1 ? "s" : ""} ou éducateur${horsN > 1 ? "s" : ""}` : "",
      aRangerN ? `${aRangerN} sans catégorie (dans « À ranger »)` : "", comptes].filter(Boolean);
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
${P} .lic-ranger{display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin:0 0 14px;padding:14px 16px;border-radius:14px;
  background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.45)}
${P} .lic-ranger div{display:grid;gap:4px;flex:1 1 320px}
${P} .lic-ranger span{color:#FDE68A;font-size:14px;line-height:1.45}
${P} .lic-groupe{margin:0 0 18px}
${P} .lic-groupe h3{display:flex;align-items:center;gap:8px;margin:0 0 8px;font:800 17px var(--display);letter-spacing:.3px}
${P} .lic-groupe h3 span{font:700 12px var(--corps);padding:2px 8px;border-radius:999px;background:rgba(143,168,240,.18)}
${P} .lic-groupe-aranger h3{color:#FCD34D}
${P} .lic-aide-ranger{margin:-2px 0 8px;color:#FDE68A;font-size:14px}
${P} .lic-l{border-radius:14px;background:linear-gradient(135deg,rgba(25,48,110,.55),rgba(10,22,56,.6));border:1px solid rgba(143,168,240,.18);margin:0 0 8px}
${P} .lic-l.lic-aranger{border-color:rgba(245,158,11,.5)}
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
${P} .lic-ch select{max-width:360px}
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
body.sur-espace #panneau .lic-import{margin:0 0 12px;padding:14px 16px;border-radius:14px;background:rgba(47,107,255,.12);border:1px solid rgba(143,168,240,.35);display:grid;gap:10px}
body.sur-espace #panneau .lic-import p{margin:0;color:#C9D4F2;font-size:14px;line-height:1.45}
body.sur-espace #panneau .lic-imp-tete{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
body.sur-espace #panneau .lic-imp-tete b{font-size:17px}
body.sur-espace #panneau .lic-imp-tete small{color:#AFC0EA}
body.sur-espace #panneau .lic-imp-plan{list-style:none;margin:0;padding:0;display:flex;gap:8px;flex-wrap:wrap}
body.sur-espace #panneau .lic-imp-plan li{padding:6px 12px;border-radius:999px;background:rgba(5,11,31,.45);border:1px solid rgba(143,168,240,.25);font-size:14px}
body.sur-espace #panneau .lic-imp-plan li b{color:#fff;margin-right:4px}
body.sur-espace #panneau .lic-imp-plan li.lic-imp-aranger{border-color:rgba(245,158,11,.55);color:#FDE68A}
body.sur-espace #panneau .lic-import label{display:grid;gap:4px;max-width:440px}
body.sur-espace #panneau .lic-imp-bts{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
body.sur-espace #panneau .lic-imp-bts .btn.bleu{min-height:50px;font-size:16px}
:root[data-theme="light"] ${P} .lic-l{background:var(--carte);border-color:#D6DEF5}
:root[data-theme="light"] ${P} .lic-nom small,:root[data-theme="light"] ${P} .lic-ch-t{color:var(--texte-doux)}
:root[data-theme="light"] ${P} .lic-seg button{background:#fff;color:var(--texte);border-color:#C9D4F2}
:root[data-theme="light"] ${P} .lic-seg button[aria-pressed="true"]{color:#fff}
:root[data-theme="light"] ${P} .lic-b{color:#1E2A4A}
:root[data-theme="light"] ${P} .lic-ranger span,:root[data-theme="light"] ${P} .lic-aide-ranger{color:#92400E}
:root[data-theme="light"] body.sur-espace #panneau .lic-import p{color:var(--texte)}
@media (max-width:700px){
  ${P} .lic-l>summary{grid-template-columns:minmax(0,1fr) 18px}
  ${P} .lic-badges{grid-column:1/-1;grid-row:2;justify-content:flex-start}
  ${P} .lic-ajout{grid-template-columns:minmax(0,1fr)}
  ${P} .lic-champs{grid-template-columns:minmax(0,1fr)}
}`;
  document.head.appendChild(css);
})();
