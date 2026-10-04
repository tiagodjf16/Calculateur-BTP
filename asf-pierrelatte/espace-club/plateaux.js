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

  /* ---------- l'éditeur de la fiche, rangé en étapes : 1 Quand et où · 2 Organisation · 3 Équipes · 4 Enregistrer ---------- */
  const FORMATS = {
    plateau: { ico: "⚽", nom: "Plateau", dit: "Pierrelatte rencontre plusieurs équipes, l'une après l'autre." },
    brassage: { ico: "🔁", nom: "Brassage", dit: "Comme un plateau, avec le score de chaque match." },
    poules: { ico: "🗂️", nom: "Poules", dit: "Les équipes sont réparties en poules (A, B…), chacune joue contre toutes les autres de sa poule." },
  };
  const etape = (n, titre, html, cls) => `<section class="anp-etape${cls ? " " + cls : ""}"><div class="anp-et"><span class="anp-num">${n}</span><b>${titre}</b></div>${html}</section>`;
  function ligne(p, j, sc){
    return `<div class="anp-l${sc ? " sc" : ""}">
      <span class="anp-h"><input type="time" data-anp-f="heure" data-j="${j}" value="${esc(p.heure)}" aria-label="Heure du match"></span>
      <input readonly data-club-pick data-anp-f="adv" data-j="${j}" value="${esc(p.adv)}" placeholder="Touche pour choisir le club" aria-label="Équipe rencontrée">
      ${sc ? `<span class="anp-sc"><small>Nous</small><input type="number" min="0" max="99" inputmode="numeric" data-anp-f="bp" data-j="${j}" value="${esc(p.bp)}" aria-label="Buts de Pierrelatte"><span>–</span><input type="number" min="0" max="99" inputmode="numeric" data-anp-f="bc" data-j="${j}" value="${esc(p.bc)}" aria-label="Buts de l'adversaire"><small>Eux</small></span>` : ""}
      <button type="button" class="anp-x" data-anp-a="r-suppr" data-j="${j}" aria-label="Retirer ce match" title="Retirer ce match">✕</button></div>`;
  }
  function poule(q, iq, sc, nb){
    const at = j => `data-q="${iq}"${j === undefined ? "" : ` data-j="${j}"`}`;
    const opts = sel => q.equipes.map(e => `<option value="${esc(e.id)}" ${e.id === sel ? "selected" : ""}>${esc(libelle(e))}</option>`).join("");
    const nom = id => { const e = q.equipes.find(x => x.id === id); return e ? libelle(e) : ""; };
    return `<div class="anp-poule">
      <div class="anp-pt"><b>Poule ${LETTRES[iq]}</b><span class="anp-pn">${q.equipes.length} équipe${q.equipes.length > 1 ? "s" : ""} · ${q.matchs.length} match${q.matchs.length > 1 ? "s" : ""}</span>${nb > 1 ? `<button type="button" class="btn danger petit" data-anp-a="p-suppr" ${at()}>Retirer la poule</button>` : ""}</div>
      <div class="anp-eqs">${q.equipes.map((e, j) => `<span class="anp-eq${NOUS.test(e.club) ? " nous" : ""}">${logo(NOUS.test(e.club) ? "Pierrelatte" : e.club)}${esc(libelle(e))}<button type="button" data-anp-a="e-suppr" ${at(j)} aria-label="Retirer ${esc(libelle(e))}">✕</button></span>`).join("")}
        ${q.equipes.length < 12 ? `<button type="button" class="anp-plus" data-anp-a="e-ajout" ${at()}>+ Ajouter une équipe</button><input type="hidden" data-anp-add="${iq}">` : ""}</div>
      ${q.matchs.length ? `<b class="anp-lab">Les matchs${sc ? " et les scores" : ""}</b>` : q.equipes.length < 2 ? `<small class="quoi">Ajoute les équipes de la poule : les matchs se créent tout seuls.</small>` : ""}
      ${q.matchs.map((p, j) => `<div class="anp-m${sc ? " sc" : ""}">
        <span class="anp-h"><input type="time" data-anp-m="heure" ${at(j)} value="${esc(p.heure)}" aria-label="Heure du match"></span>
        <select data-anp-m="a" ${at(j)} aria-label="Équipe">${opts(p.a)}</select>
        ${sc ? `<input type="number" min="0" max="99" inputmode="numeric" data-anp-m="sa" ${at(j)} value="${esc(p.sa)}" aria-label="Buts de ${esc(nom(p.a))}">` : ""}
        <span class="anp-t">${sc ? "–" : "contre"}</span>
        ${sc ? `<input type="number" min="0" max="99" inputmode="numeric" data-anp-m="sb" ${at(j)} value="${esc(p.sb)}" aria-label="Buts de ${esc(nom(p.b))}">` : ""}
        <select data-anp-m="b" ${at(j)} aria-label="Équipe">${opts(p.b)}</select>
        <button type="button" class="anp-x" data-anp-a="m-suppr" ${at(j)} aria-label="Retirer ce match" title="Retirer ce match">✕</button></div>`).join("")}
      ${q.equipes.length > 1 ? `<button type="button" class="anp-plus" data-anp-a="m-ajout" ${at()}>+ Ajouter un match</button>` : ""}
    </div>`;
  }
  /* étapes 2 et 3 (l'élément .anp sert de repère à « Enregistrer ») */
  function editeur(id, m){
    const d = etat(id), sc = avecScores(m) || d.format === "brassage";
    const fmt = k => `<button type="button" class="as-fmt ${d.format === k ? "on" : ""}" aria-pressed="${d.format === k}" data-anp-a="format" data-k="${k}"><span aria-hidden="true">${FORMATS[k].ico}</span> ${FORMATS[k].nom}</button>`;
    let corps, titre;
    if (d.format === "poules"){
      if (!d.poules.length) d.poules.push({ equipes: [], matchs: [] });
      titre = "Les poules et leurs matchs";
      corps = `<p class="quoi anp-aide">Ajoute les équipes de chaque poule : les matchs chacun contre chacun se créent tout seuls. Mets l'heure${sc ? " et le score" : ""} de chaque match et retire ceux qui ne se jouent pas. Plusieurs équipes du même club ? Elles sont numérotées toutes seules (Pierrelatte 1, 2, 3…).</p>
        ${d.poules.map((q, iq) => poule(q, iq, sc, d.poules.length)).join("")}
        ${d.poules.length < LETTRES.length ? `<div><button type="button" class="btn contour petit" data-anp-a="p-ajout">+ Ajouter une poule (${LETTRES[d.poules.length]})</button></div>` : ""}`;
    } else {
      titre = `Les équipes rencontrées${sc ? " et les scores" : ""}`;
      corps = `${d.rencontres.length ? `<p class="quoi anp-aide">Pour chaque match : l'heure, puis touche le champ pour choisir le club${sc ? ", et le score quand il est joué" : ""}.</p>` : ""}
        ${d.rencontres.map((p, j) => ligne(p, j, sc)).join("") || `<small class="quoi anp-rien">Aucune équipe rencontrée pour l'instant : ajoute-les dès que tu les connais.</small>`}
        ${d.rencontres.length < 12 ? `<div><button type="button" class="anp-plus" data-anp-a="r-ajout">+ Ajouter une équipe rencontrée</button></div>` : ""}`;
    }
    return `<div class="anp" data-anp="${esc(id)}">
      ${etape(2, "Organisation", `<div class="anp-format" role="group" aria-label="Organisation">${fmt("plateau")}${fmt("brassage")}${fmt("poules")}</div>
        <small class="quoi anp-dit">${FORMATS[d.format].dit}</small>`)}
      ${etape(3, titre, corps)}</div>`;
  }

  /* fiche ouverte : on range ce que l'application a dessiné (rien n'est enlevé, tout garde ses repères data-…) */
  function rangerOuverte(a, id, m){
    const d = etat(id), auj = aujourdhui(), passe = (m.date || "") < auj;
    const tete = a.querySelector(".an-tete"), grille = a.querySelector(".grille"), advs = a.querySelector(".an-advs"), btns = a.querySelector(".btns");
    if (!tete || !grille || !advs || !btns) return;
    a.classList.add("anp-carte", "anp-ouverte");
    tete.insertAdjacentHTML("beforeend", puce(m, d, passe));                        // l'état, à droite du titre
    // 1. Quand et où : les champs repérés pour la grille (date, heure, lieu, club qui reçoit, adresse)
    grille.classList.add("anp-grille");
    grille.querySelectorAll("label").forEach(l => {
      const c = l.querySelector("[data-anc]"); if (!c) return;
      l.classList.add("anp-c-" + c.dataset.anc);
      if (c.dataset.anc === "adresse"){
        const t = [...l.childNodes].find(n => n.nodeType === 3 && n.textContent.trim());
        if (t) t.textContent = "Adresse du stade ";
        c.insertAdjacentHTML("afterend", `<small class="anp-indice">Elle sert au GPS des parents (Waze, Google Maps).</small>`);
      }
      if (c.dataset.anc === "dom"){ const t = [...l.childNodes].find(n => n.nodeType === 3 && n.textContent.trim()); if (t) t.textContent = "Où ça se joue ? "; }
    });
    if (!grille.querySelector('[data-anc="adv"]')) grille.classList.add("anp-dom");      // à domicile : pas de club qui reçoit
    const deplacer = [...a.children].find(x => x.tagName === "LABEL" && x.querySelector('[data-anc="equipe"]'));
    const s1 = document.createElement("template");
    s1.innerHTML = etape(1, "Quand et où ?", "");
    const sec1 = s1.content.firstElementChild;
    if (deplacer){ deplacer.classList.add("anp-deplacer"); sec1.appendChild(deplacer); }
    grille.before(sec1); sec1.appendChild(grille);
    // 2 et 3. Organisation et équipes
    advs.outerHTML = editeur(id, m);
    // 4. Enregistrer : l'action principale à gauche, « Supprimer » à part, à droite
    const brouillon = btns.querySelector(".an-brouillon");
    const enreg = btns.querySelector('[data-a="an-save"]'), repl = btns.querySelector('[data-a="carte-replier"]'), suppr = btns.querySelector('[data-a="an-del"]');
    if (enreg){ enreg.classList.remove("petit"); enreg.innerHTML = "✓ Enregistrer"; }
    if (repl){ repl.classList.remove("petit"); if (!/Annuler/.test(repl.textContent)) repl.textContent = d.modifie ? "Annuler les changements" : "Fermer"; }
    if (suppr){ suppr.classList.add("anp-suppr"); suppr.innerHTML = `<span aria-hidden="true">🗑</span> Supprimer le rendez-vous`; }
    btns.classList.add("anp-btns");
    if (brouillon) brouillon.remove();
    const note = (brouillon || d.modifie) ? `<p class="anp-note">● Tu as fait des changements : touche « Enregistrer » pour les garder.</p>` : `<small class="quoi anp-indice">Une fois enregistré, le rendez-vous part tout seul sur les affiches Foot animation.</small>`;
    const s4 = document.createElement("template");
    s4.innerHTML = etape(4, "Enregistrer", note, "anp-fin");
    const sec4 = s4.content.firstElementChild;
    btns.before(sec4); sec4.appendChild(btns);
  }

  /* ---------- fiche repliée : date, lieu, organisation, équipes, où on en est ---------- */
  const vu = v => !vide(v);
  function manquants(m, d){
    if (d.format === "poules") return d.poules.reduce((n, q) => n + q.matchs.filter(p => !(vu(p.sa) && vu(p.sb))).length, 0);
    return d.rencontres.filter(p => !(vu(p.bp) && vu(p.bc))).length;
  }
  function puce(m, d, passe){
    const sc = avecScores(m) || d.format === "brassage";
    const equipes = d.format === "poules" ? d.poules.some(q => q.equipes.length) : d.rencontres.length > 0;
    if (passe && sc && equipes && manquants(m, d)) return `<span class="anp-puce orange">Scores à saisir</span>`;
    if (passe) return `<span class="anp-puce vert">✓ Joué</span>`;
    if (!equipes) return `<span class="anp-puce orange">Équipes à saisir</span>`;
    return `<span class="anp-puce bleu">À venir</span>`;
  }
  function resume(d){
    if (d.format === "poules"){
      const qs = d.poules.filter(q => q.equipes.length);
      if (!qs.length) return "";
      renumeroter(d);
      return `<span class="pl-eqs">${qs.map((q, iq) => `<span class="pl-eq"><b>Poule ${LETTRES[iq]}</b> ${esc(q.equipes.map(libelle).join(", "))}</span>`).join("")}</span>`;
    }
    const l = d.rencontres.filter(p => p.adv);
    if (!l.length) return "";
    return `<span class="pl-eqs">${l.map(p => `<span class="pl-eq">${esc(joli(String(p.adv).replace(/\s+\d+$/, "")))}${vu(p.bp) && vu(p.bc) ? ` <b>${esc(p.bp)}-${esc(p.bc)}</b>` : ""}</span>`).join("")}</span>`;
  }
  function rangerRepliee(a, id, m){
    const bt = a.querySelector(".pl-tete"); if (!bt) return;
    const d = etat(id), passe = (m.date || "") < aujourdhui(), f = FORMATS[d.format];
    const ou = m.dom ? "À domicile" : "Chez " + joli(String(m.adv || "").replace(/\s+\d+$/, "") || "club à choisir");
    const stade = String(m.adresse || "").split(",")[0].trim();
    const nb = d.format === "poules" ? d.poules.filter(q => q.equipes.length).length : 0;
    const quoi = d.format === "poules" && nb ? `${nb} poule${nb > 1 ? "s" : ""}` : f.nom;
    a.classList.add("anp-carte", "anp-repliee");
    const date = bt.querySelector(".bdate");
    bt.innerHTML = `${date ? date.outerHTML : ""}
      <span class="pl-txt"><b>${esc(ou)}</b>
        <small><span>${m.heure ? "🕒 " + esc(hFr(m.heure)) : "Heure à fixer"}</span><span>${f.ico} ${esc(quoi)}</span>${stade ? `<span class="anp-stade">📍 ${esc(stade)}</span>` : ""}</small>
        ${resume(d) || `<span class="pl-vide">Aucune équipe rencontrée saisie</span>`}</span>
      <span class="anp-droite">${puce(m, d, passe)}<span class="pl-modif">✏️ Modifier</span></span>`;
    bt.setAttribute("aria-label", `Modifier le rendez-vous du ${m.date || ""} : ${ou}`);
    bt.insertAdjacentHTML("afterend", `<button type="button" class="anp-del" data-a="an-del" aria-label="Supprimer ce rendez-vous" title="Supprimer ce rendez-vous">🗑</button>`);
  }

  const avant = window.panAnimation;
  window.panAnimation = function(){
    const h = avant.apply(this, arguments);
    if (!/class="an-carte/.test(h)) return h;
    const t = document.createElement("template"); t.innerHTML = h;
    t.content.querySelectorAll("article.an-carte[data-an]").forEach(a => {
      const id = a.dataset.an, m = docDe(id);
      try {
        if (a.classList.contains("pliee")) rangerRepliee(a, id, m);
        else rangerOuverte(a, id, m);
      } catch(err){ if (window.console) console.warn("plateaux", err); }
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

  /* ---------- styles (fiches du Foot animation seulement : article[data-an]) ---------- */
  const css = document.createElement("style");
  css.id = "plateaux-css";
  const C = "body.sur-espace #panneau article.anp-carte";
  css.textContent = `
.anp-format{display:flex;flex-wrap:wrap;gap:8px}
.anp-format .as-fmt{min-height:46px;padding:10px 16px;font-size:15px}
.anp-aide{margin:0;font-size:14px}
.anp-l,.anp-m{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center}
.anp-l.sc{grid-template-columns:auto minmax(0,1fr) auto auto}
.anp-m{grid-template-columns:auto minmax(0,1fr) auto minmax(0,1fr) auto}
.anp-m.sc{grid-template-columns:auto minmax(0,1fr) 56px auto 56px minmax(0,1fr) auto}
.anp-h .tp-champ{width:auto;min-width:0;min-height:44px;height:44px;padding:6px 10px;gap:6px;border-style:solid;font-size:15px;white-space:nowrap}
.anp-h .tp-champ.vide span:last-child{font-size:0}
.anp-h .tp-champ.vide span:last-child::after{content:"Heure";font-size:15px}
.anp-sc{display:flex;align-items:center;gap:6px}
.anp-sc small{font:700 12px var(--corps);color:var(--texte-doux);text-transform:uppercase;letter-spacing:.05em}
.anp-sc input,.anp-m input[type=number]{width:56px;text-align:center;font-weight:800;padding-left:4px;padding-right:4px}
.anp-t{font-weight:800;color:var(--texte-doux);font-size:13px;text-align:center}
.anp-x{width:44px;height:44px;border-radius:12px;border:1px solid rgba(248,113,113,.4);background:none;color:#FCA5A5;font:800 15px var(--corps);cursor:pointer}
.anp-x:hover{background:rgba(220,38,38,.15)}
.anp-poule{border:1px solid var(--ligne);border-radius:14px;padding:12px;display:grid;gap:10px;background:rgba(143,168,240,.06)}
.anp-pt{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.anp-pt b{font:800 18px var(--display)}
.anp-pn{margin-right:auto;font-size:13px;color:var(--texte-doux)}
.anp-eqs{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.anp-eq{display:inline-flex;align-items:center;gap:6px;padding:4px 4px 4px 8px;border-radius:999px;border:1px solid var(--ligne);background:rgba(28,99,196,.16);font:700 14px var(--corps)}
.anp-eq.nous{border-color:var(--or,#E3B64C);background:rgba(227,182,76,.16)}
.anp-eq img{width:22px;height:22px;object-fit:contain;border-radius:50%;background:#fff}
.anp-eq button{border:0;background:none;color:inherit;font:800 14px var(--corps);cursor:pointer;min-width:36px;min-height:36px;border-radius:999px}
.anp-eq button:hover{background:rgba(220,38,38,.2)}
.anp-plus{border:1px dashed rgba(143,168,240,.55);background:none;color:var(--bleu-texte,#8FC2FF);font:700 14.5px var(--corps);border-radius:12px;padding:10px 16px;cursor:pointer;min-height:44px}
.anp-plus:hover{background:rgba(143,168,240,.1)}
.anp-lab{font:800 12.5px var(--corps);letter-spacing:.08em;text-transform:uppercase;color:var(--texte-doux)}
.anp-m select{padding-left:8px;padding-right:22px;text-overflow:ellipsis}
/* la fiche ouverte, en étapes numérotées */
${C}.anp-ouverte{gap:0;padding:18px 20px;border-color:rgba(143,168,240,.38)}
${C} .an-tete{padding-bottom:14px;flex-wrap:wrap}
${C} .an-tete>div:not(.bdate){flex:1;min-width:0}
${C} .an-tete>.anp-puce{align-self:center}
.anp-pt .btn{margin-left:auto}
${C} .anp{display:contents}
${C} .anp-etape{display:grid;gap:12px;padding:16px 0;border-top:1px solid rgba(143,168,240,.16)}
${C} .anp-et{display:flex;align-items:center;gap:10px}
${C} .anp-et b{font:800 18px var(--display);letter-spacing:.2px}
${C} .anp-num{width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;font:800 14px var(--corps);background:rgba(47,107,255,.22);color:#CFE0FF;border:1px solid rgba(143,168,240,.45)}
${C} .anp-grille{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px 16px;align-items:start}
${C} .anp-grille.anp-dom .anp-c-dom{grid-column:span 2}
${C} .anp-grille .anp-c-adresse{grid-column:1/-1}
${C} .anp-grille label{font-size:14px}
${C} .anp-indice{font-weight:500;font-size:13px;color:var(--texte-doux);text-transform:none;letter-spacing:0}
${C} .anp-deplacer{max-width:360px}
${C} .anp-dit{margin-top:-2px}
${C} .anp-rien{font-style:italic}
${C} .anp-fin{padding-bottom:0}
${C} .anp-btns{margin-top:0;align-items:center}
${C} .anp-btns [data-a="an-save"]{min-width:200px}
${C} .anp-btns .anp-suppr{margin-left:auto}
${C} .anp-note{margin:0;font-weight:700;color:#F3D48A}
/* la fiche repliée : une ligne propre, l'état à droite */
${C}.anp-repliee{display:flex;align-items:stretch}
${C}.anp-repliee .pl-tete{flex:1;min-width:0;padding:14px 16px;gap:16px}
${C} .pl-txt>small{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:14px}
${C} .pl-txt>b{font:800 18px var(--display)}
${C} .anp-stade{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:280px}
${C} .anp-droite{display:flex;flex-direction:column;align-items:flex-end;gap:8px;flex:none}
${C} .anp-puce{font:800 12.5px var(--corps);padding:5px 11px;border-radius:999px;white-space:nowrap;border:1px solid transparent}
${C} .anp-puce.bleu{background:rgba(47,107,255,.18);color:#CFE0FF;border-color:rgba(143,168,240,.35)}
${C} .anp-puce.vert{background:rgba(22,163,74,.18);color:#86EFAC;border-color:rgba(34,197,94,.35)}
${C} .anp-puce.orange{background:rgba(245,158,11,.16);color:#FCD34D;border-color:rgba(245,158,11,.4)}
${C} .anp-del{flex:none;width:52px;border:0;border-left:1px solid rgba(143,168,240,.16);background:none;color:#FCA5A5;font-size:17px;cursor:pointer}
${C} .anp-del:hover{background:rgba(220,38,38,.14)}
:root[data-theme="light"] ${C} .anp-puce.bleu{color:#1C4FD6}
:root[data-theme="light"] ${C} .anp-puce.vert{color:#15803D}
:root[data-theme="light"] ${C} .anp-puce.orange{color:#B45309}
:root[data-theme="light"] ${C} .anp-num{color:#1C4FD6}
:root[data-theme="light"] ${C} .anp-note{color:#B45309}
:root[data-theme="light"] .anp-x,:root[data-theme="light"] ${C} .anp-del{color:#DC2626}
@media (max-width:900px){
  ${C} .anp-grille{grid-template-columns:repeat(2,minmax(0,1fr))}
  ${C} .anp-grille .anp-c-date{grid-column:1/-1}
  ${C} .anp-grille.anp-dom .anp-c-dom{grid-column:auto}
  ${C} .anp-grille .anp-c-adv{grid-column:1/-1}
}
@media (max-width:620px){
  ${C}.anp-ouverte{padding:14px}
  .anp-l,.anp-l.sc{grid-template-columns:auto minmax(0,1fr) auto;border:1px solid var(--ligne);border-radius:12px;padding:8px}
  .anp-l>.anp-h{grid-column:1;grid-row:1}.anp-l>.anp-x{grid-column:3;grid-row:1}
  .anp-l>input[data-anp-f="adv"]{grid-column:1/-1;grid-row:2}
  .anp-l .anp-sc{grid-column:1/-1;grid-row:3;justify-content:center}
  .anp-format{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
  .anp-format .as-fmt{padding:10px 4px;font-size:14px}
  /* téléphone : un match = l'heure, puis les deux équipes l'une sous l'autre (noms entiers), le score à droite de chacune */
  .anp-m,.anp-m.sc{grid-template-columns:minmax(0,1fr) auto;gap:6px 8px;border:1px solid var(--ligne);border-radius:12px;padding:8px}
  .anp-m>.anp-h{grid-column:1;grid-row:1;justify-self:start}.anp-m>.anp-x{grid-column:2;grid-row:1}
  .anp-m .anp-t{display:none}
  .anp-m select[data-anp-m="a"]{grid-column:1/-1;grid-row:2}.anp-m select[data-anp-m="b"]{grid-column:1/-1;grid-row:3}
  .anp-m.sc select[data-anp-m="a"]{grid-column:1}.anp-m.sc select[data-anp-m="b"]{grid-column:1}
  .anp-m.sc input[data-anp-m="sa"]{grid-column:2;grid-row:2}.anp-m.sc input[data-anp-m="sb"]{grid-column:2;grid-row:3}
  ${C} .anp-btns{display:grid;grid-template-columns:1fr}
  ${C} .anp-btns .btn{width:100%}
  ${C} .anp-btns .anp-suppr{margin:10px 0 0}
  ${C}.anp-repliee .pl-tete{display:grid;grid-template-columns:auto minmax(0,1fr);padding:12px;gap:8px 12px;align-items:start}
  ${C} .anp-droite{grid-column:2;flex-direction:row;justify-content:space-between;align-items:center;gap:8px}
  ${C} .pl-modif{font-size:13.5px}${C} .pl-modif::before{content:none}
  ${C} .an-tete .anp-puce{margin-left:auto}
  ${C} .anp-stade{max-width:100%}
  ${C} .anp-del{width:46px}
}`;
  document.head.appendChild(css);
})();
