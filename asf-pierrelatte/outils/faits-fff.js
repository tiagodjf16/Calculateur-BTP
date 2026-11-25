<script id="faits-fff-js">
/* =====================================================================
   FAITS DE MATCH DE LA FFF (buts, cartons, remplacements)
   - Le favori « ⚽ Faits de match ASF » lit sur epreuves.fff.fr les matchs joués du club et leur détail
     (« momentsForts »), puis ouvre le site avec ces données dans l'adresse (#faits=…).
   - Le site les garde de côté ; un coach ou le bureau touche « Ranger les faits de match » (onglet Foot animation,
     sous « Plateaux de la FFF ») : chaque match de la FFF est retrouvé sur le site (numéro FFF déjà connu, sinon
     même jour, domicile/extérieur, adversaire, heure, score) et son résumé est rempli.
   - Ce que les coachs ont saisi est gardé (les faits venus de la FFF portent src: "fff" ; un fait saisi à la main
     n'est retiré que s'il est déjà dans ceux de la FFF, à une minute près). Les buteurs de l'espace joueur ne sont
     calculés depuis la FFF que si le coach n'en a pas saisi pour ce match.
   - Une adresse fabriquée ailleurs ne peut rien écrire toute seule : il faut le bouton d'un coach ou du bureau.
   Ajouté sans modifier le script de l'application.
   ===================================================================== */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.panAnimation !== "function" || typeof ONG === "undefined") return;
  const CODE = /*CODE-FAVORI-FAITS*/"";
  const LIEN = "javascript:" + encodeURIComponent(CODE + "void 0");
  const PAGE_FFF = "https://epreuves.fff.fr/animation-loisir/cdg/125/club/2177";
  const e = ONG.e;
  const lire = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch(err){ return null; } };
  const garder = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch(err){} };
  const niv = () => { try { return typeof niveau === "function" ? niveau() : null; } catch(err){ return null; } };
  const peutEcrire = () => ["bureau", "entraineur"].includes(niv());
  const dire = (t, err) => { try { toast(t, err); } catch(x){} };
  const ATTENTE = "asfp-faits-attente", DERNIER = "asfp-faits-dernier", BILAN = "asfp-faits-bilan", ATTENTE_MAX = 3 * 3600e3;
  const propre = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n || 120);
  const nombre = v => (v === null || v === undefined || v === "" || !Number.isFinite(+v)) ? null : +v;

  /* ---------- réception : l'adresse #faits=… ouverte par le favori ; gardée jusqu'au rangement ---------- */
  const valide = d => d && d.type === "asf-faits" && d.v >= 1 && Array.isArray(d.matchs);
  const nettoyer = d => ({ lu: propre(d.lu, 40), recu: Date.now(), saison: !!d.saison,
    erreurs: (Array.isArray(d.erreurs) ? d.erreurs : []).slice(0, 20).map(x => propre(x, 80)),
    matchs: d.matchs.slice(0, 400).filter(x => x && propre(x.no, 20) && /^\d{4}-\d{2}-\d{2}/.test(propre(x.d, 40))).map(x => ({
      no: propre(x.no, 20), d: propre(x.d, 40), cp: propre(x.cp, 80), tr: propre(x.tr, 40), dom: !!x.dom,
      nq: propre(x.nq, 80), eq: propre(x.eq, 40), adv: propre(x.adv, 80), bn: nombre(x.bn), ba: nombre(x.ba), st: propre(x.st, 160),
      m: (Array.isArray(x.m) ? x.m : []).slice(0, 60).filter(Array.isArray).map(a => [propre(a[0], 30), Math.max(0, Math.min(200, +a[1] || 0)),
        Math.max(0, Math.min(30, +a[2] || 0)), a[3] === "n" ? "n" : "a", propre(a[4], 60), propre(a[5], 60)]) })) });
  const enAttente = () => { const p = lire(ATTENTE); if (p && Date.now() - (+p.recu || 0) > ATTENTE_MAX){ garder(ATTENTE, null); return null; } return p; };
  function ouvrirOnglet(n, prevenir){
    if (typeof rendreEspace !== "function" || !S.ui){ if (n < 100) setTimeout(() => ouvrirOnglet(n + 1, prevenir), 200); return; }
    const p = enAttente(); if (!p) return;
    S.ui.ongPli = S.ui.ongPli || {}; S.ui.ongPli["faits-fff"] = true;
    if (peutEcrire() && S.db && S.pret){
      S.ui.onglet = "animation"; try { rendreEspace(); } catch(err){}
      dire(`${p.matchs.length} match${p.matchs.length > 1 ? "s" : ""} reçu${p.matchs.length > 1 ? "s" : ""} de la FFF : touche « Ranger les faits de match ».`);
    } else if (n < 100) setTimeout(() => ouvrirOnglet(n + 1, prevenir), 300);
    else if (prevenir) dire("Faits de match reçus de la FFF : connecte-toi (coach ou bureau), puis ouvre Matchs et plateaux › Foot animation.");
  }
  (function recevoir(){
    const h = location.hash || "";
    if (!h.startsWith("#faits=")) return;
    let d = null;
    try { d = JSON.parse(decodeURIComponent(h.slice(7))); } catch(err){ d = null; }
    history.replaceState(null, "", location.pathname + "?faits=1#espace");
    setTimeout(() => { try { window.dispatchEvent(new HashChangeEvent("hashchange")); } catch(err){} }, 0);
    if (!valide(d)){ setTimeout(() => dire("Envoi de la FFF illisible : recommence avec le favori.", true), 1500); return; }
    const p = nettoyer(d);
    garder(ATTENTE, p); garder(DERNIER, p);
    setTimeout(() => ouvrirOnglet(0, true), 0);
  })();
  if (location.hash === "#espace" && enAttente()) setTimeout(() => ouvrirOnglet(0, false), 0);   // reçu avant la connexion

  /* ---------- retrouver sur le site un match de la FFF ---------- */
  const VIDES = new Set(["fc","f","c","as","a","s","us","u","es","e","sc","o","ol","football","foot","club","sport","sports","sp","av","ent","et","de","du","des",
    "la","le","les","d","l","st","saint","ste","cs","js","rc","ac","fcf","fr","atom","asf","pierrelatte","olympique","union","association","avenir","entente"]);
  const mots = s => (typeof slug === "function" ? slug(s) : String(s || "").toLowerCase()).split("-").filter(w => w && !/^\d+$/.test(w) && !VIDES.has(w));
  const ressemble = (a, b) => {
    const x = [...new Set(mots(a))], y = [...new Set(mots(b))]; if (!x.length || !y.length) return 0;
    const ok = x.filter(w => y.some(v => v === w || (v.length > 3 && w.length > 3 && (v.startsWith(w) || w.startsWith(v)))));
    return ok.length / Math.min(x.length, y.length);
  };
  const numEq = s => { const m = String(s || "").match(/(\d+)\s*$/); return m ? +m[1] : 1; };
  const eqDe2 = m => { try { return eqDe(m); } catch(err){ return String(m.equipe || ""); } };
  const joue2 = m => typeof m.bp === "number" && typeof m.bc === "number";
  function trouver(x, pris){
    const l = (S.matchs || []).filter(m => !/^pl-/.test(String(m.id || "")));
    const direct = l.find(m => String(m.fffNo || "") === x.no || new RegExp("(^|\\D)" + x.no + "(\\D|$)").test(String(m.id || "")));
    if (direct) return direct;
    const jour = x.d.slice(0, 10), heure = x.d.slice(11, 16);
    let best = null, bestS = 0;
    for (const m of l){
      if (m.date !== jour || pris.has(m.id)) continue;
      if (typeof m.dom === "boolean" && m.dom !== x.dom) continue;
      let s = ressemble(m.adv, x.adv) * 10;
      if (m.heure && m.heure === heure) s += 2;
      if (joue2(m) && x.bn !== null && m.bp === x.bn && m.bc === x.ba) s += 4;
      if (numEq(x.nq) === numEq(eqDe2(m))) s += 1;
      if (m.comp && x.cp && ressemble(m.comp, x.cp) >= .5) s += 1;
      if (s > bestS){ best = m; bestS = s; }
    }
    return bestS >= 5 ? best : null;
  }

  /* ---------- les faits de la FFF au format du site ---------- */
  const typeDe = t => {
    t = String(t || "").toLowerCase();
    if (/rouge/.test(t)) return "rouge";
    if (/jaune|avertissement/.test(t)) return "jaune";
    if (/rempla/.test(t)) return "rempl";
    if (/tir.?au.?but|seance/.test(t)) return "";                     // séance de tirs au but : pas dans le résumé
    if (/but|goal|penalty|pénalty|csc/.test(t)) return "but";
    return null;                                                       // inconnu : signalé dans le bilan
  };
  function faitsDe(x, inconnus){
    const out = [];
    x.m.forEach(([type, mn, plus, cote, j, j2]) => {
      const t = typeDe(type);
      if (t === null){ inconnus.add(type || "(vide)"); return; }
      if (!t) return;
      const f = { t, min: String(mn) + (plus ? "+" + plus : ""), c: cote === "n" ? "nous" : "eux", src: "fff" };
      let nj = j;
      if (t === "but" && /csc|contre/i.test(type)) nj = (nj ? nj + " " : "") + "(csc)";
      if (t === "but" && /penalty|pénalty/i.test(type)) nj = (nj ? nj + " " : "") + "(pen.)";
      if (nj) f.j = nj;
      if (t === "rempl" && j2) f.j2 = j2;
      out.push(f);
    });
    return out;
  }
  const cleMin = f => { const p = String(f.min || "").match(/(\d+)(?:\+(\d+))?/); return p ? +p[1] + (p[2] ? +p[2] / 100 : 0) : 999; };
  function fusion(avant, fff){
    const manuels = (Array.isArray(avant) ? avant : []).filter(f => f && f.src !== "fff");
    const garde = manuels.filter(f => !fff.some(g => g.t === f.t && g.c === f.c && Math.abs(cleMin(g) - cleMin(f)) <= 1));
    return [...fff, ...garde].sort((a, b) => cleMin(a) - cleMin(b));
  }
  function statsDe(m, faits){
    const actuelles = (Array.isArray(m.stats) ? m.stats : []).filter(Boolean);
    if (actuelles.some(s => s.src !== "fff" && (+s.buts || +s.passes))) return null;     // le coach a saisi les buteurs : on n'y touche pas
    const tot = {};
    faits.filter(f => f.src === "fff" && f.t === "but" && f.c === "nous" && f.j && !/\(csc\)/.test(f.j))
      .forEach(f => { const n = f.j.replace(/\s*\(pen\.\)$/, ""); (tot[n] = tot[n] || { nom: n, buts: 0, passes: 0, src: "fff" }).buts++; });
    const l = Object.values(tot);
    return l.length || actuelles.length ? l : null;
  }

  /* ---------- ranger ---------- */
  async function ranger(p){
    if (!peutEcrire()){ dire("Connecte-toi avec un compte coach ou bureau.", true); return null; }
    const autor = (() => { try { return equipesAutorisees(); } catch(err){ return []; } })();
    const bureauOk = (() => { try { return peutBureau(); } catch(err){ return false; } })();
    const permis = m => bureauOk || !autor.length || autor.includes(m.equipe) || autor.includes(eqDe2(m));
    const pris = new Set(), inconnus = new Set();
    const b = { fait: new Date().toISOString(), lu: p.lu, total: p.matchs.length, maj: 0, sans: 0, nonTrouves: [], refuses: 0, erreurs: 0, inconnus: [] };
    for (const x of p.matchs){
      const m = trouver(x, pris);
      if (!m){ b.nonTrouves.push(`${x.d.slice(8, 10)}/${x.d.slice(5, 7)} · ${x.dom ? x.nq + " – " + x.adv : x.adv + " – " + x.nq}${x.cp ? " (" + x.cp + ")" : ""}`); continue; }
      pris.add(m.id);
      if (!permis(m)){ b.refuses++; continue; }
      const fff = faitsDe(x, inconnus);
      if (!fff.length) b.sans++;
      const maj = { fffNo: x.no };
      if (fff.length){ maj.faits = fusion(m.faits, fff); const st = statsDe(m, maj.faits); if (st) maj.stats = st; }
      if (!m.dom && x.st && !m.adresse) maj.adresse = x.st;
      const avant = JSON.stringify([m.faits || [], m.stats || [], m.adresse || "", m.fffNo || ""]);
      const apres = JSON.stringify([maj.faits || m.faits || [], maj.stats || m.stats || [], maj.adresse || m.adresse || "", x.no]);
      if (avant === apres) continue;
      try { await S.db.doc("matchs/" + m.id).update(maj); Object.assign(m, maj); if (fff.length) b.maj++; }
      catch(err){ b.erreurs++; }
    }
    b.inconnus = [...inconnus].slice(0, 10);
    b.nonTrouves = b.nonTrouves.slice(0, 60);
    garder(BILAN, b);
    try { await S.db.doc("site/faits-import").set(b); } catch(err){}
    return b;
  }
  const pl = (n, s, p) => n + " " + (n > 1 ? (p || s + "s") : s);
  const phrase = b => [b.maj ? `${pl(b.maj, "match")} mis à jour` : "aucun nouveau fait de match",
    b.sans ? `${pl(b.sans, "match")} sans buts, cartons ni remplacements à la FFF` : "",
    b.nonTrouves.length ? `${pl(b.nonTrouves.length, "match")} de la FFF pas trouvé${b.nonTrouves.length > 1 ? "s" : ""} sur le site` : "",
    b.refuses ? `${pl(b.refuses, "match")} d'autres équipes que les tiennes` : "",
    b.erreurs ? `${pl(b.erreurs, "erreur")} d'enregistrement` : ""].filter(Boolean).join(" · ") + ".";

  /* ---------- la carte, dans l'onglet Foot animation, sous « Plateaux de la FFF » ---------- */
  (function suivre(){
    if (!S.db){ setTimeout(suivre, 500); return; }
    try { S.db.doc("site/faits-import").onSnapshot(d => { S.faitsBilan = d.exists ? d.data() : null; }); } catch(err){}
  })();
  const dateTxt = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
  function carte(){
    const att = enAttente(), loc = lire(BILAN), part = S.faitsBilan && S.faitsBilan.fait ? S.faitsBilan : null;
    const b = loc && (!part || String(loc.fait) >= String(part.fait)) ? loc : part;
    const recu = att ? `<div class="fal-recu"><b>📬 ${pl(att.matchs.length, "match")} reçu${att.matchs.length > 1 ? "s" : ""} de la FFF${att.lu ? " (" + e(dateTxt(att.lu)) + ")" : ""}</b>
        ${peutEcrire() ? `<button type="button" class="btn bleu" data-faits-a="ranger">Ranger les faits de match</button>` : `<span class="fal-mini">Connecte-toi (coach ou bureau) pour les ranger.</span>`}
        <button type="button" class="fal-lien" data-faits-a="oublier">Ignorer cet envoi</button></div>` : "";
    const etat = b ? `Dernier rangement : <b>${e(dateTxt(b.fait))}</b>. ${e(phrase(b))}` : "Aucun fait de match reçu de la FFF pour l'instant.";
    const inconnus = b && b.inconnus && b.inconnus.length ? `<p class="fal-mini">Faits que le site ne connaît pas encore : ${e(b.inconnus.join(", "))}.</p>` : "";
    const nt = b && b.nonTrouves && b.nonTrouves.length ? `<details class="fal-equipes"><summary>Matchs de la FFF pas trouvés sur le site (${b.nonTrouves.length})</summary>
        <ul class="faits-nt">${b.nonTrouves.map(t => `<li>${e(t)}</li>`).join("")}</ul></details>` : "";
    const corps = `${recu}<p class="fal-etat">${etat}</p>${inconnus}${nt}
      <ol class="fal-etapes">
        <li><b>Une seule fois : ajoute le favori.</b><br>
          <span class="fal-mini"><b>Ordinateur</b> : fais glisser ce bouton dans la barre de favoris (Ctrl + Maj + B pour l'afficher) :</span>
          <a class="btn bleu petit fal-favori" href="${e(LIEN)}" title="Fais glisser ce bouton dans ta barre de favoris">⚽ Faits de match ASF</a><br>
          <span class="fal-mini"><b>iPhone / Android</b> : <button type="button" class="fal-lien" data-faits-a="copier">copie le code du favori</button>, ajoute n'importe quelle page à tes favoris (signets),
          puis modifie ce favori : nom « Faits de match ASF », adresse = colle le code.</span></li>
        <li><b>Après les matchs du week-end :</b> ouvre <a href="${e(PAGE_FFF)}" target="_blank" rel="noopener">la page du club sur la FFF</a>, puis touche le favori « Faits de match ASF ».
          La première fois, il lit toute la saison ; ensuite, les deux derniers mois.</li>
        <li>Le favori ouvre le site du club : touche <b>« Ranger les faits de match »</b>. Buts, cartons et remplacements arrivent dans le résumé de chaque match ;
          ce que les coachs ont saisi est gardé.</li>
      </ol>
      <p class="fal-mini">La FFF ne donne les buteurs que s'ils ont été notés sur la feuille de match. Sinon, le coach peut les ajouter dans la page du match (« Saisir les faits de match ») : le favori ne les efface pas.</p>
      ${!att && lire(DERNIER) && peutEcrire() ? `<button type="button" class="btn contour petit" data-faits-a="reranger">Ranger à nouveau le dernier envoi</button>` : ""}`;
    const sous = att ? "Des matchs attendent d'être rangés" : b ? "Dernier rangement : " + e(dateTxt(b.fait)) : "Buts, cartons et remplacements des matchs, depuis la FFF";
    return ONG.pli("faits-fff", `<b>⚽ Faits de match de la FFF</b><small>${sous}</small>`, corps, !b || !!att, "📋")
      .replace('class="pli ong-pli"', 'class="pli ong-pli fal-carte faits-carte"');
  }
  const avant = window.panAnimation;
  window.panAnimation = function(){
    const h = avant.apply(this, arguments);
    return ONG.transformer(h, r => {
      const t = document.createElement("template"); t.innerHTML = carte();
      const fal = r.querySelector(".fal-carte:not(.faits-carte)");
      if (fal) fal.after(t.content);
      else { const choix = r.querySelector(".ong-anim-choix"); if (choix) choix.before(t.content); else r.prepend(t.content); }
    });
  };
  document.addEventListener("click", async ev => {
    const b = ev.target.closest && ev.target.closest("[data-faits-a]"); if (!b) return;
    ev.preventDefault();
    const a = b.dataset.faitsA;
    if (a === "copier"){
      try { await navigator.clipboard.writeText(LIEN); dire("Code du favori copié : colle-le comme adresse du favori."); }
      catch(err){ window.prompt("Copie ce code, puis colle-le comme adresse du favori :", LIEN); }
      return;
    }
    if (a === "oublier"){ garder(ATTENTE, null); try { rendrePanneau(); } catch(err){} return; }
    if (a === "ranger" || a === "reranger"){
      const p = a === "ranger" ? enAttente() : lire(DERNIER);
      if (!p){ dire("Aucun envoi en attente : utilise le favori sur la page de la FFF.", true); return; }
      b.disabled = true; b.textContent = "Rangement…";
      const r = await ranger(p);
      if (r){ if (a === "ranger") garder(ATTENTE, null); dire(phrase(r)); }
      try { rendrePanneau(); } catch(err){}
    }
  });
  const css = document.createElement("style");
  css.id = "faits-fff-css";
  css.textContent = `.faits-carte .faits-nt{margin:8px 0 2px 18px;display:grid;gap:4px;font:400 14px/1.4 var(--f-ui,inherit);color:var(--f-txt-2,inherit)}`;
  document.head.appendChild(css);
})();
</script>
