/* Onglet Affiches › « Affiches de la semaine » : toutes les affiches qui seront publiées (les résultats le lundi à 9 h,
   les rencontres le mercredi à 9 h : sous le titre, une ligne pour chaque jour ; sur chaque annonce, son jour).
   Chaque annonce part en une publication à domicile et une à l'extérieur ; chacune peut avoir plusieurs affiches
   (page 1/2, 2/2, ou une par catégorie pour le foot animation). Le serveur dit lesquelles (?pages=1) et on montre
   une vignette pour chacune, dans la bande et dans la visionneuse, avec le texte de la publication de son lieu.
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.panAffichesSemaine !== "function") return;
  const memo = new Map();                                               // adresse de l'aperçu → ["", …] ou ["page 1/2", "page 2/2"] ou ["U6 · U7", …]
  const enCours = new Set();
  const avec = (src, k, v) => { const u = new URL(src, location.href); u.searchParams.set(k, v); return u.pathname + u.search; };
  const param = (src, k) => new URL(src, location.href).searchParams.get(k) || "";

  /* une vignette par affiche, à partir de ce que le serveur a répondu */
  function etendre(racine){
    racine.querySelectorAll(".as-bande .as-vignette:not([data-as-page]) img").forEach(img => {
      const src = img.getAttribute("src") || "", pages = memo.get(cle(src));
      if (!pages) return;
      const b = img.closest(".as-vignette");
      b.dataset.asPage = "1";
      if (pages.length < 2){ if (param(src, "format") === "fb") img.setAttribute("src", avec(src, "format", "carre")); return; }   // une affiche seule : 4:5 sur Facebook
      const fmt = pages.length === 2 ? param(src, "format") : (param(src, "format") === "fb" ? "carre" : param(src, "format"));
      let dernier = b;
      pages.forEach((suf, k) => {
        const x = k ? b.cloneNode(true) : b;
        x.dataset.asPage = String(k + 1);
        const im = x.querySelector("img");
        im.setAttribute("src", avec(avec(src, "page", String(k + 1)), "format", fmt));
        if (fmt !== param(src, "format")) x.classList.replace(param(src, "format"), fmt);
        const e = x.querySelector(".as-page") || x.appendChild(document.createElement("em"));
        e.className = "as-page"; e.textContent = suf.replace(/^page\s*/, "");
        x.title = (b.title || "") + (suf ? " · " + suf : "");
        if (k){ dernier.after(x); dernier = x; }
      });
    });
    renumeroter(racine);
  }
  const cle = src => { const u = new URL(src, location.href); ["format", "page", "v", "partie"].forEach(k => u.searchParams.delete(k)); return u.search; };
  /* la visionneuse suit l'ordre des vignettes ; le texte copié est celui de la publication du lieu */
  function renumeroter(racine){
    const l = [];
    racine.querySelectorAll(".as-bande .as-groupe").forEach(g => {
      const nom = (g.querySelector(".as-nom") || {}).textContent || "";
      g.querySelectorAll(".as-vignette").forEach(b => {
        const src = b.querySelector("img").getAttribute("src") || "", lieu = param(src, "lieu");
        b.dataset.asVoir = String(l.length);
        const suf = (b.querySelector(".as-page") || {}).textContent || "";
        l.push({ src, titre: `${nom} · ${lieu === "dom" ? "domicile" : "extérieur"}${suf ? " · " + suf : ""}`,
          texte: `/api/affiches.php?${new URLSearchParams({ apercu: param(src, "apercu"), message: "1", exact: "1", date: param(src, "date"), lieu })}` });
      });
    });
    if (l.length) S.ui.affSemListe = l;
  }
  /* demande au serveur les affiches de chaque annonce (une fois par adresse) */
  function demander(){
    document.querySelectorAll(".as-bande .as-vignette img").forEach(img => {
      const src = img.getAttribute("src") || "", k = cle(src);
      if (memo.has(k) || enCours.has(k)) return;
      enCours.add(k);
      fetch(avec(avec(src, "pages", "1"), "v", Date.now().toString(36)), { credentials: "same-origin", cache: "no-store" })
        .then(r => r.ok && (r.headers.get("Content-Type") || "").includes("json") ? r.json() : null)
        .then(d => { memo.set(k, d && Array.isArray(d.pages) && d.pages.length ? d.pages.map(String) : [""]); etendre(document); })
        .catch(() => { memo.set(k, [""]); })
        .finally(() => enCours.delete(k));
    });
  }
  /* les jours de publication : le lundi à 9 h les résultats du week-end passé, le mercredi à 9 h les rencontres du week-end
     qui arrive (api/affiches.php, affiches_cron). Sous le titre, une ligne pour chacun ; sur chaque annonce, son jour. */
  const MOIS_L = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  const jourTxt = x => `${x.getDate() === 1 ? "1er" : x.getDate()} ${MOIS_L[x.getMonth()]}`;
  function joursPublication(racine){
    const sm = racine.querySelector(".as-titre small"); if (!sm) return;
    const decal = +(S.ui && S.ui.affSemDecal) || 0;
    const lundi = new Date(); lundi.setDate(lundi.getDate() - (lundi.getDay() + 6) % 7 + 7 * decal); lundi.setHours(9, 0, 0, 0);   // comme l'application
    const le = j => { const x = new Date(lundi); x.setDate(x.getDate() + j); return x; };
    const lun = le(0), mer = le(2), maintenant = new Date();
    sm.innerHTML = `<span class="as-pub"><span aria-hidden="true">📊</span> Résultats du week-end du ${jourTxt(le(-2))} · ${maintenant >= lun ? "publiés" : "publication"} le lundi ${jourTxt(lun)} à 9 h</span>`
      + `<span class="as-pub"><span aria-hidden="true">📅</span> Rencontres du week-end du ${jourTxt(le(5))} · ${maintenant >= mer ? "publiées" : "publication"} le mercredi ${jourTxt(mer)} à 9 h</span>`
      + (decal > 0 ? `<span class="as-pub as-pub-note">Aperçu : les matchs peuvent encore changer</span>` : "");
    racine.querySelectorAll(".as-bande .as-groupe").forEach(g => {
      const img = g.querySelector(".as-vignette img"), nom = g.querySelector(".as-nom");
      if (!img || !nom || g.querySelector(".as-jour")) return;
      const res = /resultats/.test(param(img.getAttribute("src") || "", "apercu"));
      const j = document.createElement("span");
      j.className = "as-jour " + (res ? "lun" : "mer");
      j.textContent = res ? "Lundi 9 h" : "Mercredi 9 h";
      nom.after(j);
    });
  }
  const avant = window.panAffichesSemaine;
  window.panAffichesSemaine = function(){
    const h = avant.apply(this, arguments);
    const t = document.createElement("template"); t.innerHTML = h;
    try { joursPublication(t.content); } catch(err){}
    if (!/class="as-bande"/.test(h)) return t.innerHTML;
    etendre(t.content);                                                 // déjà connu : tout de suite, sans clignoter
    setTimeout(demander, 0);
    return t.innerHTML;
  };
  // « ↻ Actualiser » : on redemande au serveur
  document.addEventListener("click", ev => { if (ev.target.closest && ev.target.closest('[data-a="aff-sem-maj"]')) memo.clear(); }, true);

  const css = document.createElement("style");
  css.id = "affiches-semaine-css";
  css.textContent = `
.as-vignette .as-page{position:absolute;right:4px;top:4px;font:800 10px var(--corps);font-style:normal;background:rgba(227,182,76,.92);color:#0B1633;border-radius:6px;padding:1px 5px;max-width:calc(100% - 8px);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.as-paire{flex-wrap:nowrap}
.as-titre small .as-pub{display:block;line-height:1.45}
.as-titre small .as-pub-note{font-style:italic}
.as-groupe .as-jour{justify-self:start;font:700 11.5px var(--corps);letter-spacing:.02em;padding:2px 9px;border-radius:999px;background:rgba(143,168,240,.16);color:#DCE5FF}
.as-groupe .as-jour.mer{background:rgba(91,140,255,.24);color:#E6EDFF}
:root[data-theme="light"] .as-groupe .as-jour{background:rgba(28,79,214,.08);color:#1C3F9E}
:root[data-theme="light"] .as-groupe .as-jour.mer{background:rgba(28,79,214,.16);color:#1C3F9E}`;
  document.head.appendChild(css);
})();
