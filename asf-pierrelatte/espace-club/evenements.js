/* Onglet « Événements » (rubrique Communication) : affiches stage, loto, tournoi.
   Le dirigeant écrit ce qui doit être sur l'affiche et le message de l'annonce ; le serveur dessine l'affiche
   (api/affiches.php?apercu=evenement) au format story 1080 × 1920 ou annonce 1080 × 1350 (Facebook et Instagram la montrent
   en entier dans le fil). On l'enregistre pour la poster soi-même, ou on la publie : story Facebook, story Instagram
   ou les deux, annonce Facebook, annonce Instagram ou les deux (envoi à api/publier.php, comme « Publier une affiche
   déjà faite »). Ajouté sans modifier le script de l'application : nouvel onglet, rendu de son panneau, raccourci depuis
   l'onglet Affiches et bouton « Créer l'affiche » sur chaque stage. Les brouillons restent dans ce navigateur.
   Ce fichier fournit aussi window.ASFP_AFF, des outils communs avec l'onglet « Affiches matchs ». */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONGLETS === "undefined" || typeof RUBRIQUES === "undefined" || typeof rendrePanneau !== "function") return;

  /* ================= outils communs (aussi utilisés par affiches-matchs.js) ================= */
  // les émojis ne vont que dans le message : la police de l'affiche ne les a pas
  const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{200D}\u{20E3}\u{E0020}-\u{E007F}]/gu;
  const sansEmoji = s => String(s || "").split("\n").map(l => l.replace(EMOJI, "").replace(/[ \t]{2,}/g, " ").trim()).join("\n");
  const aEmoji = s => { EMOJI.lastIndex = 0; const r = EMOJI.test(String(s || "")); EMOJI.lastIndex = 0; return r; };
  const couper = (s, n) => Array.from(String(s || "")).slice(0, n).join("");
  const RESEAUX = { fb: "Facebook", ig: "Instagram" };
  /* états renvoyés par publier.php pour un envoi → réseau par réseau, publié ou non */
  /* publié seulement si la ligne du réseau dit exactement « Facebook : publié » (publier.php écrit sinon l'erreur après les deux-points) ;
     un réseau sans ligne à lui reste inconnu : pas compté comme publié */
  const PUBLIE = /^\s*(facebook|instagram)\s*:\s*publi(é|ée|és|ées)\s*\.?\s*$/i;
  function lireEtats(etats, x){
    const l = (etats || []).map(String);
    const res = {};
    for (const k of ["fb", "ig"]) if (x[k]){
      const miens = l.filter(s => s.trim().toLowerCase().startsWith(RESEAUX[k].toLowerCase()));
      res[k] = miens.length ? miens.every(s => PUBLIE.test(s)) : null;
    }
    return { ok: Object.values(res).every(v => v === true), res, texte: l.join(" · ") };
  }
  /* série d'envois à publier.php, l'un après l'autre ; après un échec, les cases déjà parties sont décochées
     pour qu'un nouveau clic n'envoie que le reste. x.cle(k) donne la case de x pour le réseau k (fb_pub, ig_story…). */
  async function serieDePublication({ envois, pub, dire, preparer }){
    const lignes = [], CASES = ["fb_pub", "ig_pub", "fb_story", "ig_story"];
    if (!pub._choix) pub._choix = Object.fromEntries(CASES.filter(k => k in pub).map(k => [k, !!pub[k]]));   // les choix de départ, rendus à la fin
    let erreur = null, incomplet = false;
    for (const [i, x] of envois.entries()){
      const pre = `${i + 1}/${envois.length} · ${x.nom} : `;
      if (erreur){ lignes.push(`⏸️ ${x.nom} : pas envoyé`); incomplet = true; continue; }
      try {
        dire(pre + "préparation…");
        const fichiers = await preparer(x);
        const fd = new FormData();
        fichiers.forEach(f => fd.append("medias[]", f));
        fd.append("texte", x.texte || "");
        fd.append("facebook", x.fb ? "1" : "0"); fd.append("instagram", x.ig ? "1" : "0");
        fd.append("publication", x.pub ? "1" : "0"); fd.append("story", x.story ? "1" : "0");
        const r = await lancerPublication((window.ASFP_API || "/api") + "/publier.php", { method: "POST", body: fd }, m => dire(pre + m));
        const b = lireEtats(r, x);
        lignes.push(`${b.ok ? "✅" : "⚠️"} ${x.nom} : ${b.texte || "pas de réponse détaillée, regarde sur la page avant de republier"}`);
        for (const k of ["fb", "ig"]) if (x[k] && b.res[k] === true) pub[x.cle(k)] = false;  // parti : décoché (recoché plus bas si tout est bon)
        if (!b.ok) incomplet = true;
      } catch(err){
        erreur = err; incomplet = true;
        // délai de 10 minutes dépassé : la publication a souvent abouti, on la compte comme partie
        const peutEtre = /10 minutes/.test(err.message);
        lignes.push(`${peutEtre ? "⏳" : "❌"} ${x.nom} : ${err.message}`);
        if (peutEtre){ for (const k of ["fb", "ig"]) if (x[k]) pub[x.cle(k)] = false; }
      }
    }
    if (!incomplet){                                                     // tout est parti : on rend les choix du premier clic
      for (const x of envois) for (const k of ["fb", "ig"]) if (x[k]) pub[x.cle(k)] = true;
      if (pub._choix) Object.assign(pub, pub._choix);
      delete pub._choix;
    }
    const etat = (incomplet ? "⚠️ Publication incomplète. Les cases déjà publiées sont décochées : reclique sur « Publier maintenant » pour envoyer le reste.\n" : "✅ Publié.\n") + lignes.join("\n");
    return { toutBon: !incomplet, etat };
  }
  /* enregistrer une image : sur téléphone, la feuille de partage (« Enregistrer l'image » la range dans Photos,
     là où Instagram et Facebook la cherchent) ; sinon un téléchargement normal */
  function enregistrerImage(blob, nom){
    const f = new File([blob], nom, { type: blob.type || "image/jpeg" });
    const u = URL.createObjectURL(blob);
    let partage = false;
    try { partage = !!(navigator.canShare && navigator.canShare({ files: [f] })); } catch(e){}
    const tactile = window.matchMedia && matchMedia("(pointer:coarse)").matches;
    if (!(partage && tactile)){
      const a = document.createElement("a"); a.href = u; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(u), 60000);
      return;
    }
    const fond = document.createElement("div");
    fond.className = "aff-partage";
    fond.innerHTML = `<div class="aff-partage-boite" role="dialog" aria-label="Enregistrer l'affiche">
      <img src="${u}" alt="Affiche">
      <button type="button" class="btn bleu" data-p="partager">📲 Enregistrer dans Photos ou partager</button>
      <a class="btn contour" href="${u}" download="${esc(nom)}">⬇️ Télécharger le fichier</a>
      <p class="quoi">Sur iPhone : « Enregistrer l'image » la range dans Photos. Tu peux aussi appuyer longuement sur l'image.</p>
      <button type="button" class="btn contour" data-p="fermer">Fermer</button></div>`;
    const fermer = () => { fond.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); };
    fond.addEventListener("click", async ev => {
      const b = ev.target.closest("[data-p]");
      if (ev.target === fond || (b && b.dataset.p === "fermer")){ fermer(); return; }
      if (b && b.dataset.p === "partager"){ try { await navigator.share({ files: [f] }); fermer(); } catch(e){ if (e && e.name !== "AbortError") toast("Partage impossible : appuie longuement sur l'image.", true); } }
    });
    document.body.appendChild(fond);
  }
  /* taille de l'aperçu : il doit tenir en entier dans la hauteur de l'écran */
  const styleCadre = ratio => { const [a, b] = ratio.split("/").map(Number); return `aspect-ratio:${ratio};width:min(100%, calc((100dvh - 230px) * ${(a / b).toFixed(4)}))`; };
  window.ASFP_AFF = { sansEmoji, aEmoji, couper, serieDePublication, enregistrerImage, styleCadre };

  /* ================= onglet Événements ================= */
  const STADE = "Stade Gustave Jaume, Pierrelatte";
  const TYPES = {
    stage:   { ico: "⚽", nom: "Stage",   titre: "Stage de foot", tags: "#StageFoot", lieu: STADE,
               ex: { titre: "Stage de la Toussaint", sous: "Du 19 au 23 octobre 2026", lieu: STADE,
                     texte: "Le matin de 9h à 12h\nL'après-midi de 13h30 à 16h30\nRepas du midi à apporter" } },
    loto:    { ico: "🎟️", nom: "Loto",    titre: "Grand loto du club", tags: "#Loto", lieu: "",
               ex: { titre: "Grand loto du club", sous: "Plus de 3 000 € de lots", lieu: "Salle des fêtes, Pierrelatte",
                     texte: "Ouverture des portes à 18h30\nBuvette et petite restauration sur place\n3 € le carton · 15 € les 6" } },
    tournoi: { ico: "🏆", nom: "Tournoi", titre: "Tournoi du club", tags: "#Tournoi", lieu: STADE,
               ex: { titre: "Tournoi de Pâques U11", sous: "24 équipes · 2 terrains", lieu: STADE,
                     texte: "Remise des récompenses à 17h\nBuvette et grillades toute la journée" } },
    autre:   { ico: "📣", nom: "Autre",   titre: "Événement du club", tags: "", lieu: "",
               ex: { titre: "Repas du club", sous: "Ouvert à tous", lieu: "Club-house du stade",
                     texte: "Apéritif offert à 19h\nRéservations auprès des dirigeants" } },
  };
  // l'annonce est en 4:5 (1080 × 1350) : Facebook et Instagram la montrent en entier dans le fil (une image plus haute est coupée)
  const FORMATS = [["story", "Story", "1080 × 1920", "9/16", "story Facebook et Instagram"], ["carre", "Annonce", "1080 × 1350", "4/5", "annonce Facebook et Instagram"]];
  const MAX_LIGNES = 8;

  /* ---------- état (gardé dans ce navigateur) ---------- */
  const CLE = "asfp-evenements";
  const vierge = t => ({ titre: "", sous: "", date: "", heure: "", lieu: TYPES[t].lieu, texte: "", sponsors: true, msg: "", msgLibre: false, stageId: "" });
  function charger(){
    let d = null;
    try { d = JSON.parse(localStorage.getItem(CLE) || "null"); } catch(e){}
    const E = { type: "stage", fmt: "carre", pub: { fb_pub: true, ig_pub: true, fb_story: false, ig_story: false }, brouillons: {}, etat: "", enCours: "" };
    if (d && typeof d === "object"){
      if (TYPES[d.type]) E.type = d.type;
      if (FORMATS.some(f => f[0] === d.fmt)) E.fmt = d.fmt;
      if (d.pub && typeof d.pub === "object") for (const k of Object.keys(E.pub)) if (typeof d.pub[k] === "boolean") E.pub[k] = d.pub[k];
      if (d.pub && d.pub._choix && typeof d.pub._choix === "object") E.pub._choix = { ...d.pub._choix };
      if (d.brouillons && typeof d.brouillons === "object") for (const t of Object.keys(TYPES)) if (d.brouillons[t]) E.brouillons[t] = { ...vierge(t), ...d.brouillons[t] };
    }
    for (const t of Object.keys(TYPES)) if (!E.brouillons[t]) E.brouillons[t] = vierge(t);
    return E;
  }
  const E = () => S.ui.evenements || (S.ui.evenements = charger());
  const B = () => E().brouillons[E().type];
  let saveT;
  function sauver(){
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const e = E();
      try { localStorage.setItem(CLE, JSON.stringify({ type: e.type, fmt: e.fmt, pub: e.pub, brouillons: e.brouillons })); } catch(err){}
    }, 300);
  }

  /* ---------- l'affiche (dessinée par le serveur) et le message ---------- */
  const api = () => (window.ASFP_API || "/api");
  const titreDe = (b, t) => sansEmoji(b.titre).trim() || TYPES[t].titre;
  const lignes = txt => sansEmoji(txt).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  function urlAffiche(b, t, fmt, telecharger){
    const p = new URLSearchParams({ apercu: "evenement", titre: titreDe(b, t), sous: sansEmoji(b.sous).trim(), texte: lignes(b.texte).join("\n"),
      date: b.date || "", heure: b.heure || "", lieu: sansEmoji(b.lieu).trim() });
    if (fmt && fmt !== "story") p.set("format", fmt);
    if (!b.sponsors) p.set("sponsors", "0");
    if (telecharger) p.set("telecharger", "1");
    p.set("v", Date.now().toString(36));
    return api() + "/affiches.php?" + p.toString();
  }
  const maj1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function messageAuto(b, t){
    const T = TYPES[t];
    const quand = [b.date ? maj1(dateLongue(b.date)) + " " + jd(b.date).getFullYear() : "", b.heure ? hFr(b.heure) : ""].filter(Boolean).join(" · ");
    const l = [`${T.ico} ${(b.titre || "").trim() || T.titre}`];
    if ((b.sous || "").trim()) l.push(b.sous.trim());
    l.push("");
    if (quand) l.push("📅 " + quand);
    if ((b.lieu || "").trim()) l.push("📍 " + b.lieu.trim());
    const infos = String(b.texte || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
    if (infos.length){ l.push(""); infos.forEach(x => l.push("▪️ " + x)); }
    l.push("", `Venez nombreux ! 💙🤍`, ("#ASFPierrelatte " + T.tags).trim());
    return l.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  const message = b => b.msgLibre ? (b.msg || "") : messageAuto(b, E().type);
  const compteTexte = n => `${n} ligne${n > 1 ? "s" : ""} d'informations sur ${MAX_LIGNES}${n > MAX_LIGNES ? " : seules les " + MAX_LIGNES + " premières seront sur l'affiche" : ""}`;

  /* ---------- le panneau ---------- */
  function panEvenements(){
    const e = E(), t = e.type, T = TYPES[t], b = B();
    if (!S.heberge) return `<div class="carte af-carte"><div class="af-tete"><h2>Affiches d'événement</h2></div>
      <p class="quoi">Les affiches stage, loto et tournoi sont dessinées par le serveur du club : ouvre l'espace club depuis le site en ligne (asf-pierrelatte.fr).</p></div>`;
    const F = FORMATS.find(f => f[0] === e.fmt) || FORMATS[1];
    const n = lignes(b.texte).length;
    const emo = aEmoji(b.titre) || aEmoji(b.sous) || aEmoji(b.lieu) || aEmoji(b.texte);
    const opt = (k, l, res) => `<label class="af-choix ${e.pub[k] ? "on" : ""}"><input type="checkbox" data-ev-pub="${k}" aria-label="${l} ${res}" ${e.pub[k] ? "checked" : ""}>${l}</label>`;
    const libre = b.msgLibre && b.msg !== messageAuto(b, t);
    return `<div class="ev-zone">
    <div class="carte af-carte ev-tete-carte">
      <div class="af-tete"><h2>Affiches d'événement</h2><small>Tu écris, l'affiche se dessine toute seule avec le fond du stade</small></div>
      <div class="ev-types" role="group" aria-label="Type d'événement">${Object.entries(TYPES).map(([k, x]) => `<button type="button" class="ev-type" aria-pressed="${k === t}" data-ev-a="type" data-k="${k}"><span>${x.ico}</span>${esc(x.nom)}</button>`).join("")}</div>
    </div>
    <div class="ev-grille">
      <section class="carte af-carte ev-ecrire" aria-labelledby="ev-h-ecrire">
        <div class="af-tete"><h2 id="ev-h-ecrire">✏️ Ce qui sera écrit sur l'affiche</h2><small>${esc(T.nom)}</small></div>
        <div class="ev-champs">
          <label class="ev-plein">Titre (en grand)<input data-ev="titre" maxlength="80" value="${esc(b.titre)}" placeholder="${esc(T.ex.titre)}"></label>
          <label class="ev-plein">Sous-titre (en doré)<input data-ev="sous" maxlength="80" value="${esc(b.sous)}" placeholder="${esc(T.ex.sous)}"></label>
          <label>Date du rendez-vous (facultatif)<input type="date" data-ev="date" value="${esc(b.date)}"></label>
          <label>Heure (facultatif)<input type="time" data-ev="heure" value="${esc(b.heure)}"></label>
          <label class="ev-plein">Lieu<input data-ev="lieu" maxlength="90" value="${esc(b.lieu)}" placeholder="${esc(T.ex.lieu)}"></label>
          <label class="ev-plein">Informations, une par ligne
            <textarea data-ev="texte" maxlength="600" rows="5" aria-describedby="ev-compte" placeholder="${esc(T.ex.texte)}">${esc(b.texte)}</textarea></label>
          <p class="ev-plein ev-compte ${n > MAX_LIGNES ? "trop" : ""}" id="ev-compte">${compteTexte(n)}</p>
          <p class="ev-plein ev-emoji" id="ev-emoji" ${emo ? "" : "hidden"}>Les émojis ne sont pas dessinés sur l'affiche : mets-les plutôt dans le message.</p>
          <label class="ev-plein ev-case"><input type="checkbox" data-ev="sponsors" ${b.sponsors ? "checked" : ""}> Bandeau des partenaires en bas de l'affiche</label>
        </div>
        <div class="btns"><button type="button" class="btn contour petit" data-ev-a="vider">🗑️ Tout effacer</button></div>
      </section>
      <section class="carte af-carte ev-apercu" aria-labelledby="ev-h-apercu">
        <div class="af-tete"><h2 id="ev-h-apercu">👀 L'affiche</h2></div>
        <div class="ev-formats" role="group" aria-label="Format de l'aperçu">${FORMATS.map(([k, l, d]) => `<button type="button" class="as-fmt ${k === e.fmt ? "on" : ""}" aria-pressed="${k === e.fmt}" data-ev-a="fmt" data-k="${k}" title="${d}">${l}</button>`).join("")}</div>
        <div class="ev-cadre" style="${styleCadre(F[3])}"><img id="ev-img" class="charge" alt="Aperçu de l'affiche" src="${esc(urlAffiche(b, t, e.fmt))}"></div>
        <div class="ev-erreur" id="ev-erreur" hidden><span>Aperçu indisponible pour le moment. Vérifie ta connexion puis réessaie ; si ça continue, préviens le responsable du site.</span> <button type="button" class="btn contour petit" data-ev-a="reessayer">Réessayer</button></div>
        <p class="ev-taille" id="ev-taille">${F[4]} · ${F[2]}</p>
      </section>
      <section class="carte af-carte ev-message" aria-labelledby="ev-h-msg">
        <div class="af-tete"><h2 id="ev-h-msg">💬 Message de l'annonce</h2><small>Publié sous l'annonce · une story n'a pas de texte : tout doit être sur l'affiche</small></div>
        <textarea id="ev-msg" data-ev-msg aria-labelledby="ev-h-msg" rows="${Math.max(12, message(b).split("\n").length + 2)}" maxlength="2000">${esc(message(b))}</textarea>
        <p class="ev-libre" id="ev-libre" ${libre ? "" : "hidden"}>✋ Message modifié à la main : il ne suit plus l'affiche. ↺ pour le refaire.</p>
        <div class="btns"><button type="button" class="btn contour petit" data-ev-a="msg-auto">↺ Refaire le message à partir de l'affiche</button>
          <button type="button" class="btn contour petit" data-ev-a="msg-copier">📋 Copier</button></div>
      </section>
      <section class="carte af-carte ev-publier" aria-labelledby="ev-h-pub">
        <div class="af-tete"><h2 id="ev-h-pub">📣 Publier</h2><small>La bonne taille est choisie toute seule</small></div>
        <div class="ps-reseau" role="group" aria-label="Facebook"><span class="ps-reseau-nom">📘 Facebook</span><div class="af-choix-l">${opt("fb_pub", "Annonce", "Facebook")}${opt("fb_story", "Story", "Facebook")}</div></div>
        <div class="ps-reseau" role="group" aria-label="Instagram"><span class="ps-reseau-nom">📸 Instagram</span><div class="af-choix-l">${opt("ig_pub", "Annonce", "Instagram")}${opt("ig_story", "Story", "Instagram")}</div></div>
        <p class="ev-note">Annonce : dans le fil de la page, avec le message, montrée en entier · Story : plein écran pendant 24 h, sans texte.</p>
        <button type="button" class="btn bleu af-go" data-ev-a="publier" ${e.enCours ? "disabled" : ""}>${esc(e.enCours || "📣 Publier maintenant")}</button>
        ${e.etat ? `<p class="af-etat" id="ev-etat">${esc(e.etat)}</p>` : `<p class="af-etat" id="ev-etat" hidden></p>`}
        <b class="ps-lab ev-lab">Ou la poster toi-même</b>
        <div class="ev-dl">${FORMATS.map(([k, l, d, r, ou]) => `<button type="button" class="btn contour petit" data-ev-a="dl" data-k="${k}">⬇️ ${l} <small>${ou}</small></button>`).join("")}</div>
      </section>
    </div></div>`;
  }

  /* ---------- mises à jour sans redessiner le panneau (la saisie et le curseur restent en place) ---------- */
  let apercuT;
  function majApercu(tout){
    clearTimeout(apercuT);
    apercuT = setTimeout(() => {
      const e = E(), b = B();
      const i = document.getElementById("ev-img");
      if (i){ i.classList.add("charge"); i.src = urlAffiche(b, e.type, e.fmt); }
    }, tout === true ? 0 : 650);
  }
  function majIndications(){
    const b = B(), n = lignes(b.texte).length;
    const z = document.getElementById("ev-compte"); if (z){ z.textContent = compteTexte(n); z.classList.toggle("trop", n > MAX_LIGNES); }
    const em = document.getElementById("ev-emoji"); if (em) em.hidden = !(aEmoji(b.titre) || aEmoji(b.sous) || aEmoji(b.lieu) || aEmoji(b.texte));
  }
  function majMessage(){
    const b = B(), z = document.getElementById("ev-msg");
    if (z && !b.msgLibre && document.activeElement !== z) z.value = messageAuto(b, E().type);
    const l = document.getElementById("ev-libre"); if (l) l.hidden = !(b.msgLibre && b.msg !== messageAuto(b, E().type));
  }
  function etat(txt){
    const e = E(); e.etat = txt;
    const z = document.getElementById("ev-etat"); if (z){ z.hidden = !txt; z.textContent = txt; }
  }

  /* garder le champ en cours de saisie quand le panneau (ou tout l'espace) est redessiné */
  function memoFocus(){
    const a = document.activeElement;
    if (!a || !a.matches || !a.matches("#panneau [data-ev], #panneau [data-ev-msg]")) return null;
    let d = null, f = null; try { d = a.selectionStart; f = a.selectionEnd; } catch(err){}
    return { sel: a.matches("[data-ev-msg]") ? "[data-ev-msg]" : `[data-ev="${a.dataset.ev}"]`, d, f };
  }
  function rendreFocus(m){
    if (!m) return;
    const a = document.querySelector("#panneau " + m.sel); if (!a) return;
    a.focus({ preventScroll: true });
    try { if (m.d !== null && m.d !== undefined) a.setSelectionRange(m.d, m.f); } catch(err){}
  }

  /* ---------- branchement dans l'application ---------- */
  if (!ONGLETS.some(o => o[0] === "evenements")){
    const i = ONGLETS.findIndex(o => o[0] === "affiches");
    ONGLETS.splice(i < 0 ? ONGLETS.length : i + 1, 0, ["evenements", "Événements", "bureau", "Publication", "Affiches stage, loto, tournoi et leur publication"]);
  }
  const com = RUBRIQUES.find(r => r[0] === "com");
  if (com && !com[3].includes("evenements")){
    const i = com[3].indexOf("affiches");
    com[3].splice(i < 0 ? 0 : i + 1, 0, "evenements");
    com[4] = "Affiches, événements, actualités du site et messages reçus";
  }
  if (typeof ICONES === "object" && ICONES) ICONES.evenements = "M4 6h16v14H4zM4 10h16M8 3v5M16 3v5M12 12.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z";

  /* comptes aux onglets choisis (Accès et rôles) : qui a les Affiches a aussi les onglets d'affiches ajoutés.
     S.permissions est relu depuis la base : chaque nouvelle valeur passe par ici. */
  const AVEC_AFFICHES = ["evenements", "affmatchs"];
  const avecAffiches = p => {
    if (!p || typeof p !== "object") return p;
    let o = p;
    for (const k of Object.keys(p)){
      const v = p[k];
      if (v && Array.isArray(v.onglets) && v.onglets.includes("affiches") && v.ongletsAffiches !== true){
        if (o === p) o = { ...p };
        o[k] = { ...v, onglets: [...new Set([...v.onglets, ...AVEC_AFFICHES])], ongletsAffiches: true };   // marqueur réécrit en base au prochain enregistrement
      }
    }
    return o;
  };
  try {
    let perms = avecAffiches(S.permissions);
    const d = Object.getOwnPropertyDescriptor(S, "permissions");
    if (!d || d.configurable) Object.defineProperty(S, "permissions", { configurable: true, enumerable: true,
      get(){ return perms; }, set(v){ perms = avecAffiches(v); } });
  } catch(err){}

  const peutVoir = () => { try { return typeof ongletsVisibles === "function" && ongletsVisibles().some(o => o[0] === "evenements"); } catch(err){ return false; } };
  function allerEvenements(){
    S.ui.onglet = "evenements"; S.ui.compo = null; S.ui.tournoi = null; S.ui.tirage = null;
    try { S.ui.derniers = { ...(S.ui.derniers || {}), [rubriqueDe("evenements")[0]]: "evenements" }; } catch(err){}
    S.ui.rubOuverte = null;
    rendreEspace();
    window.scrollTo(0, 0);
  }

  // rendreEspace remplace tout l'espace avant d'appeler rendrePanneau : on note le champ en cours juste avant
  let focusGarde = null;
  const rendreAvant = window.rendrePanneau;
  window.rendrePanneau = function(){
    if (S.ui.onglet !== "evenements") return rendreAvant.apply(this, arguments);
    const p = document.getElementById("panneau"); if (!p) return;
    const m = memoFocus() || focusGarde, y = window.scrollY;
    focusGarde = null;
    p.innerHTML = panEvenements();
    try { const ec = typeof encartCle === "function" && encartCle(); if (ec) p.insertAdjacentHTML("afterbegin", ec); } catch(err){}
    requestAnimationFrame(() => window.scrollTo(0, y));
    rendreFocus(m);
  };
  if (typeof window.rendreEspace === "function"){
    const espaceAvant = window.rendreEspace;
    window.rendreEspace = function(){ if (S.ui.onglet === "evenements") focusGarde = memoFocus(); return espaceAvant.apply(this, arguments); };
  }

  // onglet Affiches : un raccourci vers les affiches d'événement, en haut
  if (typeof window.panAffiches === "function"){
    const affichesAvant = window.panAffiches;
    window.panAffiches = function(){
      const h = affichesAvant.apply(this, arguments);
      if (!S.heberge || !peutVoir()) return h;
      return `<button type="button" class="carte af-reglages ev-raccourci" data-ev-a="aller"><span>🎉</span><div><b>Affiches stage, loto, tournoi</b><small>Écris les infos, l'affiche se dessine toute seule · onglet Événements</small></div><span class="af-fl">›</span></button>` + h;
    };
  }
  // onglet Stages : « Créer l'affiche » sur chaque stage, avec ses infos déjà remplies
  if (typeof window.panStages === "function"){
    const stagesAvant = window.panStages;
    window.panStages = function(){
      const h = stagesAvant.apply(this, arguments);
      if (!S.heberge || !peutVoir()) return h;
      return h.split(`<button class="btn contour petit" data-a="stage-modifier">Modifier</button>`)
        .join(`<button type="button" class="btn bleu petit" data-ev-a="depuis-stage">🎨 Créer l'affiche</button><button class="btn contour petit" data-a="stage-modifier">Modifier</button>`);
    };
  }
  function brouillonDepuisStage(st){
    const plusieursJours = st.dateFin && st.dateFin !== st.dateDebut;
    // une seule heure claire (« 9h », « 14h30 ») pour un stage d'un jour : dans la case Heure ; sinon les horaires vont dans les infos
    const heures = String(st.horaires || "").match(/\b\d{1,2}\s*(?:h|:)\s*(?:\d{2})?/gi) || [];
    const h = !plusieursJours && heures.length === 1 ? heures[0].match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?/i) : null;
    const lieu = !st.lieu || st.lieu === (typeof ADRESSE_STADE === "string" ? ADRESSE_STADE : "") ? STADE : st.lieu;
    const cats = (st.categories && st.categories.length ? st.categories : (typeof CATS_STAGE !== "undefined" ? CATS_STAGE : [])).join(", ");
    const candidates = ["Inscriptions sur asf-pierrelatte.fr", st.horaires && "Horaires : " + st.horaires, cats && "Catégories : " + cats, st.tarif && "Tarif : " + st.tarif,
      st.limite && "Inscriptions jusqu'au " + dateLongue(st.limite), st.contact && "Contact : " + st.contact, st.places && st.places + " places"].filter(Boolean);
    const infos = [];
    for (const l of candidates){ if (infos.length >= MAX_LIGNES || [...infos, l].join("\n").length > 600) break; infos.push(l); }
    return { ...vierge("stage"), stageId: st.id, titre: couper(st.titre, 80), sous: couper(maj1(typeof datesStage === "function" ? datesStage(st) : ""), 80),
      date: plusieursJours ? "" : (st.dateDebut || ""), heure: h ? `${String(h[1]).padStart(2, "0")}:${h[2] || "00"}` : "", lieu: couper(lieu, 90), texte: infos.join("\n") };
  }

  /* ---------- publication : une affiche au bon format pour chaque envoi ---------- */
  async function fichierAffiche(b, t, fmt){
    const r = await fetch(urlAffiche(b, t, fmt), { credentials: "same-origin", cache: "no-store" });
    const type = r.headers.get("Content-Type") || "";
    if (!r.ok || !type.startsWith("image/")) throw new Error(((await r.text().catch(() => "")) || `erreur ${r.status}`).replace(/\s+/g, " ").trim().slice(0, 160));
    return new File([await r.blob()], `asf-pierrelatte-${slug(titreDe(b, t))}-${fmt === "story" ? "story" : "annonce"}.jpg`, { type: "image/jpeg" });
  }
  async function publier(){
    const e = E(), t = e.type, c = e.pub;
    const z = document.getElementById("ev-msg"), vivant = B();
    if (z && z.value !== message(vivant)){ vivant.msg = z.value; vivant.msgLibre = true; }
    const b = JSON.parse(JSON.stringify(vivant));                     // copie figée : ce qui part ne bouge plus pendant la série
    const texte = message(b);
    if (!c.fb_pub && !c.ig_pub && !c.fb_story && !c.ig_story){ toast("Choisis où publier : annonce ou story, Facebook ou Instagram.", true); return; }
    const envois = [];
    if (c.fb_story || c.ig_story) envois.push({ fmt: "story", nom: "Story " + [c.fb_story && "Facebook", c.ig_story && "Instagram"].filter(Boolean).join(" et "), fb: c.fb_story, ig: c.ig_story, pub: false, story: true, texte, cle: k => k + "_story" });
    if (c.fb_pub || c.ig_pub) envois.push({ fmt: "carre", nom: "Annonce " + [c.fb_pub && "Facebook", c.ig_pub && "Instagram"].filter(Boolean).join(" et "), fb: c.fb_pub, ig: c.ig_pub, pub: true, story: false, texte, cle: k => k + "_pub" });
    if (!confirm(`Publier maintenant l'affiche « ${titreDe(b, t)} » ?\n\n${envois.map(x => "• " + x.nom + (x.story ? " (sans texte)" : " (avec le message)")).join("\n")}`)) return;
    sauver();
    const bouton = () => document.querySelector('[data-ev-a="publier"]');
    const dire = m => { e.enCours = m; const x = bouton(); if (x){ x.disabled = true; x.textContent = m; } };
    dire("Préparation…");
    const r = await serieDePublication({ envois, pub: e.pub, dire, preparer: async x => [await fichierAffiche(b, t, x.fmt)] });
    e.enCours = ""; sauver();
    etat(r.etat);
    toast(r.toutBon ? "Publié." : "Publication incomplète : regarde le détail sous le bouton.", !r.toutBon);
    if (r.toutBon){ const x = bouton(); if (x){ x.disabled = false; x.textContent = "📣 Publier maintenant"; } }
    else if (S.ui.onglet === "evenements") rendrePanneau();           // cases décochées pour ce qui est déjà parti
  }

  /* ---------- écouteurs (attributs data-ev*, à part de ceux de l'application) ---------- */
  // « input » et « change » : les sélecteurs de date et d'heure de l'application n'envoient parfois que « change » (bouton Effacer)
  function champ(t){
    const b = B(), k = t.dataset.ev, v = t.type === "checkbox" ? t.checked : t.value;
    if (b[k] === v) return;
    b[k] = v;
    sauver(); majApercu(); majMessage(); majIndications();
  }
  ["input", "change"].forEach(ty => document.addEventListener(ty, ev => {
    const t = ev.target; if (!t.matches) return;
    if (t.matches("[data-ev]")){ champ(t); return; }
    if (t.matches("[data-ev-msg]") && ty === "input"){ const b = B(); b.msg = t.value; b.msgLibre = true; sauver(); majMessage(); return; }
    if (t.matches("[data-ev-pub]") && ty === "change"){
      E().pub[t.dataset.evPub] = t.checked;
      const l = t.closest(".af-choix"); if (l) l.classList.toggle("on", t.checked);
      sauver();
    }
  }));
  document.addEventListener("load", ev => {
    if (ev.target && ev.target.id === "ev-img"){ ev.target.classList.remove("charge"); const z = document.getElementById("ev-erreur"); if (z) z.hidden = true; }
  }, true);
  document.addEventListener("error", ev => {
    if (ev.target && ev.target.id === "ev-img"){ ev.target.classList.remove("charge"); const z = document.getElementById("ev-erreur"); if (z) z.hidden = false; console.warn("Aperçu de l'affiche indisponible :", ev.target.src); }
  }, true);
  document.addEventListener("click", async ev => {
    const btn = ev.target.closest && ev.target.closest("[data-ev-a]"); if (!btn) return;
    const a = btn.dataset.evA, e = E();
    if (a === "aller"){ allerEvenements(); return; }
    if (e.enCours && !["fmt", "reessayer", "msg-copier", "dl"].includes(a)){ if (a !== "publier") toast("Publication en cours : attends la fin.", true); return; }
    if (a === "type"){ e.type = btn.dataset.k; e.etat = ""; sauver(); rendrePanneau(); return; }
    if (a === "fmt"){
      e.fmt = btn.dataset.k; sauver();
      const F = FORMATS.find(f => f[0] === e.fmt);
      document.querySelectorAll('[data-ev-a="fmt"]').forEach(x => { x.classList.toggle("on", x === btn); x.setAttribute("aria-pressed", String(x === btn)); });
      const cadre = document.querySelector(".ev-zone .ev-cadre"); if (cadre) cadre.setAttribute("style", styleCadre(F[3]));
      const tl = document.getElementById("ev-taille"); if (tl) tl.textContent = `${F[4]} · ${F[2]}`;
      majApercu(true); return;
    }
    if (a === "reessayer"){ majApercu(true); return; }
    if (a === "vider"){
      if (!confirm(`Effacer l'affiche « ${TYPES[e.type].nom} » et son message ?`)) return;
      e.brouillons[e.type] = vierge(e.type); e.etat = ""; sauver(); rendrePanneau(); return;
    }
    if (a === "msg-auto"){
      const b = B();
      if (b.msgLibre && b.msg !== messageAuto(b, e.type) && !confirm("Remplacer le message écrit à la main par un message refait à partir de l'affiche ?")) return;
      b.msgLibre = false; b.msg = "";
      const z = document.getElementById("ev-msg"); if (z) z.value = messageAuto(b, e.type);
      majMessage(); sauver(); return;
    }
    if (a === "msg-copier"){
      const z = document.getElementById("ev-msg");
      try { await navigator.clipboard.writeText(z ? z.value : message(B())); toast("Message copié"); } catch(err){ if (z){ z.select(); } toast("Sélectionne le texte et copie-le"); }
      return;
    }
    if (a === "dl"){
      const fmt = btn.dataset.k, avant = btn.innerHTML;
      btn.disabled = true; btn.textContent = "Préparation…";
      try { const f = await fichierAffiche(B(), e.type, fmt); enregistrerImage(f, f.name); }
      catch(err){ toast("Affiche indisponible : " + err.message, true); }
      btn.disabled = false; btn.innerHTML = avant; return;
    }
    if (a === "publier"){ if (!e.enCours) await publier(); return; }
    if (a === "depuis-stage"){
      const carte = btn.closest("[data-st]"), st = carte && (S.stages || []).find(x => x.id === carte.dataset.st);
      if (!st) return;
      const ancien = e.brouillons.stage, rempli = (ancien.titre || "").trim() || (ancien.texte || "").trim();
      if (ancien.stageId === st.id && rempli){
        // même stage : on rouvre l'affiche en cours, sauf si on veut repartir de la fiche
        if (!confirm(`Reprendre l'affiche en cours pour « ${st.titre || "ce stage"} » ?\n\nOK : reprendre ce que tu avais écrit · Annuler : repartir de la fiche du stage`)) e.brouillons.stage = brouillonDepuisStage(st);
      } else {
        if (rempli && !confirm(`Remplacer l'affiche stage en cours (« ${ancien.titre || "sans titre"} ») par celle de « ${st.titre || "ce stage"} » ?`)) return;
        e.brouillons.stage = brouillonDepuisStage(st);
      }
      e.type = "stage"; e.etat = ""; sauver();
      allerEvenements(); return;
    }
  });

  /* ---------- styles (partagés avec l'onglet Affiches matchs) ---------- */
  const css = document.createElement("style");
  css.id = "evenements-css";
  css.textContent = `
.ev-types{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.ev-type{display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 8px;border:1px solid var(--ligne);border-radius:14px;background:var(--fond);color:var(--texte);font:800 16px var(--corps);cursor:pointer}
.ev-type span{font-size:26px;line-height:1}
.ev-type[aria-pressed="true"]{border-color:#1C63C4;background:rgba(28,99,196,.2);box-shadow:inset 0 0 0 1px #1C63C4}
.ev-grille{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,380px);grid-template-areas:"ecrire apercu" "message apercu" "publier apercu";gap:0 18px;align-items:start}
body.sur-espace .ev-grille>.carte{margin:0 0 18px}
.ev-ecrire{grid-area:ecrire}.ev-message{grid-area:message}.ev-publier{grid-area:publier}
.ev-apercu{grid-area:apercu;position:sticky;top:84px}
.ev-champs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
.ev-champs label{display:flex;flex-direction:column;gap:6px;min-width:0}
.ev-champs .ev-plein{grid-column:1/-1}
.ev-champs textarea{min-height:130px;resize:vertical}
.ev-case{flex-direction:row!important;align-items:center}
.ev-compte,.ev-emoji{margin:-4px 0 0;font:600 13px var(--corps);text-transform:none;letter-spacing:0;color:var(--texte-doux)}
.ev-compte.trop,.ev-emoji{color:#E8833A}
:root[data-theme=light] .ev-compte.trop,:root[data-theme=light] .ev-emoji{color:#B45309}
.ev-emoji[hidden]{display:none}
.ev-formats{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.ev-formats .as-fmt{padding:11px 16px;font-size:15px;min-height:44px}
.ev-cadre{width:100%;max-width:380px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid var(--ligne);background:#0A1430}
.ev-cadre img{display:block;width:100%;height:100%;object-fit:contain;transition:opacity .2s}
.ev-cadre img.charge{opacity:.45}
.ev-taille{margin:8px 0 0;text-align:center;font-size:13px;color:var(--texte-doux)}
.ev-erreur{margin:10px 0 0;padding:10px 12px;border-radius:10px;background:rgba(232,131,58,.14);font-size:14px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.ev-erreur[hidden]{display:none}
.ev-message textarea{width:100%;min-height:300px;font:15px/1.5 var(--corps);resize:vertical}
.ev-libre{margin:8px 0 0;font:600 13.5px var(--corps);color:var(--texte-doux)}
.ev-libre[hidden]{display:none}
.ev-publier .af-go{width:100%;margin:14px 0 10px}
.ev-publier .af-choix:focus-within{outline:3px solid #F2C230;outline-offset:2px}
.ev-publier .af-etat{white-space:pre-line}
.ev-note{margin:10px 0 0;font-size:13px;color:var(--texte-doux)}
.ev-lab{margin-top:16px}
.ev-dl{display:flex;gap:8px;flex-wrap:wrap}
.ev-dl small{opacity:.7;font-weight:600}
.ev-raccourci{width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit}
.aff-partage{position:fixed;inset:0;z-index:9999;background:rgba(4,9,24,.82);display:grid;place-items:center;padding:16px}
.aff-partage-boite{background:var(--carte,#0E1A3A);border:1px solid var(--ligne);border-radius:16px;padding:16px;display:grid;gap:10px;width:min(100%,420px);max-height:100%;overflow:auto}
.aff-partage-boite img{width:100%;max-height:55vh;object-fit:contain;border-radius:10px;background:#0A1430}
.aff-partage-boite .btn{width:100%;text-align:center}
@media (max-width:860px){
  .ev-grille{grid-template-columns:minmax(0,1fr);grid-template-areas:"ecrire" "apercu" "message" "publier"}
  .ev-apercu{position:static}
  .ev-cadre{max-width:320px}
}
@media (max-width:560px){
  .ev-types{grid-template-columns:repeat(2,minmax(0,1fr))}
  .ev-champs{grid-template-columns:minmax(0,1fr)}
}`;
  document.head.appendChild(css);

  // si l'espace club est déjà affiché (démarrage plus rapide que le chargement de ce module), on le redessine avec les onglets ajoutés
  setTimeout(() => { try { if (document.getElementById("panneau")) rendreEspace(); } catch(err){} }, 0);
})();
