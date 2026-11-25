<script id="appli-js">
/* =====================================================================
   APPLI : petits ajouts pour l'habillage façon appli foot.
   - barre d'onglets du téléphone : « Plus » ouvre le menu complet du site ;
   - « Changer de thème » du menu du téléphone fonctionne (le lien était recréé sans action) ;
   - fiche d'un match : bloc « Lieu de la rencontre » et RÉSUMÉ du match (buts, cartons, remplacements)
     quand ils existent ; sinon les buteurs et passeurs déjà saisis ;
   - les coachs et le bureau saisissent ces faits de match depuis la fiche (bouton « Faits de match »).
   Les faits sont rangés dans la fiche du match (champ « faits ») :
     { t: "but" | "jaune" | "rouge" | "rempl", min: "52" ou "45+2", c: "nous" | "eux", j: joueur, j2: passeur ou entrant }
   Les buts et passes saisis ici mettent aussi à jour « Buteurs et passeurs » (espace joueur).
   Ajouté sans modifier le script de l'application.
   ===================================================================== */
(() => {
  "use strict";
  const $1 = s => document.querySelector(s);

  /* ---------- « Plus » ouvre le menu du site ---------- */
  const bt = document.getElementById("btn-plus");
  if (bt && typeof ouvrirMenuMobile === "function"){
    bt.onclick = ev => {
      ev.preventDefault();
      document.body.classList.contains("drawer-ouvert") ? fermerMenuMobile() : ouvrirMenuMobile();
      bt.setAttribute("aria-expanded", document.body.classList.contains("drawer-ouvert"));
    };
    new MutationObserver(() => bt.setAttribute("aria-expanded", document.body.classList.contains("drawer-ouvert")))
      .observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }
  /* « Changer de thème » du menu */
  document.addEventListener("click", ev => {
    const t = ev.target.closest && ev.target.closest("#drawer-contenu [data-theme-btn]");
    if (!t) return;
    ev.preventDefault();
    const r = document.documentElement;
    r.dataset.theme = r.dataset.theme === "light" ? "dark" : "light";
    try { localStorage.setItem("theme", r.dataset.theme); } catch(e){}
  });

  /* ---------- intro : un toucher la passe, puis elle quitte la page ---------- */
  const intro = document.getElementById("intro");
  if (intro){
    if (document.documentElement.classList.contains("intro-vue")) intro.remove();
    else {
      intro.addEventListener("click", () => intro.classList.add("fin"));
      intro.addEventListener("animationend", ev => { if (ev.target === intro && /introSort/.test(ev.animationName)) intro.remove(); });
      setTimeout(() => intro.isConnected && intro.remove(), 4000);
    }
  }

  /* ---------- onglets du club : l'onglet de la page ouverte, bien en vue ---------- */
  const ONGLET_DE = { resultats: "matchs", classement: "matchs", calendrier: "matchs", tournois: "matchs", equipe: "equipes", legal: "", confidentialite: "", espaces: "" };
  function majOnglets(){
    const h = (location.hash.slice(1) || "accueil").split(/[?/]/)[0];
    const o = h in ONGLET_DE ? ONGLET_DE[h] : h;
    const nav = document.getElementById("club-onglets");
    if (nav){
      let actif = null;
      nav.querySelectorAll("a").forEach(a => { const on = a.dataset.o === o; a.classList.toggle("actif", on); if (on) actif = a; a.setAttribute("aria-current", on ? "page" : "false"); });
      if (actif && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: actif.offsetLeft - (nav.clientWidth - actif.clientWidth) / 2, behavior: "smooth" });
    }
    // barre du bas : « Matchs » reste allumé sur classement et tournois
    const m = document.querySelector('.tabbar a[data-p="calendrier"]');
    if (m && ["resultats", "classement", "tournois", "animation"].includes(h)) m.classList.add("actif");
  }
  window.addEventListener("hashchange", () => setTimeout(majOnglets, 0));
  majOnglets();

  /* ---------- PLATEAUX DU FOOT D'ANIMATION : la carte de l'appli (pages des équipes et Matchs du week-end) ---------- */
  const MOIS_L2 = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const escA = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const FL_G = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`, FL_D = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
  const TERR = `<svg viewBox="0 0 34 24" aria-hidden="true"><rect x="1" y="1" width="32" height="22"/><path d="M17 1v22"/><circle cx="17" cy="12" r="4"/><path d="M1 7h5v10H1M33 7h-5v10h5"/></svg>`;
  const GENS = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><circle cx="4.5" cy="9.5" r="2"/><path d="M3.5 19.5c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5M14.6 14.4c.7-.4 1.5-.6 2.4-.6 2.2 0 3.8 1.3 4.3 3.8M1.5 17c.3-1.6 1.2-2.6 2.6-2.9"/></svg>`;
  const PIN2 = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  const logoClub = () => (typeof LOGO_SRC !== "undefined" ? `<span class="cl-blason"><img src="${LOGO_SRC}" alt=""></span>` : "");
  const nomClub = "Atom'Sports Football Pierrelatte";
  function faCarte(g){
    const m = g[0], jour = new Date(m.date + "T12:00:00");
    const date = jour.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
    const heure = m.heure ? " - " + String(m.heure).replace(":", "h") : "";
    const org = m.dom ? `${logoClub()}<div><b>${escA(nomClub)}</b><span>(Club organisateur)</span></div>`
      : `${typeof blasonPetit === "function" ? blasonPetit(m.adv || "") : ""}<div><b>${escA(m.adv || "Club organisateur")}</b><span>(Club organisateur)</span></div>`;
    const adr = String(m.adresse || (m.dom && typeof ADRESSE_STADE !== "undefined" ? ADRESSE_STADE : "") || "");
    const i = adr.indexOf(","), terrain = i > 0 ? adr.slice(0, i) : adr, rue = i > 0 ? adr.slice(i + 1).trim() : "";
    const nos = [...new Set(g.map(x => x.equipe).filter(Boolean))];
    const adv = [...new Set(g.flatMap(x => Array.isArray(x.adversaires) ? x.adversaires : []))].filter(n => !/pierrelatte/i.test(n));
    const q = encodeURIComponent(adr || m.adv || "");
    return `<article class="fa-carte" data-fa="${escA(m.id)}" role="button" tabindex="0">
      <h3 class="fa-date">${escA(date)}${escA(heure)}</h3>
      <div class="fa-org">${org}</div>
      ${adr ? `<div class="fa-lieu"><div><b>${TERR}${escA(terrain)}</b>${rue ? `<span>${escA(rue)}</span>` : ""}</div>
        <a class="pin" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener" aria-label="Voir le lieu sur le plan" data-fa-pin>${PIN2}</a></div>` : ""}
      <div class="fa-eqs">${GENS}${adv.length ? `${adv.length + 1} clubs` : `${nos.length} équipe${nos.length > 1 ? "s" : ""}`}</div>
      <div class="fa-dont">Dont :<ul>${nos.map(n => `<li>${logoClub()}${escA(nomClub)} · ${escA(n)}</li>`).join("")}</ul></div>
      ${adv.length ? `<p class="fa-avec">Avec : ${adv.map(escA).join(", ")}</p>` : ""}</article>`;
  }
  /* plateaux d'une liste : un seul bloc par lieu et par horaire (nos équipes réunies) */
  function faGroupes(l){
    const groupes = new Map();
    l.forEach(m => { const k = (m.fal && m.fal.cle) || [m.date, m.heure || "", m.adresse || "", m.dom ? "dom" : (m.adv || "")].join("|");
      if (!groupes.has(k)) groupes.set(k, []); groupes.get(k).push(m); });
    return [...groupes.values()].map(faCarte).join("");
  }
  document.addEventListener("click", ev => {
    if (ev.target.closest && ev.target.closest("[data-fa-pin]")) return;          // l'épingle ouvre le plan, pas la fiche
    const c = ev.target.closest && ev.target.closest("[data-fa]");
    if (c && typeof window.ouvrirFiche === "function") window.ouvrirFiche(c.dataset.fa);
  });
  document.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const c = ev.target.closest && ev.target.closest("article[data-fa]");
    if (c && typeof window.ouvrirFiche === "function"){ ev.preventDefault(); window.ouvrirFiche(c.dataset.fa); }
  });
  /* ---------- anciennes adresses : « Foot d'animation » → Équipes ; « Résultats » → Matchs, au dernier week-end joué ---------- */
  const MW = { resultats: 0 };                       // moment de l'arrivée par « Résultats »
  function rediriger(){
    const h = location.hash, base = location.pathname + location.search;
    if (h === "#animation"){ location.replace(base + "#equipes"); return; }
    if (h === "#resultats"){ MW.resultats = Date.now(); location.replace(base + "#calendrier"); }
  }
  window.addEventListener("hashchange", rediriger);
  rediriger();


  /* =====================================================================
     MATCHS, ÉQUIPES, PAGE D'UNE ÉQUIPE, PAGE D'UN MATCH, STAFF
     ===================================================================== */
  if (typeof S === "undefined" || typeof window.ouvrirFiche !== "function") return;
  const H = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const esc2 = H;
  const nous = () => { try { return C().nomCourt || "Pierrelatte"; } catch(e){ return "Pierrelatte"; } };
  const eqDe2 = m => { try { return eqDe(m); } catch(e){ return String(m.equipe || ""); } };
  const nomNous = m => { const k = String(eqDe2(m)).match(/^(?:seniors?|v[ée]t[ée]rans?|f[ée]minines?|U\d{1,2}\s*·)\s*(\d+)$/i); return nous() + (k && k[1] !== "1" ? " " + k[1] : ""); };
  const advNom = m => String(m.adv || "Adversaire").replace(/\s+\d+$/, "");
  const trouve = id => (S.matchs || []).find(x => x.id === id) || (S.matchsAnimation || []).find(x => x.id === id);
  const estCoupe = m => { try { return COUPE(m); } catch(e){ return /coupe/i.test(String(m.comp || "")); } };
  const LOGO = () => (typeof LOGO_SRC !== "undefined" ? LOGO_SRC : "");
  const blasonNous = () => `<span class="cl-blason"><img src="${LOGO()}" alt=""></span>`;
  const blasonDe = nom => { try { return blasonPetit(nom || ""); } catch(e){ return `<span class="cl-blason"></span>`; } };
  const CHEV = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
  const RETOUR = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`;
  const ETOILE = plein => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.4l2.5 5.2 5.7.8-4.1 4 1 5.7L12 16.4l-5.1 2.7 1-5.7-4.1-4 5.7-.8z" fill="${plein ? "currentColor" : "none"}"/></svg>`;
  const ENVELOPPE = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 7l9 6 9-6"/></svg>`;
  /* noms des joueurs affichés au public : « Prénom N. », comme dans l'appli */
  const court = n => {
    const t = String(n || "").trim(); if (!t) return "";
    const x = t.match(/^(.*?)\s*(\((?:pen\.|csc)\))?$/i), s = x[1], suite = x[2] ? " " + x[2] : "";   // « (pen.) », « (csc) » gardés à la fin
    if (!/\s/.test(s) || /\s\p{Lu}\.$/u.test(s)) return s + suite;      // un seul mot, ou déjà « Prénom N. » (noms venus de la FFF)
    let p = "", f = "";
    try { [p, f] = decoupeNom(s); } catch(e){ const y = s.split(/\s+/); p = y[0]; f = y.slice(1).join(" "); }
    p = p || s; return (f ? `${p} ${f.trim().charAt(0).toUpperCase()}.` : p) + suite;
  };
  const initiales = n => { let p = "", f = ""; try { [p, f] = decoupeNom(String(n || "")); } catch(e){ [p, f] = String(n || "").split(/\s+/); }
    return ((p || "").charAt(0) + (f || "").trim().charAt(0)).toUpperCase() || "?"; };

  /* ---------- carte d'un match, comme dans l'appli : étiquette, date, écussons, score ---------- */
  function journeeDe(m){
    if (estCoupe(m)) return 0;
    const eq = eqDe2(m), comp = String(m.comp || "");
    const l = (S.matchs || []).filter(x => eqDe2(x) === eq && !estCoupe(x) && String(x.comp || "") === comp)
      .sort((a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || "")));
    const i = l.findIndex(x => x.id === m.id);
    return i >= 0 ? i + 1 : 0;
  }
  const etiquette = m => { const j = /^pl-/.test(String(m.id)) ? 0 : journeeDe(m); return (m.comp || "Match") + (j ? " - Journée " + j : ""); };
  const dateCourte = m => {
    if (!m.date) return "";
    const d = jd(m.date);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(2)}${m.heure ? " | " + m.heure : ""}`;
  };
  const scoreDe = m => joue(m) ? `${m.dom ? m.bp : m.bc} - ${m.dom ? m.bc : m.bp}` : "-";
  const cotes = m => {
    const n = `<div class="mc-eq">${blasonNous()}<b>${H(nomNous(m))}</b></div>`;
    const a = `<div class="mc-eq">${blasonDe(m.adv)}<b>${H(String(m.adv || "Adversaire").trim())}</b></div>`;
    return m.dom ? [n, a] : [a, n];
  };
  function carteMatch(m){ return carteMatchLab(m, m ? etiquette(m) : ""); }
  function carteMatchLab(m, lab){
    if (!m) return "";
    const [g, d] = cotes(m);
    return `<button type="button" class="mc" data-fiche="${H(m.id)}"><span class="mc-label">${H(lab)}</span>${g}
      <div class="mc-centre"><small>${H(dateCourte(m))}</small><b>${scoreDe(m)}</b></div>${d}</button>`;
  }
  window.carteResultat = carteMatch;      // résultats, accueil, espace joueur : la même carte partout

  /* ---------- classement ---------- */
  function classementPour(nom){
    try {
      const k = slug(nom), l = Object.values(S.classements || {});
      return l.find(c => slug(joliEquipe(c.equipe || "")) === k)
        || (/·/.test(nom) ? null : (classementDe(nom) || l.find(c => slug(c.equipe || "").startsWith(k)))) || null;
    } catch(e){ return null; }
  }
  const compChamp = nom => ((S.matchs || []).find(m => eqDe2(m) === nom && !estCoupe(m) && m.comp) || {}).comp || "";
  function tableClassement2(c, adv){
    const l = trieCl(c.equipes || []);
    const estAdv = n => !!adv && slug(String(n || "")).replace(/-\d+$/, "") === slug(String(adv)).replace(/-\d+$/, "");
    return `<div class="cls"><div class="cls-tete"><span></span><span></span><span class="cls-or">Pts. ˅</span><span>J.</span><span>Diff.</span></div>
      ${l.map((e, i) => `<div class="cls-l${e.nous ? " nous" : ""}${estAdv(e.nom) ? " adv" : ""}"><span class="cls-rg">${e.rang || i + 1}</span>
        <span class="cls-eq">${e.nous ? blasonNous() : blasonDe(e.nom)}<b>${H(e.nom)}</b></span><span class="cls-pts">${points(e)}</span><span>${e.j || 0}</span><span>${diffDe(e)}</span></div>`).join("")}</div>`;
  }

  /* ---------- ÉQUIPES : la liste par catégorie, étoile pour les favoris ---------- */
  const FAV = "asf-favoris";
  const favoris = () => { try { const v = JSON.parse(localStorage.getItem(FAV) || "[]"); return Array.isArray(v) ? v : []; } catch(e){ return []; } };
  const basculerFavori = n => { const f = new Set(favoris()); f.has(n) ? f.delete(n) : f.add(n); try { localStorage.setItem(FAV, JSON.stringify([...f])); } catch(e){} };
  function equipesDuClub(){
    let l = []; try { l = equipesReelles(); } catch(e){}
    if (!l.length) try { l = (C().equipes || []).map(e => ({ nom: e.nom, niveau: e.niveau || "" })); } catch(e){}
    return l;
  }
  const groupeDe = n => { try { return groupeEquipe(n); } catch(e){ return n; } };
  function rendreListeEquipes(){
    const z = document.getElementById("eq-appli"); if (!z) return;
    const l = equipesDuClub(), f = new Set(favoris());
    const ligne = e => `<div class="eqa-l"><button type="button" class="hexa-b${f.has(e.nom) ? " on" : ""}" data-fav="${H(e.nom)}" aria-pressed="${f.has(e.nom)}" aria-label="${f.has(e.nom) ? "Retirer des favoris" : "Ajouter aux favoris"}">${ETOILE(f.has(e.nom))}</button>
      <a class="eqa-row" href="#equipe/${encodeURIComponent(e.nom)}"><span><b>${H(e.nom)}</b>${e.niveau ? `<small>${H(e.niveau)}</small>` : ""}</span>${CHEV}</a></div>`;
    const groupes = new Map();
    l.forEach(e => { const g = groupeDe(e.nom); if (!groupes.has(g)) groupes.set(g, []); groupes.get(g).push(e); });
    const favs = l.filter(e => f.has(e.nom));
    z.innerHTML = l.length
      ? (favs.length ? `<h3 class="eqa-g">Mes favoris</h3>${favs.map(ligne).join("")}` : "") + [...groupes].map(([g, eqs]) => `<h3 class="eqa-g">${H(g)}</h3>${eqs.map(ligne).join("")}`).join("")
      : `<p class="fa-vide">Les équipes s'afficheront ici dès que le calendrier sera chargé.</p>`;
  }

  /* ---------- PAGE D'UNE ÉQUIPE : résultats et calendrier, effectif, statistiques, classement ---------- */
  let eq = { nom: "", onglet: "resultats", mois: null };
  const equipeDuHash = () => { const r = location.hash.match(/^#equipe\/([^/?]*)/); try { return r ? decodeURIComponent(r[1]) : ""; } catch(e){ return ""; } };
  const matchsEquipe = nom => [...(S.matchs || []), ...(S.matchsAnimation || [])].filter(m => eqDe2(m) === nom)
    .sort((a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || "")));
  const auj = () => { try { return aujourdhui(); } catch(e){ return new Date().toISOString().slice(0, 10); } };
  function moisDefaut(ms){
    const a = auj(), ce = a.slice(0, 7);
    if (ms.some(m => String(m.date || "").startsWith(ce))) return ce;
    const futur = ms.find(m => String(m.date || "") >= a);
    if (futur) return futur.date.slice(0, 7);
    return ms.length ? String(ms[ms.length - 1].date || ce).slice(0, 7) : ce;
  }
  const moisPlus = (ym, n) => { const [y, mo] = ym.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; };
  function ongletResultats(nom){
    const ms = matchsEquipe(nom);
    if (!eq.mois) eq.mois = moisDefaut(ms);
    const duMois = ms.filter(m => String(m.date || "").startsWith(eq.mois));
    const normaux = duMois.filter(m => !/^pl-/.test(String(m.id))), plateaux = duMois.filter(m => /^pl-/.test(String(m.id)));
    const annee = eq.mois.slice(0, 4) !== auj().slice(0, 4) ? " " + eq.mois.slice(0, 4) : "";
    return `<h2 class="fa-mois">${MOIS_L2[+eq.mois.slice(5, 7) - 1]}${annee}</h2>
      <div class="fa-nav"><button type="button" data-eqm="-1">${FL_G}Mois précédent</button><button type="button" data-eqm="1">Mois suivant${FL_D}</button></div>
      ${normaux.length || plateaux.length ? `<div class="mc-liste">${normaux.map(carteMatch).join("")}${faGroupes(plateaux)}</div>`
        : `<p class="fa-vide">Aucun match ce mois-ci.</p>`}`;
  }
  function ongletEffectif(nom){
    let l = []; try { l = effectifDe(nom) || []; } catch(e){}
    if (!l.length) return `<p class="fa-vide">L'effectif de cette équipe n'est pas encore publié.</p>`;
    l = [...l].sort((a, b) => court(a.nom).localeCompare(court(b.nom), "fr"));
    return `<div class="eff">${l.map(j => `<div class="eff-l"><span class="eff-av">${H(initiales(j.nom))}</span>
      <b>${H(court(j.nom))}${j.num ? ` (n°${H(j.num)})` : ""}</b></div>`).join("")}</div>`;
  }
  const barres = o => { const t = Math.max(1, o.V + o.N + o.D);
    return ["V", "N", "D"].map(k => `<div class="st-b sb-${k}"><span>${k}</span><i><em style="width:${Math.round(o[k] / t * 100)}%"></em></i><b>${o[k]}</b></div>`).join(""); };
  function ongletStats(nom){
    const ms = matchsEquipe(nom).filter(m => !/^pl-/.test(String(m.id)) && joue(m));
    if (!ms.length) return `<p class="fa-vide">Les statistiques apparaîtront après les premiers matchs.</p>`;
    const serie = ms.slice(-5).map(m => issue(m));
    const bp = ms.reduce((s, m) => s + (+m.bp || 0), 0), bc = ms.reduce((s, m) => s + (+m.bc || 0), 0);
    const vnd = l => ({ V: l.filter(m => issue(m) === "V").length, N: l.filter(m => issue(m) === "N").length, D: l.filter(m => issue(m) === "D").length });
    let top = []; try { top = statsEquipe(nom) || []; } catch(e){}
    const buteurs = [...top].filter(x => +x.buts).sort((x, y) => y.buts - x.buts).slice(0, 5);
    const passeurs = [...top].filter(x => +x.passes).sort((x, y) => y.passes - x.passes).slice(0, 5);
    const liste = (titre, l, k) => l.length ? `<section class="st-bloc"><h3>${titre}</h3>${l.map((x, i) => `<div class="st-l"><span class="st-n">${i + 1}</span><span>${H(court(x.nom))}</span><b>${x[k]}</b></div>`).join("")}</section>` : "";
    return `<section class="st-bloc"><h3>Série en cours</h3><div class="st-serie">${blasonNous()}${serie.map(r => `<span class="hexa-r ${r}">${r}</span>`).join("")}</div></section>
      <section class="st-bloc st-deux"><div><h3>Buts marqués</h3><b class="st-gros">${bp}</b><small>${(bp / ms.length).toFixed(2)} / match</small></div>
        <div><h3>Buts encaissés</h3><b class="st-gros">${bc}</b><small>${(bc / ms.length).toFixed(2)} / match</small></div></section>
      <section class="st-bloc st-deux"><div><h3>À domicile</h3>${barres(vnd(ms.filter(m => m.dom)))}</div><div><h3>À l'extérieur</h3>${barres(vnd(ms.filter(m => !m.dom)))}</div></section>
      ${liste("Buteurs", buteurs, "buts")}${liste("Passeurs", passeurs, "passes")}`;
  }
  function ongletClassement(nom){
    const c = classementPour(nom);
    if (!c || !(c.equipes || []).length)
      return `<p class="fa-vide">${/·|U6|U7|U8|U9|U10|U11/.test(nom) ? "Pas de classement en foot d'animation." : "Le classement n'est pas encore publié."}</p>`;
    return `<h2 class="cls-titre">${H(compChamp(nom) || c.comp || c.titre || nom)}</h2>${tableClassement2(c)}`;
  }
  const ONG_EQ = [["resultats", "Résultats & calendrier"], ["effectif", "Effectif"], ["stats", "Statistiques"], ["classement", "Classement"]];
  function rendreEquipePage(){
    const z = document.getElementById("eqp"); if (!z) return;
    const nom = equipeDuHash(); if (!nom) return;
    if (eq.nom !== nom) eq = { nom, onglet: "resultats", mois: null };
    const fav = favoris().includes(nom);
    const corps = eq.onglet === "effectif" ? ongletEffectif(nom) : eq.onglet === "stats" ? ongletStats(nom)
      : eq.onglet === "classement" ? ongletClassement(nom) : ongletResultats(nom);
    z.innerHTML = `<div class="eqp-tete">
        <a class="hexa-b" href="#equipes" aria-label="Retour aux équipes">${RETOUR}</a>
        <h1 class="eqp-titre">${H(nom)}</h1>
        <button type="button" class="hexa-b${fav ? " on" : ""}" data-fav="${H(nom)}" aria-pressed="${fav}" aria-label="${fav ? "Retirer des favoris" : "Ajouter aux favoris"}">${ETOILE(fav)}</button>
        <a class="eqp-club" href="#club">${blasonNous()}<b>Atom'Sports Football Pierrelatte</b>${CHEV}</a></div>
      <nav class="club-onglets eqp-onglets" aria-label="${H(nom)}">${ONG_EQ.map(([k, l]) => `<button type="button" class="${eq.onglet === k ? "actif" : ""}" data-eqo="${k}">${l}</button>`).join("")}</nav>
      <div class="wrap eqp-corps">${corps}</div>`;
    const a = z.querySelector(".eqp-onglets .actif"), n = z.querySelector(".eqp-onglets");
    if (a && n && n.scrollWidth > n.clientWidth) n.scrollLeft = a.offsetLeft - (n.clientWidth - a.clientWidth) / 2;
  }

  /* ---------- LE CLUB : le staff (bureau et référents), avec « Lui écrire » ---------- */
  function rendreStaff(){
    const z = document.getElementById("club-staff"); if (!z) return;
    let l = []; try { l = [...(C().bureau || []), ...(C().referents || [])].filter(p => p && p.nom && !/compl[ée]ter/i.test(p.nom)); } catch(e){}
    const t = document.getElementById("club-staff-t");
    z.hidden = !l.length; if (t) t.hidden = !l.length;
    z.innerHTML = l.map((p, i) => `<div class="stf"><small>${H(p.role || "")}</small><b>${H(p.nom)}</b>
      <button type="button" class="stf-ecrire" data-staff="${i}">${ENVELOPPE}<span>Lui écrire</span></button></div>`).join("");
    z.onclick = ev => { const b = ev.target.closest("[data-staff]"); if (b && typeof ouvrirMessage === "function") ouvrirMessage(l[+b.dataset.staff]); };
  }

  /* ---------- suivi des pages : on redessine quand les données arrivent ---------- */
  let suiviSig = "", suiviTimer = null;
  const signature = () => [location.hash, (S.matchs || []).length, (S.matchsAnimation || []).length, Object.keys(S.classements || {}).length,
    Object.values(S.effectifs || {}).reduce((n, e) => n + ((e && e.joueurs) || []).length, 0), favoris().length,
    JSON.stringify((S.club && [S.club.bureau, S.club.referents]) || "").length, (S.matchs || []).reduce((n, m) => n + ((m.faits || []).length), 0)].join("|");
  function dessiner(){
    const h = location.hash;
    if (/^#equipe\//.test(h)) rendreEquipePage();
    else if (h === "#equipes") rendreListeEquipes();
    else if (h === "#club") rendreStaff();
  }
  function suivre(){
    clearInterval(suiviTimer);
    suiviSig = signature(); dessiner();
    if (/^#(equipes|equipe\/|club)/.test(location.hash)) suiviTimer = setInterval(() => { const s = signature(); if (s !== suiviSig){ suiviSig = s; dessiner(); } }, 2000);
  }
  window.addEventListener("hashchange", () => { if (!/^#equipe\//.test(location.hash)) eq.nom = ""; suivre(); });
  suivre();
  document.addEventListener("click", ev => {
    const t = ev.target.closest ? ev.target : null; if (!t) return;
    const f = t.closest("[data-fav]");
    if (f){ ev.preventDefault(); basculerFavori(f.dataset.fav); suiviSig = signature(); dessiner(); return; }
    const o = t.closest("[data-eqo]");
    if (o){ eq.onglet = o.dataset.eqo; rendreEquipePage(); return; }
    const mo = t.closest("[data-eqm]");
    if (mo){ eq.mois = moisPlus(eq.mois || moisDefaut(matchsEquipe(eq.nom)), +mo.dataset.eqm); rendreEquipePage(); return; }
    const c = t.closest("#eqp [data-fiche]");
    if (c) window.ouvrirFiche(c.dataset.fiche);
  });

  /* ---------- MATCHS : tous les matchs d'un week-end, toutes catégories, du premier au dernier ---------- */
  /* un « week-end » va du mercredi au mardi suivant (les matchs en semaine restent avec leur week-end) ; il est désigné par son samedi */
  const JOURS_L = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const isoJ = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dJ = iso => new Date(iso + "T12:00:00");
  const plusJ = (iso, n) => { const d = dJ(iso); d.setDate(d.getDate() + n); return isoJ(d); };
  const samediDe = iso => { const d = dJ(iso), w = d.getDay(); d.setDate(d.getDate() + (w >= 3 ? 6 - w : -(w + 1))); return isoJ(d); };
  const jourNum = d => d.getDate() === 1 ? "1er" : String(d.getDate());
  const CAL = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="1.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 13.5h2M11 13.5h2M14.5 13.5h2M7.5 17h2M11 17h2"/></svg>`;
  /* les plateaux des équipes actuelles du foot animation (pas les anciennes fiches : U13 en brassage, « U8 · U9 » d'avant…) */
  const plateauActuel = m => /^pl-/.test(String(m.id || "")) && (typeof CATS_AN === "undefined" || CATS_AN.some(c => c[0] === m.equipe));
  function duWeekend(sam){
    const de = plusJ(sam, -3), a = plusJ(sam, 3), dans = m => m && /^\d{4}-\d{2}-\d{2}$/.test(String(m.date || "")) && m.date >= de && m.date <= a;
    return { ms: (S.matchs || []).filter(dans), pls: (S.matchsAnimation || []).filter(m => dans(m) && plateauActuel(m)) };
  }
  const nbDu = sam => { const x = duWeekend(sam); return x.ms.length + x.pls.length; };
  /* par défaut : le week-end en cours ; pendant une trêve, le prochain qui a des matchs */
  function samediCourant(){
    const s0 = samediDe(auj());
    if (nbDu(s0)) return s0;
    for (let n = 1; n <= 16; n++) if (nbDu(plusJ(s0, 7 * n))) return plusJ(s0, 7 * n);
    for (let n = 1; n <= 16; n++) if (nbDu(plusJ(s0, -7 * n))) return plusJ(s0, -7 * n);
    return s0;
  }
  /* arrivé par « Résultats » : le dernier week-end où un match a été joué */
  function samediResultats(){
    const a = auj(), l = (S.matchs || []).filter(m => joue(m) && String(m.date || "") <= a).map(m => m.date).sort();
    return l.length ? samediDe(l[l.length - 1]) : samediCourant();
  }
  /* l'étiquette de la carte : l'équipe d'abord, sauf si la compétition dit déjà la catégorie (« U13 D1 », « Coupe U15 Gilbert Pestre »…) */
  function labelSemaine(m){
    const eq = eqDe2(m), e = etiquette(m), cat = (String(eq).match(/^(U\d{1,2})(?!\d)/i) || [])[1];
    if (cat && new RegExp("(^|[^a-z0-9])" + cat + "(?!\\d)", "i").test(String(m.comp || ""))) return e;
    return `${eq} · ${e}`;
  }
  const ordreEq = m => { try { return ordreOnglet(eqDe2(m)); } catch(e){ return String(eqDe2(m)); } };
  let mw = { sam: null, auto: "courant" };            // auto : le week-end suit les données tant qu'on n'a rien choisi
  let mwSig = "";
  function rendreSemaine(force){
    const z = document.getElementById("mw-zone"); if (!z) return;
    if (mw.auto) mw.sam = mw.auto === "resultats" ? samediResultats() : samediCourant();
    if (!mw.sam) mw.sam = samediDe(auj());
    const { ms, pls } = duWeekend(mw.sam);
    const jours = new Map(), ajoute = (date, heure, ordre, html) => { if (!jours.has(date)) jours.set(date, []); jours.get(date).push({ h: heure || "99:99", ordre, html }); };
    ms.forEach(m => ajoute(m.date, m.heure, ordreEq(m), carteMatchLab(m, labelSemaine(m))));
    const gr = new Map();
    pls.forEach(m => { const k = (m.fal && m.fal.cle) || [m.date, m.heure || "", m.adresse || "", m.dom ? "dom" : (m.adv || "")].join("|");
      if (!gr.has(k)) gr.set(k, []); gr.get(k).push(m); });
    [...gr.values()].forEach(g => ajoute(g[0].date, g[0].heure, "~" + ordreEq(g[0]), faCarte(g)));
    const s = dJ(mw.sam), d = dJ(plusJ(mw.sam, 1)), an = s.getFullYear() !== new Date().getFullYear() ? " " + s.getFullYear() : "";
    const titre = s.getMonth() === d.getMonth() ? `Week-end du ${jourNum(s)} au ${jourNum(d)} ${MOIS_L2[d.getMonth()]}${an}`
      : `Week-end du ${jourNum(s)} ${MOIS_L2[s.getMonth()]} au ${jourNum(d)} ${MOIS_L2[d.getMonth()]}${an}`;
    const nbP = gr.size;
    const compte = ms.length || nbP ? [ms.length ? `${ms.length} match${ms.length > 1 ? "s" : ""}` : "", nbP ? `${nbP} plateau${nbP > 1 ? "x" : ""}` : ""].filter(Boolean).join(" et ") + " · toutes catégories"
      : "Aucun match ce week-end";
    const ici = mw.sam === samediDe(auj());
    const corps = [...jours.keys()].sort().map(j => {
      const l = jours.get(j).sort((a, b) => a.h.localeCompare(b.h) || String(a.ordre).localeCompare(String(b.ordre)));
      const dj = dJ(j), nom = JOURS_L[dj.getDay()];
      return `<h3 class="mw-jour">${nom.charAt(0).toUpperCase() + nom.slice(1)} ${jourNum(dj)} ${MOIS_L2[dj.getMonth()]}</h3><div class="mc-liste">${l.map(x => x.html).join("")}</div>`;
    }).join("");
    const html = `<h2 class="fa-mois mw-titre">${H(titre)}</h2>
      <div class="mw-nav">
        <button type="button" class="mw-fl" data-mw="-1" aria-label="Week-end précédent">${FL_G}</button>
        <button type="button" class="mw-cal" data-mw-cal aria-label="Choisir le week-end dans le calendrier">${CAL}<span>Calendrier</span></button>
        <button type="button" class="mw-fl" data-mw="1" aria-label="Week-end suivant">${FL_D}</button></div>
      <label class="mw-dp" hidden>Choisir un week-end<input type="hidden" data-mw-date data-dp="1" data-dp-requis="1" value="${H(mw.sam)}"></label>
      <p class="mw-info">${H(compte)}${ici ? "" : ` · <button type="button" class="mw-auj" data-mw-auj>Revenir à ce week-end</button>`}</p>
      ${corps || `<p class="fa-vide">Aucun match ni plateau ce week-end.<br>Touche les flèches ou le calendrier pour changer de week-end.</p>`}`;
    if (!force && (html === mwSig || document.getElementById("dp-zone"))) return;   // rien de changé, ou le calendrier est ouvert : on attend
    mwSig = html; z.innerHTML = html;
  }
  /* changer de week-end : flèches, calendrier, retour à ce week-end ; une carte ouvre la page du match ou du plateau */
  document.addEventListener("click", ev => {
    const t = ev.target.closest ? ev.target : null; if (!t || !t.closest("#mw-zone")) return;
    const f = t.closest("[data-mw]");
    if (f){ mw = { sam: plusJ(mw.sam || samediDe(auj()), 7 * +f.dataset.mw), auto: false }; rendreSemaine(true); return; }
    if (t.closest("[data-mw-auj]")){ mw = { sam: null, auto: "courant" }; rendreSemaine(true); return; }
    if (t.closest("[data-mw-cal]")){
      const i = document.querySelector("#mw-zone [data-mw-date]");
      if (i && typeof dpOuvrir === "function") dpOuvrir(i);
      return;
    }
    const c = t.closest("[data-fiche]");
    if (c) window.ouvrirFiche(c.dataset.fiche);
  });
  document.addEventListener("change", ev => {
    const i = ev.target.closest && ev.target.closest("#mw-zone [data-mw-date]"); if (!i || !/^\d{4}-\d{2}-\d{2}$/.test(i.value)) return;
    mw = { sam: samediDe(i.value), auto: false }; rendreSemaine(true);
  });
  /* redessiné à chaque arrivée de données (scores, nouveaux matchs) ; à chaque ouverture de l'onglet, on repart du week-end en cours */
  const avantRM = window.rendreMatchs;
  if (typeof avantRM === "function") window.rendreMatchs = function(){
    try { return avantRM.apply(this, arguments); } finally { try { rendreSemaine(); } catch(e){ console.warn("matchs du week-end", e); } }
  };
  function ouvrirSemaine(){
    if (location.hash !== "#calendrier") return;
    mw = { sam: null, auto: Date.now() - MW.resultats < 3000 ? "resultats" : "courant" };
    rendreSemaine(true);
  }
  window.addEventListener("hashchange", ouvrirSemaine);
  if (location.hash === "#calendrier") ouvrirSemaine(); else rendreSemaine(true);

  /* ---------- PAGE D'UN MATCH : résumé, classement, infos ---------- */
  const cle = min => { const p = String(min || "").match(/(\d+)(?:\s*\+\s*(\d+))?/); return p ? +p[1] + (p[2] ? +p[2] / 100 : 0) : 999; };
  const minTxt = min => { const p = String(min || "").match(/(\d+)(?:\s*\+\s*(\d+))?/); return p ? p[1] + (p[2] ? "+" + p[2] : "") : ""; };
  const ICO = {
    but: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.8 2.8-1.4 4.5H9.6L8.2 10.3z"/><path d="M12 3v4.5M15.8 10.3l4.6-1.5M14.4 14.8l2.8 3.9M9.6 14.8l-2.8 3.9M8.2 10.3L3.6 8.8"/></svg>`,
    rempl: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14l-3.5-3.5" stroke="#D02E26"/><path d="M20 16H6l3.5 3.5" stroke="#3374B0"/></svg>`,
    jaune: `<span class="fr-carton jaune" aria-hidden="true"></span>`,
    rouge: `<span class="fr-carton rouge" aria-hidden="true"></span>`,
  };
  const LIB = { but: "But", jaune: "Carton jaune", rouge: "Carton rouge", rempl: "Remplacement" };
  const PIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  const TERRAIN = `<svg class="terrain-ico" viewBox="0 0 40 28" aria-hidden="true"><rect x="1" y="1" width="38" height="26"/><path d="M20 1v26"/><circle cx="20" cy="14" r="4.5"/><rect x="1" y="8" width="6" height="12"/><rect x="33" y="8" width="6" height="12"/></svg>`;
  /* un fait de match, côté gauche (équipe qui reçoit) ou droit */
  function evenement(f, m){
    const gauche = (f.c === "nous") === !!m.dom;
    const qui = f.j ? H(court(f.j)) : (f.c === "nous" ? H(nous()) : H(advNom(m)));
    let txt;
    if (f.t === "rempl") txt = `<span><b>${f.j2 ? H(court(f.j2)) : "Entrée"}</b><b>${qui}</b></span>`;
    else if (f.t === "but") txt = `<span><b>${qui}</b>${f.j2 ? `<small>passe : ${H(court(f.j2))}</small>` : ""}</span>`;
    else txt = `<span><b>${qui}</b></span>`;
    return `<div class="fr-ligne"><div class="fr-ev ${gauche ? "g" : "d"}"><span class="fr-ico" title="${LIB[f.t] || ""}">${ICO[f.t] || ""}</span>${txt}</div>
      <span class="fr-min">${minTxt(f.min) || "–"}</span></div>`;
  }
  /* buteurs saisis par le coach sans minute (« Buteurs et passeurs ») */
  function blocButeurs(m){
    const st = (Array.isArray(m.stats) ? m.stats : []).filter(s => s && (+s.buts || +s.passes));
    if (!st.length) return "";
    const buteurs = st.filter(s => +s.buts).map(s => `<span>${ICO.but}${H(court(s.nom))}${+s.buts > 1 ? ` ×${+s.buts}` : ""}</span>`).join("");
    const passeurs = st.filter(s => +s.passes).map(s => `<span>${H(court(s.nom))}${+s.passes > 1 ? ` ×${+s.passes}` : ""}</span>`).join("");
    return `${buteurs ? `<p class="fr-titre">Buteurs ${H(nous())}</p><div class="fr-sans-min">${buteurs}</div>` : ""}
      ${passeurs ? `<p class="fr-titre">Passes décisives</p><div class="fr-sans-min">${passeurs}</div>` : ""}`;
  }
  function resumeHtml(m){
    const faits = (Array.isArray(m.faits) ? m.faits : []).filter(f => f && LIB[f.t]);
    if (faits.length){
      const l = [...faits].sort((a, b) => cle(a.min) - cle(b.min));
      const avant = l.filter(f => cle(f.min) <= 45.99), apres = l.filter(f => cle(f.min) > 45.99);
      const fin = joue(m) ? `<div class="fr-ligne"><span class="fr-repere">Fin du match</span></div>` : "";
      // la FFF ne donne les buteurs que s'ils sont notés sur la feuille de match : on le dit, et on montre ceux du coach
      const butsNous = l.filter(f => f.t === "but" && f.c === "nous").length, butsEux = l.filter(f => f.t === "but" && f.c === "eux").length;
      const manque = joue(m) && (m.bp > butsNous || m.bc > butsEux);
      const coach = !butsNous ? blocButeurs(m) : "";
      return `<section class="fm-resume" aria-label="Résumé du match">
        <div class="fr-ligne"><span class="fr-repere">Début du match</span></div>
        ${avant.map(f => evenement(f, m)).join("")}
        ${avant.length && apres.length ? `<div class="fr-ligne"><span class="fr-repere mt">Mi-temps</span></div>` : ""}
        ${apres.map(f => evenement(f, m)).join("")}${fin}
        ${coach}${manque && !coach ? `<p class="fr-note">Buteurs pas tous renseignés sur la feuille de match.</p>` : ""}</section>`;
    }
    const b = blocButeurs(m);
    return b ? `<section class="fm-resume" aria-label="Buteurs et passeurs">${b}</section>` : "";
  }
  const peutSaisir = m => {
    try {
      if (!m || /^pl-/.test(m.id) || !peutCoacher()) return false;
      const autor = equipesAutorisees();
      return !autor.length || autor.includes(m.equipe) || autor.includes(eqDe(m));
    } catch(e){ return false; }
  };
  function lieuHtml(m){
    let adresse = "";
    try { adresse = m.adresse || (m.dom ? (typeof ADRESSE_STADE !== "undefined" ? ADRESSE_STADE : "") : lieuMatch(m)); } catch(e){}
    if (!adresse) return "";
    const stade = m.dom ? (() => { try { return C().stade; } catch(e){ return ""; } })() : "";
    return `<div class="fm-lieu"><h4>Lieu de la rencontre</h4>${TERRAIN}
      <div>${stade ? `<b>${H(stade)}</b>` : `<b>${m.dom ? "À domicile" : "Chez " + H(advNom(m))}</b>`}<span>${H(adresse)}</span></div>
      <a class="pin" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}" target="_blank" rel="noopener" aria-label="Voir sur le plan">${PIN}</a></div>`;
  }
  /* la page s'ouvre en haut, le focus sur « retour » (et non sur un lien du bas de la fiche) */
  function enHaut(d){ const b = d.querySelector(".mx-retour"); if (b) try { b.focus({ preventScroll: true }); } catch(e){} d.scrollTop = 0; }
  function montrer(d, k){
    d.querySelectorAll("[data-mxo]").forEach(b => b.classList.toggle("actif", b.dataset.mxo === k));
    d.querySelectorAll(".mx-p").forEach(p => { p.hidden = p.dataset.p !== k; });
  }
  function pageMatch(id){
    const m = trouve(id), d = $1("#fiche-match"); if (!m || !d) return;
    const corps = d.querySelector(".fm-corps"); if (!corps) return;
    // infos : le lieu en tête, sans répéter l'adresse
    const lieu = lieuHtml(m);
    if (lieu){
      corps.querySelectorAll(".fm-ligne").forEach(l => { const b = l.querySelector("b"); if (b && /^adresse$/i.test(b.textContent.trim())) l.remove(); });
      corps.insertAdjacentHTML("afterbegin", lieu);
    }
    if (/^pl-/.test(String(m.id))){                                        // plateau : la fiche du foot d'animation, avec un retour en haut
      const tp = d.querySelector(".fm-tete");
      if (tp && !tp.querySelector(".mx-retour")) tp.insertAdjacentHTML("afterbegin", `<button type="button" class="hexa-b mx-retour" data-a="fermer-fiche" aria-label="Fermer">${RETOUR}</button>`);
      enHaut(d);
      return;
    }
    const tete = d.querySelector(".fm-tete");
    const [g, dr] = cotes(m);
    const j = joue(m), actif = j ? "resume" : "infos";
    const ong = [...(j ? [["resume", "Résumé"]] : []), ["classement", "Classement"], ["infos", "Infos du match"]];
    const c = classementPour(eqDe2(m));
    const saisir = peutSaisir(m) && j ? `<div class="btns" style="justify-content:center;margin-top:14px"><button type="button" class="btn bleu" data-fm="editer">⚽ ${(m.faits || []).length ? "Modifier" : "Saisir"} les faits de match</button></div>` : "";
    const mx = document.createElement("div");
    mx.className = "mx";
    mx.innerHTML = `<div class="mx-tete"><button type="button" class="hexa-b mx-retour" data-a="fermer-fiche" aria-label="Fermer">${RETOUR}</button>
        <span class="mc-label">${H(etiquette(m))}</span>
        <div class="mx-duel">${g}<div class="mc-centre"><small>${H(dateCourte(m))}</small><b>${scoreDe(m)}</b></div>${dr}</div></div>
      <nav class="club-onglets mx-onglets">${ong.map(([k, l]) => `<button type="button" data-mxo="${k}" class="${k === actif ? "actif" : ""}">${l}</button>`).join("")}</nav>
      <div class="mx-p" data-p="resume" ${actif === "resume" ? "" : "hidden"}><h2 class="mx-h">Résumé</h2>
        ${resumeHtml(m) || `<p class="fa-vide">Le résumé de ce match n'est pas encore disponible.</p>`}${saisir}</div>
      <div class="mx-p" data-p="classement" ${actif === "classement" ? "" : "hidden"}>${c && (c.equipes || []).length
        ? `<h2 class="mx-h">${H(compChamp(eqDe2(m)) || c.comp || "Classement")}</h2>${tableClassement2(c, m.adv)}` : `<p class="fa-vide">Classement pas encore publié.</p>`}</div>
      <div class="mx-p" data-p="infos" ${actif === "infos" ? "" : "hidden"}></div>`;
    mx.querySelector('[data-p="infos"]').appendChild(corps);
    if (tete) tete.remove();
    d.appendChild(mx);
    enHaut(d);
  }
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest("#fiche-match [data-mxo]"); if (!b) return;
    montrer($1("#fiche-match"), b.dataset.mxo);
  });

  /* ---------- saisie des faits de match (coachs et bureau), dans l'onglet Résumé ---------- */
  let ed = null;   // { id, faits }
  function editeurHtml(m){
    const eff = (() => { try { return effectifDe(m.equipe) || []; } catch(e){ return []; } })();
    const liste = [...ed.faits].map((f, i) => ({ f, i })).sort((a, b) => cle(a.f.min) - cle(b.f.min));
    const ligne = ({ f, i }) => `<li class="fe-l"><span class="fe-min">${minTxt(f.min) || "–"}'</span><span class="fr-ico">${ICO[f.t] || ""}</span>
      <span class="fe-t"><b>${H(LIB[f.t])}</b> · ${f.c === "nous" ? H(nous()) : H(advNom(m))}${f.j ? " · " + H(f.j) : ""}${f.j2 ? (f.t === "rempl" ? " → " : " (passe : ") + H(f.j2) + (f.t === "rempl" ? "" : ")") : ""}</span>
      <button type="button" class="fe-x" data-fm="retirer" data-i="${i}" aria-label="Retirer">×</button></li>`;
    return `<div class="fe">
      <h2 class="mx-h">Faits de match</h2>
      <p class="fe-aide">Buts, cartons et remplacements : ils s'affichent dans le résumé du match. Les buts et passes de ${H(nous())} comptent aussi dans « Buteurs et passeurs ».</p>
      <ul class="fe-liste">${liste.map(ligne).join("") || `<li class="fe-vide">Aucun fait de match pour l'instant.</li>`}</ul>
      <div class="fe-form">
        <label>Quoi<select data-fe="t"><option value="but">⚽ But</option><option value="jaune">🟨 Carton jaune</option><option value="rouge">🟥 Carton rouge</option><option value="rempl">🔁 Remplacement</option></select></label>
        <label>Minute<input data-fe="min" inputmode="numeric" placeholder="ex. 52 ou 45+2" maxlength="6"></label>
        <label>Équipe<select data-fe="c"><option value="nous">${H(nous())}</option><option value="eux">${H(advNom(m))}</option></select></label>
        <label><span data-fe-l1>Buteur</span><input data-fe="j" list="fe-joueurs" placeholder="Nom (facultatif pour l'adversaire)"></label>
        <label data-fe-z2><span data-fe-l2>Passeur (facultatif)</span><input data-fe="j2" list="fe-joueurs" placeholder="Nom"></label>
        <datalist id="fe-joueurs">${eff.map(j => `<option value="${H(j.nom)}">`).join("")}</datalist>
        <div class="fe-ajout"><button type="button" class="btn contour petit" data-fm="ajouter">+ Ajouter</button></div>
      </div>
      <div class="btns" style="justify-content:center"><button type="button" class="btn bleu" data-fm="enregistrer">Enregistrer</button>
        <button type="button" class="btn contour" data-fm="annuler">Annuler</button></div></div>`;
  }
  function libelles(z){
    const t = z.querySelector('[data-fe="t"]').value;
    z.querySelector("[data-fe-l1]").textContent = t === "but" ? "Buteur" : t === "rempl" ? "Joueur qui sort" : "Joueur";
    z.querySelector("[data-fe-l2]").textContent = t === "but" ? "Passeur (facultatif)" : "Joueur qui entre";
    z.querySelector("[data-fe-z2]").hidden = t === "jaune" || t === "rouge";
  }
  function ouvrirEditeur(id){
    const m = trouve(id), d = $1("#fiche-match"); if (!m || !d) return;
    if (!ed || ed.id !== id) ed = { id, faits: JSON.parse(JSON.stringify(Array.isArray(m.faits) ? m.faits : [])) };
    const zone = d.querySelector('.mx-p[data-p="resume"]') || d.querySelector(".fm-corps"); if (!zone) return;
    zone.innerHTML = editeurHtml(m);
    montrer(d, "resume");
    libelles(zone);
  }
  /* buteurs et passeurs de l'espace joueur : recalculés pour les joueurs cités dans les faits */
  function statsDepuis(m, faits){
    const cites = new Set();
    [...(m.faits || []), ...faits].forEach(f => { if (f && f.c === "nous" && f.t === "but"){ if (f.j) cites.add(f.j); if (f.j2) cites.add(f.j2); } });
    if (!cites.size) return null;
    const tot = {};
    faits.forEach(f => { if (f.c !== "nous" || f.t !== "but") return;
      if (f.j){ (tot[f.j] = tot[f.j] || { nom: f.j, buts: 0, passes: 0 }).buts++; }
      if (f.j2){ (tot[f.j2] = tot[f.j2] || { nom: f.j2, buts: 0, passes: 0 }).passes++; } });
    const garde = (Array.isArray(m.stats) ? m.stats : []).filter(s => s && !cites.has(s.nom));
    return [...garde, ...Object.values(tot)].filter(s => s.buts || s.passes);
  }
  document.addEventListener("change", ev => {
    const s = ev.target.closest && ev.target.closest('#fiche-match [data-fe="t"]');
    if (s) libelles(s.closest(".fe"));
  });
  document.addEventListener("click", async ev => {
    const b = ev.target.closest && ev.target.closest("#fiche-match [data-fm]"); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const a = b.dataset.fm, d = $1("#fiche-match");
    if (a === "editer"){ const id = d && d.dataset.match; if (id) ouvrirEditeur(id); return; }
    if (!ed) return;
    const m = trouve(ed.id); if (!m) return;
    const z = b.closest(".fe");
    if (a === "retirer"){ ed.faits.splice(+b.dataset.i, 1); ouvrirEditeur(ed.id); return; }
    if (a === "ajouter"){
      const v = k => (z.querySelector(`[data-fe="${k}"]`).value || "").trim();
      const t = v("t"), min = v("min").replace(/[^\d+]/g, ""), c = v("c"), j = v("j").slice(0, 60), j2 = v("j2").slice(0, 60);
      if (!/^\d{1,3}(\+\d{1,2})?$/.test(min)){ toast("Indique la minute (par exemple 52, ou 45+2).", true); return; }
      if (c === "nous" && !j){ toast("Indique le nom du joueur.", true); return; }
      if (t === "rempl" && !j2 && c === "nous"){ toast("Indique le joueur qui entre.", true); return; }
      const f = { t, min, c }; if (j) f.j = j; if (j2 && t !== "jaune" && t !== "rouge") f.j2 = j2;
      ed.faits.push(f); ouvrirEditeur(ed.id); return;
    }
    if (a === "annuler"){ const id = ed.id; ed = null; window.ouvrirFiche(id); return; }
    if (a === "enregistrer"){
      const faits = ed.faits.map(f => ({ ...f }));
      const maj = { faits }, stats = statsDepuis(m, faits);
      if (stats) maj.stats = stats;
      b.disabled = true;
      const ok = await ecrire(() => S.db.doc("matchs/" + m.id).update(maj), "Faits de match enregistrés.");
      b.disabled = false;
      if (!ok) return;
      m.faits = faits; if (stats) m.stats = stats;
      const id = ed.id; ed = null; window.ouvrirFiche(id);
    }
  }, true);

  /* la fiche s'ouvre en page de match ; rouverte après une saisie, on la referme d'abord */
  const avantFiche = window.ouvrirFiche;
  window.ouvrirFiche = function(id){
    const d = $1("#fiche-match");
    if (d){ d.dataset.match = id; if (d.open && d.close) d.close(); }
    if (ed && ed.id !== id) ed = null;
    const r = avantFiche.apply(this, arguments);
    try { pageMatch(id); } catch(e){ console.warn("fiche", e); }
    return r;
  };
})();
</script>
