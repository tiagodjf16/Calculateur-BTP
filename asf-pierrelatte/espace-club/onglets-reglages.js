/* Rubrique Réglages (Le club, Accès et rôles, Sauvegardes), rangée pour que ce soit simple :
   - Le club : « 💡 Comment ça marche ? » replié, les quatre parties à choisir en cartes (icône, nom, ce qu'il y a dedans),
     des tableaux avec leurs colonnes nommées (horaires, cotisations, bureau, référents), une ligne par personne,
     et la barre « Annuler / Enregistrer » qui dit si tout est enregistré et reste collée en bas dès qu'on change quelque chose ;
   - Accès et rôles : recherche + « Nouveau coach ou dirigeant » en haut, filtres et « Actualiser » sur une ligne,
     comptes rangés par famille (bureau, coachs, joueurs), fiche d'un compte en blocs (son profil, ce qu'il peut ouvrir,
     code et compte à part) ; la fenêtre des accès range les onglets par rubrique ;
   - Sauvegardes : l'explication repliée (en premier, comme partout), l'état de la dernière copie et « Sauvegarder maintenant »,
     puis la liste des copies.
   Ajouté sans modifier le script de l'application : tous les boutons gardent leurs data-a / data-k / data-*, les champs restent
   dans leur ligne [data-liste] ou leur fiche [data-cpt], le formulaire data-form="compte-staff" ne change pas. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONG === "undefined") return;
  const e = ONG.e;
  const el = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const pl = (n, s, p) => n + " " + (n > 1 ? (p || s + "s") : s);

  /* ---- rôle « Joueur, coach et bureau » : pour le serveur c'est un compte bureau, l'espace joueur reste ouvert ---- */
  try {
    if (typeof ROLES_COMBI !== "undefined" && !ROLES_COMBI.some(([k]) => k === "joueur_entraineur_bureau"))
      ROLES_COMBI.push(["joueur_entraineur_bureau", "Joueur, coach et bureau"]);
    if (typeof ROLE_SERVEUR !== "undefined") ROLE_SERVEUR.joueur_entraineur_bureau = "bureau";
  } catch(err){}

  /* ---- école de foot : trois équipes (U6 · U7, U8 · U9, U10 · U11) au lieu de « U6 à U11 » pour les équipes gérées ----
     La liste des équipes de l'application vient des équipes du club (site public), des matchs et des effectifs. Pour que
     les trois équipes existent partout côté club (équipes gérées, compos, effectifs, filtres des coachs) sans toucher
     à la carte « U6 à U11 » du site public, on ajoute un effectif vide pour chacune tant que le club n'en a pas encore. */
  const ECOLE = ["U6 · U7", "U8 · U9", "U10 · U11"];
  const estEcoleTout = n => /^\s*u\s?6\s*(à|a|-)\s*u\s?11\s*$/i.test(String(n || ""));
  try {
    if (typeof GROUPE_EFF === "function" && typeof slug === "function"){
      const avecEcole = o => {
        const x = { ...(o || {}) };
        const pris = new Set(Object.values(x).map(v => v && GROUPE_EFF(v.equipe)));
        ECOLE.forEach(n => { const k = slug(n); if (!x[k] && !pris.has(GROUPE_EFF(n))) x[k] = { equipe: n, joueurs: [] }; });
        return x;
      };
      let vue = avecEcole(S.effectifs);                                     // même objet tant que les effectifs ne changent pas
      Object.defineProperty(S, "effectifs", { configurable: true, enumerable: true,
        get: () => vue, set: v => { vue = avecEcole(v); } });
    }
  } catch(err){}
  /* ancien choix « U6 à U11 » coché : à la première case touchée, il devient les trois équipes */
  document.addEventListener("change", ev => {
    const t = ev.target; if (!t || !t.matches || !t.matches("[data-eq-perm]")) return;
    try {
      const cle = "c" + t.dataset.cptId, p = S.permissions || {}, q = p[cle] || {};
      const cpt = (S.comptes || []).find(x => String(x.id) === String(t.dataset.cptId)) || {};
      const base = Array.isArray(q.equipes) && q.equipes.length ? q.equipes : (cpt.equipe ? [cpt.equipe] : []);
      if (!base.some(estEcoleTout)) return;
      const l = [...new Set(base.flatMap(n => estEcoleTout(n) ? ECOLE : [n]))];
      S.permissions = { ...p, [cle]: { ...q, equipes: l } };
    } catch(err){}
  }, true);
  /* dans une fiche ou une fenêtre : plus de case ni de choix « U6 à U11 » (sauf le choix déjà enregistré d'un compte) */
  const sansEcoleTout = racine => {
    racine.querySelectorAll("input[data-eq-perm]").forEach(i => {
      if (!estEcoleTout(i.dataset.eqPerm)) return;
      const coche = i.hasAttribute("checked"), lab = i.closest("label") || i;
      if (coche) ECOLE.forEach(n => { const x = racine.querySelector(`input[data-eq-perm="${CSS.escape(n)}"]`); if (x) x.setAttribute("checked", ""); });
      lab.remove();
    });
    racine.querySelectorAll("select option").forEach(o => { if (estEcoleTout(o.value || o.textContent) && !o.hasAttribute("selected")) o.remove(); });
  };

  /* ---- numéro de licence : l'espace joueur est réservé aux licenciés (vérifié par le serveur, session.php) ;
     donner l'accès dirigeant (changer un rôle) : les comptes « Joueur, coach et bureau » et l'administrateur ---- */
  const licencePropre = v => { const x = String(v || "").replace(/[\s.-]+/g, ""); return /^\d{6,12}$/.test(x) ? x : ""; };
  /* le numéro trouvé dans les effectifs (import Footclubs) pour cette personne */
  const licenceEffectifs = (...noms) => {
    const cles = noms.filter(Boolean).map(n => slug(n));
    for (const ef of Object.values(S.effectifs || {}))
      for (const j of (ef && ef.joueurs) || []) if (j && cles.includes(slug(j.nom || "")) && licencePropre(j.licence)) return licencePropre(j.licence);
    return "";
  };
  if (typeof window.appelAuth === "function"){
    const avantAuth = window.appelAuth;
    window.appelAuth = async function(action, corps){
      try {
        if (action === "maj" && corps && corps.id != null){
          const x = document.querySelector(`#panneau [data-cpt="${CSS.escape(String(corps.id))}"] [data-cpt-champ="licence"]`);
          if (x) corps = { ...corps, licence: x.value.trim() };
        }
        if (action === "creer_lot" && corps && Array.isArray(corps.comptes)){
          corps = { ...corps, comptes: corps.comptes.map(r => {
            if (r.licence) return r;
            const l = licenceEffectifs(r.complet, `${r.prenom || ""} ${r.nom || ""}`);
            return l ? { ...r, licence: l } : r;
          }) };
        }
      } catch(err){}
      const r = await avantAuth.call(this, action, corps);
      if (action === "comptes" && r){ if (typeof r.gerer === "boolean") S.ui.cptGerer = r.gerer; if (typeof r.donner === "boolean") S.ui.cptDonner = r.donner; }
      return r;
    };
  }
  /* un joueur sans licence n'a accès à rien : on lui dit pourquoi */
  let ditSansLicence = false;
  const direSansLicence = () => {
    if (ditSansLicence || location.hash !== "#joueur" || !S.compte || S.compte.role !== "joueur" || S.compte.aLicence !== false) return;
    ditSansLicence = true;
    if (typeof toast === "function") toast("Ton numéro de licence n'est pas enregistré au club : l'espace joueur est réservé aux licenciés. Demande à ton coach ou au bureau.", true);
  };
  window.addEventListener("hashchange", () => setTimeout(direSansLicence, 300));
  setTimeout(direSansLicence, 2500);
  /* un champ avec son libellé (visible sur téléphone ; sur ordinateur, les colonnes ont leur en-tête) */
  const cellule = (texte, champ, cls) => {
    const l = document.createElement("label"); l.className = "ong-reg-cel" + (cls ? " " + cls : "");
    l.innerHTML = `<span class="ong-reg-cel-l">${e(texte)}</span>`;
    champ.replaceWith(l); l.appendChild(champ);
    return l;
  };
  const entete = cols => `<div class="ong-reg-entete" aria-hidden="true">${cols.map(c => `<span>${e(c)}</span>`).join("")}</div>`;
  const envelopper = (racine, cls) => {
    const w = document.createElement("div"); w.className = "ong-reg " + cls;
    w.append(...racine.childNodes); racine.appendChild(w);
    return w;
  };
  /* sous-parties d'un onglet : des cartes avec icône au lieu d'une deuxième rangée de pastilles */
  function cartesSections(barre, defs){
    barre.classList.add("ong-reg-sections");
    barre.querySelectorAll("button[data-k]").forEach(b => {
      const d = defs[b.dataset.k]; if (!d) return;
      b.classList.add("ong-reg-section");
      b.innerHTML = `<span class="ong-reg-section-ico" aria-hidden="true">${d[0]}</span><span class="ong-reg-section-txt"><b>${e(d[1])}</b><small>${e(d[2])}</small></span>`;
    });
  }

  /* =====================================================================================
     Le club
     ===================================================================================== */
  const tri = v => Array.isArray(v) ? v.map(tri) : (v && typeof v === "object") ? Object.keys(v).sort().reduce((o, k) => (o[k] = tri(v[k]), o), {}) : v;
  const empreinte = v => JSON.stringify(tri(v));
  /* ce qui est enregistré, avec le compte trouvé tout seul comme le fait l'application (pour savoir s'il reste des changements) */
  function clubEnregistre(){
    const c = clone(C()), comptes = S.comptes || [];
    const compteDe = l => l.compte || ((comptes.find(x => l.email && String(x.email || "").toLowerCase() === String(l.email).trim().toLowerCase())
      || comptes.find(x => l.nom && slug(x.nom || "") === slug(l.nom))) || {}).id || "";
    ["bureau", "referents"].forEach(k => (c[k] || []).forEach(l => { if (!l.compte){ const id = compteDe(l); if (id) l.compte = String(id); } }));
    return c;
  }
  const clubModifie = () => !!S.ui.club && empreinte(S.ui.club) !== empreinte(clubEnregistre());
  function majEtatClub(barre){
    barre = barre || document.querySelector("#panneau .ong-reg-save");
    if (!barre) return;
    const m = clubModifie();
    barre.classList.toggle("ong-reg-modifie", m);
    const t = barre.querySelector("[data-ong-reg-etat]");
    if (t) t.innerHTML = m ? `<i aria-hidden="true">●</i>Changements pas encore enregistrés` : `<i aria-hidden="true">✓</i>Tout est enregistré`;
  }

  const AIDE_CLUB = `<ol>
      <li>Choisis la partie à changer : coordonnées et horaires, équipes, bureau ou clubs ajoutés.</li>
      <li>Modifie ce que tu veux : c'est ce que les visiteurs voient sur le site (pages Équipes, Inscriptions, Contact).</li>
      <li>Touche <b>Enregistrer</b> dans la barre du bas. <b>Annuler</b> remet ce qui était enregistré.</li>
      <li>Les photos d'équipes et les clubs ajoutés s'enregistrent tout de suite, sans le bouton.</li></ol>`;

  /* horaires et cotisations : en-têtes de colonnes, libellés sur téléphone, bouton d'ajout en pointillés */
  const COLONNES = { horaires: ["Catégorie", "Jours", "Heures"], tarifs: ["Catégorie", "Montant"] };
  const AJOUTS = { horaires: "Ajouter un horaire", tarifs: "Ajouter une cotisation", bureau: "Ajouter un membre du bureau", referents: "Ajouter un référent" };
  const OU = { horaires: "Affichés sur la page Équipes du site.", tarifs: "Affichées sur la page Inscriptions du site." };
  function rangerTableau(carte){
    const ajout = carte.querySelector('[data-a="add-ligne-club"]'); if (!ajout) return;
    const cle = ajout.dataset.cle, cols = COLONNES[cle]; if (!cols) return;
    const lignes = [...carte.querySelectorAll(".club-ligne[data-liste]")];
    carte.classList.add("ong-reg-tab", "ong-reg-tab-" + cols.length);
    const h3 = carte.querySelector("h3");
    if (h3){
      h3.classList.add("ong-reg-h3");
      h3.insertAdjacentHTML("beforeend", `<span class="ong-nb">${lignes.length}</span>`);
      h3.insertAdjacentHTML("afterend", `<p class="ong-reg-hint">${OU[cle]}</p>`);
    }
    const zone = carte.querySelector(".club-lignes");
    if (zone) zone.insertAdjacentHTML("afterbegin", lignes.length ? entete([...cols, ""]) : `<p class="ong-reg-rien">Rien pour l'instant.</p>`);
    lignes.forEach(l => {
      [...l.querySelectorAll("input[data-champ]")].forEach(i => cellule(i.getAttribute("aria-label") || "", i));
      const x = l.querySelector(".club-x");
      if (x){ x.title = "Retirer cette ligne"; x.setAttribute("aria-label", "Retirer cette ligne"); }
    });
    ajout.className = "ong-reg-ajout"; ajout.textContent = "+ " + AJOUTS[cle];
    const btns = ajout.closest(".btns"); if (btns) btns.className = "ong-reg-ajout-zone";
  }

  /* équipes : libellés sur les champs, « Retirer l'équipe » en bas de la carte (plus de croix sur la photo) */
  function rangerEquipes(w){
    const intro = [...w.children].find(x => x.matches("p.quoi"));
    const n = w.querySelectorAll(".club-eq[data-liste]").length;
    if (intro) intro.replaceWith(el(`<div class="ong-reg-tete">${ONG.titre("Les équipes", n)}<p class="ong-reg-hint">Chaque équipe a sa carte sur la page Équipes du site. La photo y défile en haut : prends-la plutôt en largeur.</p></div>`));
    const LIB = { nom: "Nom de l'équipe", niveau: "Niveau", desc: "Petite description" };
    w.querySelectorAll(".club-eq[data-liste]").forEach(c => {
      c.classList.add("ong-reg-eq");
      const corps = c.querySelector(".club-eq-corps");
      [...corps.querySelectorAll("input[data-champ]")].forEach(i => cellule(LIB[i.dataset.champ] || i.getAttribute("aria-label") || "", i, "ong-reg-cel-vis"));
      const x = corps.querySelector(".club-x");
      if (x){
        x.className = "ong-reg-retirer"; x.textContent = "Retirer l'équipe";
        const pied = document.createElement("div"); pied.className = "ong-reg-eq-pied"; pied.appendChild(x); corps.appendChild(pied);
      }
      const photo = c.querySelector(".club-eq-photo"), bt = photo && photo.querySelector("label.club-eq-bt"), rp = photo && photo.querySelector(".club-eq-retirer");
      if (bt){
        [...bt.childNodes].forEach(n => { if (n.nodeType === 3) n.remove(); });
        bt.insertAdjacentHTML("afterbegin", `<span aria-hidden="true">📷</span><span>${rp ? "Changer la photo" : "Ajouter une photo"}</span>`);
      }
      if (rp){ rp.textContent = "Retirer la photo"; }
    });
    const ajout = w.querySelector(".club-eq-ajout");
    if (ajout) ajout.innerHTML = `<b aria-hidden="true">+</b>Ajouter une équipe`;
  }

  /* bureau et référents : une ligne par personne (poste, nom, e-mail, compte), en-têtes de colonnes */
  const LIB_PERSO = { role: "Poste", nom: "Nom", email: "E-mail", compte: "Compte qui reçoit ses messages" };
  function rangerBureau(w){
    const intro = [...w.children].find(x => x.matches("p.quoi"));
    if (intro) intro.replaceWith(el(`<p class="ong-reg-hint ong-reg-intro">Ils s'affichent sur la page Contact du site. Le compte choisi reçoit, dans son espace, les messages qu'on leur écrit.</p>`));
    w.querySelectorAll("h3.club-titre").forEach(h => {
      const zone = h.nextElementSibling; if (!zone || !zone.matches(".club-personnes")) return;
      const lignes = [...zone.querySelectorAll(".club-perso[data-liste]")];
      h.replaceWith(el(ONG.titre(e(h.textContent), lignes.length)));
      zone.classList.add("ong-reg-personnes");
      if (lignes.length) zone.insertAdjacentHTML("afterbegin", entete(["", LIB_PERSO.role, LIB_PERSO.nom, LIB_PERSO.email, LIB_PERSO.compte, ""]));
      else zone.insertAdjacentHTML("afterbegin", `<p class="ong-reg-rien">Personne pour l'instant.</p>`);
      lignes.forEach(p => {
        p.classList.add("ong-reg-perso");
        const ini = p.querySelector(".club-ini"), x = p.querySelector(".club-x");
        const champs = ["role", "nom", "email", "compte"].map(k => p.querySelector(`[data-champ="${k}"]`)).filter(Boolean);
        const cels = champs.map(c => cellule(LIB_PERSO[c.dataset.champ], c, "ong-reg-cel-" + c.dataset.champ));
        if (x){ x.title = "Retirer cette personne"; x.setAttribute("aria-label", "Retirer cette personne"); }
        p.textContent = "";
        p.append(...[ini, ...cels, x].filter(Boolean));
      });
      const ajout = zone.querySelector(".club-perso-ajout");
      if (ajout){ ajout.className = "ong-reg-ajout"; ajout.textContent = "+ " + (AJOUTS[ajout.dataset.cle] || "Ajouter"); }
    });
  }

  /* clubs ajoutés à la main : leur explication remplace celle du haut, « + Ajouter un club » à côté du titre */
  function aideClubs(racine){
    const astuce = racine.querySelector("details.acc-aide");
    const fff = astuce ? (astuce.querySelector("p") || {}).innerHTML || "" : "";
    if (astuce) astuce.remove();
    return ONG.aide("reg-clubs-aide", "Comment ça marche ?", `<ol>
        <li>Ici, les clubs tapés à la main dans les plateaux, les vétérans ou les tournois.</li>
        <li>Donne-leur un logo : touche le rond pour mettre une <b>image</b>, ou tape leur <b>numéro FFF</b> si le club est affilié.</li>
        <li>Le logo sert ensuite partout : listes, plateaux, tournois et affiches. Tout s'enregistre tout de suite.</li></ol>
      ${fff ? `<p class="ong-reg-astuce"><b>Où trouver le numéro FFF ?</b> ${fff}</p>` : ""}`);
  }
  function rangerClubs(w){
    const intro = [...w.children].find(x => x.matches("p.quoi"));
    const zone = w.querySelector(".club-personnes");
    const ajout = w.querySelector('[data-a="club-ajoute-nouveau"]');
    const n = zone ? zone.querySelectorAll(".club-perso:not(.club-perso-ajout)").length : 0;
    if (ajout){ ajout.className = "btn bleu"; ajout.textContent = "+ Ajouter un club"; ajout.remove(); }
    const tete = el(`<div class="ong-reg-tete ong-reg-tete-act"><div>${ONG.titre("Clubs ajoutés", n)}</div><div class="ong-reg-tete-bts"></div></div>`);
    if (ajout && n) tete.querySelector(".ong-reg-tete-bts").appendChild(ajout);
    const avant = intro || zone;
    if (avant) avant.before(tete);
    if (intro) intro.remove();
    if (zone){
      zone.classList.add("ong-reg-clubs");
      zone.querySelectorAll(".club-perso").forEach(c => {
        c.classList.add("ong-reg-club");
        const x = c.querySelector('[data-a="club-ajoute-suppr"]');
        if (x){ x.className = "ong-reg-retirer"; x.textContent = "Retirer"; }
      });
      if (!n){
        const vide = el(`<div>${ONG.vide("Aucun club ajouté", "Les clubs tapés à la main dans les plateaux, les vétérans ou les tournois apparaîtront ici. Tu peux aussi en ajouter un toi-même.", `<span data-ong-reg-ici></span>`)}</div>`).firstElementChild;
        const ici = vide.querySelector("[data-ong-reg-ici]");
        if (ajout) ici.replaceWith(ajout); else ici.remove();
        zone.replaceWith(vide);
      }
    }
  }

  if (typeof window.panClub === "function"){
    const avantClub = window.panClub;
    window.panClub = function(){
      const h = avantClub.apply(this, arguments);
      return ONG.transformer(h, racine => {
        const section = S.ui.clubSection || "infos", c = S.ui.club || C();
        const barreSections = racine.querySelector(".club-sections");
        if (barreSections){
          const nbClubs = (S.clubsAjoutes || []).length;
          cartesSections(barreSections, {
            infos: ["📇", "Coordonnées et horaires", "Contact · cotisations"],
            equipes: ["👕", "Équipes et photos", pl((c.equipes || []).length, "équipe")],
            bureau: ["👥", "Bureau et référents", pl((c.bureau || []).length + (c.referents || []).length, "personne")],
            clubs: ["🛡️", "Clubs ajoutés", nbClubs ? pl(nbClubs, "club") + " · logos" : "Logos des clubs adverses"],
          });
          barreSections.setAttribute("aria-label", "Partie du club à modifier");
          barreSections.insertAdjacentHTML("beforebegin", section === "clubs" ? aideClubs(racine) : ONG.aide("reg-club-aide", "Comment ça marche ?", AIDE_CLUB));
        }
        const w = envelopper(racine, "ong-reg-club ong-reg-club-" + section);
        if (section === "infos"){
          const coord = w.querySelector(".carte.club-carte");
          if (coord){ coord.classList.add("ong-reg-coord"); const g = coord.querySelector(".grille"); if (g) g.classList.add("ong-reg-grille2"); }
          w.querySelectorAll(".club-deux > .carte").forEach(rangerTableau);
        }
        if (section === "equipes") rangerEquipes(w);
        if (section === "bureau") rangerBureau(w);
        if (section === "clubs") rangerClubs(w);
        const barre = w.querySelector(".club-enregistrer");
        if (barre){
          barre.classList.add("ong-reg-save");
          barre.setAttribute("role", "region"); barre.setAttribute("aria-label", "Enregistrer les changements");
          const t = barre.querySelector(":scope > span");
          if (t) t.replaceWith(el(`<span class="ong-reg-etat" data-ong-reg-etat aria-live="polite"></span>`));
          const annuler = barre.querySelector('[data-a="reset-club"]');
          if (annuler){ annuler.title = "Remettre ce qui est enregistré"; annuler.classList.remove("petit"); }
          majEtatClub(barre);
        }
      });
    };
    // la barre du bas suit ce qu'on tape (sans redessiner l'onglet)
    const suivre = ev => {
      const t = ev.target;
      if (S.ui.onglet !== "club" || !t || !t.closest || !t.closest("#panneau .ong-reg-club")) return;
      if (t.matches("[data-club], [data-champ]")) majEtatClub();
    };
    document.addEventListener("input", suivre);
    document.addEventListener("change", suivre);
    document.addEventListener("click", ev => {
      const b = ev.target.closest && ev.target.closest('#panneau [data-a="save-club"]'); if (!b) return;
      [250, 800, 2000].forEach(ms => setTimeout(() => majEtatClub(), ms));       // l'enregistrement ne redessine pas l'onglet
    });
  }

  /* =====================================================================================
     Accès et rôles
     ===================================================================================== */
  const famille = c => { const r = roleAffiche(c); return /bureau/.test(r) ? "bureau" : /entraineur/.test(r) ? "coach" : "joueur"; };
  const compteDe = d => (S.comptes || []).find(x => String(x.id) === String(d.dataset.cpt));
  /* ce qu'on cherche, comme l'application (slug), mais rien quand il n'y a ni lettre ni chiffre */
  const motCherche = v => /[0-9a-z]/i.test(String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")) ? slug(v) : "";

  const AIDE_ACCES = `<ol>
      <li>Touche une personne pour ouvrir sa fiche.</li>
      <li>Change son rôle, son équipe ou sa fiche joueur, puis touche <b>Enregistrer</b> dans la fiche.</li>
      <li><b>Choisir les onglets et les équipes</b> : coche ce que la personne peut ouvrir et les équipes dont elle s'occupe.</li>
      <li><b>+ Nouveau coach ou dirigeant</b> crée un identifiant et un code provisoire. Ils ne s'affichent qu'une fois : imprime-les ou note-les.</li></ol>
    <p>Les joueurs ont leurs identifiants dans <b>Identifiants des joueurs</b>.</p>`;

  /* la fiche d'un compte : son profil (+ Enregistrer), ce qu'il peut ouvrir, puis le code et le compte, à part */
  function rangerCarte(d){
    const c = compteDe(d); if (!c) return;
    const f = famille(c), q = permsDe(c.id), gerees = (q && q.equipes) || (c.equipe ? [c.equipe] : []);
    const roleLib = (ROLES_COMBI.find(([k]) => k === roleAffiche(c)) || ["", roleAffiche(c)])[1];
    const vu = +c.doit_changer ? ["attente", "Code provisoire pas encore changé"]
      : c.derniere ? ["ok", "Vu le " + String(c.derniere).slice(0, 10).split("-").reverse().join("/")] : ["jamais", "Jamais connecté"];
    d.classList.add("ong-reg-cpt");
    const sum = d.querySelector("summary"), qui = sum && sum.querySelector(".cpt-qui"), vuEl = sum && sum.querySelector(".cpt-vu");
    if (qui) qui.innerHTML = `<b>${e(c.nom)}</b><small><span class="ong-reg-role ong-reg-role-${f}">${e(roleLib)}</span>${gerees.length ? `<span class="ong-reg-eqs">${e(gerees.join(", "))}</span>` : ""}</small>`;
    if (vuEl){ vuEl.className = "cpt-vu ong-reg-vu " + (+c.actif ? vu[0] : "off"); vuEl.textContent = +c.actif ? vu[1] : "Désactivé"; }

    const corps = d.querySelector(".cpt-corps"); if (!corps) return;
    const id = corps.querySelector(".cpt-id"), champs = corps.querySelector(".cpt-champs"), btAcces = corps.querySelector('[data-a="cpt-acces"]');
    const bt = k => corps.querySelector(`[data-a="${k}"]`);
    const enr = bt("cpt-enregistrer"), reinit = bt("cpt-reinit"), desac = bt("cpt-desactiver"), suppr = bt("cpt-supprimer");
    if (!champs || !enr) return;
    // numéro de licence (obligatoire pour un coach ou un dirigeant) ; proposé depuis les effectifs s'il y est
    const licC = licencePropre(c.licence), licE = licC ? "" : (licencePropre(c.licenceTrouvee) || licenceEffectifs(c.joueur_nom, c.nom));
    champs.appendChild(el(`<label>N° de licence<input data-cpt-champ="licence" inputmode="numeric" autocomplete="off" maxlength="16"
        placeholder="10 chiffres" value="${e(licC || licE)}"></label>`));
    const sansLic = c.role === "joueur" && (c.sansLicence === true || (c.sansLicence === undefined && !licC && !licE));
    // changer un rôle : seulement les comptes « Joueur, coach et bureau » (et l'administrateur)
    const selRole = champs.querySelector('[data-cpt-champ="role"]');
    if (selRole && S.ui.cptDonner === false){ selRole.disabled = true; selRole.title = "Seules les personnes qui ont tous les rôles (joueur, coach et bureau) peuvent changer un rôle."; }
    if (sansLic && sum) sum.querySelector(".cpt-qui small")?.insertAdjacentHTML("beforeend", `<span class="ong-reg-sanslic">⚠ Sans licence</span>`);
    // ce que le compte peut ouvrir, en clair
    const dispo = ONGLETS.filter(o => c.role === "bureau" ? true : o[2] === "entraineur");
    const ch = q && Array.isArray(q.onglets) ? q.onglets : [];
    let onglets;
    if (f === "joueur") onglets = "L'espace joueur seulement (pas l'espace club)";
    else if (!ch.length) onglets = `Tous les onglets de son rôle (${dispo.length})`;
    else {
      const noms = dispo.filter(o => ch.includes(o[0])).map(o => nomOnglet(o[0]));
      onglets = noms.length <= 1 ? "Seulement le tableau de bord" : `${noms.length} sur ${dispo.length} : ${noms.join(", ")}`;
    }
    const profil = el(`<section class="ong-reg-bloc"><h4>Son profil</h4></section>`);
    if (id){ id.innerHTML = `Identifiant de connexion : <b>${e(c.email)}</b>`; profil.appendChild(id); }
    profil.appendChild(champs);
    if (sansLic) profil.appendChild(el(`<p class="ong-reg-lic-note alerte">⚠ Sans numéro de licence, il ne peut pas entrer dans l'espace joueur : indique son numéro puis touche <b>Enregistrer</b>.</p>`));
    else if (licE) profil.appendChild(el(`<p class="ong-reg-lic-note">Numéro de licence trouvé dans les effectifs. Touche <b>Enregistrer</b> pour le garder dans son compte.</p>`));
    if (selRole && selRole.disabled) profil.appendChild(el(`<p class="ong-reg-lic-note">🔒 Seules les personnes qui ont tous les rôles (joueur, coach et bureau) peuvent changer son rôle ou lui donner l'accès dirigeant.</p>`));
    const p1 = el(`<div class="ong-reg-bloc-pied"></div>`); enr.classList.remove("petit"); p1.appendChild(enr); profil.appendChild(p1);
    const droits = el(`<section class="ong-reg-bloc"><h4>Ce qu'il peut ouvrir</h4>
        <dl class="ong-reg-droits"><div><dt>Onglets</dt><dd>${e(onglets)}</dd></div><div><dt>Équipes gérées</dt><dd>${gerees.length ? e(gerees.join(", ")) : "Aucune"}</dd></div></dl></section>`);
    if (btAcces){
      btAcces.className = "btn contour ong-reg-bt-acces"; btAcces.innerHTML = `<span aria-hidden="true">🔐</span> Choisir les onglets et les équipes`;
      const p2 = el(`<div class="ong-reg-bloc-pied"></div>`); p2.appendChild(btAcces); droits.appendChild(p2);
    }
    const sensible = el(`<div class="ong-reg-sensible"><div class="ong-reg-sensible-g"><span class="ong-reg-sensible-t">Code et compte</span></div><div class="ong-reg-sensible-d"></div></div>`);
    if (reinit){ reinit.innerHTML = `<span aria-hidden="true">🔑</span> Nouveau code provisoire`; sensible.querySelector(".ong-reg-sensible-g").appendChild(reinit); }
    if (desac) sensible.querySelector(".ong-reg-sensible-d").appendChild(desac);
    if (suppr) sensible.querySelector(".ong-reg-sensible-d").appendChild(suppr);
    corps.textContent = "";
    corps.classList.add("ong-reg-fiche");
    const grille = el(`<div class="ong-reg-fiche-g"></div>`); grille.append(profil, droits);
    corps.append(grille, sensible);
  }

  /* recherche : on cache aussi les familles vides et on le dit quand rien ne correspond */
  function majRecherche(racine){
    racine = racine || document.querySelector("#panneau .ong-reg-acces");
    if (!racine) return;
    const liste = racine.querySelector(".acc-liste"); if (!liste) return;
    let total = 0;
    const familles = [...liste.querySelectorAll(".ong-reg-fam")];
    familles.forEach(g => {
      const n = [...g.querySelectorAll(".cpt-carte")].filter(c => !c.hidden).length; total += n;
      g.hidden = !n; const nb = g.querySelector(".ong-nb"); if (nb) nb.textContent = n;
    });
    if (!familles.length) total = [...liste.querySelectorAll(".cpt-carte")].filter(c => !c.hidden).length;
    const q = motCherche(S.ui.cptCherche) ? String(S.ui.cptCherche).trim() : "";
    let rien = liste.querySelector(".ong-reg-rien-cherche");
    if (!total && q && liste.querySelector(".cpt-carte")){
      if (!rien){ rien = document.createElement("div"); rien.className = "ong-reg-rien-cherche"; liste.appendChild(rien); }
      rien.innerHTML = ONG.vide("Aucun compte trouvé", `Rien ne correspond à « ${e(q)} » ici. Vérifie l'orthographe, ou choisis le filtre « Tous ».`, "");
    } else if (rien) rien.remove();
  }

  function rangerComptes(w){
    const barre = w.querySelector(".acc-barre");
    if (barre){
      barre.classList.add("ong-reg-outils");
      const ch = barre.querySelector("[data-cpt-cherche]");
      if (ch){
        ch.setAttribute("aria-label", "Rechercher un compte"); ch.setAttribute("placeholder", "Chercher : nom, identifiant, équipe");
        const l = document.createElement("label"); l.className = "ong-reg-cherche";
        ch.replaceWith(l); l.insertAdjacentHTML("afterbegin", `<span aria-hidden="true">🔍</span>`); l.appendChild(ch);
      }
      const nouv = barre.querySelector('[data-a="cpt-nouveau"]');
      // créer un coach ou un dirigeant : seulement les comptes « Joueur, coach et bureau » (et l'administrateur)
      if (nouv && S.ui.cptDonner === false){ nouv.remove(); const n = w.querySelector(".acc-nouveau"); if (n) n.remove(); }
      if (nouv && S.ui.cptNouveau){ nouv.className = "btn contour"; nouv.textContent = "✕ Fermer le formulaire"; }
    }
    const nouveau = w.querySelector(".acc-nouveau");
    if (nouveau){
      nouveau.classList.add("ong-reg-nouveau");
      const p = nouveau.querySelector("p.quoi"), form = nouveau.querySelector("form");
      if (p && form){ p.className = "ong-reg-hint"; p.textContent = "Un identifiant et un code provisoire sont créés. Ils ne s'affichent qu'une fois, en haut de la page : imprime-les ou note-les."; form.before(p); }
    }
    const chips = w.querySelector(".acc-chips"), actu = w.querySelector('[data-a="cpt-actualiser"]');
    if (chips){
      chips.setAttribute("role", "group"); chips.setAttribute("aria-label", "Filtrer les comptes");
      const ligne = el(`<div class="ong-reg-filtres"></div>`); chips.replaceWith(ligne); ligne.appendChild(chips);
      if (actu){ const vieux = actu.closest(".btns"); actu.className = "btn contour petit ong-reg-actu"; actu.textContent = "↻ Actualiser"; actu.title = "Recharger la liste des comptes"; ligne.appendChild(actu); if (vieux && !vieux.children.length) vieux.remove(); }
    }
    const liste = w.querySelector(".acc-liste"); if (!liste) return;
    const cartes = [...liste.querySelectorAll(".cpt-carte")];
    if (!cartes.length){
      const p = liste.querySelector("p.quoi");
      if (p) p.replaceWith(el(`<div>${ONG.vide("Aucun compte ici", "Choisis un autre filtre, ou crée un compte avec « + Nouveau coach ou dirigeant ».", "")}</div>`).firstElementChild);
      return;
    }
    const q = motCherche(S.ui.cptCherche);
    cartes.forEach(d => {
      rangerCarte(d);
      if (q) d.hidden = !String(d.dataset.cherche || "").includes(q);               // la recherche tapée reste appliquée après un nouvel affichage
      if (S.ui.ongRegCpt != null && String(S.ui.ongRegCpt) === d.dataset.cpt && !d.hidden) d.setAttribute("open", "");
    });
    const filtre = S.ui.cptFiltre || "tous";
    if (filtre === "tous"){
      [["bureau", "Bureau"], ["coach", "Coachs"], ["joueur", "Joueurs"]].forEach(([f, lib]) => {
        const l = cartes.filter(d => { const c = compteDe(d); return c && famille(c) === f; });
        if (!l.length) return;
        const g = document.createElement("section"); g.className = "ong-reg-fam"; g.dataset.ongFam = f;
        g.innerHTML = ONG.titre(lib, l.length);
        g.append(...l); liste.appendChild(g);
      });
    } else if (filtre === "inactif") liste.insertAdjacentHTML("afterbegin", `<p class="ong-reg-hint">Ces comptes ne peuvent plus se connecter. Ouvre une fiche et touche <b>Enregistrer</b> pour réactiver le compte.</p>`);
    majRecherche(w);
  }

  function rangerIdentifiants(w){
    const barre = w.querySelector(".acc-barre");
    if (barre){
      barre.classList.add("ong-reg-outils");
      const sel = barre.querySelector("[data-cpt-eq]"); if (sel) sel.setAttribute("aria-label", "Choisir l'équipe");
      const csv = barre.querySelector('[data-a="cpt-liste-csv"]'); if (csv) csv.textContent = "Télécharger (CSV)";
      const ids = w.querySelector(".acc-ids");
      const n = ids ? ids.querySelectorAll(".acc-id").length : 0;
      barre.before(el(ONG.titre("Identifiants", n)));
    }
    const vide = w.querySelector(".acc-ids > p.quoi");
    if (vide) vide.replaceWith(el(`<div class="ong-reg-ids-vide">${ONG.vide("Aucun identifiant", "Les identifiants des joueurs viennent des effectifs : dépose le fichier Footclubs dans Effectifs.", "")}</div>`));
    const codes = w.querySelector(".acc-code"); if (codes) codes.classList.add("ong-reg-code");
  }

  if (typeof window.panComptes === "function"){
    const avantComptes = window.panComptes;
    window.panComptes = function(){
      const h = avantComptes.apply(this, arguments);
      return ONG.transformer(h, racine => {
        sansEcoleTout(racine);
        const sections = racine.querySelector(".club-sections");
        if (!sections){ envelopper(racine, "ong-reg-acces ong-reg-charge"); return; }      // chargement
        const section = S.ui.accesSection || "comptes";
        const actifs = (S.comptes || []).filter(c => +c.actif).length;
        cartesSections(sections, {
          comptes: ["👥", `Comptes (${actifs})`, "Rôles et droits de chacun"],
          identifiants: ["🪪", "Identifiants des joueurs", "Code commun, fiches à imprimer"],
        });
        sections.setAttribute("aria-label", "Partie à afficher");
        // l'explication, repliée, en haut de l'onglet (juste au-dessus du choix de la partie, comme dans Le club)
        let aide;
        if (section === "comptes") aide = ONG.aide("reg-acces-aide", "Comment ça marche ?", AIDE_ACCES);
        else {
          const det = racine.querySelector("details.acc-aide"), p = det && det.querySelector("p");
          aide = p ? ONG.aide("reg-ident-aide", "Comment un joueur se connecte la première fois ?", `<p>${p.innerHTML}</p>`) : "";
          if (det) det.remove();
        }
        if (aide) sections.insertAdjacentHTML("beforebegin", aide);        // en premier, comme dans tous les onglets
        const codes = racine.querySelector(".acc-codes");
        if (codes){ codes.classList.add("ong-reg-codes"); const t = codes.querySelector("h2"); if (t) t.insertAdjacentHTML("afterbegin", `<span aria-hidden="true">✅</span>`); }
        const w = envelopper(racine, "ong-reg-acces ong-reg-acces-" + section);
        if (section === "comptes") rangerComptes(w); else rangerIdentifiants(w);
      });
    };
    // la fiche ouverte reste ouverte quand la liste se redessine (après Enregistrer, après la fenêtre des accès…)
    document.addEventListener("toggle", ev => {
      const d = ev.target; if (!d || !d.matches || !d.matches("#panneau details.cpt-carte")) return;
      if (d.open) S.ui.ongRegCpt = d.dataset.cpt;
      else if (String(S.ui.ongRegCpt) === d.dataset.cpt) S.ui.ongRegCpt = null;
    }, true);
    // après le filtre de l'application : une recherche vidée (ou sans lettre ni chiffre) remontre tout le monde
    // (l'application cherchait alors « x », ce qui cachait presque tous les comptes)
    document.addEventListener("input", ev => {
      const t = ev.target; if (!t || !t.matches || !t.matches("#panneau [data-cpt-cherche]")) return;
      const q = motCherche(t.value);
      document.querySelectorAll("#panneau .acc-liste .cpt-carte").forEach(c => { c.hidden = !!q && !String(c.dataset.cherche || "").includes(q); });
      majRecherche();
    });
  }

  /* fenêtre « Accès de … » : les onglets rangés par rubrique, comme dans le menu */
  if (typeof window.modaleAccesHtml === "function" && typeof RUBRIQUES !== "undefined"){
    const avantModale = window.modaleAccesHtml;
    window.modaleAccesHtml = function(){
      const h = avantModale.apply(this, arguments);
      if (!h) return h;
      return ONG.transformer(h, racine => {
        const m = racine.querySelector(".modale"); if (!m) return;
        m.classList.add("ong-reg-modale");
        sansEcoleTout(m);
        const corps = m.querySelector(".modale-corps"); if (!corps) return;
        const labels = [...corps.querySelectorAll("label.sw-ligne")];
        const titre = [...corps.children].find(x => x.matches("b.acces-titre"));
        if (!labels.length || !titre) return;
        const perm = l => (l.querySelector("input[data-perm]") || { dataset: {} }).dataset.perm;
        const zone = document.createElement("div"); zone.className = "ong-reg-mzone";
        const pris = new Set();
        RUBRIQUES.forEach(r => {
          const l = labels.filter(x => r[3].includes(perm(x))); if (!l.length) return;
          l.forEach(x => pris.add(x));
          const g = el(`<div class="ong-reg-mgroupe" role="group" aria-label="${e(r[1])}"><div class="ong-reg-mgroupe-t"><span aria-hidden="true">${r[2]}</span>${e(r[1])}</div></div>`);
          g.append(...l); zone.appendChild(g);
        });
        const autres = labels.filter(x => !pris.has(x));
        if (autres.length){ const g = el(`<div class="ong-reg-mgroupe"><div class="ong-reg-mgroupe-t">Autres</div></div>`); g.append(...autres); zone.appendChild(g); }
        titre.after(el(`<p class="quoi ong-reg-mhint">Le tableau de bord reste toujours ouvert. Chaque case s'enregistre tout de suite.</p>`), zone);
      });
    };
  }

  /* =====================================================================================
     Sauvegardes
     ===================================================================================== */
  if (typeof window.panSauvegardes === "function"){
    const avantSv = window.panSauvegardes;
    const taille = o => o > 1048576 ? (o / 1048576).toFixed(1).replace(".", ",") + " Mo" : Math.max(1, Math.round(o / 1024)) + " Ko";
    const jour = d => new Date(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    const heure = d => new Date(d).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
    const debut = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const quand = d => { const j = Math.round((debut(Date.now()) - debut(d)) / 864e5); return j <= 0 ? "aujourd'hui" : j === 1 ? "hier" : `il y a ${j} jours`; };
    const AIDE_SV = `<ol>
        <li>Chaque semaine, la nuit, le serveur copie toutes les données du club : matchs, compos, effectifs, stages, messages, réglages…</li>
        <li>Les 8 dernières copies sont gardées, dans un dossier fermé au public.</li>
        <li>Avant un gros changement, touche <b>« Sauvegarder maintenant »</b>.</li>
        <li>En cas de problème, on peut tout remettre à partir d'une copie. <b>Télécharger</b> te donne le fichier, à garder en lieu sûr.</li></ol>
      <p>Les comptes et mots de passe ne sont pas dans ces copies : ils restent dans leur propre table, protégée.</p>`;
    window.panSauvegardes = function(){
      const h = avantSv.apply(this, arguments);                         // lance le chargement si besoin
      if (!S.ui.sauvegardes) return `<div class="ong-reg ong-reg-sv ong-reg-charge">${h}</div>`;
      const l = S.ui.sauvegardes.liste || [], der = l[0];
      const bouton = `<button class="btn bleu" data-a="sv-maintenant">💾 Sauvegarder maintenant</button>`;
      const vieux = der && (Date.now() - new Date(der.date).getTime()) > 8 * 864e5;
      const etat = der
        ? `<div class="ong-reg-sv-etat ${vieux ? "vieux" : "ok"}"><span class="ong-reg-sv-ico" aria-hidden="true">${vieux ? "⚠️" : "✅"}</span>
            <div class="ong-reg-sv-txt"><b>Dernière sauvegarde : ${e(quand(der.date))}</b>
              <small>${e(jour(der.date))} à ${e(heure(der.date))} · ${e(taille(der.taille))}</small>
              ${vieux ? `<small class="ong-reg-alerte">Elle date de plus d'une semaine : fais-en une maintenant.</small>` : ""}</div>${bouton}</div>`
        : `<div class="ong-reg-sv-etat aucune"><span class="ong-reg-sv-ico" aria-hidden="true">🗂️</span>
            <div class="ong-reg-sv-txt"><b>Pas encore de sauvegarde</b><small>La première se fera cette nuit, ou tout de suite avec le bouton.</small></div>${bouton}</div>`;
      const liste = l.length
        ? `<div class="sv-liste ong-reg-sv-liste">${l.map((x, i) => `<div class="sv${i ? "" : " ong-reg-sv-recente"}">
            <span class="sv-ico" aria-hidden="true">${i ? "🗂️" : "✅"}</span>
            <div class="sv-txt"><b>${e(jour(x.date))}</b><small>${e(heure(x.date))} · ${e(taille(x.taille))}</small></div>
            ${i ? "" : `<span class="ong-reg-puce ok">La plus récente</span>`}
            <a class="btn contour petit" href="/api/sauvegarde.php?fichier=${encodeURIComponent(x.nom)}">⬇️ Télécharger</a></div>`).join("")}</div>`
        : ONG.vide("Aucune copie pour l'instant", "Elles apparaîtront ici, la plus récente en haut.", "");
      return `<div class="ong-reg ong-reg-sv">${ONG.aide("reg-sv-aide", "Comment ça marche ?", AIDE_SV)}
        ${etat}
        ${ONG.titre("Copies gardées", l.length)}
        ${liste}</div>`;
    };
  }

  /* =====================================================================================
     Styles (rangés sous #panneau .ong-reg ; la fenêtre des accès sous .modale.ong-reg-modale)
     ===================================================================================== */
  const P = "body.sur-espace #panneau .ong-reg";
  const css = document.createElement("style");
  css.id = "onglets-reglages-css";
  css.textContent = `
/* ---- parties d'un onglet : cartes avec icône ---- */
${P} .ong-reg-sections{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;padding:0;margin:0 0 20px;background:none;border:0;border-radius:0;width:auto;max-width:none}
${P}.ong-reg-acces .ong-reg-sections{grid-template-columns:repeat(2,minmax(0,1fr));max-width:760px}
${P} .ong-reg-sections .ong-reg-section{display:flex;align-items:center;gap:12px;text-align:left;min-height:68px;padding:12px 14px;border-radius:16px;
  border:1px solid rgba(143,168,240,.22);background:linear-gradient(180deg,rgba(26,44,96,.5),rgba(14,26,60,.5));color:#EEF2FC;cursor:pointer;transition:border-color .15s,background .15s}
${P} .ong-reg-sections .ong-reg-section:hover{border-color:rgba(143,168,240,.55)}
${P} .ong-reg-sections .ong-reg-section[aria-selected="true"]{border-color:#2F6BFF;background:linear-gradient(180deg,rgba(47,107,255,.34),rgba(28,79,214,.2));box-shadow:inset 0 0 0 1px #2F6BFF,0 10px 22px rgba(47,107,255,.18);color:#fff}
${P} .ong-reg-section-ico{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:22px;background:rgba(143,168,240,.13)}
${P} .ong-reg-section[aria-selected="true"] .ong-reg-section-ico{background:rgba(255,255,255,.16)}
${P} .ong-reg-section-txt{display:grid;gap:2px;min-width:0}
${P} .ong-reg-section-txt b{font:800 16px var(--corps);line-height:1.2}
${P} .ong-reg-section-txt small{font:600 13px var(--corps);color:#AFC0EA;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${P} .ong-reg-section[aria-selected="true"] .ong-reg-section-txt small{color:#DCE5FF}
/* ---- petits textes ---- */
${P} .ong-reg-hint{margin:-4px 0 12px;color:#AFC0EA;font-size:14.5px;line-height:1.5}
${P} .ong-reg-intro{margin:0 0 4px}
${P} .ong-reg-rien{margin:0;color:#AFC0EA;font-style:italic}
${P} .ong-reg-h3{display:flex;align-items:center;gap:10px}
${P} .ong-reg-tete .ong-titre{margin-top:6px}
${P} .ong-reg-tete-act{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:6px 0 12px}
${P} .ong-reg-tete-act .ong-titre{margin:0}
${P} .ong-reg-astuce{margin:10px 0 0}
/* ---- Le club › coordonnées ---- */
${P} .ong-reg-coord .ong-reg-grille2{grid-template-columns:repeat(2,minmax(0,1fr))}
${P} .club-deux{align-items:start;gap:18px}
${P} .club-deux>.carte{margin:0}
/* ---- tableaux (horaires, cotisations) ---- */
${P} .ong-reg-tab .club-lignes{gap:8px;margin-bottom:12px}
${P} .ong-reg-tab .ong-reg-entete,${P} .ong-reg-tab .club-ligne{display:grid;gap:8px;align-items:center}
${P} .ong-reg-tab-3 .ong-reg-entete,${P} .ong-reg-tab-3 .club-ligne{grid-template-columns:minmax(0,1.1fr) minmax(0,1.3fr) minmax(0,1fr) 44px}
${P} .ong-reg-tab-2 .ong-reg-entete,${P} .ong-reg-tab-2 .club-ligne{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) 44px}
${P} .ong-reg-entete span{font:800 12px var(--corps);letter-spacing:.08em;text-transform:uppercase;color:#AFC0EA;padding:0 2px}
${P} .ong-reg-cel{display:block;min-width:0;margin:0}
${P} .ong-reg-cel input,${P} .ong-reg-cel select{width:100%;min-width:0}
${P} .ong-reg-cel .ong-reg-cel-l{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
${P} .ong-reg-cel.ong-reg-cel-vis{display:grid;gap:6px}
${P} .ong-reg-cel.ong-reg-cel-vis .ong-reg-cel-l{position:static;width:auto;height:auto;clip:auto;overflow:visible}
${P} .club-x{width:44px;height:44px;border-radius:12px;border:1px solid rgba(248,113,113,.35);background:rgba(220,38,38,.06);color:#FCA5A5;font-size:22px;display:grid;place-items:center}
${P} .club-x:hover{border-color:#F87171;background:rgba(220,38,38,.18);color:#fff}
${P} .ong-reg-ajout{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;min-height:48px;border-radius:13px;border:1.5px dashed rgba(143,168,240,.4);
  background:rgba(143,168,240,.05);color:#DCE5FF;font:800 15px var(--corps);cursor:pointer;padding:8px 14px}
${P} .ong-reg-ajout:hover{border-color:#8FA8F0;background:rgba(143,168,240,.12);color:#fff}
${P} .ong-reg-ajout-zone{margin:0}
/* ---- équipes ---- */
${P} .club-equipes{grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px}
${P} .ong-reg-eq .club-eq-corps{gap:10px;padding:14px}
${P} .ong-reg-eq .club-eq-corps input{height:44px!important;min-height:44px}
${P} .ong-reg-eq .club-eq-bt{width:auto;height:38px;border-radius:999px;padding:0 12px;display:inline-flex;gap:6px;align-items:center;font:700 13px var(--corps);right:10px;bottom:10px}
${P} .ong-reg-eq .club-eq-photo .club-eq-bt span{font:700 13px var(--corps);letter-spacing:0;text-transform:none;color:#fff}
${P} .ong-reg-eq .club-eq-bt{text-transform:none;letter-spacing:0;color:#fff;white-space:nowrap}
${P} .ong-reg-eq .club-eq-retirer{right:auto;left:10px;width:auto;height:38px;border-radius:999px;padding:0 12px;font:700 13px var(--corps);color:#FECACA}
${P} .ong-reg-eq-pied{display:flex;justify-content:flex-end;padding-top:4px;border-top:1px solid rgba(143,168,240,.14)}
${P} .ong-reg-retirer{min-height:40px;padding:6px 14px;border-radius:11px;border:1px solid rgba(248,113,113,.5);background:rgba(220,38,38,.06);color:#FCA5A5;font:700 14px var(--corps);cursor:pointer}
${P} .ong-reg-retirer:hover{background:rgba(220,38,38,.2);color:#fff}
${P} .club-eq-ajout{min-height:250px;border-radius:16px}
/* ---- bureau et référents : une ligne par personne ---- */
${P} .ong-reg-personnes{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;margin-bottom:8px}
${P} .ong-reg-personnes .ong-reg-entete,${P} .ong-reg-perso{display:grid;grid-template-columns:44px minmax(0,1.15fr) minmax(0,1fr) minmax(0,1.3fr) minmax(0,1.05fr) 44px;gap:10px;align-items:center}
${P} .ong-reg-personnes .ong-reg-entete{padding:0 15px}
${P} .ong-reg-perso{padding:10px 14px;border-radius:16px}
${P} .ong-reg-perso .ong-reg-cel-role input{font-weight:800}
${P} .ong-reg-personnes .ong-reg-ajout{margin-top:2px}
/* ---- clubs ajoutés ---- */
${P} .ong-reg-clubs{grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
${P} .ong-reg-club .club-perso-tete{gap:12px}
${P} .ong-reg-club .ca-nom{flex:1;min-width:0}
/* ---- barre Annuler / Enregistrer ---- */
${P} .ong-reg-save{position:static;margin-top:24px;padding:12px 14px 12px 18px;border-radius:18px;border:1px solid rgba(143,168,240,.25);background:rgba(13,26,64,.94);box-shadow:none}
${P} .ong-reg-save.ong-reg-modifie{position:sticky;bottom:14px;z-index:8;border-color:rgba(227,182,76,.65);box-shadow:0 16px 36px rgba(0,0,0,.5)}
${P} .ong-reg-save .btns{margin:0;flex-wrap:nowrap}
${P} .ong-reg-save .btn.bleu{min-width:170px}
${P} .ong-reg-etat{display:flex;align-items:center;gap:8px;font:700 15px var(--corps);color:#86EFAC}
${P} .ong-reg-etat i{font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;background:rgba(34,197,94,.16)}
${P} .ong-reg-modifie .ong-reg-etat{color:#F7D774}
${P} .ong-reg-modifie .ong-reg-etat i{background:rgba(227,182,76,.2);color:#F7D774}

/* ---- Accès et rôles ---- */
${P} .ong-reg-outils{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
${P} .ong-reg-cherche{position:relative;flex:1;min-width:240px;display:block;margin:0}
${P} .ong-reg-cherche>span{position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;opacity:.75;pointer-events:none}
${P} .ong-reg-cherche input{width:100%;padding-left:42px!important}
${P} .ong-reg-outils>.btn{min-height:48px}
${P} .ong-reg-nouveau{border-color:rgba(47,107,255,.55);margin-bottom:14px}
${P} .ong-reg-nouveau h3{font:800 20px var(--display);margin:0 0 6px}
${P} .ong-reg-nouveau .ong-reg-hint{margin:0 0 14px}
${P} .ong-reg-filtres{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 6px}
${P} .ong-reg-filtres .acc-chips{margin:0}
${P} .acc-chip{min-height:40px;padding:7px 15px}
${P} .ong-reg-fam .ong-titre{margin:20px 0 10px}
${P} .acc-liste{gap:0;margin-bottom:14px}
${P} .acc-liste>.ong-reg-hint{margin:12px 0}
${P} .acc-liste .cpt-carte{margin-bottom:8px;border-radius:16px;background:linear-gradient(180deg,rgba(26,44,96,.45),rgba(14,26,60,.45));border:1px solid rgba(143,168,240,.18)}
${P} .acc-liste .cpt-carte[open]{border-color:rgba(47,107,255,.6);box-shadow:0 12px 28px rgba(3,8,24,.35)}
${P} .cpt-carte summary{min-height:64px;padding:10px 16px;gap:14px}
${P} .cpt-carte summary:hover{background:rgba(143,168,240,.06)}
${P} .cpt-qui{gap:4px}
${P} .cpt-qui small{display:flex;align-items:center;gap:8px;flex-wrap:wrap;white-space:normal}
${P} .ong-reg-role{font:800 12px var(--corps);padding:3px 10px;border-radius:999px;background:rgba(143,168,240,.16);color:#DCE5FF}
${P} .ong-reg-role-bureau{background:rgba(227,182,76,.18);color:#F7D774}
${P} .ong-reg-role-coach{background:rgba(47,107,255,.22);color:#BFD0FF}
${P} .ong-reg-role-joueur{background:rgba(34,197,94,.16);color:#86EFAC}
${P} .ong-reg-eqs{color:#AFC0EA;font-size:13.5px}
${P} .ong-reg-vu{font:700 12.5px var(--corps);padding:4px 11px;border-radius:999px;background:rgba(143,168,240,.1);color:#AFC0EA;white-space:nowrap}
${P} .ong-reg-vu.ok{background:rgba(34,197,94,.1);color:#86EFAC}
${P} .ong-reg-vu.attente{background:rgba(227,182,76,.16);color:#F7D774}
${P} .ong-reg-vu.off{background:rgba(220,38,38,.14);color:#FCA5A5}
${P} .ong-reg-fiche{padding:16px;gap:14px}
${P} .ong-reg-fiche-g{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:14px}
${P} .ong-reg-bloc{display:grid;gap:12px;align-content:start;padding:14px 16px;border-radius:14px;background:rgba(5,11,31,.35);border:1px solid rgba(143,168,240,.14)}
${P} .ong-reg-bloc h4{margin:0;font:800 13px var(--corps);letter-spacing:.1em;text-transform:uppercase;color:#AFC0EA}
${P} .ong-reg-bloc .cpt-id{font-size:15px}
${P} .ong-reg-bloc .cpt-id b{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:15.5px;color:#fff;background:rgba(143,168,240,.14);padding:2px 8px;border-radius:7px}
${P} .ong-reg-bloc .cpt-champs{grid-template-columns:repeat(2,minmax(0,1fr))}
${P} .ong-reg-sanslic{display:inline-block;margin-left:6px;padding:1px 8px;border-radius:999px;background:rgba(245,158,11,.18);color:#FBBF24;font-weight:800;font-size:12px}
${P} .ong-reg-lic-note{margin:0;padding:10px 12px;border-radius:12px;background:rgba(47,107,255,.12);color:#C9D4F2;font-size:14px;line-height:1.45}
${P} .ong-reg-lic-note.alerte{background:rgba(245,158,11,.14);color:#FDE68A;border:1px solid rgba(245,158,11,.35)}
:root[data-theme="light"] ${P} .ong-reg-lic-note{color:var(--texte)}
:root[data-theme="light"] ${P} .ong-reg-lic-note.alerte{color:#92400E}
:root[data-theme="light"] ${P} .ong-reg-sanslic{color:#B45309}
${P} .ong-reg-bloc-pied{display:flex;gap:10px;flex-wrap:wrap}
${P} .ong-reg-bloc-pied .btn.bleu{min-width:160px}
${P} .ong-reg-droits{margin:0;display:grid;gap:10px}
${P} .ong-reg-droits div{display:grid;gap:2px}
${P} .ong-reg-droits dt{font:700 12px var(--corps);letter-spacing:.06em;text-transform:uppercase;color:#AFC0EA}
${P} .ong-reg-droits dd{margin:0;font-size:15px;line-height:1.45;color:#EEF2FC}
${P} .ong-reg-sensible{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding-top:12px;border-top:1px solid rgba(143,168,240,.16)}
${P} .ong-reg-sensible-g,${P} .ong-reg-sensible-d{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
${P} .ong-reg-sensible-t{font:700 12px var(--corps);letter-spacing:.08em;text-transform:uppercase;color:#AFC0EA;margin-right:4px}
${P} .ong-reg-codes{border-color:#22C55E;background:linear-gradient(180deg,rgba(22,101,52,.32),rgba(14,26,60,.55))}
${P} .ong-reg-codes h2{display:flex;align-items:center;gap:10px}
${P}.ong-reg-charge .quoi{padding:26px;text-align:center;border:1.5px dashed rgba(143,168,240,.3);border-radius:18px}
${P} .acc-stats{gap:12px}
${P} .acc-stats>div{border-radius:16px;padding:14px 16px;background:linear-gradient(180deg,rgba(26,44,96,.5),rgba(14,26,60,.5));border-color:rgba(143,168,240,.2)}
${P} .acc-stats .ong-reg-code{border-color:#E3B64C}
${P} .acc-id{border-radius:14px;padding:10px 12px;background:linear-gradient(180deg,rgba(26,44,96,.45),rgba(14,26,60,.45));border-color:rgba(143,168,240,.18)}
${P}.ong-reg-acces-identifiants .ong-reg-outils .btns{margin:0}
${P}.ong-reg-acces-identifiants .acc-select{min-width:240px}

/* ---- Sauvegardes ---- */
${P} .ong-reg-sv-etat{display:flex;align-items:center;gap:16px;flex-wrap:wrap;padding:18px 20px;margin:0 0 16px;border-radius:20px;border:1px solid rgba(34,197,94,.45);
  background:linear-gradient(180deg,rgba(22,101,52,.3),rgba(14,26,60,.55))}
${P} .ong-reg-sv-etat.vieux{border-color:rgba(227,182,76,.6);background:linear-gradient(180deg,rgba(161,98,7,.28),rgba(14,26,60,.55))}
${P} .ong-reg-sv-etat.aucune{border-color:rgba(143,168,240,.3);background:linear-gradient(180deg,rgba(26,44,96,.5),rgba(14,26,60,.5))}
${P} .ong-reg-sv-ico{flex:none;width:52px;height:52px;border-radius:16px;display:grid;place-items:center;font-size:26px;background:rgba(255,255,255,.08)}
${P} .ong-reg-sv-txt{flex:1;min-width:220px;display:grid;gap:3px}
${P} .ong-reg-sv-txt b{font:800 21px var(--display);letter-spacing:.2px}
${P} .ong-reg-sv-txt small{color:#C9D4F2;font-size:15px}
${P} .ong-reg-sv-txt small::first-letter{text-transform:uppercase}
${P} .ong-reg-sv-txt .ong-reg-alerte{color:#F7D774;font-weight:700}
${P} .ong-reg-sv-etat .btn{min-width:240px;min-height:52px;font-size:16.5px}
${P} .ong-reg-sv-liste{margin-top:0;gap:8px}
${P} .ong-reg-sv-liste .sv{min-height:64px;padding:10px 14px 10px 16px;border-radius:16px;background:linear-gradient(180deg,rgba(26,44,96,.45),rgba(14,26,60,.45));border:1px solid rgba(143,168,240,.18)}
${P} .ong-reg-sv-liste .sv-txt b::first-letter{text-transform:uppercase}
${P} .ong-reg-sv-liste .ong-reg-sv-recente{border-color:rgba(34,197,94,.45)}
${P} .ong-reg-puce{font:800 12px var(--corps);padding:4px 11px;border-radius:999px;white-space:nowrap}
${P} .ong-reg-puce.ok{background:rgba(34,197,94,.16);color:#86EFAC}

/* ---- fenêtre « Accès de … » (hors de #panneau) ---- */
body.sur-espace .modale.ong-reg-modale .ong-reg-mhint{margin:2px 0 6px;font-size:14px}
body.sur-espace .modale.ong-reg-modale .ong-reg-mzone{display:grid;gap:12px;margin-top:6px}
body.sur-espace .modale.ong-reg-modale .ong-reg-mgroupe{border:1px solid rgba(143,168,240,.18);border-radius:14px;padding:4px 14px;background:rgba(5,11,31,.25)}
body.sur-espace .modale.ong-reg-modale .ong-reg-mgroupe-t{display:flex;align-items:center;gap:8px;padding:10px 0 4px;font:800 12px var(--corps);letter-spacing:.1em;text-transform:uppercase;color:#AFC0EA}
body.sur-espace .modale.ong-reg-modale .ong-reg-mgroupe label.sw-ligne:last-child{border-bottom:0!important}

/* ---- thème clair ---- */
:root[data-theme="light"] ${P} .ong-reg-sections .ong-reg-section{background:var(--carte);color:var(--texte);border-color:#C9D4F2}
:root[data-theme="light"] ${P} .ong-reg-sections .ong-reg-section[aria-selected="true"]{background:#E5EDFF;color:#0F2257;border-color:#2F6BFF}
:root[data-theme="light"] ${P} .ong-reg-section-txt small,:root[data-theme="light"] ${P} .ong-reg-section[aria-selected="true"] .ong-reg-section-txt small{color:var(--texte-doux)}
:root[data-theme="light"] ${P} .ong-reg-hint,:root[data-theme="light"] ${P} .ong-reg-rien,:root[data-theme="light"] ${P} .ong-reg-entete span,
:root[data-theme="light"] ${P} .ong-reg-bloc h4,:root[data-theme="light"] ${P} .ong-reg-droits dt,:root[data-theme="light"] ${P} .ong-reg-sensible-t,
:root[data-theme="light"] ${P} .ong-reg-eqs{color:var(--texte-doux)}
:root[data-theme="light"] ${P} .ong-reg-ajout{color:var(--texte);border-color:#9FB1E0;background:rgba(28,63,158,.04)}
:root[data-theme="light"] ${P} .club-x,:root[data-theme="light"] ${P} .ong-reg-retirer{color:#B91C1C;border-color:rgba(220,38,38,.45)}
:root[data-theme="light"] ${P} .ong-reg-save{background:rgba(255,255,255,.97);border-color:#C9D4F2}
:root[data-theme="light"] ${P} .ong-reg-etat{color:#15803D}
:root[data-theme="light"] ${P} .ong-reg-modifie .ong-reg-etat,:root[data-theme="light"] ${P} .ong-reg-modifie .ong-reg-etat i{color:#8A6300}
:root[data-theme="light"] ${P} .acc-liste .cpt-carte,:root[data-theme="light"] ${P} .ong-reg-sv-liste .sv,:root[data-theme="light"] ${P} .acc-stats>div,
:root[data-theme="light"] ${P} .acc-id,:root[data-theme="light"] ${P} .ong-reg-sv-etat.aucune{background:var(--carte);border-color:#D5DBEA}
:root[data-theme="light"] ${P} .ong-reg-bloc{background:#F5F7FD;border-color:#D5DBEA}
:root[data-theme="light"] ${P} .ong-reg-bloc .cpt-id b{color:var(--texte);background:#E5EDFF}
:root[data-theme="light"] ${P} .ong-reg-droits dd{color:var(--texte)}
:root[data-theme="light"] ${P} .ong-reg-role{color:#1C3F9E;background:#E5EDFF}
:root[data-theme="light"] ${P} .ong-reg-role-bureau{color:#7A5B00;background:#FBF0CF}
:root[data-theme="light"] ${P} .ong-reg-role-coach{color:#1C4FD6;background:#E0E9FF}
:root[data-theme="light"] ${P} .ong-reg-role-joueur,:root[data-theme="light"] ${P} .ong-reg-vu.ok,:root[data-theme="light"] ${P} .ong-reg-puce.ok{color:#15803D;background:#DCFCE7}
:root[data-theme="light"] ${P} .ong-reg-vu{color:var(--texte-doux);background:#EEF2FA}
:root[data-theme="light"] ${P} .ong-reg-vu.attente{color:#8A6300;background:#FBF0CF}
:root[data-theme="light"] ${P} .ong-reg-vu.off{color:#B91C1C;background:#FEE2E2}
:root[data-theme="light"] ${P} .ong-reg-sv-etat{background:#F0FDF4;border-color:#86EFAC}
:root[data-theme="light"] ${P} .ong-reg-sv-etat.vieux{background:#FFFBEB;border-color:#F3D27A}
:root[data-theme="light"] ${P} .ong-reg-sv-txt small{color:var(--texte-doux)}
:root[data-theme="light"] ${P} .ong-reg-sv-txt .ong-reg-alerte{color:#8A6300}
:root[data-theme="light"] ${P} .ong-reg-codes{background:#F0FDF4}
:root[data-theme="light"] body.sur-espace .modale.ong-reg-modale .ong-reg-mgroupe{background:#F5F7FD;border-color:#D5DBEA}
:root[data-theme="light"] body.sur-espace .modale.ong-reg-modale .ong-reg-mgroupe-t{color:var(--texte-doux)}

/* ---- tablette et téléphone : la barre des rubriques est en bas de l'écran, la barre Enregistrer se pose au-dessus ---- */
@media (max-width:1140px){
  body.sur-espace.avec-barre #panneau .ong-reg .ong-reg-save.ong-reg-modifie{bottom:calc(78px + env(safe-area-inset-bottom,0px))}
  ${P} .ong-reg-sections{grid-template-columns:repeat(2,minmax(0,1fr))}
  ${P} .ong-reg-fiche-g{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:860px){
  /* le panneau coupe ce qui dépasse (overflow-x:hidden) : avec « clip », la barre Enregistrer peut rester collée en bas */
  body.sur-espace #panneau:has(> .ong-reg-club){overflow-x:clip;overflow-y:visible}
}
@media (max-width:760px){
  ${P} .ong-reg-sections{gap:8px;margin-bottom:16px}
  ${P} .ong-reg-sections .ong-reg-section{min-height:60px;padding:10px;gap:9px;border-radius:14px}
  ${P} .ong-reg-section-ico{width:34px;height:34px;font-size:18px;border-radius:10px}
  ${P} .ong-reg-section-txt b{font-size:14.5px}
  ${P} .ong-reg-section-txt small{font-size:12px;white-space:normal}
  ${P}.ong-reg-acces .ong-reg-sections{max-width:none}
  ${P} .ong-reg-coord .ong-reg-grille2{grid-template-columns:minmax(0,1fr)}
  /* tableaux : chaque ligne devient une petite fiche avec ses libellés */
  ${P} .ong-reg-entete{display:none!important}
  ${P} .ong-reg-cel{display:grid;gap:5px}
  ${P} .ong-reg-cel .ong-reg-cel-l{position:static;width:auto;height:auto;clip:auto;overflow:visible;white-space:normal;font:700 11.5px var(--corps);letter-spacing:.06em;text-transform:uppercase;color:#AFC0EA}
  ${P} .ong-reg-tab .club-ligne{padding:10px 12px;border-radius:14px;background:rgba(5,11,31,.3);border:1px solid rgba(143,168,240,.14);gap:8px 10px;align-items:end}
  ${P} .ong-reg-tab-3 .club-ligne{grid-template-columns:minmax(0,2.6fr) minmax(0,1fr) 44px}
  ${P} .ong-reg-tab .club-ligne input{padding:0 11px!important;font-size:15.5px}
  ${P} .ong-reg-tab-3 .club-ligne>.ong-reg-cel:nth-child(1){grid-column:1/3;grid-row:1}
  ${P} .ong-reg-tab-3 .club-ligne>.club-x{grid-column:3;grid-row:1}
  ${P} .ong-reg-tab-3 .club-ligne>.ong-reg-cel:nth-child(2){grid-column:1;grid-row:2}
  ${P} .ong-reg-tab-3 .club-ligne>.ong-reg-cel:nth-child(3){grid-column:2/4;grid-row:2}
  ${P} .ong-reg-tab-2 .club-ligne{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr) 44px}
  ${P} .ong-reg-perso{grid-template-columns:44px minmax(0,1fr) 44px;gap:10px;align-items:end;padding:12px}
  ${P} .ong-reg-perso>.club-ini{grid-column:1;grid-row:1;margin-bottom:2px}
  ${P} .ong-reg-perso>.ong-reg-cel-role{grid-column:2;grid-row:1}
  ${P} .ong-reg-perso>.club-x{grid-column:3;grid-row:1}
  ${P} .ong-reg-perso>.ong-reg-cel-nom,${P} .ong-reg-perso>.ong-reg-cel-email,${P} .ong-reg-perso>.ong-reg-cel-compte{grid-column:1/-1}
  ${P} .club-equipes{grid-template-columns:minmax(0,1fr)}
  ${P} .ong-reg-eq{flex-direction:column}
  ${P} .ong-reg-eq .club-eq-photo{width:auto;aspect-ratio:16/7}
  ${P} .ong-reg-eq .club-eq-corps{padding:12px}
  ${P} .ong-reg-eq .club-eq-nom{padding-right:11px!important}
  ${P} .club-eq-ajout{min-height:72px}
  ${P} .ong-reg-tete-act .ong-reg-tete-bts,${P} .ong-reg-tete-act .ong-reg-tete-bts .btn{width:100%}
  ${P} .ong-reg-clubs{grid-template-columns:minmax(0,1fr)}
  /* barre Enregistrer : compacte, deux gros boutons */
  ${P} .ong-reg-save{padding:10px;gap:8px;border-radius:16px}
  ${P} .ong-reg-save .ong-reg-etat{display:flex;width:100%;justify-content:center;font-size:13.5px}
  ${P} .ong-reg-save .btns{width:100%;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.4fr);gap:8px}
  ${P} .ong-reg-save .btn{width:100%;min-width:0}
  /* comptes */
  ${P} .ong-reg-outils{flex-direction:column;align-items:stretch}
  ${P} .ong-reg-cherche{min-width:0}
  ${P} .ong-reg-outils>.btn,${P} .ong-reg-outils .btns,${P} .ong-reg-outils .btns .btn{width:100%}
  ${P} .ong-reg-filtres{align-items:flex-start}
  ${P} .ong-reg-filtres .acc-chips{gap:6px}
  ${P} .acc-chip{padding:7px 12px;font-size:13.5px}
  ${P} .cpt-carte summary{display:grid;grid-template-columns:40px minmax(0,1fr) 18px;grid-template-areas:"ini qui fl" "ini vu fl";gap:4px 12px;padding:10px 12px}
  ${P} .cpt-carte summary .cpt-ini{grid-area:ini}
  ${P} .cpt-carte summary .cpt-qui{grid-area:qui}
  ${P} .cpt-carte summary .cpt-fl{grid-area:fl}
  ${P} .cpt-carte summary .ong-reg-vu{grid-area:vu;display:inline-block;justify-self:start;font-size:12px;padding:3px 9px}
  ${P} .ong-reg-fiche{padding:12px}
  ${P} .ong-reg-bloc{padding:12px}
  ${P} .ong-reg-bloc .cpt-champs{grid-template-columns:minmax(0,1fr)}
  ${P} .ong-reg-bloc-pied .btn{width:100%}
  ${P} .ong-reg-sensible{flex-direction:column;align-items:stretch}
  ${P} .ong-reg-sensible-g,${P} .ong-reg-sensible-d{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:8px}
  ${P} .ong-reg-sensible-g{grid-template-columns:minmax(0,1fr)}
  ${P} .ong-reg-sensible-d .btn:only-child{grid-column:1/-1}
  ${P} .ong-reg-sensible .btn{width:100%}
  ${P} .acc-ids{max-height:none;overflow:visible}
  /* sauvegardes */
  ${P} .ong-reg-sv-etat{padding:16px;gap:12px}
  ${P} .ong-reg-sv-ico{width:44px;height:44px;font-size:22px}
  ${P} .ong-reg-sv-txt{min-width:0;flex:1 1 calc(100% - 60px)}
  ${P} .ong-reg-sv-txt b{font-size:19px}
  ${P} .ong-reg-sv-etat .btn{width:100%;min-width:0}
  ${P} .ong-reg-sv-liste .sv{display:grid;grid-template-columns:30px minmax(0,1fr) auto;grid-template-areas:"ico txt txt" ". puce btn";gap:6px 12px;align-items:center;padding:12px 14px}
  ${P} .ong-reg-sv-liste .sv-ico{grid-area:ico}
  ${P} .ong-reg-sv-liste .sv-txt{grid-area:txt}
  ${P} .ong-reg-sv-liste .ong-reg-puce{grid-area:puce;justify-self:start}
  ${P} .ong-reg-sv-liste .sv .btn{grid-area:btn;min-height:44px}
}`;
  document.head.appendChild(css);
})();
