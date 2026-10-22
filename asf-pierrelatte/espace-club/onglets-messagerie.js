/* Messagerie interne : les joueurs, les coachs et le bureau s'écrivent dans l'app (jamais par e-mail).
   Serveur : /api/messagerie.php, selon le contrat msg/CONTRAT.md (conversations privées et groupes d'équipe).
   - Barre du haut : une bulle 💬 avec le nombre de messages non lus (tout compte connecté de rang ≥ 1 : code provisoire
     déjà changé), relu toutes les 30 s quand la page est visible et au retour sur l'onglet. Un clic ouvre la messagerie :
     onglet « Messages » de l'espace joueur pour un joueur, onglet « Messages » de l'espace club pour les coachs et le bureau.
   - Espace joueur : un 4e onglet « Messages » (on se branche sur rendreJoueur, qui ne connaît que ses trois onglets).
   - Espace club : onglet « messagerie » en tête de la rubrique Communication ; l'onglet des messages du formulaire de contact
     s'appelle désormais « Contact du site ».
   - L'écran : liste des conversations | conversation (deux colonnes sur ordinateur ; sur téléphone, la conversation prend
     l'écran, la zone de saisie reste en bas, au-dessus de la barre du bas et du clavier).
   - Rien de ce qu'on tape n'est perdu : l'écran de la messagerie est construit une seule fois et remis en place quand
     l'application redessine l'espace (elle le fait souvent) ; le texte en cours est aussi gardé par conversation dans S.ui.
   - ?conv=ID dans l'adresse (lien d'une notification) ouvre cette conversation, puis disparaît de l'adresse.
   - Signaler et bloquer (règle 1.2 de l'App Store) : un petit bouton « ⋯ » sur chaque message d'une autre personne
     (visible au survol sur ordinateur, discret mais toujours là sur téléphone) ouvre « Signaler ce message » (motif
     facultatif, le bureau est prévenu) et « Bloquer <prénom> » (confirmation qui explique l'effet) ; « Bloquer » aussi dans
     l'en-tête d'une conversation privée ; « Personnes bloquées » (pour débloquer) en bas de la liste des conversations, et
     pour le bureau « Messages signalés » (le texte d'un message supprimé après son signalement y reste lisible).
     La confirmation d'un blocage dit ce que l'autre personne verra (« Cette personne t'a bloqué » si elle essaie d'écrire
     en privé) et, depuis un message, propose de le signaler en même temps (après le blocage, on ne voit plus ses messages).
     Après un blocage, l'écran se met à jour sans recharger la page.
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.rendreEspace !== "function" || typeof window.rendrePanneau !== "function"
    || typeof ONGLETS === "undefined" || typeof RUBRIQUES === "undefined") return;

  const e = s => typeof esc === "function" ? esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const API = () => (window.ASFP_API || "/api") + "/messagerie.php";
  const deux = n => String(n).padStart(2, "0");
  const JOURS = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
  const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const majuscule = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const enTelephone = () => matchMedia("(max-width:860px)").matches;
  const doigt = () => matchMedia("(pointer:coarse)").matches;

  /* ---------- qui a la messagerie ----------
     Rang ≥ 1 : un compte du club connecté (site hébergé) dont le code provisoire a été changé. */
  const actif = () => !!(S.heberge && S.compte && !S.compte.doitChanger && ["joueur", "entraineur", "bureau"].includes(S.compte.role));
  const estJoueur = () => !!(S.compte && S.compte.role === "joueur");
  const estBureau = () => !!(S.compte && S.compte.role === "bureau");
  const roleCle = () => (S.compte && ["joueur", "entraineur", "bureau"].includes(S.compte.role)) ? S.compte.role : "joueur";
  const PHRASES = {
    joueur: { barre: "Écris à tes coachs et au bureau. Le groupe de ton équipe apparaît ici dès que ton coach le lance.", vide: "à ton coach ou au bureau", liste: "Écris à ton coach ou au bureau : ils reçoivent une notification sur leur téléphone. Le groupe de ton équipe apparaît dès que ton coach y écrit." },
    entraineur: { barre: "Écris à tes joueurs, aux coachs de ton équipe, au bureau et au groupe de ton équipe.", vide: "à un de tes joueurs, à un coach de ton équipe, au bureau ou à ton équipe", liste: "Écris à tes joueurs, aux coachs ou au bureau : ils reçoivent une notification sur leur téléphone." },
    bureau: { barre: "Écris à tous les membres du club et aux groupes d'équipe.", vide: "à un membre du club ou à un groupe d'équipe", liste: "Écris aux joueurs, aux coachs ou à un groupe d'équipe : ils reçoivent une notification sur leur téléphone." },
  };
  const U = () => {
    const u = S.ui.messagerie = S.ui.messagerie || {};
    if (!u.brouillons) u.brouillons = {};
    if (!u.vue) u.vue = "liste";
    if (u.conv === undefined) u.conv = null;
    return u;
  };

  /* ---------- branchement dans l'espace club ---------- */
  const ICONE = "M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-5 4v-4H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 9.5h8M8 12.5h5";
  if (!ONGLETS.some(o => o[0] === "messagerie")){
    const i = ONGLETS.findIndex(o => o[0] === "messages");
    ONGLETS.splice(i < 0 ? ONGLETS.length : i, 0, ["messagerie", "Messages", "entraineur", "Communication", "Discuter avec les joueurs, les coachs et le bureau"]);
  }
  const contact = ONGLETS.find(o => o[0] === "messages");
  if (contact) contact[1] = "Contact du site";              // nomOnglet lit ce libellé (NOM_COURT n'a pas « messages »)
  const com = RUBRIQUES.find(r => r[0] === "com");
  if (com && !com[3].includes("messagerie")){
    com[3].unshift("messagerie");
    com[4] = "Messages, affiches, actualités et contact du site";
  }
  if (typeof ICONES === "object" && ICONES) ICONES.messagerie = ICONE;

  /* Comptes aux onglets choisis (« Accès et rôles ») : leur liste ne connaît pas encore « messagerie ». ongletsVisibles ne peut
     pas être remplacé (const) ; quand on ouvre la messagerie (bouton 💬, lien d'une notification), on l'ajoute à leur liste le
     temps de dessiner l'espace, sans rien changer à ce qui est enregistré (l'application ne recopie S.permissions que dans
     ses gestionnaires d'événements, jamais pendant le dessin). */
  let forcage = 0;
  const avecMessagerie = p => {
    if (!p || typeof p !== "object" || !S.compte) return p;
    const k = "c" + S.compte.id, v = p[k];
    if (!v || !Array.isArray(v.onglets) || !v.onglets.length || v.onglets.includes("messagerie")) return p;
    return { ...p, [k]: { ...v, onglets: [...v.onglets, "messagerie"] } };
  };
  try {
    const d = Object.getOwnPropertyDescriptor(S, "permissions");
    if (!d || d.configurable){
      let local = d && "value" in d ? d.value : undefined;
      const lire = () => d && d.get ? d.get.call(S) : local;
      Object.defineProperty(S, "permissions", { configurable: true, enumerable: true,
        get(){ const p = lire(); return forcage > 0 ? avecMessagerie(p) : p; },
        set(v){ if (d && d.set) d.set.call(S, v); else local = v; } });
    }
  } catch(err){}

  /* ---------- appels au serveur ---------- */
  async function api(params, corps){
    const url = API() + "?" + new URLSearchParams(params).toString();
    const opts = corps === undefined ? { credentials: "same-origin", cache: "no-store" }
      : { method: "POST", credentials: "same-origin", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corps) };
    let r;
    try { r = await fetch(url, opts); }
    catch(err){ const x = new Error("Pas de connexion internet, réessaie dans un instant."); x.status = 0; throw x; }
    let d = null; try { d = await r.json(); } catch(err){}
    if (!r.ok || !d || typeof d !== "object"){
      const x = new Error((d && d.erreur) || (r.status === 401 ? "Connecte-toi pour utiliser la messagerie."
        : r.status === 403 ? "Tu n'as pas accès à cette conversation." : r.status === 429 ? "Tu as envoyé beaucoup de messages : attends quelques minutes."
        : "La messagerie ne répond pas pour le moment, réessaie dans un instant."));
      x.status = r.status; throw x;
    }
    return d;
  }

  /* ---------- données (pas dans S.ui : ce ne sont pas des réglages d'écran) ---------- */
  let resume = { nonlus: 0, maj: null }, dernierResume = 0, resumeEnCours = false, horsLigne = false;
  let liste = null, moi = null, listeEnCours = false, erreurListe = "", listeDemandee = false;
  let contacts = null, contactsDate = 0, contactsEnCours = false, erreurContacts = "";
  let bloques = null;                // [{ id, nom }] : les personnes que le compte a bloquées (lues à l'ouverture de leur liste)
  let signalements = null;           // bureau : les derniers messages signalés
  const signales = new Set();        // les messages que ce compte a signalés depuis l'ouverture de la page (« Déjà signalé au bureau »),
                                     // gardés même quand la conversation est relue (les messages du serveur n'ont pas ce champ)
  const fils = new Map();            // id → { conv, messages:[], plusAnciens, charge, erreur, envois:[], nonlusDepart, avantEnCours }
  let seqTmp = 0, pollEnCours = false, nbPoll = 0;
  const filDe = id => { let f = fils.get(id); if (!f){ f = { conv: null, messages: [], plusAnciens: false, charge: false, erreur: "", envois: [], nonlusDepart: 0 }; fils.set(id, f); } return f; };
  const itemDe = id => (liste || []).find(c => c.id === id) || null;
  const moiId = () => (moi && moi.id) || (S.compte && S.compte.id) || 0;

  /* ---------- petits outils d'affichage ---------- */
  const date = s => { const d = new Date(s); return isNaN(d) ? null : d; };
  const heure = d => deux(d.getHours()) + ":" + deux(d.getMinutes());
  const joursDepuis = d => { const a = new Date(); a.setHours(0, 0, 0, 0); const b = new Date(d); b.setHours(0, 0, 0, 0); return Math.round((a - b) / 864e5); };
  function dateListe(s){
    const d = date(s); if (!d) return "";
    const n = joursDepuis(d);
    if (n <= 0) return heure(d);
    if (n === 1) return "hier";
    if (n < 7) return JOURS[d.getDay()];
    return deux(d.getDate()) + "/" + deux(d.getMonth() + 1) + (d.getFullYear() !== new Date().getFullYear() ? "/" + String(d.getFullYear()).slice(2) : "");
  }
  function dateSeparateur(d){
    const n = joursDepuis(d);
    if (n <= 0) return "Aujourd'hui";
    if (n === 1) return "Hier";
    return majuscule(`${JOURS[d.getDay()]} ${d.getDate() === 1 ? "1er" : d.getDate()} ${MOIS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? " " + d.getFullYear() : ""}`);
  }
  const initiales = n => { const m = String(n || "").trim().split(/\s+/).filter(Boolean); return ((m[0] || "?")[0] + (m.length > 1 ? m[m.length - 1][0] : "")).toUpperCase(); };
  /* « Mehdi BENALI » -> « Mehdi » (les mots qui ne sont pas en capitales ; sinon le premier) */
  const prenomDe = n => { const m = String(n || "").trim().split(/\s+/).filter(Boolean); const p = m.filter(x => x !== x.toUpperCase()); return p.length ? p.join(" ") : (m[0] || "cette personne"); };
  const extrait = (t, max = 140) => { t = String(t == null ? "" : t).replace(/\s+/g, " ").trim(); return [...t].length > max ? [...t].slice(0, max - 1).join("").trimEnd() + "…" : t; };
  function initialesEquipe(eq){
    const m = String(eq || "").split(/[\s·]+/).filter(Boolean);
    if (!m.length) return "⚽";
    if (/^u\d+/i.test(m[0])) return m[0].toUpperCase().slice(0, 3);
    return (m[0][0] + (m[1] && /^\d+$/.test(m[1]) ? m[1] : "")).toUpperCase();
  }
  const TEINTES = ["#2F6BFF", "#16A34A", "#E0457B", "#8B5CF6", "#0EA5E9", "#D97706", "#0D9488", "#DC2626"];
  const teinte = id => TEINTES[Math.abs(+id || 0) % TEINTES.length];
  const avatar = (c, cls) => c.type === "equipe"
    ? `<span class="mg-av mg-av-groupe ${cls || ""}" aria-hidden="true">${e(initialesEquipe(c.equipe || String(c.titre || "").replace(/^Groupe\s+/i, "")))}</span>`
    : `<span class="mg-av ${cls || ""}" style="--av:${teinte((c.avec && c.avec[0] && c.avec[0].id) || c.id)}" aria-hidden="true">${e(initiales(c.titre || c.nom))}</span>`;
  const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;
  /* le texte d'un message : tout est échappé, les adresses deviennent des liens, les retours à la ligne restent (pre-wrap) */
  function texteHtml(t){
    t = String(t == null ? "" : t);
    let h = "", i = 0;
    t.replace(URL_RE, (m, pos) => {
      let url = m, fin = "";
      while (/[.,;:!?)\]}»"'’]$/.test(url) && !(url.endsWith(")") && (url.match(/\(/g) || []).length >= (url.match(/\)/g) || []).length)){ fin = url.slice(-1) + fin; url = url.slice(0, -1); }
      const href = /^www\./i.test(url) ? "https://" + url : url;
      h += e(t.slice(i, pos)) + `<a href="${e(href)}" target="_blank" rel="noopener">${e(url)}</a>` + e(fin);
      i = pos + m.length; return m;
    });
    return h + e(t.slice(i));
  }
  const apercu = c => {
    const d = c.dernier;
    if (!d) return `<i>Aucun message pour l'instant</i>`;
    const qui = d.auteurId === moiId() ? "Toi" : (c.type === "equipe" ? d.auteur : "");
    const t = d.texte ? e(String(d.texte).replace(/\s+/g, " ")) : `<i>Message supprimé</i>`;
    return (qui ? `<b>${e(qui)} :</b> ` : "") + t;
  };

  /* ================= L'ÉCRAN (construit une fois, remis en place après chaque dessin de l'application) ================= */
  let racine = null, zNotif, zListe, zPied, zDroite, zVide, zTete, zFil, zNouveaux, zSaisie, ta, btEnvoi, zErreur, zCompteur, zChoix, zChoixListe, zCherche;
  let filRendu = [];                 // ce qui est affiché dans le fil : [[clé, html], …]
  let filConv = null;                // la conversation dont le fil est affiché
  const SVG_ENVOI = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/></svg>`;
  function construire(){
    if (racine) return racine;
    racine = document.createElement("div");
    racine.className = "mg-app";
    racine.innerHTML = `
      <div class="mg-notif" hidden></div>
      <div class="mg-barre"><div class="mg-barre-txt"><h2>Messages</h2><p>${e(PHRASES[roleCle()].barre)}</p></div>
        <button type="button" class="btn bleu mg-nouveau-bt" data-mg-nouveau><span aria-hidden="true">✏️</span> Nouveau message</button></div>
      <div class="mg-grille">
        <section class="mg-gauche" aria-label="Conversations"><div class="mg-liste-zone"></div><div class="mg-pied"></div></section>
        <section class="mg-droite" aria-label="Conversation ouverte">
          <div class="mg-vide"></div>
          <div class="mg-choix" hidden>
            <div class="mg-tete"><button type="button" class="mg-retour" data-mg-retour aria-label="Retour à la liste des conversations"><span aria-hidden="true">←</span></button>
              <div class="mg-tete-txt"><b>Nouveau message</b><small>Choisis un groupe ou une personne</small></div></div>
            <div class="mg-cherche"><label class="mg-sr" for="mg-cherche">Chercher une personne ou un groupe</label>
              <input type="search" id="mg-cherche" data-mg-cherche placeholder="🔍 Chercher un nom, une équipe…" autocomplete="off" enterkeyhint="search"></div>
            <div class="mg-choix-liste"></div>
          </div>
          <div class="mg-conv" hidden>
            <div class="mg-tete mg-conv-tete"></div>
            <div class="mg-fil-cadre"><div class="mg-fil" role="log" aria-live="polite" aria-relevant="additions" aria-label="Messages de la conversation" tabindex="0"></div>
              <button type="button" class="mg-nouveaux" data-mg-bas hidden>↓ Nouveaux messages</button></div>
            <form class="mg-saisie" data-mg-form novalidate>
              <p class="mg-erreur" role="alert" hidden></p>
              <div class="mg-saisie-l">
                <label class="mg-sr" for="mg-texte">Ton message</label>
                <textarea id="mg-texte" data-mg-texte rows="1" maxlength="2000" placeholder="Écris ton message…" enterkeyhint="enter"></textarea>
                <button type="submit" class="mg-envoyer" aria-label="Envoyer le message" disabled>${SVG_ENVOI}</button>
              </div>
              <small class="mg-compteur" hidden></small>
            </form>
          </div>
        </section>
      </div>`;
    const q = s => racine.querySelector(s);
    zNotif = q(".mg-notif"); zListe = q(".mg-liste-zone"); zPied = q(".mg-pied"); zDroite = q(".mg-droite"); zVide = q(".mg-vide");
    zChoix = q(".mg-choix"); zChoixListe = q(".mg-choix-liste"); zCherche = q("[data-mg-cherche]");
    zTete = q(".mg-conv-tete"); zFil = q(".mg-fil"); zNouveaux = q("[data-mg-bas]"); zSaisie = q(".mg-saisie");
    ta = q("[data-mg-texte]"); btEnvoi = q(".mg-envoyer"); zErreur = q(".mg-erreur"); zCompteur = q(".mg-compteur");
    zFil.addEventListener("scroll", () => { if (estEnBas()) zNouveaux.hidden = true; }, { passive: true });
    ta.addEventListener("focus", () => setTimeout(() => { mesurer(); if (estEnBas(200)) allerEnBas(); }, 320));
    return racine;
  }

  /* ---------- placer l'écran là où il doit être ---------- */
  function cible(){
    if (!actif()) return null;
    if (location.hash === "#joueur" && S.ui.ongletJoueur === "messages"){
      const z = document.getElementById("joueur");
      return z && document.querySelector('#nav-joueur [data-a="onglet-joueur"]') ? z : null;
    }
    if (location.hash === "#espace" && S.ui.onglet === "messagerie" && typeof peutCoacher === "function" && peutCoacher()) return document.getElementById("panneau");
    return null;
  }
  let memo = null;
  function memoriser(){
    if (!racine || !racine.isConnected) return;
    memo = { t: Date.now(), filHaut: zFil.scrollTop, filBas: estEnBas(), listeHaut: zListe.scrollTop, choixHaut: zChoixListe.scrollTop, y: window.scrollY,
      focus: document.activeElement === ta ? "ta" : document.activeElement === zCherche ? "cherche" : null,
      sel: document.activeElement === ta || document.activeElement === zCherche ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null };
  }
  function restaurer(){
    const m = memo; memo = null;
    if (!m || Date.now() - m.t > 1500) return;
    zFil.scrollTop = m.filBas ? zFil.scrollHeight : m.filHaut;
    zListe.scrollTop = m.listeHaut; zChoixListe.scrollTop = m.choixHaut;
    const c = m.focus === "ta" ? ta : m.focus === "cherche" ? zCherche : null;
    if (c && c.getClientRects().length){
      try { c.focus({ preventScroll: true }); if (m.sel) c.setSelectionRange(m.sel[0], m.sel[1]); } catch(err){}
    }
    if (Math.abs(window.scrollY - m.y) > 1) window.scrollTo(0, m.y);
  }
  let dejaMonte = false;
  function placer(){
    const z = cible();
    if (!z){ dejaMonte = false; majPlein(); return false; }
    construire();
    const nouveau = racine.parentNode !== z || !racine.isConnected;
    if (nouveau || z.childNodes.length !== 1){ z.textContent = ""; z.appendChild(racine); }
    restaurer();
    const arrivee = !dejaMonte;
    if (arrivee){ dejaMonte = true; arriver(); }
    afficher();
    ajusterSaisie();
    // ordinateur : la messagerie entière sous les yeux (les deux colonnes ont la hauteur de la fenêtre)
    if (arrivee && !enTelephone()) setTimeout(() => {
      const g = racine.querySelector(".mg-grille"); if (!g || !racine.isConnected) return;
      const r = g.getBoundingClientRect();
      if (r.bottom > window.innerHeight + 2 || r.top < 0) defilerVers();
    }, 90);
    return true;
  }
  /* on arrive sur la messagerie : liste à jour, conversation ouverte rechargée, bandeau des notifications */
  function arriver(){
    chargerListe();
    const u = U();
    if (u.conv && (u.vue === "conv" || !enTelephone())) chargerConv(u.conv, { complet: true });
    majNotif();
  }

  /* ---------- tout l'écran selon l'état ---------- */
  function afficher(){
    if (!racine) return;
    const u = U(), tel = enTelephone();
    if (tel && u.vue === "conv" && !u.conv) u.vue = "liste";
    const vue = u.vue === "nouveau" ? "nouveau" : (u.conv && (u.vue === "conv" || !tel)) ? "conv" : "liste";
    racine.classList.toggle("mg-vue-conv", vue === "conv");
    racine.classList.toggle("mg-vue-nouveau", vue === "nouveau");
    racine.classList.toggle("mg-vue-liste", vue === "liste");
    zChoix.hidden = vue !== "nouveau";
    racine.querySelector(".mg-conv").hidden = vue !== "conv";
    zVide.hidden = vue !== "liste";
    rendreListe();
    rendrePied();
    if (vue === "liste" && !zVide.firstChild) zVide.innerHTML = `<div class="mg-vide-c"><span class="mg-vide-ico" aria-hidden="true">💬</span><b>Choisis une conversation</b>
      <span>ou écris un nouveau message ${e(PHRASES[roleCle()].vide)}.</span>
      <button type="button" class="btn bleu" data-mg-nouveau><span aria-hidden="true">✏️</span> Nouveau message</button></div>`;
    if (vue === "nouveau") rendreChoix();
    if (vue === "conv") rendreConv();
    majPlein();
  }
  /* téléphone : la conversation (ou le choix d'un contact) prend tout l'écran */
  function majPlein(){
    const plein = !!(racine && racine.isConnected && racine.getClientRects().length && enTelephone() && (racine.classList.contains("mg-vue-conv") || racine.classList.contains("mg-vue-nouveau")));
    document.body.classList.toggle("mg-plein", plein);
    if (plein) mesurer();
  }

  /* ---------- la liste des conversations ---------- */
  function rendreListe(){
    if (!zListe) return;
    const u = U();
    let h;
    if (!liste){
      h = erreurListe ? `<div class="mg-etat"><b>Messagerie indisponible</b><span>${e(erreurListe)}</span><button type="button" class="btn contour petit" data-mg-recharger>Réessayer</button></div>`
        : `<div class="mg-etat mg-charge" aria-busy="true"><span class="mg-roue" aria-hidden="true"></span><span>Chargement des conversations…</span></div>`;
    } else if (!liste.length){
      h = `<div class="mg-etat"><span class="mg-vide-ico" aria-hidden="true">💬</span><b>Aucune conversation pour l'instant</b>
        <span>${e(PHRASES[roleCle()].liste)}</span>
        <button type="button" class="btn bleu" data-mg-nouveau><span aria-hidden="true">✏️</span> Nouveau message</button></div>`;
    } else {
      h = `<ul class="mg-liste" role="list" aria-label="Conversations">${liste.map(c => {
        const on = c.id === u.conv && (u.vue === "conv" || !enTelephone()) && u.vue !== "nouveau";
        const n = +c.nonlus || 0, brouillon = (u.brouillons[c.id] || "").trim();
        return `<li><button type="button" class="mg-it ${on ? "on" : ""} ${n ? "nonlu" : ""}" data-mg-conv="${+c.id}" aria-current="${on ? "true" : "false"}">
          ${avatar(c)}
          <span class="mg-it-c">
            <span class="mg-it-l1"><b class="mg-it-titre">${e(c.titre)}</b><time class="mg-it-h" datetime="${e((c.dernier && c.dernier.date) || c.maj || "")}">${e(dateListe((c.dernier && c.dernier.date) || c.maj))}</time></span>
            ${c.sousTitre ? `<span class="mg-it-l2">${e(c.sousTitre)}</span>` : ""}
            <span class="mg-it-l3"><span class="mg-it-ap">${brouillon && !on ? `<b class="mg-brouillon">Brouillon :</b> ${e(brouillon.replace(/\s+/g, " "))}` : apercu(c)}</span>
              ${c.muet ? `<span class="mg-it-muet" title="Notifications coupées" aria-label="Notifications coupées">🔕</span>` : ""}
              ${n ? `<span class="mg-pastille">${n > 99 ? "99+" : n}<span class="mg-sr"> message${n > 1 ? "s" : ""} non lu${n > 1 ? "s" : ""}</span></span>` : ""}</span>
          </span></button></li>`;
      }).join("")}</ul>`;
    }
    if (zListe.dataset.h !== h){ const y = zListe.scrollTop; zListe.innerHTML = h; zListe.dataset.h = h; zListe.scrollTop = y; }
  }
  /* sous la liste : les personnes bloquées (pour les débloquer) ; pour le bureau, les messages signalés */
  function rendrePied(){
    if (!zPied) return;
    const h = `<button type="button" class="mg-pied-bt" data-mg-bloques aria-haspopup="dialog"><span aria-hidden="true">⛔</span> Personnes bloquées</button>`
      + (estBureau() ? `<button type="button" class="mg-pied-bt" data-mg-signalements aria-haspopup="dialog"><span aria-hidden="true">🚩</span> Messages signalés</button>` : "");
    if (zPied.dataset.h !== h){ zPied.innerHTML = h; zPied.dataset.h = h; }
  }

  /* ---------- choisir à qui écrire ---------- */
  const simple = s => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function rendreChoix(){
    let h;
    if (!contacts){
      if (!contactsEnCours && !erreurContacts) chargerContacts();
      h = erreurContacts ? `<div class="mg-etat"><b>Liste indisponible</b><span>${e(erreurContacts)}</span><button type="button" class="btn contour petit" data-mg-contacts>Réessayer</button></div>`
        : `<div class="mg-etat mg-charge" aria-busy="true"><span class="mg-roue" aria-hidden="true"></span><span>Chargement des contacts…</span></div>`;
    } else {
      const q = simple(zCherche.value).trim();
      const ok = (...t) => !q || q.split(/\s+/).every(m => t.some(x => simple(x).includes(m)));
      const groupes = (contacts.groupes || []).filter(g => ok(g.titre, g.equipe));
      const familles = [];
      (contacts.personnes || []).filter(p => ok(p.nom, p.libelle, p.equipe, p.famille)).forEach(p => {
        const f = p.famille || "Contacts";
        let x = familles.find(y => y[0] === f); if (!x){ x = [f, []]; familles.push(x); }
        x[1].push(p);
      });
      const bloc = (titre, items) => `<section class="mg-famille"><h3>${e(titre)} <span class="mg-nb">${items.length}</span></h3><ul role="list">${items.join("")}</ul></section>`;
      h = (groupes.length ? bloc("Groupes d'équipe", groupes.map(g => `<li><button type="button" class="mg-ct" data-mg-groupe="${e(g.equipe)}">
            ${avatar({ type: "equipe", equipe: g.equipe })}<span class="mg-ct-c"><b>${e(g.titre)}</b><small>Les coachs et les joueurs de l'équipe</small></span><span class="mg-fl" aria-hidden="true">›</span></button></li>`)) : "")
        + familles.map(([f, l]) => bloc(f, l.map(p => `<li><button type="button" class="mg-ct" data-mg-contact="${+p.id}">
            <span class="mg-av" style="--av:${teinte(p.id)}" aria-hidden="true">${e(initiales(p.nom))}</span><span class="mg-ct-c"><b>${e(p.nom)}</b><small>${e(p.libelle || "")}</small></span><span class="mg-fl" aria-hidden="true">›</span></button></li>`))).join("");
      if (!h) h = `<div class="mg-etat"><b>${q ? "Personne ne correspond" : "Personne à qui écrire pour l'instant"}</b><span>${q ? "Vérifie l'orthographe ou cherche par équipe (« U15 », « Seniors »)." : "Ton équipe n'a pas encore d'autre compte actif."}</span></div>`;
    }
    if (zChoixListe.dataset.h !== h){ zChoixListe.innerHTML = h; zChoixListe.dataset.h = h; }
  }

  /* ---------- la conversation ouverte ---------- */
  function rendreConv(){
    const u = U(), f = filDe(u.conv), c = f.conv || itemDe(u.conv);
    const groupe = c && c.type === "equipe";
    const membres = f.conv && Array.isArray(f.conv.membres) ? f.conv.membres : null;
    // conversation privée : l'autre personne (pour « Bloquer »)
    const autre = c && c.type === "prive" && Array.isArray(c.avec) ? c.avec.find(a => a && +a.id && +a.id !== moiId()) : null;
    const tete = `<button type="button" class="mg-retour" data-mg-retour aria-label="Retour à la liste des conversations"><span aria-hidden="true">←</span></button>
      ${c ? avatar(c, "mg-av-tete") : `<span class="mg-av mg-av-tete" aria-hidden="true">…</span>`}
      <div class="mg-tete-txt"><b>${e(c ? c.titre : "Conversation")}</b>
        ${groupe && membres && membres.length ? `<button type="button" class="mg-membres-bt" data-mg-membres aria-expanded="${u.membres ? "true" : "false"}">${e(c.sousTitre || membres.length + " membres")} <span aria-hidden="true">▾</span></button>`
          : `<small>${e(c ? c.sousTitre || "" : "")}</small>`}</div>
      ${groupe ? `<button type="button" class="mg-muet ${c.muet ? "on" : ""}" data-mg-muet aria-pressed="${c.muet ? "true" : "false"}"
          title="${c.muet ? "Les notifications de ce groupe sont coupées : appuie pour les remettre" : "Couper les notifications de ce groupe"}"
          aria-label="${c.muet ? "Notifications du groupe coupées. Les remettre" : "Couper les notifications de ce groupe"}"><span aria-hidden="true">${c.muet ? "🔕" : "🔔"}</span><span class="mg-muet-t">${c.muet ? "Notifications coupées" : "Couper les notifications"}</span></button>` : ""}
      ${autre ? `<button type="button" class="mg-bloquer" data-mg-bloquer="${+autre.id}" data-nom="${e(autre.nom)}" aria-haspopup="dialog"
          title="Bloquer ${e(autre.nom)}" aria-label="Bloquer ${e(autre.nom)}"><span aria-hidden="true">⛔</span><span class="mg-muet-t">Bloquer</span></button>` : ""}
      ${c && ["entraineur", "bureau"].includes(roleCle()) ? `<button type="button" class="mg-effacer" data-mg-effacer
          title="Supprimer cette conversation" aria-label="Supprimer la conversation"><span aria-hidden="true">🗑</span><span class="mg-muet-t">Supprimer la conversation</span></button>` : ""}
      ${groupe && membres && u.membres ? `<div class="mg-membres"><ul role="list">${membres.map(m => `<li><span class="mg-av mg-av-mini" style="--av:${teinte(m.id)}" aria-hidden="true">${e(initiales(m.nom))}</span><b>${e(m.nom)}</b><small>${e(m.libelle || "")}</small></li>`).join("")}</ul></div>` : ""}`;
    if (zTete.dataset.h !== tete){ zTete.innerHTML = tete; zTete.dataset.h = tete; }
    // le texte en cours de cette conversation (gardé dans S.ui, jamais remplacé tant qu'on reste dessus)
    if (filConv !== u.conv){
      if (filConv != null) U().brouillons[filConv] = ta.value;
      ta.value = u.brouillons[u.conv] || "";
      filRendu = []; zFil.textContent = ""; filConv = u.conv; zNouveaux.hidden = true;
      zErreur.hidden = true;
    }
    ajusterSaisie();
    rendreFil();
  }
  const estEnBas = (marge = 60) => !zFil || zFil.scrollHeight - zFil.scrollTop - zFil.clientHeight < marge;
  const allerEnBas = () => { if (zFil){ zFil.scrollTop = zFil.scrollHeight; zNouveaux.hidden = true; } };
  function rendreFil({ versLeBas = false } = {}){
    const u = U(), f = filDe(u.conv);
    const c = f.conv || itemDe(u.conv), groupe = c && c.type === "equipe";
    const items = [];
    // en haut : charger les plus anciens, ou le début de la conversation
    // (le bureau qui arrive par la notification d'un message signalé dans une privée qu'il ne lit pas : vers les messages signalés)
    items.push(["haut", f.erreur && !f.messages.length ? `<div class="mg-etat"><b>Conversation indisponible</b><span>${e(f.erreur)}</span><button type="button" class="btn contour petit" data-mg-recharger-conv>Réessayer</button>
        ${f.status === 403 && estBureau() ? `<button type="button" class="btn bleu petit" data-mg-signalements aria-haspopup="dialog"><span aria-hidden="true">🚩</span> Voir les messages signalés</button>` : ""}</div>`
      : !f.charge ? `<div class="mg-etat mg-charge" aria-busy="true"><span class="mg-roue" aria-hidden="true"></span><span>Chargement des messages…</span></div>`
      : f.plusAnciens ? `<div class="mg-haut-fil"><button type="button" class="mg-plus" data-mg-plus ${f.avantEnCours ? "disabled" : ""}>${f.avantEnCours ? "Chargement…" : "Charger les messages précédents"}</button></div>`
      : `<div class="mg-haut-fil"><span class="mg-debut">${f.messages.length ? "Début de la conversation" : groupe ? "Aucun message dans ce groupe pour l'instant : écris le premier !" : "Aucun message pour l'instant : écris le premier !"}</span></div>`]);
    if (f.charge){
      const tous = [...f.messages, ...f.envois];
      // séparateur « non lus » : avant le premier des derniers messages des autres qui n'avaient pas été lus
      let iNonLu = -1;
      if (f.nonlusDepart > 0){
        let n = f.nonlusDepart;
        for (let i = f.messages.length - 1; i >= 0 && n > 0; i--){ if (!f.messages[i].moi && !f.messages[i].supprime){ n--; iNonLu = i; } }
      }
      let jour = "", avant = null;
      tous.forEach((m, i) => {
        const d = date(m.date) || new Date();
        const j = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate();
        if (j !== jour){ jour = j; avant = null; items.push(["j" + j, `<div class="mg-sep" role="separator"><span>${e(dateSeparateur(d))}</span></div>`]); }
        if (i === iNonLu) items.push(["nl", `<div class="mg-sep mg-sep-nl" role="separator"><span>${f.nonlusDepart} message${f.nonlusDepart > 1 ? "s" : ""} non lu${f.nonlusDepart > 1 ? "s" : ""}</span></div>`]);
        const suite = !!(avant && avant.auteurId === m.auteurId && !!avant.moi === !!m.moi && i !== iNonLu && (date(m.date) - date(avant.date)) < 10 * 60000);
        items.push([m.tmp ? "t" + m.tmp : "m" + m.id + (m.supprime ? "s" : ""), bulle(m, groupe, suite)]);
        avant = m;
      });
    }
    // le fil ne change que là où il a changé (le texte qu'on sélectionne, la position de lecture restent)
    let i = 0;
    while (i < filRendu.length && i < items.length && filRendu[i][0] === items[i][0] && filRendu[i][1] === items[i][1]) i++;
    if (i === filRendu.length && i === items.length) return;
    const bas = estEnBas(), hautAvant = zFil.scrollHeight, y = zFil.scrollTop, prepend = i <= 1 && filRendu.length > 1 && items.length > filRendu.length;
    const premierAncien = filRendu[1] && filRendu[1][0];
    const noeuds = [...zFil.children];
    noeuds.slice(i).forEach(n => n.remove());
    const t = document.createElement("template");
    t.innerHTML = items.slice(i).map(x => x[1]).join("");
    zFil.appendChild(t.content);
    const nouveauxAutres = items.slice(i).some(x => /^m/.test(x[0]) && x[1].includes("mg-lui")) && filRendu.length > 1 && !prepend;
    filRendu = items;
    if (versLeBas || bas && !prepend) allerEnBas();
    else if (prepend && premierAncien){
      zFil.scrollTop = y + (zFil.scrollHeight - hautAvant);
    } else zFil.scrollTop = y;
    if (nouveauxAutres && !estEnBas()) zNouveaux.hidden = false;
  }
  function bulle(m, groupe, suite){
    const moiMsg = !!m.moi;
    const auteur = groupe && !moiMsg && !suite && !m.supprime ? `<div class="mg-auteur" style="--c:${teinte(m.auteurId)}"><b>${e(m.auteur)}</b>${m.libelle ? `<small>${e(m.libelle)}</small>` : ""}</div>` : "";
    const d = date(m.date);
    const etat = m.tmp ? `<span class="mg-envoi">envoi…</span>` : "";
    // ses propres messages : « Supprimer » ; ceux des autres : « ⋯ » (signaler, bloquer, et supprimer pour le bureau)
    const peutSuppr = !m.tmp && !m.supprime && moiMsg;
    const actions = !m.tmp && !m.supprime && !moiMsg && +m.auteurId > 0 && +m.auteurId !== moiId();
    const corps = m.supprime ? `<div class="mg-t mg-t-suppr"><span aria-hidden="true">🚫</span> Message supprimé</div>` : `<div class="mg-t">${texteHtml(m.texte)}</div>`;
    return `<div class="mg-l ${moiMsg ? "mg-moi" : "mg-lui"} ${suite ? "mg-suite" : ""} ${m.tmp ? "mg-tmp" : ""}" ${m.tmp ? "" : `data-mg-id="${+m.id}"`}>
      <div class="mg-b ${m.supprime ? "mg-b-suppr" : ""}" data-mg-bulle>${auteur}${corps}<span class="mg-meta">${etat}<time datetime="${e(m.date || "")}">${d ? heure(d) : ""}</time></span></div>
      ${peutSuppr ? `<button type="button" class="mg-suppr" data-mg-suppr="${+m.id}" aria-label="Supprimer ce message">Supprimer ce message</button>` : ""}
      ${actions ? `<button type="button" class="mg-act" data-mg-act="${+m.id}" aria-haspopup="dialog" title="Signaler ou bloquer"
          aria-label="Plus d'actions sur le message de ${e(m.auteur)} : signaler, bloquer"><span aria-hidden="true">⋯</span></button>` : ""}
    </div>`;
  }

  /* ---------- zone de saisie ---------- */
  function ajusterSaisie(){
    if (!ta) return;
    ta.style.height = "auto";
    const max = enTelephone() ? 132 : 180;
    ta.style.height = Math.min(Math.max(ta.scrollHeight, 44), max) + "px";
    ta.style.overflowY = ta.scrollHeight > max ? "auto" : "hidden";
    const n = [...ta.value.trim()].length;
    btEnvoi.disabled = !n;
    zCompteur.hidden = n < 1800;
    zCompteur.textContent = `${n} / 2000`;
    zCompteur.classList.toggle("trop", n > 2000);
  }

  /* ================= LECTURE ================= */
  async function chargerResume(){
    if (!actif() || resumeEnCours) return;
    resumeEnCours = true; dernierResume = Date.now();
    try {
      const d = await api({ resume: 1 });
      horsLigne = false;
      const change = d.maj !== resume.maj || +d.nonlus !== +resume.nonlus;
      resume = { nonlus: +d.nonlus || 0, maj: d.maj || null };
      majPastilles();
      if (change && racine && racine.isConnected) chargerListe();
    } catch(err){ if (err.status === 401) { resume = { nonlus: 0, maj: null }; majPastilles(); } horsLigne = true; }
    finally { resumeEnCours = false; }
    majNotif();
  }
  async function chargerListe(){
    if (!actif()) return;
    if (listeEnCours){ listeDemandee = true; return; }
    listeEnCours = true;
    try {
      const d = await api({ liste: 1 });
      liste = Array.isArray(d.conversations) ? d.conversations : [];
      moi = d.moi || moi; erreurListe = "";
      // la conversation ouverte et lue à l'écran n'a pas de non-lus
      const u = U();
      if (u.conv && convVisible()){ const it = itemDe(u.conv); if (it) it.nonlus = 0; }
      resume.nonlus = liste.reduce((n, c) => n + (+c.nonlus || 0), 0);
      majPastilles();
    } catch(err){ if (!liste) erreurListe = err.message; }
    finally {
      listeEnCours = false;
      if (racine) afficher();
      if (listeDemandee){ listeDemandee = false; chargerListe(); }
    }
  }
  async function chargerContacts(force){
    if (contactsEnCours || (!force && contacts && Date.now() - contactsDate < 120000)) return;
    contactsEnCours = true; erreurContacts = "";
    try { const d = await api({ contacts: 1 }); contacts = { groupes: d.groupes || [], personnes: d.personnes || [] }; contactsDate = Date.now(); }
    catch(err){ erreurContacts = err.message; }
    finally { contactsEnCours = false; if (racine && U().vue === "nouveau") rendreChoix(); }
  }
  /* la conversation : les 50 derniers messages (ou complet : on resynchronise ce qui est affiché, messages supprimés compris) */
  async function chargerConv(id, { complet = false } = {}){
    const f = filDe(id);
    if (f.enCours) return;
    f.enCours = true;
    try {
      const d = await api({ conv: id });
      const msgs = Array.isArray(d.messages) ? d.messages : [];
      if (d.conv) f.conv = d.conv;
      if (!f.charge || complet){
        const premier = msgs.length ? msgs[0].id : Infinity;
        const anciens = f.charge ? f.messages.filter(m => m.id < premier) : [];
        f.plusAnciens = anciens.length ? f.plusAnciens : !!d.plusAnciens;
        f.messages = [...anciens, ...msgs];
        if (!f.charge){ const it = itemDe(id); f.nonlusDepart = it ? +it.nonlus || 0 : 0; }
      }
      f.charge = true; f.erreur = "";
      enleverEnvoisRecus(f, msgs);
      apresLecture(id, f);
    } catch(err){ f.erreur = err.message; f.status = err.status; }
    finally {
      f.enCours = false;
      if (racine && U().conv === id) { const premiere = !filRendu.length || filRendu.length <= 1; rendreConv(); if (premiere) placerLecture(f); }
    }
  }
  /* à l'ouverture : en bas, ou au séparateur « non lus » s'il y a beaucoup de nouveaux messages */
  function placerLecture(){
    const nl = zFil.querySelector(".mg-sep-nl");
    if (nl && nl.offsetTop < zFil.scrollHeight - zFil.clientHeight) zFil.scrollTop = Math.max(0, nl.offsetTop - 12);
    else allerEnBas();
  }
  function apresLecture(id, f){
    const it = itemDe(id);
    if (it && it.nonlus){ it.nonlus = 0; resume.nonlus = (liste || []).reduce((n, c) => n + (+c.nonlus || 0), 0); majPastilles(); rendreListe(); }
    if (f.conv && it){ if (typeof f.conv.muet === "boolean") it.muet = f.conv.muet; }
  }
  function enleverEnvoisRecus(f, msgs){
    msgs.filter(m => m.moi).forEach(m => {
      if (f.envois.some(t => t.recu === m.id)) return;
      const i = f.envois.findIndex(t => !t.recu && m.id > (t.apres || 0) && t.texte === String(m.texte || "").trim());
      if (i >= 0) f.envois[i].recu = m.id;
    });
    f.envois = f.envois.filter(t => !t.recu || !f.messages.some(m => m.id === t.recu));
  }
  async function pollConv(){
    const u = U(), id = u.conv;
    if (!id || pollEnCours || !convVisible()) return;
    const f = filDe(id);
    if (!f.charge){ chargerConv(id); return; }
    pollEnCours = true; nbPoll++;
    try {
      if (nbPoll % 6 === 0){ await chargerConv(id, { complet: true }); return; }      // toutes les 30 s : messages supprimés ailleurs
      const dernier = f.messages.reduce((m, x) => Math.max(m, +x.id || 0), 0);
      const d = await api({ conv: id, apres: dernier });
      if (U().conv !== id) return;
      if (d.conv){ const membres = f.conv && f.conv.membres; f.conv = { ...f.conv, ...d.conv }; if (!d.conv.membres && membres) f.conv.membres = membres; }
      const nouveaux = (Array.isArray(d.messages) ? d.messages : []).filter(m => !f.messages.some(x => x.id === m.id));
      if (nouveaux.length){
        f.messages = [...f.messages, ...nouveaux].sort((a, b) => a.id - b.id);
        enleverEnvoisRecus(f, nouveaux);
        const it = itemDe(id), der = nouveaux[nouveaux.length - 1];
        if (it){ it.dernier = { texte: der.texte, auteur: String(der.auteur || "").split(" ")[0], auteurId: der.auteurId, date: der.date }; it.maj = der.date; remonter(id); }
        rendreConv();
      } else if (d.conv) rendreConv();
      f.erreur = "";
    } catch(err){
      if (err.status === 403 || err.status === 404){ f.erreur = err.message; rendreFil(); }
    } finally { pollEnCours = false; }
  }
  const remonter = id => { if (!liste) return; const i = liste.findIndex(c => c.id === id); if (i > 0) liste.unshift(liste.splice(i, 1)[0]); rendreListe(); };
  async function chargerAvant(){
    const u = U(), id = u.conv, f = filDe(id);
    if (!f.charge || f.avantEnCours || !f.messages.length) return;
    f.avantEnCours = true; rendreFil();
    try {
      const d = await api({ conv: id, avant: f.messages[0].id });
      const anciens = (Array.isArray(d.messages) ? d.messages : []).filter(m => !f.messages.some(x => x.id === m.id));
      f.messages = [...anciens, ...f.messages];
      f.plusAnciens = !!d.plusAnciens && anciens.length > 0;
    } catch(err){ toastMg("Impossible de charger les messages précédents : " + err.message, true); }
    finally { f.avantEnCours = false; if (U().conv === id) rendreFil(); }
  }

  /* ================= ÉCRITURE ================= */
  async function envoyer(){
    const u = U(), id = u.conv;
    if (!id || !ta) return;
    const texte = ta.value.trim();
    if (!texte) return;
    if ([...texte].length > 2000){ montrerErreur("Ton message est trop long : 2000 caractères au plus. Coupe-le en deux messages."); return; }
    const f = filDe(id);
    const tmp = { tmp: ++seqTmp, texte, date: new Date().toISOString(), moi: true, auteurId: moiId(), auteur: (moi && moi.nom) || (S.compte && S.compte.nom) || "",
      apres: f.messages.reduce((n, x) => Math.max(n, +x.id || 0), 0) };
    f.envois.push(tmp);
    ta.value = ""; u.brouillons[id] = ""; ajusterSaisie(); zErreur.hidden = true;
    f.nonlusDepart = 0;
    rendreFil({ versLeBas: true });
    try {
      const d = await api({ envoyer: 1 }, { conv: id, texte });
      tmp.envoye = true;
      f.envois = f.envois.filter(t => t !== tmp);
      const m = d.message;
      if (m && !f.messages.some(x => x.id === m.id)) f.messages = [...f.messages, m].sort((a, b) => a.id - b.id);
      const it = itemDe(id);
      if (it && m){ it.dernier = { texte: m.texte, auteur: String(m.auteur || "").split(" ")[0], auteurId: m.auteurId, date: m.date }; it.maj = m.date; remonter(id); }
      else if (!it) chargerListe();
      if (U().conv === id) rendreFil({ versLeBas: true });
      setTimeout(chargerResume, 400);
    } catch(err){
      f.envois = f.envois.filter(t => t !== tmp);
      // le texte n'est jamais perdu : il revient dans la zone de saisie (avant ce qu'on aurait tapé entre-temps)
      const ici = U().conv === id;
      const reste = ici ? ta.value : (u.brouillons[id] || "");
      const remis = texte + (reste.trim() ? "\n" + reste : "");
      u.brouillons[id] = remis;
      if (ici){ ta.value = remis; ajusterSaisie(); rendreFil(); montrerErreur(`Message pas envoyé : ${err.message} Ton texte est gardé ci-dessous, appuie sur ➤ pour réessayer.`); }
      else toastMg("Un message n'a pas pu partir : " + err.message + " Il t'attend dans sa conversation.", true);
    }
  }
  function montrerErreur(t){ zErreur.textContent = t; zErreur.hidden = false; }
  async function supprimer(idMsg){
    const u = U(), f = filDe(u.conv), m = f.messages.find(x => x.id === idMsg);
    if (!m) return;
    if (!confirm(m.moi ? "Supprimer ce message pour tout le monde ?" : `Supprimer ce message de ${m.auteur} pour tout le monde ?`)) return;
    try {
      await api({ supprimer: 1 }, { message: idMsg });
      m.supprime = true; m.texte = "";
      const it = itemDe(u.conv);
      if (it && it.dernier && f.messages.length && f.messages[f.messages.length - 1].id === idMsg) it.dernier = { ...it.dernier, texte: "" };
      rendreFil(); rendreListe();
      toastMg("Message supprimé.");
    } catch(err){ toastMg("Suppression impossible : " + err.message, true); }
  }
  async function basculerMuet(){
    const u = U(), f = filDe(u.conv), c = f.conv || itemDe(u.conv);
    if (!c) return;
    const muet = !c.muet;
    try {
      await api({ muet: 1 }, { conv: u.conv, muet });
      if (f.conv) f.conv.muet = muet;
      const it = itemDe(u.conv); if (it) it.muet = muet;
      rendreConv(); rendreListe();
      toastMg(muet ? "Notifications coupées pour ce groupe. Tu verras quand même les messages ici." : "Notifications remises pour ce groupe.");
    } catch(err){ toastMg(err.message, true); }
  }
  /* supprimer la conversation ouverte : une privée disparaît de ta liste (l'autre personne la garde) ;
     un groupe est vidé pour tout le monde (coach de l'équipe ou bureau) */
  async function effacerConv(){
    const u = U(), id = u.conv, f = filDe(id), c = f.conv || itemDe(id);
    if (!c) return;
    const groupe = c.type === "equipe";
    if (!confirm(groupe ? `Supprimer la conversation « ${c.titre} » ?\n\nElle disparaît pour tous les membres du groupe. Un coach pourra la relancer avec « Nouveau message ».`
      : `Supprimer la conversation avec ${c.titre} ?\n\nElle disparaît pour toi et pour ${c.titre}.`)) return;
    try {
      await api({ effacer: 1 }, { conv: id });
      if (u.brouillons) delete u.brouillons[id];
      {
        fils.delete(id);
        liste = (liste || []).filter(x => x.id !== id);
        resume.nonlus = liste.reduce((n, x) => n + (+x.nonlus || 0), 0); majPastilles();
        u.conv = null; u.vue = "liste"; filConv = null;
        if (history.state && history.state.mg){ try { history.back(); } catch(err){} }
        afficher(); rendreListe(); chargerListe();
        toastMg("Conversation supprimée.");
      }
    } catch(err){ toastMg("Suppression impossible : " + err.message, true); }
  }
  async function ouvrirAvec(corps){
    try {
      const d = await api({ ouvrir: 1 }, corps);
      if (!d.id) throw new Error("Réponse inattendue du serveur.");
      zCherche.value = "";
      choisirConv(+d.id);
      chargerListe();
    } catch(err){ toastMg(err.message, true); }
  }
  const toastMg = (t, err) => { try { toast(t, err); } catch(x){} };

  /* ================= SIGNALER ET BLOQUER ================= */
  /* Une seule fenêtre (dialog), posée sur la page : menu d'un message, signalement, confirmation d'un blocage,
     personnes bloquées, messages signalés (bureau). Sur téléphone, elle monte du bas de l'écran. */
  let dlg = null, dlgType = "", dlgRetour = null;
  function dialogue(){
    if (dlg && dlg.isConnected) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "mg-dlg";
    dlg.setAttribute("aria-labelledby", "mg-dlg-titre");
    document.body.appendChild(dlg);
    // un appui à côté (sur le fond) ferme ; seulement si l'appui a COMMENCÉ sur le fond : sélectionner le motif à la souris en
    // relâchant à côté de la fenêtre envoie aussi un « clic » sur le fond, qui ne doit pas la fermer (le motif serait perdu)
    let appuiFond = false;
    dlg.addEventListener("pointerdown", ev => { appuiFond = ev.target === dlg; });
    dlg.addEventListener("click", ev => { const fond = appuiFond; appuiFond = false; if (ev.target === dlg && fond) fermerDlg(); });
    dlg.addEventListener("close", () => {
      dlgType = ""; dlg.classList.remove("sans-modal");
      const r = dlgRetour; dlgRetour = null;
      if (r && r.isConnected && r.getClientRects().length) try { r.focus({ preventScroll: true }); } catch(err){}
    });
    return dlg;
  }
  function ouvrirDlg(type, html){
    const d = dialogue();
    if (!d.open) dlgRetour = document.activeElement;
    dlgType = type;
    d.innerHTML = `<div class="mg-dlg-c">${html}</div>`;
    if (!d.open){
      let modal = false;
      if (typeof d.showModal === "function") try { d.showModal(); modal = true; } catch(err){}
      if (!modal){ d.setAttribute("open", ""); d.classList.add("sans-modal"); }
    }
    placerFocusDlg();
  }
  function majDlg(type, html){ if (dlg && dlg.open && dlgType === type){ dlg.innerHTML = `<div class="mg-dlg-c">${html}</div>`; placerFocusDlg(); } }
  /* le focus : sur téléphone, le titre (pas de clavier qui surgit) ; sur ordinateur, la zone de texte ou l'action principale */
  function placerFocusDlg(){
    if (!dlg) return;
    const q = s => dlg.querySelector(s);
    const c = doigt() ? q("#mg-dlg-titre") : (q("[data-mg-focus-pc]") || q("[data-mg-dlg-focus]") || q("button:not(:disabled)") || q("#mg-dlg-titre"));
    if (c) try { c.focus({ preventScroll: true }); } catch(err){}
  }
  function fermerDlg(){
    if (!dlg) return;
    if (dlg.open){ if (typeof dlg.close === "function" && !dlg.classList.contains("sans-modal")) dlg.close(); else { dlg.removeAttribute("open"); dlg.dispatchEvent(new Event("close")); } }
  }
  function erreurDlg(t){ const z = dlg && dlg.querySelector(".mg-dlg-erreur"); if (z){ z.textContent = t; z.hidden = false; } else toastMg(t, true); }
  function infoDlg(t){ const z = dlg && dlg.querySelector(".mg-dlg-info"); if (z) z.textContent = t; }
  const btsDlg = (...b) => `<div class="mg-dlg-btns">${b.join("")}</div>`;
  const annuler = (t = "Annuler") => `<button type="button" class="btn contour" data-mg-dlg-fermer>${e(t)}</button>`;
  const ERREUR_DLG = `<p class="mg-dlg-erreur" role="alert" hidden></p>`;
  const messageDe = id => { const f = filDe(U().conv); return f.messages.find(x => x.id === id) || null; };

  /* « ⋯ » sur le message d'une autre personne */
  function menuMessage(id){
    const m = messageDe(id);
    if (!m || m.supprime) return;
    const p = prenomDe(m.auteur);
    ouvrirDlg("menu", `<div class="mg-dlg-tete"><b id="mg-dlg-titre" tabindex="-1">Message de ${e(m.auteur)}</b><p class="mg-dlg-extrait">« ${e(extrait(m.texte))} »</p></div>
      <div class="mg-dlg-actions">
        ${signales.has(m.id) ? `<button type="button" class="mg-dlg-bt" disabled><span aria-hidden="true">✓</span> Déjà signalé au bureau</button>`
          : `<button type="button" class="mg-dlg-bt" data-mg-signaler="${+m.id}" data-mg-dlg-focus><span aria-hidden="true">🚩</span> Signaler ce message</button>`}
        <button type="button" class="mg-dlg-bt rouge" data-mg-bloquer="${+m.auteurId}" data-nom="${e(m.auteur)}" data-msg="${+m.id}"><span aria-hidden="true">⛔</span> Bloquer ${e(p)}</button>
        ${estBureau() ? `<button type="button" class="mg-dlg-bt" data-mg-suppr="${+m.id}"><span aria-hidden="true">🗑</span> Supprimer ce message pour tout le monde</button>` : ""}
        <button type="button" class="mg-dlg-bt doux" data-mg-dlg-fermer>Annuler</button>
      </div>`);
  }
  /* signaler : motif facultatif, confirmation */
  function formSignaler(id){
    const m = messageDe(id);
    if (!m || m.supprime) return;
    ouvrirDlg("signaler", `<form class="mg-dlg-form" data-mg-sig-form data-id="${+m.id}" novalidate>
        <div class="mg-dlg-tete"><b id="mg-dlg-titre" tabindex="-1"><span aria-hidden="true">🚩</span> Signaler ce message ?</b>
          <p>Le bureau du club est prévenu tout de suite et va relire ce message de ${e(m.auteur)}. Il pourra le supprimer et réagir si besoin.</p>
          <p class="mg-dlg-extrait">« ${e(extrait(m.texte))} »</p></div>
        <label class="mg-dlg-label" for="mg-motif">Pourquoi ? <small>(facultatif)</small></label>
        <textarea id="mg-motif" class="mg-dlg-motif" data-mg-focus-pc maxlength="300" rows="3" placeholder="Par exemple : insulte, moquerie, message qui te met mal à l'aise…"></textarea>
        ${ERREUR_DLG}
        ${btsDlg(annuler(), `<button type="submit" class="btn bleu" data-mg-dlg-focus><span aria-hidden="true">🚩</span> Signaler</button>`)}
      </form>`);
  }
  async function envoyerSignalement(form){
    const id = +form.dataset.id, bt = form.querySelector('[type="submit"]'), motif = (form.querySelector("textarea") || {}).value || "";
    if (bt) bt.disabled = true;
    try {
      await api({ signaler: 1 }, { message: id, motif: motif.trim() });
      signales.add(id);
      fermerDlg();
      toastMg("Merci, le bureau est prévenu.");
    } catch(err){ erreurDlg(err.message); if (bt) bt.disabled = false; }
  }
  /* bloquer : la confirmation dit exactement ce qui va se passer (y compris ce que l'autre personne verra).
     Depuis le menu d'un message (idMsg) : une case pour signaler aussi ce message au bureau, AVANT le blocage
     (après, on ne voit plus ses messages, donc on ne peut plus les signaler). */
  function confirmerBlocage(id, nom, idMsg){
    if (!id || id === moiId()) return;
    const p = e(prenomDe(nom)), privee = (liste || []).some(c => avecLui(c, id));
    const m = idMsg ? messageDe(idMsg) : null;
    const caseSig = !!(m && !m.supprime && !m.moi && +m.auteurId === id && !signales.has(m.id));
    ouvrirDlg("bloquer", `<div class="mg-dlg-tete"><b id="mg-dlg-titre" tabindex="-1"><span aria-hidden="true">⛔</span> Bloquer ${e(nom || "cette personne")} ?</b></div>
      <ul class="mg-dlg-effets">
        <li>Tu ne verras plus ses messages, ni en privé ni dans les groupes d'équipe, et tu ne seras plus prévenu quand ${p} écrit.</li>
        <li>${privee ? `Votre conversation privée disparaît et ${p} ne pourra plus t'écrire en privé.` : `${p} ne pourra pas t'écrire en privé.`}</li>
        <li>Aucune notification n'est envoyée à ${p}. Mais si ${p} essaie de t'écrire en privé, l'appli lui répondra : « Cette personne t'a bloqué ».</li>
        <li>Tu peux débloquer quand tu veux, dans « Personnes bloquées », en bas de la liste des conversations.</li>
      </ul>
      ${caseSig ? `<label class="mg-dlg-case"><input type="checkbox" data-mg-sig-aussi="${+m.id}"> <span><b>Signaler aussi ce message au bureau</b>
          <small>« ${e(extrait(m.texte, 80))} »</small></span></label>
        <p class="mg-dlg-note">Si ce message est blessant ou t'inquiète, coche la case : après le blocage, tu ne verras plus ses messages et tu ne pourras plus les signaler.</p>`
        : `<p class="mg-dlg-note">Si ses messages sont blessants ou t'inquiètent, signale-les au bureau <b>avant</b> de bloquer (bouton ⋯ sur le message) : après le blocage, tu ne les verras plus et tu ne pourras plus les signaler.</p>`}
      ${ERREUR_DLG}
      ${btsDlg(annuler(), `<button type="button" class="btn danger" data-mg-bloquer-ok="${+id}" data-nom="${e(nom)}" data-mg-dlg-focus><span aria-hidden="true">⛔</span> Bloquer</button>`)}`);
  }
  async function bloquer(id, nom, bt){
    const caseSig = dlg && dlg.querySelector("[data-mg-sig-aussi]");
    const idSig = caseSig && caseSig.checked ? +caseSig.dataset.mgSigAussi : 0;
    if (bt) bt.disabled = true;
    if (caseSig) caseSig.disabled = true;
    try {
      // d'abord le signalement (s'il échoue, rien n'est bloqué : la fenêtre reste ouverte avec l'erreur)
      if (idSig && !signales.has(idSig)){
        try { await api({ signaler: 1 }, { message: idSig, motif: "" }); signales.add(idSig); }
        catch(err){ throw new Error("Signalement impossible : " + err.message + " Rien n'a été bloqué. Décoche la case pour bloquer sans signaler."); }
      }
      await api({ bloquer: 1 }, { compte: id, bloque: true });
      fermerDlg();
      apresBlocage(id, nom);
      toastMg(idSig ? `Merci, le bureau est prévenu. Tu as bloqué ${prenomDe(nom)} : tu ne verras plus ses messages.` : `Tu as bloqué ${prenomDe(nom)}. Tu ne verras plus ses messages.`);
    } catch(err){
      erreurDlg(err.message);
      if (bt) bt.disabled = false;
      if (caseSig){ caseSig.disabled = false; if (idSig && signales.has(idSig)) caseSig.closest("label").hidden = true; }   // déjà signalé : la case n'a plus lieu d'être
    }
  }
  const avecLui = (c, id) => !!(c && c.type === "prive" && Array.isArray(c.avec) && c.avec.some(a => a && +a.id === id));
  /* après un blocage, sans recharger la page : ses messages disparaissent des conversations chargées, la conversation privée
     avec lui disparaît de la liste (et se ferme si elle était ouverte), les contacts et les compteurs sont relus */
  function apresBlocage(id, nom){
    if (bloques && !bloques.some(b => b.id === id)) bloques = [...bloques, { id, nom: nom || "" }];
    const u = U(), privees = new Set((liste || []).filter(c => avecLui(c, id)).map(c => c.id));
    fils.forEach((f, cid) => {
      if (avecLui(f.conv || itemDe(cid), id)) privees.add(cid);
      else f.messages = f.messages.filter(m => +m.auteurId !== id);
    });
    privees.forEach(cid => fils.delete(cid));
    if (liste) liste = liste.filter(c => !privees.has(c.id));
    resume.nonlus = (liste || []).reduce((n, c) => n + (+c.nonlus || 0), 0); majPastilles();
    contacts = null; contactsDate = 0;
    if (u.conv && privees.has(u.conv)){
      if (u.brouillons) delete u.brouillons[u.conv];
      u.conv = null; u.vue = "liste"; filConv = null; filRendu = [];
      if (history.state && history.state.mg){ try { history.back(); } catch(err){} }
    }
    if (racine) afficher();
    chargerListe(); chargerResume();      // aperçus et non-lus recalculés par le serveur, sans ses messages
  }
  /* après un déblocage : les conversations déjà chargées sont relues (ses messages reviennent) */
  function apresDeblocage(id){
    if (bloques) bloques = bloques.filter(b => b.id !== id);
    contacts = null; contactsDate = 0;
    fils.forEach((f, cid) => { if (!f.envois.length && !f.enCours) fils.delete(cid); });
    const u = U();
    if (u.conv && !fils.has(u.conv)){ filConv = null; filRendu = []; if (zFil) zFil.textContent = ""; }
    if (racine) afficher();
    if (u.conv && racine && racine.isConnected) chargerConv(u.conv);
    chargerListe(); chargerResume();
  }
  /* « Personnes bloquées » : la liste, avec « Débloquer » */
  function htmlBloques(etat){
    const l = bloques || [];
    const corps = !bloques ? (etat ? `<p class="mg-dlg-vide">${e(etat)}</p>` : `<p class="mg-dlg-vide mg-charge"><span class="mg-roue" aria-hidden="true"></span> Chargement…</p>`)
      : !l.length ? `<p class="mg-dlg-vide">Tu n'as bloqué personne.</p>`
      : `<ul class="mg-dlg-bloques" role="list">${l.map(b => `<li><span class="mg-av mg-av-mini" style="--av:${teinte(b.id)}" aria-hidden="true">${e(initiales(b.nom))}</span>
          <b>${e(b.nom)}</b><button type="button" class="btn contour petit" data-mg-debloquer="${+b.id}" data-nom="${e(b.nom)}" aria-label="Débloquer ${e(b.nom)}">Débloquer</button></li>`).join("")}</ul>`;
    return `<div class="mg-dlg-tete"><b id="mg-dlg-titre" tabindex="-1"><span aria-hidden="true">⛔</span> Personnes bloquées</b>
        <p>Tu ne vois pas leurs messages et elles ne peuvent pas t'écrire en privé. Elles ne reçoivent aucune notification du blocage, mais si l'une d'elles essaie de t'écrire en privé, l'appli lui répond : « Cette personne t'a bloqué ».</p></div>
      ${corps}<p class="mg-dlg-info" role="status" aria-live="polite"></p>${ERREUR_DLG}${btsDlg(annuler("Fermer"))}`;
  }
  async function ouvrirBloques(){
    ouvrirDlg("bloques", htmlBloques());
    try { const d = await api({ bloques: 1 }); bloques = Array.isArray(d.bloques) ? d.bloques : []; majDlg("bloques", htmlBloques()); }
    catch(err){ majDlg("bloques", htmlBloques(err.message)); }
  }
  async function debloquer(id, nom, bt){
    if (bt) bt.disabled = true;
    try {
      await api({ bloquer: 1 }, { compte: id, bloque: false });
      apresDeblocage(id);
      majDlg("bloques", htmlBloques());
      infoDlg(`Tu as débloqué ${prenomDe(nom)} : tu vois de nouveau ses messages.`);
    } catch(err){ erreurDlg(err.message); if (bt) bt.disabled = false; }
  }
  /* bureau : les messages signalés (même dans une conversation privée qu'il ne peut pas ouvrir), avec « Supprimer » */
  function htmlSignalements(etat){
    const l = signalements || [];
    const ligne = s => {
      const d = date(s.date), sup = !!(s.message && s.message.supprime), tx = (s.message && s.message.texte) || "";
      return `<li class="mg-sig"><div class="mg-sig-l1"><b>${e(s.auteur && s.auteur.nom)}</b>${s.auteur && s.auteur.libelle ? `<small>${e(s.auteur.libelle)}</small>` : ""}</div>
        ${sup ? `<span class="mg-sig-etat"><span aria-hidden="true">🚫</span> ${tx ? "Supprimé de la conversation : seul le bureau le relit ici." : "Message supprimé"}</span>` : ""}
        ${tx ? `<div class="mg-sig-t ${sup ? "mg-t-suppr" : ""}">${texteHtml(tx)}</div>` : ""}
        <small class="mg-sig-par">Signalé par ${e(s.par && s.par.nom)}${d ? `, ${e(dateListe(s.date))}` : ""} · ${e(s.conv && s.conv.titre)}${s.motif ? `<br>Motif : « ${e(s.motif)} »` : ""}</small>
        ${s.message && !sup ? `<button type="button" class="btn danger petit" data-mg-sig-suppr="${+s.message.id}">Supprimer ce message</button>` : ""}</li>`;
    };
    const corps = !signalements ? (etat ? `<p class="mg-dlg-vide">${e(etat)}</p>` : `<p class="mg-dlg-vide mg-charge"><span class="mg-roue" aria-hidden="true"></span> Chargement…</p>`)
      : !l.length ? `<p class="mg-dlg-vide">Aucun message signalé.</p>` : `<ul class="mg-dlg-sigs" role="list">${l.map(ligne).join("")}</ul>`;
    return `<div class="mg-dlg-tete"><b id="mg-dlg-titre" tabindex="-1"><span aria-hidden="true">🚩</span> Messages signalés</b>
        <p>Les messages que des membres ont signalés, du plus récent au plus ancien. Relis-les rapidement : tu peux supprimer un message, ou désactiver un compte dans « Accès et rôles ».</p></div>
      ${corps}<p class="mg-dlg-info" role="status" aria-live="polite"></p>${ERREUR_DLG}${btsDlg(annuler("Fermer"))}`;
  }
  async function ouvrirSignalements(){
    if (!estBureau()) return;
    ouvrirDlg("signalements", htmlSignalements());
    try { const d = await api({ signalements: 1 }); signalements = Array.isArray(d.signalements) ? d.signalements : []; majDlg("signalements", htmlSignalements()); }
    catch(err){ majDlg("signalements", htmlSignalements(err.message)); }
  }
  async function supprimerSignale(idMsg, bt){
    if (!confirm("Supprimer ce message pour tout le monde ?")) return;
    if (bt) bt.disabled = true;
    try {
      await api({ supprimer: 1 }, { message: idMsg });
      (signalements || []).forEach(s => { if (s.message && s.message.id === idMsg) s.message.supprime = true; });   // le bureau garde le texte sous les yeux
      fils.forEach(f => f.messages.forEach(m => { if (m.id === idMsg){ m.supprime = true; m.texte = ""; } }));
      majDlg("signalements", htmlSignalements());
      infoDlg("Message supprimé.");
      if (racine && racine.isConnected && U().conv) rendreFil();
      chargerListe();
    } catch(err){ erreurDlg("Suppression impossible : " + err.message); if (bt) bt.disabled = false; }
  }

  /* ================= NAVIGATION ================= */
  function convVisible(){
    const u = U();
    return !!(u.conv && racine && racine.isConnected && document.visibilityState === "visible" && racine.classList.contains("mg-vue-conv") && zFil.getClientRects().length);
  }
  function choisirConv(id){
    const u = U();
    if (filConv != null && ta) u.brouillons[filConv] = ta.value;
    u.conv = id; u.vue = "conv"; u.membres = false;
    const f = filDe(id);
    if (!f.charge || f.erreur){ f.erreur = ""; }
    histoire("conv");
    afficher();
    if (!f.charge) chargerConv(id); else { chargerConv(id, { complet: true }); placerLecture(f); }
    setTimeout(() => { try { (doigt() ? zTete.querySelector("[data-mg-retour]") : ta).focus({ preventScroll: true }); } catch(err){} }, 30);
  }
  function retourListe(){
    const u = U();
    if (filConv != null && ta) u.brouillons[filConv] = ta.value;
    if (history.state && history.state.mg){ history.back(); return; }        // popstate fera le reste
    fermerVue();
  }
  function fermerVue(){
    const u = U(), avant = u.conv;
    if (enTelephone()){ u.vue = "liste"; u.conv = null; filConv = null; }
    else u.vue = u.conv ? "conv" : "liste";
    afficher();
    const b = avant && zListe.querySelector(`[data-mg-conv="${+avant}"]`);
    if (b && enTelephone()) try { b.focus({ preventScroll: true }); b.scrollIntoView({ block: "nearest" }); } catch(err){}
  }
  /* téléphone : le bouton « retour » du téléphone ferme la conversation au lieu de quitter l'espace */
  function histoire(vue){
    if (!enTelephone()) return;
    try {
      if (history.state && history.state.mg) history.replaceState({ ...(history.state || {}), mg: vue }, "");
      else history.pushState({ mg: vue }, "");
    } catch(err){}
  }
  window.addEventListener("popstate", ev => {
    if (!racine || !racine.isConnected || !enTelephone()) return;
    const u = U();
    if ((!ev.state || !ev.state.mg) && u.vue !== "liste") fermerVue();
  });
  function nouveauMessage(){
    const u = U();
    if (filConv != null && ta) u.brouillons[filConv] = ta.value;
    u.vue = "nouveau";
    histoire("nouveau");
    chargerContacts();
    afficher();
    if (!doigt()) setTimeout(() => { try { zCherche.focus({ preventScroll: true }); } catch(err){} }, 30);
  }

  /* ouvrir la messagerie (bouton 💬, lien d'une notification) : là où le compte la trouve */
  function ouvrirMessagerie({ conv = null } = {}){
    if (!actif()) return;
    const u = U();
    if (conv){ u.conv = +conv; u.vue = "conv"; u.membres = false; }
    else if (enTelephone()){ u.vue = "liste"; u.conv = null; }
    else if (u.vue === "nouveau") u.vue = u.conv ? "conv" : "liste";
    // dans l'espace joueur, on y reste (même pour un dirigeant qui est aussi joueur) ; dans l'espace club aussi
    const versJoueur = location.hash === "#joueur" ? true : location.hash === "#espace" ? !(typeof peutCoacher === "function" && peutCoacher()) : estJoueur();
    if (versJoueur){
      S.ui.ongletJoueur = "messages";
      if (location.hash !== "#joueur") location.hash = "#joueur";
      rendreJoueur();
    } else {
      S.ui.onglet = "messagerie"; S.ui.compo = null; S.ui.tournoi = null; S.ui.tirage = null; S.ui.rubOuverte = null;
      try { S.ui.derniers = { ...(S.ui.derniers || {}), com: "messagerie" }; } catch(err){}
      if (location.hash !== "#espace") location.hash = "#espace";
      rendreEspace();
    }
    if (conv){ histoire("conv"); const f = filDe(+conv); if (!f.charge) chargerConv(+conv); }
    setTimeout(defilerVers, 80);
  }
  /* la page descend jusqu'à la messagerie (sous l'en-tête du site) */
  function defilerVers(){
    if (!racine || !racine.isConnected) return;
    const haut = document.querySelector(".top"), h = haut ? haut.offsetHeight : 0;
    const cibleY = (enTelephone() ? racine : racine.querySelector(".mg-grille") || racine).getBoundingClientRect().top + window.scrollY - h - (enTelephone() ? 8 : 14);
    window.scrollTo({ top: Math.max(0, cibleY), behavior: "auto" });
  }

  /* ================= LES ÉVÉNEMENTS (les nôtres, jamais data-a) ================= */
  document.addEventListener("click", ev => {
    const t = ev.target; if (!t || !t.closest) return;
    const b = t.closest("[data-mg-ouvrir],[data-mg-onglet-joueur],[data-mg-conv],[data-mg-retour],[data-mg-nouveau],[data-mg-groupe],[data-mg-contact],[data-mg-plus],[data-mg-suppr],[data-mg-muet],[data-mg-effacer],[data-mg-membres],[data-mg-bas],[data-mg-recharger],[data-mg-recharger-conv],[data-mg-contacts],[data-mg-notif-x],[data-mg-notif],"
      + "[data-mg-act],[data-mg-signaler],[data-mg-bloquer],[data-mg-bloquer-ok],[data-mg-debloquer],[data-mg-bloques],[data-mg-signalements],[data-mg-sig-suppr],[data-mg-dlg-fermer]");
    if (!b){
      const bu = t.closest("[data-mg-bulle]");
      if (bu && !t.closest("a") && racine && racine.contains(bu) && !(getSelection() && String(getSelection()).length)){
        const l = bu.closest(".mg-l");
        racine.querySelectorAll(".mg-l.mg-choisi").forEach(x => { if (x !== l) x.classList.remove("mg-choisi"); });
        if (l) l.classList.toggle("mg-choisi");
      }
      return;
    }
    const d = b.dataset;
    if ("mgOuvrir" in d){ ev.preventDefault(); ouvrirMessagerie(); return; }
    if ("mgOngletJoueur" in d){
      ev.preventDefault();
      const u = U(); if (enTelephone()){ u.vue = "liste"; u.conv = null; }
      S.ui.ongletJoueur = "messages"; rendreJoueur(); setTimeout(defilerVers, 30); return;
    }
    if ("mgConv" in d){ choisirConv(+d.mgConv); return; }
    if ("mgRetour" in d){ retourListe(); return; }
    if ("mgNouveau" in d){ nouveauMessage(); return; }
    if ("mgGroupe" in d){ ouvrirAvec({ equipe: d.mgGroupe }); return; }
    if ("mgContact" in d){ ouvrirAvec({ avec: +d.mgContact }); return; }
    if ("mgPlus" in d){ chargerAvant(); return; }
    if ("mgSuppr" in d){ if (dlg && dlg.contains(b)) fermerDlg(); supprimer(+d.mgSuppr); return; }
    // signaler, bloquer
    if ("mgAct" in d){ menuMessage(+d.mgAct); return; }
    if ("mgSignaler" in d){ formSignaler(+d.mgSignaler); return; }
    if ("mgBloquerOk" in d){ bloquer(+d.mgBloquerOk, d.nom || "", b); return; }
    if ("mgBloquer" in d){ confirmerBlocage(+d.mgBloquer, d.nom || "", +d.msg || 0); return; }
    if ("mgDebloquer" in d){ debloquer(+d.mgDebloquer, d.nom || "", b); return; }
    if ("mgBloques" in d){ ouvrirBloques(); return; }
    if ("mgSignalements" in d){ ouvrirSignalements(); return; }
    if ("mgSigSuppr" in d){ supprimerSignale(+d.mgSigSuppr, b); return; }
    if ("mgDlgFermer" in d){ fermerDlg(); return; }
    if ("mgMuet" in d){ basculerMuet(); return; }
    if ("mgEffacer" in d){ effacerConv(); return; }
    if ("mgMembres" in d){ const u = U(); u.membres = !u.membres; rendreConv(); return; }
    if ("mgBas" in d){ allerEnBas(); return; }
    if ("mgRecharger" in d){ erreurListe = ""; liste = null; rendreListe(); chargerListe(); return; }
    if ("mgRechargerConv" in d){ const f = filDe(U().conv); f.erreur = ""; f.charge = false; rendreFil(); chargerConv(U().conv); return; }
    if ("mgContacts" in d){ erreurContacts = ""; rendreChoix(); chargerContacts(true); return; }
    if ("mgNotifX" in d){ try { sessionStorage.setItem("asfp-mg-notif-masque", "1"); } catch(err){} U().notifMasque = true; majNotif(); return; }
    if ("mgNotif" in d){ [900, 2500, 6000, 12000].forEach(ms => setTimeout(majNotif, ms)); return; }   // data-a="notif-on" : l'application s'en charge
  });
  document.addEventListener("submit", ev => {
    const f = ev.target; if (!f || !f.matches) return;
    if (f.matches("[data-mg-sig-form]")){ ev.preventDefault(); envoyerSignalement(f); return; }
    if (!f.matches("[data-mg-form]")) return;
    ev.preventDefault(); envoyer();
  });
  document.addEventListener("keydown", ev => {
    if (ev.target !== ta || ev.key !== "Enter" || ev.shiftKey || ev.isComposing || ev.keyCode === 229) return;
    if (doigt()) return;                                         // téléphone : Entrée = nouvelle ligne, on envoie avec ➤
    ev.preventDefault(); envoyer();
  });
  document.addEventListener("input", ev => {
    if (ev.target === ta){ const u = U(); if (u.conv) u.brouillons[u.conv] = ta.value; zErreur.hidden = true; ajusterSaisie(); return; }
    if (ev.target === zCherche){ U().recherche = zCherche.value; rendreChoix(); }
  });

  /* ================= BOUTON 💬 DE LA BARRE DU HAUT ET PASTILLES ================= */
  let bouton = null;
  function majBouton(){
    const wrap = document.querySelector("header.top .wrap");
    if (!wrap) return;
    if (!actif()){ if (bouton) bouton.remove(); bouton = null; document.body.classList.remove("mg-actif"); return; }
    if (!bouton){
      bouton = document.createElement("button");
      bouton.type = "button"; bouton.className = "mg-haut"; bouton.setAttribute("data-mg-ouvrir", "");
      bouton.innerHTML = `<span class="mg-haut-ico" aria-hidden="true">💬</span><span class="mg-haut-n" hidden></span>`;
    }
    if (!bouton.isConnected){ const ap = wrap.querySelector("#apercu"); wrap.insertBefore(bouton, ap || null); }
    document.body.classList.add("mg-actif");
    majPastilles();
  }
  const pastille = n => n > 99 ? "99+" : String(n);
  function majPastilles(){
    const n = actif() ? +resume.nonlus || 0 : 0;
    if (bouton){
      const z = bouton.querySelector(".mg-haut-n");
      z.textContent = pastille(n); z.hidden = !n;
      const t = n ? `Messages : ${n} non lu${n > 1 ? "s" : ""}` : "Messages";
      bouton.setAttribute("aria-label", t); bouton.title = t;
    }
    // onglets « Messages » : espace joueur, onglets de la rubrique, accueil de l'espace club, menu du téléphone
    document.querySelectorAll('[data-mg-onglet-joueur], [data-a="onglet"][data-k="messagerie"]').forEach(b => {
      let p = b.querySelector(".mg-badge");
      if (!p){ p = document.createElement("span"); p.className = "menu-badge mg-badge"; (b.querySelector(".esp-tuile-txt b") || b).appendChild(p); }
      p.textContent = pastille(n); p.hidden = !n;
    });
  }

  /* ---------- bandeau « Active les notifications » ---------- */
  let notifVerif = 0;
  async function etatNotif(){
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return "impossible";
    if (Notification.permission === "denied") return "bloque";
    if (Notification.permission !== "granted") return "a-activer";
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const abo = reg && reg.pushManager && await reg.pushManager.getSubscription();
      return abo ? "ok" : "a-activer";
    } catch(err){ return "a-activer"; }
  }
  async function majNotif(){
    if (!zNotif) return;
    const n = ++notifVerif;
    let masque = !!U().notifMasque; try { masque = masque || sessionStorage.getItem("asfp-mg-notif-masque") === "1"; } catch(err){}
    const etat = await etatNotif();
    if (n !== notifVerif) return;
    let h = "";
    const x = `<button type="button" class="mg-notif-x" data-mg-notif-x aria-label="Masquer ce bandeau">×</button>`;
    if (etat === "a-activer" && !masque)
      h = `<span class="mg-notif-ico" aria-hidden="true">🔔</span><span class="mg-notif-t"><b>Active les notifications pour être prévenu des nouveaux messages</b><small>Même quand le site est fermé, sur ce téléphone ou cet ordinateur.</small></span>
        <button type="button" class="btn bleu petit" data-a="notif-on" data-mg-notif>Activer</button>${x}`;
    else if (etat === "bloque" && !masque)
      h = `<span class="mg-notif-ico" aria-hidden="true">🔕</span><span class="mg-notif-t"><b>Les notifications sont bloquées sur cet appareil</b><small>Pour être prévenu des nouveaux messages, autorise-les pour ce site dans les réglages du navigateur ou du téléphone.</small></span>${x}`;
    else if (etat === "impossible" && !masque && doigt() && location.protocol === "https:" && !(typeof appInstallee === "function" && appInstallee()))
      h = `<span class="mg-notif-ico" aria-hidden="true">🔔</span><span class="mg-notif-t"><b>Pour être prévenu des nouveaux messages, installe le site sur ton téléphone</b><small>Sur iPhone : bouton Partager puis « Sur l'écran d'accueil », puis ouvre-le depuis cette icône.</small></span>${x}`;
    if (zNotif.dataset.h !== h){ zNotif.innerHTML = h; zNotif.dataset.h = h; }
    zNotif.hidden = !h;
  }

  /* ---------- téléphone : mesures pour la conversation en plein écran (en-tête du site, barre du bas, clavier) ---------- */
  function mesurer(){
    if (!racine) return;
    const haut = document.querySelector("header.top"), hh = haut ? haut.offsetHeight : 0;
    const visible = el => !!(el && el.getClientRects().length && getComputedStyle(el).display !== "none" && getComputedStyle(el).visibility !== "hidden");
    const barre = [document.getElementById("esp-barre"), document.getElementById("tabbar-joueur")].find(visible);
    const hb = barre ? barre.getBoundingClientRect().height : 0;
    const vv = window.visualViewport;
    let clavier = 0, dec = 0;
    if (vv){ clavier = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop)); dec = Math.max(0, Math.round(vv.offsetTop)); }
    const r = document.documentElement.style;
    r.setProperty("--mg-top", Math.max(hh, dec) + "px");
    r.setProperty("--mg-bas", (clavier > 80 ? clavier : hb) + "px");
  }
  window.addEventListener("resize", () => { mesurer(); if (racine && racine.isConnected) { afficher(); ajusterSaisie(); } });
  if (window.visualViewport){
    const vvMaj = () => { if (!document.body.classList.contains("mg-plein")) return; const bas = estEnBas(80); mesurer(); if (bas) allerEnBas(); };
    window.visualViewport.addEventListener("resize", vvMaj);
    window.visualViewport.addEventListener("scroll", vvMaj);
  }

  /* ================= BRANCHEMENTS SUR L'APPLICATION ================= */
  // Espace club : l'onglet « messagerie » dans #panneau
  const panneauAvant = window.rendrePanneau;
  window.rendrePanneau = function(){
    if (S.ui.onglet !== "messagerie") return panneauAvant.apply(this, arguments);
    const p = document.getElementById("panneau"); if (!p) return;
    memoriser();
    if (!actif()){
      p.innerHTML = `<div class="mg-app"><div class="mg-etat"><span class="mg-vide-ico" aria-hidden="true">💬</span><b>La messagerie fonctionne avec ton compte du club</b>
        <span>Ouvre le site en ligne et connecte-toi avec ton identifiant pour écrire aux joueurs, aux coachs et au bureau.</span></div></div>`;
      return;
    }
    if (!placer() && !(racine && racine.parentNode === p)) p.textContent = "";
  };
  // l'espace club redessine tout (#espace) avant d'appeler rendrePanneau : on note la position de lecture et le curseur juste avant
  const espaceAvant = window.rendreEspace;
  window.rendreEspace = function(){
    memoriser();
    const forcer = S.ui.onglet === "messagerie" && actif();
    if (forcer) forcage++;
    try { return espaceAvant.apply(this, arguments); }
    finally { if (forcer) queueMicrotask(() => { forcage--; }); demarrerSiPret(); queueMicrotask(majPastilles); }
  };
  // Espace joueur : un 4e onglet « Messages »
  if (typeof window.rendreJoueur === "function"){
    const joueurAvant = window.rendreJoueur;
    window.rendreJoueur = function(){
      memoriser();
      const r = joueurAvant.apply(this, arguments);
      try { ongletJoueur(); } catch(err){ if (window.console) console.warn("messagerie", err); }
      demarrerSiPret();
      return r;
    };
  }
  const SVG_ONGLET = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONE}"/></svg>`;
  function ongletJoueur(){
    const haut = document.getElementById("nav-joueur"), bas = document.getElementById("tabbar-joueur");
    const derniers = haut ? haut.querySelectorAll('[data-a="onglet-joueur"]') : [];
    if (!actif() || !derniers.length) return;
    const on = S.ui.ongletJoueur === "messages";
    if (on){
      document.querySelectorAll('#nav-joueur [data-a="onglet-joueur"], #tabbar-joueur [data-a="onglet-joueur"]').forEach(b => { b.setAttribute("aria-selected", "false"); b.classList.remove("actif"); });
    }
    if (!haut.querySelector("[data-mg-onglet-joueur]"))
      derniers[derniers.length - 1].insertAdjacentHTML("afterend", `<button role="tab" type="button" aria-selected="${on}" data-mg-onglet-joueur>Messages</button>`);
    if (bas && !bas.querySelector("[data-mg-onglet-joueur]")){
      const plus = bas.querySelector("#btn-plus-joueur");
      const h = `<button type="button" class="mg-tab ${on ? "actif" : ""}" data-mg-onglet-joueur>${SVG_ONGLET}Messages</button>`;
      if (plus) plus.insertAdjacentHTML("beforebegin", h); else bas.insertAdjacentHTML("beforeend", h);
    }
    if (on){
      const z = document.getElementById("joueur");
      if (location.hash === "#joueur") placer();
      else if (z && !(racine && racine.parentNode === z)) z.textContent = "";
    }
    majPastilles();
  }
  // en changeant de page (#joueur, #espace…) : la messagerie se remet en place, le bouton 💬 suit
  window.addEventListener("hashchange", () => setTimeout(() => { demarrerSiPret(); placer(); majBouton(); majPastilles(); }, 20));
  // menu du téléphone : il recopie les onglets ; on y remet les pastilles
  document.addEventListener("click", ev => { if (ev.target.closest && ev.target.closest("#btn-menu")) setTimeout(majPastilles, 0); });

  /* ---------- démarrage : dès que le compte est connu ---------- */
  let lance = false;
  function demarrerSiPret(){
    majBouton();
    // compte connu après le premier affichage de l'espace joueur : l'onglet « Messages » y est ajouté maintenant
    try { if (actif() && document.querySelector('#nav-joueur [data-a="onglet-joueur"]') && !document.querySelector("#nav-joueur [data-mg-onglet-joueur]")) ongletJoueur(); } catch(err){}
    if (!actif() || lance) return;
    lance = true;
    chargerResume();
    setTimeout(consommerLien, 0);
  }
  // lien d'une notification : ?conv=ID (gardé le temps de se connecter si besoin, puis retiré de l'adresse)
  const CLE_LIEN = "asfp-mg-lien";
  (function lireLien(){
    try {
      const q = new URLSearchParams(location.search), c = q.get("conv");
      if (!c) return;
      if (/^\d+$/.test(c)) sessionStorage.setItem(CLE_LIEN, JSON.stringify({ conv: +c, t: Date.now() }));
      q.delete("conv");
      const s = q.toString();
      history.replaceState(history.state, "", location.pathname + (s ? "?" + s : "") + location.hash);
    } catch(err){}
  })();
  function consommerLien(){
    let l = null;
    try { l = JSON.parse(sessionStorage.getItem(CLE_LIEN) || "null"); } catch(err){}
    if (!l || !l.conv) return;
    try { sessionStorage.removeItem(CLE_LIEN); } catch(err){}
    if (Date.now() - (l.t || 0) > 30 * 60000) return;
    ouvrirMessagerie({ conv: l.conv });
  }

  /* ---------- relèves : pastille toutes les 30 s (15 s messagerie ouverte), conversation ouverte toutes les 5 s ---------- */
  setInterval(() => {
    if (document.visibilityState !== "visible") return;
    demarrerSiPret();
    if (!actif()) return;
    if (convVisible()) pollConv();
    const ouverte = !!(racine && racine.isConnected && racine.getClientRects().length);
    if (Date.now() - dernierResume >= (ouverte ? 15000 : 30000) - 300) chargerResume();
  }, 5000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !actif()) return;
    chargerResume();
    if (convVisible()) pollConv();
    majNotif();
  });

  /* ================= STYLE ================= */
  const css = document.createElement("style");
  css.id = "onglets-messagerie-css";
  const L = ':root[data-theme="light"]';
  css.textContent = `
/* ----- bouton 💬 de la barre du haut ----- */
.top .mg-haut{position:relative;flex:none;display:grid;place-items:center;width:44px;height:44px;margin-left:10px;border-radius:999px;cursor:pointer;
  border:1px solid rgba(227,182,76,.55);background:rgba(227,182,76,.12);color:#fff;font-size:21px;line-height:1;padding:0;transition:background .15s,transform .15s}
.top .mg-haut:hover{background:rgba(227,182,76,.26);transform:translateY(-1px)}
.top .mg-haut:focus-visible{outline:3px solid #F7D774;outline-offset:2px}
.top .mg-haut-n{position:absolute;top:-5px;right:-6px;min-width:21px;height:21px;padding:0 6px;border-radius:999px;background:#E11D2E;color:#fff;
  font:800 12px/21px var(--corps);text-align:center;box-shadow:0 0 0 2px #0B1633}
.top .mg-haut-n[hidden]{display:none}
body.sur-connexion .top .mg-haut{display:none}
@media (max-width:1140px){
  body.mg-actif .top .mg-haut{order:1;margin-left:0}
  body.mg-actif .top .bt-burger{order:2;margin-left:2px}
}
@media (max-width:620px){ .top .mg-haut{width:42px;height:42px;font-size:20px} }
.mg-badge[hidden]{display:none!important}
#nav-joueur [data-mg-onglet-joueur]{display:inline-flex;align-items:center;gap:6px}
#nav-joueur [data-mg-onglet-joueur] .mg-badge,.drawer-liste [data-mg-onglet-joueur] .mg-badge{margin-left:4px}
.drawer-liste.simple [data-mg-onglet-joueur]{display:flex!important;align-items:center;gap:8px}
#tabbar-joueur .mg-tab{position:relative}
#tabbar-joueur .mg-tab .mg-badge{position:absolute;top:2px;right:18%}

/* ----- l'écran de la messagerie ----- */
.mg-app,.mg-dlg{--mg-fond:#0E1A3D;--mg-carte:#132046;--mg-ligne:rgba(143,168,240,.2);--mg-texte:#EEF2FC;--mg-doux:#AFC0EA;--mg-pale:#8193C4;
  --mg-lui:#1D2E62;--mg-lui-t:#EEF2FC;--mg-fil:#0A1431;--mg-on:rgba(47,107,255,.22);--mg-survol:rgba(143,168,240,.08);
  color:var(--mg-texte);font-family:var(--corps)}
${L} .mg-app,${L} .mg-dlg{--mg-fond:#fff;--mg-carte:#fff;--mg-ligne:#D5DBEA;--mg-texte:#16213F;--mg-doux:#56617E;--mg-pale:#6B7896;
  --mg-lui:#fff;--mg-lui-t:#16213F;--mg-fil:#EAF0FB;--mg-on:rgba(28,79,214,.1);--mg-survol:rgba(28,79,214,.05)}
.mg-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.mg-app [hidden]{display:none!important}
.mg-app .btn{font-family:var(--display)}
/* bandeau des notifications */
.mg-notif{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:0 0 14px;padding:12px 14px 12px 16px;border-radius:16px;
  border:1px solid rgba(227,182,76,.4);background:linear-gradient(90deg,rgba(227,182,76,.16),rgba(227,182,76,.05))}
.mg-notif-ico{font-size:24px;line-height:1}
.mg-notif-t{flex:1 1 260px;min-width:0;display:grid;gap:2px}
.mg-notif-t b{font-size:16px;color:#F7E3A6}
.mg-notif-t small{font-size:14px;color:var(--mg-doux)}
.mg-notif .btn{min-height:44px;padding:8px 20px}
.mg-notif-x{width:40px;height:40px;border-radius:12px;border:0;background:none;color:var(--mg-doux);font-size:26px;line-height:1;cursor:pointer}
.mg-notif-x:hover{background:var(--mg-survol);color:var(--mg-texte)}
${L} .mg-notif-t b{color:#7A5B00}
/* barre du haut : titre et action principale */
.mg-barre{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:0 0 14px}
.mg-barre-txt{min-width:0}
.mg-barre h2{font:800 26px var(--display);margin:0;letter-spacing:.2px;color:var(--mg-texte)}
.mg-barre p{margin:4px 0 0;color:var(--mg-doux);font-size:15px}
.mg-barre .btn{min-height:50px;font-size:16px;padding:12px 22px;display:inline-flex;align-items:center;gap:8px}
/* deux colonnes : la liste | la conversation */
.mg-grille{display:grid;grid-template-columns:minmax(290px,370px) minmax(0,1fr);height:calc(100vh - 110px);height:calc(100dvh - 110px);min-height:500px;max-height:880px;
  border:1px solid var(--mg-ligne);border-radius:20px;overflow:hidden;background:var(--mg-carte);box-shadow:0 18px 40px rgba(0,0,0,.25)}
${L} .mg-grille{box-shadow:0 10px 30px rgba(15,34,87,.1)}
@media (max-width:1140px){ .mg-grille{height:calc(100dvh - 190px)} }
.mg-gauche{min-height:0;display:flex;flex-direction:column;border-right:1px solid var(--mg-ligne);background:var(--mg-fond)}
.mg-liste-zone{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:8px}
.mg-liste{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.mg-it{width:100%;display:flex;align-items:center;gap:12px;padding:11px 10px;border:0;border-radius:14px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;min-height:72px}
.mg-it:hover{background:var(--mg-survol)}
.mg-it:focus-visible{outline:3px solid #7FA6FF;outline-offset:-3px}
.mg-it.on{background:var(--mg-on);box-shadow:inset 3px 0 0 #2F6BFF}
.mg-it-c{flex:1;min-width:0;display:grid;gap:1px}
.mg-it-l1,.mg-it-l3{display:flex;align-items:center;gap:8px;min-width:0}
.mg-it-titre{flex:1;min-width:0;font-size:16.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-it-h{flex:none;font-size:12.5px;color:var(--mg-pale);white-space:nowrap}
.mg-it.nonlu .mg-it-titre{font-weight:800}
.mg-it.nonlu .mg-it-h{color:#4ADE80;font-weight:700}
.mg-it-l2{font-size:12.5px;color:var(--mg-pale);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-it-ap{flex:1;min-width:0;font-size:14.5px;color:var(--mg-doux);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-it-ap b{font-weight:700;color:var(--mg-texte)}
.mg-it-ap i{opacity:.8}
.mg-it.nonlu .mg-it-ap{color:var(--mg-texte)}
.mg-brouillon{color:#F59E0B!important}
.mg-it-muet{flex:none;font-size:13px;opacity:.75}
.mg-pastille{flex:none;min-width:22px;height:22px;padding:0 7px;border-radius:999px;background:#16A34A;color:#fff;font:800 12.5px/22px var(--corps);text-align:center}
${L} .mg-it.nonlu .mg-it-h{color:#15803D}
/* avatars */
.mg-av{--av:#2F6BFF;flex:none;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font:800 17px var(--display);letter-spacing:.3px;color:#fff;
  background:var(--av);background:linear-gradient(135deg,color-mix(in srgb,var(--av) 78%,#fff),var(--av));box-shadow:inset 0 0 0 2px rgba(255,255,255,.14)}
.mg-av-groupe{color:#0B1633;background:linear-gradient(135deg,#F7D774,#C9A227);font-size:16px;border-radius:16px}
.mg-av-tete{width:42px;height:42px;font-size:15px}
.mg-av-mini{width:30px;height:30px;font-size:12px}
/* colonne de droite */
.mg-droite{min-width:0;min-height:0;display:flex;flex-direction:column;background:var(--mg-fil)}
.mg-vide{flex:1;display:grid;place-items:center;padding:30px}
.mg-vide-c{display:grid;justify-items:center;gap:8px;text-align:center;max-width:380px;color:var(--mg-doux)}
.mg-vide-c b{font:800 22px var(--display);color:var(--mg-texte)}
.mg-vide-c .btn{margin-top:8px;min-height:48px;display:inline-flex;align-items:center;gap:8px}
.mg-vide-ico{font-size:44px;line-height:1;filter:drop-shadow(0 6px 14px rgba(0,0,0,.25))}
.mg-conv,.mg-choix{flex:1;min-height:0;display:flex;flex-direction:column}
.mg-tete{position:relative;flex:none;display:flex;align-items:center;gap:12px;padding:10px 16px;min-height:66px;border-bottom:1px solid var(--mg-ligne);background:var(--mg-carte);flex-wrap:wrap}
.mg-tete-txt{flex:1;min-width:0;display:grid;justify-items:start}
.mg-tete-txt b{font:800 21px/1.15 var(--display);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-tete-txt small{font-size:13.5px;color:var(--mg-doux);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-retour{display:none;flex:none;width:44px;height:44px;margin-left:-8px;border-radius:12px;border:0;background:none;color:var(--mg-texte);font-size:24px;cursor:pointer}
.mg-retour:hover{background:var(--mg-survol)}
.mg-membres-bt{border:0;background:none;padding:2px 0;color:var(--mg-doux);font:600 13.5px var(--corps);cursor:pointer;text-decoration:underline dotted;text-underline-offset:3px}
.mg-membres-bt:hover{color:var(--mg-texte)}
.mg-effacer{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:6px 14px;border-radius:999px;border:1px solid rgba(248,113,113,.45);background:none;color:#FCA5A5;font:700 13.5px var(--corps);cursor:pointer}
.mg-effacer:hover{background:rgba(220,38,38,.14)}
:root[data-theme="light"] .mg-effacer{color:#B91C1C;border-color:#F87171}
.mg-muet{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:6px 14px;border-radius:999px;border:1px solid var(--mg-ligne);background:none;
  color:var(--mg-doux);font:700 14px var(--corps);cursor:pointer}
.mg-muet:hover{color:var(--mg-texte);border-color:rgba(143,168,240,.5)}
.mg-muet.on{color:#FCD34D;border-color:rgba(252,211,77,.5);background:rgba(252,211,77,.1)}
${L} .mg-muet.on{color:#8A6100;background:rgba(227,182,76,.15)}
.mg-membres{flex-basis:100%;max-height:220px;overflow:auto;border-top:1px solid var(--mg-ligne);margin:6px -16px -10px;padding:8px 16px}
.mg-membres ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px 14px}
.mg-membres li{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto;column-gap:10px;align-items:center}
.mg-membres li .mg-av{grid-row:span 2}
.mg-membres li b{font-size:14.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-membres li small{font-size:12.5px;color:var(--mg-doux)}
/* le fil */
.mg-fil-cadre{position:relative;flex:1;min-height:0;display:flex}
.mg-fil{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:14px 18px 10px;display:flex;flex-direction:column;gap:3px;
  background:radial-gradient(120% 70% at 0% 0%,rgba(47,107,255,.08),transparent 60%),radial-gradient(90% 60% at 100% 100%,rgba(227,182,76,.05),transparent 60%),var(--mg-fil)}
.mg-fil:focus-visible{outline:3px solid #7FA6FF;outline-offset:-3px}
.mg-haut-fil{display:flex;justify-content:center;padding:4px 0 10px}
.mg-plus{min-height:40px;padding:8px 16px;border-radius:999px;border:1px solid var(--mg-ligne);background:var(--mg-carte);color:var(--mg-texte);font:700 14px var(--corps);cursor:pointer}
.mg-plus:hover{border-color:#7FA6FF}
.mg-debut{font-size:13px;color:var(--mg-pale);padding:6px 12px;border-radius:999px;background:rgba(143,168,240,.08);text-align:center}
.mg-sep{display:flex;justify-content:center;margin:12px 0 8px}
.mg-sep span{font:700 12.5px var(--corps);padding:5px 12px;border-radius:10px;background:rgba(19,32,70,.92);color:#C9D4F2;box-shadow:0 2px 6px rgba(0,0,0,.2)}
.mg-sep-nl span{background:rgba(227,182,76,.2);color:#F7E3A6}
${L} .mg-sep span{background:#fff;color:var(--texte-doux);box-shadow:0 1px 3px rgba(15,34,87,.12)}
${L} .mg-sep-nl span{background:#FFF4D6;color:#7A5B00}
.mg-l{display:flex;align-items:flex-end;gap:8px;max-width:100%;margin-top:7px}
.mg-l.mg-suite{margin-top:0}
.mg-l.mg-moi{flex-direction:row-reverse}
.mg-b{position:relative;max-width:min(78%,560px);padding:7px 11px 7px 12px;border-radius:16px;background:var(--mg-lui);color:var(--mg-lui-t);
  box-shadow:0 1px 2px rgba(0,0,0,.22);overflow-wrap:anywhere;min-width:0}
.mg-lui:not(.mg-suite) .mg-b{border-top-left-radius:5px}
.mg-moi .mg-b{background:linear-gradient(160deg,#3A76FF,#1C4FD6);color:#fff}
.mg-moi:not(.mg-suite) .mg-b{border-top-right-radius:5px}
${L} .mg-lui .mg-b{box-shadow:0 1px 2px rgba(15,34,87,.15)}
.mg-auteur{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin:0 0 2px}
.mg-auteur b{font-size:14px;color:#9FB8FF;color:color-mix(in srgb,var(--c) 55%,#fff)}
.mg-auteur small{font-size:12px;color:var(--mg-pale)}
${L} .mg-auteur b{color:color-mix(in srgb,var(--c) 85%,#000)}
.mg-t{font-size:16px;line-height:1.4;white-space:pre-wrap}
.mg-t::after{content:"";display:inline-block;width:46px}
.mg-tmp .mg-t::after{width:86px}
.mg-t a{color:inherit;text-decoration:underline;text-underline-offset:2px;font-weight:600}
.mg-lui .mg-t a{color:#93B4FF}
${L} .mg-lui .mg-t a{color:#1C4FD6}
.mg-t-suppr{font-style:italic;opacity:.75}
.mg-meta{position:absolute;right:10px;bottom:5px;display:flex;align-items:center;gap:6px;font-size:11.5px;line-height:1;color:var(--mg-pale);white-space:nowrap}
.mg-moi .mg-meta{color:rgba(255,255,255,.78)}
.mg-envoi{font-style:italic}
.mg-tmp .mg-b{opacity:.75}
.mg-suppr{flex:none;align-self:center;min-height:34px;padding:4px 12px;border-radius:999px;border:1px solid rgba(239,68,68,.45);background:var(--mg-carte);color:#FCA5A5;
  font:700 13px var(--corps);cursor:pointer;opacity:0;pointer-events:none;transition:opacity .15s}
.mg-suppr:hover{background:rgba(239,68,68,.14)}
${L} .mg-suppr{color:#B91C1C}
@media (hover:hover){ .mg-l:hover .mg-suppr{opacity:1;pointer-events:auto} }
.mg-l.mg-choisi .mg-suppr,.mg-suppr:focus-visible{opacity:1;pointer-events:auto}
.mg-l.mg-choisi .mg-b{outline:2px solid rgba(127,166,255,.6);outline-offset:1px}
/* « ⋯ » sur les messages des autres : au survol sur ordinateur, discret mais toujours là sur téléphone */
.mg-act{flex:none;align-self:center;display:grid;place-items:center;width:34px;height:34px;padding:0;border-radius:50%;border:0;background:none;color:var(--mg-pale);
  font:800 20px/1 var(--corps);cursor:pointer;opacity:0;transition:opacity .15s,background .15s}
.mg-act:hover{background:var(--mg-survol);color:var(--mg-texte)}
.mg-act:focus-visible{opacity:1;outline:3px solid #7FA6FF;outline-offset:1px}
@media (hover:hover){ .mg-l:hover .mg-act{opacity:1} }
@media (hover:none){ .mg-act{opacity:.5} }
.mg-l.mg-choisi .mg-act{opacity:1}
/* « Bloquer » dans l'en-tête d'une conversation privée */
.mg-bloquer{flex:none;display:inline-flex;align-items:center;gap:8px;min-height:40px;padding:6px 14px;border-radius:999px;border:1px solid var(--mg-ligne);background:none;
  color:var(--mg-doux);font:700 13.5px var(--corps);cursor:pointer}
.mg-bloquer:hover{color:var(--mg-texte);border-color:rgba(248,113,113,.5);background:rgba(220,38,38,.1)}
/* sous la liste des conversations */
.mg-pied{flex:none;display:flex;flex-wrap:wrap;gap:4px 10px;justify-content:center;padding:8px 10px 10px;border-top:1px solid var(--mg-ligne)}
.mg-pied-bt{min-height:40px;padding:6px 12px;border-radius:10px;border:0;background:none;color:var(--mg-doux);font:600 13.5px var(--corps);cursor:pointer}
.mg-pied-bt:hover{color:var(--mg-texte);background:var(--mg-survol)}
.mg-pied-bt:focus-visible{outline:3px solid #7FA6FF;outline-offset:-2px}
/* la fenêtre : menu d'un message, signaler, bloquer, personnes bloquées, messages signalés */
.mg-dlg{width:min(460px,calc(100vw - 32px));max-width:none;max-height:min(86vh,760px);margin:auto;padding:0;border:1px solid var(--mg-ligne);border-radius:20px;
  background:var(--mg-carte);color:var(--mg-texte);font-family:var(--corps);box-shadow:0 24px 70px rgba(0,0,0,.5);overflow:hidden}
.mg-dlg::backdrop{background:rgba(3,8,23,.62)}
.mg-dlg.sans-modal{position:fixed;inset:0;z-index:2000;height:fit-content}
.mg-dlg-c{display:grid;gap:12px;padding:18px 18px 16px;max-height:min(86vh,760px);overflow:auto;overscroll-behavior:contain}
.mg-dlg-tete{display:grid;gap:6px}
.mg-dlg-tete b{font:800 21px/1.2 var(--display);outline:none}
.mg-dlg-tete p{margin:0;color:var(--mg-doux);font-size:15px;line-height:1.45}
.mg-dlg-extrait{padding:9px 12px;border-radius:12px;background:var(--mg-fil);color:var(--mg-texte)!important;font-style:italic;overflow-wrap:anywhere}
.mg-dlg-actions{display:grid;gap:6px}
.mg-dlg-bt{display:flex;align-items:center;gap:12px;width:100%;min-height:52px;padding:10px 14px;border-radius:14px;border:1px solid var(--mg-ligne);background:var(--mg-fond);
  color:var(--mg-texte);font:700 16px var(--corps);text-align:left;cursor:pointer}
.mg-dlg-bt:hover:not(:disabled){border-color:#7FA6FF;background:var(--mg-survol)}
.mg-dlg-bt:focus-visible{outline:3px solid #7FA6FF;outline-offset:1px}
.mg-dlg-bt:disabled{opacity:.7;cursor:default}
.mg-dlg-bt.rouge{color:#FCA5A5}
.mg-dlg-bt.doux{justify-content:center;border-color:transparent;background:none;color:var(--mg-doux)}
${L} .mg-dlg-bt.rouge{color:#B91C1C}
.mg-dlg-form{display:grid;gap:10px}
.mg-dlg-label{display:block;margin:0;font-weight:700;font-size:15px}
.mg-dlg-label small{display:inline;font-weight:400;font-size:14px;color:var(--mg-doux)}
.mg-dlg-motif{width:100%;min-height:76px;resize:vertical;padding:10px 14px;border-radius:14px;border:1px solid var(--mg-ligne);background:var(--mg-fil);color:var(--mg-texte);font:16px/1.35 var(--corps)}
.mg-dlg-motif:focus{outline:none;border-color:#5B8CFF;box-shadow:0 0 0 3px rgba(91,140,255,.25)}
.mg-dlg-effets{margin:0;padding:0 0 0 20px;display:grid;gap:7px;font-size:15px;line-height:1.45}
.mg-dlg-note{margin:0;font-size:14px;color:var(--mg-doux)}
.mg-dlg-case{display:flex;align-items:flex-start;gap:12px;padding:10px 12px;border-radius:14px;border:1px solid var(--mg-ligne);background:var(--mg-fond);cursor:pointer}
.mg-dlg-case[hidden]{display:none}
.mg-dlg-case:has(input:checked){border-color:#7FA6FF}
.mg-dlg-case input{flex:none;width:22px;height:22px;margin:1px 0 0;accent-color:#2F6BFF;cursor:pointer}
.mg-dlg-case span{display:grid;gap:3px;min-width:0}
.mg-dlg-case b{font-size:15px}
.mg-dlg-case small{color:var(--mg-doux);font-size:13px;font-style:italic;overflow-wrap:anywhere}
.mg-dlg-btns{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;margin-top:4px}
.mg-dlg .btn{font-family:var(--display);min-height:46px;display:inline-flex;align-items:center;justify-content:center;gap:8px}
.mg-dlg .btn.petit{min-height:38px}
.mg-dlg-erreur{margin:0;padding:8px 12px;border-radius:12px;background:rgba(225,29,46,.14);border:1px solid rgba(225,29,46,.45);color:#FECACA;font-size:14px}
${L} .mg-dlg-erreur{color:#991B1B;background:#FEE2E2}
.mg-dlg-info{margin:0;font-size:14px;color:#4ADE80}
.mg-dlg-info:empty{display:none}
${L} .mg-dlg-info{color:#15803D}
.mg-dlg-vide{margin:0;padding:16px 4px;text-align:center;color:var(--mg-doux)}
.mg-dlg-vide.mg-charge{display:flex;align-items:center;justify-content:center;gap:10px}
.mg-dlg-bloques,.mg-dlg-sigs{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.mg-dlg-bloques li{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:14px;background:var(--mg-fond)}
.mg-dlg-bloques li b{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-sig{display:grid;gap:6px;justify-items:start;padding:10px 12px;border-radius:14px;background:var(--mg-fond);border:1px solid var(--mg-ligne)}
.mg-sig-l1{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.mg-sig-l1 small,.mg-sig-par{font-size:13px;color:var(--mg-doux);line-height:1.4}
.mg-sig-t{font-size:15px;line-height:1.4;white-space:pre-wrap;overflow-wrap:anywhere}
.mg-sig-t a{color:inherit;text-decoration:underline}
.mg-sig-etat{font-size:13px;font-weight:700;color:#FCA5A5}
${L} .mg-sig-etat{color:#B91C1C}
.mg-nouveaux{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);min-height:38px;padding:8px 16px;border-radius:999px;border:0;
  background:#2F6BFF;color:#fff;font:700 14px var(--corps);box-shadow:0 8px 20px rgba(0,0,0,.35);cursor:pointer}
/* zone de saisie */
.mg-saisie{flex:none;padding:10px 14px 12px;border-top:1px solid var(--mg-ligne);background:var(--mg-carte);display:grid;gap:6px}
.mg-saisie-l{display:flex;align-items:flex-end;gap:10px}
.mg-saisie textarea{flex:1;min-width:0;min-height:44px;max-height:180px;resize:none;padding:11px 16px;border-radius:22px;border:1px solid var(--mg-ligne);
  background:var(--mg-fil);color:var(--mg-texte);font:16px/1.35 var(--corps);overflow-y:hidden}
.mg-saisie textarea:focus{outline:none;border-color:#5B8CFF;box-shadow:0 0 0 3px rgba(91,140,255,.25)}
.mg-saisie textarea::placeholder{color:var(--mg-pale)}
.mg-envoyer{flex:none;width:48px;height:48px;border-radius:50%;border:0;display:grid;place-items:center;cursor:pointer;color:#fff;
  background:linear-gradient(160deg,#3A76FF,#1C4FD6);box-shadow:0 6px 16px rgba(47,107,255,.35);transition:transform .12s,opacity .12s}
.mg-envoyer svg{width:23px;height:23px;fill:none;stroke:currentColor;stroke-width:2;stroke-linejoin:round;stroke-linecap:round;margin-left:-2px}
.mg-envoyer:hover:not(:disabled){transform:scale(1.05)}
.mg-envoyer:disabled{opacity:.45;cursor:default;box-shadow:none}
.mg-envoyer:focus-visible{outline:3px solid #F7D774;outline-offset:2px}
.mg-erreur{margin:0;padding:8px 12px;border-radius:12px;background:rgba(225,29,46,.14);border:1px solid rgba(225,29,46,.45);color:#FECACA;font-size:14px}
${L} .mg-erreur{color:#991B1B;background:#FEE2E2}
.mg-compteur{justify-self:end;font-size:12.5px;color:var(--mg-pale)}
.mg-compteur.trop{color:#F87171;font-weight:700}
/* choisir un contact */
.mg-cherche{flex:none;padding:12px 16px;border-bottom:1px solid var(--mg-ligne);background:var(--mg-carte)}
.mg-cherche input{width:100%;min-height:46px;padding:10px 16px;border-radius:14px;border:1px solid var(--mg-ligne);background:var(--mg-fil);color:var(--mg-texte);font:16px var(--corps)}
.mg-cherche input:focus{outline:none;border-color:#5B8CFF;box-shadow:0 0 0 3px rgba(91,140,255,.25)}
.mg-choix-liste{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;padding:6px 10px 16px}
.mg-famille h3{display:flex;align-items:center;gap:8px;margin:14px 8px 6px;font:800 12.5px var(--corps);letter-spacing:.12em;text-transform:uppercase;color:var(--mg-doux)}
.mg-nb{min-width:22px;height:22px;padding:0 7px;border-radius:999px;display:inline-grid;place-items:center;background:rgba(143,168,240,.16);color:var(--mg-texte);font:800 11.5px var(--corps);letter-spacing:0}
.mg-famille ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.mg-ct{width:100%;display:flex;align-items:center;gap:12px;padding:9px 10px;min-height:62px;border:0;border-radius:14px;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
.mg-ct:hover{background:var(--mg-survol)}
.mg-ct:focus-visible{outline:3px solid #7FA6FF;outline-offset:-3px}
.mg-ct .mg-av{width:42px;height:42px;font-size:15px}
.mg-ct-c{flex:1;min-width:0;display:grid}
.mg-ct-c b{font-size:16px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-ct-c small{font-size:13.5px;color:var(--mg-doux);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mg-fl{color:var(--mg-pale);font-size:22px}
/* états : chargement, vide, erreur */
.mg-etat{display:grid;justify-items:center;gap:8px;text-align:center;padding:34px 18px;color:var(--mg-doux)}
.mg-etat b{font:800 19px var(--display);color:var(--mg-texte)}
.mg-etat span{max-width:420px;line-height:1.45}
.mg-etat .btn{margin-top:6px;min-height:46px;display:inline-flex;align-items:center;gap:8px}
.mg-charge{grid-auto-flow:column;justify-content:center;align-items:center;padding:24px}
.mg-roue{width:20px;height:20px;border-radius:50%;border:3px solid rgba(143,168,240,.25);border-top-color:#7FA6FF;animation:mg-tourne .8s linear infinite}
@keyframes mg-tourne{to{transform:rotate(360deg)}}
/* tablette et téléphone : une colonne à la fois */
@media (max-width:860px){
  .mg-barre{align-items:stretch;margin-bottom:12px}
  .mg-barre h2{font-size:24px}
  .mg-barre .btn{width:100%;justify-content:center}
  .mg-grille{display:block;height:auto;min-height:0;max-height:none;border:0;border-radius:0;background:none;box-shadow:none;overflow:visible}
  .mg-gauche{border:1px solid var(--mg-ligne);border-radius:18px;overflow:hidden}
  .mg-liste-zone{overflow:visible;padding:6px}
  .mg-droite{display:none}
  .mg-retour{display:grid;place-items:center}
  /* la conversation, ou le choix d'un contact : tout l'écran, entre l'en-tête du site et la barre du bas (ou le clavier) */
  .mg-app.mg-vue-conv .mg-droite,.mg-app.mg-vue-nouveau .mg-droite{display:flex;position:fixed;left:0;right:0;top:var(--mg-top,58px);bottom:var(--mg-bas,0px);z-index:19;
    border-top:1px solid var(--mg-ligne);box-shadow:0 -6px 20px rgba(0,0,0,.25)}
  .mg-tete{padding:8px 12px;min-height:60px;gap:10px}
  .mg-tete-txt b{font-size:19px}
  .mg-muet{padding:6px 10px;min-width:44px;min-height:44px;justify-content:center}
  .mg-effacer{padding:6px 10px;min-width:44px;min-height:44px;justify-content:center}
  .mg-effacer .mg-muet-t{display:none}
  .mg-bloquer{padding:6px 10px;min-width:44px;min-height:44px;justify-content:center}
  .mg-bloquer .mg-muet-t{display:none}
  .mg-act{width:40px;height:40px}
  .mg-dlg{width:100%;max-width:100%;margin:auto 0 0;border-radius:22px 22px 0 0;border-width:1px 0 0}
  .mg-dlg-c{padding:18px 16px calc(14px + env(safe-area-inset-bottom,0px))}
  .mg-dlg-btns .btn{flex:1 1 140px}
  .mg-muet-t{display:none}
  .mg-membres{margin:6px -12px -8px;padding:8px 12px}
  .mg-fil{padding:10px 10px 8px}
  .mg-b{max-width:84%}
  .mg-saisie{padding:8px 10px calc(8px + env(safe-area-inset-bottom,0px))}
  .mg-saisie-l{gap:8px}
  .mg-suppr{min-height:40px}
  .mg-notif{padding:10px 12px}
  .mg-notif .btn{flex:1 1 auto}
  .mg-sep{margin:10px 0 6px}
}
body.mg-plein.avec-barre .mg-app .mg-saisie{padding-bottom:8px}
body.mg-plein #asf-maj{display:none}
/* la page visible garde une transformation (fin de son animation d'arrivée) : elle ferait de la conversation « plein écran »
   un bloc fixé à la page au lieu de l'écran */
body.mg-plein #p-espace,body.mg-plein #p-joueur{transform:none!important;animation:none!important;filter:none!important}
@media (prefers-reduced-motion:reduce){ .mg-roue{animation:none} }
`;
  document.head.appendChild(css);

  // si l'espace est déjà affiché (module chargé après le démarrage), on le redessine avec l'onglet ajouté
  setTimeout(() => { try { demarrerSiPret(); if (document.getElementById("panneau") && S.ui.onglet === "messagerie") rendreEspace(); placer(); } catch(err){} }, 0);
})();
