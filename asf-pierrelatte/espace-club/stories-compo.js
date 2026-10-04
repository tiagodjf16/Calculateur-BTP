/* Stories des compos : la story des convoqués quand le coach valide sa compo, la story de la composition avant le match.
   - Après « Valider et prévenir » (prevenirConvoques) et après « Publier » sur une carte de compo : on demande au serveur
     de publier la story des convoqués (POST /api/affiches.php?compo_story=<id>), sans jamais bloquer le coach.
   - Onglet Affiches (bureau) : un bloc « 📲 Stories des compos » : marche / arrêt, quoi publier, combien de temps avant,
     le style des affiches (3 styles, aperçus), les noms des joueurs, les équipes sans story, le cron des 5 minutes.
     Réglages enregistrés dans le document « site/affiches-compo ».
   - Onglet Compos : sur chaque compo publiée à venir, une ligne « 📲 Story convoqués … · Story compo … » et
     « 👁 Voir les stories » (les deux affiches, et les publier tout de suite au besoin).
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONG === "undefined") return;
  const e = ONG.e;
  const API = () => (window.ASFP_API || "/api") + "/affiches.php";
  const DEF = { actif: true, convocation: true, composition: true, minutesAvant: 30, style: "nuit", noms: "auto", exclues: [] };
  const STYLES_DEF = { nuit: "Stade de nuit", tableau: "Tableau tactique", club: "Bleu club" };
  const MINUTES = [15, 30, 45, 60, 90];
  const NOMS = [["auto", "Auto", "Initiales pour les jeunes (U6 à U18), nom complet pour les adultes"], ["complet", "Nom complet", "Lucas MARTIN"], ["initiale", "Prénom + initiale", "Lucas M."]];
  const VERSION = "v1-" + new Date().toISOString().slice(0, 10);     // les vignettes d'exemple restent en cache une journée

  /* ---------- outils ---------- */
  const hh = t => { const d = new Date(t * 1000); return `${d.getHours()}h${String(d.getMinutes()).padStart(2, "0")}`; };
  const jourDe = t => { const d = new Date(t * 1000), a = new Date(); if (d.toDateString() === a.toDateString()) return "";
    const dem = new Date(a); dem.setDate(a.getDate() + 1); if (d.toDateString() === dem.toDateString()) return "demain ";
    return (typeof JOURS !== "undefined" ? JOURS[d.getDay()] : "") + " " + d.getDate() + " "; };
  const quandIso = iso => { if (!iso) return ""; const t = Math.floor(new Date(iso).getTime() / 1000); return isNaN(t) ? "" : (jourDe(t) ? "le " + jourDe(t) : "à ") + hh(t); };
  const avenir = c => c && c.publie && (c.date || "") >= (typeof aujourdhui === "function" ? aujourdhui() : new Date().toISOString().slice(0, 10));
  const noter = (msg, err) => { if (typeof toast === "function") toast(msg, err); };

  /* ---------- réglages (document site/affiches-compo) ---------- */
  let REG = null, abonne = false;
  function reglages(){
    if (!abonne && S.db && S.db.doc){
      abonne = true;
      try {
        S.db.doc("site/affiches-compo").onSnapshot(d => {
          const n = d && d.exists ? d.data() : {};
          const change = JSON.stringify(n) !== JSON.stringify(REG);
          REG = n;
          if (change && S.ui.onglet === "affiches" && document.querySelector("#panneau .scp") && typeof rendrePanneau === "function") setTimeout(rendrePanneau, 0);
        }, () => {});
      } catch(err){ abonne = false; }
    }
    const r = { ...DEF, ...(REG || {}) };
    if (!Array.isArray(r.exclues)) r.exclues = [];
    if (!MINUTES.includes(+r.minutesAvant)) r.minutesAvant = +r.minutesAvant || 30;
    return r;
  }
  async function sauver(patch, message){
    if (!(typeof peutBureau === "function" && peutBureau())){ noter("Seul le bureau peut changer ces réglages.", true); return; }
    const doc = { ...reglages(), ...patch };
    REG = doc;                                                      // l'écran suit tout de suite
    if (typeof rendrePanneau === "function") rendrePanneau();
    await ecrire(() => S.db.doc("site/affiches-compo").set(doc), message || "Réglage enregistré.");
  }

  /* ---------- informations du serveur (cron, ligne à donner à l'hébergeur) ---------- */
  let INFO = null, infoT = 0, infoEnCours = false;
  async function chargerInfo(){
    if (infoEnCours || (INFO && Date.now() - infoT < 60000)) return;
    infoEnCours = true;
    try {
      const r = await fetch(API() + "?compo_info=1", { credentials: "same-origin", headers: { Accept: "application/json" } });
      if (r.ok){ INFO = await r.json(); infoT = Date.now(); }
    } catch(err){}
    infoEnCours = false;
    const z = document.querySelector("#panneau [data-scp-cron]");
    if (z) z.innerHTML = cronHtml();
    const t = document.querySelector("#panneau [data-scp-cron-etat]");
    if (t) t.outerHTML = cronPuce();
  }
  const styles = () => ({ ...STYLES_DEF, ...((INFO && INFO.styles) || {}) });
  const cronActif = () => !!(INFO && INFO.cron && INFO.cron.frequent);
  const cronPuce = () => `<span class="scp-puce ${INFO ? (cronActif() ? "ok" : "att") : ""}" data-scp-cron-etat>${INFO ? (cronActif() ? "⏱️ Cron 5 min : actif" : "⏱️ Cron 5 min : pas installé") : "⏱️ Cron 5 min : …"}</span>`;
  function cronHtml(){
    const cmd = (INFO && INFO.commande) || "/usr/local/bin/php /home/TON_COMPTE/public_html/api/affiches.php compos > /dev/null 2>&1";
    const vu = INFO && INFO.cron && INFO.cron.vu ? quandIso(INFO.cron.vu) : "";
    const etat = !INFO ? `<p class="scp-cron-etat">Vérification du cron…</p>`
      : cronActif() ? `<p class="scp-cron-etat ok">✓ Le cron des 5 minutes tourne${vu ? " (dernier passage " + e(vu) + ")" : ""} : la story de la composition part pile à l'heure.</p>`
      : `<p class="scp-cron-etat att">Pas encore de cron des 5 minutes${vu ? " (dernier passage " + e(vu) + ")" : ""} : en attendant, la story de la composition part avec le cron horaire, dans l'heure qui précède le match.</p>`;
    return `${etat}
      <ol class="scp-etapes">
        <li>Ouvre le cPanel d'o2switch, rubrique <b>« Tâches Cron »</b>.</li>
        <li>Réglage commun : <b>« Une fois toutes les cinq minutes »</b> (*/5 * * * *).</li>
        <li>Dans « Commande », colle cette ligne puis <b>« Ajouter une nouvelle tâche Cron »</b> :</li></ol>
      <div class="scp-code"><code data-scp-cmd>${e(cmd)}</code><button type="button" class="btn contour petit" data-scp-copier>📋 Copier</button></div>
      <p class="scp-mini">Sans accès au cPanel, l'hébergeur peut aussi appeler toutes les 5 minutes l'adresse
        <code>${e((INFO && INFO.url) || "https://ton-site/api/affiches.php?cron_compos=1&cle=TA_CLE")}</code> (TA_CLE : la clé d'écriture du site).</p>`;
  }

  /* ---------- l'état des stories d'une compo (?compo_etat), en cache ---------- */
  const ETATS = new Map(), EN_COURS = new Set();
  async function chargerEtat(id, force){
    const x = ETATS.get(id);
    if (EN_COURS.has(id) || (!force && x && Date.now() - x.t < 60000)) return;
    EN_COURS.add(id);
    try {
      const r = await fetch(API() + "?compo_etat=" + encodeURIComponent(id), { credentials: "same-origin", headers: { Accept: "application/json" } });
      const d = await r.json().catch(() => null);
      ETATS.set(id, { t: Date.now(), d: r.ok && d ? d : { erreur: (d && d.erreur) || "état indisponible" } });
    } catch(err){ ETATS.set(id, { t: Date.now(), d: { erreur: "serveur injoignable" } }); }
    EN_COURS.delete(id);
    majLignes(id);
  }
  function texteConvoc(d){
    const c = d.convocation || {};
    if (c.publiee) return { t: "publiée ✓" + (c.quand ? " " + quandIso(c.quand) : ""), k: "ok" };
    if (c.fait) return { t: "non publiée (" + (c.etats || []).join(", ") + ")", k: "ko" };
    if (c.motif) return { t: "pas de story · " + c.motif, k: "off" };
    return { t: c.attente ? "en attente (part dès que possible, entre 8 h et 21 h 30)" : "en attente", k: "att" };
  }
  function texteCompo(d){
    const c = d.composition || {};
    if (c.publiee) return { t: "publiée ✓" + (c.quand ? " " + quandIso(c.quand) : ""), k: "ok" };
    if (c.fait) return { t: "non publiée (" + (c.etats || []).join(", ") + ")", k: "ko" };
    if (c.motif) return { t: "pas de story · " + c.motif, k: "off" };
    if (!c.prevue) return { t: "en attente", k: "att" };
    const j = jourDe(c.prevue);
    return c.precise ? { t: `prévue ${j}à ${hh(c.prevue)}`, k: "att" } : { t: `prévue ${j}entre ${hh(c.debut)} et ${hh(c.prevue)}`, k: "att" };
  }
  function ligneHtml(id){
    const x = ETATS.get(id);
    if (!x) return `<span class="scp-l-att">📲 Stories : …</span>`;
    const d = x.d;
    if (d.erreur) return `<span class="scp-l-off">📲 Stories : ${e(d.erreur)}</span>`;
    if (!d.actif) return `<span class="scp-l-off">📲 Stories des compos désactivées (onglet Affiches)</span>`;
    const a = texteConvoc(d), b = texteCompo(d);
    return `<span class="scp-l-${a.k}">📲 Story convoqués : ${e(a.t)}</span><span class="scp-l-${b.k}">Story compo : ${e(b.t)}</span>`;
  }
  function majLignes(id){
    document.querySelectorAll(`[data-scp-etat="${CSS.escape(id)}"]`).forEach(z => { z.innerHTML = ligneHtml(id); });
    const m = document.querySelector(`#zone-modale .scp-modale[data-scp-id="${CSS.escape(id)}"]`);
    if (m) dessinerModale(id);
  }

  /* ---------- publier la story (après validation de la compo, ou bouton) ---------- */
  async function posterStory(id, o = {}){
    const p = new URLSearchParams({ compo_story: id });
    if (o.quoi) p.set("quoi", o.quoi);
    if (o.forcer) p.set("forcer", "1");
    const r = await fetch(API() + "?" + p, { method: "POST", credentials: "same-origin", headers: { Accept: "application/json" } });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.erreur || "refusé par le serveur (" + r.status + ")");
    if (d.etat) ETATS.set(id, { t: Date.now(), d: d.etat });
    majLignes(id);
    return d;
  }
  /* ce que le coach voit après « Valider et prévenir » : seulement ce qui l'aide (pas de bruit si le bureau a coupé les stories) */
  function messageConvoc(etats){
    const l = etats || [], pub = l.filter(x => /: publié$/.test(x)).map(x => x.split(" :")[0]);
    const pannes = l.filter(x => /échec|bloqué/.test(x));
    if (pannes.length) return ["📲 Story des convoqués : " + pannes.join(" · "), true];
    if (pub.length) return [`📲 Story des convoqués publiée sur ${pub.join(" et ")}`, false];
    const t = l[0] || "";
    if (/tard|déjà en cours|impossible|polices/.test(t)) return ["📲 " + t.charAt(0).toUpperCase() + t.slice(1), /impossible|polices/.test(t)];
    return null;                                                       // désactivée, équipe exclue, déjà publiée, réseau pas relié
  }
  function storyConvoques(id){
    const t0 = Date.now();
    const dire = m => { if (!m) return; setTimeout(() => noter(m[0], m[1]), Math.max(0, 3400 - (Date.now() - t0))); };   // après le message des notifications
    posterStory(id).then(d => dire(messageConvoc(d.etats)), err => dire(["📲 Story des convoqués non publiée : " + err.message, true]));
  }
  if (typeof window.prevenirConvoques === "function"){
    const avantPrevenir = window.prevenirConvoques;
    window.prevenirConvoques = async function(c){
      const r = await avantPrevenir.apply(this, arguments);
      try { if (S.heberge && c && c.id) storyConvoques(c.id); } catch(err){}
      return r;
    };
  }
  // « Publier » sur une carte de compo (brouillon → publiée) : la story des convoqués part aussi, une fois la compo enregistrée
  document.addEventListener("click", ev => {
    const b = ev.target.closest('[data-a="toggle-compo"]'); if (!b || !S.heberge) return;
    const carte = b.closest("[data-c]"), id = carte && carte.dataset.c;
    const c = id && (S.compos || []).find(x => x.id === id);
    if (!c || c.publie) return;
    let n = 0;
    const attendre = () => { const x = (S.compos || []).find(y => y.id === id);
      if (x && x.publie) storyConvoques(id); else if (++n < 30) setTimeout(attendre, 300); };
    setTimeout(attendre, 300);
  }, true);

  /* ---------- onglet Compos : la ligne d'état sur chaque compo publiée à venir ---------- */
  let observateur = null;
  function observer(){
    const zones = [...document.querySelectorAll("#panneau [data-scp-etat]")];
    if (!zones.length) return;
    if (observateur) observateur.disconnect();
    if (!("IntersectionObserver" in window)){ zones.forEach(z => chargerEtat(z.dataset.scpEtat)); return; }
    observateur = new IntersectionObserver(l => l.forEach(x => { if (x.isIntersecting){ observateur.unobserve(x.target); chargerEtat(x.target.dataset.scpEtat); } }), { rootMargin: "200px" });
    zones.forEach(z => observateur.observe(z));
  }
  if (typeof window.panCompos === "function"){
    const avantCompos = window.panCompos;
    window.panCompos = function(){
      const h = avantCompos.apply(this, arguments);
      if (!S.heberge) return h;
      const r = ONG.transformer(h, racine => {
        racine.querySelectorAll(".cp-carte[data-c]").forEach(carte => {
          const id = carte.dataset.c, c = (S.compos || []).find(x => x.id === id);
          if (!avenir(c) || carte.closest(".cp-passees")) return;
          const corps = carte.querySelector(".cp-corps"); if (!corps) return;
          const z = document.createElement("div"); z.className = "scp-ligne";
          z.innerHTML = `<span class="scp-etat" data-scp-etat="${e(id)}" aria-live="polite">${ligneHtml(id)}</span>
            <button type="button" class="scp-voir" data-scp-voir="${e(id)}">👁 Voir les stories</button>`;
          corps.appendChild(z);
        });
      });
      setTimeout(observer, 0);
      return r;
    };
  }

  /* ---------- « Voir les stories » : les deux affiches, et les publier tout de suite ---------- */
  function apercu(quoi, id, l, plus){
    const c = (S.compos || []).find(x => x.id === id) || {};
    return API() + "?" + new URLSearchParams({ apercu: quoi, id, ...(l ? { l } : {}), v: String(c.maj || ""), ...(plus || {}) });
  }
  function dessinerModale(id){
    const c = (S.compos || []).find(x => x.id === id) || {};
    const x = ETATS.get(id), d = x && !x.d.erreur ? x.d : null;
    const bloc = (quoi, titre, info, peut) => `<figure class="scp-fig">
        <figcaption><b>${titre}</b>${info ? `<small class="scp-l-${info.k}">${e(info.t)}</small>` : ""}</figcaption>
        <a href="${e(apercu(quoi, id))}" target="_blank" rel="noopener" class="scp-img" title="Ouvrir en grand"><img src="${e(apercu(quoi, id, 540))}" alt="${titre}" loading="lazy"></a>
        <div class="scp-fig-act">
          ${peut ? `<button type="button" class="btn bleu petit" data-scp-publier="${quoi}" data-scp-id="${e(id)}">📲 Publier maintenant</button>` : ""}
          <a class="btn contour petit" href="${e(apercu(quoi, id, 0, { telecharger: 1 }))}">⬇️ Télécharger</a></div></figure>`;
    const peut = q => d && d.actif && d[q] && !d[q].fait && !d[q].motif;
    zoneModale().innerHTML = `<div class="modale-fond scp-fond"><div class="modale scp-modale" role="dialog" aria-label="Stories de la compo" data-scp-id="${e(id)}">
      <div class="modale-tete"><div><b>Stories de la compo</b><small>${e(c.equipe || "")}${c.adv ? " contre " + e(c.adv) : ""} · en story seulement, jamais dans le fil</small></div>
        <button type="button" class="modale-x" data-stage-fermer aria-label="Fermer">×</button></div>
      <div class="modale-corps scp-figs">
        ${bloc("convocation", "Les convoqués", d && d.actif ? texteConvoc(d) : null, peut("convocation"))}
        ${bloc("composition", "La composition", d && d.actif ? texteCompo(d) : null, peut("composition"))}
      </div>
      <div class="modale-pied"><small class="scp-mini">Style « ${e(styles()[(d && d.style) || reglages().style] || "")} » : le bureau le choisit dans l'onglet Affiches.</small></div></div></div>`;
    document.body.classList.add("modale-ouverte");
  }
  function ouvrirModale(id){ dessinerModale(id); chargerEtat(id, true); }

  document.addEventListener("click", async ev => {
    const v = ev.target.closest("[data-scp-voir]");
    if (v){ ev.preventDefault(); ouvrirModale(v.dataset.scpVoir); return; }
    if (ev.target.classList && ev.target.classList.contains("scp-fond") && typeof fermerModale === "function"){ fermerModale(); return; }
    const p = ev.target.closest("[data-scp-publier]");
    if (p){
      const quoi = p.dataset.scpPublier, id = p.dataset.scpId;
      if (!confirm(quoi === "composition" ? "Publier tout de suite la story de la composition sur Facebook et Instagram ?" : "Publier tout de suite la story des convoqués sur Facebook et Instagram ?")) return;
      p.disabled = true; p.textContent = "Publication…";
      try {
        const d = await posterStory(id, quoi === "composition" ? { quoi } : { forcer: true });
        const m = messageConvoc(d.etats);
        noter(m ? m[0].replace("des convoqués", quoi === "composition" ? "de la composition" : "des convoqués") : "📲 " + ((d.etats || [])[0] || "Story traitée."), m ? m[1] : false);
      } catch(err){ noter("Story non publiée : " + err.message, true); p.disabled = false; p.textContent = "📲 Publier maintenant"; }
      return;
    }
    const cp = ev.target.closest("[data-scp-copier]");
    if (cp){
      const t = (document.querySelector("[data-scp-cmd]") || {}).textContent || "";
      try { await navigator.clipboard.writeText(t); noter("Ligne copiée : colle-la dans « Commande » des Tâches Cron."); }
      catch(err){ const r = document.createRange(), z = document.querySelector("[data-scp-cmd]"); if (z){ r.selectNodeContents(z); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } noter("Sélectionne la ligne et copie-la (Ctrl+C)."); }
    }
  });
  // aperçu impossible (serveur, style pas encore prêt) : une case propre au lieu d'une image cassée
  document.addEventListener("error", ev => {
    const i = ev.target, z = i && i.tagName === "IMG" && i.closest(".scp-vig, .scp-img");
    if (z) z.classList.add("ko");
  }, true);
  document.addEventListener("keydown", ev => { if (ev.key === "Escape" && document.querySelector("#zone-modale .scp-modale") && typeof fermerModale === "function") fermerModale(); });

  /* ---------- onglet Affiches : le bloc « 📲 Stories des compos » ---------- */
  function equipes(){
    const l = new Set();
    try { (typeof toutesEquipes === "function" ? toutesEquipes() : []).forEach(n => l.add(n)); } catch(err){}
    try { (typeof equipesReelles === "function" ? equipesReelles() : []).forEach(x => l.add(x.nom)); } catch(err){}
    (S.compos || []).forEach(c => c.equipe && l.add(c.equipe));
    reglages().exclues.forEach(n => l.add(n));
    const ordre = typeof ORDRE_EQ === "function" ? ORDRE_EQ : (x => x);
    return [...l].filter(Boolean).sort((a, b) => String(ordre(a)).localeCompare(String(ordre(b))));
  }
  const jeune = n => /^U\s?\d/i.test(n);
  function carteHtml(){
    const r = reglages(), st = styles(), off = !r.actif;
    const dis = off ? "disabled" : "";
    const exclues = new Set(r.exclues.map(x => x.toLowerCase().trim()));
    const sw = (k, titre, sous, desact) => `<label class="sw-ligne scp-sw"><input type="checkbox" class="sw" data-scp-reg="${k}" ${r[k] ? "checked" : ""} ${desact ? "disabled" : ""}>
      <span><b>${titre}</b><small>${sous}</small></span></label>`;
    const vign = (k, quoi) => `<span class="scp-vig"><img loading="lazy" alt="" src="${e(API() + "?" + new URLSearchParams({ apercu: quoi, exemple: 1, style: k, noms: r.noms, l: 240, v: VERSION }))}"></span>`;
    const resume = off ? "Arrêtées" : [r.convocation ? "convoqués à la validation" : "", r.composition ? `composition ${r.minutesAvant} min avant` : ""].filter(Boolean).join(" · ") || "rien n'est publié";
    const corps = `<div class="scp">
      <div class="scp-puces"><span class="scp-puce ${off ? "off" : "ok"}">${off ? "● Arrêtées" : "● En marche"}</span>${cronPuce()}<span class="scp-puce">🎨 ${e(st[r.style] || r.style)}</span></div>
      ${ONG.aide("scp-aide", "Comment ça marche ?", `<ol>
        <li>Quand un coach clique <b>« Valider et prévenir »</b> sur sa compo, l'affiche des <b>convoqués</b> part en story sur Facebook et Instagram.</li>
        <li><b>${e(r.minutesAvant)} minutes avant le coup d'envoi</b>, l'affiche de la <b>composition</b> (le onze sur le terrain) part en story.</li>
        <li>Seulement en story (visible 24 h), jamais dans le fil. Une seule fois par compo, même si le coach la modifie.</li>
        <li>Le soir après 21 h 30, la story des convoqués attend le lendemain 8 h.</li></ol>`)}
      <h4 class="scp-h">Ce qui part en story</h4>
      <div class="scp-sws">
        ${sw("actif", "Stories des compos", "L'interrupteur général", false)}
        ${sw("convocation", "Story des convoqués", "Dès que le coach valide sa compo", off)}
        ${sw("composition", "Story de la composition", "Avant le coup d'envoi, avec le onze sur le terrain", off)}
        <div class="scp-min ${!r.composition || off ? "grise" : ""}"><span class="scp-min-l">Combien de temps avant le match ?</span>
          <div class="scp-chips">${MINUTES.map(m => `<button type="button" class="scp-chip ${+r.minutesAvant === m ? "on" : ""}" data-scp-min="${m}" ${!r.composition || off ? "disabled" : ""} aria-pressed="${+r.minutesAvant === m}">${m < 60 ? m + " min" : m === 60 ? "1 h" : "1 h 30"}</button>`).join("")}</div></div>
      </div>
      <h4 class="scp-h">Style des affiches</h4>
      <p class="scp-mini">Touche un style pour le choisir. Chaque style a ses deux affiches : les convoqués, puis la composition.</p>
      <div class="scp-styles">${Object.keys(st).map(k => `<div class="scp-style ${r.style === k ? "on" : ""}">
          <button type="button" class="scp-style-bt" data-scp-style="${e(k)}" aria-pressed="${r.style === k}" ${dis}>
            <span class="scp-vigs">${vign(k, "convocation")}${vign(k, "composition")}</span>
            <span class="scp-style-nom">${e(st[k])}${r.style === k ? `<em>✓ Choisi</em>` : ""}</span></button>
          <button type="button" class="scp-zoom" data-scp-zoom="${e(k)}">🔍 Voir en grand</button></div>`).join("")}</div>
      <h4 class="scp-h">Noms des joueurs sur les affiches</h4>
      <div class="scp-noms">${NOMS.map(([k, t, s]) => `<button type="button" class="scp-nom ${r.noms === k ? "on" : ""}" data-scp-noms="${k}" aria-pressed="${r.noms === k}" ${dis}><b>${t}</b><small>${s}</small></button>`).join("")}</div>
      <h4 class="scp-h">Pas de story pour ces équipes</h4>
      <p class="scp-mini">Coche une équipe pour ne jamais publier ses stories (ses compos restent sur le site).</p>
      <div class="scp-eqs">${equipes().map(n => `<label class="scp-eq ${exclues.has(n.toLowerCase().trim()) ? "on" : ""}"><input type="checkbox" data-scp-exclue="${e(n)}" ${exclues.has(n.toLowerCase().trim()) ? "checked" : ""} ${dis}><span>${e(n)}</span>${jeune(n) ? `<small>jeunes</small>` : ""}</label>`).join("") || `<span class="scp-mini">Aucune équipe trouvée.</span>`}</div>
      <h4 class="scp-h">Pour publier pile ${e(r.minutesAvant)} minutes avant</h4>
      <div class="scp-cron" data-scp-cron>${cronHtml()}</div>
    </div>`;
    return ONG.pli("scp-reglages", `<b>Stories des compos</b><small>${e(resume)}</small>`, corps, false, "📲");
  }
  function zoomStyle(k){
    const st = styles(), r = reglages();
    const src = q => API() + "?" + new URLSearchParams({ apercu: q, exemple: 1, style: k, noms: r.noms, l: 540, v: VERSION });
    const choisir = typeof peutBureau === "function" && peutBureau() && r.style !== k;
    zoneModale().innerHTML = `<div class="modale-fond scp-fond"><div class="modale scp-modale" role="dialog" aria-label="Style ${e(st[k] || k)}">
      <div class="modale-tete"><div><b>${e(st[k] || k)}</b><small>Exemple : les convoqués, puis la composition</small></div>
        <button type="button" class="modale-x" data-stage-fermer aria-label="Fermer">×</button></div>
      <div class="modale-corps scp-figs">
        <figure class="scp-fig"><figcaption><b>Les convoqués</b></figcaption><a class="scp-img" href="${e(src("convocation"))}" target="_blank" rel="noopener"><img src="${e(src("convocation"))}" alt="Les convoqués"></a></figure>
        <figure class="scp-fig"><figcaption><b>La composition</b></figcaption><a class="scp-img" href="${e(src("composition"))}" target="_blank" rel="noopener"><img src="${e(src("composition"))}" alt="La composition"></a></figure></div>
      <div class="modale-pied">${choisir ? `<button type="button" class="btn bleu" data-scp-style="${e(k)}" data-stage-fermer>Choisir ce style</button>` : r.style === k ? `<small class="scp-mini">✓ C'est le style choisi.</small>` : ""}</div></div></div>`;
    document.body.classList.add("modale-ouverte");
  }

  if (typeof window.panAffiches === "function"){
    const avantAffiches = window.panAffiches;
    window.panAffiches = function(){
      const h = avantAffiches.apply(this, arguments);
      if (!S.heberge || !(typeof peutBureau === "function" && peutBureau())) return h;   // onglet du bureau ; hors ligne : pas de serveur
      setTimeout(chargerInfo, 0);
      return ONG.transformer(h, racine => {
        const t = document.createElement("template"); t.innerHTML = carteHtml();
        const pli = t.content.firstElementChild;
        pli.classList.add("ong-aff-pli", "scp-pli");
        const ico = pli.querySelector("summary>.plus"); if (ico) ico.className = "ong-aff-ico";
        const reg = racine.querySelector('details[data-ong-pli="aff-reglages"]');
        if (reg) reg.before(pli);
        else (racine.querySelector(".ong-aff") || racine).appendChild(pli);
      });
    };
  }
  // les réglages : chaque changement est enregistré tout de suite (bureau)
  document.addEventListener("change", ev => {
    const t = ev.target;
    if (t.matches && t.matches("[data-scp-reg]")){
      const k = t.dataset.scpReg, v = t.checked;
      const msg = { actif: v ? "Stories des compos en marche." : "Stories des compos arrêtées.",
        convocation: v ? "Story des convoqués activée." : "Story des convoqués désactivée.",
        composition: v ? "Story de la composition activée." : "Story de la composition désactivée." }[k];
      sauver({ [k]: v }, msg);
    } else if (t.matches && t.matches("[data-scp-exclue]")){
      const n = t.dataset.scpExclue, l = reglages().exclues.filter(x => x.toLowerCase().trim() !== n.toLowerCase().trim());
      if (t.checked) l.push(n);
      sauver({ exclues: l }, t.checked ? `Plus de story pour ${n}.` : `Stories de nouveau publiées pour ${n}.`);
    }
  });
  document.addEventListener("click", ev => {
    const m = ev.target.closest("[data-scp-min]");
    if (m && !m.disabled){ sauver({ minutesAvant: +m.dataset.scpMin }, `Story de la composition ${m.textContent} avant le match.`); return; }
    const s = ev.target.closest("[data-scp-style]");
    if (s && !s.disabled){ sauver({ style: s.dataset.scpStyle }, `Style « ${styles()[s.dataset.scpStyle] || s.dataset.scpStyle} » choisi.`); return; }
    const z = ev.target.closest("[data-scp-zoom]");
    if (z){ zoomStyle(z.dataset.scpZoom); return; }
    const n = ev.target.closest("[data-scp-noms]");
    if (n && !n.disabled) sauver({ noms: n.dataset.scpNoms }, "Noms des joueurs : " + n.querySelector("b").textContent + ".");
  });

  /* ---------- styles ---------- */
  const css = document.createElement("style");
  css.id = "stories-compo-css";
  const P = "body.sur-espace #panneau", M = "body #zone-modale";
  css.textContent = `
/* bloc de l'onglet Affiches */
${P} .scp{display:grid;gap:12px}
${P} .scp-puces{display:flex;flex-wrap:wrap;gap:8px}
${P} .scp-puce{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:4px 12px;border-radius:999px;font:700 13.5px var(--corps);background:rgba(143,168,240,.14);color:#DCE5FF;border:1px solid rgba(143,168,240,.25)}
${P} .scp-puce.ok{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.45);color:#B9F5CF}
${P} .scp-puce.off,${P} .scp-puce.att{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.45);color:#FCD9A0}
${P} .scp .ong-aide{margin:0}
${P} .scp-h{margin:12px 0 0;font:800 13px var(--corps);letter-spacing:.1em;text-transform:uppercase;color:#AFC0EA}
${P} .scp-mini{margin:0;font-size:13.5px;line-height:1.5;color:var(--texte-doux)}
${P} .scp-sws{border:1px solid rgba(143,168,240,.18);border-radius:14px;padding:2px 16px;background:rgba(5,11,31,.25)}
${P} .scp-sw{min-height:56px;margin:0!important;background:transparent!important;border:0!important;border-bottom:1px solid var(--ligne)!important;border-radius:0!important;padding:12px 0!important}
${P} .scp-sw:last-of-type{border-bottom:1px solid var(--ligne)!important}
${P} .scp-sw>span{display:block;flex:1;min-width:0}
${P} input.sw{appearance:none;-webkit-appearance:none;width:52px!important;height:30px!important;min-width:52px;margin:0!important;padding:0!important;border:0!important;border-radius:999px!important;background:#4A5680!important;position:relative;flex:none;box-shadow:none!important;accent-color:auto}
${P} input.sw::after{content:"";position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;transition:transform .18s}
${P} input.sw:checked{background:#16A34A!important}
${P} input.sw:checked::after{transform:translateX(22px)}
${P} input.sw::before{display:none!important}
${P} .scp-min{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px;padding:12px 0}
${P} .scp-min.grise{opacity:.5}
${P} .scp-min-l{font:700 15px var(--corps)}
${P} .scp-chips{display:flex;flex-wrap:wrap;gap:6px}
${P} .scp-chip{min-height:44px;min-width:64px;padding:6px 12px;border-radius:12px;border:1px solid var(--ligne);background:rgba(143,168,240,.08);color:var(--texte);font:700 14.5px var(--corps);cursor:pointer}
${P} .scp-chip.on{background:var(--bleu,#2F6BFF);border-color:transparent;color:#fff}
${P} .scp-chip:disabled,${P} .scp-nom:disabled,${P} .scp-style-bt:disabled{cursor:not-allowed}
${P} .scp-styles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
${P} .scp-style{display:grid;gap:6px;border:2px solid rgba(143,168,240,.2);border-radius:16px;padding:8px;background:rgba(5,11,31,.25);transition:border-color .15s,box-shadow .15s}
${P} .scp-style.on{border-color:#22C55E;box-shadow:0 0 0 3px rgba(34,197,94,.25)}
${P} .scp-style-bt{display:grid;gap:8px;padding:0;border:0;background:none;color:inherit;cursor:pointer;text-align:left}
${P} .scp-vigs{display:grid;grid-template-columns:1fr 1fr;gap:6px}
${P} .scp-vig{position:relative;display:block;aspect-ratio:9/16;border-radius:9px;overflow:hidden;background:#0B1638}
${P} .scp-vig img{width:100%;height:100%;object-fit:cover;display:block}
.scp-vig.ko img,.scp-img.ko img{visibility:hidden}
.scp-vig.ko::after,.scp-img.ko::after{content:"Aperçu indisponible";position:absolute;inset:0;display:grid;place-items:center;text-align:center;padding:8px;font:600 12.5px var(--corps);color:#9AA7C7}
${P} .scp-style-nom{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;font:800 17px var(--display);padding:0 2px}
${P} .scp-style-nom em{font:800 12px var(--corps);font-style:normal;padding:3px 8px;border-radius:999px;background:#22C55E;color:#06210F}
${P} .scp-zoom{min-height:40px;border-radius:10px;border:1px solid var(--ligne);background:none;color:var(--texte-doux);font:600 13.5px var(--corps);cursor:pointer}
${P} .scp-noms{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
${P} .scp-nom{display:grid;gap:2px;text-align:left;min-height:64px;padding:10px 14px;border-radius:14px;border:1.5px solid var(--ligne);background:rgba(143,168,240,.06);color:var(--texte);cursor:pointer}
${P} .scp-nom b{font:800 16px var(--corps)}
${P} .scp-nom small{font-size:12.5px;color:var(--texte-doux);line-height:1.35}
${P} .scp-nom.on{border-color:#22C55E;background:rgba(34,197,94,.1)}
${P} .scp-nom.on b::after{content:"  ✓";color:#22C55E}
${P} .scp-eqs{display:flex;flex-wrap:wrap;gap:8px}
${P} .scp-eq{display:inline-flex!important;align-items:center;gap:8px;min-height:44px;margin:0!important;padding:6px 12px!important;border-radius:12px;border:1px solid var(--ligne);background:rgba(143,168,240,.06);font:600 14.5px var(--corps)!important;text-transform:none!important;letter-spacing:0!important;color:var(--texte)!important;cursor:pointer}
${P} .scp-eq input{width:20px;height:20px;margin:0;flex:none;accent-color:#DC2626}
${P} .scp-eq.on{border-color:rgba(220,38,38,.6);background:rgba(220,38,38,.12)}
${P} .scp-eq.on span{text-decoration:line-through;text-decoration-color:rgba(220,38,38,.8)}
${P} .scp-eq small{font-size:11px;padding:1px 6px;border-radius:999px;background:rgba(143,168,240,.18);color:var(--texte-doux)}
${P} .scp-cron{display:grid;gap:10px;padding:14px 16px;border-radius:14px;border:1px dashed rgba(143,168,240,.35);background:rgba(5,11,31,.25)}
${P} .scp-cron-etat{margin:0;font-weight:700;line-height:1.45}
${P} .scp-cron-etat.ok{color:#86EFAC}
${P} .scp-cron-etat.att{color:#FCD34D}
${P} .scp-etapes{margin:0 0 0 20px;padding:0;display:grid;gap:4px;font-size:14.5px;line-height:1.5}
${P} .scp-code{display:flex;gap:8px;align-items:stretch;flex-wrap:wrap}
${P} .scp-code code{flex:1 1 320px;min-width:0;overflow-wrap:anywhere;font:600 13px/1.5 ui-monospace,Menlo,Consolas,monospace;padding:10px 12px;border-radius:10px;background:#050B1F;color:#E2E8FF;border:1px solid rgba(143,168,240,.25);user-select:all}
${P} .scp-code .btn{min-height:44px}
${P} .scp-cron .scp-mini code{overflow-wrap:anywhere;font-size:12.5px}
/* onglet Compos : la ligne d'état */
${P} .scp-ligne{display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;margin-top:8px}
${P} .scp-etat{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:13.5px;line-height:1.4;min-width:0}
${P} .scp-etat span{overflow-wrap:anywhere}
.scp-l-ok{color:#86EFAC}
.scp-l-att{color:#C9D4F2}
.scp-l-off{color:#9AA7C7}
.scp-l-ko{color:#FCA5A5}
${P} .scp-voir{min-height:36px;padding:4px 12px;border-radius:10px;border:1px solid rgba(143,168,240,.35);background:rgba(143,168,240,.1);color:var(--texte);font:700 13.5px var(--corps);cursor:pointer;white-space:nowrap}
${P} .scp-voir:hover{border-color:var(--bleu-texte,#7FA6FF)}
/* fenêtre « Voir les stories » */
${M} .scp-modale{width:min(820px,100%)}
${M} .scp-figs{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 20px}
${M} .scp-fig{margin:0;display:grid;gap:8px;align-content:start;min-width:0}
${M} .scp-fig figcaption{display:grid;gap:2px}
${M} .scp-fig figcaption b{font:800 18px var(--display)}
${M} .scp-fig figcaption small{font-size:13px;line-height:1.35}
${M} .scp-img{position:relative;display:block;border-radius:12px;overflow:hidden;background:#0B1638;min-height:120px}
${M} .scp-img img{display:block;width:100%;aspect-ratio:9/16;object-fit:contain;max-height:62vh}
${M} .scp-fig-act{display:flex;flex-wrap:wrap;gap:8px}
${M} .scp-fig-act .btn{min-height:44px;flex:1 1 auto;text-align:center}
${M} .modale-pied .scp-mini{margin-right:auto;color:var(--texte-doux);font-size:13px}
/* thème clair */
:root[data-theme="light"] ${P} .scp-puce{color:var(--texte);background:#EEF2FB;border-color:#D5DBEA}
:root[data-theme="light"] ${P} .scp-puce.ok{color:#14532D;background:#DCFCE7}
:root[data-theme="light"] ${P} .scp-puce.off,:root[data-theme="light"] ${P} .scp-puce.att{color:#7C4A03;background:#FEF3C7}
:root[data-theme="light"] ${P} .scp-h{color:var(--texte-doux)}
:root[data-theme="light"] ${P} .scp-sws,:root[data-theme="light"] ${P} .scp-style,:root[data-theme="light"] ${P} .scp-cron{background:#F7F9FE;border-color:#D5DBEA}
:root[data-theme="light"] ${P} .scp-style.on{border-color:#16A34A}
:root[data-theme="light"] ${P} .scp-cron-etat.ok,:root[data-theme="light"] .scp-l-ok{color:#15803D}
:root[data-theme="light"] ${P} .scp-cron-etat.att{color:#92400E}
:root[data-theme="light"] .scp-l-att,:root[data-theme="light"] .scp-l-off{color:var(--texte-doux)}
:root[data-theme="light"] .scp-l-ko{color:#B91C1C}
@media (max-width:760px){
  ${P} .scp-sws{padding:2px 12px}
  ${P} .scp-styles{grid-template-columns:minmax(0,1fr);gap:12px}
  ${P} .scp-style{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  ${P} .scp-style-bt{grid-column:1/-1;grid-template-columns:150px minmax(0,1fr);align-items:center}
  ${P} .scp-style-bt .scp-style-nom{flex-direction:column;align-items:flex-start;font-size:18px}
  ${P} .scp-zoom{grid-column:1/-1;min-height:44px}
  ${P} .scp-noms{grid-template-columns:minmax(0,1fr)}
  ${P} .scp-min{display:grid}
  ${P} .scp-chips{display:grid;grid-template-columns:repeat(5,minmax(0,1fr))}
  ${P} .scp-chip{min-width:0;padding:6px 4px}
  ${P} .scp-cron{padding:12px}
  ${P} .scp-code .btn{width:100%}
  ${P} .scp-ligne{align-items:stretch}
  ${P} .scp-etat{flex-direction:column;gap:2px;flex:1 1 100%}
  ${P} .scp-voir{min-height:44px;flex:1 1 100%}
  ${M} .scp-figs{gap:10px;padding:12px}
  ${M} .scp-fig figcaption b{font-size:16px}
  ${M} .scp-fig-act .btn{width:100%;padding-left:6px;padding-right:6px}
}`;
  document.head.appendChild(css);
})();
