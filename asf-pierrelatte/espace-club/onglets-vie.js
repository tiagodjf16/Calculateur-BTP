/* Vie du club › Stages, Inscriptions, Réunions, Bénévoles : l'intérieur des onglets, rangé et simple à prendre en main.
   - En haut de chaque onglet : ce qu'on vient voir et ses chiffres, avec l'action principale à droite (« + Nouveau stage »,
     « + Nouvelle réunion », « + Nouveau créneau ») qui déplie le formulaire juste dessous. Le formulaire n'est ouvert
     d'office que si la liste est vide (ou pour modifier un stage) ; il se referme tout seul une fois l'élément créé.
   - « 💡 Comment ça marche ? » replié, en quelques étapes.
   - Les listes en cartes : à venir d'abord (le plus proche en premier), le passé à part ou replié ;
     « Supprimer » en rouge, toujours à l'écart des autres boutons.
   - Inscriptions : les demandes rangées par statut (à traiter, en cours, validées repliées), les catégories ouvertes ou
     fermées dans un bloc repliable en haut, « Effacer les anciennes demandes » tout en bas, à part.
   - Corrige le petit carré « + » perdu en bas à gauche de l'écran : l'icône des blocs dépliants (span.plus) prenait la
     position fixe du menu « Plus » du site (et disparaissait au téléphone).
   Stages : on range ce que rend l'application (avec le bouton « Créer l'affiche » ajouté par evenements.js).
   Inscriptions, Réunions, Bénévoles : refaits à partir des données (S.licences, S.reunions, S.benevoles, S.engagements),
   avec les mêmes data-a, data-c, data-form, name, data-l / data-u / data-statut / data-re / data-b2.
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.ONG === "undefined") return;
  const e = ONG.e;

  /* ---------- petits outils ---------- */
  const auj = () => (typeof aujourdhui === "function" ? aujourdhui() : new Date().toISOString().slice(0, 10));
  const pl = (n, s, p) => `${n} ${n > 1 ? (p || s + "s") : s}`;
  const modele = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content; };
  const jourTxt = s => {                                               // « samedi 10 octobre » (+ l'année si ce n'est pas celle-ci)
    if (!s) return "";
    try { const d = jd(s); if (isNaN(d)) return String(s); const t = dateLongue(s); return d.getFullYear() !== new Date().getFullYear() ? `${t} ${d.getFullYear()}` : t; }
    catch(err){ return String(s); }
  };
  const heureTxt = h => (h ? (typeof hFr === "function" ? hFr(h) : String(h)) : "");
  const badge = d => (typeof badgeDate === "function" ? badgeDate(d) : "");
  const numTel = t => String(t || "").replace(/[^\d+]/g, "");
  const stade = () => { try { return (typeof C === "function" && C().stade) || ""; } catch(err){ return ""; } };
  // remplace le libellé d'un <label> qui contient son champ (le premier morceau de texte)
  const libelle = (lab, t) => { if (!lab) return; const n = [...lab.childNodes].find(x => x.nodeType === 3 && x.textContent.trim()); if (n) n.textContent = t; };
  const chip = (txt, sorte) => `<span class="ovc-chip ${sorte || ""}">${txt}</span>`;

  /* ---------- le formulaire de création : un bloc dépliant dont le titre fait office de bouton principal ---------- */
  function blocCreer(cle, titre, html, defaut, force, icone){
    const ouvert = !!force || ONG.ouvert(cle, defaut);
    let h = ONG.pli(cle, titre, html, defaut, icone || "+").replace('class="pli ong-pli"', 'class="pli ong-pli ong-vie-creer"');
    if (force && !ONG.ouvert(cle, defaut)) h = h.replace("<details ", "<details open ");
    return { html: h, ouvert };
  }
  // la barre du haut : le titre et ses chiffres à gauche, le bloc « + Nouveau… » à droite (il passe dessous quand il est ouvert)
  function tete(titre, sous, bloc){
    let h = ONG.barre(titre, sous, bloc ? bloc.html : "");
    if (bloc && bloc.ouvert) h = h.replace('class="ong-barre-act"', 'class="ong-barre-act ong-vie-ouvert"');
    return h;
  }
  // un bloc replié pour ce qui sert moins (le passé, les réglages rares)
  const archive = (cle, titre, html, defaut, icone) => ONG.pli(cle, titre, html, !!defaut, icone || "🗂")
    .replace('class="pli ong-pli"', 'class="pli ong-pli ong-archive ong-vie-archive"');      // ong-archive : même bloc « passé » que les autres onglets

  /* le formulaire se referme tout seul une fois l'élément créé (on retient le nombre d'éléments au moment d'envoyer) */
  const COMPTES = { reunion: () => (S.reunions || []).length, creneau: () => (S.benevoles || []).length, stage: () => (S.stages || []).length };
  document.addEventListener("submit", ev => {
    const f = ev.target && ev.target.closest && ev.target.closest(".ong-vie form[data-form]");
    if (!f || !COMPTES[f.dataset.form]) return;
    const d = f.closest("details.ong-vie-creer[data-ong-pli]");
    if (d && !(f.dataset.form === "stage" && S.ui.stageEdit)) S.ui.vieFermer = { cle: d.dataset.ongPli, k: f.dataset.form, n: COMPTES[f.dataset.form](), t: Date.now() };
  });
  function refermerSiCree(){
    const x = S.ui.vieFermer; if (!x) return;
    if (Date.now() - x.t > 60000){ S.ui.vieFermer = null; return; }
    if (COMPTES[x.k] && COMPTES[x.k]() > x.n){ S.ui.ongPli = S.ui.ongPli || {}; S.ui.ongPli[x.cle] = false; S.ui.vieFermer = null; }
  }
  // ouvert à la main : la barre laisse toute la largeur au formulaire ; à la souris, on se place sur le premier champ
  // (pas au téléphone : le clavier cacherait le formulaire qui vient de s'ouvrir)
  let toucheA = 0;
  document.addEventListener("click", ev => {
    const s = ev.target.closest && ev.target.closest(".ong-vie details.ong-vie-creer>summary"); if (!s) return;
    // modifier un stage : « Fermer » fait comme « Annuler » (sinon on resterait en modification, formulaire replié)
    const d = s.parentElement, annuler = d.open && d.dataset.ongPli === "vie-st-modif" ? d.querySelector('[data-a="stage-annuler"]') : null;
    if (annuler){ ev.preventDefault(); annuler.click(); return; }
    toucheA = Date.now();
  }, true);
  document.addEventListener("toggle", ev => {
    const d = ev.target; if (!d || !d.matches || !d.matches("details.ong-vie-creer")) return;
    const z = d.closest(".ong-barre-act"); if (z) z.classList.toggle("ong-vie-ouvert", d.open);
    const souris = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (d.open && souris && Date.now() - toucheA < 800){
      const c = d.querySelector('.pli-corps input:not([type=hidden]):not([type=file]):not([type=checkbox]), .pli-corps textarea');
      setTimeout(() => { try { if (c) c.focus({ preventScroll: true }); } catch(err){} }, 40);
    }
  }, true);

  /* Sur le site hébergé, l'application ne redessine un onglet après un enregistrement que pour « l'éditeur » (majAdmin) :
     une réunion ou un créneau créé, supprimé ou un compte rendu n'apparaissait qu'en changeant d'onglet. Pour Réunions et
     Bénévoles, on redessine dès que leurs données changent, sauf pendant une saisie (on attend que le champ soit quitté). */
  const VIVANTS = { reunions: () => JSON.stringify(S.reunions || []), benevoles: () => JSON.stringify([S.benevoles || [], S.engagements || {}]) };
  let signe = "", attente = false, sale = false;
  const noter = k => { signe = k + VIVANTS[k](); attente = false; sale = false; };
  const occupe = () => { const p = document.getElementById("panneau"), a = document.activeElement; return !!(p && a && p.contains(a) && a.matches("input,select,textarea")); };
  function suivre(){
    const k = S.ui.onglet, f = VIVANTS[k];
    if (!f || S.editeur || (window.ONG && ONG.suivi) || !document.querySelector("#panneau .ong-vie")) return;   // ONG.suivi : espace.js s'en charge pour tous les onglets
    if (k + f() === signe) return;
    if (occupe() || sale){ attente = true; return; }
    try { rendrePanneau(); } catch(err){}
  }
  if (typeof window.majAdmin === "function"){
    const majAvant = window.majAdmin;
    window.majAdmin = function(){ const r = majAvant.apply(this, arguments); try { suivre(); } catch(err){} return r; };
  }
  document.addEventListener("focusout", () => setTimeout(() => { if (attente && !occupe()) suivre(); }, 60));
  // un formulaire de création commencé n'est pas effacé par un rafraîchissement
  document.addEventListener("input", ev => { if (ev.target.closest && ev.target.closest(".ong-vie details.ong-vie-creer form")) sale = true; }, true);
  document.addEventListener("submit", ev => { if (ev.target.closest && ev.target.closest(".ong-vie form[data-form]")) sale = false; }, true);

  /* l'emballage commun : en cas de souci, l'onglet d'origine s'affiche */
  function emballer(nom, fn){
    const avant = window[nom];
    if (typeof avant !== "function") return;
    window[nom] = function(){
      try { refermerSiCree(); return fn.call(this, () => avant.apply(this, arguments)); }
      catch(err){ if (window.console) console.warn("onglets-vie", nom, err); return avant.apply(this, arguments); }
    };
  }

  /* =====================================================================
     STAGES
     ===================================================================== */
  const AIDE_STAGES = `<ol>
      <li>Touche <b>« + Nouveau stage »</b> : mets le titre, les dates et l'affiche déjà faite (une image).</li>
      <li>Laisse <b>« Publier sur le site »</b> coché : le stage apparaît sur le site et les familles inscrivent leurs enfants en ligne.</li>
      <li>Les inscrits arrivent ici tout seuls. <b>« Exporter la liste »</b> donne un fichier à ouvrir avec Excel.</li>
      <li>C'est complet ? Touche <b>« Fermer les inscriptions »</b>.</li></ol>`;

  function rangerFormStage(f, edit){
    const lab = n => { const i = f.querySelector(`[name="${n}"]`); return i ? i.closest("label") : null; };
    const L = {};
    ["affiche", "titre", "dateDebut", "dateFin", "horaires", "lieu", "tarif", "places", "limite", "contact", "accroche", "description", "publie"].forEach(n => { L[n] = lab(n); });
    const grille = f.querySelector(":scope > .grille"), btns = f.querySelector(":scope > .btns");
    if (!grille || !btns || !L.titre || !L.dateDebut) return;                            // forme inattendue : on laisse tel quel
    const cats = grille.querySelector(".st-cats"), catsBloc = cats ? cats.closest(".pleine") : null;
    const apercu = [...grille.querySelectorAll(":scope > div.pleine")].find(d => d.querySelector("img"));
    const intro = f.querySelector(":scope > p.quoi");
    libelle(L.affiche, edit && edit.photo ? "Changer l'affiche (facultatif)" : "Affiche du stage (une image)");
    libelle(L.places, "Nombre de places");
    libelle(L.contact, "Contact (nom et téléphone)");
    libelle(L.accroche, "Accroche (page d'accueil du site)");
    const zone = modele(`<div class="ong-vie-fgr">
        <div class="ong-vie-grp"><p class="ong-vie-grp-t"><span>1</span>Le stage</p><div class="ong-vie-g" data-g="1"></div></div>
        <div class="ong-vie-grp"><p class="ong-vie-grp-t"><span>2</span>Les dates</p><div class="ong-vie-g" data-g="2"></div></div>
        <div class="ong-vie-grp"><p class="ong-vie-grp-t"><span>3</span>Le lieu, le prix, le contact</p><div class="ong-vie-g" data-g="3"></div></div>
        <div class="ong-vie-grp"><p class="ong-vie-grp-t"><span>4</span>Sur le site</p><div class="ong-vie-g" data-g="4"></div></div></div>`).firstElementChild;
    const mettre = (g, el, large) => { if (!el) return; el.classList.remove("pleine"); if (large) el.classList.add("l" + large); zone.querySelector(`[data-g="${g}"]`).appendChild(el); };
    mettre(1, L.titre, 4); mettre(1, L.affiche, apercu ? 3 : 4); mettre(1, apercu, 1); mettre(1, catsBloc, 4);
    mettre(2, L.dateDebut, 1); mettre(2, L.dateFin, 1); mettre(2, L.horaires, 2); mettre(2, L.limite, 2);
    mettre(3, L.lieu, 4); mettre(3, L.tarif, 1); mettre(3, L.places, 1); mettre(3, L.contact, 2);
    mettre(4, L.accroche, 4); mettre(4, L.description, 4); mettre(4, L.publie, 4);
    [...grille.children].forEach(x => zone.querySelector('[data-g="4"]').appendChild(x));       // au cas où l'application ajoute un champ
    grille.replaceWith(zone);
    if (apercu) apercu.classList.add("ong-vie-apercu");
    if (intro) intro.outerHTML = `<p class="ong-vie-oblig">À remplir au minimum : <b>le titre</b>, <b>le premier jour</b>${edit ? "" : " et <b>l'affiche</b>"}. Le reste est facultatif.</p>`;
    btns.classList.remove("pleine"); btns.classList.add("ong-vie-envoi");
  }

  function carteStage(c, x, passe){
    const id = c.dataset.st, q = s => c.querySelector(s);
    const l = (S.inscritsStage || []).filter(i => i.stageId === id);
    const bAff = q('[data-ev-a="depuis-stage"]'), bMod = q('[data-a="stage-modifier"]'), bPub = q('[data-a="stage-publier"]'),
      bOuv = q('[data-a="stage-ouvrir"]'), bExp = q('[data-a="stage-export"]'), bSup = q('[data-a="stage-suppr"]');
    const img = q("img.st-mini"), lien = img ? (img.closest("a") || img) : null;
    const table = q(".st-table-zone"), fiches = q(".st-ins-liste");
    const n = l.length, places = +x.places || 0, pct = places ? Math.min(100, Math.round(n / places * 100)) : 0;
    const liste = typeof CATS_STAGE !== "undefined" ? CATS_STAGE : [];
    const parCat = [...liste, ...[...new Set(l.map(i => i.categorie))].filter(k => k && !liste.includes(k))]
      .map(k => [k, l.filter(i => i.categorie === k).length]).filter(p => p[1]);
    const cats = (x.categories && x.categories.length ? x.categories : liste).join(" · ");
    const ouvert = x.ouvert !== false;
    const etats = [
      passe ? chip("Terminé", "gris") : "",
      x.publie ? chip("✓ Publié sur le site", "vert") : chip("Brouillon · pas sur le site", "gris"),
      ouvert ? chip("Inscriptions ouvertes", passe ? "gris" : "vert") : chip("Inscriptions fermées", "rouge"),
    ].join("");
    const infos = [cats, x.tarif, x.lieu && x.lieu !== (typeof ADRESSE_STADE === "string" ? ADRESSE_STADE : "") ? x.lieu : ""].filter(Boolean).map(e).join(" · ");
    const cleIns = "vie-st-ins-" + id;
    const html = `<div class="ovs-tete">
        <div class="ovs-affiche" data-vie-place="affiche">${lien ? "" : `<span class="ovs-sans">Pas encore<br>d'affiche</span>`}</div>
        <div class="ovs-txt">
          <h4>${e(x.titre || "Stage")}</h4>
          <p class="ovc-info"><span aria-hidden="true">📅</span> ${e(typeof datesStage === "function" ? datesStage(x) : x.dateDebut || "")}${x.horaires ? " · " + e(x.horaires) : ""}</p>
          ${infos ? `<p class="ovc-info ovc-doux">${infos}</p>` : ""}
          <div class="ovc-chips">${etats}</div>
          ${lien ? "" : `<p class="ovc-astuce">Touche « Modifier » pour déposer l'affiche.</p>`}
        </div>
        <div class="ovs-compte${places && n >= places ? " plein" : ""}"><b>${n}</b><span>${n > 1 ? "inscrits" : "inscrit"}${places ? `<br>sur ${places} places` : ""}</span>
          ${places ? `<i class="ovs-jauge" aria-hidden="true"><i style="width:${pct}%"></i></i>` : ""}</div>
      </div>
      <div class="ovc-actions">
        <div class="ovc-act-g" data-vie-place="boutons"></div>
        <div class="ovc-act-d" data-vie-place="suppr"></div>
      </div>
      ${n ? `<details class="ovs-ins" data-ong-pli="${e(cleIns)}" ${ONG.ouvert(cleIns, !passe) ? "open" : ""}>
          <summary><span class="ovs-ins-t">Les inscrits <span class="ong-nb">${n}</span></span>
            <span class="ovs-cats">${parCat.map(([k, m]) => `<span>${e(k)} · <b>${m}</b></span>`).join("")}</span><span class="ovs-fl" aria-hidden="true">▾</span></summary>
          <div class="ovs-ins-corps" data-vie-place="inscrits"></div></details>`
        : `<p class="ovs-aucun">Aucune inscription pour l'instant.${x.publie || passe ? "" : " Le stage n'est pas encore publié : les familles ne le voient pas."}</p>`}`;
    const z = modele(html);
    const place = (k, els) => { const p = z.querySelector(`[data-vie-place="${k}"]`); if (!p) return; els.filter(Boolean).forEach(el => p.appendChild(el)); p.removeAttribute("data-vie-place"); };
    if (lien) lien.classList.add("ovs-lien");
    [bMod, bPub, bOuv, bExp, passe ? bAff : null].forEach(b => { if (b){ b.classList.remove("bleu", "danger"); b.classList.add("contour"); } });
    if (bExp) bExp.textContent = "Exporter la liste (Excel)";
    place("affiche", [lien]);
    place("boutons", [bAff, bMod, bPub, bOuv, bExp]);
    place("suppr", [bSup]);
    if (table) table.querySelectorAll('[data-a="stage-ins-suppr"]').forEach(b => {
      const nom = (b.closest("tr") && b.closest("tr").querySelector("td")) ? b.closest("tr").querySelector("td").textContent.trim() : "";
      b.textContent = "✕"; b.title = "Retirer l'inscription"; b.setAttribute("aria-label", `Retirer l'inscription${nom ? " de " + nom : ""}`);
    });
    place("inscrits", [table, fiches]);
    c.textContent = "";
    c.classList.add("ong-vie-stage", "ovc");
    c.classList.toggle("passe", !!passe);
    c.appendChild(z);
  }

  emballer("panStages", function(original){
    const h = original();
    return ONG.transformer(h, r => {
      const form = r.querySelector('form[data-form="stage"]');
      const cartes = [...r.querySelectorAll("article[data-st]")];
      const a = auj(), fin = x => (typeof finStage === "function" ? finStage(x) : (x.dateFin || x.dateDebut || ""));
      const doc = id => (S.stages || []).find(x => x.id === id) || { id };
      const edit = (S.stages || []).find(x => x.id === S.ui.stageEdit) || null;
      const avenir = [], passes = [];
      cartes.forEach(c => { const x = doc(c.dataset.st); (fin(x) && fin(x) < a ? passes : avenir).push({ c, x }); });
      avenir.sort((p, q) => (p.x.dateDebut || "9999").localeCompare(q.x.dateDebut || "9999"));
      passes.sort((p, q) => (q.x.dateDebut || "").localeCompare(p.x.dateDebut || ""));
      const nIns = avenir.reduce((s, p) => s + (S.inscritsStage || []).filter(i => i.stageId === p.x.id).length, 0);
      const sous = avenir.length ? `${pl(avenir.length, "stage à venir", "stages à venir")} · ${pl(nIns, "inscrit")}` : "Aucun stage à venir";
      const bloc = form ? (edit
        ? blocCreer("vie-st-modif", `Modifier « ${e(edit.titre || "le stage")} »`, `<div data-vie-place="form"></div>`, true, true, "✎")
        : blocCreer("vie-st-form", "Nouveau stage", `<div data-vie-place="form"></div>`, !cartes.length)) : null;
      if (form) rangerFormStage(form, edit);
      const z = modele(`<div class="ong-vie ong-vie-stages">
        ${ONG.aide("vie-st-aide", "Comment ça marche ?", AIDE_STAGES)}
        ${tete("Stages", e(sous), bloc)}
        ${avenir.length ? `${ONG.titre("À venir", avenir.length)}<div class="ovc-liste" data-vie-place="avenir"></div>`
          : !cartes.length && bloc && bloc.ouvert ? "" : ONG.vide(cartes.length ? "Aucun stage à venir" : "Aucun stage pour l'instant",
            "Crée le prochain stage avec « + Nouveau stage » : il apparaît sur le site et les familles inscrivent leurs enfants en ligne.")}
        ${passes.length ? `<div class="ovc-passe">${archive("vie-st-passes", `Stages passés <span class="ong-nb">${passes.length}</span>`, `<div class="ovc-liste" data-vie-place="passes"></div>`)}</div>` : ""}
      </div>`);
      const zf = z.querySelector('[data-vie-place="form"]'); if (zf && form) zf.replaceWith(form);
      const za = z.querySelector('[data-vie-place="avenir"]'); if (za){ avenir.forEach(p => { carteStage(p.c, p.x, false); za.appendChild(p.c); }); za.removeAttribute("data-vie-place"); }
      const zp = z.querySelector('[data-vie-place="passes"]'); if (zp){ passes.forEach(p => { carteStage(p.c, p.x, true); zp.appendChild(p.c); }); zp.removeAttribute("data-vie-place"); }
      while (r.firstChild) r.firstChild.remove();
      r.appendChild(z);
    });
  });

  /* =====================================================================
     INSCRIPTIONS (demandes de licence)
     ===================================================================== */
  const AIDE_LICENCES = `<ol>
      <li>Une famille remplit le formulaire de la page <b>Inscriptions</b> du site : sa demande arrive ici, dans « À traiter ».</li>
      <li>Appelle-la ou touche <b>« Répondre »</b> (e-mail), puis change le <b>statut</b> : « en cours », puis « validée ».</li>
      <li>Une catégorie est complète ? Ferme-la dans <b>« Catégories ouvertes sur le site »</b> : elle s'affiche « complet ».</li></ol>
    <p class="ovc-astuce">Ces fiches contiennent des coordonnées, parfois de mineurs : ne garde que celles dont tu as besoin.</p>`;
  const age = n => { try { const d = jd(n), t = new Date(); let a = t.getFullYear() - d.getFullYear(); if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a--; return a >= 0 && a < 120 ? a : null; } catch(err){ return null; } };
  const naissanceTxt = n => { if (!n) return ""; try { const d = jd(n); if (isNaN(d)) return e(n); const a = age(n); return `né(e) le ${d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}${a !== null ? ` · ${a} ans` : ""}`; } catch(err){ return e(n); } };
  const STATUTS_L = () => (typeof STATUTS !== "undefined" ? STATUTS : ["nouvelle", "en cours", "validée"]);

  function carteDemande(d){
    const st = d.statut === "en cours" ? "encours" : d.statut === "validée" ? "validee" : "nouvelle";
    const adresse = [d.adresse, [d.cp, d.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ");
    const sujet = encodeURIComponent("Votre demande de licence à l'ASF Pierrelatte");
    const ligne = (ico, html) => html ? `<span class="ovd-l"><span class="ovd-i" aria-hidden="true">${ico}</span><span>${html}</span></span>` : "";
    return `<article class="ovc ong-vie-dem ${st}" data-l="${e(d.id)}" data-u="${e(d.uid)}">
      <div class="ovd-tete">
        <div class="ovd-qui"><h4>${e(d.prenom)} ${e(d.nom)}</h4>
          <p class="ovc-info"><b>${e(d.categorie || "Catégorie ?")}</b> · ${e(d.type || "")}${d.ancien ? ` · venant de ${e(d.ancien)}` : ""}</p>
          <p class="ovd-recue">Reçue le ${d.date ? e(jourTxt(d.date)) : "?"}</p></div>
        <label class="ovd-statut"><span>Statut</span><select data-statut aria-label="Statut de la demande de ${e(d.prenom)} ${e(d.nom)}">${STATUTS_L().map(s => `<option ${s === d.statut ? "selected" : ""}>${s}</option>`).join("")}</select></label>
      </div>
      <div class="ovd-infos">
        ${ligne("🎂", d.naissance ? naissanceTxt(d.naissance) : "date de naissance non indiquée")}
        ${d.tel ? ligne("📞", `<a href="tel:${e(numTel(d.tel))}">${e(d.tel)}</a>`) : ""}
        ${d.email ? ligne("✉️", `<a class="ovd-mail" href="mailto:${e(d.email)}">${e(d.email)}</a>`) : ""}
        ${adresse ? ligne("🏠", e(adresse)) : ""}
        ${d.responsable ? ligne("👤", `Responsable : ${e(d.responsable)}${d.telResponsable ? ` · <a href="tel:${e(numTel(d.telResponsable))}">${e(d.telResponsable)}</a>` : ""}`) : ""}
      </div>
      ${d.remarques ? `<p class="ovd-rem">« ${e(d.remarques)} »</p>` : ""}
      <div class="ovc-actions">
        <div class="ovc-act-g"><a class="btn contour petit" href="mailto:${e(d.email)}?subject=${sujet}">✉️ Répondre</a></div>
        <div class="ovc-act-d"><button class="btn danger petit" data-a="del-licence">Supprimer</button></div>
      </div></article>`;
  }

  emballer("panLicences", function(){
    const l = S.licences || [];
    const G = { nouvelle: [], encours: [], validee: [] };
    l.forEach(d => (d.statut === "en cours" ? G.encours : d.statut === "validée" ? G.validee : G.nouvelle).push(d));
    const cats = typeof CATEGORIES !== "undefined" ? CATEGORIES : [];
    const ok = c => (typeof recrute === "function" ? recrute(c) : true);
    const fermees = cats.filter(c => !ok(c));
    const sous = l.length ? `${G.nouvelle.length ? pl(G.nouvelle.length, "demande à traiter", "demandes à traiter") : "Rien à traiter"} · ${pl(l.length, "demande")} en tout` : "Aucune demande reçue";
    const actions = `<button class="btn contour petit" data-a="maj-licences">↻ Actualiser</button>
      <button class="btn contour petit" data-a="export-licences">⬇ Exporter (CSV)</button>`;
    const bascules = `<p class="ovc-astuce">Touche une catégorie pour l'ouvrir ou la fermer. Fermée, elle s'affiche « complet » sur la page Inscriptions et ne peut plus être choisie dans le formulaire.</p>
      <div class="inscr-liste ovl-cats">${cats.map(c => { const o = ok(c);
        return `<button type="button" class="inscr ${o ? "ouvert" : "ferme"}" data-a="bascule-recrute" data-c="${e(c)}" aria-pressed="${o}" title="Toucher pour ${o ? "fermer" : "ouvrir"} les inscriptions ${e(c)}">
          <span class="inscr-nom">${e(c)}</span><span class="inscr-etat"><i aria-hidden="true"></i>${o ? "Ouvert" : "Fermé"}</span></button>`; }).join("")}</div>`;
    const resume = fermees.length ? `<span class="ovl-resume rouge">${pl(fermees.length, "fermée")} : ${fermees.map(e).join(", ")}</span>`
      : `<span class="ovl-resume vert">toutes ouvertes</span>`;
    const liste = (titre, arr, vide) => `${ONG.titre(titre, arr.length)}${arr.length ? `<div class="ovc-liste">${arr.map(carteDemande).join("")}</div>` : (vide ? `<p class="ovc-rien">${vide}</p>` : "")}`;
    return `<div class="ong-vie ong-vie-licences">
      ${ONG.aide("vie-lic-aide", "Comment ça marche ?", AIDE_LICENCES)}
      ${ONG.barre("Demandes d'inscription", e(sous), actions)}
      ${ONG.pli("vie-lic-cats", `Catégories ouvertes sur le site ${resume}`, bascules, false, "⚙").replace('class="pli ong-pli"', 'class="pli ong-pli ovl-reglage"')}
      ${l.length ? `${liste("À traiter", G.nouvelle, "Rien à traiter pour l'instant. 👍")}
        ${G.encours.length ? liste("En cours", G.encours) : ""}
        ${G.validee.length ? `<div class="ovc-passe">${archive("vie-lic-validees", `Demandes validées <span class="ong-nb">${G.validee.length}</span>`, `<div class="ovc-liste">${G.validee.map(carteDemande).join("")}</div>`)}</div>` : ""}
        <div class="ovc-menage"><div><b>Faire le ménage</b><span>Ces fiches contiennent des coordonnées, parfois de mineurs : ne garde que celles en cours de traitement.</span></div>
          <button class="btn danger petit" data-a="purge-licences">Effacer les demandes validées de plus de 6 mois</button></div>`
        : ONG.vide("Aucune demande pour le moment", "Elles arrivent ici dès qu'une famille remplit le formulaire de la page Inscriptions du site. Touche « Actualiser » pour revérifier.")}
    </div>`;
  });

  /* =====================================================================
     RÉUNIONS
     ===================================================================== */
  const AIDE_REUNIONS = `<ol>
      <li>Touche <b>« + Nouvelle réunion »</b> : l'objet, la date, le lieu et l'ordre du jour (une ligne par point).</li>
      <li>Après la réunion, touche <b>« Écrire le compte rendu »</b> pour noter ce qui a été décidé.</li>
      <li>Les réunions passées restent en bas, avec leur compte rendu.</li></ol>`;
  const PUBLICS = ["Bureau", "Éducateurs", "Bureau et éducateurs", "Assemblée générale"];
  const formReunion = () => `<form data-form="reunion" class="ong-vie-form">
      <div class="ong-vie-g">
        <label class="l2">Objet<input name="titre" required placeholder="Réunion du bureau"></label>
        <label class="l2">Public concerné<select name="public">${PUBLICS.map(p => `<option>${p}</option>`).join("")}</select></label>
        <label class="l1">Date<input name="date" type="date" required></label>
        <label class="l1">Heure<input name="heure" type="time" value="19:00"></label>
        <label class="l2">Lieu<input name="lieu" value="Club-house du stade"></label>
        <label class="l4">Ordre du jour · une ligne par point<textarea name="ordre" placeholder="Point sur les licences&#10;Organisation du tournoi&#10;Budget buvette"></textarea></label>
      </div>
      <div class="ong-vie-envoi"><button class="btn bleu">Créer la réunion</button></div></form>`;
  function carteReunion(r, passee){
    const odj = String(r.ordre || "").split("\n").map(x => x.trim()).filter(Boolean);
    const cr = String(r.compteRendu || "").trim();
    const a = auj();
    const quand = [r.date ? jourTxt(r.date) : "Date à préciser", r.heure ? (r.date ? "à " : "") + heureTxt(r.heure) : ""].filter(Boolean).join(" ");
    const chips = [chip(e(r.public || "Bureau"), "bleu"), r.date === a ? chip("Aujourd'hui", "vert") : "", passee && !cr ? chip("Compte rendu à écrire", "jaune") : ""].join("");
    return `<article class="ovc ong-vie-reu${passee ? " passe" : ""}" data-re="${e(r.id)}">
      ${badge(r.date)}
      <div class="ovc-corps">
        <div class="ovc-t"><h4>${e(r.titre || "Réunion")}</h4></div>
        <p class="ovc-info">${e(quand)}${r.lieu ? ` · ${e(r.lieu)}` : ""}</p>
        <div class="ovc-chips">${chips}</div>
        ${odj.length ? `<div class="ovr-bloc"><b>Ordre du jour</b><ol>${odj.map(x => `<li>${e(x)}</li>`).join("")}</ol></div>` : ""}
        ${cr ? `<div class="ovr-bloc ovr-cr"><b>Compte rendu</b><p>${e(cr)}</p></div>` : ""}
      </div>
      <div class="ovc-actions ovc-col">
        <div class="ovc-act-g"><button class="btn ${passee && !cr ? "bleu" : "contour"} petit" data-a="cr-reunion">${cr ? "Modifier le compte rendu" : passee ? "Écrire le compte rendu" : "Compte rendu"}</button></div>
        <div class="ovc-act-d"><button class="btn danger petit" data-a="del-reunion">Supprimer</button></div>
      </div></article>`;
  }
  emballer("panReunions", function(){
    const l = [...(S.reunions || [])], a = auj(), cle = r => (r.date || "9999-99-99") + (r.heure || "");
    const avenir = l.filter(r => !r.date || r.date >= a).sort((p, q) => cle(p).localeCompare(cle(q)));
    const passees = l.filter(r => r.date && r.date < a).sort((p, q) => cle(q).localeCompare(cle(p)));
    const p1 = avenir.find(r => r.date);
    const sous = p1 ? `Prochaine : ${e(p1.titre || "réunion")}, ${e(jourTxt(p1.date))}${p1.heure ? " à " + e(heureTxt(p1.heure)) : ""}` : "Aucune réunion à venir";
    const bloc = blocCreer("vie-reu-form", "Nouvelle réunion", formReunion(), !l.length);
    noter("reunions");
    const recentes = passees.slice(0, 3), anciennes = passees.slice(3);
    return `<div class="ong-vie ong-vie-reunions">
      ${ONG.aide("vie-reu-aide", "Comment ça marche ?", AIDE_REUNIONS)}
      ${tete("Réunions", sous, bloc)}
      ${!l.length ? (bloc.ouvert ? "" : ONG.vide("Aucune réunion pour l'instant", "Programme la prochaine avec « + Nouvelle réunion » : objet, date, lieu et ordre du jour."))
        : `${ONG.titre("À venir", avenir.length)}${avenir.length ? `<div class="ovc-liste">${avenir.map(r => carteReunion(r, false)).join("")}</div>`
          : ONG.vide("Aucune réunion à venir", "Programme la prochaine avec « + Nouvelle réunion » : objet, date, lieu et ordre du jour.")}`}
      ${passees.length ? `${ONG.titre("Réunions passées", passees.length)}<div class="ovc-liste">${recentes.map(r => carteReunion(r, true)).join("")}</div>
        ${anciennes.length ? `<div class="ovc-passe">${archive("vie-reu-anciennes", `Plus anciennes <span class="ong-nb">${anciennes.length}</span>`, `<div class="ovc-liste">${anciennes.map(r => carteReunion(r, true)).join("")}</div>`)}</div>` : ""}` : ""}
    </div>`;
  });

  /* =====================================================================
     BÉNÉVOLES
     ===================================================================== */
  const AIDE_BENEVOLES = `<ol>
      <li>Touche <b>« + Nouveau créneau »</b> (buvette, arbitrage, table de marque…) et indique combien de personnes il faut.</li>
      <li>Les joueurs et les parents s'inscrivent depuis leur espace sur le site : leurs noms apparaissent sur le créneau.</li>
      <li>Les covoiturages sont proposés par les familles depuis leur espace : tu les vois en bas de la page.</li></ol>`;
  const formCreneau = () => `<form data-form="creneau" class="ong-vie-form">
      <div class="ong-vie-g">
        <label class="l3">Intitulé<input name="titre" required placeholder="Buvette, samedi après-midi"></label>
        <label class="l1">Personnes qu'il faut<input name="places" type="number" min="1" max="30" value="2" inputmode="numeric"></label>
        <label class="l1">Date<input name="date" type="date" required></label>
        <label class="l1">Heure<input name="heure" type="time"></label>
        <label class="l2">Lieu<input name="lieu" value="${e(stade())}"></label>
      </div>
      <div class="ong-vie-envoi"><button class="btn bleu">Créer le créneau</button></div></form>`;
  const noms = l => l.length ? `<div class="ovb-noms">${l.map(i => `<span class="ovb-nom">${e(i.nom || "?")}</span>`).join("")}</div>` : "";
  function carteCreneau(b, passe){
    const ins = typeof inscritsCreneau === "function" ? inscritsCreneau(b.id) : [];
    const p = +b.places || 0, n = ins.length, plein = p && n >= p, manque = p ? p - n : 0;
    const etat = plein ? chip(`✓ Complet · ${n}/${p}`, "vert")
      : p ? chip(`${n}/${p} inscrits · il manque ${pl(manque, "personne")}`, passe ? "gris" : "jaune") : chip(`${pl(n, "inscrit")}`, "gris");
    return `<article class="ovc ong-vie-ben${passe ? " passe" : ""}" data-b2="${e(b.id)}">
      ${badge(b.date)}
      <div class="ovc-corps">
        <div class="ovc-t"><h4>${e(b.titre || "Créneau")}</h4></div>
        <p class="ovc-info">${b.date ? e(jourTxt(b.date)) : ""}${b.heure ? " · " + e(heureTxt(b.heure)) : ""} · ${e(b.lieu || stade())}</p>
        <div class="ovc-chips">${etat}</div>
        ${n ? noms(ins) : `<p class="ovc-astuce">Personne d'inscrit pour l'instant.</p>`}
      </div>
      <div class="ovc-actions ovc-col"><div class="ovc-act-d"><button class="btn danger petit" data-a="del-creneau">Supprimer</button></div></div>
    </article>`;
  }
  function carteTrajet(t){
    const ps = typeof passagers === "function" ? passagers(t.id) : [];
    const p = +t.places || 0, plein = p && ps.length >= p;
    return `<article class="ovc ong-vie-trajet">
      ${badge(t.date)}
      <div class="ovc-corps">
        <div class="ovc-t"><h4>${e(t.depart || "?")} <span class="ovb-fl" aria-hidden="true">→</span> ${e(t.destination || "le match")}</h4></div>
        <p class="ovc-info">${t.date ? e(jourTxt(t.date)) : ""}${t.heure ? " · départ " + e(heureTxt(t.heure)) : ""} · conducteur : <b>${e(t.conducteur || "?")}</b>${t.tel ? ` · <a href="tel:${e(numTel(t.tel))}">${e(t.tel)}</a>` : ""}</p>
        <div class="ovc-chips">${chip(`${ps.length}/${p || "?"} passagers`, plein ? "vert" : "bleu")}</div>
        ${noms(ps)}
      </div></article>`;
  }
  emballer("panBenevoles", function(){
    const a = auj(), l = [...(S.benevoles || [])], cle = b => (b.date || "9999-99-99") + (b.heure || "");
    const avenir = l.filter(b => !b.date || b.date >= a).sort((p, q) => cle(p).localeCompare(cle(q)));
    const passes = l.filter(b => b.date && b.date < a).sort((p, q) => cle(q).localeCompare(cle(p)));
    const trajets = typeof tousTrajets === "function" ? tousTrajets() : [];
    const tAvenir = trajets.filter(t => !t.date || t.date >= a), tPasses = trajets.filter(t => t.date && t.date < a).reverse();
    const libres = avenir.reduce((s, b) => { const p = +b.places || 0; return s + (p ? Math.max(0, p - (typeof inscritsCreneau === "function" ? inscritsCreneau(b.id).length : 0)) : 0); }, 0);
    const sous = avenir.length ? `${pl(avenir.length, "créneau à venir", "créneaux à venir")} · ${libres ? pl(libres, "place encore libre", "places encore libres") : "tout est complet"}` : "Aucun créneau à venir";
    const bloc = blocCreer("vie-ben-form", "Nouveau créneau", formCreneau(), !l.length);
    noter("benevoles");
    return `<div class="ong-vie ong-vie-benevoles">
      ${ONG.aide("vie-ben-aide", "Comment ça marche ?", AIDE_BENEVOLES)}
      ${tete("Bénévolat", e(sous), bloc)}
      ${!l.length && bloc.ouvert ? "" : `${ONG.titre("Créneaux à venir", avenir.length)}
      ${avenir.length ? `<div class="ovc-liste">${avenir.map(b => carteCreneau(b, false)).join("")}</div>`
        : ONG.vide("Aucun créneau à venir", "Crée un créneau avec « + Nouveau créneau » (buvette, arbitrage, transport) : les joueurs et les parents s'y inscrivent depuis le site.")}`}
      ${passes.length ? `<div class="ovc-passe">${archive("vie-ben-passes", `Créneaux passés <span class="ong-nb">${passes.length}</span>`, `<div class="ovc-liste">${passes.map(b => carteCreneau(b, true)).join("")}</div>`)}</div>` : ""}
      ${ONG.titre("Covoiturages proposés", tAvenir.length)}
      ${tAvenir.length ? `<div class="ovc-liste">${tAvenir.map(carteTrajet).join("")}</div>`
        : ONG.vide("Aucun covoiturage à venir", "Les joueurs et les parents proposent les trajets depuis leur espace sur le site.")}
      ${tPasses.length ? `<div class="ovc-passe">${archive("vie-ben-trajets-passes", `Covoiturages passés <span class="ong-nb">${tPasses.length}</span>`, `<div class="ovc-liste">${tPasses.map(carteTrajet).join("")}</div>`)}</div>` : ""}
    </div>`;
  });

  /* =====================================================================
     STYLES (tout est rangé sous body.sur-espace #panneau .ong-vie)
     ===================================================================== */
  const css = document.createElement("style");
  css.id = "onglets-vie-css";
  const R = "body.sur-espace #panneau .ong-vie";
  css.textContent = `
/* l'icône « + » des blocs dépliants : à sa place dans le titre (elle prenait la position fixe du menu « Plus » du site) */
${R} .pli>summary .plus{position:static;inset:auto;display:grid!important;flex:none;padding:0;border:0;box-shadow:none;z-index:auto;margin:0}
${R} .ong-aide{margin-bottom:16px}
${R} .ong-titre{margin:26px 0 12px}
${R} .ong-barre{align-items:flex-start;margin-bottom:14px}
${R} .ong-barre-txt{flex:1 1 320px}
${R} .ong-barre h2{font-size:26px}
${R} .ovc-liste{display:grid;gap:12px}
${R} .ovc-astuce{margin:8px 0 0;font-size:14px;color:#AFC0EA;line-height:1.45}
${R} .ovc-rien{margin:0;padding:14px 18px;border-radius:14px;border:1px dashed rgba(143,168,240,.28);color:#AFC0EA}
/* --- bouton « + Nouveau… » : le titre d'un bloc dépliant, qui s'ouvre sous la barre --- */
${R} .ong-barre-act.ong-vie-ouvert{flex:1 1 100%}
${R} .ong-vie-creer{margin:0}
${R} .ong-vie-creer:not([open]){background:none;border:0;box-shadow:none;overflow:visible}
${R} .ong-vie-creer:not([open])>summary{min-height:50px;padding:0 22px 0 14px;border-radius:14px;gap:10px;font:800 16.5px var(--corps);letter-spacing:.1px;color:#fff;
  background:linear-gradient(180deg,#2F6BFF,#1C4FD6);box-shadow:0 10px 22px rgba(47,107,255,.3),inset 0 1px 0 rgba(255,255,255,.25);white-space:nowrap}
${R} .ong-vie-creer:not([open])>summary:hover{filter:brightness(1.08)}
${R} .ong-vie-creer:not([open])>summary .plus{width:28px;height:28px;border-radius:9px;background:rgba(255,255,255,.2);font-size:20px}
${R} .ong-vie-creer:not([open])>summary .ong-pli-fl{display:none}
${R} .ong-vie-creer:not([open])>summary .ong-pli-t{flex:0 1 auto}
${R} .ong-vie-creer[open]{width:100%;border-color:rgba(91,140,255,.55)}
${R} .ong-vie-creer[open]>summary{font:800 22px var(--display)}
${R} .ong-vie-creer[open]>summary .ong-pli-fl{display:none}
${R} .ong-vie-creer[open]>summary::after{content:"Fermer ✕";margin-left:auto;font:700 14px var(--corps);color:#C9D4F2;border:1px solid rgba(143,168,240,.4);border-radius:10px;padding:7px 12px}
${R} .ong-vie-creer:focus-within>summary:focus-visible{outline:3px solid rgba(201,162,39,.75);outline-offset:2px}
/* --- formulaires : une grille de 4 colonnes, les champs dans l'ordre quoi → quand → où --- */
${R} .ong-vie-g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px 18px;align-items:start}
${R} .ong-vie-g>*{margin:0!important;min-width:0}
${R} .ong-vie-g>.l1{grid-column:span 1}
${R} .ong-vie-g>.l2{grid-column:span 2}
${R} .ong-vie-g>.l3{grid-column:span 3}
${R} .ong-vie-g>.l4{grid-column:1/-1}
${R} .ong-vie-g>label{display:grid}
${R} .ong-vie-g textarea{min-height:110px}
${R} .ong-vie-form{margin-top:14px}
${R} .ong-vie-envoi{display:flex;gap:10px;flex-wrap:wrap;margin-top:18px}
${R} .ong-vie-envoi .btn.bleu{min-width:220px;min-height:50px;font-size:16.5px}
${R} .ong-vie-oblig{margin:12px 0 4px;color:#C9D4F2;font-size:14.5px}
${R} .ong-vie-fgr{display:grid;gap:14px;margin-top:12px}
${R} .ong-vie-grp{border:1px solid rgba(143,168,240,.16);border-radius:16px;padding:14px 16px 16px;background:rgba(5,11,31,.22)}
${R} .ong-vie-grp-t{display:flex;align-items:center;gap:10px;margin:0 0 12px;font:800 17px var(--display);letter-spacing:.2px;color:#fff}
${R} .ong-vie-grp-t span{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:50%;background:rgba(91,140,255,.25);color:#DCE5FF;font:800 13px var(--corps)}
${R} .ong-vie-apercu img{max-width:100%!important;max-height:120px;object-fit:contain}
${R} .ong-vie-g .st-accord{text-transform:none;letter-spacing:0;font:600 14.5px var(--corps);border-radius:14px!important;line-height:1.4}
${R} .ong-vie-g .an-titre{display:block;font:700 12px var(--corps);letter-spacing:.06em;text-transform:uppercase;color:var(--texte-doux)}
/* --- cartes de liste : date à gauche, l'essentiel au milieu, les boutons à droite --- */
${R} .ovc{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px 18px;align-items:start;padding:16px 18px;margin:0;border-radius:18px;
  background:linear-gradient(180deg,rgba(26,44,96,.5),rgba(14,26,60,.5));border:1px solid rgba(143,168,240,.18)}
${R} .ovc:hover{border-color:rgba(143,168,240,.4)}
${R} .ovc.passe{opacity:.88}
${R} .ovc-corps{min-width:0;display:grid;gap:6px}
${R} .ovc h4{margin:0;font:800 21px/1.15 var(--display);letter-spacing:.2px;color:#fff;overflow-wrap:anywhere}
${R} .ovc-info{margin:0;color:#C9D4F2;font-size:15px;line-height:1.45;overflow-wrap:anywhere}
${R} .ovc-info a{color:#9FC0FF;font-weight:700}
${R} .ovc-doux{color:#AFC0EA;font-size:14px}
${R} .ovc-chips{display:flex;flex-wrap:wrap;gap:6px}
${R} .ovc-chip{display:inline-flex;align-items:center;gap:5px;font:700 13px var(--corps);padding:4px 11px;border-radius:999px;white-space:nowrap;background:rgba(143,168,240,.14);color:#C9D4F2}
${R} .ovc-chip.vert{background:rgba(34,197,94,.16);color:#86EFAC}
${R} .ovc-chip.jaune{background:rgba(234,179,8,.16);color:#FCD34D}
${R} .ovc-chip.rouge{background:rgba(239,68,68,.16);color:#FCA5A5}
${R} .ovc-chip.bleu{background:rgba(91,140,255,.18);color:#C7D7FF}
${R} .ovc-actions{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}
${R} .ovc-act-g,${R} .ovc-act-d{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
${R} .ovc-col{flex-direction:column;align-items:flex-end;justify-content:space-between;align-self:stretch;min-width:0}
${R} .ovc-col .ovc-act-d{margin-top:auto}
${R} .ovc-passe{margin-top:16px}
${R} .ong-vie-archive{box-shadow:none;background:rgba(10,20,48,.35)}
${R} .ong-vie-archive>summary{font:800 18px var(--display);padding:12px 18px;min-height:52px}
${R} .ong-vie-archive>summary .plus{width:30px;height:30px;font-size:16px;background:rgba(143,168,240,.18)}
${R} .ong-vie-archive .pli-corps{padding:12px 14px 14px}
/* --- stages --- */
${R} .ong-vie-stage{grid-template-columns:minmax(0,1fr);gap:14px;padding:18px 20px}
${R} .ovs-tete{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:18px;align-items:start}
${R} .ovs-affiche{width:86px}
${R} .ovs-affiche .ovs-lien{display:block}
${R} .ovs-affiche img.st-mini{display:block;width:86px;max-width:86px;height:auto;max-height:120px;object-fit:cover;margin:0;border-radius:12px;border:1px solid rgba(143,168,240,.3)}
${R} .ovs-sans{display:grid;place-items:center;text-align:center;width:86px;height:100px;border-radius:12px;border:1.5px dashed rgba(143,168,240,.35);color:#8FA3D6;font:700 12px/1.3 var(--corps)}
${R} .ovs-txt{display:grid;gap:7px;min-width:0}
${R} .ovs-txt h4{font-size:24px}
${R} .ovs-compte{display:grid;grid-template-columns:auto auto;align-items:center;gap:4px 10px;padding:10px 14px;border-radius:14px;background:rgba(5,11,31,.35);border:1px solid rgba(143,168,240,.18);min-width:150px}
${R} .ovs-compte b{font:900 38px/1 var(--display);color:#fff}
${R} .ovs-compte span{font:700 13px/1.3 var(--corps);color:#C9D4F2}
${R} .ovs-jauge{grid-column:1/-1;display:block;height:7px;border-radius:99px;background:rgba(143,168,240,.18);overflow:hidden}
${R} .ovs-jauge>i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#2F6BFF,#5B8CFF)}
${R} .ovs-compte.plein .ovs-jauge>i{background:linear-gradient(90deg,#16A34A,#22C55E)}
${R} .ong-vie-stage .ovc-actions{padding-top:12px;border-top:1px solid rgba(143,168,240,.14)}
${R} .ovs-aucun{margin:0;color:#AFC0EA;font-size:14.5px}
${R} .ovs-ins{border:1px solid rgba(143,168,240,.18);border-radius:14px;background:rgba(5,11,31,.25)}
${R} .ovs-ins>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px;min-height:48px}
${R} .ovs-ins>summary::-webkit-details-marker{display:none}
${R} .ovs-ins-t{display:inline-flex;align-items:center;gap:8px;font:800 18px var(--display);color:#fff}
${R} .ovs-cats{display:flex;flex-wrap:wrap;gap:6px}
${R} .ovs-cats span{font:600 13px var(--corps);color:#C9D4F2;background:rgba(143,168,240,.12);border-radius:999px;padding:3px 10px}
${R} .ovs-cats b{color:#fff}
${R} .ovs-fl{margin-left:auto;opacity:.75;transition:transform .2s}
${R} .ovs-ins[open] .ovs-fl{transform:rotate(180deg)}
${R} .ovs-ins-corps{padding:0 12px 12px}
${R} .ovs-ins .st-table-zone{margin-top:0}
${R} .ovs-ins .st-table th,${R} .ovs-ins .st-table td{text-align:left;padding:9px 12px;vertical-align:middle}
${R} .ovs-ins .st-table td:last-child{text-align:right;width:56px}
${R} .ovs-ins .st-table .btn.petit{min-height:36px;min-width:40px;padding:4px 10px}
/* --- inscriptions --- */
${R} .ovl-reglage>summary{font:800 19px var(--display);flex-wrap:wrap;row-gap:4px}
${R} .ovl-reglage>summary .plus{font-size:16px;background:rgba(143,168,240,.22)}
${R} .ovl-resume{display:inline-block;white-space:nowrap;font:700 13px var(--corps);border-radius:999px;padding:4px 11px;margin-left:8px;vertical-align:middle}
${R} .ovl-resume.vert{background:rgba(34,197,94,.16);color:#86EFAC}
${R} .ovl-resume.rouge{background:rgba(239,68,68,.16);color:#FCA5A5}
${R} .ovl-cats{grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px;margin-top:12px}
${R} .ovl-cats .inscr{min-height:56px;padding:10px 14px}
${R} .ovl-cats .inscr-nom{font-size:18px;line-height:1.15}
${R} .ovl-cats .inscr-etat{display:inline-flex;align-items:center;gap:7px;min-width:92px;justify-content:center}
${R} .ovl-cats .inscr-etat i{width:10px;height:10px;border-radius:50%;background:#fff;flex:none}
${R} .ong-vie-dem{grid-template-columns:minmax(0,1fr);gap:10px;border-left:5px solid rgba(143,168,240,.35)}
${R} .ong-vie-dem.nouvelle{border-left-color:#F2B32A}
${R} .ong-vie-dem.encours{border-left-color:#5B8CFF}
${R} .ong-vie-dem.validee{border-left-color:#22C55E}
${R} .ovd-tete{display:flex;justify-content:space-between;align-items:flex-start;gap:12px 16px;flex-wrap:wrap}
${R} .ovd-qui{min-width:0;flex:1 1 260px;display:grid;gap:4px}
${R} .ovd-statut{display:flex!important;align-items:center;gap:10px;flex:none}
${R} .ovd-statut select{width:auto;min-width:150px;height:44px;min-height:44px}
${R} .ovd-infos{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:6px 18px}
${R} .ovd-l{display:flex;gap:8px;align-items:baseline;min-width:0;color:#DCE5FF;font-size:15px;line-height:1.4}
${R} .ovd-l>span:last-child{min-width:0;overflow-wrap:anywhere}
${R} .ovd-i{width:20px;flex:none;text-align:center}
${R} .ovd-l a{color:#9FC0FF;font-weight:700;text-decoration:none}
${R} .ovd-l a[href^="tel:"]{white-space:nowrap}
${R} .ovd-l a:hover{text-decoration:underline}
${R} .ovd-rem{margin:0;padding:8px 12px;border-radius:10px;background:rgba(143,168,240,.08);color:#DCE5FF;font-style:italic}
${R} .ovd-recue{margin:0;color:#AFC0EA;font-size:13.5px}
${R} .ong-vie-dem .ovc-actions{padding-top:10px;border-top:1px solid rgba(143,168,240,.12);align-items:center}
${R} .ovc-menage{display:flex;justify-content:space-between;align-items:center;gap:12px 18px;flex-wrap:wrap;margin-top:28px;padding:14px 18px;border-radius:16px;border:1px solid rgba(248,113,113,.3);background:rgba(220,38,38,.05)}
${R} .ovc-menage>div{display:grid;gap:3px;flex:1 1 300px}
${R} .ovc-menage b{font:800 17px var(--display);color:#FCA5A5}
${R} .ovc-menage span{color:#AFC0EA;font-size:14px;line-height:1.45}
/* --- réunions --- */
${R} .ovr-bloc{margin-top:4px;padding:10px 14px;border-radius:12px;background:rgba(5,11,31,.3);border:1px solid rgba(143,168,240,.12)}
${R} .ovr-bloc b{display:block;font:700 12px var(--corps);letter-spacing:.08em;text-transform:uppercase;color:#AFC0EA;margin-bottom:4px}
${R} .ovr-bloc ol{margin:0;padding-left:22px;display:grid;gap:2px;color:#E6ECFF;font-size:15px}
${R} .ovr-bloc p{margin:0;color:#E6ECFF;font-size:15px;line-height:1.5;white-space:pre-line}
${R} .ovr-cr{border-color:rgba(34,197,94,.3);background:rgba(34,197,94,.06)}
/* --- bénévoles --- */
${R} .ovb-noms{display:flex;flex-wrap:wrap;gap:6px}
${R} .ovb-nom{font:600 14px var(--corps);padding:4px 11px;border-radius:999px;background:rgba(143,168,240,.12);border:1px solid rgba(143,168,240,.2);color:#E6ECFF}
${R} .ovb-fl{color:#F3D48A}
/* --- thème clair --- */
:root[data-theme="light"] ${R} .ovc{background:var(--carte);box-shadow:0 8px 22px rgba(7,18,48,.07);border-color:#D5DEF5}
:root[data-theme="light"] ${R} .ovc h4,:root[data-theme="light"] ${R} .ovs-compte b,:root[data-theme="light"] ${R} .ovs-ins-t,:root[data-theme="light"] ${R} .ovs-cats b,:root[data-theme="light"] ${R} .ong-vie-grp-t{color:var(--texte)}
:root[data-theme="light"] ${R} .ovc-info,:root[data-theme="light"] ${R} .ovd-l,:root[data-theme="light"] ${R} .ovr-bloc ol,:root[data-theme="light"] ${R} .ovr-bloc p,:root[data-theme="light"] ${R} .ovd-rem,:root[data-theme="light"] ${R} .ovb-nom,:root[data-theme="light"] ${R} .ong-vie-oblig{color:var(--texte)}
:root[data-theme="light"] ${R} .ovc-doux,:root[data-theme="light"] ${R} .ovc-astuce,:root[data-theme="light"] ${R} .ovd-recue,:root[data-theme="light"] ${R} .ovs-aucun,:root[data-theme="light"] ${R} .ovr-bloc b,:root[data-theme="light"] ${R} .ovs-compte span,:root[data-theme="light"] ${R} .ovs-cats span,:root[data-theme="light"] ${R} .ovc-menage span,:root[data-theme="light"] ${R} .ovc-rien{color:var(--texte-doux)}
:root[data-theme="light"] ${R} .ovc-info a,:root[data-theme="light"] ${R} .ovd-l a{color:#1C4FD6}
:root[data-theme="light"] ${R} .ovc-chip{background:rgba(71,85,105,.1);color:#334155}
:root[data-theme="light"] ${R} .ovc-chip.vert,:root[data-theme="light"] ${R} .ovl-resume.vert{background:rgba(22,163,74,.12);color:#15803D}
:root[data-theme="light"] ${R} .ovc-chip.jaune{background:rgba(217,119,6,.14);color:#92400E}
:root[data-theme="light"] ${R} .ovc-chip.rouge,:root[data-theme="light"] ${R} .ovl-resume.rouge{background:rgba(220,38,38,.1);color:#B91C1C}
:root[data-theme="light"] ${R} .ovc-chip.bleu{background:rgba(28,79,214,.1);color:#1C4FD6}
:root[data-theme="light"] ${R} .ovs-compte,:root[data-theme="light"] ${R} .ovs-ins,:root[data-theme="light"] ${R} .ovr-bloc,:root[data-theme="light"] ${R} .ong-vie-grp{background:rgba(28,79,214,.04);border-color:#D5DEF5}
:root[data-theme="light"] ${R} .ovr-cr{background:rgba(22,163,74,.06);border-color:rgba(22,163,74,.3)}
:root[data-theme="light"] ${R} .ovb-nom{background:rgba(28,79,214,.07);border-color:#D5DEF5}
:root[data-theme="light"] ${R} .ovb-fl{color:#9A6B00}
:root[data-theme="light"] ${R} .ovd-rem{background:rgba(28,79,214,.05)}
:root[data-theme="light"] ${R} .ong-vie-archive{background:var(--carte)}
:root[data-theme="light"] ${R} .ovs-sans{color:#4A5A86;border-color:rgba(28,63,158,.3)}
:root[data-theme="light"] ${R} .ong-vie-creer[open]>summary::after{color:var(--texte);border-color:#C9D4F2}
:root[data-theme="light"] ${R} .ong-vie-creer:not([open])>summary{color:#fff}
:root[data-theme="light"] ${R} .ovc-menage b{color:#B91C1C}
:root[data-theme="light"] ${R} .ong-vie-dem.nouvelle{border-left-color:#D97706}
:root[data-theme="light"] ${R} .ong-vie-dem.encours{border-left-color:#2F6BFF}
:root[data-theme="light"] ${R} .ong-vie-dem.validee{border-left-color:#16A34A}
:root[data-theme="light"] ${R} .ong-vie-archive>summary .plus,:root[data-theme="light"] ${R} .ovl-reglage>summary .plus{background:rgba(28,79,214,.12);color:#1C4FD6}
:root[data-theme="light"] ${R} .ong-nb{background:rgba(28,79,214,.12);color:#1C4FD6}
:root[data-theme="light"] ${R} .btn.danger{color:#B91C1C;border-color:rgba(220,38,38,.55);background:rgba(220,38,38,.06)}
:root[data-theme="light"] ${R} input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]),:root[data-theme="light"] ${R} select,:root[data-theme="light"] ${R} textarea{background:#fff;border-color:#C9D4F2;color:var(--texte)}
:root[data-theme="light"] ${R} .st-table td,:root[data-theme="light"] ${R} .st-table th{color:var(--texte)}
/* --- tablette et téléphone --- */
@media (max-width:900px){
  ${R} .ong-vie-g{grid-template-columns:repeat(2,minmax(0,1fr))}
  ${R} .ong-vie-g>.l2,${R} .ong-vie-g>.l3{grid-column:1/-1}
}
@media (max-width:700px){
  ${R} .ong-barre h2{font-size:24px}
  ${R} .ong-barre-act{width:100%}
  ${R} .ong-barre-act>.btn{flex:1}
  ${R} .ong-vie-creer{flex:1 1 100%}
  ${R} .ong-vie-creer:not([open])>summary{justify-content:center;min-height:52px}
  ${R} .ong-vie-creer[open]>summary{font-size:20px;padding:14px 16px}
  ${R} .ong-vie-creer .pli-corps{padding:12px 14px 16px}
  ${R} .ong-vie-g{grid-template-columns:minmax(0,1fr);gap:14px}
  ${R} .ong-vie-g>*{grid-column:1/-1!important}
  ${R} .ong-vie-grp{padding:12px 12px 14px}
  ${R} .ong-vie-envoi .btn{flex:1 1 100%}
  ${R} .ovc{grid-template-columns:auto minmax(0,1fr);gap:10px 14px;padding:14px}
  ${R} .ovc .bdate{grid-row:auto}
  ${R} .ovc>.ovc-actions{grid-column:1/-1}
  ${R} .ovc-col{flex-direction:row;align-items:center;padding-top:10px;border-top:1px solid rgba(143,168,240,.12)}
  ${R} .ovc-col .ovc-act-d{margin-top:0;margin-left:auto}
  ${R} .ovc h4{font-size:20px}
  ${R} .ovc-chip{white-space:normal}
  ${R} .ong-vie-stage,${R} .ong-vie-dem{grid-template-columns:minmax(0,1fr);padding:14px}
  ${R} .ovs-tete{grid-template-columns:auto minmax(0,1fr);gap:12px 14px}
  ${R} .ovs-affiche,${R} .ovs-affiche img.st-mini,${R} .ovs-sans{width:68px;max-width:68px}
  ${R} .ovs-sans{height:84px;font-size:11px}
  ${R} .ovs-txt h4{font-size:21px}
  ${R} .ovs-compte{grid-column:1/-1;grid-template-columns:auto 1fr;min-width:0}
  ${R} .ovs-compte b{font-size:32px}
  ${R} .ong-vie-stage .ovc-actions{display:grid;grid-template-columns:minmax(0,1fr)}
  ${R} .ong-vie-stage .ovc-act-g{display:grid;grid-template-columns:1fr 1fr;gap:8px}
  ${R} .ong-vie-stage .ovc-act-g>.btn{width:100%;min-height:46px;text-align:center;line-height:1.2}
  ${R} .ong-vie-stage .ovc-act-g>[data-ev-a]{grid-column:1/-1}
  ${R} .ong-vie-stage .ovc-act-d{justify-content:flex-end;padding-top:10px;border-top:1px dashed rgba(143,168,240,.18)}
  ${R} .ovs-ins-corps{padding:0 8px 8px}
  ${R} .ovs-ins .st-ins{background:rgba(5,11,31,.35)}
  ${R} .ovd-statut{width:100%;justify-content:space-between}
  ${R} .ovd-statut select{flex:1;min-width:0}
  ${R} .ovd-infos{grid-template-columns:minmax(0,1fr)}
  ${R} .ong-vie-dem .ovc-actions{align-items:center}
  ${R} .ovl-cats{grid-template-columns:minmax(0,1fr)}
  ${R} .ovl-reglage>summary{font-size:17px}
  ${R} .ovl-resume{display:block;width:max-content;max-width:100%;white-space:normal;margin:6px 0 0}
  ${R} .ovc-menage .btn{width:100%;white-space:normal;text-align:center;line-height:1.25}
  ${R} .btn.petit{min-height:44px}
}`;
  document.head.appendChild(css);
})();
