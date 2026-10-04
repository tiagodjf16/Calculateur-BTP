/* Onglet Matchs et plateaux › Foot animation, rangé pour que ce soit simple :
   - « Comment ça marche ? » replié tout en haut (remplace la longue phrase grise du bas) ;
   - les 10 équipes rangées par âge (U6 · U7, U8 · U9, U10 · U11, U13), celle choisie bien visible, le nombre de rendez-vous à venir ;
   - l'en-tête de l'équipe choisie avec « + Ajouter un rendez-vous » ;
   - les rendez-vous en deux listes : « À venir » puis « Déjà joués » (les plus récents d'abord).
   Les fiches elles-mêmes (repliées ou ouvertes, en étapes) sont rangées par plateaux.js.
   Ajouté sans modifier le script de l'application : tous les boutons gardent leurs data-a / data-k / data-id. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.panAnimation !== "function" || typeof CATS_AN === "undefined" || typeof ONG === "undefined") return;
  const e = ONG.e;
  const GROUPES = [
    { cle: "U6 · U7", re: /^U6 · U7/, dit: "Plateaux" },
    { cle: "U8 · U9", re: /^U8 · U9/, dit: "Plateaux" },
    { cle: "U10 · U11", re: /^U10 · U11/, dit: "Plateaux · scores" },
    { cle: "U13", re: /^U13/, dit: "Brassages · scores" },
  ];
  /* nom court dans son groupe : « U10 · U11 Avenir » → « Avenir », « U13 · ÉQUIPE 3 » → « Équipe 3 » */
  const court = (c, g) => {
    const r = c.replace(g.re, "").replace(/^\s*·\s*/, "").trim();
    if (!r) return c;
    return r === r.toUpperCase() ? r.charAt(0) + r.slice(1).toLowerCase() : r;
  };
  const fiches = () => (S.matchsAnimation || []).filter(m => String(m.id).startsWith("pl-"));
  const pl = (n, s, p) => n + " " + (n > 1 ? (p || s + "s") : s);

  function boutonsEquipes(cat, auj){
    const tout = fiches();
    const bouton = (c, g) => {
      const n = tout.filter(m => m.equipe === c && (m.date || "") >= auj).length, on = c === cat;
      return `<button type="button" class="ong-anim-cat${on ? " on" : ""}" data-a="an-cat" data-k="${e(c)}" aria-pressed="${on}">
        <b>${on ? `<span class="ong-anim-ok" aria-hidden="true">✓</span>` : ""}${e(court(c, g))}</b>
        <small class="${n ? "a-venir" : ""}">${n ? pl(n, "à venir", "à venir") : "rien de prévu"}</small></button>`;
    };
    const restes = CATS_AN.filter(([c]) => !GROUPES.some(g => g.re.test(c)));            // au cas où une équipe serait ajoutée un jour
    return `<div class="ong-anim-cats" role="group" aria-label="Choisis l'équipe">
      ${GROUPES.map(g => { const l = CATS_AN.filter(([c]) => g.re.test(c)); return l.length ? ONG.groupe(`${e(g.cle)}<small>${e(g.dit)}</small>`, l.map(([c]) => bouton(c, g)).join("")) : ""; }).join("")}
      ${restes.length ? ONG.groupe("Autres", restes.map(([c]) => bouton(c, { re: /^$/ })).join("")) : ""}</div>`;
  }

  const AIDE = `<ol>
      <li>Choisis l'équipe dans la liste (rangée par âge).</li>
      <li>Touche <b>« + Ajouter un rendez-vous »</b>, puis remplis la fiche dans l'ordre : quand et où, l'organisation (plateau, brassage ou poules), les équipes rencontrées.</li>
      <li>Touche <b>« Enregistrer »</b> : le rendez-vous part tout seul sur les affiches Foot animation.</li>
    </ol>
    <p class="ong-anim-astuce">Pour choisir un club, touche le champ : la liste des clubs du district s'ouvre, cherche par le nom (son logo ira sur l'affiche). Les scores se mettent seulement pour les U10 · U11 et les U13 ; les U6 à U9 n'ont pas de résultats.</p>`;

  const avant = window.panAnimation;
  window.panAnimation = function(){
    const h = avant.apply(this, arguments);
    return ONG.transformer(h, racine => {
      const cat = S.ui.anCat || CATS_AN[0][0], auj = aujourdhui();
      const def = CATS_AN.find(c => c[0] === cat) || CATS_AN[0];
      const brassage = def[1] === "Brassage", scores = !!def[2];
      const l = fiches().filter(m => m.equipe === cat);
      const nAvenir = l.filter(m => (m.date || "") >= auj).length, nJoues = l.length - nAvenir;

      const ajout = racine.querySelector('[data-a="an-ajout"]');
      const anciennes = racine.querySelector(".an-anciennes");
      const cartes = [...racine.querySelectorAll("article.an-carte[data-an]")];
      const aVenir = cartes.filter(a => !a.classList.contains("passe"));                 // « passe » : posé par l'application d'après la date
      const joues = cartes.filter(a => !aVenir.includes(a)).reverse();                 // les plus récents d'abord

      const sous = [brassage ? "Brassages" : "Plateaux", scores ? "avec les scores" : "sans score"].join(" ")
        + " · " + (nAvenir ? pl(nAvenir, "à venir", "à venir") : "rien à venir") + (nJoues ? " · " + pl(nJoues, "déjà joué") : "");
      const html = `<div class="ong-anim">
        ${ONG.aide("anim-aide", "Comment ça marche ?", AIDE)}
        <div class="ong-anim-choix">${boutonsEquipes(cat, auj)}</div>
        <div class="ong-anim-tete">${ONG.barre(e(cat), e(sous), `<span data-ong-anim="ajout"></span>`)}</div>
        <span data-ong-anim="anciennes"></span>
        ${l.length ? `${ONG.titre("À venir", aVenir.length)}
          ${aVenir.length ? `<div class="ong-anim-liste" data-ong-anim="avenir"></div>` : ONG.vide("Rien de prévu pour l'instant", "Ajoute le prochain rendez-vous dès que le district le publie.")}
          ${joues.length ? `${ONG.titre("Déjà joués", joues.length)}${scores ? `<p class="quoi ong-anim-mini">Pense à mettre les scores : touche un rendez-vous pour l'ouvrir.</p>` : ""}<div class="ong-anim-liste" data-ong-anim="joues"></div>` : ""}`
        : ONG.vide(`Aucun rendez-vous pour les ${e(cat)}`, "Ajoute les dates dès que le district les publie : elles partent toutes seules sur les affiches Foot animation.")}
      </div>`;
      const t = document.createElement("template"); t.innerHTML = html;
      const z = t.content;
      const place = (k, el) => { const p = z.querySelector(`[data-ong-anim="${k}"]`); if (!p) return; if (el) p.replaceWith(el); else p.remove(); };
      if (ajout){
        ajout.classList.add("ong-anim-ajout");
        place("ajout", ajout);
      } else place("ajout");
      place("anciennes", anciennes);
      const za = z.querySelector('[data-ong-anim="avenir"]'); if (za){ aVenir.forEach(a => za.appendChild(a)); za.removeAttribute("data-ong-anim"); }
      const zj = z.querySelector('[data-ong-anim="joues"]'); if (zj){ joues.forEach(a => zj.appendChild(a)); zj.removeAttribute("data-ong-anim"); }
      // on garde l'éventuel encart du haut de l'application (tout ce qui n'est pas l'onglet lui-même)
      racine.querySelectorAll(".an-onglets, .an-barre, .etat-vide, p.quoi").forEach(x => x.remove());
      while (racine.firstChild) racine.firstChild.remove();
      racine.appendChild(z);
    });
  };

  const css = document.createElement("style");
  css.id = "onglets-animation-css";
  const R = "body.sur-espace #panneau .ong-anim";
  css.textContent = `
${R} .ong-aide{margin-bottom:14px}
${R} .ong-anim-astuce{margin:10px 0 0;font-size:14px;color:#AFC0EA}
${R} .ong-anim-choix{border:1px solid rgba(143,168,240,.2);border-radius:18px;padding:6px 16px;background:linear-gradient(180deg,rgba(26,44,96,.35),rgba(14,26,60,.35));margin-bottom:22px}
${R} .ong-groupe{grid-template-columns:130px minmax(0,1fr)}
${R} .ong-groupe-l{font:800 17px var(--display);letter-spacing:.02em;text-transform:none;color:#fff;padding-top:8px;display:grid;gap:2px}
${R} .ong-groupe-l small{font:700 11.5px var(--corps);letter-spacing:.08em;text-transform:uppercase;color:#8FA3D6}
${R} .ong-anim-cat{display:grid;gap:2px;align-content:center;text-align:left;min-width:150px;min-height:58px;padding:8px 16px;border-radius:14px;border:1px solid rgba(143,168,240,.28);background:rgba(5,11,31,.35);color:var(--texte);cursor:pointer;font:inherit;transition:background .15s,border-color .15s}
${R} .ong-anim-cat:hover{border-color:rgba(143,168,240,.7);background:rgba(143,168,240,.1)}
${R} .ong-anim-cat b{font:800 17px var(--display);display:flex;align-items:center;gap:6px}
${R} .ong-anim-cat small{font-size:12.5px;color:#8FA3D6}
${R} .ong-anim-cat small.a-venir{color:#F3D48A;font-weight:700}
${R} .ong-anim-cat.on{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);border-color:#7FA6FF;color:#fff;box-shadow:0 8px 20px rgba(47,107,255,.35)}
${R} .ong-anim-cat.on small{color:#E2EAFF}
${R} .ong-anim-ok{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;background:#fff;color:#1C4FD6;font:900 11px var(--corps)}
${R} .ong-anim-tete{padding-top:4px}
${R} .ong-anim-tete .ong-barre h2{font-size:28px}
${R} .ong-anim-ajout{min-height:50px;font-size:16px;padding:12px 22px}
${R} .ong-titre{margin-top:22px}
${R} .ong-anim-mini{margin:-4px 0 10px;font-size:14px}
${R} .ong-anim-liste{display:grid;gap:12px}
${R} .ong-anim-liste>.an-carte{margin:0}
${R} .an-anciennes{margin:0 0 16px}
:root[data-theme="light"] ${R} .ong-anim-choix{background:var(--carte)}
:root[data-theme="light"] ${R} .ong-groupe-l{color:var(--texte)}
:root[data-theme="light"] ${R} .ong-groupe-l small,:root[data-theme="light"] ${R} .ong-anim-cat small{color:var(--texte-doux)}
:root[data-theme="light"] ${R} .ong-anim-cat{background:#fff;border-color:#C9D4F2}
:root[data-theme="light"] ${R} .ong-anim-cat small.a-venir{color:#9A6B00}
:root[data-theme="light"] ${R} .ong-anim-cat.on{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);color:#fff}
:root[data-theme="light"] ${R} .ong-anim-cat.on small{color:#E2EAFF}
:root[data-theme="light"] ${R} .ong-anim-astuce{color:var(--texte-doux)}
/* thème clair : champs de saisie, compteurs et boutons rouges lisibles (la règle sombre commune l'emporte sinon) */
:root[data-theme="light"] ${R} input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]):not([type=hidden]){background:#fff;border-color:#C9D4F2;color:var(--texte)}
:root[data-theme="light"] ${R} .ong-nb{background:rgba(28,79,214,.12);color:#1C4FD6}
:root[data-theme="light"] ${R} .btn.danger{color:#B91C1C;border-color:rgba(220,38,38,.55);background:rgba(220,38,38,.06)}
@media (max-width:700px){
  ${R} .ong-anim-choix{padding:4px 12px;margin-bottom:18px}
  ${R} .ong-groupe{grid-template-columns:minmax(0,1fr);gap:6px}
  ${R} .ong-groupe-l{display:flex;align-items:baseline;gap:8px;padding-top:0}
  ${R} .ong-anim-cat{flex:0 1 calc(50% - 4px);min-width:0;min-height:54px;padding:8px 12px}
  ${R} .ong-anim-tete .ong-barre h2{font-size:24px}
  ${R} .ong-anim-ajout{width:100%}
}`;
  document.head.appendChild(css);
})();
