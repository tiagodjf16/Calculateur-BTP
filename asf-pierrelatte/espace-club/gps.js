/* Itinéraires des fiches de match et des rendez-vous du foot animation (boutons Waze et Google Maps), et adresses des stades.
   Ce qui n'allait pas :
   - Waze recevait du texte (« Stade de FC … » quand l'adresse n'était pas connue) : avec seulement du texte, Waze cherche et
     s'arrête sur une liste de résultats, souvent vide : « ça ne fait rien ». Avec une position GPS (ll=…), il démarre le guidage.
   - Une adresse saisie pour un match à domicile joué ailleurs était ignorée ; le carnet des stades et nos anciens matchs chez un
     club n'étaient jamais regardés pour la fiche ; un rendez-vous à l'extérieur pouvait garder l'adresse de Pierrelatte ;
     changer de club gardait l'adresse du club d'avant ; un club vide donnait le stade d'un club au hasard.
   - Page Résultats : toucher un résultat U10 · U11 ou U13 ne faisait rien.
   Ce que fait ce module :
   - l'adresse d'une fiche : celle saisie (si c'est une vraie adresse), sinon notre stade (à domicile), sinon celle du club qui
     reçoit (carnet des stades, puis notre dernier match chez lui) ; inconnue : on le dit, et on propose de chercher le stade ;
   - Waze : la position GPS de l'adresse (géocodeur gratuit de l'IGN, data.geopf.fr, gardée sur l'appareil), sinon le texte ;
     Google Maps : l'itinéraire (dir) au lieu d'une simple recherche ;
   - le bureau peut enregistrer l'adresse du stade d'un club directement depuis la fiche (carnet site/stades) ;
   - formulaires (foot animation, vétérans) : l'adresse suit le club choisi, et un rendez-vous à l'extérieur n'enregistre plus
     l'adresse de Pierrelatte.
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.ouvrirFiche !== "function") return;
  const STADE = typeof ADRESSE_STADE === "string" ? ADRESSE_STADE : "Stade Gustave Jaume, avenue Pierre de Coubertin, 26700 Pierrelatte";
  const CLUB_ADR = typeof ADRESSE_CLUB === "string" ? ADRESSE_CLUB : STADE;
  const e = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const sansAccents = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");
  const norm = s => sansAccents(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const propre = s => String(s ?? "").replace(/\s+/g, " ").trim();
  const sansNumero = nom => propre(nom).replace(/\s+\d+$/, "");
  /* un club, écrit de plusieurs façons (« C.O. Donzère », « CO DONZERE », « co-donzere ») : une seule clé */
  const cle = nom => norm(sansNumero(nom)).replace(/ /g, "");
  const nomClub = nom => { const n = sansNumero(nom); try { return typeof joliClub === "function" ? joliClub(n) : n; } catch(err){ return n; } };
  /* notre stade, quelle que soit la façon dont il est écrit */
  const estNotreStade = a => { const n = norm(a); return !!n && (n === norm(STADE) || n === norm(CLUB_ADR) || /\bgustave jaume\b/.test(n)); };
  /* une adresse qu'un GPS peut trouver : un code postal, ou au moins « lieu, ville » */
  const complete = a => { const p = propre(a); return /\b\d{5}\b/.test(p) || p.split(/\s*,\s*/).filter(x => /[a-z]{3}/i.test(sansAccents(x))).length >= 2; };

  /* ---------- l'adresse du stade d'un club ---------- */
  const valeur = v => propre(typeof v === "string" ? v : v && typeof v === "object" ? (v.adresse || v.address || "") : "");
  function adresseDuClub(nom){
    const k = cle(nom); if (k.length < 3) return "";                       // pas de club : pas d'adresse (et jamais celle d'un autre)
    const carnet = { ...(typeof STADES_CONNUS === "object" && STADES_CONNUS ? STADES_CONNUS : {}), ...(S.stades && typeof S.stades === "object" ? S.stades : {}) };
    const cles = Object.keys(carnet);
    const exacte = cles.filter(x => cle(x) === k).map(x => valeur(carnet[x])).find(Boolean);
    if (exacte) return exacte;
    if (k.length >= 6){                                                    // « ES Boulieu » / « ES Boulieu les Annonay » : s'il n'y a qu'un candidat
      const proches = [...new Set(cles.filter(x => { const c = cle(x); return c.length >= 6 && (c.includes(k) || k.includes(c)); }).map(x => valeur(carnet[x])).filter(Boolean))];
      if (proches.length === 1) return proches[0];
    }
    // notre dernier match chez lui (le plus récent, jamais une adresse de Pierrelatte)
    const passe = [...(S.matchs || []), ...(S.matchsAnimation || [])]
      .filter(m => m && !m.dom && cle(m.adv) === k && valeur(m.adresse) && !estNotreStade(m.adresse))
      .sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")))[0];
    return passe ? valeur(passe.adresse) : "";
  }
  window.adresseStadeClub = adresseDuClub;

  /* ---------- l'adresse d'une fiche (match ou rendez-vous) ---------- */
  function lieu(m){
    if (!m) return "";
    const a = valeur(m.adresse);
    if (m.dom) return a && complete(a) && !estNotreStade(a) ? a : STADE;   // à domicile sur un autre terrain : l'adresse saisie
    if (a && !estNotreStade(a)){
      if (complete(a)) return a;
      const connue = adresseDuClub(m.adv);                                  // « Stade municipal » tout seul : l'adresse connue du club, si elle est meilleure
      return connue && complete(connue) ? connue : a;
    }
    return adresseDuClub(m.adv);
  }
  const avantLieu = window.lieuMatch;
  if (typeof avantLieu === "function") window.lieuMatch = function(m){
    try { const l = lieu(m); if (l) return l; } catch(err){}
    return avantLieu.apply(this, arguments);
  };

  /* ---------- la position GPS d'une adresse : géocodeur de l'IGN (Géoplateforme), gratuit, sans clé ----------
     On cherche d'abord le stade par son nom (index poi), puis la rue (index address) ; une réponse n'est retenue que si elle
     est sûre (même code postal, nom du stade retrouvé, ou rue avec un bon score). Gardée sur l'appareil 6 mois. */
  const GEO = "https://data.geopf.fr/geocodage/search";
  const RE_POI = /^(stade|complexe|terrain|parc (municipal )?des sports|plaine (des|de) (sports|jeux)|espace sportif|city[- ]?stade|gymnase|halle|centre sportif|base de loisirs)\b/i;
  const MOTS_VIDES = new Set("stade stades complexe sportif sportive sports sport terrain terrains municipal municipale communal communale du de des la le les l d au aux et parc plaine espace football foot".split(" "));
  function decouper(adr){
    const segs = propre(adr).replace(/,?\s*france\s*$/i, "").split(/\s*[,;]\s*|\s+[-–]\s+/).map(s => s.trim()).filter(Boolean);
    let cp = "", ville = "", poi = "", attendVille = false; const rue = [];
    for (const s of segs){
      const m = !cp && s.match(/(?:^|\s)(\d{5})(?:\s+(.*))?$/);
      if (m){ cp = m[1]; ville = (m[2] || "").trim(); const av = s.slice(0, m.index).trim(); if (av) rue.push(av); attendVille = !ville; continue; }
      if (attendVille){ ville = s; attendVille = false; continue; }
      if (!poi && RE_POI.test(s)){ poi = s; continue; }
      rue.push(s);
    }
    if (!cp && !ville && rue.length > 1) ville = rue.pop();
    return { poi, rue: rue.join(" "), cp, ville };
  }
  const q3 = s => { s = propre(s).replace(/^[^\p{L}\p{N}]+/u, "").slice(0, 200); return s.length >= 3 ? s : ""; };
  const urlGeo = p => GEO + "?" + new URLSearchParams(Object.entries(p).filter(([, v]) => v !== "" && v != null)).toString();
  function requetes(adr){
    const d = decouper(adr), out = [];
    if (!d.cp && !d.ville) return { d, out };
    const lieuTxt = [d.cp, d.ville].filter(Boolean).join(" ");
    if (d.poi && q3(`${d.poi} ${d.ville}`)) out.push({ k: "poi", u: urlGeo({ q: q3(`${d.poi} ${d.ville}`), index: "poi", limit: 10, postcode: d.cp }) });
    if (d.rue && q3(`${d.rue} ${lieuTxt}`)) out.push({ k: "adresse", u: urlGeo({ q: q3(`${d.rue} ${lieuTxt}`), index: "address", limit: 5, postcode: d.cp }) });
    return { d, out };
  }
  const tab = v => Array.isArray(v) ? v : v == null ? [] : [v];
  const point = f => {
    const c = f && f.geometry && f.geometry.coordinates;                  // GeoJSON : [longitude, latitude]
    if (!Array.isArray(c) || c.length < 2) return null;
    const lon = +c[0], lat = +c[1];
    return Number.isFinite(lat) && Number.isFinite(lon) && lat > 41 && lat < 51.5 && lon > -5.5 && lon < 10 ? { lat, lon } : null;   // France métropolitaine
  };
  const memeLieu = (p, d) => d.cp ? tab(p.postcode).map(String).includes(d.cp) : tab(p.city).some(c => norm(c) === norm(d.ville));
  function choisir(k, json, d){
    const feats = json && Array.isArray(json.features) ? json.features : [];
    if (k === "poi"){
      const mots = norm(d.poi).split(" ").filter(w => w.length > 1 && !MOTS_VIDES.has(w));
      const sportifs = feats.filter(f => { const p = f.properties || {};
        return (p._type || "poi") === "poi" && point(f) && memeLieu(p, d) && /stade|sport|terrain|football/i.test(tab(p.category).join(" ") + " " + (p.toponym || "")); });
      if (mots.length){
        const bon = sportifs.find(f => { const t = norm(f.properties.toponym || tab(f.properties.name).join(" ")).split(" "); return mots.every(w => t.includes(w)); });
        return bon ? { ...point(bon), precision: "stade" } : null;
      }
      return sportifs.length === 1 ? { ...point(sportifs[0]), precision: "stade" } : null;    // « Stade municipal » : seulement s'il est seul
    }
    const ok = feats.filter(f => { const p = f.properties || {};
      return (p._type || "address") === "address" && ["housenumber", "street", "locality"].includes(p.type) && +p.score >= 0.5 && memeLieu(p, d) && point(f); })
      .sort((a, b) => b.properties.score - a.properties.score)[0];
    return ok ? { ...point(ok), precision: ok.properties.type } : null;
  }
  const CACHE = "asfp-geo1", jour = () => Math.floor(Date.now() / 864e5);
  function lireCache(adr){
    try { const c = JSON.parse(localStorage.getItem(CACHE) || "{}")[norm(adr)]; if (!c) return undefined;
      const age = jour() - c[3];
      if (c[2] === "aucun") return age < 7 ? null : undefined;
      return age < 180 ? { lat: c[0], lon: c[1], precision: c[2] } : undefined; } catch(err){ return undefined; }
  }
  function ecrireCache(adr, r){
    try { const t = JSON.parse(localStorage.getItem(CACHE) || "{}");
      t[norm(adr)] = r ? [+r.lat.toFixed(6), +r.lon.toFixed(6), r.precision, jour()] : [0, 0, "aucun", jour()];
      const cles = Object.keys(t); if (cles.length > 300) cles.sort((a, b) => t[a][3] - t[b][3]).slice(0, cles.length - 300).forEach(x => delete t[x]);
      localStorage.setItem(CACHE, JSON.stringify(t)); } catch(err){}
  }
  const enCours = new Map();
  let pannes = 0;                                                          // le géocodeur ne répond pas (réseau, blocage) : on arrête pour cette visite
  function geocoder(adr){
    const c = lireCache(adr); if (c !== undefined) return Promise.resolve(c);
    if (pannes >= 2 || typeof fetch !== "function") return Promise.resolve(null);
    const k = norm(adr); if (enCours.has(k)) return enCours.get(k);
    const p = (async () => {
      const { d, out } = requetes(adr);
      let toutRepondu = true;
      for (const r of out){
        let json = null;
        const ac = typeof AbortController === "function" ? new AbortController() : null, t = setTimeout(() => { try { ac && ac.abort(); } catch(err){} }, 4000);
        try {
          const rep = await fetch(r.u, { signal: ac ? ac.signal : undefined, headers: { Accept: "application/json" }, credentials: "omit" });
          if (rep.status === 429){ toutRepondu = false; break; }           // trop de demandes : on n'insiste pas
          if (rep.ok) json = await rep.json(); else toutRepondu = false;
        } catch(err){ toutRepondu = false; pannes++; }
        finally { clearTimeout(t); }
        const res = choisir(r.k, json, d);
        if (res){ ecrireCache(adr, res); return res; }
      }
      if (toutRepondu && out.length) ecrireCache(adr, null);              // vraiment rien trouvé : on ne redemande pas avant 7 jours
      return null;
    })();
    enCours.set(k, p); p.finally(() => enCours.delete(k));
    return p;
  }

  /* ---------- les liens ---------- */
  const UTM = "utm_source=asf-pierrelatte";
  const wazeTexte = a => `https://waze.com/ul?q=${encodeURIComponent(a)}&navigate=yes&${UTM}`;
  const wazeGps = g => `https://waze.com/ul?ll=${g.lat.toFixed(6)},${g.lon.toFixed(6)}&navigate=yes&${UTM}`;
  const gmapsRoute = a => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(a)}&travelmode=driving&dir_action=navigate`;
  const gmapsCherche = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

  /* ---------- la fiche ouverte : adresse, boutons, et (bureau) l'adresse du stade du club ---------- */
  const bureau = () => { try { return typeof estBureau === "function" && estBureau(); } catch(err){ return false; } };
  function gpsFiche(m){
    const d = document.getElementById("fiche-match"); if (!d || !m) return;
    const z = d.querySelector(".fm-gps"); if (!z) return;
    const adr = lieu(m), club = m.dom ? "" : nomClub(m.adv);
    const ligne = [...d.querySelectorAll(".fm-ligne")].find(l => /^\s*adresse\s*$/i.test((l.querySelector("b") || {}).textContent || ""));
    if (ligne){ const s = ligne.querySelector("span"); if (s) s.textContent = adr || `Pas encore connue${club ? " (chez " + club + ")" : ""}`; }
    const modifiable = !m.dom && club && bureau();
    const outil = modifiable ? `<details class="fm-gps-stade"${adr ? "" : " open"}><summary>📍 ${adr ? "Corriger" : "Ajouter"} l'adresse du stade de ${e(club)}</summary>
        <div class="fm-gps-form"><input type="text" data-gps-adresse value="${e(adr)}" placeholder="Stade, rue, code postal ville" autocomplete="off">
          <button type="button" class="btn bleu petit" data-gps-a="stade" data-club="${e(sansNumero(m.adv))}">Enregistrer</button></div>
        <small>Elle servira pour tous les matchs chez ce club.</small></details>` : "";
    if (!adr){
      z.innerHTML = `<p class="fm-gps-note">L'adresse du stade${club ? " de " + e(club) : ""} n'est pas encore connue${modifiable ? "" : " : demande-la au coach"}.</p>`
        + (club ? `<a class="gmaps fm-gps-large" href="${gmapsCherche("stade " + club)}" target="_blank" rel="noopener">🔎 Chercher le stade sur Google Maps</a>` : "") + outil;
      return;
    }
    z.innerHTML = `<a class="waze" href="${wazeTexte(adr)}" target="_blank" rel="noopener">Waze</a>
      <a class="gmaps" href="${gmapsRoute(adr)}" target="_blank" rel="noopener">Google Maps</a>${outil}`;
    const w = z.querySelector(".waze");
    const poser = g => { if (g && g.precision !== "commune" && w && w.isConnected) w.href = wazeGps(g); };
    if (complete(adr)) geocoder(adr).then(poser).catch(() => {});
  }
  document.addEventListener("click", async ev => {
    const b = ev.target.closest && ev.target.closest('#fiche-match [data-gps-a="stade"]'); if (!b) return;
    ev.preventDefault(); ev.stopPropagation();
    const i = b.closest(".fm-gps-form").querySelector("[data-gps-adresse]"), adr = propre(i && i.value), club = b.dataset.club || "";
    if (!club) return;
    if (adr && !complete(adr)){ toast("Mets l'adresse complète, avec le code postal et la ville.", true); i.focus(); return; }
    if (adr && estNotreStade(adr)){ toast("C'est l'adresse de notre stade : mets celle du stade de " + nomClub(club) + ".", true); i.focus(); return; }
    const k = typeof slug === "function" ? slug(club) : cle(club);
    const carnet = { ...(S.stades || {}) };
    if (adr) carnet[k] = adr; else delete carnet[k];
    b.disabled = true;
    const ok = await ecrire(() => S.db.doc("site/stades").set(carnet), adr ? "Adresse du stade enregistrée." : "Adresse du stade retirée.");
    b.disabled = false;
    if (!ok) return;
    S.stades = carnet;
    const m = S.ui.gpsFicheDoc; if (m) gpsFiche(m);
  }, true);

  /* les fiches : on garde l'ouverture de l'application, puis on refait l'adresse et les boutons */
  const trouver = id => (S.matchs || []).find(x => x.id === id) || (S.matchsAnimation || []).find(x => x.id === id);
  const avantAnim = window.ficheAnimation;
  if (typeof avantAnim === "function") window.ficheAnimation = function(m){
    const r = avantAnim.apply(this, arguments);
    try { S.ui.gpsFicheDoc = m; gpsFiche(m); } catch(err){ if (window.console) console.warn("gps", err); }
    return r;
  };
  const avantFiche = window.ouvrirFiche;
  window.ouvrirFiche = function(id){
    const m = trouver(id);
    if (!m){                                                               // page Résultats : un score du foot animation (« pl-…-r0 ») ouvre son rendez-vous
      const p = /^(pl-.+)-r\d+$/.exec(String(id || "")), parent = p && trouver(p[1]);
      if (parent && typeof window.ficheAnimation === "function") return window.ficheAnimation(parent);
    }
    const r = avantFiche.apply(this, arguments);
    try { if (m && !/^pl-/.test(m.id)){ S.ui.gpsFicheDoc = m; gpsFiche(m); } } catch(err){ if (window.console) console.warn("gps", err); }
    return r;
  };

  /* ---------- formulaires : l'adresse suit le club choisi ----------
     (après l'application : elle ne remplissait l'adresse que si la case était vide, et un club vide donnait n'importe quel stade) */
  const derniers = () => S.ui.gpsAuto || (S.ui.gpsAuto = {});               // fiche → { adv, adresse } remplis automatiquement
  const stadeAppli = nom => { try { return typeof stadeDuClub === "function" ? propre(stadeDuClub(nom)) : ""; } catch(err){ return ""; } };
  /* l'adresse affichée vient-elle d'un remplissage automatique (et pas de la main du coach) ? */
  function automatique(actuelle, id, avant, nouveau, doc){
    const a = propre(actuelle), mem = derniers()[id] || {};
    if (!a || estNotreStade(a)) return true;
    return [adresseDuClub(avant), stadeAppli(avant), stadeAppli(nouveau), stadeAppli(""), propre(mem.adresse)].filter(Boolean).includes(a)
      || (!!doc && cle(doc.adv) === cle(avant) && propre(doc.adresse) === a);
  }
  const noter = (fn, champ) => { try { if (typeof window[fn] === "function") window[fn](champ); } catch(err){} };
  document.addEventListener("change", ev => {
    const t = ev.target; if (!t || !t.matches) return;
    // foot animation : le club qui reçoit
    if (t.matches('[data-anc="adv"]')){
      const carte = t.closest("[data-an]"), champ = carte && carte.querySelector('[data-anc="adresse"]'); if (!champ) return;
      const id = carte.dataset.an, doc = (S.matchsAnimation || []).find(x => x.id === id) || {};
      const nouveau = propre(t.value), avant = derniers()[id] && derniers()[id].adv !== undefined ? derniers()[id].adv : (doc.adv || "");
      if (cle(nouveau) === cle(avant) && propre(champ.value)) return;
      if (!automatique(champ.value, id, avant, nouveau, doc)){ derniers()[id] = { ...(derniers()[id] || {}), adv: nouveau }; return; }
      const adr = adresseDuClub(nouveau), changee = adr !== propre(champ.value);
      champ.value = adr; noter("noterBrouillonAn", champ);
      derniers()[id] = { adv: nouveau, adresse: adr };
      if (changee && nouveau) toast(adr ? "Adresse du stade remplie : vérifie-la, puis enregistre." : "Adresse de ce stade inconnue pour l'instant : saisis-la une fois, elle sera reprise la prochaine fois.");
      return;
    }
    // foot animation : à domicile → à l'extérieur
    if (t.matches("[data-an-lieu]") && t.value === "0"){
      const carte = t.closest("[data-an]"); if (!carte) return;
      const id = carte.dataset.an, doc = (S.matchsAnimation || []).find(x => x.id === id); if (!doc) return;
      const b0 = (S.ui.anBrouillon = S.ui.anBrouillon || {})[id] = { ...((S.ui.anBrouillon || {})[id] || {}) };
      const adr = b0.adresse !== undefined ? b0.adresse : (doc.adresse || "");
      if (propre(adr) && !estNotreStade(adr)) return;
      const x = adresseDuClub(b0.adv !== undefined ? b0.adv : doc.adv);
      if (propre(adr) === x) return;
      b0.adresse = x; derniers()[id] = { adv: b0.adv !== undefined ? b0.adv : (doc.adv || ""), adresse: x };
      try { rendrePanneau(); } catch(err){}
      return;
    }
    // vétérans : l'adversaire, ou le lieu
    if ((t.matches('[data-vc="adv"]') || t.matches("[data-vet-lieu]")) && t.closest("[data-vet]")){
      const carte = t.closest("[data-vet]"), champ = carte.querySelector('[data-vc="adresse"]'), lieuSel = carte.querySelector('[data-vc="dom"]');
      if (!champ || !lieuSel || lieuSel.value !== "0") return;              // à domicile : l'application met notre stade
      const id = carte.dataset.vet, doc = (S.matchs || []).find(x => x.id === id) || {};
      const advEl = carte.querySelector('[data-vc="adv"]'), nouveau = propre(advEl ? advEl.value : "");
      const avant = derniers()[id] && derniers()[id].adv !== undefined ? derniers()[id].adv : (doc.adv || "");
      if (t.matches('[data-vc="adv"]') && cle(nouveau) === cle(avant) && propre(champ.value) && !estNotreStade(champ.value)) return;
      if (!automatique(champ.value, id, avant, nouveau, doc)){ derniers()[id] = { ...(derniers()[id] || {}), adv: nouveau }; return; }
      const adr = adresseDuClub(nouveau);
      if (adr !== propre(champ.value)){ champ.value = adr; noter("noterBrouillonVet", champ); }
      derniers()[id] = { adv: nouveau, adresse: adr };
    }
  });

  const css = document.createElement("style");
  css.id = "gps-css";
  css.textContent = `
.fm-gps .fm-gps-note{grid-column:1/-1;margin:0;color:var(--texte-doux);font-size:14.5px;line-height:1.45;text-align:center}
.fm-gps .fm-gps-large{grid-column:1/-1}
.fm-gps .fm-gps-stade{grid-column:1/-1;margin-top:2px;font-size:14px}
.fm-gps .fm-gps-stade summary{cursor:pointer;font-weight:700;color:var(--texte-doux);padding:6px 0}
.fm-gps .fm-gps-form{display:flex;gap:8px;flex-wrap:wrap;margin:6px 0 4px}
.fm-gps .fm-gps-form input{flex:1 1 220px;min-width:0}
.fm-gps .fm-gps-stade small{color:var(--texte-doux)}`;
  document.head.appendChild(css);
})();
