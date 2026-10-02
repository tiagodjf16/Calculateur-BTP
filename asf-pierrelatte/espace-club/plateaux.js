/* Matchs et plateaux › foot animation : chaque rendez-vous est un plateau, un brassage ou des poules.
   Plateau / brassage : les équipes rencontrées, avec l'heure de chaque match et le score (brassage, U10 · U11, U13).
   Poules : chaque poule avec toutes ses équipes (plusieurs équipes du même club possibles : Pierrelatte 1, 2, 3…),
   les matchs créés chacun contre chacun, avec leur heure et leur score.
   Enregistré dans la fiche du rendez-vous (matchs/pl-…) : format, rencontres, poules ; adversaires et resultats sont
   tenus à jour pour le reste de l'application. Le serveur des affiches lit ces fiches (affiches.php, afn_depuis_base).
   Ajouté sans modifier le script de l'application : on remplace seulement la partie « Équipes rencontrées » des fiches. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.panAnimation !== "function" || typeof CATS_AN === "undefined") return;
  const NOUS = /pierrelatte|atom'?\s*sports?/i;
  const LETTRES = "ABCDEFGH";
  const uidc = () => Math.random().toString(36).slice(2, 9);
  const vide = v => v === "" || v === null || v === undefined;
  const joli = n => { try { return typeof joliClub === "function" ? joliClub(n) : String(n || ""); } catch(err){ return String(n || ""); } };
  const docDe = id => (S.matchsAnimation || []).find(x => x.id === id) || {};
  const avecScores = m => { const c = CATS_AN.find(c => c[0] === m.equipe); return !!(c && c[2]); };

  /* ---------- brouillon de chaque fiche (gardé tant qu'il n'est pas enregistré) ---------- */
  function depuisDoc(m){
    const r = Array.isArray(m.resultats) ? m.resultats : [];
    const rencontres = Array.isArray(m.rencontres) ? m.rencontres.filter(p => p && p.adv).map(p => ({ heure: p.heure || "", adv: String(p.adv), bp: p.bp ?? "", bc: p.bc ?? "" }))
      : (Array.isArray(m.adversaires) ? m.adversaires : []).filter(Boolean).map(a => { const x = r.find(y => y.adv === a) || {}; return { heure: "", adv: String(a), bp: x.bp ?? "", bc: x.bc ?? "" }; });
    const poules = (Array.isArray(m.poules) ? m.poules : []).filter(q => q && typeof q === "object").map(q => ({
      equipes: (Array.isArray(q.equipes) ? q.equipes : []).filter(e => e && e.id && e.club).map(e => ({ id: String(e.id), club: String(e.club), n: +e.n || 0 })),
      matchs: (Array.isArray(q.matchs) ? q.matchs : []).filter(p => p && p.a && p.b).map(p => ({ heure: p.heure || "", a: String(p.a), b: String(p.b), sa: p.sa ?? "", sb: p.sb ?? "" })) }));
    return { format: ["plateau", "brassage", "poules"].includes(m.format) ? m.format : (/brassage/i.test(m.comp || "") ? "brassage" : "plateau"), rencontres, poules, modifie: false };
  }
  const brouillons = () => S.ui.anPl || (S.ui.anPl = {});
  function etat(id){
    const b = brouillons()[id];
    return b && b.modifie ? b : (brouillons()[id] = depuisDoc(docDe(id)));
  }
  const toucher = d => { d.modifie = true; };

  /* le même club plusieurs fois sur le plateau (toutes poules) : 1, 2, 3 dans l'ordre des poules ; Pierrelatte 1, 2, 3 */
  const cle = e => NOUS.test(e.club) ? "nous" : slug(String(e.club).replace(/\s+\d+$/, ""));
  function renumeroter(d){
    const tous = d.poules.flatMap(q => q.equipes), compte = {}, vu = {};
    tous.forEach(e => { compte[cle(e)] = (compte[cle(e)] || 0) + 1; });
    tous.forEach(e => { const k = cle(e); e.n = compte[k] > 1 ? (vu[k] = (vu[k] || 0) + 1) : 0; });
  }
  const nomEq = e => NOUS.test(e.club) ? "Pierrelatte" : joli(String(e.club).replace(/\s+\d+$/, ""));
  const libelle = e => nomEq(e) + (e.n ? " " + e.n : "");
  const logo = nom => { try { return typeof logoEquipeT === "function" ? logoEquipeT(nom) : ""; } catch(err){ return ""; } };

  /* ---------- l'éditeur, à la place de « Équipes rencontrées » ---------- */
  function ligne(p, j, sc){
    return `<div class="anp-l">
      <span class="anp-h"><input type="time" data-anp-f="heure" data-j="${j}" value="${esc(p.heure)}" aria-label="Heure du match"></span>
      <input readonly data-club-pick data-anp-f="adv" data-j="${j}" value="${esc(p.adv)}" placeholder="Touche pour choisir le club" aria-label="Équipe rencontrée">
      ${sc ? `<span class="anp-sc"><input type="number" min="0" max="99" inputmode="numeric" data-anp-f="bp" data-j="${j}" value="${esc(p.bp)}" placeholder="Nous" aria-label="Buts de Pierrelatte"><span>–</span><input type="number" min="0" max="99" inputmode="numeric" data-anp-f="bc" data-j="${j}" value="${esc(p.bc)}" placeholder="Eux" aria-label="Buts de l'adversaire"></span>` : ""}
      <button type="button" class="btn contour petit" data-anp-a="r-suppr" data-j="${j}" aria-label="Retirer ce match">✕</button></div>`;
  }
  function poule(q, iq, sc, nb){
    const at = j => `data-q="${iq}"${j === undefined ? "" : ` data-j="${j}"`}`;
    const opts = sel => q.equipes.map(e => `<option value="${esc(e.id)}" ${e.id === sel ? "selected" : ""}>${esc(libelle(e))}</option>`).join("");
    const nom = id => { const e = q.equipes.find(x => x.id === id); return e ? libelle(e) : ""; };
    return `<div class="anp-poule">
      <div class="anp-pt"><b>Poule ${LETTRES[iq]}</b>${nb > 1 ? `<button type="button" class="btn contour petit" data-anp-a="p-suppr" ${at()}>Retirer la poule</button>` : ""}</div>
      <div class="anp-eqs">${q.equipes.map((e, j) => `<span class="anp-eq${NOUS.test(e.club) ? " nous" : ""}">${logo(NOUS.test(e.club) ? "Pierrelatte" : e.club)}${esc(libelle(e))}<button type="button" data-anp-a="e-suppr" ${at(j)} aria-label="Retirer ${esc(libelle(e))}">✕</button></span>`).join("")}
        ${q.equipes.length < 12 ? `<button type="button" class="anp-plus" data-anp-a="e-ajout" ${at()}>+ Ajouter une équipe</button><input type="hidden" data-anp-add="${iq}">` : ""}</div>
      ${q.matchs.length ? `<b class="anp-lab">Les matchs${sc ? " et les scores" : ""}</b>` : q.equipes.length < 2 ? `<small class="quoi">Ajoute les équipes de la poule : les matchs se créent tout seuls.</small>` : ""}
      ${q.matchs.map((p, j) => `<div class="anp-m${sc ? " sc" : ""}">
        <span class="anp-h"><input type="time" data-anp-m="heure" ${at(j)} value="${esc(p.heure)}" aria-label="Heure du match"></span>
        <select data-anp-m="a" ${at(j)} aria-label="Équipe">${opts(p.a)}</select>
        ${sc ? `<input type="number" min="0" max="99" inputmode="numeric" data-anp-m="sa" ${at(j)} value="${esc(p.sa)}" aria-label="Buts de ${esc(nom(p.a))}">` : ""}
        <span class="anp-t">–</span>
        ${sc ? `<input type="number" min="0" max="99" inputmode="numeric" data-anp-m="sb" ${at(j)} value="${esc(p.sb)}" aria-label="Buts de ${esc(nom(p.b))}">` : ""}
        <select data-anp-m="b" ${at(j)} aria-label="Équipe">${opts(p.b)}</select>
        <button type="button" class="btn contour petit" data-anp-a="m-suppr" ${at(j)} aria-label="Retirer ce match">✕</button></div>`).join("")}
      ${q.equipes.length > 1 ? `<button type="button" class="btn contour petit" data-anp-a="m-ajout" ${at()}>+ Un match</button>` : ""}
    </div>`;
  }
  function editeur(id, m){
    const d = etat(id), sc = avecScores(m) || d.format === "brassage";
    const fmt = (k, lb) => `<button type="button" class="as-fmt ${d.format === k ? "on" : ""}" aria-pressed="${d.format === k}" data-anp-a="format" data-k="${k}">${lb}</button>`;
    let corps;
    if (d.format === "poules"){
      if (!d.poules.length) d.poules.push({ equipes: [], matchs: [] });
      corps = `<p class="quoi anp-aide">Chaque poule avec toutes ses équipes. Plusieurs équipes du même club peuvent être dans la même poule : elles sont numérotées toutes seules (Pierrelatte 1, 2, 3…). Les matchs se créent tout seuls, chacun contre chacun : mets l'heure${sc ? " et le score" : ""} de chacun, retire ceux qui ne se jouent pas.</p>
        ${d.poules.map((q, iq) => poule(q, iq, sc, d.poules.length)).join("")}
        ${d.poules.length < LETTRES.length ? `<button type="button" class="btn contour petit" data-anp-a="p-ajout">+ Une poule (${LETTRES[d.poules.length]})</button>` : ""}`;
    } else {
      corps = `<b class="an-titre">Équipes rencontrées${sc ? " et scores" : ""}</b>
        ${d.rencontres.map((p, j) => ligne(p, j, sc)).join("") || `<small class="quoi">Aucune équipe rencontrée pour l'instant.</small>`}
        ${d.rencontres.length < 12 ? `<button type="button" class="btn contour petit" data-anp-a="r-ajout">+ Une équipe rencontrée</button>` : ""}`;
    }
    return `<div class="an-advs anp" data-anp="${esc(id)}">
      <b class="an-titre">Organisation</b>
      <div class="anp-format" role="group" aria-label="Organisation">${fmt("plateau", "⚽ Plateau")}${fmt("brassage", "🔁 Brassage")}${fmt("poules", "🗂️ Poules")}</div>
      ${corps}
      ${d.modifie ? `<span class="an-brouillon">● modifications pas encore enregistrées : touche « Enregistrer »</span>` : ""}</div>`;
  }
  /* fiche repliée : le résumé dit aussi les poules */
  function resume(id){
    const d = etat(id);
    if (d.format !== "poules" || !d.poules.some(q => q.equipes.length)) return "";
    renumeroter(d);
    return `<span class="pl-eqs">${d.poules.filter(q => q.equipes.length).map((q, iq) => `<span class="pl-eq"><b>Poule ${LETTRES[iq]}</b> ${esc(q.equipes.map(libelle).join(", "))}</span>`).join("")}</span>`;
  }
  const avant = window.panAnimation;
  window.panAnimation = function(){
    const h = avant.apply(this, arguments);
    if (!/class="an-carte/.test(h)) return h;
    const t = document.createElement("template"); t.innerHTML = h;
    t.content.querySelectorAll("article.an-carte[data-an]").forEach(a => {
      const id = a.dataset.an, m = docDe(id);
      if (a.classList.contains("pliee")){
        const r = resume(id), z = a.querySelector(".pl-eqs, .pl-vide");
        if (r && z) z.outerHTML = r;
        return;
      }
      const x = a.querySelector(".an-advs"); if (x) x.outerHTML = editeur(id, m);
    });
    return t.innerHTML;
  };

  /* ---------- saisie ---------- */
  const carteDe = el => el.closest && el.closest("article.an-carte[data-an]");
  const redessiner = () => rendrePanneau();
  function ouvrirClubs(input, avecNous){
    if (typeof ouvrirPickClub !== "function") return;
    ouvrirPickClub(input);
    if (avecNous){                                                       // poules : « notre club » en tête de la liste
      try {
        pickTournoi = true;                                              // la recherche propose aussi notre club et les districts voisins
        const z = document.getElementById("pick-liste");
        if (z) z.insertAdjacentHTML("afterbegin", `<button type="button" class="pick-club" data-club-choix="ATOM'SPORTS FOOTBALL PIERRELATTE"><span class="pick-logo"><img src="img/blason.png" alt=""></span><span><b>Pierrelatte</b><small>notre club · plusieurs équipes : Pierrelatte 1, 2, 3…</small></span></button>`);
      } catch(err){}
    }
  }
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest("[data-anp-a]"); if (!b) return;
    const carte = carteDe(b); if (!carte) return;
    const id = carte.dataset.an, d = etat(id), a = b.dataset.anpA, j = +b.dataset.j, q = b.dataset.q !== undefined ? d.poules[+b.dataset.q] : null;
    ev.preventDefault();
    if (a === "format"){ if (d.format === b.dataset.k) return; d.format = b.dataset.k; if (d.format === "poules" && !d.poules.length) d.poules.push({ equipes: [], matchs: [] }); }
    else if (a === "r-ajout"){
      d.rencontres.push({ heure: "", adv: "", bp: "", bc: "" }); toucher(d); redessiner();
      const n = d.rencontres.length - 1;
      setTimeout(() => { const i = document.querySelector(`article[data-an="${CSS.escape(id)}"] [data-anp-f="adv"][data-j="${n}"]`); if (i) ouvrirClubs(i, false); }, 60);
      return;
    }
    else if (a === "r-suppr"){ d.rencontres.splice(j, 1); }
    else if (a === "p-ajout"){ if (d.poules.length < LETTRES.length) d.poules.push({ equipes: [], matchs: [] }); }
    else if (a === "p-suppr"){ if (!q) return; if (q.equipes.length && !confirm(`Retirer la poule ${LETTRES[+b.dataset.q]} et ses matchs ?`)) return; d.poules.splice(+b.dataset.q, 1); renumeroter(d); }
    else if (a === "e-ajout"){ const i = carte.querySelector(`[data-anp-add="${b.dataset.q}"]`); if (i){ i.value = ""; ouvrirClubs(i, true); } return; }
    else if (a === "e-suppr"){
      const e = q && q.equipes[j]; if (!e) return;
      const ms = q.matchs.filter(p => p.a === e.id || p.b === e.id);
      if (ms.some(p => p.heure || !vide(p.sa) || !vide(p.sb)) && !confirm(`Retirer ${libelle(e)} et ses matchs ?`)) return;
      q.equipes.splice(j, 1); q.matchs = q.matchs.filter(p => !ms.includes(p)); renumeroter(d);
    }
    else if (a === "m-ajout"){ if (!q || q.equipes.length < 2) return; q.matchs.push({ heure: "", a: q.equipes[0].id, b: q.equipes[1].id, sa: "", sb: "" }); }
    else if (a === "m-suppr"){ if (!q) return; q.matchs.splice(j, 1); }
    else return;
    toucher(d); redessiner();
  });
  ["input", "change"].forEach(ty => document.addEventListener(ty, ev => {
    const t = ev.target; if (!t.matches || !t.matches("[data-anp-f], [data-anp-m], [data-anp-add]")) return;
    const carte = carteDe(t); if (!carte) return;
    const d = etat(carte.dataset.an);
    if (t.matches("[data-anp-add]")){                                    // équipe choisie dans la liste des clubs
      if (ty !== "change" || !t.value) return;
      const q = d.poules[+t.dataset.anpAdd]; if (!q) return;
      const e = { id: uidc(), club: t.value, n: 0 };
      q.matchs.push(...q.equipes.map(o => ({ heure: "", a: o.id, b: e.id, sa: "", sb: "" })));   // chacun contre chacun
      q.equipes.push(e); t.value = "";
      renumeroter(d); toucher(d); redessiner(); return;
    }
    if (t.matches("[data-anp-f]")){
      const p = d.rencontres[+t.dataset.j], k = t.dataset.anpF; if (!p || p[k] === t.value) return;
      p[k] = t.value; toucher(d);
      if (k === "adv" && ty === "change") redessiner();
      return;
    }
    const q = d.poules[+t.dataset.q], p = q && q.matchs[+t.dataset.j], k = t.dataset.anpM; if (!p || p[k] === t.value) return;
    p[k] = t.value; toucher(d);
    if ((k === "a" || k === "b") && ty === "change") redessiner();
  }));

  /* ---------- enregistrer : la fiche avec son organisation, ses horaires et ses scores ---------- */
  const nombre = v => vide(v) || isNaN(+v) ? null : Math.max(0, Math.min(99, Math.round(+v)));
  async function enregistrer(carte, id){
    const v = k => { const e = carte.querySelector(`[data-anc="${k}"]`); return e ? e.value.trim() : ""; };
    const m = docDe(id), d = etat(id);
    renumeroter(d);
    const rencontres = d.rencontres.filter(p => String(p.adv || "").trim()).map(p => ({ heure: /^\d{2}:\d{2}$/.test(p.heure || "") ? p.heure : "", adv: String(p.adv).trim(), bp: nombre(p.bp), bc: nombre(p.bc) }));
    const poules = d.poules.map(q => ({ equipes: q.equipes.map(e => ({ id: e.id, club: e.club, n: e.n || 0 })),
      matchs: q.matchs.filter(p => p.a !== p.b).map(p => ({ heure: /^\d{2}:\d{2}$/.test(p.heure || "") ? p.heure : "", a: p.a, b: p.b, sa: nombre(p.sa), sb: nombre(p.sb) })) })).filter(q => q.equipes.length);
    // pour le reste de l'application (résumé de la fiche, anciennes affiches) : adversaires et scores de Pierrelatte
    let adversaires, resultats;
    if (d.format === "poules"){
      const nom = e => NOUS.test(e.club) ? libelle(e) : String(e.club).replace(/\s+\d+$/, "") + (e.n ? " " + e.n : "");
      adversaires = [...new Set(poules.flatMap(q => q.equipes).filter(e => !NOUS.test(e.club)).map(nom))];
      resultats = poules.flatMap(q => q.matchs.map(p => {
        const a = q.equipes.find(e => e.id === p.a), b = q.equipes.find(e => e.id === p.b);
        if (!a || !b || p.sa === null || p.sb === null || NOUS.test(a.club) === NOUS.test(b.club)) return null;
        return NOUS.test(a.club) ? { adv: nom(b), bp: p.sa, bc: p.sb } : { adv: nom(a), bp: p.sb, bc: p.sa };
      })).filter(Boolean);
    } else {
      adversaires = rencontres.map(p => p.adv);
      resultats = rencontres.filter(p => p.bp !== null && p.bc !== null).map(p => ({ adv: p.adv, bp: p.bp, bc: p.bc }));
    }
    const nouvelleEquipe = v("equipe"), cible = nouvelleEquipe ? (CATS_AN.find(c => c[0] === nouvelleEquipe) || []) : null;
    const dom = v("dom") !== "0";
    const comp = d.format === "brassage" ? "Brassage" : d.format === "plateau" ? "Plateau" : ((cible && cible[1]) || m.comp || "Plateau");
    const ok = await ecrire(() => S.db.doc("matchs/" + id).set({ ...m, id: undefined, _maj: undefined,
      ...(cible ? { equipe: cible[0] } : {}), comp,
      date: v("date") || m.date, heure: v("heure") || m.heure || "10:00", dom,
      adv: dom ? "" : (v("adv") || m.adv || ""), adresse: v("adresse") || (dom ? ADRESSE_CLUB : (m.adresse || "")),
      adversaires, resultats, bp: null, bc: null,
      format: d.format, rencontres, poules }), "Rendez-vous enregistré.");
    if (!ok) return;
    if (S.ui.anBrouillon) delete S.ui.anBrouillon[id];
    delete brouillons()[id];
    replier(id);
    if (cible) S.ui.anCat = cible[0];
    rendrePanneau();
  }
  // « Enregistrer » d'une fiche foot animation : notre enregistrement (avec l'organisation) remplace celui de l'application
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest('[data-a="an-save"]'); if (!b) return;
    const carte = carteDe(b); if (!carte || !carte.querySelector(".anp")) return;
    ev.preventDefault(); ev.stopImmediatePropagation();
    enregistrer(carte, carte.dataset.an);
  }, true);
  // « Annuler les changements » / « Replier » : le brouillon de l'organisation part aussi
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest('[data-a="carte-replier"]'); if (!b) return;
    const d = brouillons()[b.dataset.id]; if (d) delete brouillons()[b.dataset.id];
  }, true);

  /* ---------- styles ---------- */
  const css = document.createElement("style");
  css.id = "plateaux-css";
  css.textContent = `
.anp-format{display:flex;flex-wrap:wrap;gap:6px}
.anp-format .as-fmt{min-height:44px;padding:10px 14px;font-size:15px}
.anp-aide{margin:0;font-size:14px}
.anp-l,.anp-m{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:8px;align-items:center}
.anp-m{grid-template-columns:auto minmax(0,1fr) auto minmax(0,1fr) auto}
.anp-m.sc{grid-template-columns:auto minmax(0,1fr) 56px auto 56px minmax(0,1fr) auto}
.anp-h .tp-champ{width:auto;min-width:0;min-height:44px;height:44px;padding:6px 10px;gap:6px;border-style:solid;font-size:15px;white-space:nowrap}
.anp-h .tp-champ.vide span:last-child{font-size:0}
.anp-h .tp-champ.vide span:last-child::after{content:"Heure";font-size:15px}
.anp-sc{display:flex;align-items:center;gap:6px}
.anp-sc input,.anp-m input[type=number]{width:56px;text-align:center;font-weight:800;padding-left:4px;padding-right:4px}
.anp-t{font-weight:800;color:var(--texte-doux)}
.anp-poule{border:1px solid var(--ligne);border-radius:12px;padding:10px;display:grid;gap:8px;background:rgba(143,168,240,.06)}
.anp-pt{display:flex;align-items:center;gap:10px}.anp-pt b{font:800 16px var(--corps);margin-right:auto}
.anp-eqs{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.anp-eq{display:inline-flex;align-items:center;gap:6px;padding:4px 4px 4px 8px;border-radius:999px;border:1px solid var(--ligne);background:rgba(28,99,196,.16);font:700 14px var(--corps)}
.anp-eq.nous{border-color:var(--or,#E3B64C);background:rgba(227,182,76,.16)}
.anp-eq img{width:22px;height:22px;object-fit:contain;border-radius:50%;background:#fff}
.anp-eq button{border:0;background:none;color:inherit;font:800 14px var(--corps);cursor:pointer;min-width:32px;min-height:32px;border-radius:999px}
.anp-plus{border:1px dashed var(--ligne);background:none;color:var(--bleu-texte,#8FC2FF);font:700 14px var(--corps);border-radius:999px;padding:8px 14px;cursor:pointer;min-height:40px}
.anp-lab{font:800 13px var(--corps);letter-spacing:.06em;text-transform:uppercase;color:var(--texte-doux)}
.anp-m select{padding-left:8px;padding-right:22px;text-overflow:ellipsis}
@media (max-width:620px){
  .anp-l{grid-template-columns:auto minmax(0,1fr) auto}
  .anp-l .anp-sc{grid-column:1/-1}
  .anp-m,.anp-m.sc{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);border:1px solid var(--ligne);border-radius:10px;padding:6px}
  .anp-m .anp-h{grid-column:1/3}.anp-m > button{grid-column:3;justify-self:end}
  .anp-m select[data-anp-m="a"]{grid-column:1;grid-row:2}.anp-m .anp-t{grid-column:2;grid-row:2}.anp-m select[data-anp-m="b"]{grid-column:3;grid-row:2}
  .anp-m.sc input[data-anp-m="sa"]{grid-column:1;grid-row:3;justify-self:end}.anp-m.sc input[data-anp-m="sb"]{grid-column:3;grid-row:3;justify-self:start}
}`;
  document.head.appendChild(css);
})();
