/* Les jeunes.
   U13 (foot à 8) : la compo se fait seulement avec des dispositifs de foot à 8 (8 systèmes : 3-3-1, 3-1-3, 2-3-2, 3-2-2, 2-4-1,
   3-2-1-1, 3-1-2-1 en losange, 2-1-3-1) ; une compo U13 ouverte avec un système à 11 passe en 3-3-1 (les convoqués restent).
   Les mêmes dispositifs sont dans le serveur (api/affiches.php, ACP_FORMATIONS) pour la story de la composition.
   École de foot (U6 · U7, U8 · U9, U10 · U11, et leurs groupes « Avenir », « Promotion »…) : pas de compo, une convocation.
   - Onglet Compos : pour une équipe de l'école de foot, l'éditeur devient « Convocation » : le plateau ou le match (choisi dans le
     calendrier ou saisi à la main), le rendez-vous (heure, lieu, mot du coach) et la liste des joueurs à cocher. Pas de système,
     pas de terrain, pas de poste.
   - « Convoquer » enregistre comme une compo publiée, sans aucun joueur sur le terrain : l'annonce part aux convoqués seulement
     (prevenirConvoques) et la story des convoqués part comme d'habitude ; le serveur ne publie jamais la story « composition »
     d'une compo sans titulaire, donc rien ne part 30 minutes avant. La compo garde convocationSeule: true.
   - Affichage : espace joueur « Tu es convoqué », le rendez-vous et la liste, sans terrain ; jamais sur la page publique des compos ;
     dans la liste des compos de l'espace club, « Convocation » au lieu du système.
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONG === "undefined" || typeof window.panCompoEditeur !== "function") return;
  const e = ONG.e;
  const estEcole = eq => /^\s*U\s?(?:[5-9]|1[01])(?!\d)/i.test(String(eq || "")) || /u\s?6\s*(à|a)\s*u\s?11/i.test(String(eq || ""));
  const estConvoc = c => !!c && (!!c.convocationSeule || estEcole(c.equipe));
  window.ASF_ECOLE = { estEcole, estConvoc };
  const pairDe = eq => { try { return groupeEquipe(eq); } catch(err){ return eq; } };
  const hfr = h => { try { return hFr(h); } catch(err){ return String(h || ""); } };
  const jour = d => { try { return dateLongue(d); } catch(err){ return String(d || ""); } };
  const auj = () => { try { return aujourdhui(); } catch(err){ return new Date().toISOString().slice(0, 10); } };
  const ECOLE = ["U6 · U7", "U8 · U9", "U10 · U11"];

  /* ---------------- U13 : foot à 8 ---------------- */
  const estU13 = eq => /^\s*U\s?1[23](?!\d)/i.test(String(eq || ""));
  const A8 = "Foot à 8 (3-3-1)";
  const estA8 = f => /^Foot à 8/.test(String(f || ""));
  // d'autres dispositifs de foot à 8 (gardien + 7) ; les mêmes positions que dans le serveur (affiches.php)
  try {
    if (typeof FORMATIONS === "object"){
      const plus = {
        "Foot à 8 (2-4-1)": [["GB",50,90],["DG",32,74],["DD",68,74],["MG",14,50],["MC",38,53],["MC",62,53],["MD",86,50],["BU",50,24]],
        "Foot à 8 (3-2-1-1)": [["GB",50,90],["DG",20,73],["DC",50,76],["DD",80,73],["MC",33,56],["MC",67,56],["MOC",50,40],["BU",50,22]],
        "Foot à 8 (3-1-2-1)": [["GB",50,90],["DG",20,73],["DC",50,76],["DD",80,73],["MDC",50,58],["MG",26,44],["MD",74,44],["BU",50,22]],
        "Foot à 8 (2-1-3-1)": [["GB",50,90],["DG",32,75],["DD",68,75],["MDC",50,60],["MG",16,42],["MOC",50,40],["MD",84,42],["BU",50,21]],
      };
      Object.entries(plus).forEach(([k, v]) => { if (!FORMATIONS[k]) FORMATIONS[k] = v; });
    }
  } catch(err){}

  /* ---------------- les joueurs et les rendez-vous de l'équipe ---------------- */
  function joueursDe(eq){
    let l = []; try { l = effectifDe(eq); } catch(err){}
    if (!l.length && pairDe(eq) !== eq){ try { l = effectifDe(pairDe(eq)); } catch(err){} }
    return [...l].filter(j => j && j.id && j.nom).sort((a, b) => String(a.nom).localeCompare(String(b.nom)));
  }
  /* les joueurs des autres équipes de l'école de foot (un renfort, un surclassement) */
  function autresEcole(eq){
    const ici = new Set(joueursDe(eq).map(j => j.id)), out = [];
    ECOLE.filter(n => n !== pairDe(eq)).forEach(n => { joueursDe(n).forEach(j => { if (!ici.has(j.id) && !out.some(x => x.id === j.id)) out.push({ ...j, eqOrigine: n }); }); });
    return out;
  }
  /* plateaux (foot animation) et matchs à venir de l'équipe */
  function rencontres(eq){
    const g = pairDe(eq), a = auj();
    return [...(S.matchsAnimation || []), ...(S.matchs || [])]
      .filter(m => m && m.date && m.date >= a && (m.equipe === eq || pairDe(m.equipe) === g))
      .sort((x, y) => (x.date + (x.heure || "")).localeCompare(y.date + (y.heure || "")));
  }
  const libRencontre = m => [jour(m.date), m.heure ? hfr(m.heure) : "", m.dom ? "à domicile" : "chez " + (m.adv || "?"), m.comp || "", m.equipe || ""].filter(Boolean).join(" · ");
  const advDe = m => m.dom ? (m.comp && /plateau|brassage|rentr/i.test(m.comp) ? m.comp + " à domicile" : (m.adv || "Plateau à domicile")) : (m.adv ? (/plateau|brassage/i.test(m.comp || "") ? "Plateau à " + m.adv : m.adv) : (m.comp || "Plateau"));

  /* ---------------- l'éditeur « Convocation » ---------------- */
  function editeur(){
    const c = S.ui.compo, eq = c.equipe, joueurs = joueursDe(eq), autres = autresEcole(eq), sel = new Set(c.convoques || []);
    const rens = rencontres(eq), n = (c.convoques || []).length;
    let opts = ""; try { opts = optEq(eq); } catch(err){}
    if (!opts.includes(">" + e(eq) + "<") && !opts.includes(">" + eq + "<")) opts = `<option selected>${e(eq)}</option>` + opts;
    const ligneJ = j => `<label class="jc-j"><input type="checkbox" data-conv-ecole="${e(j.id)}" ${sel.has(j.id) ? "checked" : ""}>
      <span class="jc-nom">${e(j.nom)}</span>${j.eqOrigine ? `<small>${e(j.eqOrigine)}</small>` : ""}</label>`;
    return `<div class="jc">
      <div class="jc-tete"><button type="button" class="btn contour petit" data-a="fermer-compo">← Retour</button>
        <div class="jc-titre"><b>📣 Convocation · ${e(eq)}</b><small>École de foot : pas de compo. Remplis le rendez-vous, coche les joueurs, puis convoque-les.</small></div></div>
      <section class="jc-bloc"><h3><span>1</span> Le plateau ou le match</h3>
        <div class="jc-champs">
          <label>Équipe<select data-c="equipe">${opts}</select></label>
          ${rens.length ? `<label class="jc-large">Choisir dans le calendrier<select data-jc-rencontre><option value="">Saisir à la main</option>${rens.map(m => `<option value="${e(m.id)}" ${c.matchId === m.id ? "selected" : ""}>${e(libRencontre(m))}</option>`).join("")}</select></label>` : ""}
          <label class="jc-large">Contre qui, ou quel plateau<input data-c="adv" value="${e(c.adv || "")}" placeholder="Ex. : Plateau à Donzère" autocomplete="off"></label>
          <label>Où<select data-c="dom"><option value="1" ${c.dom ? "selected" : ""}>À domicile</option><option value="0" ${!c.dom ? "selected" : ""}>À l'extérieur</option></select></label>
          <label>Date<input type="date" data-c="date" value="${e(c.date || "")}"></label>
          <label>Début<input type="time" data-c="heure" value="${e(c.heure || "")}"></label>
          <label class="jc-large">Adresse<input data-c="lieu" value="${e(c.lieu || "")}" autocomplete="off"></label>
        </div></section>
      <section class="jc-bloc"><h3><span>2</span> Le rendez-vous</h3>
        <div class="jc-champs">
          <label>Heure du rendez-vous<input type="time" data-c="rdvHeure" value="${e(c.rdvHeure || "")}"></label>
          <label class="jc-large">Lieu du rendez-vous<input data-c="rdvLieu" value="${e(c.rdvLieu || "")}" placeholder="Ex. : parking du stade Gustave Jaume" autocomplete="off"></label>
          <label class="jc-tout">Mot du coach<textarea data-c="message" rows="3" placeholder="Ex. : prévoir gourde, protège-tibias et K-way">${e(c.message || "")}</textarea></label>
        </div></section>
      <section class="jc-bloc"><h3><span>3</span> Les convoqués <b class="jc-n" data-jc-n>${n}</b></h3>
        ${joueurs.length ? `<div class="jc-outils"><button type="button" class="btn contour petit" data-jc-tous="1">Tout cocher</button>
            <button type="button" class="btn contour petit" data-jc-tous="0">Tout décocher</button></div>
          <div class="jc-liste">${joueurs.map(ligneJ).join("")}</div>`
          : ONG.vide(`${e(eq)} n'a encore aucun joueur`, "Ajoute-les dans Effectifs (ou importe la liste Footclubs), puis reviens ici.")}
        ${autres.length ? `<details class="jc-autres" ${autres.some(j => sel.has(j.id)) ? "open" : ""}><summary>Joueurs des autres équipes de l'école de foot (${autres.length})</summary>
          <div class="jc-liste">${autres.map(ligneJ).join("")}</div></details>` : ""}
      </section>
      <div class="jc-pied">
        <button type="button" class="btn contour" data-a="save-compo" data-pub="0">Enregistrer sans prévenir</button>
        <button type="button" class="btn bleu" data-a="save-compo" data-pub="1" data-jc-envoyer>📣 Convoquer ${n > 1 ? `les ${n} joueurs` : n ? "le joueur" : "les joueurs"}</button>
      </div>
      <p class="jc-note">Les convoqués reçoivent l'annonce sur leur téléphone et la story des convoqués part. Rien ne part 30 minutes avant le match :
        pas de composition pour l'école de foot.</p>
    </div>`;
  }
  const editeurAvant = window.panCompoEditeur;
  window.panCompoEditeur = function(){
    const c = S.ui.compo;
    if (c && estU13(c.equipe) && !estEcole(c.equipe)){
      // U13 : seulement les dispositifs de foot à 8 (une compo à 11 passe en 3-3-1, les convoqués restent)
      if (!estA8(c.formation) || !(typeof FORMATIONS === "object" && FORMATIONS[c.formation])){ c.formation = A8; c.slots = {}; c.capitaine = c.capitaine || ""; }
      const h = editeurAvant.apply(this, arguments);
      return ONG.transformer(h, r => {
        r.querySelectorAll('select[data-c="formation"] option').forEach(o => {
          const v = o.getAttribute("value") || o.textContent;
          if (!estA8(v)){ o.remove(); return; }
          o.setAttribute("value", v);                                   // la valeur reste le nom exact du système
          o.textContent = v.replace(/^Foot à 8 \((.*)\)$/, "$1 (foot à 8)");
        });
        r.querySelectorAll('[data-a="choisir-systeme"][data-f]').forEach(b => { if (!estA8(b.dataset.f)) b.remove(); });
      });
    }
    if (!c || !estEcole(c.equipe)) return editeurAvant.apply(this, arguments);
    if (!Array.isArray(c.convoques)) c.convoques = [];
    return editeur();
  };
  const majCompteur = () => {
    const c = S.ui.compo; if (!c) return;
    const n = (c.convoques || []).length;
    document.querySelectorAll("#panneau [data-jc-n]").forEach(x => { x.textContent = n; });
    document.querySelectorAll("#panneau [data-jc-envoyer]").forEach(x => { x.textContent = `📣 Convoquer ${n > 1 ? `les ${n} joueurs` : n ? "le joueur" : "les joueurs"}`; });
  };
  document.addEventListener("change", ev => {
    const t = ev.target, c = S.ui.compo;
    if (!t || !t.matches || !c || S.ui.onglet !== "compos" || !estEcole(c.equipe)) return;
    if (t.matches("[data-conv-ecole]")){
      const id = t.dataset.convEcole;
      c.convoques = (c.convoques || []).filter(x => x !== id);
      if (t.checked) c.convoques.push(id);
      majCompteur(); return;
    }
    if (t.matches("[data-jc-rencontre]")){
      const m = [...(S.matchsAnimation || []), ...(S.matchs || [])].find(x => x.id === t.value);
      c.matchId = t.value;
      if (m){
        c.adv = advDe(m); c.dom = !!m.dom; c.date = m.date || c.date; c.heure = m.heure || c.heure;
        c.lieu = m.dom ? (m.adresse || C().stade) : (m.adresse || ("Chez " + (m.adv || "")));
        if (!c.rdvLieu) c.rdvLieu = m.dom ? C().stade : "Parking du stade Gustave Jaume";
      }
      rendrePanneau();
    }
  });
  document.addEventListener("click", ev => {
    const b = ev.target && ev.target.closest && ev.target.closest("[data-jc-tous]"), c = S.ui.compo;
    if (!b || !c || !estEcole(c.equipe)) return;
    const coche = b.dataset.jcTous === "1";
    const ids = [...document.querySelectorAll("#panneau .jc > .jc-bloc > .jc-liste [data-conv-ecole]")].map(x => x.dataset.convEcole);
    if (coche) c.convoques = [...new Set([...(c.convoques || []), ...ids])];
    else c.convoques = (c.convoques || []).filter(x => !ids.includes(x));
    document.querySelectorAll("#panneau .jc > .jc-bloc > .jc-liste [data-conv-ecole]").forEach(x => { x.checked = coche; });
    majCompteur();
  });

  /* ---------------- l'enregistrement : une compo sans terrain ---------------- */
  if (typeof window.enregistrerCompo === "function"){
    const enrAvant = window.enregistrerCompo;
    window.enregistrerCompo = async function(publie){
      const c = S.ui.compo;
      const ecole = !!(c && estEcole(c.equipe));
      if (ecole){
        c.convocationSeule = true; c.slots = {}; c.capitaine = "";
        if (typeof FORMATIONS === "object" && !FORMATIONS[c.formation]) c.formation = Object.keys(FORMATIONS).find(k => /5/.test(k)) || Object.keys(FORMATIONS)[0];
        if (!String(c.adv || "").trim() && (c.date || c.lieu)) c.adv = c.dom ? "Plateau à domicile" : "Plateau";
      } else if (c && c.convocationSeule) delete c.convocationSeule;
      if (c && !ecole && estU13(c.equipe) && !estA8(c.formation)){ c.formation = A8; c.slots = {}; }
      const n = ecole ? (c.convoques || []).length : 0;
      const r = await enrAvant.apply(this, arguments);
      if (ecole && !S.ui.compo) toast(publie ? `📣 Convocation envoyée : ${n > 1 ? `les ${n} convoqués sont prévenus` : "le convoqué est prévenu"}.` : "Convocation enregistrée (personne n'est encore prévenu).");
      return r;
    };
  }

  /* ---------------- l'affichage d'une convocation (espace joueur, espace club) ---------------- */
  if (typeof window.ficheCompo === "function"){
    const ficheAvant = window.ficheCompo;
    window.ficheCompo = function(c, opts){
      if (!estConvoc(c)) return ficheAvant.apply(this, arguments);
      const o = opts || {};
      let nous = "ASF Pierrelatte"; try { nous = C().nomCourt || nous; } catch(err){}
      const st = o.statut ? (o.statut.k === "non" ? { k: "non", t: "Tu n'es pas convoqué pour cette fois" } : { k: "tit", t: "✅ Tu es convoqué" }) : null;
      const conv = c.convoquesListe || [];
      let mot = ""; try { mot = motCoach(c.message); } catch(err){}
      return `<article class="fc fc-convoc">
        <header class="fc-tete">
          ${o.equipe ? `<span class="fc-eq">${e(c.equipe)}</span>` : ""}
          <div class="fc-duel fc-duel-convoc"><span class="fc-club"><b>📣 Convocation · ${e(c.equipe || "")}</b></span></div>
          <p><b>${e(c.dom ? nous + " — " + (c.adv || "Plateau") : (c.adv || "Plateau"))}</b><br>${c.date ? e(jour(c.date)) : ""}${c.heure ? " · début " + e(hfr(c.heure)) : ""}${c.lieu ? " · " + e(c.lieu) : ""}</p>
        </header>
        <div class="fc-corps seul"><div class="fc-infos">
          ${st ? `<div class="fc-statut ${st.k}">${e(st.t)}</div>` : ""}
          ${c.rdvHeure || c.rdvLieu ? `<div class="fc-rdv"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
            <div><small>Rendez-vous</small><b>${c.rdvHeure ? e(hfr(c.rdvHeure)) : ""}${c.rdvLieu ? " · " + e(c.rdvLieu) : ""}</b></div></div>` : ""}
          ${mot}
          <div class="fc-conv"><small>Convoqués · ${conv.length}</small><div>${conv.map(j => `<span>${e(j.nom)}</span>`).join("")}</div></div>
        </div></div></article>`;
    };
  }
  /* page publique des compos : jamais les convocations de l'école de foot (des enfants) */
  if (typeof window.rendreCompos === "function"){
    const rcAvant = window.rendreCompos;
    window.rendreCompos = function(){
      if (S.compte || S.editeur) return rcAvant.apply(this, arguments);
      const tous = S.compos;
      S.compos = (tous || []).filter(c => !estConvoc(c));
      try { return rcAvant.apply(this, arguments); } finally { S.compos = tous; }
    };
  }
  /* liste des compos (espace club) : « Convocation » au lieu du système, « Nouvelle convocation » pour l'école de foot */
  if (typeof window.panCompos === "function"){
    const listeAvant = window.panCompos;
    window.panCompos = function(){
      const h = listeAvant.apply(this, arguments);
      return ONG.transformer(h, racine => {
        racine.querySelectorAll(".cp-carte[data-c]").forEach(carte => {
          const c = (S.compos || []).find(x => x.id === carte.dataset.c); if (!estConvoc(c)) return;
          carte.classList.add("cp-convoc");
          carte.querySelectorAll("small").forEach(s => { if (c.formation && s.textContent.includes(c.formation)) s.textContent = s.textContent.replace(" · " + c.formation, " · convocation (pas de compo)"); });
          const et = carte.querySelector(".etiq");
          if (et && c.publie) et.textContent = "Convocation envoyée";
        });
        if (estEcole(S.ui.eq)) racine.querySelectorAll('[data-a="nouvelle-compo"]').forEach(b => { b.innerHTML = b.innerHTML.replace(/Nouvelle compo/i, "Nouvelle convocation"); });
      });
    };
  }

  /* ---------------- styles ---------------- */
  const css = document.createElement("style");
  const P = "body.sur-espace #panneau .jc";
  css.textContent = `
${P}{display:grid;gap:16px;max-width:900px}
${P} .jc-tete{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
${P} .jc-titre{display:grid;gap:2px;flex:1 1 300px}
${P} .jc-titre b{font:800 22px var(--display)}
${P} .jc-titre small{color:#AFC0EA;font-size:14px}
${P} .jc-bloc{display:grid;gap:12px;padding:16px 18px;border-radius:16px;background:linear-gradient(135deg,rgba(25,48,110,.55),rgba(10,22,56,.6));border:1px solid rgba(143,168,240,.2)}
${P} .jc-bloc h3{display:flex;align-items:center;gap:10px;margin:0;font:800 18px var(--display)}
${P} .jc-bloc h3>span{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:var(--bleu,#2F6BFF);font:800 15px var(--corps)}
${P} .jc-n{margin-left:auto;padding:2px 12px;border-radius:999px;background:rgba(34,197,94,.2);color:#86EFAC;font:800 15px var(--corps)}
${P} .jc-champs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
${P} .jc-champs label{display:grid;gap:4px;font-size:14px}
${P} .jc-large{grid-column:span 2}
${P} .jc-tout{grid-column:1/-1}
${P} .jc-outils{display:flex;gap:8px;flex-wrap:wrap}
${P} .jc-liste{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:8px}
${P} .jc-j{display:flex;align-items:center;gap:10px;min-height:48px;padding:8px 12px;border-radius:12px;background:rgba(5,11,31,.4);border:1px solid rgba(143,168,240,.22);cursor:pointer}
${P} .jc-j input{width:22px;height:22px;flex:none}
${P} .jc-j:has(input:checked){background:rgba(47,107,255,.28);border-color:var(--bleu,#2F6BFF)}
${P} .jc-nom{font-weight:700;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${P} .jc-j small{margin-left:auto;color:#AFC0EA;font-size:12px;white-space:nowrap}
${P} .jc-autres summary{cursor:pointer;color:#AFC0EA;margin:4px 0 8px}
${P} .jc-pied{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end;position:sticky;bottom:10px;padding:10px;border-radius:16px;background:rgba(5,11,31,.85);backdrop-filter:blur(8px)}
${P} .jc-pied .btn.bleu{min-height:50px;font-size:16px}
${P} .jc-note{margin:0;color:#AFC0EA;font-size:13.5px}
body.sur-espace #panneau .cp-convoc .etiq.ok{background:rgba(34,197,94,.18)}
.fc-convoc .fc-duel-convoc b{font-size:18px}
:root[data-theme="light"] ${P} .jc-bloc{background:var(--carte);border-color:#D6DEF5}
:root[data-theme="light"] ${P} .jc-j{background:#fff;border-color:#C9D4F2}
:root[data-theme="light"] ${P} .jc-titre small,:root[data-theme="light"] ${P} .jc-note{color:var(--texte-doux)}
@media (max-width:700px){
  ${P} .jc-champs{grid-template-columns:minmax(0,1fr)}
  ${P} .jc-large{grid-column:auto}
  ${P} .jc-liste{grid-template-columns:minmax(0,1fr)}
  ${P} .jc-pied{bottom:calc(10px + env(safe-area-inset-bottom,0px))}
  ${P} .jc-pied .btn{flex:1 1 100%}
}`;
  document.head.appendChild(css);
})();
