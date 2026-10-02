/* Onglet « Affiches matchs » (rubrique Communication) : les affiches de matchs avec des matchs tapés à la main.
   Rencontres et résultats du week-end, foot animation (plateaux avec plusieurs adversaires, scores par adversaire),
   vétérans, jour de match, résultat d'un match. On peut reprendre les matchs du calendrier puis compléter ou corriger.
   Le serveur dessine les affiches (POST api/affiches.php?manuel=1) exactement comme celles du lundi : feuille à domicile,
   feuille à l'extérieur, en story, publication 1080 × 1350 ou Facebook 1080 × 2160, et écrit le message de l'annonce.
   Publication : stories Facebook / Instagram, annonce Facebook / Instagram (api/publier.php), ou téléchargement.
   Ajouté sans modifier le script de l'application. Les listes restent dans ce navigateur. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONGLETS === "undefined" || typeof RUBRIQUES === "undefined" || typeof rendrePanneau !== "function") return;
  const OUTILS = window.ASFP_AFF;                                       // outils communs, fournis par evenements.js (chargé avant)
  if (!OUTILS) return;
  const { sansEmoji, serieDePublication, enregistrerImage, styleCadre } = OUTILS;

  /* ---------- types d'affiche ---------- */
  const TYPES = {
    "rencontres":     { ico: "📅", nom: "Rencontres", sous: "du week-end", titre: "Rencontres du week-end", fam: "champ", res: false },
    "resultats":      { ico: "📊", nom: "Résultats", sous: "du week-end", titre: "Résultats du week-end", fam: "champ", res: true },
    "fal-rencontres": { ico: "🧒", nom: "Foot animation", sous: "rencontres", titre: "Foot animation · rencontres", fam: "fal", res: false },
    "fal-resultats":  { ico: "🧒", nom: "Foot animation", sous: "résultats", titre: "Foot animation · résultats", fam: "fal", res: true },
    "vet-rencontres": { ico: "🍺", nom: "Vétérans", sous: "rencontres", titre: "Vétérans · rencontres", fam: "vet", res: false },
    "vet-resultats":  { ico: "🍺", nom: "Vétérans", sous: "résultats", titre: "Vétérans · résultats", fam: "vet", res: true },
    "match":          { ico: "⚽", nom: "Jour de match", sous: "un match", titre: "Jour de match", fam: "seul", res: false },
    "score":          { ico: "🏁", nom: "Résultat", sous: "d'un match", titre: "Résultat d'un match", fam: "seul", res: true },
  };
  const FORMATS = [["story", "Story", "1080 × 1920", "9/16"], ["carre", "Annonce", "1080 × 1350", "4/5"], ["fb", "Facebook · 2 feuilles", "1080 × 2160", "1/2"]];
  // une feuille seule en 1080 × 2160 serait coupée dans le fil Facebook : ce format ne sert qu'aux deux feuilles côte à côte
  const formatsPour = fs => fs.length > 1 ? FORMATS : FORMATS.filter(f => f[0] !== "fb");
  // foot animation : les catégories du club (le nombre d'équipes se choisit à part)
  const CATS_FAL = ["U6 · U7", "U8 · U9", "U10 · U11", "U13"];
  /* « U8 · U9 Promotion », « U10-U11 », « U13 · équipe 4 » → catégorie simple ; « équipe 4 » → numéro */
  function catSimple(eq){
    const t = String(eq || "");
    const p = t.match(/U\s?(\d{1,2})\s*(?:·|-|\/|à|a)\s*U?\s?(\d{1,2})/i);
    const n = p ? +p[1] : +((t.match(/U\s?(\d{1,2})/i) || [])[1] || 0);
    if (n === 6 || n === 7) return "U6 · U7";
    if (n === 8 || n === 9) return "U8 · U9";
    if (n === 10 || n === 11) return "U10 · U11";
    if (n === 12 || n === 13) return "U13";
    return t || CATS_FAL[0];
  }
  const numeroEquipe = eq => { const m = String(eq || "").match(/[ée]quipe\s*(\d{1,2})/i); return m ? m[1] : ""; };
  /* équipes de Pierrelatte numérotées toutes seules : dans une même catégorie, équipe 1, 2, 3…
     (un numéro déjà connu, comme « U13 · équipe 4 » du calendrier, est gardé) */
  function numeroter(liste, t){
    const res = liste.map(() => ({ nums: [], total: 1 }));
    if (t.fam !== "fal") return res;
    const parCat = new Map();
    liste.forEach((m, i) => { const c = catSimple(m.equipe); if (!parCat.has(c)) parCat.set(c, []); parCat.get(c).push(i); });
    for (const idx of parCat.values()){
      const n = i => enPoules(liste[i]) ? 0 : Math.max(1, Math.min(MAX_EQUIPES, +liste[i].equipes || 1));
      const fixes = i => String(liste[i].numeros || "").split(/[^\d]+/).filter(Boolean).map(Number).filter(x => x > 0);
      const pris = new Set(idx.flatMap(i => fixes(i).length === n(i) ? fixes(i) : []));
      let k = 1;
      const libre = () => { while (pris.has(k)) k++; pris.add(k); return k; };
      for (const i of idx){ const f = fixes(i); res[i].nums = f.length === n(i) ? f : Array.from({ length: n(i) }, libre); }
      const total = Math.max(idx.reduce((s, i) => s + n(i), 0), ...idx.flatMap(i => res[i].nums));
      idx.forEach(i => { res[i].total = total; });
    }
    return res;
  }
  /* foot animation : chaque équipe de Pierrelatte du plateau a sa poule (A, B…) et ses matchs (heure, adversaire, score).
     Les anciens brouillons et les matchs automatiques (« contre » et scores sans poule) deviennent les matchs de la 1re équipe. */
  const POULES = ["A", "B", "C", "D", "E", "F", "G", "H"], MAX_RENC = 8;
  const garder = (l, ok, max) => { for (let k = l.length - 1; k >= 0; k--) if (!ok(l[k])) l.splice(k, 1); if (l.length > max) l.length = max; return l; };
  function det(m){
    if (!Array.isArray(m.equipesDet)){
      const ms = (m.resultats || []).filter(r => r && String(r.adv || "").trim()).map(r => ({ heure: "", adv: String(r.adv).trim(), bp: r.bp ?? "", bc: r.bc ?? "" }));
      const libres = ms.slice();                                       // un score couvre un seul adversaire : le même nom d'abord, sinon le même club
      lignes(m.adversaires).forEach(a => {
        let k = libres.findIndex(p => p && slug(p.adv) === slug(a));
        if (k < 0) k = libres.findIndex(p => p && memeClub(p.adv, a));
        if (k >= 0) libres[k] = null; else ms.push({ heure: "", adv: a, bp: "", bc: "" });
      });
      m.equipesDet = [{ poule: "", matchs: ms.slice(0, MAX_RENC) }];
    }
    const n = Math.max(1, Math.min(MAX_EQUIPES, +m.equipes || 1));
    garder(m.equipesDet, q => q && typeof q === "object", n);                // remis en ordre sur place : les objets gardés restent les mêmes
    for (const q of m.equipesDet){
      if (!Array.isArray(q.matchs)) q.matchs = [];
      garder(q.matchs, p => p && typeof p === "object", MAX_RENC);
      q.matchs.forEach(p => { if (!/^\d{2}:\d{2}$/.test(p.heure || "")) p.heure = ""; p.adv = String(p.adv ?? ""); if (p.bp == null) p.bp = ""; if (p.bc == null) p.bc = ""; });
    }
    while (m.equipesDet.length < n) m.equipesDet.push({ matchs: [] });
    return m.equipesDet;
  }
  /* poules (brassage, tournoi…) : toutes leurs équipes, Pierrelatte parfois plusieurs fois, et leurs matchs.
     Une équipe = { id, nom } ; un match = { heure, a, b (id des équipes), sa, sb (buts de a et de b) } */
  const uidc = () => Math.random().toString(36).slice(2, 9);
  function pls(m){
    if (!Array.isArray(m.poulesT)) m.poulesT = [];
    garder(m.poulesT, q => q && typeof q === "object", POULES.length);      // sur place, comme det()
    for (const q of m.poulesT){
      if (!Array.isArray(q.equipes)) q.equipes = [];
      garder(q.equipes, e => e && e.id && String(e.nom || "").trim(), 12);
      const ids = new Set(q.equipes.map(e => e.id));
      if (!Array.isArray(q.matchs)) q.matchs = [];
      garder(q.matchs, p => p && ids.has(p.a) && ids.has(p.b), 30);
      q.matchs.forEach(p => { if (!/^\d{2}:\d{2}$/.test(p.heure || "")) p.heure = ""; if (p.sa == null) p.sa = ""; if (p.sb == null) p.sb = ""; });
    }
    if (!m.poulesT.length) m.poulesT.push({ equipes: [], matchs: [] });
    return m.poulesT;
  }
  const enPoules = m => m.mode === "poules";
  /* le même club déjà dans les poules du plateau : la 2e équipe devient « USVJ B », la 3e « USVJ C »… (comme le district) */
  function suffixe(m, v){
    const base = n => cleClub(String(n).replace(/\s+[A-Ha-h]$/, ""));
    if (/\s([A-Ha-h]|\d{1,2})$/.test(v)) return v;
    const memes = pls(m).flatMap(q => q.equipes).map(e => e.nom).filter(n => base(n) === base(v));
    if (!memes.length) return v;
    const pris = new Set(memes.map(n => (n.match(/\s([A-Ha-h])$/) || [, "A"])[1].toUpperCase()));
    const l = "BCDEFGH".split("").find(x => !pris.has(x));
    return l ? `${v} ${l}` : v;
  }
  const libelleEquipes = r => r.total < 2 ? "" : r.nums.length === 1 ? `équipe ${r.nums[0]}` : `équipes ${r.nums.length <= 3 ? r.nums.join(", ").replace(/, (\d+)$/, " et $1") : r.nums[0] + " à " + r.nums[r.nums.length - 1]}`;
  /* même club plusieurs fois (plusieurs de ses équipes) : Donzère 1, Donzère 2… */
  function numeroterClubs(noms){
    const base = n => String(n || "").replace(/\s+\d+$/, "").trim(), num = n => /\s\d+$/.test(String(n || "").trim());
    const compte = new Map();
    noms.forEach(n => { if (!num(n)) compte.set(slug(base(n)), (compte.get(slug(base(n))) || 0) + 1); });
    const vu = new Map();
    return noms.map(n => {
      if (num(n) || (compte.get(slug(base(n))) || 0) < 2) return n;
      const k = slug(base(n)), i = (vu.get(k) || 0) + 1; vu.set(k, i); return `${base(n)} ${i}`;
    });
  }
  const MAX_EQUIPES = 8;
  const MAX = 12;

  /* ---------- état (gardé dans ce navigateur) ---------- */
  const CLE = "asfp-affiches-matchs";
  const samediDe = d => { try { return weekend(d).sam; } catch(e){ return d || ""; } };
  function nouveau(t, samedi){
    const fam = TYPES[t].fam;
    const m = { dom: true, equipe: fam === "vet" ? "Vétérans" : "", comp: fam === "fal" ? "Plateau" : "", adv: "", date: samedi, heure: "", adresse: "", bp: "", bc: "" };
    if (fam === "fal"){ m.equipe = CATS_FAL[0]; m.equipes = "1"; m.numeros = ""; m.equipesDet = [{ poule: "", matchs: [] }]; }
    return m;
  }
  function charger(){
    let d = null;
    try { d = JSON.parse(localStorage.getItem(CLE) || "null"); } catch(e){}
    const E = { type: "rencontres", fmt: "carre", samedis: {}, samedisQuand: {}, auto: {}, titre: "", sponsors: true, listes: {}, msgs: {},
      pub: { fb_pub: true, ig_pub: true, fb_story: false, ig_story: false }, etat: "", enCours: "" };
    if (d && typeof d === "object"){
      if (TYPES[d.type]) E.type = d.type;
      if (FORMATS.some(f => f[0] === d.fmt)) E.fmt = d.fmt;
      // week-end choisi à la main : oublié quand il est passé (rencontres) ou choisi il y a plus d'une semaine (résultats)
      const quand = d.samedisQuand && typeof d.samedisQuand === "object" ? d.samedisQuand : {};
      if (d.samedis && typeof d.samedis === "object") for (const t of Object.keys(TYPES)){
        const v = d.samedis[t], q = +quand[t] || 0;
        if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v) || !q) continue;
        if (TYPES[t].res ? Date.now() - q < 7 * 864e5 : v >= samediParDefaut(t)){ E.samedis[t] = v; E.samedisQuand[t] = q; }
      }
      // matchs automatiques : seule une liste modifiée à la main est gardée ; les autres sont redemandés (scores arrivés depuis…)
      if (d.auto && typeof d.auto === "object") for (const t of Object.keys(TYPES)) if (d.auto[t] && typeof d.auto[t].samedi === "string" && d.auto[t].modifie) E.auto[t] = { samedi: d.auto[t].samedi, modifie: true, source: d.auto[t].source || "", quand: 0 };
      if (typeof d.titre === "string") E.titre = d.titre;
      if (typeof d.sponsors === "boolean") E.sponsors = d.sponsors;
      if (d.pub && typeof d.pub === "object") for (const k of Object.keys(E.pub)) if (typeof d.pub[k] === "boolean") E.pub[k] = d.pub[k];
      if (d.pub && d.pub._choix && typeof d.pub._choix === "object") E.pub._choix = { ...d.pub._choix };
      if (d.listes && typeof d.listes === "object") for (const t of Object.keys(TYPES)) if (Array.isArray(d.listes[t]) && E.auto[t]) E.listes[t] = d.listes[t].slice(0, MAX).filter(x => x && typeof x === "object");
      if (d.msgs && typeof d.msgs === "object") for (const t of Object.keys(TYPES)) if (d.msgs[t] && typeof d.msgs[t].msg === "string") E.msgs[t] = { msg: d.msgs[t].msg, libre: !!d.msgs[t].libre };
    }
    for (const t of Object.keys(TYPES)){ if (!E.listes[t]) E.listes[t] = []; if (!E.msgs[t]) E.msgs[t] = { msg: "", libre: false }; }
    return E;
  }
  const E = () => S.ui.affMatchs || (S.ui.affMatchs = charger());
  const L = () => E().listes[E().type];
  /* week-end par défaut : le prochain pour les rencontres, le dernier commencé pour les résultats */
  function samediParDefaut(t){
    if (!TYPES[t].res) return samediDe();
    const d = new Date(); d.setHours(12, 0, 0, 0); const j = d.getDay();
    d.setDate(d.getDate() - (j === 6 ? 0 : j === 0 ? 1 : j + 1));
    return iso(d);
  }
  const SAM = () => E().samedis[E().type] || samediParDefaut(E().type);
  const marquer = () => { const a = E().auto[E().type]; if (a) a.modifie = true; };
  const T = () => TYPES[E().type];
  let saveT;
  function sauver(){
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      const e = E();
      try { localStorage.setItem(CLE, JSON.stringify({ type: e.type, fmt: e.fmt, samedis: e.samedis, samedisQuand: e.samedisQuand, auto: e.auto, titre: e.titre, sponsors: e.sponsors, pub: e.pub, listes: e.listes, msgs: e.msgs })); } catch(err){}
    }, 300);
  }

  /* ---------- données envoyées au serveur ---------- */
  const lignes = s => String(s || "").split(/\r?\n|,/).map(x => x.trim()).filter(Boolean);
  const nombre = v => (v === "" || v === null || v === undefined || isNaN(+v)) ? null : Math.max(0, Math.min(99, Math.round(+v)));
  // les émojis ne vont que dans le message : la police de l'affiche ne les a pas
  const net = v => sansEmoji(String(v || "")).trim();
  function matchServeur(m, t, num){
    const o = { equipe: t.fam === "vet" ? "Vétérans" : net(m.equipe), comp: net(m.comp), adv: net(m.adv),
      dom: !!m.dom, date: m.date || "", heure: m.heure || "", adresse: m.dom ? "" : net(m.adresse) };
    if (t.fam === "fal"){
      o.equipe = catSimple(o.equipe);
      if (enPoules(m)){
        o.equipes = 1;
        o.poules = pls(m).map((q, k) => {
          const nom = new Map(q.equipes.map(e => [e.id, net(e.nom)]));
          let ms = q.matchs.map(p => ({ heure: p.heure || "", a: nom.get(p.a) || "", b: nom.get(p.b) || "", sa: nombre(p.sa), sb: nombre(p.sb) })).filter(p => p.a && p.b && p.a !== p.b);
          if (m.seulNous) ms = ms.filter(p => nousMeme(p.a) || nousMeme(p.b));
          return { nom: POULES[k], equipes: q.equipes.map(e => net(e.nom)).filter(Boolean), matchs: ms };
        }).filter(q => q.equipes.length || q.matchs.length);
        return o;
      }
      const d = det(m);
      o.equipes = d.length;
      if (num && num.total > 1) o.numeros = num.nums;
      o.nos = d.map((q, k) => {
        const ms = q.matchs.map(p => ({ heure: p.heure || "", adv: net(p.adv), bp: nombre(p.bp), bc: nombre(p.bc) })).filter(p => p.adv);
        const noms = numeroterClubs(ms.map(p => p.adv)); ms.forEach((p, j) => { p.adv = noms[j]; });
        return { numero: num && num.total > 1 ? num.nums[k] || 0 : 0, matchs: ms };
      });
    } else if (t.res){ o.bp = nombre(m.bp); o.bc = nombre(m.bc); }
    return o;
  }
  // instantané de l'affiche : ce qui part à la publication ne bouge plus si on continue à taper pendant l'envoi
  const instantane = () => JSON.parse(JSON.stringify({ type: E().type, titre: E().titre, sponsors: E().sponsors, samedi: SAM(), liste: L() }));
  const donnees = (lieu, fmt, s = instantane()) => ({ type: s.type, lieu: lieu || "", format: fmt, titre: net(s.titre), sponsors: s.sponsors, samedi: s.samedi,
    matchs: (nums => s.liste.map((m, i) => matchServeur(m, TYPES[s.type], nums[i])))(numeroter(s.liste, TYPES[s.type])) });
  /* ce qui manque à un match pour être sur l'affiche (le serveur l'ignore sinon) */
  function manque(m, t = T()){
    const x = [];
    if (!m.date) x.push("la date");
    if (t.fam === "fal"){
      if (!m.dom && !net(m.adv)) x.push("le club qui reçoit");
      if (enPoules(m)){
        if (!pls(m).some(q => q.equipes.length)) x.push("les équipes des poules");
        else if (t.res && !pls(m).some(q => q.matchs.some(p => nombre(p.sa) !== null && nombre(p.sb) !== null))) x.push("au moins un score");
      }
      else if (t.res && !det(m).some(q => q.matchs.some(p => String(p.adv || "").trim() && nombre(p.bp) !== null && nombre(p.bc) !== null))) x.push("au moins un score");
    } else {
      if (t.fam !== "vet" && !net(m.equipe)) x.push("l'équipe");
      if (!net(m.adv)) x.push("l'adversaire");
      if (t.fam === "seul" && t.res && (nombre(m.bp) === null || nombre(m.bc) === null)) x.push("le score");
    }
    return x;
  }
  /* à savoir avant de publier, sans empêcher l'affiche : score pas encore connu, rencontre sans score, date hors du week-end */
  function joursWeekend(sam){
    let j = null; try { j = typeof plage === "function" ? plage(sam) : null; } catch(err){}
    if (Array.isArray(j) && j.length) return j;
    const d = jd(sam), v = new Date(d); v.setDate(d.getDate() - 1); const di = new Date(d); di.setDate(d.getDate() + 1);
    return [iso(v), sam, iso(di)];
  }
  function avertir(m, t = T()){
    const x = [];
    if (m.date && !joursWeekend(SAM()).includes(m.date)) x.push(`ce match n'est pas le week-end choisi (${typeof dateLongue === "function" ? dateLongue(m.date) : m.date})`);
    if ((t.fam === "champ" || t.fam === "vet") && t.res && net(m.adv) && (nombre(m.bp) === null || nombre(m.bc) === null)) x.push("pas encore de score : « NC » sur l'affiche");
    if (t.fam === "fal" && t.res){
      const sans = enPoules(m) ? pls(m).flatMap(q => q.matchs.filter(p => nombre(p.sa) === null || nombre(p.sb) === null)).length
        : det(m).flatMap(q => q.matchs.filter(p => net(p.adv) && (nombre(p.bp) === null || nombre(p.bc) === null))).length;
      if (sans) x.push(`${sans} rencontre${sans > 1 ? "s" : ""} sans score : pas sur l'affiche`);
    }
    return x;
  }
  /* feuilles à dessiner : domicile et/ou extérieur (une seule pour un match seul) */
  function feuilles(s){
    const t = s ? TYPES[s.type] : T(), l = s ? s.liste : L();
    if (t.fam === "seul") return [null];
    const ok = l.filter(m => !manque(m, t).length);
    const f = ["dom", "ext"].filter(l => ok.some(m => !!m.dom === (l === "dom")));
    return f.length ? f : ["dom"];
  }
  const api = () => (window.ASFP_API || "/api");
  async function image(lieu, fmt, s, signal){
    const r = await fetch(api() + "/affiches.php?manuel=1&v=" + Date.now().toString(36), { method: "POST", credentials: "same-origin", cache: "no-store", signal,
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(donnees(lieu, fmt, s)) });
    const type = r.headers.get("Content-Type") || "";
    if (!r.ok || !type.startsWith("image/")) throw new Error(((await r.text().catch(() => "")) || `erreur ${r.status}`).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160));
    return r.blob();
  }

  /* ---------- message de l'annonce ---------- */
  const maj1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  function messageSeul(){
    const m = L()[0]; if (!m) return "";
    const adv = typeof joliClub === "function" ? joliClub(m.adv) : m.adv, eq = String(m.equipe || "").trim() || "équipe";
    const quand = m.date ? maj1(dateLongue(m.date)) + (m.heure ? " · " + hFr(m.heure) : "") : "";
    const lieu = m.dom ? (typeof ADRESSE_STADE === "string" ? ADRESSE_STADE : "Stade Gustave Jaume, Pierrelatte") : (String(m.adresse || "").trim() || "Chez " + adv);
    if (E().type === "score"){
      const bp = nombre(m.bp), bc = nombre(m.bc);
      if (bp === null || bc === null) return "";
      const sc = m.dom ? `Pierrelatte ${bp} – ${bc} ${adv}` : `${adv} ${bc} – ${bp} Pierrelatte`;
      const iss = bp > bc ? "✅ Victoire de nos " + eq + " !" : bp < bc ? "❌ Défaite de nos " + eq + "." : "🤝 Match nul pour nos " + eq + ".";
      return [`🏁 Résultat · ${eq}${m.comp ? " · " + m.comp : ""}`, "", sc, iss, "", "Merci à nos supporters 💙🤍", "#ASFPierrelatte"].join("\n");
    }
    return [`⚽ ${m.comp || "Match"} · ${eq}`, "", `🆚 ${m.dom ? `Pierrelatte – ${adv}` : `${adv} – Pierrelatte`}`, quand && `📅 ${quand}`, `📍 ${lieu}`, "",
      m.dom ? `Venez nombreux encourager nos ${eq} ! 💙🤍` : `Tous derrière nos ${eq} ! 💙🤍`, "#ASFPierrelatte"].filter(x => x !== "" || true).join("\n").replace(/\n{3,}/g, "\n\n");
  }
  let msgT, msgJeton = 0;
  async function messageCalcule(t){                                     // null : pas de réponse, l'ancien message reste
    if (TYPES[t].fam === "seul") return messageSeul();
    try {
      const r = await fetch(api() + "/affiches.php?manuel=1&message=1", { method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(donnees("", "carre")) });
      return r.ok ? (await r.text()).trim() : null;
    } catch(err){ return null; }
  }
  function majMessage(tout){
    const e = E(), t = e.type, mm = e.msgs[t];
    if (mm.libre) return;
    clearTimeout(msgT);
    msgT = setTimeout(async () => {
      const j = ++msgJeton;
      const txt = await messageCalcule(t);
      if (txt === null || j !== msgJeton || e.type !== t || mm.libre) return;
      mm.msg = txt; sauver();
      const z = document.getElementById("am-msg");
      if (z && document.activeElement !== z) z.value = txt;
      const lb = document.getElementById("am-libre"); if (lb) lb.hidden = true;
    }, tout ? 0 : 1200);
  }

  /* ---------- clubs pour les menus déroulants : déjà rencontrés, puis tous ceux du district ---------- */
  const joli = n => { try { return typeof joliClub === "function" ? joliClub(n) : String(n || ""); } catch(err){ return String(n || ""); } };
  let CLUBS = { deja: [], tous: [] };
  function preparerClubs(){
    const vus = new Map(), deja = [];
    const ajout = (liste, nom) => { nom = String(nom || "").replace(/\s+\d+$/, "").trim(); if (!nom || /pierrelatte|atom'?\s*sports?/i.test(nom)) return;
      const k = cleClub(nom); if (vus.has(k)) return; vus.set(k, true); liste.push(nom.toUpperCase()); };     // « CO DONZÉROIS » = « C.O. DONZEROIS »
    (S.matchsAnimation || []).forEach(m => { ajout(deja, m.adv); (m.adversaires || []).forEach(a => ajout(deja, a)); (m.resultats || []).forEach(r => ajout(deja, r.adv)); });
    (S.matchs || []).forEach(m => ajout(deja, m.adv));
    const tous = [];
    try { if (typeof clubsConnus === "function") clubsConnus().forEach(c => ajout(tous, c[0])); } catch(err){}
    CLUBS = { deja: deja.sort((a, b) => a.localeCompare(b)), tous: tous.sort((a, b) => a.localeCompare(b)) };
  }
  const memeClub = (a, b) => slug(String(a || "").replace(/\s+\d+$/, "")) === slug(String(b || "").replace(/\s+\d+$/, ""));
  /* champ « club » : on tape quelques lettres, la liste se resserre (déjà rencontrés, puis clubs du district) ;
     un club qui n'est pas dans la liste se met tel qu'on l'a tapé. ajout : le champ « Contre » qui ajoute une étiquette par club. */
  let numClub = 0;
  function champClub(attrs, valeur, invite, ajout){
    const id = "am-club-" + (++numClub);
    return `<span class="am-club${ajout ? " am-club-ajout" : ""}"><input type="text" ${attrs} data-am-club="${ajout ? "ajout" : "un"}" value="${esc(valeur ? joli(valeur) : "")}"
      placeholder="${esc(invite)}" maxlength="60" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="done"
      role="combobox" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="${id}">
      <button type="button" class="am-club-x" data-am-club-a="effacer" tabindex="-1" aria-label="Effacer" ${valeur ? "" : "hidden"}>✕</button>
      ${ajout ? `<button type="button" class="btn contour petit am-club-ok" data-am-club-a="ajouter" hidden>Ajouter</button>` : ""}
      <span class="am-club-liste" id="${id}" role="listbox" aria-label="Clubs" hidden></span></span>`;
  }
  const cleClub = n => slug(String(n || "").replace(/\s+\d+$/, "")).replace(/-/g, "");
  const tactile = () => { try { return matchMedia("(pointer: coarse)").matches; } catch(err){ return false; } };
  function listeClubs(inp, q){
    const boite = inp.parentNode.querySelector(".am-club-liste"); if (!boite) return;
    const ajout = inp.dataset.amClub === "ajout", tape = String(q || "").trim();
    const mots = slug(tape).split("-").filter(w => w && w !== "x");
    const garde = n => { const k = slug(n).replace(/-/g, ""); return mots.every(w => k.includes(w)); };
    const deja = CLUBS.deja.filter(garde), tous = CLUBS.tous.filter(garde).slice(0, tape ? 80 : 400);
    const plat = n => slug(n).replace(/-/g, "");                     // « C.O. Donzérois » = « CO DONZEROIS », mais « … 2 » reste différent
    const exact = tape && [...deja, ...tous].find(n => plat(n) === plat(tape));
    const poule = ajout && inp.dataset.q !== undefined, mm = L()[+inp.dataset.i] || {};
    const deDans = !ajout ? [] : poule ? ((pls(mm)[+inp.dataset.q] || {}).equipes || []).map(e => e.nom) : ((det(mm)[+inp.dataset.k] || {}).matchs || []).map(p => p.adv);
    let k = 0;
    const opt = (v, lib, cl = "") => `<span class="am-club-opt${cl}" role="option" id="${boite.id}-${k++}" data-v="${esc(v)}" aria-selected="false">${lib}</span>`;
    const surl = n => { let t = esc(joli(n)); if (!mots.length) return t;
      const brut = joli(n), plat = brut.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const w = mots.slice().sort((a, b) => b.length - a.length)[0], at = plat.indexOf(w);
      return at < 0 || plat.length !== brut.length ? t : esc(brut.slice(0, at)) + "<b>" + esc(brut.slice(at, at + w.length)) + "</b>" + esc(brut.slice(at + w.length)); };
    const deja2 = n => deDans.some(a => memeClub(a, n)) ? ` <small>déjà ajouté · une autre équipe</small>` : "";
    let h = "";
    if (tape && !exact) h += opt(tape, `${ajout ? "➕ Ajouter" : "✏️ Mettre"} « <b>${esc(tape)}</b> »<small>${deja.length || tous.length ? "s'il n'est pas dans la liste" : "club pas encore dans la liste"}</small>`, " am-club-libre");
    if (poule && garde("Pierrelatte")) h += `<span class="am-club-gr" role="presentation">Notre club</span>` + opt("Pierrelatte", surl("Pierrelatte") + (pls(mm).some(q => q.equipes.some(e => nousMeme(e.nom))) ? ` <small>une autre équipe : ${esc(suffixe(mm, "Pierrelatte"))}</small>` : ""));
    if (deja.length) h += `<span class="am-club-gr" role="presentation">Déjà rencontrés</span>` + deja.map(n => opt(n, surl(n) + deja2(n))).join("");
    if (tous.length) h += `<span class="am-club-gr" role="presentation">Clubs du district</span>` + tous.map(n => opt(n, surl(n) + deja2(n))).join("");
    if (!h) h = `<span class="am-club-vide">Tape le nom du club</span>`;
    boite.innerHTML = h; boite.hidden = false; boite.scrollTop = 0;
    inp.setAttribute("aria-expanded", "true"); inp.removeAttribute("aria-activedescendant");
    if (!tape) return;
    const os = [...boite.querySelectorAll(".am-club-opt")];
    const n = exact ? os.findIndex(o => o.dataset.v === exact) : os.findIndex(o => !o.classList.contains("am-club-libre"));
    activerClub(inp, n < 0 ? 0 : n);
  }
  function activerClub(inp, n){
    const boite = inp.parentNode.querySelector(".am-club-liste"); if (!boite) return;
    const os = [...boite.querySelectorAll(".am-club-opt")]; if (!os.length) return;
    n = (n + os.length) % os.length;
    os.forEach((o, j) => { o.classList.toggle("actif", j === n); o.setAttribute("aria-selected", j === n ? "true" : "false"); });
    inp.setAttribute("aria-activedescendant", os[n].id);
    const o = os[n]; if (o.offsetTop < boite.scrollTop || o.offsetTop + o.offsetHeight > boite.scrollTop + boite.clientHeight) o.scrollIntoView({ block: "nearest" });
  }
  function fermerClubs(inp){
    const boite = inp && inp.parentNode && inp.parentNode.querySelector(".am-club-liste");
    if (boite){ boite.hidden = true; boite.innerHTML = ""; }
    if (inp){ inp.setAttribute("aria-expanded", "false"); inp.removeAttribute("aria-activedescendant"); }
  }
  function boutonsClub(inp){
    const w = inp.parentNode, v = inp.value.trim();
    const x = w.querySelector(".am-club-x"); if (x) x.hidden = !v;
    const ok = w.querySelector(".am-club-ok"); if (ok) ok.hidden = !v;
  }
  function choisirClub(inp, v, libre){
    v = String(v || "").trim(); if (!v) return;
    const i = +inp.dataset.i, m = L()[i]; if (!m) return;
    if (inp.dataset.amClub === "ajout" && inp.dataset.q !== undefined){
      const q = pls(m)[+inp.dataset.q]; if (!q) return;
      if (q.equipes.length >= 12){ toast("12 équipes au plus par poule", true); return; }
      const e = { id: uidc(), nom: suffixe(m, libre || /[a-zà-ÿ]/.test(v) ? v : joli(v)) };
      q.matchs.push(...q.equipes.map(o => ({ heure: "", a: o.id, b: e.id, sa: "", sb: "" })));   // chacun contre chacun
      q.equipes.push(e);
      inp.value = ""; fermerClubs(inp); if (tactile()) inp.blur();
      marquer(); sauver(); majMessage(); rendrePanneau();
      return;
    }
    if (inp.dataset.amClub === "ajout"){
      const q = det(m)[+inp.dataset.k]; if (!q) return;
      if (q.matchs.length >= MAX_RENC){ toast(`${MAX_RENC} matchs au plus par équipe`, true); return; }
      q.matchs.push({ heure: "", adv: v, bp: "", bc: "" });            // le même club deux fois : deux de ses équipes (Donzère 1, Donzère 2)
      inp.value = ""; fermerClubs(inp); if (tactile()) inp.blur();
      marquer(); sauver(); majMessage(); rendrePanneau();
      return;
    }
    fermerClubs(inp);
    const sel = selChamp(inp);
    if (tactile()) inp.blur();                                        // avant l'enregistrement : un panneau redessiné ne rend pas le focus
    inp.value = v; saisie(inp);
    const c = inp.isConnected ? inp : document.querySelector("#panneau " + sel);   // le champ peut avoir été redessiné
    if (c){ c.value = joli(v); boutonsClub(c); }
  }
  let focusRendu = false;                                               // focus remis par le panneau redessiné : la liste reste fermée
  document.addEventListener("focusin", ev => {
    const inp = ev.target; if (!inp.matches || !inp.matches("#panneau [data-am-club]") || focusRendu) return;
    listeClubs(inp, inp.dataset.amClub === "ajout" ? inp.value : "");
    if (inp.dataset.amClub === "un") setTimeout(() => { try { if (document.activeElement === inp) inp.setSelectionRange(0, inp.value.length); } catch(err){} }, 0);
    if (tactile()) setTimeout(() => {                                  // champ en bas de l'écran : on le remonte pour que la liste ne soit pas sous le clavier
      if (document.activeElement !== inp) return;
      const h = (window.visualViewport && visualViewport.height) || innerHeight;
      if (inp.getBoundingClientRect().top > h * .45) inp.scrollIntoView({ block: "start" });
    }, 300);
  });
  document.addEventListener("focusout", ev => {
    const inp = ev.target; if (!inp.matches || !inp.matches("[data-am-club]")) return;
    setTimeout(() => { if (document.activeElement !== inp) fermerClubs(inp); }, 180);
  });
  document.addEventListener("input", ev => {
    const inp = ev.target; if (!inp.matches || !inp.matches("[data-am-club]")) return;
    listeClubs(inp, inp.value); boutonsClub(inp);
  });
  document.addEventListener("keydown", ev => {
    const inp = ev.target; if (!inp.matches || !inp.matches("[data-am-club]")) return;
    const boite = inp.parentNode.querySelector(".am-club-liste"), ouvert = boite && !boite.hidden;
    const os = ouvert ? [...boite.querySelectorAll(".am-club-opt")] : [], n = os.findIndex(o => o.classList.contains("actif"));
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp"){
      ev.preventDefault();
      if (!ouvert){ listeClubs(inp, inp.dataset.amClub === "ajout" ? inp.value : ""); return; }
      activerClub(inp, n < 0 ? (ev.key === "ArrowDown" ? 0 : -1) : n + (ev.key === "ArrowDown" ? 1 : -1)); return;
    }
    if (ev.key === "Escape" && ouvert){ ev.preventDefault(); fermerClubs(inp); return; }
    if (ev.key === "Enter"){
      ev.preventDefault();
      if (n >= 0) choisirClub(inp, os[n].dataset.v, os[n].classList.contains("am-club-libre"));
      else if (inp.dataset.amClub === "ajout") choisirClub(inp, inp.value, true);
      else { fermerClubs(inp); if (tactile()) inp.blur(); }
    }
  });
  document.addEventListener("mousedown", ev => { if (ev.target.closest && ev.target.closest(".am-club-liste, [data-am-club-a]")) ev.preventDefault(); });   // le champ garde la main
  document.addEventListener("click", ev => {
    const o = ev.target.closest && ev.target.closest(".am-club-opt");
    const b = ev.target.closest && ev.target.closest("[data-am-club-a]");
    if (!o && !b) return;
    ev.preventDefault();                                                // dans un <label> : pas de clic renvoyé au champ
    const inp = (o || b).closest(".am-club").querySelector("[data-am-club]"); if (!inp) return;
    if (o){ choisirClub(inp, o.dataset.v, o.classList.contains("am-club-libre")); return; }
    if (b.dataset.amClubA === "ajouter"){                                 // comme Entrée : le club surligné, sinon le texte tapé
      const a = b.closest(".am-club").querySelector(".am-club-liste:not([hidden]) .am-club-opt.actif");
      choisirClub(inp, a ? a.dataset.v : inp.value, a ? a.classList.contains("am-club-libre") : true); return;
    }
    const sel = selChamp(inp);
    inp.value = ""; boutonsClub(inp);
    inp.dispatchEvent(new Event("input", { bubbles: true }));
    const c = inp.isConnected ? inp : document.querySelector("#panneau " + sel);
    if (c){ c.value = ""; boutonsClub(c); if (document.activeElement === c) listeClubs(c, ""); else c.focus(); }
  });

  /* ---------- le panneau ---------- */
  const champ = (i, k, l, val, attrs = "", type = "text") => `<label>${l}<input type="${type}" data-am="${k}" data-i="${i}" value="${esc(val ?? "")}" ${attrs}></label>`;
  /* une équipe de Pierrelatte sur le plateau : sa poule, puis ses matchs (heure, adversaire, score) */
  function blocEquipe(i, k, q, num, t){
    const titre = num && num.total > 1 ? `Équipe ${num.nums[k] || k + 1}` : "Notre équipe";
    const at = j => `data-i="${i}" data-k="${k}"${j === undefined ? "" : ` data-j="${j}"`}`;
    return `<div class="am-eq">
      <div class="am-eq-tete"><b>${esc(titre)}</b>
      </div>
      ${q.matchs.map((p, j) => `<div class="am-rencontre${t.res ? " am-rencontre-res" : ""}">
        ${t.res ? "" : `<span class="am-rh"><input type="time" data-am="p-heure" ${at(j)} value="${esc(p.heure)}" aria-label="Heure du match"></span>`}
        ${champClub(`data-am="p-adv" ${at(j)} aria-label="Adversaire"`, p.adv, "Adversaire : chercher ou taper…")}
        ${t.res ? `<span class="am-sc"><input type="number" min="0" max="99" inputmode="numeric" data-am="p-bp" ${at(j)} value="${esc(p.bp)}" aria-label="Buts de Pierrelatte" placeholder="Nous"><span>–</span><input type="number" min="0" max="99" inputmode="numeric" data-am="p-bc" ${at(j)} value="${esc(p.bc)}" aria-label="Buts de l'adversaire" placeholder="Eux"></span>` : ""}
        <button type="button" class="btn contour petit" data-am-a="p-suppr" ${at(j)} aria-label="Retirer ce match">✕</button></div>`).join("")
        || `<p class="quoi am-eq-vide">Pas encore de match : ajoute les adversaires ci-dessous${t.res ? "" : ", puis l'heure de chaque match"}.</p>`}
      ${q.matchs.length < MAX_RENC ? champClub(`${at()} aria-label="Ajouter un match : ${esc(titre)}"`, "", "+ Un match : chercher ou taper l'adversaire…", true) : ""}
    </div>`;
  }
  /* une poule : ses équipes (étiquettes), puis ses matchs (heure ou score, équipe – équipe) */
  function blocPoule(m, i, iq, q, t, nb){
    const at = j => `data-i="${i}" data-q="${iq}"${j === undefined ? "" : ` data-j="${j}"`}`;
    const opts = sel => q.equipes.map(e => `<option value="${esc(e.id)}" ${e.id === sel ? "selected" : ""}>${esc(e.nom)}</option>`).join("");
    const nom = id => (q.equipes.find(e => e.id === id) || {}).nom || "";
    return `<div class="am-eq am-pl">
      <div class="am-eq-tete"><b>Poule ${POULES[iq]}</b>${nb > 1 ? `<button type="button" class="btn contour petit" data-am-a="poule-suppr" ${at()}>Retirer la poule</button>` : ""}</div>
      <div class="am-puces">${q.equipes.map((e, j) => `<span class="am-puce${nousMeme(e.nom) ? " am-nous" : ""}">${esc(e.nom)}<button type="button" data-am-a="peq-suppr" ${at(j)} aria-label="Retirer ${esc(e.nom)}">✕</button></span>`).join("")
        || `<span class="quoi">Ajoute les équipes de la poule (Pierrelatte en premier dans la liste).</span>`}</div>
      ${q.equipes.length < 12 ? champClub(`${at()} aria-label="Ajouter une équipe à la poule ${POULES[iq]}"`, "", "+ Une équipe : chercher ou taper…", true) : ""}
      ${q.matchs.length ? `<b class="ps-lab am-pl-lab">Les matchs${t.res ? " et les scores" : ""}</b>` : q.equipes.length > 1 ? "" : ""}
      ${q.matchs.map((p, j) => `<div class="am-pm${t.res ? " am-pm-res" : ""}">
        <select class="am-pm-a" data-am="t-a" ${at(j)} aria-label="Équipe">${opts(p.a)}</select>
        ${t.res ? `<input class="am-pm-sa" type="number" min="0" max="99" inputmode="numeric" data-am="t-sa" ${at(j)} value="${esc(p.sa)}" aria-label="Buts de ${esc(nom(p.a))}">` : ""}
        <span class="am-pm-t">–</span>
        ${t.res ? `<input class="am-pm-sb" type="number" min="0" max="99" inputmode="numeric" data-am="t-sb" ${at(j)} value="${esc(p.sb)}" aria-label="Buts de ${esc(nom(p.b))}">` : ""}
        <select class="am-pm-b" data-am="t-b" ${at(j)} aria-label="Équipe">${opts(p.b)}</select>
        ${t.res ? "" : `<span class="am-rh am-pm-h"><input type="time" data-am="t-heure" ${at(j)} value="${esc(p.heure)}" aria-label="Heure du match"></span>`}
        <button type="button" class="btn contour petit am-pm-x" data-am-a="t-suppr" ${at(j)} aria-label="Retirer ce match">✕</button></div>`).join("")}
      ${q.equipes.length > 1 ? `<button type="button" class="btn contour petit" data-am-a="t-ajout" ${at()}>+ Un match</button>` : ""}
    </div>`;
  }
  function carteMatch(m, i, n, num){
    const t = T(), fal = t.fam === "fal", seul = t.fam === "seul";
    const eqLib = fal && num && num.nums.length ? libelleEquipes(num) : "";
    const x = manque(m);
    const lieuBtns = `<div class="am-lieu" role="group" aria-label="Lieu">
      <button type="button" class="as-fmt ${m.dom ? "on" : ""}" aria-pressed="${!!m.dom}" data-am-a="dom" data-i="${i}" data-k="1">🏠 À domicile</button>
      <button type="button" class="as-fmt ${!m.dom ? "on" : ""}" aria-pressed="${!m.dom}" data-am-a="dom" data-i="${i}" data-k="0">✈️ À l'extérieur</button></div>`;
    let corps;
    if (fal){
      const cat = catSimple(m.equipe);
      const d = det(m), po = enPoules(m), pl = po ? pls(m) : [];
      corps = `<div class="am-plein am-mode" role="group" aria-label="Organisation">
          <button type="button" class="as-fmt ${po ? "" : "on"}" data-am-a="mode" data-i="${i}" data-k="">⚽ Plateau : nos matchs</button>
          <button type="button" class="as-fmt ${po ? "on" : ""}" data-am-a="mode" data-i="${i}" data-k="poules">🗂️ Poules</button></div>
        <label>Catégorie<select data-am="equipe" data-i="${i}">${CATS_FAL.map(c => `<option ${c === cat ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
        ${po ? "" : `<label>Équipes de Pierrelatte<select data-am="equipes" data-i="${i}">${Array.from({ length: MAX_EQUIPES }, (_, k) => `<option value="${k + 1}" ${d.length === k + 1 ? "selected" : ""}>${k + 1} équipe${k ? "s" : ""}</option>`).join("")}</select></label>`}
        <label>Type<select data-am="comp" data-i="${i}">${["Plateau", "Brassage"].map(c => `<option ${c === m.comp ? "selected" : ""}>${c}</option>`).join("")}</select></label>
        ${champ(i, "date", "Date", m.date, "", "date")}${champ(i, "heure", t.res ? "Heure" : "Heure du plateau", m.heure, "", "time")}
        ${m.dom ? "" : `<label>Chez (club qui reçoit)${champClub(`data-am="adv" data-i="${i}" aria-label="Chez (club qui reçoit)"`, m.adv, "Rechercher ou taper un club…")}</label>`}
        ${m.dom ? "" : champ(i, "adresse", "Stade, ville", m.adresse, `maxlength="120" placeholder="Stade Marcel Pagnol, Donzère"`)}
        ${po ? `<div class="am-plein am-eqs"><p class="quoi am-aide">Chaque poule avec toutes ses équipes : Pierrelatte peut y être plusieurs fois (Pierrelatte B, Pierrelatte C…). Les matchs se créent tout seuls, chacun contre chacun${t.res ? " : mets les scores" : " : mets l'heure de chacun"}, retire ceux qui ne se jouent pas.</p>
            ${pl.map((q, iq) => blocPoule(m, i, iq, q, t, pl.length)).join("")}
            ${pl.length < POULES.length ? `<button type="button" class="btn contour petit" data-am-a="poule-ajout" data-i="${i}">+ Une poule (${POULES[pl.length]})</button>` : ""}
            <label class="af-choix am-seul ${m.seulNous ? "on" : ""}"><input type="checkbox" data-am="seulNous" data-i="${i}" ${m.seulNous ? "checked" : ""}>Sur l'affiche, seulement les matchs de Pierrelatte</label></div>`
          : `<div class="am-plein am-eqs">${d.map((q, k) => blocEquipe(i, k, q, num, t)).join("")}</div>`}`;
    } else {
      corps = `${t.fam === "vet" ? "" : champ(i, "equipe", "Équipe", m.equipe, `maxlength="40" list="am-equipes" placeholder="Seniors 1"`)}
        ${champ(i, "comp", "Compétition", m.comp, `maxlength="40" placeholder="D1, Régional 2, Coupe de la Drôme…"`)}
        <label>Adversaire${champClub(`data-am="adv" data-i="${i}" aria-label="Adversaire"`, m.adv, "Rechercher ou taper un club…")}</label>
        ${champ(i, "date", "Date", m.date, "", "date")}${champ(i, "heure", "Heure", m.heure, "", "time")}
        ${m.dom ? "" : champ(i, "adresse", "Stade, ville (facultatif)", m.adresse, `maxlength="120" placeholder="Stade municipal, Bourg-de-Péage"`)}
        ${t.res ? `<div class="am-plein am-score am-score-match"><span>Score : Pierrelatte</span>
            <span class="am-sc"><input type="number" min="0" max="99" inputmode="numeric" data-am="bp" data-i="${i}" value="${esc(m.bp)}" aria-label="Buts de Pierrelatte">
            <span>–</span>
            <input type="number" min="0" max="99" inputmode="numeric" data-am="bc" data-i="${i}" value="${esc(m.bc)}" aria-label="Buts de l'adversaire"></span>
            <span data-am-advlib="${i}">${esc(joli(m.adv) || "adversaire")}</span></div>` : ""}`;
    }
    return `<div class="am-match" data-am-carte="${i}">
      <div class="am-match-tete"><b>${seul ? "Le match" : `${fal ? "Plateau" : "Match"} ${i + 1}`}${eqLib ? ` <span class="am-eqnum">· Pierrelatte ${esc(eqLib)}</span>` : ""}</b>${lieuBtns}
        <button type="button" class="btn contour petit" data-am-a="suppr" data-i="${i}" aria-label="Supprimer ${fal ? "ce plateau" : "ce match"}">✕</button></div>
      <div class="am-champs">${corps}</div>
      <p class="am-manque" data-am-manque="${i}" ${x.length ? "" : "hidden"}>⚠️ Il manque ${x.join(" et ")} : ${fal ? "ce plateau" : "ce match"} ne sera pas sur l'affiche.</p>
      ${(a => `<p class="am-avert" data-am-avert="${i}" ${a.length ? "" : "hidden"}>ℹ️ ${esc(a.join(" · "))}</p>`)(x.length ? [] : avertir(m))}
    </div>`;
  }
  function panAffMatchs(){
    const e = E(), t = T(), l = L();
    preparerClubs();
    if (!S.heberge) return `<div class="carte af-carte"><div class="af-tete"><h2>Affiches matchs</h2></div>
      <p class="quoi">Les affiches sont dessinées par le serveur du club : ouvre l'espace club depuis le site en ligne (asf-pierrelatte.fr).</p></div>`;
    const seul = t.fam === "seul", fs = feuilles(), fmts = formatsPour(fs), F = fmts.find(f => f[0] === e.fmt) || fmts[1];
    const nomF = f => f === "dom" ? "À domicile" : f === "ext" ? "À l'extérieur" : "L'affiche";
    const opt = (k, lb, res) => `<label class="af-choix ${e.pub[k] ? "on" : ""}"><input type="checkbox" data-am-pub="${k}" aria-label="${lb} ${res}" ${e.pub[k] ? "checked" : ""}>${lb}</label>`;
    const equipes = (() => { let l = []; try { l = toutesEquipes(); } catch(err){}
      return [...new Set([...l.filter(x => !/U\s?6\s*à\s*U?\s?11/i.test(x)), "U6 · U7", "U8 · U9", "U10 · U11"])]; })();
    return `<div class="ev-zone am-zone">
    <datalist id="am-equipes">${equipes.map(c => `<option value="${esc(c)}">`).join("")}</datalist>
    <div class="carte af-carte">
      <div class="af-tete"><h2>Affiches matchs</h2><small>Les matchs du week-end se mettent tout seuls : ajoute ou corrige ce qui manque</small></div>
      <div class="am-types" role="group" aria-label="Type d'affiche">${Object.entries(TYPES).map(([k, x]) => `<button type="button" class="ev-type" aria-pressed="${k === e.type}" data-am-a="type" data-k="${k}"><span>${x.ico}</span>${esc(x.nom)}<small>${esc(x.sous)}</small></button>`).join("")}</div>
    </div>
    <div class="ev-grille">
      <section class="carte af-carte ev-ecrire" aria-labelledby="am-h-ecrire">
        <div class="af-tete"><h2 id="am-h-ecrire">✏️ ${seul ? "Le match" : "Les matchs de l'affiche"}</h2><small>${esc(t.titre)}</small></div>
        <div class="am-haut">
          <label>Week-end du<input type="date" data-am-g="samedi" value="${esc(SAM())}"></label>
          <button type="button" class="btn contour" data-am-a="reprendre">↺ Reprendre les matchs automatiques</button>
        </div>
        ${(() => { const a = e.auto[e.type];
          if (a && a.charge) return `<p class="am-source">⏳ Chargement des matchs automatiques du week-end…</p>`;
          if (a && a.erreur) return `<p class="am-source am-err">⚠️ ${esc(a.erreur)}</p>`;
          if (a && a.samedi === SAM() && !a.modifie) return `<p class="am-source">✅ Matchs automatiques du week-end${a.source === "app" ? " (repris du calendrier de l'app)" : ", comme les affiches du lundi"}. Ajoute ou corrige ce qui manque : matchs, scores, plateaux…</p>`;
          if (a && a.modifie) return `<p class="am-source">✏️ Liste modifiée à la main. « ↺ Reprendre les matchs automatiques » pour revenir à celle du calendrier.</p>`;
          return ""; })()}
        ${seul && (e.auto[e.type] || {}).tous && e.auto[e.type].tous.length > 1 ? `<label class="am-quel">Quel match ?<select data-am-g="quel">${e.auto[e.type].tous.map((m, k) => `<option value="${k}" ${l[0] && l[0].date === m.date && l[0].heure === m.heure && net(l[0].adv) === net(m.adv) ? "selected" : ""}>${esc([m.equipe, joli(m.adv), m.date ? (typeof dateLongue === "function" ? dateLongue(m.date) : m.date) + (m.heure ? " " + hFr(m.heure) : "") : ""].filter(Boolean).join(" · "))}</option>`).join("")}</select></label>` : ""}
        <div class="am-liste">${(nums => l.map((m, i) => carteMatch(m, i, l.length, nums[i])).join(""))(numeroter(l, t)) || ((e.auto[e.type] || {}).charge ? "" : `<p class="quoi am-vide">Aucun match automatique pour ce week-end : ajoute-les à la main.</p>`)}</div>
        ${seul && l.length ? "" : l.length < MAX ? `<button type="button" class="btn bleu am-ajout" data-am-a="ajout">+ Ajouter ${t.fam === "fal" ? "un plateau" : "un match"}</button>` : `<p class="quoi">${MAX} ${t.fam === "fal" ? "plateaux" : "matchs"} au plus : fais deux affiches.</p>`}
        <div class="am-options">
          <label>Titre (facultatif)<input data-am-g="titre" maxlength="80" value="${esc(e.titre)}" placeholder="${esc(t.nom)}"></label>
          <label class="ev-case"><input type="checkbox" data-am-g="sponsors" ${e.sponsors ? "checked" : ""}> Bandeau des partenaires</label>
          ${l.length ? `<button type="button" class="btn contour petit" data-am-a="vider">🗑️ Tout effacer</button>` : ""}
        </div>
      </section>
      <section class="carte af-carte ev-apercu" aria-labelledby="am-h-apercu">
        <div class="af-tete"><h2 id="am-h-apercu">👀 ${fs.length > 1 ? "Les affiches" : "L'affiche"}</h2></div>
        <div class="ev-formats" role="group" aria-label="Format de l'aperçu">${fmts.map(([k, lb, d]) => `<button type="button" class="as-fmt ${k === F[0] ? "on" : ""}" aria-pressed="${k === F[0]}" data-am-a="fmt" data-k="${k}" title="${d}">${lb}</button>`).join("")}</div>
        <div class="am-apercus">${fs.map(f => `<figure class="am-fig"><div class="ev-cadre" style="${fs.length > 1 ? `aspect-ratio:${F[3]}` : styleCadre(F[3])}"><img data-am-img="${f || "seul"}" class="charge" alt="Aperçu : ${nomF(f)}"><span class="am-vide-ap">${seul ? "Ajoute le match pour voir l'affiche" : "Complète un match pour voir l'affiche"}</span></div>${fs.length > 1 ? `<figcaption>${nomF(f)}</figcaption>` : ""}</figure>`).join("")}</div>
        <div class="ev-erreur" id="am-erreur" role="status" aria-live="polite" hidden></div>
        <p class="ev-taille" id="am-taille">${F[1]} · ${F[2]}</p>
      </section>
      <section class="carte af-carte ev-message" aria-labelledby="am-h-msg">
        <div class="af-tete"><h2 id="am-h-msg">💬 Message de l'annonce</h2><small>Publié sous l'annonce · une story n'a pas de texte : tout doit être sur l'affiche</small></div>
        <textarea id="am-msg" data-am-msg aria-labelledby="am-h-msg" rows="14" maxlength="2200">${esc(e.msgs[e.type].msg)}</textarea>
        <p class="ev-libre" id="am-libre" ${e.msgs[e.type].libre ? "" : "hidden"}>✋ Message modifié à la main : il ne suit plus les matchs. ↺ pour le refaire.</p>
        <div class="btns"><button type="button" class="btn contour petit" data-am-a="msg-auto">↺ Refaire le message à partir des matchs</button>
          <button type="button" class="btn contour petit" data-am-a="msg-copier">📋 Copier</button></div>
      </section>
      <section class="carte af-carte ev-publier" aria-labelledby="am-h-pub">
        <div class="af-tete"><h2 id="am-h-pub">📣 Publier</h2><small>La bonne taille est choisie toute seule</small></div>
        <div class="ps-reseau" role="group" aria-label="Facebook"><span class="ps-reseau-nom">📘 Facebook</span><div class="af-choix-l">${opt("fb_pub", "Annonce", "Facebook")}${opt("fb_story", "Story", "Facebook")}</div></div>
        <div class="ps-reseau" role="group" aria-label="Instagram"><span class="ps-reseau-nom">📸 Instagram</span><div class="af-choix-l">${opt("ig_pub", "Annonce", "Instagram")}${opt("ig_story", "Story", "Instagram")}</div></div>
        <p class="ev-note">${fs.length > 1 ? "Annonce : dans le fil, avec le message · Facebook : les 2 feuilles côte à côte · Instagram : en carrousel · Story : une par feuille, plein écran 24 h, sans texte." : "Annonce : dans le fil, avec le message, affiche en entier · Story : plein écran pendant 24 h, sans texte."}</p>
        <button type="button" class="btn bleu af-go" data-am-a="publier" ${e.enCours ? "disabled" : ""}>${esc(e.enCours || "📣 Publier maintenant")}</button>
        ${e.etat ? `<p class="af-etat" id="am-etat" role="status" aria-live="polite">${esc(e.etat)}</p>` : `<p class="af-etat" id="am-etat" role="status" aria-live="polite" hidden></p>`}
        <b class="ps-lab ev-lab">Ou les poster toi-même</b>
        <div class="ev-dl">${fs.flatMap(f => fmts.map(([k, lb, d]) => `<button type="button" class="btn contour petit" data-am-a="dl" data-f="${f || ""}" data-k="${k}">⬇️ ${fs.length > 1 ? (f === "dom" ? "Domicile · " : "Extérieur · ") : ""}${lb} <small>${d}</small></button>`)).join("")}</div>
      </section>
    </div></div>`;
  }

  /* ---------- aperçus (dessinés par le serveur, une requête par feuille) ---------- */
  let apT, apJeton = 0, apCtl = null;                                   // un aperçu remplacé par une saisie plus récente est annulé
  const urls = {};
  function majApercus(tout){
    clearTimeout(apT);
    apT = setTimeout(async () => {
      const j = ++apJeton, e = E(), fmt = formatsPour(feuilles()).some(f => f[0] === e.fmt) ? e.fmt : "carre";
      if (apCtl) apCtl.abort();
      const ctl = apCtl = typeof AbortController === "function" ? new AbortController() : null;
      const imgs = [...document.querySelectorAll("[data-am-img]")];
      const err = document.getElementById("am-erreur");
      imgs.forEach(i => i.classList.add("charge"));
      for (const i of imgs){
        const f = i.dataset.amImg === "seul" ? null : i.dataset.amImg;
        if (!L().some(m => !manque(m).length)){ i.removeAttribute("src"); i.classList.remove("charge"); continue; }   // rien de complet : le cadre dit quoi faire
        try {
          const b = await image(f, fmt, undefined, ctl ? ctl.signal : undefined);
          if (j !== apJeton) return;
          if (urls[i.dataset.amImg]) URL.revokeObjectURL(urls[i.dataset.amImg]);
          urls[i.dataset.amImg] = URL.createObjectURL(b);
          i.src = urls[i.dataset.amImg]; i.classList.remove("charge");
          if (err) err.hidden = true;
        } catch(x){
          if (j !== apJeton) return;
          i.classList.remove("charge");
          console.warn("Aperçu Affiches matchs :", x.message);
          if (err){
            err.hidden = false;
            err.innerHTML = `${/403|coach|bureau|connect/i.test(x.message) ? "Ta session a expiré : reconnecte-toi à l'espace club." : /trop de matchs/i.test(x.message) ? esc(x.message) : "L'aperçu n'a pas pu être dessiné. Vérifie ta connexion puis réessaie ; si ça continue, préviens le responsable du site."}
              <button type="button" class="btn contour petit" data-am-a="reessayer">↻ Réessayer</button>`;
          }
        }
      }
    }, tout ? 0 : 900);
  }
  function majManques(){
    L().forEach((m, i) => {
      const z = document.querySelector(`[data-am-manque="${i}"]`); if (!z) return;
      const x = manque(m), lui = T().fam === "fal" ? "ce plateau" : "ce match";
      z.hidden = !x.length; z.textContent = x.length ? `⚠️ Il manque ${x.join(" et ")} : ${lui} ne sera pas sur l'affiche.` : "";
      const w = document.querySelector(`[data-am-avert="${i}"]`); if (!w) return;
      const a = x.length ? [] : avertir(m); w.hidden = !a.length; w.textContent = a.length ? "ℹ️ " + a.join(" · ") : "";
    });
  }
  /* la liste des feuilles a changé (un match passe à l'extérieur…) : on redessine le panneau */
  let feuillesAvant = "";
  function apresSaisie(){
    sauver(); majManques(); majMessage();
    const f = feuilles().join(",");
    if (f !== feuillesAvant){ feuillesAvant = f; rendrePanneau(); return; }
    majApercus();
  }

  /* garder le champ en cours de saisie quand le panneau est redessiné */
  function memoFocus(){
    const a = document.activeElement;
    if (!a || !a.matches || !a.matches("#panneau [data-am], #panneau [data-am-g], #panneau [data-am-msg], #panneau [data-am-club]")) return null;
    let d = null, f = null; try { d = a.selectionStart; f = a.selectionEnd; } catch(err){}
    return { sel: selChamp(a), d, f, v: a.dataset.amClub ? a.value : null, ouverte: a.getAttribute("aria-expanded") === "true" };
  }
  function selChamp(a){
    const ajout = a.dataset.amClub === "ajout";
    return a.dataset.amMsg !== undefined ? "[data-am-msg]" : a.dataset.amG ? `[data-am-g="${a.dataset.amG}"]`
      : ajout ? `[data-am-club="ajout"][data-i="${a.dataset.i}"]${a.dataset.k !== undefined ? `[data-k="${a.dataset.k}"]` : ""}${a.dataset.q !== undefined ? `[data-q="${a.dataset.q}"]` : ""}`
      : `[data-am="${a.dataset.am}"][data-i="${a.dataset.i}"]${a.dataset.k !== undefined ? `[data-k="${a.dataset.k}"]` : ""}${a.dataset.q !== undefined ? `[data-q="${a.dataset.q}"]` : ""}${a.dataset.j !== undefined ? `[data-j="${a.dataset.j}"]` : ""}`;
  }
  function rendreFocus(m){
    if (!m) return;
    const a = document.querySelector("#panneau " + m.sel); if (!a) return;
    if (m.v !== null && m.v !== undefined) a.value = m.v;
    focusRendu = true; try { a.focus({ preventScroll: true }); } finally { focusRendu = false; }
    try { if (m.d !== null && m.d !== undefined) a.setSelectionRange(m.d, m.f); } catch(err){}
    if (a.dataset.amClub){ boutonsClub(a); if (m.ouverte) listeClubs(a, a.value); }   // on tapait : la liste reste ouverte
  }

  /* ---------- reprendre les matchs connus de l'application pour ce week-end ---------- */
  function depuisCalendrier(){
    const e = E(), t = T(), sam = SAM();
    let jours;
    try { jours = typeof plage === "function" ? plage(sam) : null; } catch(err){ jours = null; }
    if (!Array.isArray(jours) || jours.length < 3){
      const j = jd(sam), ven = new Date(j); ven.setDate(j.getDate() - 1); const dim = new Date(j); dim.setDate(j.getDate() + 1);
      jours = [iso(ven), sam, iso(dim)];
    }
    const dans = m => jours.includes(m.date);
    const vet = m => /^vet-/.test(String(m.id || "")) || /v[ée]t[ée]ran/i.test(String(m.equipe || ""));
    const estFal = m => { try { return typeof EST_FAL === "function" ? EST_FAL(m) : /^(pl|fal)-/.test(String(m.id || "")); } catch(err){ return false; } };
    const joueM = m => typeof m.bp === "number" && typeof m.bc === "number";
    const tri = (a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || ""));
    const nous = a => /pierrelatte|atom'?\s*sports?/i.test(String(a || ""));
    if (t.fam === "fal"){
      const tous = [...(S.matchsAnimation || []), ...(S.matchs || []).filter(estFal)].filter(dans);
      // une fiche du favori FFF (fal-) ne sert que s'il n'y a pas déjà la fiche saisie (pl-) pour la même catégorie et le même jour
      const cleCat = m => (m.date || "") + "|" + slug(String(m.equipe || "").replace(/\s*·\s*équipe\s*/i, " "));
      const saisies = new Set(tous.filter(m => !/^fal-/.test(String(m.id || ""))).map(cleCat));
      return tous.filter(m => !/^fal-/.test(String(m.id || "")) || !saisies.has(cleCat(m))).sort(tri).slice(0, MAX).map(m => {
        const adv = (m.adversaires && m.adversaires.length ? m.adversaires : (m.participants || []).map(q => q && q.nom)).filter(a => a && !nous(a));
        return { dom: !!m.dom, equipe: catSimple(m.equipe), equipes: "1", numeros: numeroEquipe(m.equipe), comp: /brassage/i.test(m.comp || "") ? "Brassage" : "Plateau",
          adv: m.dom ? "" : String(m.adv || ""), date: m.date, heure: m.heure || "", adresse: m.dom ? "" : String(m.adresse || ""), bp: "", bc: "",
          adversaires: adv.join("\n"),
          resultats: (m.resultats || []).length ? m.resultats.map(r => ({ adv: String(r.adv || ""), bp: r.bp ?? "", bc: r.bc ?? "" })) : [{ adv: "", bp: "", bc: "" }] };
      });
    }
    let l = (S.matchs || []).filter(m => dans(m) && !estFal(m) && (t.fam === "vet" ? vet(m) : !vet(m)));
    if (!t.res) l = l.filter(m => !joueM(m) || t.fam === "seul");
    else if (t.fam === "seul") l = l.filter(joueM);
    l.sort(tri);
    if (t.fam === "seul") l = t.res ? l.slice(-1) : l.slice(0, 1);
    return l.slice(0, MAX).map(m => ({ dom: !!m.dom, equipe: t.fam === "vet" ? "Vétérans" : (typeof eqDe === "function" ? eqDe(m) : m.equipe),
      comp: String(m.comp || ""), adv: String(m.adv || ""), date: m.date, heure: m.heure || "", adresse: m.dom ? "" : String(m.adresse || ""),
      bp: joueM(m) ? m.bp : "", bc: joueM(m) ? m.bc : "" }));
  }

  /* ---------- matchs automatiques : ceux des affiches du lundi, donnés par le serveur ---------- */
  const nousMeme = a => /pierrelatte|atom'?\s*sports?/i.test(String(a || ""));
  function versListe(m, t){
    const fam = TYPES[t].fam;
    const cat = String(m.equipe || "");
    const o = { dom: !!m.dom, equipe: fam === "vet" ? "Vétérans" : fam === "fal" ? catSimple(cat) : cat,
      comp: fam === "fal" ? (/brassage/i.test(m.comp || "") ? "Brassage" : "Plateau") : String(m.comp || ""),
      adv: fam === "fal" && m.dom ? "" : String(m.adv || ""), date: m.date || "", heure: m.heure || "", adresse: m.dom ? "" : String(m.adresse || ""),
      bp: m.bp ?? "", bc: m.bc ?? "" };
    if (fam === "fal"){
      o.equipes = "1"; o.numeros = numeroEquipe(cat);
      o.adversaires = (m.adversaires || []).filter(a => a && !nousMeme(a)).join("\n");
      o.resultats = (m.resultats || []).length ? m.resultats.map(r => ({ adv: String(r.adv || ""), bp: r.bp ?? "", bc: r.bc ?? "" })) : [{ adv: "", bp: "", bc: "" }];
      o.bp = o.bc = "";
    }
    return o;
  }
  // un seul match : le prochain à jouer (jour de match) ou le dernier joué (résultat)
  function choisirSeul(l, t){
    const joue = m => m.bp !== "" && m.bp !== null && m.bc !== "" && m.bc !== null;
    const tri = [...l].sort((a, b) => (a.date + a.heure).localeCompare(b.date + b.heure));
    if (t === "score"){ const j = tri.filter(joue); return j.length ? [j[j.length - 1]] : tri.slice(-1); }
    const n = tri.filter(m => !joue(m)); return n.length ? [n[0]] : tri.slice(0, 1);
  }
  // plateaux d'une même catégorie, même jour, même heure, même endroit : une ligne, avec le nombre d'équipes
  function regrouper(l){
    const out = [], vu = new Map();
    for (const m of l){
      const k = [catSimple(m.equipe), m.date, m.heure, m.dom ? "d" : "e", slug(m.adv || ""), slug(m.adresse || "")].join("|");
      const g = vu.get(k);
      if (!g){ const c = { ...m, equipe: catSimple(m.equipe), equipes: "1", equipesDet: undefined }; det(c); vu.set(k, c); out.push(c); continue; }
      if (g.equipesDet.length >= MAX_EQUIPES) continue;
      g.equipesDet.push(det({ ...m, equipes: "1", equipesDet: undefined })[0]);
      g.equipes = String(g.equipesDet.length);
      g.numeros = g.numeros && m.numeros ? g.numeros + "," + m.numeros : "";
    }
    return out;
  }
  const jetons = {};                                                     // un jeton par type : changer de type n'abandonne pas un chargement en cours
  async function chargerAuto(demande){
    const e = E(), t = e.type, sam = SAM(), j = jetons[t] = (jetons[t] || 0) + 1;
    e.auto[t] = { samedi: sam, modifie: false, charge: true };
    if (S.ui.onglet === "affmatchs") rendrePanneau();
    let l, source = "serveur", refus = "";
    try {
      const r = await fetch(api() + "/affiches.php?plan=1&type=" + encodeURIComponent(t) + "&date=" + encodeURIComponent(sam), { credentials: "same-origin", cache: "no-store" });
      const type = r.headers.get("Content-Type") || "";
      if (r.status === 401 || r.status === 403) refus = "Ta session a expiré : reconnecte-toi à l'espace club pour reprendre les matchs automatiques.";
      else if (r.status >= 500) refus = `Le serveur n'a pas pu donner les matchs du week-end (erreur ${r.status}) : réessaie dans un moment.`;
      else if (r.ok && type.includes("json")){ const d = await r.json(); if (Array.isArray(d && d.matchs)) l = d.matchs.map(m => versListe(m, t)); }
    } catch(err){}
    if (!l && !refus){ source = "app"; l = depuisCalendrier(); }         // serveur d'avant cette route, ou hors ligne : le calendrier de l'app
    if (j !== jetons[t]) return;
    const au = e.auto[t] || {};
    if (refus || (au.modifie && !demande)){                             // erreur, ou liste touchée pendant le chargement : on la garde
      e.auto[t] = { samedi: sam, modifie: !!au.modifie, source: au.source || source, quand: Date.now(), erreur: refus };
      sauver();
      if (S.ui.onglet === "affmatchs" && e.type === t) rendrePanneau();
      if (refus) toast(refus, true);
      return;
    }
    const actif = document.activeElement;                              // la liste est remplacée : le champ en cours est quitté, sa frappe part avec l'ancienne liste
    if (e.type === t && actif && actif.closest && actif.closest("#panneau .am-zone")) actif.blur();
    const tous = TYPES[t].fam === "seul" ? l.slice(0, 30) : null;      // « Quel match ? » : tous les matchs du week-end
    if (TYPES[t].fam === "seul") l = choisirSeul(l, t);
    if (TYPES[t].fam === "fal") l = regrouper(l);
    e.listes[t] = l.slice(0, MAX); e.auto[t] = { samedi: sam, modifie: false, source, quand: Date.now(), ...(tous ? { tous } : {}) };
    if (!e.msgs[t].libre) e.msgs[t] = { msg: "", libre: false };
    sauver();
    if (S.ui.onglet === "affmatchs" && e.type === t){ rendrePanneau(); majMessage(true); }
    if (demande) toast(l.length ? `${l.length} match${l.length > 1 ? "s" : ""} automatique${l.length > 1 ? "s" : ""} : ajoute ou corrige ce qui manque.` : "Aucun match automatique ce week-end : ajoute-les à la main.");
  }

  /* ---------- publication : chaque format part au bon endroit ---------- */
  async function publier(){
    const e = E(), t = T(), c = e.pub;
    const z = document.getElementById("am-msg");
    if (z && z.value !== e.msgs[e.type].msg){ e.msgs[e.type].msg = z.value; e.msgs[e.type].libre = true; }
    if (!L().some(m => !manque(m).length)){ toast("Ajoute au moins un match complet.", true); return; }
    if (!e.msgs[e.type].libre && (c.fb_pub || c.ig_pub)){                 // le message suit les matchs : on le refait avec la dernière saisie
      clearTimeout(msgT); msgJeton++;
      const neuf = await messageCalcule(e.type);
      if (neuf !== null){ e.msgs[e.type].msg = neuf; if (z) z.value = neuf; }
    }
    const texte = (z ? z.value : e.msgs[e.type].msg) || "";
    if ((c.fb_pub || c.ig_pub) && !texte.trim() && !confirm("Le message de l'annonce est vide. Publier l'annonce sans texte ?")) return;
    if (!c.fb_pub && !c.ig_pub && !c.fb_story && !c.ig_story){ toast("Choisis où publier : annonce ou story, Facebook ou Instagram.", true); return; }
    const snap = instantane(), fs = feuilles(snap), deux = fs.length > 1;
    const envois = [], story = k => k + "_story", annonce = k => k + "_pub";
    if (c.fb_story || c.ig_story) envois.push({ fmts: fs.map(() => "story"), nom: "Story " + [c.fb_story && "Facebook", c.ig_story && "Instagram"].filter(Boolean).join(" et "), fb: c.fb_story, ig: c.ig_story, pub: false, story: true, texte, cle: story });
    if (c.fb_pub && c.ig_pub && !deux) envois.push({ fmts: ["carre"], nom: "Annonce Facebook et Instagram", fb: true, ig: true, pub: true, story: false, texte, cle: annonce });
    else {
      if (c.fb_pub) envois.push({ fmts: fs.map(() => deux ? "fb" : "carre"), nom: "Annonce Facebook", fb: true, ig: false, pub: true, story: false, texte, cle: annonce });
      if (c.ig_pub) envois.push({ fmts: fs.map(() => "carre"), nom: "Annonce Instagram", fb: false, ig: true, pub: true, story: false, texte, cle: annonce });
    }
    const quoi = deux ? "les affiches domicile et extérieur" : "l'affiche";
    if (!confirm(`Publier maintenant ${quoi} « ${t.titre} » ?\n\n${envois.map(x => "• " + x.nom + (x.story ? " (sans texte)" : " (avec le message)")).join("\n")}`)) return;
    sauver();
    const bouton = () => document.querySelector('[data-am-a="publier"]');
    const dire = m => { e.enCours = m; const b = bouton(); if (b){ b.disabled = true; b.textContent = m; } };
    dire("Préparation…");
    const r = await serieDePublication({ envois, pub: e.pub, dire, preparer: async x => {
      const l = [];
      for (const [k, f] of fs.entries()) l.push(new File([await image(f, x.fmts[k], snap)], `asf-pierrelatte-${snap.type}${f ? "-" + f : ""}-${x.fmts[k]}.jpg`, { type: "image/jpeg" }));
      return l;
    } });
    e.enCours = ""; e.etat = r.etat; sauver();
    toast(r.toutBon ? "Publié." : "Publication incomplète : regarde le détail sous le bouton.", !r.toutBon);
    if (S.ui.onglet === "affmatchs") rendrePanneau();
  }
  async function telecharger(btn){
    const f = btn.dataset.f || null, fmt = btn.dataset.k, avant = btn.innerHTML;
    btn.disabled = true; btn.textContent = "Préparation…";
    try {
      const b = await image(f, fmt);
      enregistrerImage(b, `asf-pierrelatte-${E().type}${f ? (f === "dom" ? "-domicile" : "-exterieur") : ""}-${fmt === "story" ? "story" : fmt === "fb" ? "facebook" : "annonce"}.jpg`);
    } catch(err){ toast("Affiche indisponible : " + err.message, true); }
    btn.disabled = false; btn.innerHTML = avant;
  }

  /* ---------- branchement dans l'application ---------- */
  if (!ONGLETS.some(o => o[0] === "affmatchs")){
    const i = ONGLETS.findIndex(o => o[0] === "affiches");
    ONGLETS.splice(i < 0 ? ONGLETS.length : i + 1, 0, ["affmatchs", "Affiches matchs", "bureau", "Publication", "Affiches de matchs avec les matchs tapés à la main"]);
  }
  const com = RUBRIQUES.find(r => r[0] === "com");
  if (com && !com[3].includes("affmatchs")){
    const i = com[3].indexOf("affiches");
    com[3].splice(i < 0 ? 0 : i + 1, 0, "affmatchs");
  }
  if (typeof ICONES === "object" && ICONES) ICONES.affmatchs = "M4 4h16v16H4zM4 9h16M9 4v16M13 13h4M13 16h3";
  const peutVoir = () => { try { return typeof ongletsVisibles === "function" && ongletsVisibles().some(o => o[0] === "affmatchs"); } catch(err){ return false; } };
  function allerAffMatchs(){
    S.ui.onglet = "affmatchs"; S.ui.compo = null; S.ui.tournoi = null; S.ui.tirage = null;
    try { S.ui.derniers = { ...(S.ui.derniers || {}), [rubriqueDe("affmatchs")[0]]: "affmatchs" }; } catch(err){}
    S.ui.rubOuverte = null;
    rendreEspace(); window.scrollTo(0, 0);
  }
  let redessin = false, focusGarde = null;
  if (typeof window.rendreEspace === "function"){                       // rendreEspace remplace tout l'espace avant rendrePanneau : on note le champ en cours
    const espaceAvant = window.rendreEspace;
    window.rendreEspace = function(){
      if (S.ui.onglet === "affmatchs") focusGarde = memoFocus();
      try { return espaceAvant.apply(this, arguments); } finally { focusGarde = null; }
    };
  }
  const rendreAvant = window.rendrePanneau;
  window.rendrePanneau = function(){
    if (S.ui.onglet !== "affmatchs") return rendreAvant.apply(this, arguments);
    const p = document.getElementById("panneau"); if (!p) return;
    const m = memoFocus() || focusGarde, y = window.scrollY; focusGarde = null;
    feuillesAvant = feuilles().join(",");
    redessin = true; try { p.innerHTML = panAffMatchs(); } finally { redessin = false; }   // les champs retirés envoient change/blur : ignorés
    try { const ec = typeof encartCle === "function" && encartCle(); if (ec) p.insertAdjacentHTML("afterbegin", ec); } catch(err){}
    requestAnimationFrame(() => window.scrollTo(0, y));
    rendreFocus(m);
    const e = E(), au = e.auto[e.type];
    const vieille = au && !au.modifie && !au.charge && !au.erreur && Date.now() - (au.quand || 0) > 5 * 60e3;
    if (vieille || (!(au && (au.charge || au.samedi === SAM())) && (!L().length || (au && !au.modifie)))){ chargerAuto(false); return; }
    if (au && au.charge) return;                                        // la fin du chargement redessine
    majApercus(true);
    if (!e.msgs[e.type].libre && !e.msgs[e.type].msg) majMessage(true);
  };
  if (typeof window.panAffiches === "function"){
    const affichesAvant = window.panAffiches;
    window.panAffiches = function(){
      const h = affichesAvant.apply(this, arguments);
      if (!S.heberge || !peutVoir()) return h;
      return `<button type="button" class="carte af-reglages ev-raccourci" data-am-a="aller"><span>🖊️</span><div><b>Affiches matchs</b><small>Rencontres, résultats, foot animation, vétérans : les matchs se mettent tout seuls, tu ajoutes ce qui manque · onglet Affiches matchs</small></div><span class="af-fl">›</span></button>` + h;
    };
  }

  /* ---------- écouteurs (attributs data-am*, à part de ceux de l'application) ---------- */
  function saisie(t){
    const e = E();
    if (t.dataset.amG){
      const k = t.dataset.amG, v = t.type === "checkbox" ? t.checked : t.value;
      if (k === "samedi"){
        if (!v || v === SAM()) return;
        e.samedis[e.type] = v; e.samedisQuand[e.type] = Date.now(); sauver();
        const a = e.auto[e.type];
        if (!L().length || !a || !a.modifie) chargerAuto(false);          // pas encore touchée : les matchs du nouveau week-end
        else { L().forEach(m => { if (!m.date) m.date = v; }); rendrePanneau(); }
        return;
      }
      if (k === "quel"){                                               // un autre match du week-end pour « Jour de match » / « Résultat »
        const m = ((e.auto[e.type] || {}).tous || [])[+v]; if (!m) return;
        e.listes[e.type] = [JSON.parse(JSON.stringify(m))]; marquer(); e.msgs[e.type] = { msg: "", libre: false };
        sauver(); rendrePanneau(); majMessage(true); return;
      }
      if (e[k] === v) return;
      e[k] = v;
      apresSaisie(); return;
    }
    const m = L()[+t.dataset.i]; if (!m) return;
    const k = t.dataset.am;
    if (k === "seulNous"){ if (m.seulNous === t.checked) return; marquer(); m.seulNous = t.checked; const l = t.closest(".af-choix"); if (l) l.classList.toggle("on", t.checked); apresSaisie(); return; }
    if (/^t-/.test(k)){
      const q = pls(m)[+t.dataset.q], p = q && q.matchs[+t.dataset.j]; if (!p) return; const kk = k.slice(2);
      if (p[kk] === t.value) return; marquer(); p[kk] = t.value;
      if (kk === "a" || kk === "b"){ sauver(); rendrePanneau(); majMessage(); return; }
    }
    else if (/^p-/.test(k)){
      const q = det(m)[+t.dataset.k]; if (!q) return; const kk = k.slice(2);
      const p = q.matchs[+t.dataset.j]; if (!p || p[kk] === t.value) return; marquer(); p[kk] = t.value;
    }
    else if (/^r-/.test(k)){ const r = (m.resultats || [])[+t.dataset.j]; if (!r) return; const kk = k.slice(2); if (r[kk] === t.value) return; marquer(); r[kk] = t.value; }
    else {
      if (m[k] === t.value) return;
      if (k === "equipes" && det(m).slice(+t.value).some(q => q.matchs.length) && !confirm("Retirer les équipes en trop, avec leurs matchs ?")){ t.value = String(det(m).length); return; }
      marquer(); m[k] = t.value;
      if (k === "adv"){ const z = document.querySelector(`[data-am-advlib="${t.dataset.i}"]`); if (z) z.textContent = joli(m.adv) || "adversaire"; }
    }
    if (T().fam === "fal" && (k === "equipes" || k === "equipe")){ m.numeros = ""; sauver(); rendrePanneau(); majMessage(); return; }
    apresSaisie();
  }
  ["input", "change"].forEach(ty => document.addEventListener(ty, ev => {
    const t = ev.target; if (!t.matches || redessin) return;
    if (ty === "change" && t.matches("[data-am-club]")) return;            // déjà enregistré à chaque lettre (input)
    if (t.matches("[data-am], [data-am-g]")){ saisie(t); return; }
    if (t.matches("[data-am-msg]") && ty === "input"){ const mm = E().msgs[E().type]; mm.msg = t.value; mm.libre = true; sauver(); const lb = document.getElementById("am-libre"); if (lb) lb.hidden = false; return; }
    if (t.matches("[data-am-pub]") && ty === "change"){
      E().pub[t.dataset.amPub] = t.checked;
      const l = t.closest(".af-choix"); if (l) l.classList.toggle("on", t.checked);
      sauver();
    }
  }));
  document.addEventListener("click", async ev => {
    const b = ev.target.closest && ev.target.closest("[data-am-a]"); if (!b) return;
    const a = b.dataset.amA, e = E(), l = L(), i = +b.dataset.i;
    if (a === "aller"){ allerAffMatchs(); return; }
    if (e.enCours && !["fmt", "msg-copier", "dl"].includes(a)){ if (a !== "publier") toast("Publication en cours : attends la fin.", true); return; }
    if (a === "type"){ e.type = b.dataset.k; e.etat = ""; sauver(); rendrePanneau(); return; }
    if (a === "fmt"){ e.fmt = b.dataset.k; sauver(); rendrePanneau(); return; }
    if (a === "reessayer"){ majApercus(true); return; }
    if (a === "ajout"){
      const der = l[l.length - 1];
      const m = nouveau(e.type, SAM()); marquer();
      if (der){ m.date = der.date || m.date; if (T().fam === "fal") m.equipe = der.equipe; }
      l.push(m); sauver(); rendrePanneau(); majMessage();
      setTimeout(() => { const c = document.querySelector(`[data-am-carte="${l.length - 1}"]`); if (c){ c.scrollIntoView({ behavior: "smooth", block: "center" }); const f = c.querySelector("input:not([type=date]):not([type=time]), select"); if (f) f.focus({ preventScroll: true }); } }, 60);
      return;
    }
    if (a === "suppr"){
      const m = l[i]; if (!m) return;
      const vide = !String(m.adv || "").trim() && !(T().fam === "fal" && (det(m).some(q => q.matchs.some(p => String(p.adv || "").trim())) || (enPoules(m) && pls(m).some(q => q.equipes.length))));
      if (!vide && !confirm("Supprimer ce match de l'affiche ?")) return;
      l.splice(i, 1); marquer(); sauver(); rendrePanneau(); majMessage(); return;
    }
    if (a === "haut" || a === "bas"){
      const j = a === "haut" ? i - 1 : i + 1; if (j < 0 || j >= l.length) return;
      [l[i], l[j]] = [l[j], l[i]]; marquer(); sauver(); rendrePanneau(); majMessage(); return;
    }
    if (a === "dom"){ const m = l[i]; if (!m) return; m.dom = b.dataset.k === "1"; marquer(); sauver(); rendrePanneau(); majMessage(); return; }
    if (["mode", "poule-ajout", "poule-suppr", "peq-suppr", "t-ajout", "t-suppr"].includes(a)){
      const m = l[i]; if (!m) return;
      const q = b.dataset.q !== undefined ? pls(m)[+b.dataset.q] : null, j = +b.dataset.j;
      const rempli = p => p.heure || String(p.sa ?? "") !== "" || String(p.sb ?? "") !== "";
      if (a === "mode"){ if ((m.mode || "") === b.dataset.k) return; m.mode = b.dataset.k; if (enPoules(m)) pls(m); }
      else if (a === "poule-ajout"){ if (pls(m).length < POULES.length) m.poulesT.push({ equipes: [], matchs: [] }); }
      else if (a === "poule-suppr"){ if (!q) return; if (q.equipes.length && !confirm(`Retirer la poule ${POULES[+b.dataset.q]} et ses matchs ?`)) return; m.poulesT.splice(+b.dataset.q, 1); }
      else if (a === "peq-suppr"){
        const e = q && q.equipes[j]; if (!e) return;
        const ms = q.matchs.filter(p => p.a === e.id || p.b === e.id);
        if (ms.some(rempli) && !confirm(`Retirer ${e.nom} et ses matchs ?`)) return;
        q.equipes.splice(j, 1); q.matchs = q.matchs.filter(p => !ms.includes(p));
      }
      else if (a === "t-ajout"){ if (!q || q.equipes.length < 2) return; q.matchs.push({ heure: "", a: q.equipes[0].id, b: q.equipes[1].id, sa: "", sb: "" }); }
      else if (a === "t-suppr"){ if (!q || !q.matchs[j]) return; q.matchs.splice(j, 1); }
      marquer(); sauver(); rendrePanneau(); majMessage(); return;
    }
    if (a === "p-suppr"){ const m = l[i]; if (!m) return; const q = det(m)[+b.dataset.k]; if (!q) return; q.matchs.splice(+b.dataset.j, 1); marquer(); sauver(); rendrePanneau(); majMessage(); return; }
    if (a === "reprendre"){
      const au = e.auto[e.type];
      if (l.length && (!au || au.modifie) && !confirm("Remplacer ta liste par les matchs automatiques du week-end ?")) return;
      await chargerAuto(true); return;
    }
    if (a === "vider"){
      if (!confirm("Effacer tous les matchs de cette affiche ?")) return;
      e.listes[e.type] = []; e.msgs[e.type] = { msg: "", libre: false }; e.etat = ""; marquer(); sauver(); rendrePanneau(); return;
    }
    if (a === "msg-auto"){
      if (e.msgs[e.type].libre && !confirm("Remplacer le message écrit à la main par un message refait à partir des matchs ?")) return;
      e.msgs[e.type].libre = false; majMessage(true); return;
    }
    if (a === "msg-copier"){
      const z = document.getElementById("am-msg");
      try { await navigator.clipboard.writeText(z ? z.value : ""); toast("Message copié"); } catch(err){ if (z) z.select(); toast("Sélectionne le texte et copie-le"); }
      return;
    }
    if (a === "dl"){ await telecharger(b); return; }
    if (a === "publier"){ if (!e.enCours) await publier(); return; }
  });

  /* ---------- aperçu en grand : toucher l'image l'ouvre en plein écran ---------- */
  document.addEventListener("click", ev => {
    const i = ev.target.closest && ev.target.closest("#panneau [data-am-img]");
    const z = document.getElementById("am-zoom");
    if (z && (ev.target === z || ev.target.closest("[data-am-zoom-x]"))){ z.remove(); return; }
    if (!i || !i.getAttribute("src")) return;
    const d = document.createElement("div");
    d.id = "am-zoom"; d.setAttribute("role", "dialog"); d.setAttribute("aria-label", i.alt);
    d.innerHTML = `<button type="button" class="btn bleu petit" data-am-zoom-x>✕ Fermer</button><img src="${i.src}" alt="${esc(i.alt)}">`;
    document.body.appendChild(d); d.querySelector("button").focus();
  });
  document.addEventListener("keydown", ev => { const z = document.getElementById("am-zoom"); if (z && ev.key === "Escape") z.remove(); });

  /* ---------- styles ---------- */
  const css = document.createElement("style");
  css.id = "affiches-matchs-css";
  css.textContent = `
.am-types{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.am-types .ev-type small{font:600 12.5px var(--corps);color:var(--texte-doux)}
.am-haut{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;margin-bottom:14px}
.am-haut label{display:flex;flex-direction:column;gap:6px}
.am-liste{display:grid;gap:12px}
.am-vide{margin:0}
.am-source{margin:0 0 12px;padding:10px 12px;border-radius:10px;background:rgba(143,168,240,.1);font:600 14px var(--corps)}
.am-match{border:1px solid var(--ligne);border-radius:14px;padding:12px;background:var(--fond)}
.am-match-tete{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.am-match-tete > b{font:800 16px var(--corps);margin-right:auto}
.am-lieu{display:flex;gap:6px;flex-wrap:wrap}
.am-ordre{display:flex;gap:4px}
.am-champs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
.am-champs label{display:flex;flex-direction:column;gap:6px;min-width:0}
.am-champs .am-plein{grid-column:1/-1}
.am-score{display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap}
.am-score input[type=number]{width:64px;text-align:center;font-weight:800}
.am-score input:not([type]){flex:1 1 160px;min-width:0}
.am-score-match span{font-weight:700}
.am-eqs{display:grid;gap:10px}
.am-eq{border:1px solid var(--ligne);border-radius:12px;padding:10px 10px 4px;background:rgba(143,168,240,.06)}
.am-eq-tete{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.am-eq-tete > b{font:800 15px var(--corps);margin-right:auto}
.am-champs .am-poule{flex-direction:row;align-items:center;gap:8px;font:700 14px var(--corps)}
.am-poule select{width:auto;min-width:96px}
.am-rencontre{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:8px;margin-bottom:8px}
.am-rencontre-res{display:flex;flex-wrap:wrap}
.am-rh{min-width:0}
.am-champs .am-rh .tp-champ{width:auto;min-width:0;min-height:44px;height:44px;padding:6px 10px;gap:6px;border-style:solid;font-size:15px;white-space:nowrap}
.am-rh .tp-champ.vide span:last-child{font-size:0}
.am-rh .tp-champ.vide span:last-child::after{content:"Heure";font-size:15px}
.am-rencontre .am-club{flex:1 1 170px}
.am-rencontre .am-club-x{display:none}
.am-champs .am-rencontre .am-club input{padding-right:11px}
.am-sc{display:flex;align-items:center;gap:6px}
.am-sc input{width:60px;text-align:center;font-weight:800}
.am-eq-vide{margin:0 0 8px;font-size:14px}
.am-eq > .am-club{margin-bottom:8px}
.am-mode{display:flex;flex-wrap:wrap;gap:6px}
.am-aide{margin:0;font-size:14px}
.am-pl .am-puces{margin:0 0 8px}
.am-puce.am-nous{border-color:var(--or,#E3B64C);background:rgba(227,182,76,.16)}
.am-pl-lab{display:block;margin:4px 0 8px}
.am-pm{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr) auto auto;align-items:center;gap:8px;margin-bottom:8px}
.am-pm-res{grid-template-columns:minmax(0,1fr) 56px auto 56px minmax(0,1fr) auto}
.am-pm input[type=number]{text-align:center;font-weight:800;padding-left:4px;padding-right:4px}
.am-pm-t{font-weight:800;color:var(--texte-doux)}
.am-seul{margin-top:2px}
.am-pm select{padding-left:8px;padding-right:22px;background-position:right 6px center;text-overflow:ellipsis}
@media (max-width:560px){
  .am-eq{padding:8px 6px 2px}
  .am-pm{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:6px;padding:6px;border:1px solid var(--ligne);border-radius:10px}
  .am-pm select{padding-right:18px}
  .am-pm .am-pm-h{grid-column:1/3}
  .am-pm .am-pm-x{grid-column:3;justify-self:end}
  .am-pm-res{grid-template-columns:minmax(0,1fr) 52px auto 52px minmax(0,1fr)}
  .am-pm-res .am-pm-a{grid-column:1/3}.am-pm-res .am-pm-b{grid-column:4/6}
  .am-pm-res .am-pm-sa{grid-column:2;grid-row:2}.am-pm-res .am-pm-t{grid-column:3;grid-row:2}.am-pm-res .am-pm-sb{grid-column:4;grid-row:2}
  .am-pm-res .am-pm-x{grid-column:5;grid-row:2;justify-self:end}
}
.am-eqnum{font:700 14px var(--corps);color:var(--texte-doux)}
.am-puces{display:flex;flex-wrap:wrap;gap:8px;margin:2px 0 10px}
.am-puce{display:inline-flex;align-items:center;gap:6px;padding:6px 6px 6px 12px;border-radius:999px;border:1px solid var(--ligne);background:rgba(28,99,196,.16);font:700 14px var(--corps)}
.am-puce button{border:0;background:none;color:inherit;font:800 14px var(--corps);cursor:pointer;min-width:30px;min-height:30px;border-radius:999px}
.am-puce button:hover{background:rgba(255,255,255,.12)}
.am-score .am-club{flex:1 1 160px;min-width:0}
.am-club{position:relative;display:flex;align-items:center;gap:8px;min-width:0}
.am-club input,body.sur-espace .am-club input{flex:1 1 auto;min-width:0;padding-right:40px;scroll-margin-top:130px}
.am-club-x{position:absolute;right:4px;top:50%;transform:translateY(-50%);border:0;background:none;color:var(--texte-doux);font:800 15px var(--corps);min-width:34px;min-height:34px;border-radius:999px;cursor:pointer}
.am-club-ajout .am-club-x{right:96px}
.am-club-x:hover{background:rgba(143,168,240,.16)}
.am-club-ok{flex:0 0 auto;min-height:40px}
.am-club-x[hidden],.am-club-ok[hidden],.am-club-liste[hidden]{display:none}
.am-club-liste{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:40;max-height:min(320px,46vh);overflow:auto;overscroll-behavior:contain;display:block;
  background:var(--carte);color:var(--texte);border:1px solid var(--ligne);border-radius:12px;box-shadow:0 14px 34px rgba(4,10,30,.38);padding:4px 0;text-transform:none;letter-spacing:0}
.am-club-gr{display:block;padding:8px 12px 4px;font:800 11.5px var(--corps);letter-spacing:.08em;text-transform:uppercase;color:var(--texte-doux)}
.am-club-opt{display:block;padding:10px 12px;font:600 15px var(--corps);cursor:pointer;min-height:22px}
.am-club-opt small{display:block;font:600 12px var(--corps);color:var(--texte-doux)}
.am-club-opt:hover{background:rgba(28,99,196,.10)}
.am-club-opt.actif{background:rgba(28,99,196,.30);box-shadow:inset 3px 0 0 var(--bleu-clair,#8FA8F0)}
.am-club-libre{border-bottom:1px solid var(--ligne)}
.am-club-vide{display:block;padding:10px 12px;color:var(--texte-doux);font:600 14px var(--corps)}
.am-manque{margin:10px 0 0;padding:8px 10px;border-radius:10px;background:rgba(232,131,58,.14);font-size:14px}
.am-manque[hidden],.am-avert[hidden]{display:none}
.am-lieu .as-fmt{min-height:44px;padding:10px 14px;font-size:15px}
.am-score-match .am-sc{white-space:nowrap}
.am-err{background:rgba(232,131,58,.16)}
.am-quel{display:flex;flex-direction:column;gap:6px;margin-bottom:12px}
#panneau [data-am-img][src]{cursor:zoom-in}
#panneau [data-am-img]:not([src]){visibility:hidden}
.ev-cadre{position:relative}
.am-vide-ap{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;font:600 14px var(--corps);color:var(--texte-doux)}
.ev-cadre:has(img[src]) .am-vide-ap,.ev-cadre:has(img.charge) .am-vide-ap{display:none}
#am-zoom{position:fixed;inset:0;z-index:200;background:rgba(3,8,24,.92);display:flex;flex-direction:column;align-items:center;gap:10px;padding:12px;overflow:auto}
#am-zoom img{max-width:min(100%,720px);height:auto;border-radius:8px}
#am-zoom button{align-self:flex-end}
@media (max-width:560px){ .am-apercus:has(.am-fig + .am-fig){grid-template-columns:minmax(0,1fr)} }
.am-avert{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:rgba(143,168,240,.12);font-size:14px}
.am-ajout{width:100%;margin-top:12px}
.am-options{display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px 14px;margin-top:16px;padding-top:14px;border-top:1px solid var(--ligne)}
.am-options label:first-child{display:flex;flex-direction:column;gap:6px;flex:1 1 220px}
.am-apercus{display:grid;gap:12px}
.ev-publier #am-etat{white-space:pre-line}
.am-apercus:has(.am-fig + .am-fig){grid-template-columns:1fr 1fr}
.am-fig{margin:0}
.am-fig figcaption{text-align:center;font:700 13px var(--corps);margin-top:6px;color:var(--texte-doux)}
@media (max-width:560px){
  .am-types{grid-template-columns:repeat(2,minmax(0,1fr))}
  .am-champs{grid-template-columns:minmax(0,1fr)}
}`;
  document.head.appendChild(css);
})();
