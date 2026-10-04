/* Rubrique Communication › onglets « Actualités » et « Messages », rangés pour que ce soit simple :
   - Actualités : la liste d'abord (date, titre, début du texte, sur l'accueil ou non), « + Nouvelle actualité » replié
     juste au-dessus (ouvert tout seul quand il n'y en a aucune), « Modifier » sur chaque fiche, « Supprimer » à part, en rouge.
   - Messages : une vraie boîte de réception. Filtres par état (nouveaux, à répondre, en cours, fermés), pour chaque message
     l'expéditeur, le sujet et la date bien lisibles ; la conversation avec la zone de réponse bien visible en bas.
   Ajouté sans modifier le script de l'application : tous les boutons gardent leurs data-a / data-k / data-id, les fiches
   leur data-ac, le formulaire data-form="actu" est celui de l'application ; #cv-fil, #cv-texte, .cv, .voir-conv, .cv-liste et
   .cv-conv restent en place pour majConversationOuverte et l'affichage téléphone. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONG === "undefined") return;
  const e = ONG.e;
  const prenom = n => String(n || "la personne").split(" ")[0];

  /* =====================================================================
     ACTUALITÉS
     ===================================================================== */
  const NB_ACCUEIL = 5;                       // l'accueil du site fait défiler les 5 plus récentes (voir rendreHeroActus)

  function carteActu(a, i){
    if (S.ui.ongActuEdit === a.id) return carteEdition(a);
    const accueil = i < NB_ACCUEIL;
    return `<article class="item ong-actu-carte" data-ac="${e(a.id)}">
      ${badgeDate(a.date)}
      ${a.photo ? `<img class="ong-actu-photo" src="${e(blobUrl(a.photo))}" alt="" loading="lazy">` : ""}
      <div class="item-txt"><h3>${e(a.titre)}</h3>
        <p>${e(String(a.texte || "").slice(0, 400))}</p>
        <div class="ong-actu-meta"><span class="etiq ${accueil ? "ok" : ""}" title="${accueil ? "Elle défile en haut de la page d'accueil du site" : `Seules les ${NB_ACCUEIL} plus récentes défilent sur l'accueil`}">${accueil ? "✓ Sur l'accueil" : "Plus sur l'accueil"}</span>
          ${a.photo ? `<small class="ong-actu-avec">📷 avec photo</small>` : ""}</div></div>
      <div class="ong-actu-act">
        <button type="button" class="btn contour petit ong-actu-modif" data-ong-actu="modifier">✏️ Modifier</button>
        <button class="btn danger petit ong-actu-suppr" data-a="del-actu">Supprimer</button></div></article>`;
  }
  /* la fiche ouverte pour la corriger : même champs que le formulaire de création */
  function carteEdition(a){
    const b = (S.ui.ongActuBrouillon && S.ui.ongActuBrouillon.id === a.id) ? S.ui.ongActuBrouillon : a;
    return `<article class="item ong-actu-carte ong-actu-edition" data-ac="${e(a.id)}">
      <form class="ong-actu-form" data-ong-actu-form novalidate>
        <div class="ong-actu-form-t"><span aria-hidden="true">✏️</span>Modifier l'actualité</div>
        <div class="grille"><label>Titre<input name="titre" required value="${e(b.titre || "")}"></label>
          <label>Date<input name="date" type="date" required value="${e(b.date || "")}"></label></div>
        <label class="pleine">Texte<textarea name="texte" required rows="5">${e(b.texte || "")}</textarea></label>
        ${S.assets ? `<div class="pleine"><b>Photo (facultatif)</b>${biblioHtml("ongActuPhoto")}</div>`
          : a.photo ? `<p class="quoi ong-actu-note">La photo ne change pas.</p>` : ""}
        <div class="ong-actu-btns"><button class="btn bleu">Enregistrer</button>
          <button type="button" class="btn contour" data-ong-actu="annuler">Annuler</button></div>
      </form></article>`;
  }

  if (typeof window.panActus === "function"){
    const avantActus = window.panActus;
    window.panActus = function(){
      const h = avantActus.apply(this, arguments);
      return ONG.transformer(h, racine => {
        const form = racine.querySelector('form[data-form="actu"]');
        if (!form) throw new Error("formulaire des actualités introuvable");      // on garde alors l'affichage de l'application
        const l = [...(S.actus || [])].sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        if (S.ui.ongActuEdit && !l.some(a => a.id === S.ui.ongActuEdit)) S.ui.ongActuEdit = null;
        form.classList.add("ong-actu-nouv");
        const bt = form.querySelector("button.btn.bleu"); if (bt) bt.closest("div").classList.add("ong-actu-btns");
        const html = `<div class="ong-actus">
          ${ONG.pli("actu-nouvelle", "Nouvelle actualité", `<span data-ong-place="form"></span>`, !l.length, "+")}
          ${l.length ? `${ONG.titre("Publiées sur le site", l.length)}
            <p class="quoi ong-actu-astuce">Les ${NB_ACCUEIL} plus récentes défilent en haut de la page d'accueil du site.</p>
            <div class="cartes ong-actu-liste">${l.map(carteActu).join("")}</div>`
          : ONG.vide("Aucune actualité publiée", "Écris la première avec le formulaire ci-dessus : elle s'affichera en haut de la page d'accueil du site.")}
        </div>`;
        const t = document.createElement("template"); t.innerHTML = html;
        const place = t.content.querySelector('[data-ong-place="form"]'); place.replaceWith(form);
        while (racine.firstChild) racine.firstChild.remove();
        racine.appendChild(t.content);
      });
    };

    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest("[data-ong-actu]"); if (!b) return;
      const carte = b.closest("[data-ac]"), id = carte && carte.dataset.ac;
      if (b.dataset.ongActu === "modifier" && id){
        const a = (S.actus || []).find(x => x.id === id); if (!a) return;
        S.ui.ongActuEdit = id; S.ui.ongActuBrouillon = null; S.ui.ongActuPhoto = a.photo || null;
        rendrePanneau();
        const f = document.querySelector(`#panneau [data-ac="${CSS.escape(id)}"] input[name="titre"]`);
        if (f){ f.focus(); f.closest("article").scrollIntoView({ block: "nearest", behavior: "smooth" }); }
      }
      if (b.dataset.ongActu === "annuler"){ S.ui.ongActuEdit = null; S.ui.ongActuBrouillon = null; S.ui.ongActuPhoto = null; rendrePanneau(); }
    });
    /* « Supprimer » : sur le site hébergé, l'onglet ne se redessine pas tout seul (majAdmin ne le fait que pour l'éditeur) ;
       dès que l'actualité a quitté la base, on retire sa fiche de l'écran */
    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest('[data-a="del-actu"]'); if (!b) return;
      const c = b.closest("[data-ac]"), id = c && c.dataset.ac; if (!id) return;
      let n = 0;
      const t = setInterval(() => {
        if (!(S.actus || []).some(a => a.id === id)){
          clearInterval(t);
          if (S.ui.onglet === "actus" && document.querySelector(`#panneau [data-ac="${CSS.escape(id)}"]`)) rendrePanneau();
        } else if (++n > 50) clearInterval(t);                 // annulé, ou pas de réponse : on n'insiste pas
      }, 100);
    });
    // le texte en cours de correction survit aux rafraîchissements de l'onglet (nouvelle photo, mise à jour du site…)
    const retenir = ev => {
      const f = ev.target.closest && ev.target.closest("form[data-ong-actu-form]"); if (!f) return;
      const c = f.closest("[data-ac]"); if (!c) return;
      S.ui.ongActuBrouillon = { id: c.dataset.ac, titre: f.titre.value, date: f.date.value, texte: f.texte.value };
    };
    document.addEventListener("input", retenir);
    document.addEventListener("change", retenir);
    document.addEventListener("submit", async ev => {
      const f = ev.target.closest && ev.target.closest("form[data-ong-actu-form]"); if (!f) return;
      ev.preventDefault();
      const c = f.closest("[data-ac]"), id = c && c.dataset.ac; if (!id) return;
      const d = Object.fromEntries(new FormData(f));
      const maj = { titre: String(d.titre || "").trim(), texte: String(d.texte || "").trim(), date: d.date || "" };
      if (!maj.titre){ toast("Écris un titre.", true); f.titre.focus(); return; }
      if (!maj.date){ toast("Choisis une date.", true); return; }
      if (!maj.texte){ toast("Écris le texte de l'actualité.", true); f.texte.focus(); return; }
      if (S.assets) maj.photo = S.ui.ongActuPhoto || null;
      const bt = f.querySelector("button.btn.bleu"); if (bt) bt.disabled = true;
      const ok = await ecrire(() => S.db.doc("actus/" + id).update(maj), "Actualité modifiée.");
      if (bt) bt.disabled = false;
      if (ok){
        // affichage tout de suite, sans attendre la prochaine mise à jour
        const a = (S.actus || []).find(x => x.id === id); if (a) Object.assign(a, maj);
        S.ui.ongActuEdit = null; S.ui.ongActuBrouillon = null; S.ui.ongActuPhoto = null;
        if (S.ui.onglet === "actus") rendrePanneau();
      }
    });
  }

  /* =====================================================================
     MESSAGES
     ===================================================================== */
  const ETATS = [["", "Tous"], ["n", "Nouveaux"], ["r", "À répondre"], ["c", "En cours"], ["f", "Fermés"]];
  const triMsgs = l => [...l].sort((a, b) => String(b.maj || b.recu || "").localeCompare(String(a.maj || a.recu || "")));
  /* date courte et claire pour la liste : « aujourd'hui 15:33 », « hier 11:33 », « sam. 3 oct. », « 24 sept. 2025 » */
  function dateListe(v){
    const d = new Date(v); if (isNaN(d)) return "";
    const h = d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const auj = new Date(), j0 = new Date(auj.getFullYear(), auj.getMonth(), auj.getDate()), j1 = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const n = Math.round((j0 - j1) / 864e5);
    if (n === 0) return "aujourd'hui " + h;
    if (n === 1) return "hier " + h;
    if (n > 1 && n < 7) return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
    return d.toLocaleDateString("fr-FR", d.getFullYear() === auj.getFullYear() ? { day: "numeric", month: "short" } : { day: "numeric", month: "short", year: "numeric" });
  }
  const dest = x => x.pourRole ? `${x.pourRole}${x.pourNom && !/compl[ée]ter/i.test(x.pourNom) ? " · " + x.pourNom : ""}` : (x.pourNom || "");

  function ligneMsg(x, selId){
    const [etq, k] = etatConv(x), f = filDe(x), der = f[f.length - 1] || {};
    const txt = String(der.texte || "");
    const qui = der.de === "club" ? `<b>${e(prenom(der.auteur || "Le club"))} :</b> ` : "";
    const pour = dest(x);
    return `<button type="button" class="cv-it ong-msg-it ${x.id === selId ? "on" : ""} ${x.lu ? "" : "ong-nonlu"}" data-a="msg-ouvrir" data-id="${e(x.id)}">
      <span class="ong-msg-l1"><span class="ong-msg-point" aria-hidden="true"></span><b class="ong-msg-de">${e(x.nom || "Anonyme")}</b><time class="ong-msg-date">${e(dateListe(x.maj || x.recu))}</time></span>
      <span class="ong-msg-l2"><span class="ong-msg-objet">${e(x.objet || "Sans sujet")}</span><span class="cv-pas ${k}">${e(etq)}</span></span>
      <span class="ong-msg-l3">${qui}${e(txt.slice(0, 140))}</span>
      ${pour ? `<span class="ong-msg-l4">Pour : ${e(pour)}</span>` : ""}</button>`;
  }

  const AIDE_MSG = bureau => `<ol>
      <li>Les messages écrits depuis la page <b>Contact</b> du site arrivent ici. Les nouveaux ont un <b>rond rouge</b>.</li>
      <li>Touche un message pour lire la conversation. Écris ta réponse en bas, puis touche <b>« Envoyer la réponse »</b> : la personne la reçoit par e-mail et peut te répondre.</li>
      <li>Quand c'est réglé, touche <b>« Clôturer »</b> : la personne ne peut plus répondre. Tu peux rouvrir la conversation quand tu veux.</li>
    </ol>
    ${bureau ? `<div class="ong-msg-test"><span>Les réponses n'arrivent pas chez les gens ?</span><button class="btn contour petit" data-a="mail-test">📧 Tester l'envoi d'e-mail</button></div>` : ""}`;

  function barreMsg(tous, etat, bureau){
    if (!(S.messages || []).length) return "";                         // aucun message du tout : rien à filtrer
    const nb = k => k ? tous.filter(x => etatConv(x)[1] === k).length : tous.length;
    const chips = ETATS.filter(([k]) => !k || k === etat || nb(k)).map(([k, l]) =>
      `<button type="button" class="ong-msg-etat ${k === etat ? "on" : ""} ${k ? "e-" + k : ""}" data-ong-msg-etat="${k}" aria-pressed="${k === etat}">${l}<span>${nb(k)}</span></button>`).join("");
    const moi = S.ui.msgFiltre === "moi";
    const nbMoi = (S.messages || []).filter(x => pourMoi(x) || !x.pourNom).length;
    const portee = bureau ? `<div class="ong-msg-portee" role="group" aria-label="Quels messages voir">
        <button type="button" class="${moi ? "" : "on"}" data-a="msg-filtre" data-k="tous" aria-pressed="${!moi}">Tout le club<span>${(S.messages || []).length}</span></button>
        <button type="button" class="${moi ? "on" : ""}" data-a="msg-filtre" data-k="moi" aria-pressed="${moi}">Pour moi et le secrétariat<span>${nbMoi}</span></button></div>` : "";
    return `<div class="ong-msg-barre">${portee}${tous.length ? `<div class="ong-msg-etats" role="group" aria-label="Filtrer par état">${chips}</div>` : ""}</div>`;
  }

  if (typeof window.panMessages === "function" && typeof etatConv === "function"){
    const avantMsg = window.panMessages;
    window.panMessages = function(){
      const etat = ETATS.some(([k]) => k === S.ui.ongMsgEtat) ? (S.ui.ongMsgEtat || "") : "";
      const tous = triMsgs(mesMessages());
      const vus = etat ? tous.filter(x => etatConv(x)[1] === etat) : tous;
      // conversation montrée après un changement de filtre (le message choisi n'était plus dans la liste filtrée)
      const voir = S.ui.ongMsgVoir && tous.some(x => x.id === S.ui.ongMsgVoir) ? S.ui.ongMsgVoir : null;
      const garde = S.ui.msgSel;
      if (voir) S.ui.msgSel = voir;
      let h;
      try { h = avantMsg.apply(this, arguments); } finally { if (voir) S.ui.msgSel = garde; }
      return ONG.transformer(h, racine => {
        const bureau = estBureau(), conv = S.ui.msgVue === "conv";
        const cv = racine.querySelector(".cv");
        const aide = ONG.aide("msg-aide", "Comment ça marche ?", AIDE_MSG(bureau));
        let html;
        if (!cv){
          const autres = bureau && S.ui.msgFiltre === "moi" && (S.messages || []).length;
          html = `<div class="ong-msg">${aide}${barreMsg(tous, etat, bureau)}
            ${autres ? ONG.vide("Rien pour toi ni pour le secrétariat", "Les autres messages du club sont adressés à d'autres personnes.", `<button type="button" class="btn contour" data-a="msg-filtre" data-k="tous">Voir tout le club</button>`)
              : ONG.vide("Aucun message pour l'instant", "Les messages envoyés depuis la page Contact du site arrivent ici. Tu y réponds, et la personne reçoit ta réponse par e-mail.")}</div>`;
          while (racine.firstChild) racine.firstChild.remove();
          const t = document.createElement("template"); t.innerHTML = html; racine.appendChild(t.content);
          return;
        }
        const envoyer = racine.querySelector('.cv-conv [data-a="msg-envoyer"]');
        const selId = envoyer && envoyer.dataset.id, sel = tous.find(x => x.id === selId);
        const fil = racine.querySelector("#cv-fil"), rep = racine.querySelector(".cv-rep");
        if (!sel || !fil || !rep) throw new Error("conversation introuvable");
        const ferme = sel.statut === "fermee";
        const ini = String(sel.nom || "?").split(" ").map(w => w[0] || "").join("").slice(0, 2).toUpperCase();
        const contacts = [
          sel.email ? `<a class="ong-msg-lien" href="mailto:${e(sel.email)}" title="${e(sel.email)}"><span aria-hidden="true">✉️</span><span class="ong-msg-long">${e(sel.email)}</span><span class="ong-msg-court">E-mail</span></a>` : "",
          sel.tel ? `<a class="ong-msg-lien" href="tel:${e(String(sel.tel).replace(/\s/g, ""))}"><span aria-hidden="true">📞</span>${e(sel.tel)}</a>` : "",
        ].join("");
        const tete = `<div class="cv-tete ong-msg-tete">
            <button type="button" class="cv-retour" data-a="msg-retour" aria-label="Retour aux messages">‹<span class="ong-msg-retour-t">Tous les messages</span></button>
            <span class="cv-ini" aria-hidden="true">${e(ini)}</span>
            <div class="cv-qui"><b>${e(sel.nom || "Anonyme")}</b>
              <small class="ong-msg-sujet">Sujet : <b>${e(sel.objet || "Sans sujet")}</b></small>
              <small>${[sel.recu && dateCourte(sel.recu) ? "Reçu " + e(dateCourte(sel.recu)) : "", dest(sel) ? "pour " + e(dest(sel)) : ""].filter(Boolean).join(" · ")}</small></div>
            <div class="cv-actions">
              <span class="cv-pas ${ferme ? "f" : "c"}">${ferme ? "Conversation fermée" : "Conversation ouverte"}</span>
              ${ferme ? `<button type="button" class="btn contour petit" data-a="msg-rouvrir" data-id="${e(sel.id)}">↺ Rouvrir</button>`
                : `<button type="button" class="btn contour petit" data-a="msg-cloturer" data-id="${e(sel.id)}">🔒 Clôturer</button>`}
              <button type="button" class="btn danger petit ong-msg-suppr" data-a="msg-suppr2" data-id="${e(sel.id)}" title="Supprimer la conversation"><span aria-hidden="true">🗑</span> Supprimer</button></div>
            ${contacts ? `<div class="ong-msg-contacts">${contacts}</div>` : ""}</div>`;
        // zone de réponse : un titre clair au-dessus du champ
        const tx = rep.querySelector("#cv-texte");
        if (tx){
          const t = document.createElement("label");
          t.className = "ong-msg-rep-t"; t.htmlFor = "cv-texte";
          t.innerHTML = `<span aria-hidden="true">✍️</span>Ta réponse à ${e(sel.nom || "la personne")}`;
          rep.insertBefore(t, rep.firstChild);
          tx.setAttribute("rows", "4");
        }
        rep.classList.add("ong-msg-rep");
        const liste = vus.length ? vus.map(x => ligneMsg(x, selId)).join("")
          : `<div class="ong-msg-rien"><b>Aucun message « ${e((ETATS.find(([k]) => k === etat) || [])[1] || "")} »</b><button type="button" class="btn contour petit" data-ong-msg-etat="">Voir tous les messages</button></div>`;
        html = `<div class="ong-msg ${conv ? "ong-msg-conv" : ""}">${aide}${barreMsg(tous, etat, bureau)}
          <div class="cv ${conv ? "voir-conv" : ""} ${vus.length ? "" : "ong-msg-sans"}"><div class="cv-liste ong-msg-liste">${liste}</div>
            <div class="cv-conv">${tete}<span data-ong-place="fil"></span><span data-ong-place="rep"></span></div></div></div>`;
        const t = document.createElement("template"); t.innerHTML = html;
        t.content.querySelector('[data-ong-place="fil"]').replaceWith(fil);
        t.content.querySelector('[data-ong-place="rep"]').replaceWith(rep);
        while (racine.firstChild) racine.firstChild.remove();
        racine.appendChild(t.content);
      });
    };

    // un message choisi à la main : c'est lui qu'on montre (phase de capture : avant que l'application ne redessine)
    document.addEventListener("click", ev => {
      if (ev.target.closest && ev.target.closest('[data-a="msg-ouvrir"]')) S.ui.ongMsgVoir = null;
    }, true);
    document.addEventListener("click", ev => {
      if (!ev.target.closest) return;
      const b = ev.target.closest("[data-ong-msg-etat]"); if (!b) return;
      const k = b.dataset.ongMsgEtat || "";
      S.ui.ongMsgEtat = k;
      // si la conversation affichée n'est pas dans le filtre, on montre la première du filtre (sans la marquer lue)
      const tous = triMsgs(mesMessages()), vus = k ? tous.filter(x => etatConv(x)[1] === k) : tous;
      const aff = document.querySelector('#panneau .cv-conv [data-a="msg-envoyer"]');
      if (vus.length && !(aff && vus.some(x => x.id === aff.dataset.id))) S.ui.ongMsgVoir = (vus.find(x => !x.lu) || vus[0]).id;
      rendrePanneau();
    });
    // téléphone : en ouvrant ou en quittant une conversation, on remonte en haut de l'onglet
    document.addEventListener("click", ev => {
      if (!ev.target.closest || !ev.target.closest('[data-a="msg-ouvrir"],[data-a="msg-retour"]') || window.innerWidth > 860) return;
      setTimeout(() => {
        const p = document.querySelector("#panneau .ong-msg"); if (!p) return;
        let haut = 70;
        const r = document.querySelector("body.sur-espace .rub-onglets");
        if (r && getComputedStyle(r).position === "sticky") haut = (parseFloat(getComputedStyle(r).top) || 0) + r.offsetHeight + 10;
        const y = p.getBoundingClientRect().top + window.scrollY - haut;
        if (window.scrollY > y) window.scrollTo(0, Math.max(0, y));
      }, 60);
    });
  }

  /* =====================================================================
     STYLE (sombre par défaut, lisible aussi en thème clair)
     ===================================================================== */
  const A = "body.sur-espace #panneau .ong-actus", M = "body.sur-espace #panneau .ong-msg", L = ':root[data-theme="light"]';
  const css = document.createElement("style");
  css.id = "onglets-com-css";
  css.textContent = `
/* ---------- Actualités ---------- */
${A} .ong-pli{margin-bottom:16px}
${A} .ong-pli>summary{font-size:17.5px;min-height:62px}
${A} .ong-pli>summary .plus{position:static;display:grid!important;flex:none;width:34px;height:34px;padding:0;border:0;border-radius:11px;background:linear-gradient(180deg,#2F6BFF,#1C4FD6);color:#fff;box-shadow:0 6px 14px rgba(47,107,255,.35)}
${A} .ong-actu-nouv .grille{grid-template-columns:minmax(0,2fr) minmax(220px,1fr)}
${A} .ong-actu-nouv textarea,${A} .ong-actu-form textarea{min-height:130px;line-height:1.5}
${A} .ong-actu-btns{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:16px}
${A} .ong-actu-btns .btn.bleu{min-width:220px}
${A} .ong-titre{margin-top:22px;margin-bottom:4px}
${A} .ong-actu-astuce{margin:0 0 12px;font-size:14px}
${A} .ong-actu-liste{gap:10px}
${A} .ong-actu-carte{align-items:center;gap:16px;padding:14px 16px}
${A} .ong-actu-carte:hover{transform:none}
${A} .ong-actu-photo{width:62px;height:62px;flex:none;border-radius:12px;object-fit:cover;background:rgba(255,255,255,.06);border:1px solid rgba(143,168,240,.2)}
${A} .ong-actu-carte .item-txt h3{font-size:21px;margin:0 0 4px}
${A} .ong-actu-carte .item-txt p{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.45;color:#C5D0EE}
${A} .ong-actu-meta{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
${A} .ong-actu-meta small{color:#8FA3D6;font-size:13px}
${A} .ong-actu-avec{display:none}
${A} .ong-actu-meta .etiq{padding:3px 10px;font-size:12px}
${A} .ong-actu-meta .etiq:not(.ok){background:rgba(143,168,240,.12);color:#9FB2E8}
${A} .ong-actu-meta .etiq.ok{color:#86EFAC;background:rgba(34,197,94,.16)}
${A} .ong-actu-act{display:flex;align-items:center;gap:10px;flex:none;margin-left:8px}
${A} .ong-actu-suppr{margin-left:14px}
${A} .ong-actu-edition{display:block;border-color:rgba(91,140,255,.6);box-shadow:0 0 0 3px rgba(91,140,255,.18)}
${A} .ong-actu-form-t{display:flex;align-items:center;gap:8px;font:800 19px var(--display);margin:2px 0 14px}
${A} .ong-actu-form .grille{display:grid;grid-template-columns:minmax(0,2fr) minmax(220px,1fr);gap:14px 16px}
${A} .ong-actu-form label.pleine,${A} .ong-actu-form .pleine{display:block;margin-top:14px}
${A} .ong-actu-note{margin:10px 0 0;font-size:14px}
${L} ${A} .ong-actu-carte .item-txt p{color:var(--texte-doux)}
${L} ${A} .ong-actu-meta small{color:var(--texte-doux)}
${L} ${A} .ong-actu-meta .etiq.ok{color:#15803D}
${L} ${A} .ong-actu-meta .etiq:not(.ok){color:#475569;background:rgba(71,85,105,.12)}
${L} ${A} .ong-nb{background:rgba(28,79,214,.12);color:#1C4FD6}
${L} ${A} .btn.danger{color:#B91C1C;border-color:rgba(220,38,38,.55);background:rgba(220,38,38,.06)}
${L} ${A} .ong-actu-edition{background:#fff}
/* thème clair : la règle sombre commune des champs l'emporte sinon (champ titre gris) */
${L} ${A} input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]){background:#fff;border-color:#C9D4F2;color:var(--texte)}
@media (max-width:700px){
  ${A} .ong-actu-nouv .grille,${A} .ong-actu-form .grille{grid-template-columns:minmax(0,1fr)}
  ${A} .ong-actu-btns .btn{flex:1 1 100%}
  ${A} .ong-actu-carte{flex-wrap:wrap;gap:12px;padding:14px}
  ${A} .ong-actu-carte .item-txt{flex:1 1 0;order:0;min-width:0}
  ${A} .ong-actu-carte .item-txt h3{font-size:19px}
  ${A} .ong-actu-photo{display:none}
  ${A} .ong-actu-avec{display:inline}
  ${A} .ong-actu-act{flex:1 1 100%;margin:0;padding-top:12px;border-top:1px solid rgba(143,168,240,.14)}
  ${A} .ong-actu-act .btn{order:0;margin:0;min-height:44px}
  ${A} .ong-actu-modif{min-width:150px}
  ${A} .ong-actu-suppr{margin-left:auto!important}
}
/* ---------- Messages ---------- */
${M} .ong-aide{margin-bottom:14px}
${M} .ong-msg-test{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:12px;padding-top:12px;border-top:1px solid rgba(227,182,76,.2)}
${M} .ong-msg-test span{color:#AFC0EA;font-size:14px}
${M} .ong-msg-barre{display:flex;align-items:center;justify-content:space-between;gap:12px 18px;flex-wrap:wrap;margin:0 0 14px}
${M} .ong-msg-etats{display:flex;gap:8px;flex-wrap:wrap}
${M} .ong-msg-etat{display:inline-flex;align-items:center;gap:8px;min-height:42px;padding:6px 14px;border-radius:999px;border:1px solid rgba(143,168,240,.3);background:rgba(5,11,31,.35);color:#DCE5FF;font:700 14.5px var(--corps);cursor:pointer}
${M} .ong-msg-etat:hover{border-color:rgba(143,168,240,.7)}
${M} .ong-msg-etat span{min-width:22px;height:22px;padding:0 7px;border-radius:999px;display:inline-grid;place-items:center;font:800 12px var(--corps);background:rgba(143,168,240,.18)}
${M} .ong-msg-etat.e-n span{background:#E11D2E;color:#fff}
${M} .ong-msg-etat.e-r span{background:#E3B64C;color:#0B1633}
${M} .ong-msg-etat.on{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);border-color:#7FA6FF;color:#fff;box-shadow:0 6px 16px rgba(47,107,255,.3)}
${M} .ong-msg-etat.on:not(.e-n):not(.e-r) span{background:rgba(255,255,255,.22);color:#fff}
${M} .ong-msg-portee{display:inline-flex;padding:4px;gap:4px;border-radius:14px;background:rgba(5,11,31,.45);border:1px solid rgba(143,168,240,.22);order:2}
${M} .ong-msg-portee button{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:6px 14px;border:0;border-radius:10px;background:none;color:#AFC0EA;font:700 14px var(--corps);cursor:pointer}
${M} .ong-msg-portee button span{font:800 12px var(--corps);opacity:.8}
${M} .ong-msg-portee button.on{background:rgba(143,168,240,.2);color:#fff}
${M} .cv{grid-template-columns:minmax(300px,380px) minmax(0,1fr);align-items:stretch}
${M} .cv.ong-msg-sans{grid-template-columns:minmax(0,1fr)}
${M} .cv.ong-msg-sans .cv-conv{display:none}
${M} .cv-liste{gap:6px;padding:8px;max-height:calc(100vh - 150px);align-content:start}
${M} .ong-msg-it{display:grid;gap:4px;padding:12px 14px;border-radius:14px;min-height:44px;border:1px solid transparent}
${M} .ong-msg-it+.ong-msg-it{box-shadow:0 -7px 0 -6px rgba(143,168,240,.14)}
${M} .ong-msg-l1,${M} .ong-msg-l2{display:flex;align-items:center;gap:8px;min-width:0}
${M} .ong-msg-point{width:9px;height:9px;border-radius:50%;flex:none;background:transparent}
${M} .ong-nonlu .ong-msg-point{background:#F43F5E;box-shadow:0 0 0 3px rgba(244,63,94,.22)}
${M} .ong-msg-de{flex:1;min-width:0;font-size:16.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${M} .ong-nonlu .ong-msg-de{font-weight:900;color:#fff}
${M} .ong-msg-date{flex:none;font-size:12.5px;color:#9FB2E8;white-space:nowrap}
${M} .ong-nonlu .ong-msg-date{color:#FDA4AF;font-weight:700}
${M} .ong-msg-objet{flex:1;min-width:0;font-weight:700;font-size:14.5px;color:#E6ECFF;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-left:17px}
${M} .ong-msg-l3{display:block;padding-left:17px;color:#AFC0EA;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${M} .ong-msg-l3 b{color:#C9D4F2;font-weight:700}
${M} .ong-msg-l4{display:block;padding-left:17px;color:#8193C4;font-size:12.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${M} .cv-it.on .ong-msg-date,${M} .cv-it.on .ong-msg-l3,${M} .cv-it.on .ong-msg-l3 b,${M} .cv-it.on .ong-msg-l4{color:#DCE5FF}
${M} .ong-msg-rien{display:grid;justify-items:center;gap:10px;text-align:center;padding:26px 14px;color:#AFC0EA}
${M} .ong-msg-rien b{color:#fff;font:800 18px var(--display)}
${M} .cv-conv{min-height:560px;max-height:calc(100vh - 150px)}
${M} .ong-msg-tete{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:"ini qui act" "ini ct act";align-items:start;gap:8px 14px;padding:16px 18px}
${M} .ong-msg-tete .cv-retour{grid-area:ret;align-self:center}
${M} .ong-msg-tete .cv-ini{grid-area:ini}
${M} .ong-msg-tete .cv-qui{grid-area:qui}
${M} .ong-msg-tete .cv-actions{grid-area:act}
${M} .ong-msg-contacts{grid-area:ct}
${M} .ong-msg-tete .cv-qui{gap:2px}
${M} .ong-msg-tete .cv-qui>b{font:800 22px var(--display);line-height:1.15}
${M} .ong-msg-tete .cv-qui small{font-size:14px}
${M} .ong-msg-sujet b{color:#F3DFA2}
${M} .ong-msg-tete .cv-actions{justify-content:flex-end;gap:8px}
${M} .ong-msg-tete .cv-actions .cv-pas{font-size:12px;padding:5px 10px}
${M} .ong-msg-suppr{margin-left:10px}
${M} .ong-msg-contacts{display:flex;flex-wrap:wrap;gap:8px}
${M} .ong-msg-lien{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:5px 12px;border-radius:10px;background:rgba(143,168,240,.1);border:1px solid rgba(143,168,240,.22);color:#DCE5FF;text-decoration:none;font-weight:700;font-size:14px;overflow-wrap:anywhere}
${M} .ong-msg-lien:hover{background:rgba(143,168,240,.2)}
${M} .ong-msg-court,${M} .ong-msg-retour-t{display:none}
${M} .cv-fil{padding:18px}
${M} .ong-msg-rep{gap:10px;padding:14px 18px 16px;background:rgba(47,107,255,.07);border-top:1px solid rgba(91,140,255,.35);border-radius:0 0 18px 18px}
${M} .ong-msg-rep-t{display:flex;align-items:center;gap:8px;font:800 16px var(--corps);color:#fff;margin:0;text-transform:none;letter-spacing:0}
${M} .ong-msg-rep textarea{min-height:96px;font-size:16px}
${M} .ong-msg-rep .cv-l{align-items:center}
${M} .ong-msg-rep .cv-l small{font-size:13.5px}
${M} .ong-msg-rep .btn.bleu{min-width:220px;min-height:50px;font-size:16px}
${L} ${M} .ong-msg-etat{background:#fff;border-color:#C9D4F2;color:var(--texte)}
${L} ${M} .ong-msg-etat.on{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);color:#fff}
${L} ${M} .ong-msg-portee{background:var(--carte);border-color:#C9D4F2}
${L} ${M} .ong-msg-portee button{color:var(--texte-doux)}
${L} ${M} .ong-msg-portee button.on{background:rgba(28,79,214,.12);color:#1C4FD6}
${L} ${M} .ong-nonlu .ong-msg-de,${L} ${M} .ong-msg-rien b,${L} ${M} .ong-msg-rep-t{color:var(--texte)}
${L} ${M} .ong-msg-objet{color:var(--texte)}
${L} ${M} .ong-msg-l3,${L} ${M} .ong-msg-l3 b,${L} ${M} .ong-msg-date,${L} ${M} .ong-msg-l4,${L} ${M} .ong-msg-test span{color:var(--texte-doux)}
${L} ${M} .ong-nonlu .ong-msg-date{color:#BE123C}
${L} ${M} .cv-it.on .ong-msg-objet,${L} ${M} .cv-it.on .ong-msg-de{color:#fff}
${L} ${M} .cv-it.on .ong-msg-date,${L} ${M} .cv-it.on .ong-msg-l3,${L} ${M} .cv-it.on .ong-msg-l3 b,${L} ${M} .cv-it.on .ong-msg-l4{color:#DCE5FF}
${L} ${M} .ong-msg-sujet b{color:#8A6100}
${L} ${M} .ong-msg-lien{background:rgba(28,79,214,.06);border-color:#C9D4F2;color:#1C4FD6}
${L} ${M} .ong-msg-rep{background:rgba(28,79,214,.05)}
${L} ${M} .cv-b.lui .cv-t{background:#E8EEFC;color:var(--texte)}
${L} ${M} .btn.danger{color:#B91C1C;border-color:rgba(220,38,38,.55);background:rgba(220,38,38,.06)}
${L} ${M} .cv-pas.c{color:#15803D;background:rgba(34,197,94,.16)}
${L} ${M} .cv-pas.f{color:#475569;background:rgba(71,85,105,.12)}
${L} ${M} .cv-it.on .cv-pas.c{color:#86EFAC;background:rgba(34,197,94,.22)}
${L} ${M} .cv-it.on .cv-pas.f{color:#DCE5FF;background:rgba(255,255,255,.16)}
@media (max-width:1140px){
  ${M} .ong-msg-tete{grid-template-columns:auto minmax(0,1fr);grid-template-areas:"ini qui" "ini ct" "act act"}
  ${M} .ong-msg-tete .cv-actions{justify-content:flex-start}
}
@media (max-width:860px){
  ${M}.ong-msg-conv>.ong-aide,${M}.ong-msg-conv>.ong-msg-barre{display:none}
  ${M} .cv-liste{max-height:none;padding:6px}
  ${M} .cv{align-items:start}
  ${M} .cv-conv{min-height:0;max-height:none}
  ${M} .ong-msg-barre{flex-direction:column;align-items:stretch}
  ${M} .ong-msg-portee{order:0;display:grid;grid-template-columns:1fr 1fr}
  ${M} .ong-msg-portee button{justify-content:center;min-height:44px;padding:6px 8px;font-size:13.5px;text-align:center}
  ${M} .ong-msg-etat{min-height:44px}
  ${M} .ong-msg-tete{grid-template-columns:auto minmax(0,1fr);grid-template-areas:"ret ret" "ini qui" "ct ct" "act act";padding:10px 14px 14px;gap:10px 12px}
  ${M} .ong-msg-tete .cv-retour{display:inline-flex;align-items:center;gap:8px;justify-self:start;width:auto;height:44px;padding:0 14px 0 10px;font:800 26px/1 var(--corps)}
  ${M} .ong-msg-retour-t{display:inline;font:700 15px var(--corps)}
  ${M} .ong-msg-long{display:none}
  ${M} .ong-msg-court{display:inline}
  ${M} .ong-msg-tete .cv-ini{width:40px;height:40px;font-size:15px;align-self:center}
  ${M} .ong-msg-tete .cv-qui>b{font-size:20px}
  ${M} .ong-msg-tete .cv-actions .cv-pas{display:none}
  ${M} .ong-msg-tete .cv-actions .btn{flex:1;min-height:44px}
  ${M} .ong-msg-suppr{flex:0 0 auto!important;margin-left:auto}
  ${M} .ong-msg-lien{min-height:44px}
  ${M} .cv-fil{padding:14px}
  ${M} .cv-b{max-width:88%}
  ${M} .ong-msg-rep{padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px))}
  ${M} .ong-msg-rep .btn.bleu{width:100%}
  ${M} .ong-msg-rep textarea{min-height:76px}
  ${M} .ong-msg-rep .cv-l small{font-size:12.5px}
}`;
  document.head.appendChild(css);
})();
