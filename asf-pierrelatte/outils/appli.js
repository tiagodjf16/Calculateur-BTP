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
  const ONGLET_DE = { resultats: "matchs", classement: "matchs", calendrier: "matchs", tournois: "matchs", legal: "", confidentialite: "", espaces: "" };
  function majOnglets(){
    const h = (location.hash.slice(1) || "accueil").split("?")[0];
    const o = h in ONGLET_DE ? ONGLET_DE[h] : h;
    const nav = document.getElementById("club-onglets");
    if (nav){
      let actif = null;
      nav.querySelectorAll("a").forEach(a => { const on = a.dataset.o === o; a.classList.toggle("actif", on); if (on) actif = a; a.setAttribute("aria-current", on ? "page" : "false"); });
      if (actif && nav.scrollWidth > nav.clientWidth) nav.scrollTo({ left: actif.offsetLeft - (nav.clientWidth - actif.clientWidth) / 2, behavior: "smooth" });
    }
    // barre du bas : « Matchs » reste allumé sur résultats, classement, tournois et foot d'animation
    const m = document.querySelector('.tabbar a[data-p="calendrier"]');
    if (m && ["resultats", "classement", "tournois", "animation"].includes(h)) m.classList.add("actif");
  }
  window.addEventListener("hashchange", () => setTimeout(majOnglets, 0));
  majOnglets();

  /* ---------- FOOT D'ANIMATION : les plateaux du mois, comme dans l'appli ---------- */
  let faDecal = 0, faSig = "", faTimer = null;
  const MOIS_L2 = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
  const escA = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const FL_G = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>`, FL_D = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
  const TERR = `<svg viewBox="0 0 34 24" aria-hidden="true"><rect x="1" y="1" width="32" height="22"/><path d="M17 1v22"/><circle cx="17" cy="12" r="4"/><path d="M1 7h5v10H1M33 7h-5v10h5"/></svg>`;
  const GENS = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.4"/><circle cx="4.5" cy="9.5" r="2"/><path d="M3.5 19.5c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5M14.6 14.4c.7-.4 1.5-.6 2.4-.6 2.2 0 3.8 1.3 4.3 3.8M1.5 17c.3-1.6 1.2-2.6 2.6-2.9"/></svg>`;
  const PIN2 = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  const logoClub = () => (typeof LOGO_SRC !== "undefined" ? `<span class="cl-blason"><img src="${LOGO_SRC}" alt=""></span>` : "");
  const nomClub = "Atom'Sports Football Pierrelatte";
  function rendreAnimation(force){
    const z = document.getElementById("fa-zone"); if (!z || typeof S === "undefined") return;
    const l0 = Array.isArray(S.matchsAnimation) ? S.matchsAnimation : [];
    const sig = faDecal + "|" + l0.length + "|" + l0.map(m => m.id + (m.date || "") + (m.heure || "")).join(",").length;
    if (!force && sig === faSig) return;
    faSig = sig;
    const auj = new Date(), d = new Date(auj.getFullYear(), auj.getMonth() + faDecal, 1);
    const pref = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const groupes = new Map();
    l0.filter(m => m && String(m.date || "").startsWith(pref)).forEach(m => {
      const k = (m.fal && m.fal.cle) || [m.date, m.heure || "", m.adresse || "", m.dom ? "dom" : (m.adv || "")].join("|");
      if (!groupes.has(k)) groupes.set(k, []);
      groupes.get(k).push(m);
    });
    const liste = [...groupes.values()].sort((a, b) => (a[0].date + (a[0].heure || "")).localeCompare(b[0].date + (b[0].heure || "")));
    const carte = g => {
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
    };
    z.innerHTML = `<h2 class="fa-mois">${MOIS_L2[d.getMonth()]} ${d.getFullYear()}</h2>
      <div class="fa-nav"><button type="button" data-fa-mois="-1">${FL_G}Mois précédent</button><button type="button" data-fa-mois="1">Mois suivant${FL_D}</button></div>
      ${liste.length ? `<div class="fa-liste">${liste.map(carte).join("")}</div>`
        : `<p class="fa-vide">Aucun plateau ni brassage ce mois-ci.<br>Les dates sont ajoutées par le club dans l'espace dirigeants, onglet Foot animation.</p>`}`;
  }
  document.addEventListener("click", ev => {
    const n = ev.target.closest && ev.target.closest("[data-fa-mois]");
    if (n){ faDecal += +n.dataset.faMois; rendreAnimation(true); return; }
    if (ev.target.closest && ev.target.closest("[data-fa-pin]")) return;          // l'épingle ouvre le plan, pas la fiche
    const c = ev.target.closest && ev.target.closest("[data-fa]");
    if (c && typeof window.ouvrirFiche === "function") window.ouvrirFiche(c.dataset.fa);
  });
  document.addEventListener("keydown", ev => {
    if (ev.key !== "Enter" && ev.key !== " ") return;
    const c = ev.target.closest && ev.target.closest("article[data-fa]");
    if (c && typeof window.ouvrirFiche === "function"){ ev.preventDefault(); window.ouvrirFiche(c.dataset.fa); }
  });
  function suivreAnimation(){
    clearInterval(faTimer);
    if (location.hash !== "#animation") return;
    rendreAnimation(true);
    faTimer = setInterval(() => rendreAnimation(false), 2500);                      // les plateaux arrivent après l'ouverture
  }
  window.addEventListener("hashchange", suivreAnimation);
  suivreAnimation();

  /* ---------- fiche d'un match ---------- */
  if (typeof S === "undefined" || typeof window.ouvrirFiche !== "function") return;
  const esc2 = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const nous = () => { try { return C().nomCourt || "Pierrelatte"; } catch(e){ return "Pierrelatte"; } };
  const advNom = m => String(m.adv || "Adversaire").replace(/\s+\d+$/, "");
  const trouve = id => (S.matchs || []).find(x => x.id === id) || (S.matchsAnimation || []).find(x => x.id === id);
  const cle = min => { const p = String(min || "").match(/(\d+)(?:\s*\+\s*(\d+))?/); return p ? +p[1] + (p[2] ? +p[2] / 100 : 0) : 999; };
  const minTxt = min => { const p = String(min || "").match(/(\d+)(?:\s*\+\s*(\d+))?/); return p ? p[1] + (p[2] ? "+" + p[2] : "") + "'" : ""; };
  const ICO = {
    but: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7.5l3.8 2.8-1.4 4.5H9.6L8.2 10.3z"/><path d="M12 3v4.5M15.8 10.3l4.6-1.5M14.4 14.8l2.8 3.9M9.6 14.8l-2.8 3.9M8.2 10.3L3.6 8.8"/></svg>`,
    rempl: `<svg viewBox="0 0 24 24" fill="none" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h14l-3.5-3.5" stroke="#05DAC7"/><path d="M20 16H6l3.5 3.5" stroke="#E30613"/></svg>`,
    jaune: `<span class="fr-carton jaune" aria-hidden="true"></span>`,
    rouge: `<span class="fr-carton rouge" aria-hidden="true"></span>`,
  };
  const LIB = { but: "But", jaune: "Carton jaune", rouge: "Carton rouge", rempl: "Remplacement" };
  const PIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;
  const TERRAIN = `<svg class="terrain-ico" viewBox="0 0 40 28" aria-hidden="true"><rect x="1" y="1" width="38" height="26"/><path d="M20 1v26"/><circle cx="20" cy="14" r="4.5"/><rect x="1" y="8" width="6" height="12"/><rect x="33" y="8" width="6" height="12"/></svg>`;

  /* un fait de match, côté gauche (équipe qui reçoit) ou droit */
  function evenement(f, m){
    const gauche = (f.c === "nous") === !!m.dom;
    const qui = f.j ? esc2(f.j) : (f.c === "nous" ? esc2(nous()) : esc2(advNom(m)));
    let txt = "";
    if (f.t === "but") txt = `<span><b>${qui}</b>${f.j2 ? `<small>passe : ${esc2(f.j2)}</small>` : ""}</span>`;
    else if (f.t === "rempl") txt = `<span><b>${f.j2 ? esc2(f.j2) : "Entrée"}</b><small>sort : ${qui}</small></span>`;
    else txt = `<span><b>${qui}</b></span>`;
    return `<div class="fr-ligne"><div class="fr-ev ${gauche ? "g" : "d"}"><span class="fr-ico" title="${LIB[f.t] || ""}">${ICO[f.t] || ""}</span>${txt}</div>
      <span class="fr-min">${minTxt(f.min) || "–"}</span></div>`;
  }
  function resumeHtml(m){
    const faits = (Array.isArray(m.faits) ? m.faits : []).filter(f => f && LIB[f.t]);
    if (faits.length){
      const l = [...faits].sort((a, b) => cle(a.min) - cle(b.min));
      const avant = l.filter(f => cle(f.min) <= 45.99), apres = l.filter(f => cle(f.min) > 45.99);
      const fin = typeof joue === "function" && joue(m)
        ? `<div class="fr-ligne"><span class="fr-repere mt">Fin du match · ${m.dom ? m.bp : m.bc} - ${m.dom ? m.bc : m.bp}</span></div>` : "";
      return `<section class="fm-resume" aria-label="Résumé du match"><h4>Résumé</h4>
        <div class="fr-ligne"><span class="fr-repere">Coup d'envoi</span></div>
        ${avant.map(f => evenement(f, m)).join("")}
        ${avant.length && apres.length ? `<div class="fr-ligne"><span class="fr-repere mt">Mi-temps</span></div>` : ""}
        ${apres.map(f => evenement(f, m)).join("")}${fin}</section>`;
    }
    const st = (Array.isArray(m.stats) ? m.stats : []).filter(s => s && (+s.buts || +s.passes));
    if (!st.length) return "";
    const buteurs = st.filter(s => +s.buts).map(s => `<span>${ICO.but}${esc2(s.nom)}${+s.buts > 1 ? ` ×${+s.buts}` : ""}</span>`).join("");
    const passeurs = st.filter(s => +s.passes).map(s => `<span>${esc2(s.nom)}${+s.passes > 1 ? ` ×${+s.passes}` : ""}</span>`).join("");
    return `<section class="fm-resume" aria-label="Buteurs et passeurs"><h4>Buteurs ${esc2(nous())}</h4>
      ${buteurs ? `<div class="fr-sans-min">${buteurs}</div>` : ""}
      ${passeurs ? `<div class="fr-sans-min" style="color:var(--f-txt-2)"><small style="width:100%;text-align:center;color:var(--f-txt-3)">Passes décisives</small>${passeurs}</div>` : ""}</section>`;
  }
  const peutSaisir = m => {
    try {
      if (!m || /^pl-/.test(m.id) || !peutCoacher()) return false;
      const autor = equipesAutorisees();
      return !autor.length || autor.includes(m.equipe) || autor.includes(eqDe(m));
    } catch(e){ return false; }
  };

  function enrichir(id){
    const m = trouve(id), d = $1("#fiche-match"); if (!m || !d) return;
    const corps = d.querySelector(".fm-corps"); if (!corps) return;
    // lieu de la rencontre : stade, adresse et épingle rouge vers le plan
    let adresse = "";
    try { adresse = m.adresse || (m.dom ? (typeof ADRESSE_STADE !== "undefined" ? ADRESSE_STADE : "") : lieuMatch(m)); } catch(e){}
    if (adresse){
      const stade = m.dom ? (() => { try { return C().stade; } catch(e){ return ""; } })() : "";
      const q = encodeURIComponent(adresse);
      corps.querySelectorAll(".fm-ligne").forEach(l => { const b = l.querySelector("b"); if (b && /^adresse$/i.test(b.textContent.trim())) l.remove(); });
      corps.insertAdjacentHTML("afterbegin", `<div class="fm-lieu"><h4>Lieu de la rencontre</h4>${TERRAIN}
        <div>${stade ? `<b>${esc2(stade)}</b>` : `<b>${m.dom ? "À domicile" : "Chez " + esc2(advNom(m))}</b>`}<span>${esc2(adresse)}</span></div>
        <a class="pin" href="https://www.google.com/maps/search/?api=1&query=${q}" target="_blank" rel="noopener" aria-label="Voir sur le plan">${PIN}</a></div>`);
    }
    if (/^pl-/.test(m.id)) return;
    const r = resumeHtml(m);
    if (r) corps.insertAdjacentHTML("afterbegin", r);
    if (peutSaisir(m)){
      const n = (m.faits || []).length;
      const btns = corps.querySelector(".btns");
      const html = `<button type="button" class="btn bleu petit" data-fm="editer">⚽ Faits de match${n ? ` (${n})` : ""}</button>`;
      if (btns) btns.insertAdjacentHTML("afterbegin", html); else corps.insertAdjacentHTML("beforeend", `<div class="btns">${html}</div>`);
    }
  }
  const avantFiche = window.ouvrirFiche;
  window.ouvrirFiche = function(id){
    const r = avantFiche.apply(this, arguments);
    try { enrichir(id); } catch(e){ console.warn("fiche", e); }
    return r;
  };

  /* ---------- saisie des faits de match (coachs et bureau) ---------- */
  let ed = null;   // { id, faits }
  function editeurHtml(m){
    const eff = (() => { try { return effectifDe(m.equipe) || []; } catch(e){ return []; } })();
    const liste = [...ed.faits].map((f, i) => ({ f, i })).sort((a, b) => cle(a.f.min) - cle(b.f.min));
    const ligne = ({ f, i }) => `<li class="fe-l"><span class="fe-min">${minTxt(f.min) || "–"}</span><span class="fr-ico">${ICO[f.t] || ""}</span>
      <span class="fe-t"><b>${esc2(LIB[f.t])}</b> · ${f.c === "nous" ? esc2(nous()) : esc2(advNom(m))}${f.j ? " · " + esc2(f.j) : ""}${f.j2 ? (f.t === "rempl" ? " → " : " (passe : ") + esc2(f.j2) + (f.t === "rempl" ? "" : ")") : ""}</span>
      <button type="button" class="fe-x" data-fm="retirer" data-i="${i}" aria-label="Retirer">×</button></li>`;
    return `<div class="fe">
      <h4 class="fe-titre">Faits de match</h4>
      <p class="fe-aide">Buts, cartons et remplacements : ils s'affichent dans le résumé du match. Les buts et passes de ${esc2(nous())} comptent aussi dans « Buteurs et passeurs ».</p>
      <ul class="fe-liste">${liste.map(ligne).join("") || `<li class="fe-vide">Aucun fait de match pour l'instant.</li>`}</ul>
      <div class="fe-form">
        <label>Quoi<select data-fe="t"><option value="but">⚽ But</option><option value="jaune">🟨 Carton jaune</option><option value="rouge">🟥 Carton rouge</option><option value="rempl">🔁 Remplacement</option></select></label>
        <label>Minute<input data-fe="min" inputmode="numeric" placeholder="ex. 52 ou 45+2" maxlength="6"></label>
        <label>Équipe<select data-fe="c"><option value="nous">${esc2(nous())}</option><option value="eux">${esc2(advNom(m))}</option></select></label>
        <label><span data-fe-l1>Buteur</span><input data-fe="j" list="fe-joueurs" placeholder="Nom (facultatif pour l'adversaire)"></label>
        <label data-fe-z2><span data-fe-l2>Passeur (facultatif)</span><input data-fe="j2" list="fe-joueurs" placeholder="Nom"></label>
        <datalist id="fe-joueurs">${eff.map(j => `<option value="${esc2(j.nom)}">`).join("")}</datalist>
        <div class="fe-ajout"><button type="button" class="btn contour petit" data-fm="ajouter">+ Ajouter</button></div>
      </div>
      <div class="btns" style="justify-content:center"><button type="button" class="btn bleu" data-fm="enregistrer">Enregistrer</button>
        <button type="button" class="btn contour" data-fm="annuler">Retour à la fiche</button></div></div>`;
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
    const corps = d.querySelector(".fm-corps"); if (!corps) return;
    corps.innerHTML = editeurHtml(m);
    libelles(corps);
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
    if (a === "editer"){
      const id = d && d.dataset.match; if (id) ouvrirEditeur(id); return;
    }
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
  // la fiche ouverte garde l'identifiant du match (pour le bouton « Faits de match »)
  const avantFiche2 = window.ouvrirFiche;
  window.ouvrirFiche = function(id){
    const d = $1("#fiche-match");
    if (d){ d.dataset.match = id; if (d.open && d.close) d.close(); }   // rouverte après une saisie : on la referme d'abord
    if (ed && ed.id !== id) ed = null;
    return avantFiche2.apply(this, arguments);
  };

  const css = document.createElement("style");
  css.id = "appli-faits-css";
  css.textContent = `
#fiche-match .fe{padding:2px 2px 4px}
#fiche-match .fe-titre{font:700 24px var(--f-titre);letter-spacing:.02em;text-transform:uppercase;color:var(--f-txt);margin:4px 0 4px}
#fiche-match .fe-aide{font:400 14px var(--f-ui);color:var(--f-txt-3);margin-bottom:12px}
#fiche-match .fe-liste{list-style:none;margin:0 0 14px;padding:0;background:var(--f-panel);border-radius:var(--f-rayon)}
#fiche-match .fe-l{display:grid;grid-template-columns:44px 22px minmax(0,1fr) 36px;gap:8px;align-items:center;padding:9px 8px;border-bottom:1px solid var(--f-line);font:400 14px/1.25 var(--f-ui);color:var(--f-txt)}
#fiche-match .fe-l:last-child{border-bottom:0}
#fiche-match .fe-min{font:700 16px var(--f-ui);text-align:center}
#fiche-match .fe-t b{font-weight:700}
#fiche-match .fe-x{width:34px;height:34px;border-radius:2px;border:1px solid var(--f-line-2);background:none;color:#FF6B74;font-size:20px;cursor:pointer}
#fiche-match .fe-vide{padding:14px;color:var(--f-txt-3);font:400 14px var(--f-ui);text-align:center}
#fiche-match .fe-form{display:grid;grid-template-columns:1fr 1fr;gap:10px;background:var(--f-panel);border-radius:var(--f-rayon);padding:12px;margin-bottom:14px}
#fiche-match .fe-form label{display:grid;gap:5px;font:600 13px var(--f-titre);letter-spacing:.05em;text-transform:uppercase;color:var(--f-txt-3)}
#fiche-match .fe-form label[hidden]{display:none}
#fiche-match .fe-form input,#fiche-match .fe-form select{font:400 16px var(--f-ui);text-transform:none;letter-spacing:0;padding:9px 10px;width:100%}
#fiche-match .fe-ajout{grid-column:1/-1;display:flex;justify-content:flex-end}
@media (max-width:420px){ #fiche-match .fe-form{grid-template-columns:1fr} }`;
  document.head.appendChild(css);
})();
</script>
