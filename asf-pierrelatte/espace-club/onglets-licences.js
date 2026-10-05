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
  const memeNom = (a, b) => { const x = slug(a || ""); return !!x && x === slug(b || ""); };
  /* la même personne : même numéro de licence ; sans numéro d'un côté, même nom */
  const memePersonne = (j, x) => { const a = chiffres(j && j.licence), b = chiffres(x && x.licence); return a && b ? a === b : memeNom(j && j.nom, x && x.nom); };
  const groupeEff = n => { try { return GROUPE_EFF(n); } catch(err){ return slug(n || ""); } };

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

  /* coachs de l'ancienne « U6 à U11 » : tant que leurs accès enregistrés n'ont pas les trois équipes, l'appli les lit avec les
     trois équipes en plus (sinon, « U6 à U11 » disparue des listes, l'appli leur ouvrirait toutes les équipes du club).
     Rien n'est écrit ici : le changement est enregistré par le bureau (Accès et rôles, ou tout seul à l'ouverture de l'espace). */
  const avecEcolePerms = p => {
    if (!p || typeof p !== "object") return p;
    let o = p;
    for (const k of Object.keys(p)){
      const v = p[k];
      if (v && Array.isArray(v.equipes) && v.equipes.some(estEcoleTout) && !ECOLE.every(n => v.equipes.includes(n))){
        if (o === p) o = { ...p };
        o[k] = { ...v, equipes: [...new Set(v.equipes.flatMap(n => estEcoleTout(n) ? [n, ...ECOLE] : [n]))] };
      }
    }
    const c = S.compte;
    if (c && c.role === "entraineur" && estEcoleTout(c.equipe)){
      const k = "c" + c.id, v = o[k];
      if (!v || !Array.isArray(v.equipes) || !v.equipes.length){ if (o === p) o = { ...p }; o[k] = { ...(v || {}), equipes: [c.equipe, ...ECOLE] }; }
    }
    return o;
  };
  try {
    const d = Object.getOwnPropertyDescriptor(S, "permissions");
    if (!d || d.configurable){
      let local = d && "value" in d ? d.value : undefined, memoE, memoC = null, memoS;
      const lire = () => d && d.get ? d.get.call(S) : local;
      Object.defineProperty(S, "permissions", { configurable: true, enumerable: true,
        get(){
          const p = lire(), c = S.compte ? [S.compte.id, S.compte.role, S.compte.equipe].join("|") : "";
          if (p !== memoE || c !== memoC){ memoE = p; memoC = c; memoS = avecEcolePerms(p); }
          return memoS;
        },
        set(v){ if (d && d.set) d.set.call(S, v); else local = v; } });
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
  /* un coach voit les licences de ses équipes ; Seniors 1 et Seniors 2 (ou les féminines) partagent le même effectif, comme dans l'appli */
  const voitEquipe = (autor, eq) => !autor || autor.some(a => a === eq || groupeEff(a) === groupeEff(eq));
  function licences(){
    const autor = mesEquipes(), out = [], vus = new Set();
    docs().forEach(([cle, d]) => {
      const eq = nomEq(cle, d);
      if (!voitEquipe(autor, eq)) return;
      (d.joueurs || []).forEach(j => { if (!j || !j.nom || vus.has(cle + "|" + j.id)) return; vus.add(cle + "|" + j.id); out.push({ cle, equipe: eq, j }); });
    });
    if (!autor) licenciesHors().forEach(j => { if (j && j.nom) out.push({ cle: HORS, equipe: j.aRanger ? NOM_RANGER : NOM_HORS, j, hors: true }); });
    return out;
  }
  /* équipes « connues » : celles du club (sauf l'ancienne U6 à U11), celles de la répartition Footclubs, des matchs et des
     plateaux, les équipes du foot animation (U10 · U11 Avenir…), l'école de foot */
  function equipesConnues(){
    const s = new Set(ECOLE);
    const ajout = n => { if (n && !estEcoleTout(n)) s.add(n); };
    try { (C().equipes || []).forEach(x => x && ajout(x.nom)); } catch(err){}
    try { Object.values(REPARTITION_LIC).forEach(ajout); } catch(err){}
    try { (S.matchs || []).forEach(m => m && ajout(m.equipe)); } catch(err){}
    try { (S.matchsAnimation || []).forEach(m => m && ajout(m.equipe)); } catch(err){}
    try { if (typeof ONGLETS_ANIM_CAL !== "undefined") ONGLETS_ANIM_CAL.forEach(ajout); } catch(err){}
    try { Object.keys(REPARTITION_LIC).forEach(ajout); } catch(err){}
    return s;
  }
  /* documents d'équipe à ranger : l'ancienne « U6 à U11 », et les équipes inventées par d'anciens imports (« Libre / U9 », « Dirigeant »…) */
  function docsARanger(){
    const connues = equipesConnues();
    return docs().filter(([cle, d]) => (d.joueurs || []).length && (estEcoleTout(d.equipe) || !connues.has(nomEq(cle, d))));
  }
  const ecoleVide = () => !docs().some(([, d]) => estEcoleTout(d.equipe) && (d.joueurs || []).length);
  /* les équipes des choix (selects) : un coach, ses équipes seulement (l'ancienne « U6 à U11 » devient les trois équipes) ;
     le bureau, toutes les équipes et l'école de foot */
  function equipesChoix(){
    const m = mesEquipes();
    let l = [];
    try { l = m ? m.flatMap(n => estEcoleTout(n) ? ECOLE : [n]) : [...toutesEquipes(), ...ECOLE]; } catch(err){ l = m ? [...m] : [...ECOLE]; }
    l = [...new Set(l)].filter(q => q && !estEcoleTout(q));
    return l.sort((a, b) => ordreEq(a).localeCompare(ordreEq(b)));
  }
  const choixPermis = v => (v === NOM_HORS && bureau()) || equipesChoix().includes(v);
  /* ordre des équipes : seniors, féminines, puis les jeunes du plus grand au plus petit, vétérans, le reste */
  const ordreEq = n => { const s = String(n || ""), m = s.match(/^U\s?(\d+)/i);
    return s === NOM_RANGER ? "/" : /^s[ée]nior/i.test(s) ? "0" + s : /f[ée]minin/i.test(s) ? "1" + s : m ? "2" + String(100 - +m[1]).padStart(3, "0") + s
      : /v[ée]t[ée]ran/i.test(s) ? "8" + s : s === NOM_HORS ? "93" : "9" + s; };

  /* écritures d'un même document l'une après l'autre (deux appuis rapides ne s'écrasent pas) */
  const files = new Map();
  function majDoc(cle, fn){
    const p = (files.get(cle) || Promise.resolve()).then(async () => {
      const base = (S.effectifs || {})[cle];
      // une équipe sans effectif encore : pas de nom ici (ce serait la clé « u13 ») ; l'appelant met le vrai nom (« U13 »)
      const d = base ? { ...base } : (cle === HORS ? { titre: NOM_HORS, joueurs: [], licencies: [] } : { joueurs: [] });
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
  /* le document d'une équipe : le sien, sinon celui de son groupe (Seniors 2 partage celui de Seniors 1), sinon un nouveau */
  const cleDans = (l, eq) => (l.find(([cle, d]) => nomEq(cle, d) === eq) || l.find(([cle, d]) => groupeEff(nomEq(cle, d)) === groupeEff(eq)) || [slug(eq)])[0];
  const cleDeLEquipe = eq => cleDans(docs(), eq);
  /* déplacer une licence : d'une équipe à une autre, vers les dirigeants, ou depuis « à ranger » */
  async function deplacer(cleSrc, id, vers){
    if (!choixPermis(vers)){ toast("Tu ne gères pas cette équipe.", true); return false; }
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
    // l'ancienne « U6 à U11 » qui se vide : supprimée (son nom disparaît des listes), et les comptes suivent (bureau)
    if (ok2 && cleSrc !== HORS && estEcoleTout(src.equipe) && !(((S.effectifs || {})[cleSrc] || {}).joueurs || []).length){
      await supprimerDocs([cleSrc]);
      if (bureau()){ try { await rangerComptes(); } catch(err){} }
    }
    return ok2;
  }
  /* supprimer des documents d'équipe vidés (anciennes catégories) */
  async function supprimerDocs(cles){
    for (const cle of cles){
      const d = (S.effectifs || {})[cle];
      if (cle === HORS || !d || (d.joueurs || []).length) continue;
      try { await S.db.doc("effectifs/" + cle).delete(); const x = { ...(S.effectifs || {}) }; delete x[cle]; S.effectifs = x; } catch(err){}
    }
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
  /* licences qui ne sont pas des licences de joueur (« Football d'animation », c'est une pratique des enfants : pas ici) */
  const NON_JOUEUR = /dirig|educat|entraineu|animateu|animatri|arbitr|techni|benevol|medic|kine|soign|accompagn|presiden|tresori|secretai|encadr|staff|delegu/;
  const AGE_CAT = /\bu\s?-?\s?(\d{1,2})\b/;
  /* l'âge de catégorie d'après l'année de naissance (saison en cours) : U20 au plus, puis senior */
  const ageNaissance = naissance => { if (!/^\d{4}-/.test(naissance || "")) return 0; const n = saisonFin() - +naissance.slice(0, 4); return n > 20 ? 99 : Math.max(1, n); };
  /* catégorie d'une ligne du fichier : la sous-catégorie Footclubs d'abord (ou la catégorie, le type), puis l'année de naissance */
  function categorie(catBrut, typeBrut, naissance, sexe){
    const c = sansAccent(catBrut), t = sansAccent(typeBrut), ct = c + " / " + t;
    if (NON_JOUEUR.test(ct)) return { hors: true };
    let age = 0;
    // « U6 à U11 » (ancienne catégorie du club) ne dit pas l'âge : l'année de naissance le dira
    const plage = /u\s?6\s*(a|-)\s*u\s?11/.test(c);
    const m = (!plage && (c.match(AGE_CAT) || c.match(/-\s?(\d{1,2})\s?ans/))) || t.match(AGE_CAT);
    if (m) age = +m[1];
    else if (/veteran|\+\s?3[0-9]\s?ans/.test(ct)) age = 100;
    else if (/senior/.test(ct)) age = 99;
    if (!age) age = ageNaissance(naissance);
    // la pratique seule (Libre, Futsal, Loisir, Entreprise) ne donne pas l'âge : adulte seulement sans date de naissance
    if (!age && /libre|loisir|futsal|entreprise/.test(ct)) age = 99;
    if (age > 20 && age < 99) age = 99;
    const g = groupe(age, sexe);
    return g ? { groupe: g, age: age >= 99 ? (age === 100 ? 100 : 99) : age, equipe: equipeDuGroupe(g) } : { aRanger: true };
  }
  /* équipe proposée pour un joueur déjà enregistré (rangement) : son âge, sinon le nom de son ancienne équipe */
  function equipeProposee(j, eqActuelle){
    let age = +j.age || 0;
    if (!age) age = ageNaissance(j.naissance);
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
  function ligne(x, ouvert, choixEq, connues){
    const j = x.j, et = libEtat(j.licEtat), pa = libPaie(j.licPaie), num = chiffres(j.licence), cle = `${x.cle}|${j.id}`;
    const verse = euros(j.licVerse);
    const morceaux = [x.hors && j.type ? j.type : x.equipe, num ? "N° " + num : ""].filter(Boolean).map(e);
    const sousTitre = morceaux.join(" · ") + (num ? "" : (morceaux.length ? " · " : "") + "<i>pas de numéro</i>");
    const peutDeplacer = bureau() || voitEquipe(mesEquipes() || [], x.equipe);
    // son équipe n'est pas dans la liste (ancienne « U6 à U11 », À ranger…) : on le dit, et toutes les équipes restent choisissables
    const horsListe = !choixEq.includes(x.equipe);
    return `<details class="lic-l ${x.equipe === NOM_RANGER ? "lic-aranger" : ""}" data-lic-cle="${e(x.cle)}" data-lic-id="${e(j.id)}" data-cherche="${e(cleCherche(x))}" ${ouvert === cle ? "open" : ""}>
      <summary><span class="lic-nom"><b>${e(j.nom)}</b><small>${sousTitre}</small></span>
        <span class="lic-badges"><span class="lic-b e-${e(j.licEtat || "x")}">${et[2]} ${e(et[1])}</span>
        <span class="lic-b p-${e(j.licPaie || "x")}">${pa[2]} ${e(j.licPaie === "partiel" && verse ? verse + " versés" : pa[1])}</span></span>
        <span class="lic-fl" aria-hidden="true">▾</span></summary>
      <div class="lic-edit">
        ${peutDeplacer ? `<div class="lic-ch"><span class="lic-ch-t">Équipe</span><select data-lic-deplacer aria-label="Équipe de ${e(j.nom)}">
          ${horsListe ? `<option value="" selected>${x.equipe === NOM_RANGER ? "" : e(x.equipe) + (connues && connues.has(x.equipe) ? "" : " (ancienne)") + " — "}Choisis son équipe…</option>` : ""}
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
    const choixEq = [...equipesChoix(), ...(bureau() ? [NOM_HORS] : [])], connues = equipesConnues();
    const parEq = new Map(); l.forEach(x => { if (!parEq.has(x.equipe)) parEq.set(x.equipe, []); parEq.get(x.equipe).push(x); });
    const liste = l.length ? [...parEq].map(([eq, xs]) => `<section class="lic-groupe ${eq === NOM_RANGER ? "lic-groupe-aranger" : ""}"><h3>${eq === NOM_RANGER ? "📦 " : ""}${e(eq)} <span>${xs.length}</span></h3>
        ${eq === NOM_RANGER ? `<p class="lic-aide-ranger">On ne connaît pas leur catégorie : choisis l'équipe de chacun (touche le nom).</p>` : ""}${xs.map(x => ligne(x, u.ouvert, choixEq, connues)).join("")}</section>`).join("")
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
    // l'équipe choisie était l'ancienne « U6 à U11 », désormais vide : on passe à U6 · U7 (si la personne la gère)
    try { if (estEcoleTout(S.ui.eq) && ecoleVide() && equipesAutorisees().includes(ECOLE[0])) S.ui.eq = ECOLE[0]; } catch(err){}
    // le bureau range l'école de foot tout seul (d'après les données relues sur le serveur)
    try { if (ecoleATourner()) setTimeout(ecoleAuto, 400); } catch(err){}
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
      // vide : retirée, sauf si c'est le choix enregistré (attribut « selected ») ; la liste montre alors l'équipe affichée
      if (vide && !ec.hasAttribute("selected")){
        const etait = ec.selected; ec.remove();
        if (etait && s.options.length){ const v = [...s.options].find(o => (o.value || o.textContent) === S.ui.eq); s.value = v ? v.value : s.options[0].value; }
      }
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
    if (!choixPermis(eq)){ toast("Tu ne gères pas cette équipe.", true); return; }
    const num = chiffres(d.licence);
    if (num && num.length < 6){ toast("Numéro de licence trop court : des chiffres (10 en général).", true); return; }
    // dans tout le club (pas seulement les équipes affichées) : même numéro, ou même nom quand l'un des deux n'a pas de numéro
    const tous = [...docs().flatMap(([cle, x]) => (x.joueurs || []).map(j => ({ j, equipe: nomEq(cle, x) }))), ...licenciesHors().map(j => ({ j, equipe: j.aRanger ? NOM_RANGER : NOM_HORS }))];
    const deja = tous.find(x => x.j && memePersonne(x.j, { nom, licence: num }));
    if (deja){ toast(`${deja.j.nom} est déjà dans ${deja.equipe} : modifie sa licence dans la liste.`, true); return; }
    const j = { id: uid(), nom, num: "", poste: "", licence: num, age: 0, sexe: "", licEtat: d.licEtat || "attente", licPaie: d.licPaie || "non",
      licVerse: +String(d.licVerse || "").replace(",", ".") > 0 ? Math.round(+String(d.licVerse).replace(",", ".") * 100) / 100 : "", licMaj: aujourdhuiIso() };
    // un montant déjà versé : payée en partie (sauf si « Payée » est choisi) ; « Pas payée » sans montant
    if (j.licVerse && j.licPaie !== "payee") j.licPaie = "partiel";
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
     Écrire plusieurs documents d'effectif sans jamais perdre personne en cas de coupure :
     1) chaque document qui reçoit quelqu'un, avec en plus ceux qu'il va perdre (rien n'est encore retiré) ;
     2) puis la version finale des documents qui perdent quelqu'un. Une coupure en route laisse au pire une licence en double.
     ===================================================================================== */
  const cleJ = j => j && j.id ? "i:" + j.id : "n:" + slug((j && j.nom) || "") + "|" + chiffres(j && j.licence);
  async function ecrireEffectifs(finals){
    const etape1 = [], etape2 = [];
    for (const [cle, fin] of finals){
      const k = champListe(cle), orig = (S.effectifs || {})[cle], avant = orig ? (orig[k] || []) : [], apres = fin[k] || [];
      const cAvant = new Set(avant.map(cleJ)), cApres = new Set(apres.map(cleJ));
      const retires = avant.filter(j => !cApres.has(cleJ(j))), recoit = apres.some(j => !cAvant.has(cleJ(j)));
      if (!retires.length) etape1.push([cle, fin]);
      else { if (recoit) etape1.push([cle, { ...fin, [k]: [...apres, ...retires] }]); etape2.push([cle, fin]); }
    }
    for (const [cle, doc] of [...etape1, ...etape2]){
      const ok = await ecrire(() => S.db.doc("effectifs/" + cle).set(doc));
      if (!ok) return false;
      S.effectifs = { ...(S.effectifs || {}), [cle]: doc };
    }
    return true;
  }
  /* deux fiches de la même personne : celle qui est déjà là garde ce qu'elle a et prend ce qui lui manque (numéro, état, paiement…) */
  const fusion = (x, j, equipe) => {
    const o = { ...x };
    for (const [k, v] of Object.entries(j || {})){
      if (k === "id" || k === "aRanger" || (equipe && k === "type")) continue;
      if ((o[k] === undefined || o[k] === null || o[k] === "" || o[k] === 0) && v !== "" && v != null) o[k] = v;
    }
    return o;
  };

  /* =====================================================================================
     Ranger les catégories : l'ancienne « U6 à U11 » et les équipes inventées par d'anciens imports
     ===================================================================================== */
  async function rangerCategories(opts = {}){
    const aRanger = docsARanger().filter(([, d]) => !opts.seulementEcole || estEcoleTout(d.equipe));
    const travail = {}; docs().forEach(([cle, d]) => { travail[cle] = { ...d, joueurs: [...d.joueurs] }; });
    const hors = { ...(docHors() || { titre: NOM_HORS }), joueurs: [], licencies: [...licenciesHors()] };
    let ranges = 0, versRanger = 0, versHors = 0;
    const changes = new Set();
    // vers les dirigeants ou « À ranger » : jamais en double (même fiche, même numéro, ou même nom sans numéro)
    const versLesHors = (j, extra) => {
      const a = chiffres(j.licence);
      const i = hors.licencies.findIndex(x => x && (x.id === j.id || (a && chiffres(x.licence) === a)
        || (!a && !chiffres(x.licence) && memeNom(x.nom, j.nom) && !!x.aRanger === !!extra.aRanger)));
      if (i >= 0) hors.licencies[i] = fusion(hors.licencies[i], { ...j, ...extra });
      else hors.licencies.push({ ...j, ...extra, licMaj: aujourdhuiIso() });
      changes.add(HORS);
    };
    for (const [cle, d0] of aRanger){
      const d = travail[cle], eqAct = nomEq(cle, d0), garde = [];
      for (const j of d.joueurs){
        const cible = equipeProposee(j, eqAct);
        if (cible === NOM_HORS){ versLesHors(j, { type: j.type || eqAct }); versHors++; continue; }
        if (cible && cible !== eqAct){
          const c2 = cleDans(Object.entries(travail), cible);
          // le même document (une équipe enregistrée « u13 » au lieu de « U13 ») : on lui redonne son vrai nom, le joueur reste
          if (c2 === cle){ garde.push(j); d.equipe = cible; ranges++; continue; }
          travail[c2] = travail[c2] || { joueurs: [] };
          if (!travail[c2].equipe) travail[c2].equipe = cible;
          let age = +j.age || ageNaissance(j.naissance);
          if (!age){ try { age = ageEquipe(cible) || 0; } catch(err){ age = 0; } }
          // déjà dans l'équipe (fiche tapée à la main…) : une seule fiche, qui garde le numéro, l'état et le paiement
          const i = travail[c2].joueurs.findIndex(x => x && memePersonne(x, j));
          if (i >= 0) travail[c2].joueurs[i] = fusion(travail[c2].joueurs[i], { ...j, age }, true);
          else travail[c2].joueurs.push({ ...j, age });
          changes.add(c2); ranges++; continue;
        }
        if (estEcoleTout(eqAct) || !cible){ versLesHors(j, { aRanger: true }); versRanger++; continue; }
        garde.push(j);
      }
      if (garde.length !== d.joueurs.length || d.equipe !== d0.equipe){ d.joueurs = garde; changes.add(cle); }
    }
    const finals = new Map([...changes].map(c => [c, c === HORS ? hors : travail[c]]));
    if (!(await ecrireEffectifs(finals))){
      if (!opts.silencieux) toast("Enregistrement interrompu : vérifie ta connexion, puis recommence (rien n'est perdu).", true);
      return null;
    }
    // les anciennes catégories vidées sont supprimées (sinon leur nom resterait dans les listes d'équipes)
    await supprimerDocs(aRanger.map(([cle]) => cle).filter(c => changes.has(c) && !(travail[c].joueurs || []).length));
    // les coachs qui géraient « U6 à U11 » gèrent maintenant les trois équipes ; les comptes joueurs vont dans leur nouvelle équipe
    const comptes = changes.size && bureau() ? await rangerComptes() : "";
    if (changes.size) comptesFait = true;
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
     - les enfants encore dans « U6 à U11 » vont dans leur équipe d'après leur âge (âge inconnu : « À ranger ») ;
     - les coachs de « U6 à U11 » passent sur les trois équipes, les comptes joueurs sur l'équipe de leur fiche.
     Tout ce qui est réécrit est d'abord relu sur le serveur : au chargement, la copie locale peut être encore vide.
     ===================================================================================== */
  const DESC_ECOLE = { "U6 · U7": "Premiers pas : jeux, ballon et plaisir.", "U8 · U9": "Découverte du jeu, en plateaux.", "U10 · U11": "Apprentissage du jeu à 8, en plateaux." };
  const equipesSansEcoleTout = eqs => {
    const i = eqs.findIndex(x => x && estEcoleTout(x.nom)); if (i < 0) return null;
    const vieux = eqs[i];
    const nouv = ECOLE.filter(n => !eqs.some(x => x && x.nom === n)).map(n => ({ ...vieux, nom: n, niveau: vieux.niveau || "École de foot", desc: DESC_ECOLE[n] }));
    return [...eqs.slice(0, i), ...nouv, ...eqs.slice(i + 1)].filter(x => !(x && estEcoleTout(x.nom)));
  };
  /* des documents lus sur le serveur lui-même (null : le document n'existe pas) */
  async function lireServeur(chemins){
    if (S.heberge && window.ASFP_API){
      const r = await fetch(window.ASFP_API + "/db", { headers: { Accept: "application/json" }, credentials: "same-origin", cache: "no-store" });
      if (!r.ok) throw new Error("lecture impossible (" + r.status + ")");
      const d = await r.json();
      if (!d || typeof d !== "object") throw new Error("lecture impossible");
      return Object.fromEntries(chemins.map(c => [c, d[c] && typeof d[c] === "object" ? d[c] : null]));
    }
    const out = {};
    for (const c of chemins){ const s = await S.db.doc(c).get(); out[c] = s && s.exists ? s.data() : null; }
    return out;
  }
  let clubFait = false, comptesFait = false, ecoleEnCours = false, ecoleEchec = false, ecoleAttente = 0, abonne = false;
  const effectifsCharges = () => !!S.local || docs().some(([, d]) => (d.joueurs || []).length);
  const ecoleATourner = () => {
    // les effectifs qui arrivent du serveur relancent aussi le rangement (le bureau peut rester sur l'accueil)
    if (!abonne && S.db && S.db.collection){ abonne = true; try { S.db.collection("effectifs").onSnapshot(() => { try { if (ecoleATourner()) setTimeout(ecoleAuto, 400); } catch(err){} }); } catch(err){} }
    return !ecoleEchec && !ecoleEnCours && Date.now() >= ecoleAttente && !!S.db && !!S.compte && bureau()
      && (!clubFait || !ecoleVide() || (!comptesFait && effectifsCharges()));
  };
  async function ecoleAuto(){
    if (!ecoleATourner()) return;
    ecoleEnCours = true;
    const morceaux = [];
    try {
      if (!clubFait){
        try {
          // la vraie fiche du club, relue sur le serveur (jamais les valeurs par défaut à la place d'une fiche pas encore arrivée)
          const club = (await lireServeur(["site/club"]))["site/club"], base = club || C();
          const equipes = Array.isArray(base.equipes) ? equipesSansEcoleTout(base.equipes) : null;
          if (!equipes) clubFait = true;
          else {
            const doc = { ...base, equipes };
            if (await ecrire(() => S.db.doc("site/club").set(doc))){
              clubFait = true; S.club = doc; morceaux.push("équipes du club : U6 · U7, U8 · U9, U10 · U11");
              // une fiche « Le club » déjà ouverte reprend la même liste (sinon un enregistrement remettrait « U6 à U11 »)
              if (S.ui.club && Array.isArray(S.ui.club.equipes)){ const l = equipesSansEcoleTout(S.ui.club.equipes); if (l) S.ui.club.equipes = l; }
            } else ecoleAttente = Date.now() + 120000;
          }
        } catch(err){ ecoleAttente = Date.now() + 60000; }
      }
      if (!ecoleVide()){
        const r = await rangerCategories({ seulementEcole: true, silencieux: true });
        if (r === null) ecoleEchec = true; else if (r) morceaux.push("enfants : " + r);
      }
      // même sans enfant à ranger : les coachs et les comptes joueurs encore sur « U6 à U11 » (une fois par visite)
      if (!ecoleEchec && !comptesFait && effectifsCharges()){ comptesFait = true; const r = await rangerComptes(); if (r) morceaux.push(r); }
    } finally { ecoleEnCours = false; }
    if (morceaux.length){ toast("École de foot rangée — " + morceaux.join(" ; ") + "."); rendrePanneau(); }
  }
  /* le compte joueur d'un enfant de l'ancienne « U6 à U11 » : l'équipe de sa fiche, trouvée par le numéro de licence du compte,
     sinon par son nom, dans l'école de foot seulement, et seulement s'il n'y a qu'une fiche à ce nom (un senior peut s'appeler pareil) */
  function equipeDuCompte(c){
    const lic = chiffres(c.licence);
    if (lic){
      const l = docs().filter(([, d]) => (d.joueurs || []).some(j => chiffres(j.licence) === lic));
      if (l.length === 1) return estEcoleTout(l[0][1].equipe) ? "" : nomEq(...l[0]);
      if (l.length > 1) return "";
    }
    const nom = c.joueur_nom || c.nom || "";
    const l = docs().filter(([cle, d]) => ECOLE.includes(nomEq(cle, d)) && (d.joueurs || []).some(j => memeNom(j.nom, nom)));
    return l.length === 1 ? nomEq(...l[0]) : "";
  }
  async function rangerComptes(){
    let coachs = 0, joueurs = 0, echecs = 0, accesRefuse = false;
    try {
      // les accès enregistrés, relus sur le serveur : jamais réécrits d'après une copie encore vide
      const brut = (await lireServeur(["site/permissions"]))["site/permissions"] || {};
      const p = { ...brut }; let change = false;
      Object.entries(p).forEach(([k, v]) => {
        if (v && Array.isArray(v.equipes) && v.equipes.some(estEcoleTout)){
          p[k] = { ...v, equipes: [...new Set(v.equipes.flatMap(n => estEcoleTout(n) ? ECOLE : [n]))] }; change = true; coachs++;
        }
      });
      const liste = ((await appelAuth("comptes")) || {}).comptes || [];
      // coachs dont l'équipe principale est « U6 à U11 », sans équipes cochées : les trois équipes (pas le bureau : il voit tout)
      liste.filter(c => c.role === "entraineur" && estEcoleTout(c.equipe)).forEach(c => {
        const k = "c" + c.id, v = p[k] || {};
        if (!Array.isArray(v.equipes) || !v.equipes.length){ p[k] = { ...v, equipes: [...ECOLE] }; change = true; coachs++; }
      });
      if (change){ if (await ecrire(() => S.db.doc("site/permissions").set(p))) S.permissions = p; else { accesRefuse = true; coachs = 0; } }
      // comptes joueurs : l'équipe de leur fiche dans les effectifs (un échec n'arrête pas les suivants)
      for (const c of liste.filter(c => c.role === "joueur" && estEcoleTout(c.equipe) && +c.actif)){
        const eq = equipeDuCompte(c); if (!eq) continue;
        try { await appelAuth("maj", { id: c.id, role: c.role, equipe: eq, joueurNom: c.joueur_nom || "", actif: 1 }); joueurs++; } catch(err){ echecs++; }
      }
    } catch(err){ return ""; }
    return [coachs ? `${pl(coachs, "coach")} sur les nouvelles équipes` : "", joueurs ? `${pl(joueurs, "compte joueur", "comptes joueurs")} mis à jour` : "",
      echecs ? `${pl(echecs, "compte joueur", "comptes joueurs")} à mettre à jour dans Accès et rôles` : "",
      accesRefuse ? "équipes des coachs pas enregistrées (connexion ?)" : ""].filter(Boolean).join(", ");
  }

  /* =====================================================================================
     Import Footclubs : lecture du fichier (ou des lignes copiées)
     ===================================================================================== */
  // titres de colonnes comparés sans accents ; « Nº » (o en exposant) s'écrit comme « N° »
  const T = c => sansAccent(c instanceof Date ? "" : c).replace(/[º˚ᵒ]/g, "°").replace(/[\s_.]+/g, " ").trim();
  const PARENT = /responsable|representant|parent|tuteur|legal|mere|pere|contact|urgence/;
  const COL = {
    nom: c => /^nom\b/.test(c) && !/prenom|club|structure|equipe|fichier|centre|categorie|ligue|district/.test(c) && !PARENT.test(c),
    prenom: c => /^prenoms?\b/.test(c) && !/\bnoms?\b/.test(c) && !PARENT.test(c),
    nomPrenom: c => /^(nom\s*(et|-|\/|,|&)?\s*prenoms?|prenoms?\s*(et|-|\/|,|&)?\s*noms?|identite|licencie|joueu(r|se)s?|nom complet|nom usuel)\b/.test(c)
      && !/\ble\b|date|depuis|n°|numero|\bnum\b|\bno\b|licence/.test(c) && !PARENT.test(c),
    licence: c => (/(^| )(n ?°?|no|num(ero)?) ?(de |du )?(la )?licen/.test(c) || /licen\w* ?(n ?°?|no|num)\b/.test(c) || /^licences?\b/.test(c))
      && !/type|statut|etat|date|\bcat|valid|saison|\ble\b|depuis|paie|regl|cotis/.test(c),
    naissance: c => /date (de )?naiss|^nee? le|^ne\(e\) le|^naissance\b|^ddn$|^dn$/.test(c) && !/lieu|pays|commune|ville|depart|dept|nation|code/.test(c),
    categorie: c => /sous ?-?cat/.test(c),
    categorie2: c => /(^| )cat(eg(orie)?)?\b/.test(c) && !/type|certif|sous ?-?cat/.test(c),
    sexe: c => /^(sexe|genre)\b|^(h|m) ?\/ ?f$|^f ?\/ ?(h|m)$/.test(c),
    type: c => /^type\b|type (de )?licen|^nature\b|^famille\b/.test(c) && !/piece|certif|document|signature|date|paie|regl|cotis|adhe/.test(c),
    etat: c => /^(statut|etat|situation|validation)\b|(statut|etat) (de la |du |de )?(licen|demande|dossier)/.test(c) && !/date|paie|regl|cotis|certif|medic|photo/.test(c),
    paie: c => /paie|paiement|\bpaye|\bregl|cotis|montant|verse|solde|reste a|a payer/.test(c) && !/^pays|mode|moyen|type|date|naiss/.test(c),
  };
  /* la ligne des titres : celle qui a le plus de colonnes reconnues (nom + au moins une autre) */
  function trouverTete(lignes){
    let best = -1, score = 0;
    lignes.slice(0, 40).forEach((r, i) => {
      const c = (r || []).map(T);
      const has = k => c.some(COL[k]);
      const aNom = has("nom") || has("nomPrenom");
      const s = (aNom ? 2 : 0) + ["prenom", "licence", "naissance", "categorie", "categorie2", "sexe", "type"].filter(has).length;
      if (aNom && s > score){ score = s; best = i; }
    });
    return score >= 2 ? best : -1;
  }
  const deux = n => String(n).padStart(2, "0");
  const dateIso = v => {
    // une date Excel : minuit heure locale, à quelques secondes près (avant minuit sur certains navigateurs) ; on prend le jour le plus proche
    if (v instanceof Date && !isNaN(v)){ const d = new Date(v.getTime() + 30 * 60000); return `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`; }
    if (typeof v === "number" && v > 3000 && v < 80000){ const d = new Date(Math.round((v - 25569) * 864e5)); return d.toISOString().slice(0, 10); }
    const s = String(v == null ? "" : v).trim(), m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})\b/);
    if (m){
      const an = m[3].length === 2 ? (+m[3] > 30 ? "19" : "20") + m[3] : m[3];
      if (+m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31 || an.length !== 4) return "";
      return `${an}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : "";
  };
  const capPrenom = p => /[a-zà-ÿ]/.test(p) ? p : p.toLowerCase().replace(/(^|[\s-'])([a-zà-ÿ])/g, (m, a, b) => a + b.toUpperCase());
  function lireEtat(v){
    const s = sansAccent(v).trim(); if (!s) return "";
    if (/refus|annul|aucune|sans licence|pas de licence|radi|suspend|rejet/.test(s)) return "aucune";
    if (/incomplet|a completer|manqu|piece|certificat|photo|justif|bloqu|anomal/.test(s)) return "incomplete";
    if (/non valid|pas (encore )?valid|invalid|a valider|attente|en cours|saisi|transmis|envoy|demand|instruction|signature|brouillon|enregistree|non traite/.test(s)) return "attente";
    if (/valid|accept|qualifi|delivr|edit|imprim|activ|\bok\b|\boui\b/.test(s)) return "validee";
    return "";
  }
  function lirePaie(v){
    const s = sansAccent(v).trim(); if (!s) return null;
    const m = s.replace(/\s/g, "").replace(",", ".").match(/^(\d+(\.\d+)?)(€|eur|euros?)?$/);
    if (m){ const n = +m[1]; return n > 0 ? { licPaie: "partiel", licVerse: n } : { licPaie: "non", licVerse: "" }; }
    // « en partie » avant « pas payé » (« reste à payer »), et les négations avant « payé » (« Pas payée » → pas payée)
    if (/partiel|en partie|acompte|reste|echeanc|\d\/\d/.test(s)) return { licPaie: "partiel" };
    if (/\b(non|pas|rien)\b|impay|aucun|a payer|en attente|^0\b/.test(s)) return { licPaie: "non" };
    if (/pay|regl|solde|\boui\b|\bok\b|encaiss|complet|acquitt/.test(s)) return { licPaie: "payee" };
    return null;
  }
  /* un CSV : séparateur le plus fréquent, guillemets, accents « Windows » */
  function decoder(u8){
    if (u8[0] === 0xFF && u8[1] === 0xFE) return new TextDecoder("utf-16le").decode(u8.subarray(2));
    if (u8[0] === 0xFE && u8[1] === 0xFF) return new TextDecoder("utf-16be").decode(u8.subarray(2));
    let nuls = 0; for (let i = 1; i < Math.min(u8.length, 400); i += 2) if (u8[i] === 0) nuls++;      // « texte Unicode » d'Excel sans en-tête
    if (nuls > 60) return new TextDecoder("utf-16le").decode(u8);
    try { return new TextDecoder("utf-8", { fatal: true }).decode(u8).replace(/^﻿/, ""); }
    catch(err){ return new TextDecoder("windows-1252").decode(u8); }
  }
  /* les lignes d'un CSV ; chaque ligne garde son numéro dans le fichier (__l), pour dire lesquelles sont ignorées */
  function csvLignes(txt){
    const premieres = txt.split(/\r?\n/).filter(l => l.trim()).slice(0, 12);
    const compte = c => premieres.reduce((s, l) => s + (l.split(c).length - 1), 0);
    const sep = [";", "\t", ","].sort((a, b) => compte(b) - compte(a))[0];
    const out = []; let ligne = [], champ = "", guill = false, n = 1, debut = 1;
    for (let i = 0; i < txt.length; i++){
      const c = txt[i];
      if (guill){ if (c === '"'){ if (txt[i + 1] === '"'){ champ += '"'; i++; } else guill = false; } else { if (c === "\n") n++; champ += c; } continue; }
      if (c === '"' && !champ.trim()){ guill = true; champ = ""; continue; }
      if (c === sep){ ligne.push(champ.trim()); champ = ""; continue; }
      if (c === "\n" || c === "\r"){ if (c === "\r" && txt[i + 1] === "\n") i++; ligne.push(champ.trim()); ligne.__l = debut; out.push(ligne); ligne = []; champ = ""; n++; debut = n; continue; }
      champ += c;
    }
    if (champ.trim() !== "" || ligne.length){ ligne.push(champ.trim()); ligne.__l = debut; out.push(ligne); }
    return out.filter(l => l.some(x => x !== ""));
  }
  async function chargerXlsx(){
    if (window.XLSX) return;
    await new Promise((ok, ko) => { const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload = ok; s.onerror = ko; document.head.appendChild(s); });
  }
  const feuillesDe = wb => wb.SheetNames.map(n => XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: "" }));
  /* la feuille qui a une ligne de titres et le plus de lignes dessous */
  const meilleure = feuilles => { let m = null; feuilles.forEach(l => { const i = trouverTete(l); if (i >= 0 && (!m || l.length - i > m.l.length - m.i)) m = { l, i }; }); return m ? m.l : null; };
  /* une page HTML (les « .xls » de certains logiciels) : ses tableaux lus comme le navigateur les affiche
     (tous les accents, les dates gardées en texte jour/mois/année) */
  const estHtml = t => /^\s*<(html|table|!doctype|meta|head|body|style|title|!--)/i.test(t) || /<table[\s>]/i.test(t.slice(0, 20000));
  const estTableurXml = t => /urn:schemas-microsoft-com:office:spreadsheet|<(ss:)?Workbook[\s>]/i.test(t.slice(0, 5000));
  function tableauxHtml(texte){
    let doc; try { doc = new DOMParser().parseFromString(texte, "text/html"); } catch(err){ return []; }
    return [...doc.querySelectorAll("table")].map(t => [...t.rows].map(tr => {
      const r = [];
      [...tr.cells].forEach(td => { r.push(td.textContent.replace(/\s+/g, " ").trim()); for (let k = 1; k < Math.min(+td.colSpan || 1, 40); k++) r.push(""); });
      return r;
    })).filter(l => l.length);
  }
  async function lignesDuTexte(texte){
    if (estTableurXml(texte)){
      try { await chargerXlsx(); const m = meilleure(feuillesDe(XLSX.read(texte, { type: "string", cellDates: true }))); if (m) return m; } catch(err){}
    }
    if (estHtml(texte)){
      const t = tableauxHtml(texte), m = meilleure(t); if (m) return m;
      const plein = [...t].sort((a, b) => b.length - a.length)[0]; if (plein && plein.length > 1) return plein;
    }
    return csvLignes(texte);
  }
  async function lignesDuFichier(f){
    const u8 = new Uint8Array(await f.arrayBuffer()), d = u8.subarray(0, 8);
    const est = (x, ...b) => b.every((v, i) => x[i] === v);
    if (est(d, 0x25, 0x50, 0x44, 0x46)) throw new Error("c'est un PDF. Dans Footclubs, choisis le format « Extraction MS Excel »");
    const zip = est(d, 0x50, 0x4B), ole = est(d, 0xD0, 0xCF, 0x11, 0xE0);
    if (zip || ole){
      try { await chargerXlsx(); } catch(err){ throw new Error("le lecteur Excel ne se charge pas (connexion ?). Ouvre le fichier dans Excel, « Enregistrer sous » CSV, et choisis ce CSV"); }
      let feuilles = [];
      try { feuilles = feuillesDe(XLSX.read(u8, { type: "array", cellDates: true })); } catch(err){}
      if (!meilleure(feuilles) && zip){
        // un .zip qui contient le fichier Footclubs
        try {
          const z = XLSX.CFB.read(u8, { type: "array" });
          for (let i = 0; i < z.FullPaths.length; i++){
            const nom = z.FullPaths[i], c = z.FileIndex[i] && z.FileIndex[i].content;
            if (!c || !c.length || !/\.(xlsx?|csv|txt|xml|html?)$/i.test(nom)) continue;
            const dedans = new Uint8Array(c);
            try {
              if (est(dedans, 0x50, 0x4B) || est(dedans, 0xD0, 0xCF, 0x11, 0xE0)) feuilles.push(...feuillesDe(XLSX.read(dedans, { type: "array", cellDates: true })));
              else feuilles.push(await lignesDuTexte(decoder(dedans)));
            } catch(err){}
          }
        } catch(err){}
      }
      const m = meilleure(feuilles); if (m) return m;
      const plein = feuilles.find(l => l && l.length > 1); if (plein) return plein;
      throw new Error("Excel n'arrive pas à ouvrir ce fichier. Ouvre-le dans Excel, « Enregistrer sous » CSV, et choisis ce CSV");
    }
    return lignesDuTexte(decoder(u8));
  }
  /* pas de ligne de titres : on reconnaît les colonnes à leur contenu (numéro de licence, date, catégorie, nom, prénom) */
  function tableSansTitres(lignes){
    const an = new Date().getFullYear();
    const estNum = c => typeof c === "number" ? c >= 1e5 && c < 1e12 : /^\s*\d[\d ]{5,14}\s*$/.test(String(c == null ? "" : c));
    const estDate = c => { const x = dateIso(c); return x && +x.slice(0, 4) > 1920 && +x.slice(0, 4) <= an; };
    const estCat = c => /\bu\s?-?\s?\d{1,2}\b|senior|veteran|dirig|educat|arbitr|libre|futsal|loisir/i.test(sansAccent(c));
    const estMot = c => typeof c === "string" && /^[A-Za-zÀ-ÿ'’ -]{2,}$/.test(c.trim()) && !estCat(c);
    const table = [["Nom", "Prénom", "N° licence", "Catégorie", "Date de naissance"]];
    lignes.forEach(r => {
      if (!r) return;
      const num = r.find(estNum); if (num === undefined) return;
      const mots = r.filter(estMot).map(c => c.trim());
      if (!mots.length) return;
      const x = [mots[0], mots[1] || "", num, r.find(estCat) || "", r.find(estDate) || ""];
      if (r.__l) x.__l = r.__l;
      table.push(x);
    });
    return table.length > 1 ? table : null;
  }
  /* lignes de pied de page, de titre ou de total : pas des licences */
  const PIED = /^(total|nombre|nb\b|page\s*\d|edite?e? le|edition|imprime|extrait|\d+\s+(licencie|joueu|personne|ligne|inscrit)|(categorie|club|saison|ligue|district|equipe)\s*:)/;
  /* des lignes (tableau de tableaux) → les licences reconnues */
  function analyser(lignes){
    const iTete = trouverTete(lignes);
    if (iTete < 0){
      if (!lignes.__sansTitres){ const t = tableSansTitres(lignes); if (t){ t.__sansTitres = true; return analyser(t); } }
      const debut = (lignes.find(r => r && r.some(c => String(c).trim())) || []).map(c => String(c).trim()).filter(Boolean).slice(0, 6).join(" | ");
      throw new Error(`je ne trouve ni la ligne des titres (Nom, Prénom, N° de licence…) ni de numéros de licence${debut ? `. Début du fichier : « ${debut.slice(0, 120)} »` : ""}`);
    }
    const tete = lignes[iTete].map(T), brute = lignes[iTete].map(c => String(c == null ? "" : c).replace(/\s+/g, " ").trim());
    const corps = lignes.slice(iTete + 1);
    // chaque colonne ne sert qu'une fois ; entre deux colonnes possibles, celle dont le contenu ressemble le plus (numéros, dates)
    const pris = new Set();
    const prendre = (k, test) => {
      const l = tete.map((c, i) => !pris.has(i) && COL[k](c) ? i : -1).filter(i => i >= 0); if (!l.length) return -1;
      let best = l[0];
      if (test && l.length > 1){ let max = -1; l.forEach(i => { const n = corps.slice(0, 300).filter(r => r && test(r[i])).length; if (n > max){ max = n; best = i; } }); }
      pris.add(best); return best;
    };
    const cNom = prendre("nom"), cNomPre = cNom < 0 ? prendre("nomPrenom") : -1, cPre = prendre("prenom");
    const cNum = prendre("licence", v => /^\d{6,12}$/.test(String(v == null ? "" : v).replace(/[\s.]/g, "")));
    const cNai = prendre("naissance", v => !!dateIso(v));
    // « Sous-catégorie » (U13, Senior…) et « Catégorie » (Libre, Dirigeant, Educateur…) : les deux sont lues
    let cCat = prendre("categorie"), cFam = -1;
    if (cCat < 0) cCat = prendre("categorie2"); else cFam = prendre("categorie2");
    const cSexe = prendre("sexe"), cType = prendre("type"), cEtat = prendre("etat"), cPaie = prendre("paie");
    const cN = cNom >= 0 ? cNom : cNomPre;
    const cel = (r, c) => c >= 0 ? r[c] : "";
    const txt = (r, c) => { const v = cel(r, c); return v instanceof Date ? "" : String(v == null ? "" : v).replace(/\s+/g, " ").trim(); };
    const liste = [], ignores = [];
    corps.forEach((r, k) => {
      if (!r) return;
      const numLigne = r.__l || (iTete + 2 + k);
      let nom = txt(r, cN), pre = cPre >= 0 ? txt(r, cPre) : "";
      if (!nom && !pre) return;
      // la ligne des titres répétée (en haut de chaque page), les pieds de page et les totaux
      if (T(nom) === tete[cN] || (pre && T(pre) === tete[cPre]) || PIED.test(sansAccent(nom))) return;
      if (!pre && nom.includes(",")){ [nom, pre] = nom.split(",").map(x => x.trim()); }
      if (!pre){
        // « NOM Prénom » (Footclubs), sinon « Prénom NOM »
        let m = nom.match(/^([A-ZÀ-Þ'’\- ]+?)\s+([A-ZÀ-Þ][a-zà-ÿ].*)$/);
        if (m){ nom = m[1].trim(); pre = m[2].trim(); }
        else if ((m = nom.match(/^([A-ZÀ-Þ][a-zà-ÿ'’]+(?:[\s-][A-ZÀ-Þ][a-zà-ÿ'’]+)*)\s+([A-ZÀ-Þ][A-ZÀ-Þ'’\- ]+)$/))){ pre = m[1].trim(); nom = m[2].trim(); }
      }
      const affiche = ((pre ? capPrenom(pre) + " " : "") + nom.toUpperCase()).replace(/\s+/g, " ").trim();
      if (affiche.replace(/[^a-zà-ÿ]/gi, "").length < 3){ ignores.push(numLigne); return; }
      const naissance = dateIso(cel(r, cNai)), licence = chiffres(cel(r, cNum));
      const sx = sansAccent(txt(r, cSexe)), catBrut = txt(r, cCat), typeBrut = [txt(r, cType), txt(r, cFam)].filter(Boolean).join(" / ");
      // rien d'autre qu'un nom, dans un fichier qui a des numéros de licence : un titre ou un pied de page
      if (cNum >= 0 && !licence && !catBrut && !typeBrut && !naissance){ ignores.push(numLigne); return; }
      const sexe = /^f|fem/.test(sx) ? "F" : /^(m|h|masc)/.test(sx) ? "M" : (/\bf\b|feminin|\bf\s*\(/.test(sansAccent(catBrut)) ? "F" : "M");
      const cat = categorie(catBrut, typeBrut, naissance, sexe);
      const extra = {};
      if (cEtat >= 0){ const x = lireEtat(txt(r, cEtat)); if (x) extra.licEtat = x; }
      if (cPaie >= 0){ const x = lirePaie(txt(r, cPaie)); if (x) Object.assign(extra, x); }
      liste.push({ nom: affiche, licence, naissance, sexe, catBrut, type: typeBrut || (cat.hors ? catBrut : ""),
        cat: cat.hors ? NOM_HORS : cat.aRanger ? NOM_RANGER : cat.groupe, age: cat.age || 0,
        equipe: cat.hors ? NOM_HORS : cat.aRanger ? NOM_RANGER : cat.equipe, hors: !!cat.hors, aRanger: !!cat.aRanger, extra });
    });
    if (!liste.length) throw new Error("aucune licence trouvée sous la ligne des titres");
    const vu = k => k >= 0 ? `« ${e(brute[k])} »` : "";
    return { liste, ignores, colonnes: { nom: vu(cN), prenom: vu(cPre), licence: vu(cNum), categorie: vu(cCat), famille: vu(cFam), naissance: vu(cNai),
      type: vu(cType), etat: vu(cEtat), paie: vu(cPaie) } };
  }
  function proposer(res, source){
    S.ui.importLic = res.liste; S.ui.importInfo = { colonnes: res.colonnes, ignores: res.ignores, source };
    S.ui.importCat = null; S.ui.importEtat = "";          // chaque fichier repart sur « Ne pas changer leur état »
    S.ui.effOuvert = "import";
    rendrePanneau();
  }
  // le fichier choisi dans Effectifs : lu ici, l'application ne le lit pas (sa lecture perdait des lignes et des catégories)
  window.addEventListener("change", async ev => {
    const t = ev.target; if (!t || !t.matches || !t.matches("[data-fichier-licencies]")) return;
    ev.stopImmediatePropagation();
    const f = t.files && t.files[0]; if (!f) return;
    if (importEnCours){ toast("Un import est en cours : attends la fin.", true); t.value = ""; return; }
    try { proposer(analyser(await lignesDuFichier(f)), f.name); }
    catch(err){ toast(`Fichier « ${f.name} » illisible : ` + (err && err.message || "format inattendu"), true); if (window.console) console.warn("import licences", err); }
    t.value = "";
  }, true);
  // les lignes copiées depuis Footclubs : même lecture (avec ou sans la ligne des titres, s'il y a des numéros de licence) ;
  // une simple liste de noms reste pour l'application
  window.addEventListener("click", ev => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-a="import-licencies"]'); if (!b) return;
    const z = document.getElementById("txt-licencies"); if (!z || !z.value.trim()) return;
    let res = null, erreur = "";
    const l = csvLignes(z.value);
    try {
      if (trouverTete(l) >= 0) res = analyser(l);
      else { const t = tableSansTitres(l); if (t){ t.__sansTitres = true; res = analyser(t); } }
    } catch(err){ res = null; erreur = err && err.message || ""; }
    if (!res){
      // une ligne de titres que l'on ne reconnaît pas : on s'arrête (sinon tout irait dans l'équipe affichée, titres compris)
      const titres = l.slice(0, 5).some(r => /\bnoms?\b|prenom|licen|naiss|categ/.test(T((r || []).join(" "))));
      if (!titres) return;
      ev.preventDefault(); ev.stopImmediatePropagation();
      toast("Lignes copiées illisibles : " + (erreur || "je ne reconnais pas la ligne des titres") + ". Copie aussi la ligne des titres depuis Footclubs (Nom, Prénom, N° licence…), ou dépose le fichier.", true);
      return;
    }
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (importEnCours){ toast("Un import est en cours : attends la fin.", true); return; }
    z.value = "";
    proposer(res, "lignes copiées");
  }, true);

  /* les lignes du fichier, sans doublon : les joueurs d'abord (une personne qui a une licence de joueur et une de dirigeant
     reste un joueur) ; même numéro de licence, ou même nom quand aucune des deux lignes n'a de numéro */
  function dedoublonner(l){
    const vus = new Set(), garde = [], doubles = [];
    [...l].sort((a, b) => (a.hors ? 1 : 0) - (b.hors ? 1 : 0)).forEach(x => {
      const n = chiffres(x.licence), k = n ? "n:" + n : "s:" + slug(x.nom || "");
      if (vus.has(k)) doubles.push(x); else { vus.add(k); garde.push(x); }
    });
    return { garde, doubles };
  }
  let importEnCours = false;

  /* l'aperçu de l'import : ce qui a été lu, où chacun va, l'état à appliquer, un seul bouton */
  if (typeof window.panEffectifs === "function"){
    const effAvant = window.panEffectifs;
    window.panEffectifs = function(){
      const h = effAvant.apply(this, arguments);
      if (!S.ui.importLic) return h;
      return ONG.transformer(h, racine => {
        const bt = racine.querySelector('[data-a="repartir-import-lic"]'); if (!bt) return;
        const info = S.ui.importInfo || {}, cols = info.colonnes || {}, choix = S.ui.importEtat || "";
        const { garde: l, doubles } = dedoublonner(S.ui.importLic);
        const parEq = new Map(); l.forEach(x => parEq.set(x.equipe, (parEq.get(x.equipe) || 0) + 1));
        const plan = [...parEq].sort((a, b) => ordreEq(a[0]).localeCompare(ordreEq(b[0])))
          .map(([q, n]) => `<li class="${q === NOM_RANGER ? "lic-imp-aranger" : ""}"><b>${n}</b> ${e(q === NOM_RANGER ? "sans catégorie : iront dans « À ranger »" : q)}</li>`).join("");
        const avecEtat = l.filter(x => x.extra && x.extra.licEtat).length, avecPaie = l.filter(x => x.extra && x.extra.licPaie).length;
        const lus = [["nom", "nom"], ["prenom", "prénom"], ["licence", "n° de licence"], ["categorie", "catégorie"], ["famille", "catégorie de licence"], ["naissance", "naissance"],
          ["type", "type"], ["etat", "état"], ["paie", "paiement"]].filter(([k]) => cols[k]).map(([k, l2]) => `${l2} ${cols[k]}`).join(", ");
        const ign = (info.ignores || []).map(n => +n).filter(n => n > 0);
        const bloc = document.createElement("div"); bloc.className = "lic-import";
        bloc.innerHTML = `<div class="lic-imp-tete"><b>📄 ${pl(l.length, "licence trouvée", "licences trouvées")}</b>${info.source ? `<small>${e(info.source)}</small>` : ""}</div>
          <ul class="lic-imp-plan">${plan}</ul>
          <p class="lic-imp-cols">Colonnes lues : ${lus || "—"}.${ign.length ? ` ${pl(ign.length, "ligne ignorée", "lignes ignorées")} (sans nom lisible : ligne${ign.length > 1 ? "s" : ""} ${ign.slice(0, 8).join(", ")}${ign.length > 8 ? "…" : ""}).` : ""}${doubles.length ? ` ${pl(doubles.length, "ligne en double", "lignes en double")} (même personne : comptée une fois).` : ""}</p>
          ${avecEtat || avecPaie ? `<p>État lu pour ${avecEtat}, paiement lu pour ${avecPaie}.</p>` : ""}
          <label>${avecEtat ? "Pour les licences sans état dans le fichier" : "Les licences de ce fichier sont"}<select data-import-etat>
            <option value="" ${!choix ? "selected" : ""}>Ne pas changer leur état</option>
            <option value="validee" ${choix === "validee" ? "selected" : ""}>✅ Validées</option>
            <option value="attente" ${choix === "attente" ? "selected" : ""}>⏳ En cours (pas encore validées)</option>
            <option value="incomplete" ${choix === "incomplete" ? "selected" : ""}>🟠 Incomplètes</option></select></label>
          <p class="lic-imp-n">Chacun va dans l'équipe de sa catégorie. Ceux qui sont déjà dans l'appli sont mis à jour (numéro, état, paiement), jamais en double ;
            les enfants de l'ancienne « U6 à U11 » passent dans leur nouvelle équipe. Tu pourras tout corriger dans « Suivi des licences ».</p>
          <div class="lic-imp-bts"><button class="btn bleu" data-a="repartir-import-lic" ${importEnCours ? "disabled" : ""}>${importEnCours ? "Enregistrement…" : `Mettre les ${l.length} licences dans l'appli`}</button>
            <button class="btn danger petit" data-a="annuler-import-lic" ${importEnCours ? "disabled" : ""}>Annuler</button></div>`;
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
  window.addEventListener("click", ev => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-a="annuler-import-lic"]'); if (!b) return;
    if (importEnCours){ ev.preventDefault(); ev.stopImmediatePropagation(); return; }
    S.ui.importEtat = "";
  }, true);

  /* « Mettre les licences dans l'appli » : ajoute les nouveaux, met à jour ceux qui sont déjà là, range les mal placés.
     Un seul import à la fois : pendant les enregistrements, l'aperçu redessiné garde son bouton bloqué. */
  window.addEventListener("click", async ev => {
    const b = ev.target && ev.target.closest && ev.target.closest('[data-a="repartir-import-lic"]');
    if (!b || !S.ui.importLic) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    if (importEnCours || b.disabled) return;
    importEnCours = true; b.disabled = true; b.textContent = "Enregistrement…";
    try { await importer(S.ui.importLic); }
    catch(err){ toast("Import interrompu : recommence (rien n'est perdu).", true); if (window.console) console.warn("import licences", err); }
    finally { importEnCours = false; rendrePanneau(); }
  }, true);
  async function importer(lFichier){
    const choix = S.ui.importEtat || "";
    const connues = equipesConnues();
    const travail = {}; docs().forEach(([cle, d]) => { travail[cle] = { ...d, joueurs: [...(d.joueurs || [])] }; });
    const hors = { ...(docHors() || { titre: NOM_HORS }), joueurs: [], licencies: [...licenciesHors()] };
    const cleEq = eq => cleDans(Object.entries(travail), eq);
    const malRange = cle => cle !== HORS && !!travail[cle] && (estEcoleTout(travail[cle].equipe) || !connues.has(nomEq(cle, travail[cle])));
    const { garde: l } = dedoublonner(lFichier);
    const changes = new Set(), quittes = new Set();
    let ajoutes = 0, maj = 0, deplaces = 0, horsN = 0, aRangerN = 0;

    /* qui est déjà dans l'appli ? 1) même numéro de licence ; 2) même nom, pour une fiche ou une ligne sans numéro, seulement
       s'il n'y a qu'une fiche possible et une seule ligne possible (homonymes : une mère et sa fille, un senior et un enfant)
       et que les âges vont ensemble. Sinon la ligne est ajoutée : au pire un doublon, jamais la licence de quelqu'un d'autre. */
    const existants = [];
    Object.entries(travail).forEach(([cle, d]) => d.joueurs.forEach(j => { if (j && j.nom) existants.push({ cle, j }); }));
    hors.licencies.forEach(j => { if (j && j.nom) existants.push({ cle: HORS, j }); });
    const pris = new Set(), lien = new Map(), parNum = new Map();
    existants.forEach(x => { const n = chiffres(x.j.licence); if (n && !parNum.has(n)) parNum.set(n, x); });
    l.forEach(x => { const n = chiffres(x.licence), y = n && parNum.get(n); if (y && !pris.has(y.j)){ pris.add(y.j); lien.set(x, y); } });
    const ageDe = y => { if (+y.j.age) return +y.j.age; if (y.cle === HORS || malRange(y.cle)) return 0; try { return ageEquipe(nomEq(y.cle, travail[y.cle])) || 0; } catch(err){ return 0; } };
    const vont = (y, x) => { if (x.hors || y.cle === HORS) return true; const a = ageDe(y), b = +x.age || 0; return !a || !b || (a >= 99 && b >= 99) || Math.abs(a - b) <= 2; };
    const sansLien = l.filter(x => !lien.has(x));
    sansLien.forEach(x => {
      const n = chiffres(x.licence);
      const cand = existants.filter(y => !pris.has(y.j) && memeNom(y.j.nom, x.nom) && !(n && chiffres(y.j.licence)) && vont(y, x));
      if (cand.length !== 1) return;
      const rivales = sansLien.filter(z => z !== x && !lien.has(z) && memeNom(z.nom, x.nom) && !(chiffres(z.licence) && chiffres(cand[0].j.licence)) && vont(cand[0], z));
      if (rivales.length) return;
      pris.add(cand[0].j); lien.set(x, cand[0]);
    });

    const appliquer = (j, x) => {
      const nv = { ...j };
      if (x.licence && !chiffres(j.licence)) nv.licence = x.licence;
      if (x.age && j.age !== x.age && !x.hors) nv.age = x.age;
      if (x.sexe && !j.sexe) nv.sexe = x.sexe;
      if (x.type && x.hors) nv.type = x.type;
      Object.assign(nv, x.extra || {});
      if (choix && !(x.extra && x.extra.licEtat)) nv.licEtat = choix;
      return nv;
    };
    const retirerDe = (cle, j) => { const i = travail[cle].joueurs.indexOf(j); if (i >= 0){ travail[cle].joueurs.splice(i, 1); changes.add(cle); quittes.add(cle); } };
    const retirerHors = j => { const i = hors.licencies.indexOf(j); if (i >= 0){ hors.licencies.splice(i, 1); changes.add(HORS); } };
    // dans une équipe : si la même personne y est déjà (fiche tapée à la main…), une seule fiche
    const pousser = (cible, nv) => {
      const c2 = cleEq(cible); travail[c2] = travail[c2] || { joueurs: [] };
      if (!travail[c2].equipe) travail[c2].equipe = cible;
      const l2 = travail[c2].joueurs, i = l2.findIndex(j => j && !pris.has(j) && memePersonne(j, nv));
      const fin = i >= 0 ? fusion(nv, l2[i], true) : nv;
      if (i >= 0) l2[i] = fin; else l2.push(fin);
      pris.add(fin); changes.add(c2);
    };
    // chez les dirigeants ou dans « À ranger » : jamais en double
    const pousserHors = nv => {
      const a = chiffres(nv.licence);
      const i = hors.licencies.findIndex(j => j && !pris.has(j) && (j.id === nv.id || (a && chiffres(j.licence) === a)));
      const fin = i >= 0 ? fusion(nv, hors.licencies[i]) : nv;
      if (i >= 0) hors.licencies[i] = fin; else hors.licencies.push(fin);
      pris.add(fin); changes.add(HORS);
    };
    const maintenant = j => ({ ...j, licMaj: aujourdhuiIso() });
    const majSurPlace = (y, nv) => {
      const liste = y.cle === HORS ? hors.licencies : travail[y.cle].joueurs, i = liste.indexOf(y.j);
      if (i < 0 || JSON.stringify(nv) === JSON.stringify(y.j)) return;
      liste[i] = maintenant(nv); pris.add(liste[i]); changes.add(y.cle); maj++;
    };
    const etatChoisi = x => (choix && !(x.extra && x.extra.licEtat) ? { licEtat: choix } : {});

    for (const x of l){
      const y = lien.get(x) || null, ou = y && y.cle !== HORS ? y : null, ouHors = y && y.cle === HORS ? y : null;
      if (x.hors){
        if (ou && malRange(ou.cle)){
          // dans une ancienne catégorie (« Dirigeant », « U6 à U11 »…) : il rejoint les dirigeants et éducateurs
          const nv = appliquer(ou.j, x); delete nv.aRanger; nv.type = x.type || nv.type || nomEq(ou.cle, travail[ou.cle]);
          retirerDe(ou.cle, ou.j); pousserHors(maintenant(nv)); deplaces++; continue;
        }
        // un joueur qui est aussi dirigeant reste dans son équipe
        if (ou){ majSurPlace(ou, appliquer(ou.j, { ...x, hors: false, type: "" })); continue; }
        if (ouHors){ const nv = appliquer(ouHors.j, x); delete nv.aRanger; majSurPlace(ouHors, nv); continue; }
        hors.licencies.push({ id: uid(), nom: x.nom, licence: x.licence, type: x.type || "", sexe: x.sexe || "", ...(x.extra || {}), ...etatChoisi(x), licMaj: aujourdhuiIso() });
        changes.add(HORS); horsN++; continue;
      }
      if (x.aRanger){
        if (ou && malRange(ou.cle)){
          // ancienne catégorie, et le fichier ne dit pas la catégorie : son âge enregistré décide, sinon « À ranger »
          const eqAct = nomEq(ou.cle, travail[ou.cle]), nv = appliquer(ou.j, x), cible = equipeProposee(nv, eqAct);
          retirerDe(ou.cle, ou.j);
          if (cible === NOM_HORS){ pousserHors(maintenant({ ...nv, type: nv.type || eqAct })); }
          else if (cible && cible !== eqAct){ pousser(cible, maintenant(nv)); }
          else { pousserHors(maintenant({ ...nv, aRanger: true })); aRangerN++; }
          deplaces++; continue;
        }
        if (ou || ouHors){ majSurPlace(y, appliquer(y.j, x)); continue; }
        hors.licencies.push({ id: uid(), nom: x.nom, licence: x.licence, sexe: x.sexe || "", aRanger: true, ...(x.extra || {}), ...etatChoisi(x), licMaj: aujourdhuiIso() });
        changes.add(HORS); aRangerN++; continue;
      }
      const cible = x.equipe;
      if (ou){
        // déjà dans une équipe : on le laisse (un coach a pu le surclasser), sauf s'il est dans une ancienne catégorie
        const nv = appliquer(ou.j, x);
        if (malRange(ou.cle) && nomEq(ou.cle, travail[ou.cle]) !== cible){ retirerDe(ou.cle, ou.j); pousser(cible, maintenant(nv)); deplaces++; }
        else majSurPlace(ou, nv);
        continue;
      }
      if (ouHors){
        // il était « à ranger » ou avec les dirigeants : il rejoint son équipe de joueurs
        const nv = appliquer(ouHors.j, x); delete nv.aRanger; delete nv.type;
        retirerHors(ouHors.j); pousser(cible, maintenant({ num: "", poste: "", ...nv })); deplaces++;
        continue;
      }
      const nouveau = { id: uid(), nom: x.nom, num: "", poste: "", licence: x.licence, age: x.age || 0, sexe: x.sexe || "", ...(x.extra || {}), ...etatChoisi(x) };
      if (nouveau.licEtat || nouveau.licPaie) nouveau.licMaj = aujourdhuiIso();
      pousser(cible, nouveau); ajoutes++;
    }
    // d'abord ce qui reçoit, puis ce qui perd quelqu'un : une coupure laisse au pire une licence en double
    const finals = new Map([...changes].map(c => [c, c === HORS ? hors : travail[c]]));
    if (!(await ecrireEffectifs(finals))){ toast("Enregistrement interrompu (connexion ?) : recommence l'import, rien n'est perdu.", true); return; }
    // les anciennes catégories vidées disparaissent des listes d'équipes
    const vides = [...quittes].filter(c => malRange(c) && !(travail[c].joueurs || []).length);
    await supprimerDocs(vides);
    let nDates = 0; try { nDates = await envoyerNaissances(l.filter(x => !x.hors)); } catch(err){}
    let comptes = ""; if (bureau() && (deplaces || vides.length)){ try { comptes = await rangerComptes(); } catch(err){} }
    S.ui.importLic = null; S.ui.importCat = null; S.ui.importInfo = null; S.ui.importEtat = "";
    const morceaux = [ajoutes ? `${pl(ajoutes, "licence ajoutée", "licences ajoutées")}` : "", maj ? `${maj} mise${maj > 1 ? "s" : ""} à jour` : "",
      deplaces ? `${pl(deplaces, "licence rangée", "licences rangées")} dans ${deplaces > 1 ? "leur" : "sa"} nouvelle équipe` : "", horsN ? `${horsN} dirigeant${horsN > 1 ? "s" : ""} ou éducateur${horsN > 1 ? "s" : ""}` : "",
      aRangerN ? `${aRangerN} sans catégorie (dans « À ranger »)` : "", comptes].filter(Boolean);
    toast((morceaux.length ? morceaux.join(", ") + "." : "Rien de nouveau : tout était déjà à jour.") + (nDates ? ` ${nDates} dates de naissance enregistrées.` : ""));
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
