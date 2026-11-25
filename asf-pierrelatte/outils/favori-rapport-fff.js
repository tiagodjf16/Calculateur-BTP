/* Favori « 🔎 Rapport FFF » : à toucher sur une page de match de la FFF (epreuves.fff.fr).
   Il note ce que la page a chargé (adresses des données, données reçues, texte affiché, routes du site)
   et propose d'enregistrer le tout dans un fichier, à envoyer à la personne qui s'occupe du site.
   Rien n'est envoyé nulle part tout seul. Les jetons de connexion, mots de passe, e-mails et téléphones
   sont retirés du rapport. Pas de commentaire « // » : le code est mis sur une seule ligne. */
(async () => {
  const ID = "asf-rapport";
  if (!/(^|\.)fff\.fr$/.test(location.hostname)) { alert("Ce favori s'utilise sur le site de la FFF (www.fff.fr ou epreuves.fff.fr) : ouvre d'abord un match de Pierrelatte, puis touche-le."); return; }
  const ancien = document.getElementById(ID); if (ancien) ancien.remove();
  const box = document.createElement("div"); box.id = ID;
  box.style.cssText = "position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;padding:14px 16px;border-radius:14px;background:#0F2257;color:#fff;font:600 16px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45)";
  document.body.appendChild(box);
  const dire = t => { box.textContent = "🔎 ASF Pierrelatte · " + t; };
  try {
    dire("préparation du rapport…");
    const MASQUE = /token|jwt|auth|passw|secret|session|cookie|bearer|signature|mail|tel|phone|portable|mobile|fax/i;
    const masqueTexte = t => String(t)
      .replace(/eyJ[\w-]{8,}\.[\w-]{8,}\.?[\w-]*/g, "[masqué]")
      .replace(/("|&q;)([\w-]*(token|jwt|passw|secret)[\w-]*)("|&q;)\s*:\s*("|&q;)[^"&]*("|&q;)/gi, "\"$2\":\"[masqué]\"")
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[e-mail masqué]")
      .replace(/(?:\+33\s?|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/g, "[téléphone masqué]");
    const nettoie = (v, d) => {
      d = d || 0;
      if (d > 14) return "…";
      if (Array.isArray(v)) return v.slice(0, 120).map(x => nettoie(x, d + 1));
      if (v && typeof v === "object") { const o = {}; for (const k of Object.keys(v).slice(0, 250)) o[k] = MASQUE.test(k) ? "[masqué]" : nettoie(v[k], d + 1); return o; }
      if (typeof v === "string") { const s = masqueTexte(v); return s.length > 500 ? s.slice(0, 500) + "…" : s; }
      return v;
    };
    const sansJeton = u => String(u).replace(/([?&][^=&]*(token|jwt|auth|key|session)[^=&]*=)[^&#]*/gi, "$1[masqué]");
    let jeton = "";
    try { const s = document.getElementById("ng-state") || document.querySelector('script[type="application/json"]'); const m = s && s.textContent.match(/"token"\s*:\s*"([^"]{10,})"/); if (m) jeton = m[1]; } catch (e) {}
    let ng = null;
    try {
      const s = document.getElementById("ng-state");
      if (s) {
        const t = s.textContent;
        if (t.length > 3e6) ng = "(trop gros : " + t.length + " caractères)";
        else {
          try { ng = nettoie(JSON.parse(t)); }
          catch (e) { try { ng = nettoie(JSON.parse(t.replace(/&q;/g, "\"").replace(/&s;/g, "'").replace(/&l;/g, "<").replace(/&g;/g, ">").replace(/&a;/g, "&"))); } catch (e2) { ng = masqueTexte(t).slice(0, 200000); } }
        }
      }
    } catch (e) { ng = "(illisible)"; }
    const lire = async (u, avecJeton) => {
      const h = { Accept: "application/ld+json, application/json" };
      if (avecJeton && jeton) h["X-Competition"] = jeton;
      const r = await fetch(u, { headers: h, credentials: "include" });
      const t = await r.text();
      let j = null; try { j = JSON.parse(t); } catch (e) {}
      return { statut: r.status, json: j !== null ? nettoie(j) : undefined, texte: j === null ? masqueTexte(t.slice(0, 400)) : undefined };
    };
    const vus = [...new Set(performance.getEntriesByType("resource").map(e => e.name).filter(u => /\/api\//.test(u)))].slice(-40);
    const appels = []; let i = 0;
    for (const u of vus) {
      dire("lecture des données de la page… " + (++i) + "/" + vus.length);
      let a;
      try {
        a = await lire(u, false);
        if ((a.statut === 401 || a.statut === 403) && jeton) { const b = await lire(u, true); b.avecJeton = true; a = b; }
      } catch (e) { a = { erreur: String((e && e.message) || e) }; }
      a.u = sansJeton(u.indexOf(location.origin) === 0 ? u.slice(location.origin.length) : u);
      appels.push(a);
    }
    dire("lecture du site de la FFF…");
    const routes = new Set();
    const scripts = [...document.scripts].map(s => s.src).filter(s => s && s.indexOf(location.origin) === 0).slice(0, 25);
    for (const s of scripts) {
      try {
        const t = await (await fetch(s)).text();
        (t.match(/\/api\/[A-Za-z0-9_\-\/{}.:$?=&]{2,140}/g) || []).forEach(x => { if (routes.size < 600) routes.add(x); });
        (t.match(/["'`][\w\-\/]*(feuille|fmi|evenement|event|faits|buteur|carton|remplacement|compo|joueur|resume|match_?entit)[\w\-\/]*["'`]/gi) || []).forEach(x => { if (routes.size < 900) routes.add(x); });
      } catch (e) {}
    }
    const liens = [...new Set([...document.querySelectorAll("a[href]")].map(a => a.href).filter(h => /fff\.fr/.test(h) && /match|rencontre|feuille|competition|equipe/i.test(h)).map(sansJeton))].slice(0, 60);
    const texte = masqueTexte((document.body.innerText || "").replace(/\n{3,}/g, "\n\n")).slice(0, 20000);
    let html = "";
    try {
      const racine = (document.querySelector("main") || document.body).cloneNode(true);
      racine.querySelectorAll("script,style,noscript,iframe,link,meta,source,video,canvas,form,input,textarea,select,#" + ID).forEach(n => n.remove());
      racine.querySelectorAll("svg").forEach(s => [...s.children].forEach(c => { if (!/^(use|title)$/i.test(c.tagName)) c.remove(); }));
      const garder = /^(class|id|data-[\w-]+|href|xlink:href|title|alt|aria-label|role|datetime)$/i;
      [racine, ...racine.querySelectorAll("*")].forEach(n => [...n.attributes].forEach(a => {
        if (!garder.test(a.name)) n.removeAttribute(a.name);
        else if (/href/i.test(a.name)) n.setAttribute(a.name, sansJeton(a.value));
      }));
      html = masqueTexte(racine.outerHTML.replace(/\s{2,}/g, " ")).slice(0, 200000);
    } catch (e) { html = "(illisible)"; }
    const rapport = { v: 3, quand: new Date().toISOString(), page: sansJeton(location.href), titre: document.title, jeton: jeton ? "présent (non inclus)" : "absent",
      liens, appels, routes: [...routes], ngState: ng, texte, html };
    const json = JSON.stringify(rapport, null, 1);
    box.textContent = "";
    const p = document.createElement("div");
    p.textContent = "🔎 Rapport prêt (" + Math.max(1, Math.round(json.length / 1024)) + " Ko). Enregistre-le, puis envoie-le à la personne qui s'occupe du site.";
    box.appendChild(p);
    const bouton = (txt, fn, fond) => { const b = document.createElement("button"); b.type = "button"; b.textContent = txt; b.onclick = fn;
      b.style.cssText = "margin:10px 8px 0 0;padding:11px 14px;border:0;border-radius:10px;background:" + (fond || "#D02E26") + ";color:#fff;font:700 15px system-ui,-apple-system,sans-serif;cursor:pointer";
      box.appendChild(b); return b; };
    /* trois façons de le récupérer, chacune lancée directement par le toucher (l'iPhone refuse sinon) */
    const nom = "rapport-fff-" + new Date().toISOString().slice(0, 10) + ".txt";
    const info = document.createElement("div");
    info.style.cssText = "margin-top:10px;font:500 14px/1.4 system-ui,-apple-system,sans-serif;color:#DCE5FA";
    const montrer = t => { info.textContent = t; };
    bouton("📤 Partager", () => {
      const f = new File([json], nom, { type: "text/plain" });
      if (!navigator.share || (navigator.canShare && !navigator.canShare({ files: [f] }))) { montrer("Partage impossible ici : touche « ⬇️ Télécharger » ou « 📋 Copier »."); return; }
      navigator.share({ files: [f], title: nom })
        .then(() => montrer("✔ C'est fait. Envoie maintenant ce fichier dans la conversation."))
        .catch(e => { if (!(e && e.name === "AbortError")) montrer("Le partage n'a pas marché : touche « ⬇️ Télécharger » ou « 📋 Copier »."); });
      montrer("Choisis « Enregistrer dans Fichiers », puis envoie le fichier dans la conversation.");
    });
    const lien = document.createElement("a");
    lien.textContent = "⬇️ Télécharger"; lien.download = nom;
    lien.href = URL.createObjectURL(new Blob([json], { type: "text/plain" }));
    lien.style.cssText = "display:inline-block;margin:10px 8px 0 0;padding:11px 14px;border-radius:10px;background:#2B3F6B;color:#fff;text-decoration:none;font:700 15px system-ui,-apple-system,sans-serif";
    lien.onclick = () => montrer("Le fichier va dans Fichiers › Téléchargements : envoie-le ensuite dans la conversation.");
    box.appendChild(lien);
    bouton("📋 Copier", () => {
      const ta = document.createElement("textarea");
      ta.value = json; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, json.length);
      let ok = false; try { ok = document.execCommand("copy"); } catch (e) {}
      ta.remove();
      if (ok) { montrer("✔ Copié : colle-le dans un message de la conversation."); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(json)
        .then(() => montrer("✔ Copié : colle-le dans un message de la conversation."), () => montrer("Copie impossible : touche « 📤 Partager » ou « ⬇️ Télécharger »."));
      else montrer("Copie impossible : touche « 📤 Partager » ou « ⬇️ Télécharger ».");
    }, "#2B3F6B");
    bouton("✕", () => box.remove(), "#33415C");
    box.appendChild(info);
    montrer("Touche « 📤 Partager » puis « Enregistrer dans Fichiers ». Si ça ne marche pas : « ⬇️ Télécharger » ou « 📋 Copier ».");
  } catch (e) {
    dire("le rapport n'a pas pu être fait (" + String((e && e.message) || e) + ").");
    setTimeout(() => box.remove(), 8000);
  }
})();
