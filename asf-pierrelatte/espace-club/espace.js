/* Espace dirigeants : simple à prendre en main, propre et beau.
   - En haut : le tableau tactique en 3D (bureau3d.js), avec le nom de la personne, son rôle, « Voir le site » et « Se déconnecter ».
   - Plus de menu à gauche : l'Accueil « Où veux-tu aller ? » montre toutes les rubriques et leurs onglets en grandes cartes.
   - Chaque page : un bandeau (rubrique, à quoi sert l'onglet, bouton « Accueil ») et les onglets de la rubrique.
   - Téléphone : une barre des rubriques en bas de l'écran.
   - L'intérieur des onglets : mêmes cadres, mêmes champs, mêmes boutons partout.
   Ajouté sans modifier le script de l'application (on se branche sur panTableau et rendreEspace). */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.rendreEspace !== "function" || typeof RUBRIQUES === "undefined") return;
  const icone = k => (typeof ICONES !== "undefined" && ICONES[k]) ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONES[k]}" stroke-linecap="round" stroke-linejoin="round"/></svg>` : "";
  const desc = k => ((typeof ONGLETS !== "undefined" ? ONGLETS : []).find(o => o[0] === k) || [])[4] || "";
  const badge = k => { try { return typeof badgeOnglet === "function" ? badgeOnglet(k) : ""; } catch(err){ return ""; } };
  const nom = k => { try { return typeof nomOnglet === "function" ? nomOnglet(k) : k; } catch(err){ return k; } };
  const rubsDuCompte = () => { try { return rubriquesVisibles(ongletsVisibles()); } catch(err){ return []; } };
  const TEINTE = { equipes: "#2F6BFF", matchs: "#16A34A", com: "#F59E0B", vie: "#E0457B", reglages: "#8B5CF6" };

  /* Accueil : les raccourcis vers tous les onglets du compte, rangés par rubrique */
  function raccourcis(){
    const rubs = rubsDuCompte().filter(r => r[0] !== "accueil");
    if (!rubs.length) return "";
    return `<section class="esp-lanceur" aria-labelledby="esp-lanceur-t">
      <h2 id="esp-lanceur-t">Où veux-tu aller ?</h2>
      <div class="esp-rubs">${rubs.map(([k, l, ico, tabs, d]) => `<div class="esp-rub" style="--teinte:${TEINTE[k] || "#2F6BFF"}">
        <div class="esp-rub-t"><span class="esp-rub-ico" aria-hidden="true">${ico}</span><span><b>${esc(l)}</b><small>${esc(d || "")}</small></span></div>
        <div class="esp-tuiles">${tabs.map(t => `<button type="button" class="esp-tuile" data-a="onglet" data-k="${esc(t)}">
          <span class="esp-tuile-ico">${icone(t)}</span><span class="esp-tuile-txt"><b>${esc(nom(t))}${badge(t)}</b><small>${esc(desc(t))}</small></span><span class="esp-fl" aria-hidden="true">›</span></button>`).join("")}</div>
      </div>`).join("")}</div>
    </section>`;
  }
  if (typeof window.panTableau === "function"){
    const avant = window.panTableau;
    window.panTableau = function(){ return raccourcis() + avant.apply(this, arguments); };
  }

  /* en haut de page : qui est connecté, voir le site, se déconnecter */
  function heroCompte(){
    const wrap = document.querySelector("#p-espace .titre-page .wrap"); if (!wrap) return;
    const p = wrap.querySelector("p");
    if (p && p.dataset.orig == null) p.dataset.orig = p.textContent;
    const moi = document.querySelector("#espace .app-moi");
    let carte = wrap.querySelector(".esp-moi");
    if (!moi){ if (carte) carte.remove(); if (p) p.textContent = p.dataset.orig; return; }
    const nomC = ((moi.querySelector(".app-moi-haut b") || {}).textContent || "").trim();
    const role = ((moi.querySelector(".app-moi-haut small") || {}).textContent || "").trim();
    const img = moi.querySelector(".app-moi-haut img");
    const ini = ((moi.querySelector(".app-ini") || {}).textContent || "").trim();
    const sortir = !!moi.querySelector('[data-a="deconnexion"]');
    // un dirigeant qui est aussi joueur (ou qui a accès à l'espace joueur) y passe en un appui
    let aJoueur = false; try { const rc = String(((typeof mesPerms === "function" && mesPerms()) || {}).roleChoisi || ""); aJoueur = (/joueur/.test(rc) || !!(S.compte && S.compte.joueurNom)) && !(S.compte && S.compte.aLicence === false); } catch(err){}   // espace joueur : licenciés seulement
    const prenom = /membre du club/i.test(nomC) ? "" : nomC.split(/\s+/)[0];
    if (p) p.textContent = `Bonjour${prenom ? " " + prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase() : ""} ! Que veux-tu faire aujourd'hui ?`;
    const html = `<span class="esp-moi-av">${img ? `<img src="${esc(img.getAttribute("src") || "")}" alt="">` : esc(ini || "?")}</span>
      <span class="esp-moi-txt"><b>${esc(nomC)}</b><small>${esc(role)}</small></span>
      <span class="esp-moi-bts">${aJoueur ? `<a class="esp-moi-bt joueur" href="#joueur"><span aria-hidden="true">⚽</span> Mon espace joueur</a>` : ""}<a class="esp-moi-bt" href="#accueil"><span aria-hidden="true">↗</span> Voir le site</a>${sortir ? `<button type="button" class="esp-moi-bt sortir" data-a="deconnexion"><span aria-hidden="true">⏻</span> Se déconnecter</button>` : ""}</span>`;
    if (!carte){ carte = document.createElement("div"); carte.className = "esp-moi"; wrap.appendChild(carte); }
    if (carte.dataset.html !== html){ carte.innerHTML = html; carte.dataset.html = html; }
  }

  /* plus de barre des rubriques en bas ni de menu ☰ : tout passe par « Où tu veux aller ? » et le bouton « ← Accueil » */
  function barreBas(){
    const b = document.getElementById("esp-barre"); if (b) b.remove();
    document.body.classList.remove("avec-barre");
    if (document.body.classList.contains("sur-espace") && document.body.classList.contains("drawer-ouvert") && typeof fermerMenuMobile === "function") fermerMenuMobile();
  }
  window.addEventListener("hashchange", () => setTimeout(() => { barreBas(); heroCompte(); }, 0));

  /* chaque page : le bandeau de la rubrique (à quoi sert l'onglet ouvert + « Accueil ») */
  function habiller(){
    const z = document.getElementById("espace"); if (!z) return;
    heroCompte(); barreBas();
    const app = z.querySelector(".app"); if (!app) return;
    app.classList.add("esp-app");
    app.classList.toggle("esp-sur-accueil", S.ui.onglet === "tableau");
    const main = z.querySelector(".app-main");
    if (main && !main.querySelector(".esp-version")) main.insertAdjacentHTML("beforeend", `<p class="esp-version">Espace club · version du ${esc(dateVersion())}</p>`);
    const tete = z.querySelector(".app-tete"); if (!tete) return;
    tete.classList.add("esp-bandeau");
    const rub = rubsDuCompte().find(r => r[3].includes(S.ui.onglet));
    if (rub) tete.style.setProperty("--teinte", TEINTE[rub[0]] || "#2F6BFF");
    const pd = tete.querySelector("p"), d = desc(S.ui.onglet);
    if (pd && d) pd.textContent = d;
    if (S.ui.onglet !== "tableau" && !tete.querySelector(".esp-accueil"))
      tete.insertAdjacentHTML("beforeend", `<button type="button" class="esp-accueil" data-a="onglet" data-k="tableau"><span aria-hidden="true">←</span> Accueil</button>`);
    const ongs = z.querySelector(".rub-onglets");
    const actif = ongs && ongs.querySelector('[aria-selected="true"]');
    if (actif) try { actif.scrollIntoView({ block: "nearest", inline: "center" }); } catch(err){}
    ajusterTitre();
  }
  /* la date de la version du site : build.py la pose dans la balise meta « asf-version-date » (AAAA-MM-JJ, le jour où cette
     version a été construite) ; sans elle, la date écrite jusqu'ici */
  function dateVersion(){
    const m = document.querySelector('meta[name="asf-version-date"]'), v = m ? m.getAttribute("content") || "" : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "4 octobre 2026";
    const d = new Date(v + "T12:00:00"); if (isNaN(d)) return "4 octobre 2026";
    const t = d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
    return d.getDate() === 1 ? t.replace(/^1 /, "1er ") : t;
  }
  /* téléphone : le nom de la rubrique reste sur une ligne ; un nom long (« Matchs et plateaux ») est juste un peu plus petit */
  function ajusterTitre(){
    const h = document.querySelector("#espace .app-tete.esp-bandeau h1"); if (!h) return;
    h.style.removeProperty("font-size"); h.classList.remove("esp-h1-ligne");
    if (!matchMedia("(max-width:700px)").matches) return;
    const txt = [...h.childNodes].find(x => x.nodeType === 3 && x.textContent.trim()); if (!txt) return;
    h.classList.add("esp-h1-ligne");                                     // sur une ligne : on mesure la place qu'il prend
    const cs = getComputedStyle(h), ico = h.querySelector(".rub-ico-grand");
    const dispo = h.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (ico ? ico.offsetWidth + (parseFloat(cs.columnGap) || 0) : 0) - 3;
    const r = document.createRange(); r.selectNodeContents(txt);
    const larg = r.getBoundingClientRect().width, taille = parseFloat(cs.fontSize);
    if (!larg || larg <= dispo) return;
    const t = Math.floor(taille * dispo / larg * 2) / 2;
    if (t >= 16) h.style.fontSize = t + "px";
    else h.classList.remove("esp-h1-ligne");                             // vraiment trop étroit : deux lignes plutôt qu'un titre minuscule
  }
  let minuteurTitre = 0;
  window.addEventListener("resize", () => { clearTimeout(minuteurTitre); minuteurTitre = setTimeout(ajusterTitre, 120); });
  try { if (document.fonts){ document.fonts.ready.then(ajusterTitre); document.fonts.addEventListener("loadingdone", ajusterTitre); } } catch(err){}   // mesuré avec la police du site
  const espaceAvant = window.rendreEspace;
  window.rendreEspace = function(){
    const r = espaceAvant.apply(this, arguments);
    try { habiller(); } catch(err){}
    return r;
  };
  // changer d'onglet : on repart du haut de la page (sous l'en-tête 3D)
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest('#espace [data-a="onglet"], #espace [data-a="rubrique"], #drawer-contenu [data-a="onglet"], #drawer-contenu [data-a="rubrique"]');
    if (b && b.dataset.k !== S.ui.onglet) setTimeout(() => {
      const z = document.getElementById("espace"); const y = z ? z.getBoundingClientRect().top + window.scrollY - 90 : 0;
      window.scrollTo({ top: b.dataset.k === "tableau" ? 0 : Math.max(0, Math.min(window.scrollY, y)), behavior: "auto" });
    }, 0);
  }, true);

  /* ================= L'ONGLET OUVERT SE MET À JOUR TOUT SEUL (site en ligne) =================
     Sur le site hébergé, l'application ne redessine jamais l'onglet ouvert quand ses données changent (majAdmin ne le fait
     que pour « l'éditeur ») : ce qu'on venait d'enregistrer (publier une compo, ajouter un joueur, un créneau, supprimer une
     actualité…) ou ce qu'un autre dirigeant, un joueur ou un parent enregistrait n'apparaissait qu'en changeant d'onglet.
     On redessine l'onglet ouvert comme l'application le fait pour l'éditeur, mais prudemment :
     - seulement si les données que montre cet onglet ont vraiment changé depuis son dernier affichage ;
     - un court instant après le changement : quand c'est l'application qui enregistre puis redessine elle-même (Vétérans,
       Foot animation, Stages…), son affichage passe d'abord et on n'en refait pas un second ;
     - jamais pendant une saisie : un champ de l'onglet a le curseur, un champ a été tapé (ou une image choisie) sans être
       enregistré, l'éditeur de compo est ouvert, ou une fenêtre (choix d'un club, d'une date…) est ouverte. On réessaie quand
       c'est fini (champ quitté, formulaire envoyé, fenêtre fermée) ; les blocs dépliés restent dépliés, la page ne saute pas.
     Onglets suivis et ce qu'ils montrent :
     - effectifs, entraînements, compos, actualités, tournois, réunions, bénévoles, Le club (quand son brouillon n'a pas été
       touché) ;
     - vétérans : les matchs « vet-… » ; foot animation : les rendez-vous « pl-… » (les fiches dépliées, ce qui y est tapé et
       l'organisation du plateau en cours sont gardés par l'application et plateaux.js dans S.ui : rien n'est perdu) ;
     - stages : les stages et leurs inscrits ;
     - demandes d'inscription : les demandes (relues dans la copie de la base, comme le fait chargerLicences, dès qu'une
       demande arrive ou change) et les catégories ouvertes ;
     - messages : à part (plus bas) : la liste se met à jour sur place, la conversation ouverte et la réponse en cours restent.
     Pas suivis : Accès et rôles (la liste des comptes vient du serveur, pas de la base ; l'application redessine déjà tout
     l'espace quand les droits ou les rôles changent), Sauvegardes (liste lue sur le serveur, une copie par semaine),
     Affiches (l'application la redessine déjà quand le serveur a refait les affiches, toutes les 10 minutes, et avec
     « Mettre à jour » ; la redessiner à chaque score relancerait le dessin de toutes les affiches), Événements (rien ne
     vient de la base : brouillons gardés dans ce navigateur et aperçu dessiné par le serveur). */
  const vet = () => (S.matchs || []).filter(m => String(m.id).startsWith("vet-"));
  const plateauxAn = () => (S.matchsAnimation || []).filter(m => String(m.id).startsWith("pl-"));
  const VIVANTS = {
    effectifs: () => [S.effectifs, C().equipes],
    entrainements: () => [S.entrainements, S.presences, S.effectifs, S.matchs],
    compos: () => S.ui.compo ? null : [S.compos, S.matchs, S.effectifs],
    actus: () => [S.actus],
    tournois: () => [S.tournois],
    reunions: () => [S.reunions],
    benevoles: () => [S.benevoles, S.engagements],
    club: () => (S.ui.clubSection || "infos") === "clubs" ? null : [S.club],
    veterans: () => [vet()],
    animation: () => [plateauxAn()],
    stages: () => [S.stages, S.inscritsStage],
    licences: () => [S.licences, S.recrutement],
  };
  const signature = () => { const f = VIVANTS[S.ui.onglet]; if (!f) return null; try { const d = f(); return d ? S.ui.onglet + "|" + JSON.stringify(d) : null; } catch(err){ return null; } };
  let signeAffiche = null, enAttente = false, minuteur = 0;
  const base = new WeakMap(), envoyes = new WeakMap();      // envoyes : formulaire → heure de l'envoi
  const CHAMPS = "input:not([type=file]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image]), select, textarea";
  const valeur = c => (c.type === "checkbox" || c.type === "radio") ? (c.checked ? "1" : "0") : c.tagName === "SELECT" ? String(c.selectedIndex) : c.value;
  const defaut = c => (c.type === "checkbox" || c.type === "radio") ? (c.defaultChecked ? "1" : "0")
    : c.tagName === "SELECT" ? String(Math.max(0, [...c.options].map(o => o.defaultSelected).lastIndexOf(true))) : c.defaultValue;
  // les champs de recherche (l'application les garde et les remet elle-même) ne comptent pas comme une saisie
  const filtre = c => c.type === "search" || [...c.attributes].some(x => /^data-[a-z-]*cherche/.test(x.name));
  // champs enregistrés tout de suite par l'application, ou gardés dans un brouillon qu'elle remet à chaque affichage
  // (data-anp-… : l'organisation d'un plateau, gardée par plateaux.js dans S.ui.anPl)
  const ENREGISTRES = '[data-ent],[data-nt],[data-nt-rep],[data-t-num],[data-t-ajout],[data-import-cat],[data-a="choix-eq"],[data-statut],[data-recrute],[data-perm],[data-eq-perm],[data-r],[data-cpt-eq],[data-club],[data-champ],[data-club-num],[data-imp-c],[data-vc],[data-anc],[data-an-lieu],[data-vet-lieu],[data-logo-adv],[data-cl],[data-e],[data-c],[data-anp-f],[data-anp-m]';
  const noterBase = () => { const p = document.getElementById("panneau"); if (p) p.querySelectorAll(CHAMPS).forEach(c => base.set(c, valeur(c))); };
  const envoyeRecent = f => !!f && Date.now() - (envoyes.get(f) || 0) < 5000;
  function saisieEnCours(p){
    for (const c of p.querySelectorAll(CHAMPS)){
      if (filtre(c) || envoyeRecent(c.form)) continue;                   // envoyé il y a moins de 5 s : il part à l'enregistrement
      if (valeur(c) !== (base.has(c) ? base.get(c) : defaut(c))) return true;
    }
    // une image choisie dans un formulaire (l'affiche d'un stage…) : elle partirait avec un nouvel affichage
    for (const c of p.querySelectorAll("form input[type=file][name]")) if (c.files && c.files.length && !envoyeRecent(c.form)) return true;
    return false;
  }
  function occupe(p){
    const a = document.activeElement;
    if (a && p.contains(a) && a.matches("input, select, textarea, [contenteditable]")) return true;
    if (document.body.classList.contains("modale-ouverte") || document.querySelector(".modale-fond, .dp-fond")) return true;
    return saisieEnCours(p);
  }
  // pour le bandeau « Nouvelle version » : prévenir avant de recharger si quelque chose est en cours d'écriture
  window.espaceSaisieEnCours = () => { try { const p = document.getElementById("panneau"); return !!(p && location.hash === "#espace" && (saisieEnCours(p) || !!S.ui.compo)); } catch(err){ return false; } };
  // les blocs dépliés de l'application (« Voir les réponses »…) restent dépliés après le nouvel affichage
  const cleBloc = d => { const s = d.querySelector(":scope > summary"); return (s ? s.textContent : "").replace(/\d+/g, "#").replace(/\s+/g, " ").trim(); };
  /* jamais pendant un appui : un champ quitté en appuyant sur un bouton est enregistré (change), et redessiner l'onglet
     avant que le bouton soit relâché le remplaçait entre l'appui et le relâchement : le clic était perdu (« + Ajouter un
     créneau », « Semaine suivante › »…). Le nouvel affichage attend la fin de l'appui (le clic est alors passé), 3 s au plus. */
  let appui = false, retenuAppui = false, secoursAppui = 0;
  const finAppui = () => {
    clearTimeout(secoursAppui);
    if (!appui) return;
    appui = false;
    if (retenuAppui){ retenuAppui = false; planifier(0); }
  };
  const debutAppui = () => { appui = true; clearTimeout(secoursAppui); secoursAppui = setTimeout(finAppui, 3000); };
  window.addEventListener("pointerdown", debutAppui, true);
  window.addEventListener("mousedown", debutAppui, true);
  window.addEventListener("touchstart", debutAppui, { capture: true, passive: true });
  // souris : le clic part avec le relâchement, dans la même tâche ; setTimeout(0) passe après lui
  ["mouseup", "click", "pointercancel", "dragend", "touchcancel"].forEach(t => window.addEventListener(t, () => setTimeout(finAppui, 0), true));
  // doigt : le clic arrive après « touchend », avec les événements de souris simulés ; s'il ne vient pas (glissé…), on n'attend pas plus de 0,6 s
  ["pointerup", "touchend"].forEach(t => window.addEventListener(t, ev => {
    if (ev.pointerType === "mouse") setTimeout(finAppui, 0);
    else { clearTimeout(secoursAppui); secoursAppui = setTimeout(finAppui, 600); }
  }, true));
  function rafraichir(){
    clearTimeout(minuteur); minuteur = 0;
    const p = document.getElementById("panneau");
    if (S.editeur || !p || !S.db){ enAttente = false; return; }            // l'éditeur : l'application s'en charge déjà
    const s = signature();
    if (!s || s === signeAffiche){ enAttente = false; return; }
    if (location.hash !== "#espace"){ enAttente = true; return; }          // on redessinera en revenant dans l'espace
    if (appui){ enAttente = true; retenuAppui = true; return; }            // après le relâchement (et le clic)
    if (occupe(p)){ enAttente = true; minuteur = setTimeout(rafraichir, 2000); return; }
    if (S.ui.onglet === "club"){
      // Le club : on ne remplace le brouillon que s'il était à jour (barre « Tout est enregistré ») ; sinon on garde les changements
      const barre = p.querySelector(".ong-reg-save");
      if (!barre || barre.classList.contains("ong-reg-modifie")){ enAttente = false; signeAffiche = s; return; }
      S.ui.club = null;
    }
    enAttente = false;
    const vus = {}, ouverts = [...p.querySelectorAll("details[open]:not([data-ong-pli])")].map(d => { const k = cleBloc(d); vus[k] = (vus[k] || 0) + 1; return k + "|" + vus[k]; });
    const y = window.scrollY;
    try { rendrePanneau(); } catch(err){ return; }
    if (ouverts.length){
      const vus2 = {};
      p.querySelectorAll("details:not([data-ong-pli])").forEach(d => { const k = cleBloc(d); vus2[k] = (vus2[k] || 0) + 1; if (ouverts.includes(k + "|" + vus2[k])) d.open = true; });
    }
    // la page reste où elle était (une fiche ajoutée plus haut ne fait pas descendre ce qu'on lisait)
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    requestAnimationFrame(() => { if (Math.abs(window.scrollY - y) > 1 && document.activeElement === document.body) window.scrollTo(0, y); });
  }
  const planifier = ms => { clearTimeout(minuteur); minuteur = setTimeout(rafraichir, ms); };
  /* Demandes d'inscription : l'application ne relit les demandes qu'en ouvrant l'onglet ou avec « Actualiser ». chargerLicences
     lit la copie de la base gardée par la page (pas d'appel au serveur en plus) : on écoute cette copie, et une demande
     arrivée (relecture du serveur toutes les 30 s) ou changée ailleurs fait relire la liste, puis l'onglet suit comme les autres. */
  let ecouteInscriptions = false;
  function ecouterInscriptions(){
    if (ecouteInscriptions || !S.heberge || S.editeur || !S.db || typeof window.chargerLicences !== "function") return;
    ecouteInscriptions = true;
    let premier = true;
    try {
      S.db.collection("inscriptions").onSnapshot(() => {
        if (premier){ premier = false; return; }                          // premier appel : tout de suite à l'abonnement
        if (S.ui.onglet !== "licences" || location.hash !== "#espace" || !document.getElementById("panneau")) return;
        Promise.resolve(chargerLicences()).then(() => planifier(60), () => {});
      }, () => {});
    } catch(err){}
  }
  if (typeof window.majAdmin === "function" && typeof window.rendrePanneau === "function"){
    const majAvant = window.majAdmin;
    // un court délai : si c'est l'application qui vient d'enregistrer, elle redessine d'abord (et on n'a plus rien à faire)
    window.majAdmin = function(){ const r = majAvant.apply(this, arguments); try { if (!S.editeur) planifier(60); ecouterInscriptions(); } catch(err){} return r; };
    // chaque affichage de l'onglet (par l'application ou par nous) : ce qu'il montre, et la valeur de départ de ses champs
    const rendreAvant = window.rendrePanneau;
    window.rendrePanneau = function(){
      const r = rendreAvant.apply(this, arguments);
      try { signeAffiche = signature(); enAttente = false; clearTimeout(minuteur); setTimeout(noterBase, 60); if (S.ui.onglet === "licences") ecouterInscriptions(); } catch(err){}
      return r;
    };
    if (window.ONG) ONG.suivi = true;                                    // les onglets n'ont plus à se redessiner eux-mêmes
    const reessayer = ms => { if (enAttente) planifier(ms); };
    document.addEventListener("focusout", () => reessayer(80));
    document.addEventListener("click", () => reessayer(350));
    window.addEventListener("hashchange", () => reessayer(120));
    // un formulaire envoyé : ce qui y est tapé part à l'enregistrement, ce n'est plus une saisie en cours pendant 5 s
    // (ou jusqu'à la prochaine frappe) ; s'il est refusé et garde son texte, il redevient une saisie en cours
    document.addEventListener("submit", ev => { const f = ev.target; if (f && f.closest && f.closest("#panneau")) envoyes.set(f, Date.now()); reessayer(400); }, true);
    document.addEventListener("input", ev => { const f = ev.target && ev.target.form; if (f) envoyes.delete(f); }, true);
    // un champ enregistré tout de suite (créneau, statut…) n'est plus une saisie en cours une fois validé
    document.addEventListener("change", ev => {
      const c = ev.target, p = document.getElementById("panneau");
      if (p && c && c.matches && p.contains(c) && c.matches(CHAMPS) && c.matches(ENREGISTRES)) base.set(c, valeur(c));
    });
  }

  /* ---------- Messages : la liste suit, la conversation ouverte et la réponse en cours ne bougent pas ----------
     À chaque changement des messages, l'application redessinait tout l'onglet (majConversationOuverte) : la conversation
     qu'on relisait repartait tout en bas ; et quand aucun message n'avait été choisi à la main, un nouveau message non lu
     prenait la place de la conversation affichée, la réponse en cours d'écriture passant dans cette autre conversation.
     Ici : les filtres et la liste se mettent à jour sur place ; la conversation affichée reste la même (ses nouveaux messages
     s'ajoutent au fil) et le champ de réponse n'est jamais remplacé (texte, curseur, clavier du téléphone gardés).
     Si la mise en page n'est pas celle attendue, on laisse faire l'application, comme avant. */
  const convSupprimees = new Set();
  function majMessagesSurPlace(){
    const p = document.getElementById("panneau");
    if (!p || S.ui.onglet !== "messages" || typeof window.panMessages !== "function" || typeof mesMessages !== "function") return false;
    const bt = p.querySelector('.cv-conv [data-a="msg-envoyer"]'), id = bt && bt.dataset.id;
    if (!id) return false;                                               // aucune conversation à l'écran : l'application redessine
    const tx = document.getElementById("cv-texte"), tape = !!(tx && tx.value.trim());
    const existe = mesMessages().some(x => x.id === id);
    if (!existe && !tape) return false;                                  // supprimée ailleurs, rien d'écrit : l'application redessine
    // le nouvel affichage, avec la même conversation choisie (puis on remet le choix tel qu'il était)
    const garde = S.ui.msgSel, gardeVoir = S.ui.ongMsgVoir;
    let html;
    try { if (existe){ S.ui.msgSel = id; S.ui.ongMsgVoir = id; } html = panMessages(); }
    finally { S.ui.msgSel = garde; S.ui.ongMsgVoir = gardeVoir; }
    const t = document.createElement("template"); t.innerHTML = html;
    const n = t.content, ici = sel => p.querySelector(sel), la = sel => n.querySelector(sel);
    const bt2 = la('.cv-conv [data-a="msg-envoyer"]'), meme = existe && !!bt2 && bt2.dataset.id === id;
    const barre = [".ong-msg-barre", ".acc-chips"].find(sel => ici(sel) || la(sel));
    const listeOk = !!(ici(".cv-liste") && la(".cv-liste")) && !(barre && !(ici(barre) && la(barre)));
    const majListe = () => {                                             // 1. les filtres et la liste
      if (barre && ici(barre).outerHTML !== la(barre).outerHTML) ici(barre).replaceWith(la(barre));
      const liste = ici(".cv-liste"), defile = liste.scrollTop;
      if (liste.innerHTML !== la(".cv-liste").innerHTML){ liste.innerHTML = la(".cv-liste").innerHTML; liste.scrollTop = defile; }
      [".ong-msg", ".cv"].forEach(sel => { const a = ici(sel), b = la(sel); if (a && b && a.className !== b.className) a.className = b.className; });
    };
    if (!meme){
      // supprimée ailleurs pendant qu'on répond : la réponse reste à l'écran (jamais recopiée dans une autre conversation)
      if (listeOk) majListe();
      if (!convSupprimees.has(id)){ convSupprimees.add(id); try { toast("Cette conversation a été supprimée par quelqu'un d'autre : copie ta réponse si tu veux la garder.", true); } catch(err){} }
      return true;
    }
    // mise en page inattendue : l'application redessine, sauf si une réponse est en cours (on ne touche alors qu'à la liste)
    const pasPrevu = () => { if (tape && listeOk) majListe(); return tape; };
    if (!listeOk || [".cv-tete", "#cv-fil", ".cv-rep"].some(sel => !ici(sel) || !la(sel))) return pasPrevu();
    const rep = ici(".cv-rep"), rep2 = la(".cv-rep"), t1 = rep.querySelector("#cv-texte"), t2 = rep2.querySelector("#cv-texte");
    if (!(t1 && t2 && t1.parentNode === rep && t2.parentNode === rep2)) return pasPrevu();
    majListe();
    // 2. la conversation affichée : en-tête, fil (sans sauter si on relisait plus haut), zone de réponse autour du champ
    if (ici(".cv-tete").outerHTML !== la(".cv-tete").outerHTML) ici(".cv-tete").replaceWith(la(".cv-tete"));
    const fil = ici("#cv-fil"), fil2 = la("#cv-fil");
    if (fil.innerHTML !== fil2.innerHTML){
      const enBas = fil.scrollHeight - fil.scrollTop - fil.clientHeight < 120, haut = fil.scrollTop;
      fil.innerHTML = fil2.innerHTML;
      fil.scrollTop = enBas ? fil.scrollHeight : haut;
    }
    if (rep.outerHTML !== rep2.outerHTML){
      [...rep.childNodes].forEach(c => { if (c !== t1) c.remove(); });
      let avant = true;
      [...rep2.childNodes].forEach(c => { if (c === t2){ avant = false; return; } if (avant) rep.insertBefore(c, t1); else rep.appendChild(c); });
      [...t2.attributes].forEach(a => { if (t1.getAttribute(a.name) !== a.value) t1.setAttribute(a.name, a.value); });
      if (rep.className !== rep2.className) rep.className = rep2.className;
    }
    // 3. comme l'application : la conversation choisie et affichée est lue
    const sel = (S.messages || []).find(x => x.id === S.ui.msgSel);
    if (sel && !sel.lu && document.visibilityState === "visible" && (S.ui.msgVue === "conv" || window.innerWidth > 860)){
      sel.lu = true; S.db.doc("messages/" + sel.id).update({ lu: true }).catch(() => {}); try { majBadgesMessages(); } catch(err){}
    }
    return true;
  }
  if (typeof window.majConversationOuverte === "function"){
    const convAvant = window.majConversationOuverte;
    window.majConversationOuverte = function(){
      try { if (majMessagesSurPlace()) return; } catch(err){ if (window.console) console.warn("messages", err); }
      return convAvant.apply(this, arguments);
    };
  }

  /* ================= CHOIX D'UN CLUB : LA LISTE COMPLÈTE QUAND LA RECHERCHE EST VIDE =================
     L'application filtre avec slug(recherche), qui vaut « x » pour une recherche vide : à l'ouverture de la fenêtre, et quand
     on efface ce qu'on a tapé, seuls les clubs contenant un « x » restaient. Sans lettre ni chiffre tapé, on montre tout. */
  if (typeof window.listePickClub === "function" && typeof window.clubsPick === "function"){
    const pickAvant = window.listePickClub;
    const sansMot = q => !/[0-9a-z]/i.test(String(q || "").normalize("NFD").replace(/[̀-ͯ]/g, ""));
    window.listePickClub = function(q){
      if (!sansMot(q)) return pickAvant.apply(this, arguments);
      try {
        const l = clubsPick();
        return l.slice(0, 80).map(([nom, n, district]) => `<button type="button" class="pick-club" data-club-choix="${esc(nom)}"${district ? ` data-district="${esc(district)}"` : ""}>
      <span class="pick-logo">${srcLogoClub(n) ? `<img src="${esc(srcLogoClub(n))}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.textContent='${esc(String(nom).slice(0, 1))}'">` : (logoAdvSrc(nom) ? `<img src="${logoAdvSrc(nom)}" alt="" loading="lazy" onerror="this.remove()">` : esc(nom.slice(0, 1)))}</span><span><b>${esc(nom)}</b></span></button>`).join("");
      } catch(err){ return pickAvant.apply(this, arguments); }
    };
  }

  /* cartes en relief : elles s'inclinent sous la souris (ordinateur) */
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches){
    document.addEventListener("pointermove", ev => {
      const c = ev.target.closest && ev.target.closest(".esp-rub"); if (!c) return;
      const r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
      c.style.setProperty("--rx", (-y * 5).toFixed(2) + "deg"); c.style.setProperty("--ry", (x * 7).toFixed(2) + "deg");
      c.style.setProperty("--mx", ((x + 0.5) * 100).toFixed(1) + "%"); c.style.setProperty("--my", ((y + 0.5) * 100).toFixed(1) + "%");
    }, { passive: true });
    document.addEventListener("pointerout", ev => {
      const c = ev.target.closest && ev.target.closest(".esp-rub"); if (!c || c.contains(ev.relatedTarget)) return;
      c.style.removeProperty("--rx"); c.style.removeProperty("--ry");
    }, { passive: true });
  }

  const css = document.createElement("style");
  css.id = "espace-css";
  css.textContent = `
/* ================= EN-TÊTE 3D ================= */
#p-espace .titre-page.esp-hero{position:relative;isolation:isolate;overflow:hidden;background:radial-gradient(90% 140% at 75% 30%,#173a2a 0%,#0b1426 45%,#050915 100%);
  min-height:clamp(340px,27vw,470px);display:flex;align-items:center;padding:40px 0 34px;border-bottom:1px solid rgba(227,182,76,.25)}
#p-espace .titre-page.esp-hero::before,#p-espace .titre-page.esp-hero::after{content:none}
#p-espace .titre-page.esp-hero .wrap{width:100%;max-width:1320px;position:relative;z-index:2}
#p-espace .esp-3d{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0}
#p-espace .esp-hero-voile{position:absolute;inset:0;z-index:1;pointer-events:none;
  background:linear-gradient(90deg,rgba(3,7,20,.92) 0%,rgba(3,7,20,.74) 24%,rgba(3,7,20,.22) 46%,rgba(3,7,20,0) 60%),
             linear-gradient(0deg,rgba(3,7,20,.55) 0%,rgba(3,7,20,0) 28%)}
#p-espace .titre-page.esp-hero h1{text-shadow:0 6px 30px rgba(0,0,0,.55)}
#p-espace .titre-page.esp-hero p{max-width:34ch;font-size:19px;color:#E6ECFF;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.esp-moi{display:inline-flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:22px;padding:10px 12px 10px 10px;border-radius:20px;
  background:linear-gradient(135deg,rgba(255,255,255,.14),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.22);
  -webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);box-shadow:0 18px 40px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.18);
  animation:monte .8s .2s cubic-bezier(.2,.8,.2,1) both}
.esp-moi-av{width:48px;height:48px;border-radius:50%;flex:none;display:grid;place-items:center;overflow:hidden;font:800 18px var(--display);color:#0B1633;
  background:linear-gradient(135deg,#F7D774,#C9A227);box-shadow:0 0 0 3px rgba(255,255,255,.25)}
.esp-moi-av img{width:100%;height:100%;object-fit:cover}
.esp-moi-txt{display:grid;line-height:1.2;min-width:0;margin-right:6px}
.esp-moi-txt b{font:800 18px var(--display);color:#fff;letter-spacing:.2px}
.esp-moi-txt small{font:600 13.5px var(--corps);color:#C9D4F2}
.esp-moi-bts{display:flex;gap:8px;flex-wrap:wrap}
.esp-moi-bt.joueur{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);border-color:transparent}
/* au toucher : pas d'attente du « double appui pour zoomer », le lien part au premier appui */
a,button,[role=tab],summary,label{touch-action:manipulation}
.esp-moi-bt{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:9px 15px;border-radius:12px;font:700 14.5px var(--corps);cursor:pointer;
  text-decoration:none;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.3);transition:background .15s,border-color .15s,transform .12s}
.esp-moi-bt:hover{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.55)}
.esp-moi-bt:active{transform:scale(.97)}
.esp-moi-bt.sortir{background:rgba(220,38,38,.18);border-color:rgba(248,113,113,.5)}
.esp-moi-bt.sortir:hover{background:rgba(220,38,38,.32)}
/* ================= PLUS DE MENU À GAUCHE ================= */
body.sur-espace .app.esp-app{grid-template-columns:minmax(0,1fr);max-width:1320px;margin:0 auto}
body.sur-espace .app.esp-app>.app-nav{display:none}
body.sur-espace footer .defile{display:none}
#p-espace .bloc{background:radial-gradient(1200px 500px at 70% -10%,rgba(37,87,196,.16),transparent 70%)}
/* ================= ACCUEIL : OÙ VEUX-TU ALLER ? ================= */
body.sur-espace .esp-sur-accueil .app-tete.esp-bandeau{display:none}
.esp-lanceur{margin:6px 0 30px}
.esp-lanceur h2{font:900 30px var(--display);font-style:italic;text-transform:uppercase;letter-spacing:.3px;margin:0 0 16px;display:flex;align-items:center;gap:12px}
.esp-lanceur h2::after{content:"";flex:1;height:2px;background:linear-gradient(90deg,rgba(227,182,76,.6),transparent)}
.esp-rubs{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:18px;perspective:1200px}
.esp-rub{--teinte:#2F6BFF;position:relative;display:grid;gap:10px;align-content:start;padding:16px;border-radius:22px;overflow:hidden;
  background:linear-gradient(160deg,#16275a,#0b1530);border:1px solid rgba(143,168,240,.25);
  background:linear-gradient(160deg,color-mix(in srgb,var(--teinte) 22%,#14234d) 0%,#101c3f 45%,#0b1530 100%);
  border:1px solid color-mix(in srgb,var(--teinte) 35%,rgba(143,168,240,.25));
  box-shadow:0 1px 0 rgba(255,255,255,.1) inset,0 22px 44px rgba(3,8,24,.45),0 4px 10px rgba(3,8,24,.3);
  transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transform-style:preserve-3d;transition:transform .25s ease-out,box-shadow .25s}
.esp-rub::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:radial-gradient(420px circle at var(--mx,30%) var(--my,0%),rgba(255,255,255,.10),transparent 45%)}
.esp-rub:hover{box-shadow:0 1px 0 rgba(255,255,255,.14) inset,0 30px 60px rgba(3,8,24,.55),0 0 0 1px color-mix(in srgb,var(--teinte) 50%,transparent)}
.esp-rub-t{display:flex;align-items:center;gap:12px;color:#fff;transform:translateZ(30px)}
.esp-rub-t b{display:block;font:800 21px var(--display);letter-spacing:.2px;line-height:1.1}
.esp-rub-t small{display:block;font:500 13px var(--corps);color:#AFC0EA;margin-top:2px}
.esp-rub-ico{width:52px;height:52px;flex:none;border-radius:16px;display:grid;place-items:center;font-size:27px;
  background:var(--teinte);
  background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.55),transparent 42%),linear-gradient(145deg,var(--teinte),color-mix(in srgb,var(--teinte) 45%,#050a1c));
  box-shadow:0 10px 22px color-mix(in srgb,var(--teinte) 45%,transparent),inset 0 -3px 6px rgba(0,0,0,.25),inset 0 2px 2px rgba(255,255,255,.35)}
.esp-tuiles{display:grid;gap:8px;transform:translateZ(18px)}
.esp-tuile{display:flex;align-items:center;gap:12px;width:100%;text-align:left;color:#fff;cursor:pointer;min-height:60px;padding:10px 12px;border-radius:14px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);transition:background .15s,border-color .15s,transform .12s}
.esp-tuile:hover{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.22);transform:translateX(3px)}
.esp-tuile:active{transform:scale(.98)}
.esp-tuile:focus-visible{outline:3px solid #8FC2FF;outline-offset:2px}
.esp-tuile-ico{width:38px;height:38px;flex:none;border-radius:11px;display:grid;place-items:center;color:#fff;
  background:var(--teinte);
  background:linear-gradient(145deg,color-mix(in srgb,var(--teinte) 85%,#fff),color-mix(in srgb,var(--teinte) 70%,#000));box-shadow:0 6px 14px color-mix(in srgb,var(--teinte) 35%,transparent)}
.esp-tuile-ico svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.9}
.esp-tuile-txt{flex:1;min-width:0;display:grid;gap:2px}
.esp-tuile-txt b{font:700 16.5px var(--corps);display:flex;align-items:center;gap:8px}
.esp-tuile-txt small{font:500 13px var(--corps);color:#AFC0EA;line-height:1.35}
.esp-fl{font:700 22px var(--corps);color:#AFC0EA;flex:none;transition:transform .15s}
.esp-tuile:hover .esp-fl{transform:translateX(3px);color:#fff}
/* ================= BANDEAU DE CHAQUE PAGE ================= */
body.sur-espace .app-tete.esp-bandeau{--teinte:#2F6BFF;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:0 0 14px;padding:18px 22px;
  border-radius:22px;color:#fff;position:relative;overflow:hidden;
  background:linear-gradient(120deg,#1a3270,#0f1e46 55%,#0a1532);
  background:linear-gradient(120deg,color-mix(in srgb,var(--teinte) 40%,#0f1e46) 0%,#0f1e46 55%,#0a1532 100%);
  border:1px solid color-mix(in srgb,var(--teinte) 40%,rgba(143,168,240,.2));box-shadow:0 1px 0 rgba(255,255,255,.1) inset,0 18px 40px rgba(3,8,24,.4)}
body.sur-espace .app-tete.esp-bandeau::after{content:"";position:absolute;right:-60px;top:-80px;width:280px;height:280px;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle,color-mix(in srgb,var(--teinte) 45%,transparent),transparent 65%);opacity:.6}
body.sur-espace .app-tete.esp-bandeau>div{position:relative;z-index:1;min-width:0}
body.sur-espace .app-tete.esp-bandeau h1{display:flex;align-items:center;gap:14px;color:#fff;font-size:32px;font-style:italic;text-transform:uppercase;font-weight:900}
body.sur-espace .app-tete.esp-bandeau .rub-ico-grand{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;font-size:28px;flex:none;font-style:normal;
  background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.55),transparent 42%),linear-gradient(145deg,var(--teinte),color-mix(in srgb,var(--teinte) 45%,#050a1c));
  box-shadow:0 10px 22px color-mix(in srgb,var(--teinte) 45%,transparent),inset 0 -3px 6px rgba(0,0,0,.25)}
body.sur-espace .app-tete.esp-bandeau p{color:#D5DEFA;margin-top:6px;font-size:16px}
.esp-accueil{position:relative;z-index:1;flex:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:10px 18px;border-radius:13px;cursor:pointer;
  font:800 15px var(--corps);color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);transition:background .15s,transform .12s}
.esp-accueil:hover{background:rgba(255,255,255,.22)}
.esp-accueil:active{transform:scale(.97)}
/* onglets de la rubrique : un sélecteur clair */
body.sur-espace .rub-onglets{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 0 22px;padding:6px;
  background:rgba(10,20,48,.75);border:1px solid rgba(143,168,240,.2);border-radius:16px;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
body.sur-espace .rub-onglets::-webkit-scrollbar{display:none}
body.sur-espace .rub-onglets button{flex:1 0 auto;min-height:46px;padding:10px 18px;border-radius:12px;border:0;background:none;color:#C9D4F2;
  font:700 15.5px var(--corps);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:background .15s,color .15s}
body.sur-espace .rub-onglets button:hover{background:rgba(143,168,240,.14);color:#fff}
body.sur-espace .rub-onglets button[aria-selected="true"]{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);color:#fff;box-shadow:0 8px 20px rgba(47,107,255,.35),inset 0 1px 0 rgba(255,255,255,.25)}
/* ================= L'INTÉRIEUR DES ONGLETS : PROPRE ET RÉGULIER ================= */
body.sur-espace #panneau{display:block;overflow-x:clip}   /* clip (et non hidden) : les barres « collantes » des onglets restent en place */
body.sur-espace #panneau .carte,body.sur-espace #panneau .pli{border-radius:20px;border:1px solid rgba(143,168,240,.2);
  background:linear-gradient(180deg,rgba(26,44,96,.55),rgba(14,26,60,.55)),var(--carte);box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 16px 36px rgba(3,8,24,.32)}
body.sur-espace #panneau .carte{padding:22px 24px;margin-bottom:18px}
body.sur-espace #panneau .carte>h2:first-child{display:flex;align-items:center;gap:10px;font-size:23px;margin:0 0 14px;padding-bottom:12px;border-bottom:1px solid rgba(143,168,240,.16)}
body.sur-espace #panneau h3.sous{display:flex;align-items:center;gap:10px;border-left:0;padding-left:0;font-size:22px;margin:30px 0 14px}
body.sur-espace #panneau h3.sous::before{content:"";width:6px;height:22px;border-radius:3px;background:linear-gradient(180deg,#F7D774,#C9A227);flex:none}
/* champs : même hauteur partout, libellés alignés */
body.sur-espace #panneau .grille{align-items:start;gap:16px 18px}
body.sur-espace #panneau label{align-content:start}
body.sur-espace #panneau input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),
body.sur-espace #panneau select,body.sur-espace #panneau .dp-champ{height:48px;min-height:48px;border-radius:12px;background:rgba(5,11,31,.55);border:1px solid rgba(143,168,240,.28);padding:0 14px;font-size:16px}
body.sur-espace #panneau textarea{border-radius:12px;background:rgba(5,11,31,.55);border:1px solid rgba(143,168,240,.28);min-height:44px;padding:12px 14px}
body.sur-espace #panneau .dp-champ{margin:0}
body.sur-espace #panneau input:hover,body.sur-espace #panneau select:hover,body.sur-espace #panneau textarea:hover,body.sur-espace #panneau .dp-champ:hover{border-color:rgba(143,168,240,.55)}
body.sur-espace #panneau input:focus-visible,body.sur-espace #panneau select:focus-visible,body.sur-espace #panneau textarea:focus-visible{
  outline:0;border-color:#5B8CFF;box-shadow:0 0 0 4px rgba(91,140,255,.25)}
body.sur-espace #panneau input::placeholder,body.sur-espace #panneau textarea::placeholder{color:#7F90BE}
/* boutons : l'action principale se voit tout de suite */
body.sur-espace #panneau .btn{min-height:46px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:13px;font:800 15.5px var(--corps);letter-spacing:.1px;padding:10px 18px}
body.sur-espace #panneau .btn.petit{min-height:40px;font-size:14.5px;padding:8px 14px;border-radius:11px}
body.sur-espace #panneau .btn.bleu{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);border-color:transparent;color:#fff;box-shadow:0 10px 22px rgba(47,107,255,.3),inset 0 1px 0 rgba(255,255,255,.25)}
body.sur-espace #panneau .btn.bleu:hover{filter:brightness(1.08);transform:translateY(-1px)}
body.sur-espace #panneau .btn.contour{background:rgba(255,255,255,.05);border:1px solid rgba(143,168,240,.4);color:#E6ECFF}
body.sur-espace #panneau .btn.contour:hover{background:rgba(143,168,240,.14);border-color:rgba(143,168,240,.7)}
body.sur-espace #panneau .btn.danger{background:rgba(220,38,38,.08);border:1px solid rgba(248,113,113,.55);color:#FCA5A5}
body.sur-espace #panneau .btn.danger:hover{background:rgba(220,38,38,.2)}
body.sur-espace #panneau .btn:disabled{opacity:.5;cursor:not-allowed;transform:none;filter:none}
body.sur-espace #panneau .carte>div:last-child>.btn.bleu:only-child,body.sur-espace #panneau form.carte>div:last-child>.btn.bleu{min-width:220px;min-height:50px;font-size:16.5px}
/* lignes de liste et éléments */
body.sur-espace #panneau .rangee{border-radius:16px;background:linear-gradient(180deg,rgba(26,44,96,.45),rgba(14,26,60,.45));border:1px solid rgba(143,168,240,.18);padding:14px 18px;margin-bottom:10px}
body.sur-espace #panneau .rangee:hover{border-color:rgba(143,168,240,.45)}
body.sur-espace #panneau .rangee .txt{flex:1;min-width:200px}
body.sur-espace #panneau .item{border-radius:18px;background:linear-gradient(180deg,rgba(26,44,96,.5),rgba(14,26,60,.5));border:1px solid rgba(143,168,240,.18)}
body.sur-espace #panneau .statut,body.sur-espace #panneau .etiq{border-radius:999px}
/* messages vides : clairs et aérés (pas le champ de date encore vide, qui porte aussi la classe « vide ») */
body.sur-espace #panneau .vide:not(.dp-champ),body.sur-espace #panneau .etat-vide{border:1.5px dashed rgba(143,168,240,.3);border-radius:18px;background:rgba(10,20,48,.4);color:#AFC0EA}
body.sur-espace #panneau .etat-vide b{color:#fff}
/* tableaux */
body.sur-espace #panneau table{border-collapse:separate;border-spacing:0;border:1px solid rgba(143,168,240,.2);border-radius:16px;overflow:hidden}
body.sur-espace #panneau th{background:rgba(143,168,240,.1)}
body.sur-espace #panneau tbody tr:nth-child(even) td{background:rgba(143,168,240,.05)}
body.sur-espace #panneau tbody tr:hover td{background:rgba(143,168,240,.1)}
/* textes d'aide plus lisibles */
body.sur-espace #panneau .quoi,body.sur-espace #panneau .legende,body.sur-espace #panneau .aide{color:#AFC0EA;line-height:1.5}
#esp-barre{display:none!important}
/* le menu ☰ (tiroir « Espace club ») ne sert plus dans l'espace club, sur ordinateur comme sur téléphone */
body.sur-espace #btn-menu,body.sur-espace #drawer{display:none!important}
.esp-version{margin:30px 0 6px;text-align:center;color:var(--texte-doux);font:600 12px var(--corps);letter-spacing:.04em;opacity:.75}
/* ================= THÈME CLAIR ================= */
:root[data-theme="light"] body.sur-espace #panneau .carte,:root[data-theme="light"] body.sur-espace #panneau .pli,
:root[data-theme="light"] body.sur-espace #panneau .rangee,:root[data-theme="light"] body.sur-espace #panneau .item{background:var(--carte);box-shadow:0 10px 26px rgba(7,18,48,.08)}
:root[data-theme="light"] body.sur-espace #panneau input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),:root[data-theme="light"] body.sur-espace #panneau select,
:root[data-theme="light"] body.sur-espace #panneau textarea,:root[data-theme="light"] body.sur-espace #panneau .dp-champ{background:#fff;border-color:#C9D4F2}
:root[data-theme="light"] body.sur-espace #panneau .btn.contour{color:var(--texte)}
:root[data-theme="light"] body.sur-espace #panneau .btn.danger{background:#fff;color:#B91C1C;border-color:#F87171}
:root[data-theme="light"] body.sur-espace #panneau .btn.danger:hover{background:#FEE2E2}
:root[data-theme="light"] body.sur-espace #panneau .quoi{color:var(--texte-doux)}
/* thème clair : les verts trop pâles sur fond blanc (présents, « Publiée », « Sur le site ») */
:root[data-theme="light"] body.sur-espace #panneau .en-compte .v,:root[data-theme="light"] body.sur-espace #panneau .en-det b.v,
:root[data-theme="light"] body.sur-espace #panneau .etiq.ok{color:#15803D}
:root[data-theme="light"] body.sur-espace .rub-onglets{background:var(--carte)}
:root[data-theme="light"] body.sur-espace .rub-onglets button{color:var(--texte)}
:root[data-theme="light"] body.sur-espace .rub-onglets button[aria-selected="true"]{color:#fff}
/* ================= TABLETTE ET TÉLÉPHONE ================= */
@media (max-width:1140px){
  body.sur-espace .rub-onglets{position:sticky;top:60px;z-index:6;box-shadow:0 10px 22px rgba(3,8,24,.35)}
  body.sur-espace .rub-onglets button{flex:none}
  body.sur-espace .app-tete.esp-bandeau{padding:16px;border-radius:18px;margin-bottom:12px}
  body.sur-espace .app-tete.esp-bandeau h1{font-size:25px;gap:12px}
  body.sur-espace .app-tete.esp-bandeau .rub-ico-grand{width:44px;height:44px;font-size:23px;border-radius:14px}
  body.sur-espace .app-tete.esp-bandeau p{font-size:14.5px}
}
@media (max-width:700px){
  #p-espace .titre-page.esp-hero{min-height:0;padding:30px 0 22px}
  #p-espace .esp-hero-voile{background:linear-gradient(180deg,rgba(3,7,20,.82) 0%,rgba(3,7,20,.45) 45%,rgba(3,7,20,.8) 100%)}
  #p-espace .titre-page.esp-hero p{font-size:16.5px}
  .esp-moi{display:flex;margin-top:16px;padding:10px;gap:10px}
  .esp-moi-av{width:42px;height:42px;font-size:16px}
  .esp-moi-txt{flex:1}
  .esp-moi-bts{width:100%}
  .esp-moi-bt{flex:1;justify-content:center}
  .esp-rubs{grid-template-columns:minmax(0,1fr);gap:14px}
  .esp-lanceur h2{font-size:24px}
  /* le bandeau garde la même hauteur d'un onglet à l'autre : « Accueil » toujours en haut à droite (il passait dessous
     quand la phrase de l'onglet était longue, et les onglets de la rubrique sautaient), la phrase sur deux lignes au plus */
  body.sur-espace .app-tete.esp-bandeau{display:block;position:relative}
  body.sur-espace .app-tete.esp-bandeau h1{padding-right:112px;min-height:44px}
  body.sur-espace .app-tete.esp-bandeau p{min-height:2.8em;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .esp-accueil{position:absolute;top:16px;right:16px;padding:8px 13px;min-height:40px}
  body.sur-espace .rub-onglets button{padding:10px 14px;font-size:14.5px}
  body.sur-espace #panneau .carte{padding:16px}
  body.sur-espace #panneau .carte>div:last-child>.btn.bleu:only-child,body.sur-espace #panneau form.carte>div:last-child>.btn.bleu{width:100%}
}
/* téléphone : les onglets de la rubrique passent sur deux lignes plutôt que d'en cacher un sur le côté */
@media (max-width:700px){
  body.sur-espace .rub-onglets{flex-wrap:wrap;overflow-x:visible}
  body.sur-espace .rub-onglets button{flex:1 1 auto;padding:9px 12px}
}
/* le nom de la rubrique sur une ligne (sa taille est ajustée par ajusterTitre quand il est long) */
@media (max-width:700px){
  body.sur-espace .app-tete.esp-bandeau h1.esp-h1-ligne{white-space:nowrap}
}
/* petits téléphones : le nom de la rubrique un peu plus petit, pour ne pas passer sous « Accueil » */
@media (max-width:380px){
  body.sur-espace .app-tete.esp-bandeau h1{font-size:21px;gap:10px;padding-right:104px}
  body.sur-espace .app-tete.esp-bandeau .rub-ico-grand{width:40px;height:40px;font-size:21px}
  .esp-accueil{padding:8px 11px}
}`;
  document.head.appendChild(css);
  // l'espace est peut-être déjà affiché : on l'habille tout de suite
  if (document.getElementById("panneau")) setTimeout(() => { try { if (S.ui.onglet === "tableau") rendrePanneau(); habiller(); } catch(err){} }, 0);
})();

/* ================= « NOUVELLE VERSION DU SITE DISPONIBLE » (site public et espace club) =================
   Après une mise à jour, certains gardaient l'ancienne version : le navigateur, et le service worker du site (/sw.js),
   peuvent resservir l'ancienne page. build.py pose dans l'en-tête de la page sa version (balise meta « asf-version »,
   une empreinte de la page construite : elle ne change que si les modules ou le style changent) et le jour où elle a été
   construite (balise meta « asf-version-date »).
   - La page relit sa propre adresse sans cache (cache: "no-store" et un paramètre jamais vu) toutes les 5 minutes, quand
     l'onglet redevient visible et une fois peu après l'ouverture ; elle ne lit que le début de la page (l'en-tête), puis
     coupe le téléchargement.
   - Version différente (et pas plus ancienne) : un petit bandeau en bas « ✨ Nouvelle version du site disponible — Recharger »,
     au-dessus de la barre des rubriques au téléphone.
   - « Recharger » : on demande au service worker sa dernière version (reg.update(), et s'il en a une en attente, elle prend
     la main), on vide les copies qu'il garde (Cache Storage), puis on recharge par une adresse neuve (?asf-v=…, retirée
     aussitôt) qu'aucun cache ne connaît. Une seule fois par version et par onglet : jamais de boucle de rechargements. */
(function(){
  "use strict";
  const meta = n => { const m = document.querySelector(`meta[name="${n}"]`); return m ? (m.getAttribute("content") || "").trim() : ""; };
  const moi = meta("asf-version"), maDate = meta("asf-version-date");
  if (!moi || !/^https?:$/.test(location.protocol) || typeof fetch !== "function") return;
  const CLE = "asf-maj-essais";                                          // { version visée : heure de l'essai } pour cet onglet
  const essais = () => { try { return JSON.parse(sessionStorage.getItem(CLE) || "{}") || {}; } catch(err){ return {}; } };
  const noter = o => { try { sessionStorage.setItem(CLE, JSON.stringify(o)); } catch(err){} };
  // arrivé sur la nouvelle version : l'essai est réussi, et l'adresse de rechargement (?asf-v=…) redevient l'adresse normale
  try { const e = essais(); if (e[moi]){ delete e[moi]; noter(e); } } catch(err){}
  try {
    const u = new URL(location.href);
    if (u.searchParams.has("asf-v")){ u.searchParams.delete("asf-v"); history.replaceState(history.state, "", u.pathname + u.search + u.hash); }
  } catch(err){}

  /* ---------- la version en ligne ---------- */
  const lireMeta = (t, n) => { const m = t.match(new RegExp(`<meta\\s+name=["']${n}["']\\s+content=["']([^"']*)["']`, "i")); return m ? m[1].trim() : ""; };
  async function versionEnLigne(){
    const u = new URL(location.href); u.hash = ""; u.searchParams.delete("asf-v"); u.searchParams.set("asf-verif", Date.now().toString(36));
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    const delai = setTimeout(() => { try { if (ctrl) ctrl.abort(); } catch(err){} }, 20000);
    try {
      const r = await fetch(u.href, { cache: "no-store", credentials: "same-origin", headers: { "Accept": "text/html", "Range": "bytes=0-16383" }, signal: ctrl ? ctrl.signal : undefined });
      if (!r.ok) return null;
      let t = "";
      if (r.body && typeof r.body.getReader === "function" && typeof TextDecoder === "function"){
        // on lit jusqu'à la fin de l'en-tête de la page, pas plus
        const lecteur = r.body.getReader(), dec = new TextDecoder();
        for (;;){
          const { done, value } = await lecteur.read();
          if (value) t += dec.decode(value, { stream: true });
          if (done || /<\/head>/i.test(t) || /<meta\s+name=["']asf-version-date["'][^>]*>/i.test(t) || t.length > 600000){ if (!done) lecteur.cancel().catch(() => {}); break; }
        }
      } else t = await r.text();
      const v = lireMeta(t, "asf-version");
      return v ? { v, date: lireMeta(t, "asf-version-date") } : null;
    } catch(err){ return null; }
    finally { clearTimeout(delai); }
  }
  let enLigne = "", enCours = false, derniere = 0, fermeA = { v: "", t: 0 };
  async function verifier(force){
    if (enCours || document.visibilityState === "hidden" || (!force && Date.now() - derniere < 5 * 60 * 1000)) return;
    enCours = true; derniere = Date.now();
    try {
      const x = await versionEnLigne();
      if (!x || x.v === moi) return;
      if (/^\d{4}-\d{2}-\d{2}$/.test(x.date) && /^\d{4}-\d{2}-\d{2}$/.test(maDate) && x.date < maDate) return;   // plus ancienne : rien
      enLigne = x.v; montrer();
    } finally { enCours = false; }
  }

  /* ---------- le bandeau ---------- */
  function montrer(){
    if (fermeA.v === enLigne && Date.now() - fermeA.t < 30 * 60000) return;   // « Plus tard » : on ne revient pas avant 30 min
    const deja = !!essais()[enLigne];                                    // déjà rechargé pour cette version, sans succès
    let b = document.getElementById("asf-maj");
    if (!b){ b = document.createElement("div"); b.id = "asf-maj"; b.setAttribute("role", "status"); b.setAttribute("aria-live", "polite"); document.body.appendChild(b); }
    const html = deja
      ? `<span class="asf-maj-txt"><span aria-hidden="true">✨</span> Nouvelle version disponible : ferme complètement le site puis rouvre-le.</span>
         <button type="button" class="asf-maj-x" data-asf-maj="fermer" aria-label="Fermer" title="Fermer">×</button>`
      : `<span class="asf-maj-txt"><span aria-hidden="true">✨</span> Nouvelle version du site disponible</span> <span class="asf-maj-tiret" aria-hidden="true">—</span>
         <button type="button" class="asf-maj-bt" data-asf-maj="recharger">Recharger</button>
         <button type="button" class="asf-maj-x" data-asf-maj="fermer" aria-label="Plus tard" title="Plus tard">×</button>`;
    if (b.dataset.html !== html){ b.innerHTML = html; b.dataset.html = html; }
    b.hidden = false; document.body.classList.add("avec-asf-maj");
  }
  function cacher(){ const b = document.getElementById("asf-maj"); if (b) b.hidden = true; document.body.classList.remove("avec-asf-maj"); }
  const pause = ms => new Promise(ok => setTimeout(ok, ms));
  async function recharger(v){
    const e = essais(); if (e[v]) return;                                // une seule fois par version
    e[v] = Date.now(); noter(e);
    // 1. le service worker : sa dernière version ; s'il en a une en attente, elle prend la main tout de suite
    try {
      const sw = navigator.serviceWorker, reg = sw ? await sw.getRegistration() : null;
      if (reg){
        await Promise.race([reg.update().catch(() => {}), pause(4000)]);
        const nouveau = reg.installing;
        if (nouveau && !reg.waiting) await Promise.race([new Promise(ok => nouveau.addEventListener("statechange", () => { if (nouveau.state !== "installing") ok(); })), pause(4000)]);
        if (reg.waiting){
          const prise = new Promise(ok => sw.addEventListener("controllerchange", ok, { once: true }));
          try { reg.waiting.postMessage({ type: "SKIP_WAITING" }); reg.waiting.postMessage("skipWaiting"); } catch(err){}
          await Promise.race([prise, pause(3000)]);
        }
      }
    } catch(err){}
    // 2. les copies gardées par le service worker
    try { if (window.caches && caches.keys){ const cles = await caches.keys(); await Promise.all(cles.map(k => caches.delete(k))); } } catch(err){}
    // 3. on recharge, par une adresse neuve : ni le navigateur ni le service worker n'en ont de copie
    const u = new URL(location.href); u.searchParams.set("asf-v", v);
    location.replace(u.href);
  }
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest("#asf-maj [data-asf-maj]"); if (!b) return;
    if (b.dataset.asfMaj === "fermer"){ fermeA = { v: enLigne, t: Date.now() }; cacher(); return; }
    if (typeof window.espaceSaisieEnCours === "function" && window.espaceSaisieEnCours()
      && !confirm("Quelque chose est en cours d'écriture dans l'espace club et n'est pas encore enregistré. En rechargeant maintenant, ce sera perdu. Recharger quand même ?")) return;
    b.disabled = true; b.textContent = "Chargement…";
    recharger(enLigne).catch(() => { try { location.reload(); } catch(err){} });
  });

  /* ---------- quand vérifier ---------- */
  setTimeout(() => verifier(true), 8000);
  setInterval(() => verifier(true), 15 * 60 * 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") verifier(false); });

  const css = document.createElement("style");
  css.id = "asf-maj-css";
  css.textContent = `
#asf-maj{position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:58;
  display:flex;align-items:center;gap:10px;width:max-content;max-width:calc(100vw - 24px);box-sizing:border-box;padding:7px 7px 7px 18px;border-radius:999px;
  background:rgba(11,22,51,.97);color:#fff;border:1px solid rgba(227,182,76,.55);box-shadow:0 16px 36px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08);
  font:600 15px/1.3 var(--corps,system-ui,sans-serif);animation:asfMajMonte .4s cubic-bezier(.2,.8,.2,1) both}
#asf-maj[hidden]{display:none}
#asf-maj .asf-maj-txt{min-width:0}
#asf-maj .asf-maj-tiret{opacity:.55}
#asf-maj .asf-maj-bt{flex:none;min-height:44px;padding:9px 18px;border-radius:999px;border:0;cursor:pointer;color:#0B1633;font:800 15px var(--corps,system-ui,sans-serif);
  background:linear-gradient(180deg,#F7D774,#D9B23A);box-shadow:0 6px 16px rgba(227,182,76,.3)}
#asf-maj .asf-maj-bt:hover{filter:brightness(1.06)}
#asf-maj .asf-maj-bt:disabled{opacity:.75;cursor:progress}
#asf-maj .asf-maj-x{flex:none;width:44px;height:44px;border-radius:50%;border:0;background:transparent;color:#C9D4F2;font:400 24px/1 system-ui,sans-serif;cursor:pointer}
#asf-maj .asf-maj-x:hover{background:rgba(255,255,255,.1);color:#fff}
#asf-maj button:focus-visible{outline:3px solid #8FC2FF;outline-offset:2px}
@keyframes asfMajMonte{from{opacity:0;transform:translate(-50%,16px)}to{opacity:1;transform:translate(-50%,0)}}
/* le message d'enregistrement (toast) passe au-dessus du bandeau */
body.avec-asf-maj .toast{bottom:calc(84px + env(safe-area-inset-bottom,0px))}
@media (max-width:560px){
  #asf-maj{gap:8px;padding:6px 6px 6px 14px;font-size:14px;width:calc(100vw - 24px)}
  #asf-maj .asf-maj-txt{flex:1}
  #asf-maj .asf-maj-tiret{display:none}
  #asf-maj .asf-maj-bt{padding:9px 14px;font-size:14.5px}
}
@media (prefers-reduced-motion:reduce){#asf-maj{animation:none}}`;
  document.head.appendChild(css);
})();
