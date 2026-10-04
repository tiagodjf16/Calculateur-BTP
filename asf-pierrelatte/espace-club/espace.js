/* Espace dirigeants : plus simple à prendre en main.
   - Accueil : « Où veux-tu aller ? », toutes les rubriques et leurs onglets en grandes tuiles, avec une phrase pour chacun.
   - Chaque page : un bouton « Accueil » dans l'en-tête, et sous les onglets une phrase qui dit à quoi sert l'onglet ouvert.
   - Changer d'onglet ramène en haut de la page.
   Ajouté sans modifier le script de l'application (on se branche sur panTableau et rendreEspace). */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.rendreEspace !== "function" || typeof RUBRIQUES === "undefined") return;
  const icone = k => (typeof ICONES !== "undefined" && ICONES[k]) ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONES[k]}" stroke-linecap="round" stroke-linejoin="round"/></svg>` : "";
  const desc = k => ((typeof ONGLETS !== "undefined" ? ONGLETS : []).find(o => o[0] === k) || [])[4] || "";
  const badge = k => { try { return typeof badgeOnglet === "function" ? badgeOnglet(k) : ""; } catch(err){ return ""; } };
  const nom = k => { try { return typeof nomOnglet === "function" ? nomOnglet(k) : k; } catch(err){ return k; } };

  /* Accueil : les raccourcis vers tous les onglets du compte, rangés par rubrique */
  function raccourcis(){
    let rubs = [];
    try { rubs = rubriquesVisibles(ongletsVisibles()).filter(r => r[0] !== "accueil"); } catch(err){ return ""; }
    if (!rubs.length) return "";
    return `<section class="esp-lanceur" aria-labelledby="esp-lanceur-t">
      <h2 id="esp-lanceur-t">Où veux-tu aller ?</h2>
      <div class="esp-rubs">${rubs.map(([k, l, ico, tabs]) => `<div class="esp-rub">
        <div class="esp-rub-t"><span class="esp-rub-ico" aria-hidden="true">${ico}</span><b>${esc(l)}</b></div>
        <div class="esp-tuiles">${tabs.map(t => `<button type="button" class="esp-tuile" data-a="onglet" data-k="${esc(t)}">
          <span class="esp-tuile-ico">${icone(t)}</span><span class="esp-tuile-txt"><b>${esc(nom(t))}${badge(t)}</b><small>${esc(desc(t))}</small></span><span class="esp-fl" aria-hidden="true">›</span></button>`).join("")}</div>
      </div>`).join("")}</div>
    </section>`;
  }
  if (typeof window.panTableau === "function"){
    const avant = window.panTableau;
    window.panTableau = function(){ return raccourcis() + avant.apply(this, arguments); };
  }

  /* chaque page : « Accueil » dans l'en-tête, et à quoi sert l'onglet ouvert */
  function habiller(){
    const z = document.getElementById("espace"); if (!z) return;
    const tete = z.querySelector(".app-tete"); if (!tete) return;
    if (S.ui.onglet !== "tableau" && !tete.querySelector(".esp-accueil"))
      tete.insertAdjacentHTML("beforeend", `<button type="button" class="btn contour petit esp-accueil" data-a="onglet" data-k="tableau">🏠 Accueil</button>`);
    const ongs = z.querySelector(".rub-onglets");
    if (ongs && !z.querySelector(".esp-aide")){
      const d = desc(S.ui.onglet);
      if (d) ongs.insertAdjacentHTML("afterend", `<p class="esp-aide">${esc(d)}</p>`);
    }
    const actif = ongs && ongs.querySelector('[aria-selected="true"]');
    if (actif) try { actif.scrollIntoView({ block: "nearest", inline: "center" }); } catch(err){}
  }
  const espaceAvant = window.rendreEspace;
  window.rendreEspace = function(){
    const r = espaceAvant.apply(this, arguments);
    try { habiller(); } catch(err){}
    return r;
  };
  // changer d'onglet : on repart du haut de la page
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest('#espace [data-a="onglet"], #espace [data-a="rubrique"], #drawer-contenu [data-a="onglet"], #drawer-contenu [data-a="rubrique"]');
    if (b && b.dataset.k !== S.ui.onglet) setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 0);
  }, true);

  const css = document.createElement("style");
  css.id = "espace-css";
  css.textContent = `
/* ---------- Accueil : où veux-tu aller ? ---------- */
.esp-lanceur{margin:0 0 26px}
.esp-lanceur h2{font:800 24px var(--display);margin:0 0 12px}
.esp-rubs{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
.esp-rub{background:var(--carte);border:1px solid var(--ligne);border-radius:18px;padding:14px;display:grid;gap:10px;align-content:start;box-shadow:0 10px 26px rgba(7,18,48,.12)}
.esp-rub-t{display:flex;align-items:center;gap:10px;font:800 18px var(--display);letter-spacing:.2px}
.esp-rub-ico{width:36px;height:36px;border-radius:12px;display:grid;place-items:center;font-size:19px;background:rgba(143,168,240,.14)}
.esp-tuiles{display:grid;gap:6px}
.esp-tuile{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:1px solid transparent;background:rgba(143,168,240,.07);color:var(--texte);
  border-radius:12px;padding:10px 12px;min-height:56px;cursor:pointer;transition:background .15s,border-color .15s,transform .1s}
.esp-tuile:hover{background:rgba(143,168,240,.16);border-color:var(--ligne)}
.esp-tuile:active{transform:scale(.99)}
.esp-tuile:focus-visible{outline:3px solid var(--bleu-texte,#8FC2FF);outline-offset:2px}
.esp-tuile-ico{width:34px;height:34px;flex:none;border-radius:10px;display:grid;place-items:center;background:var(--bleu);color:#fff}
.esp-tuile-ico svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.9}
.esp-tuile-txt{flex:1;min-width:0;display:grid;gap:2px}
.esp-tuile-txt b{font:700 16px var(--corps);display:flex;align-items:center;gap:8px}
.esp-tuile-txt small{font:500 13px var(--corps);color:var(--texte-doux);line-height:1.35}
.esp-fl{font:700 22px var(--corps);color:var(--texte-doux);flex:none}
/* ---------- en-tête de chaque page ---------- */
body.sur-espace .app-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
body.sur-espace .app-tete h1{display:flex;align-items:center;gap:10px}
.esp-accueil{flex:none;align-self:center;min-height:42px}
.esp-aide{margin:-6px 0 18px;padding:10px 14px;border-radius:12px;background:rgba(143,168,240,.08);color:var(--texte-doux);font:500 14.5px var(--corps);border:1px solid var(--ligne)}
.esp-aide::before{content:"💡 "}
/* ---------- onglets de la rubrique : grands, faciles à toucher, toujours visibles ---------- */
body.sur-espace .rub-onglets{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 0 14px;padding:6px;
  background:var(--carte);border:1px solid var(--ligne);border-radius:16px}
body.sur-espace .rub-onglets::-webkit-scrollbar{display:none}
body.sur-espace .rub-onglets button{flex:none;min-height:44px;padding:10px 16px;border-radius:11px;border:0;background:none;color:var(--texte);
  font:700 15px var(--corps);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;gap:8px;transition:background .15s}
body.sur-espace .rub-onglets button:hover{background:rgba(143,168,240,.14)}
body.sur-espace .rub-onglets button[aria-selected="true"]{background:var(--bleu);color:#fff;box-shadow:0 6px 16px rgba(28,63,158,.3)}
/* ---------- partout : cadres, boutons et champs réguliers ---------- */
body.sur-espace #panneau .carte{border-radius:18px}
body.sur-espace #panneau .btn{min-height:44px;display:inline-flex;align-items:center;justify-content:center;gap:6px}
body.sur-espace #panneau .btn.petit{min-height:38px}
body.sur-espace #panneau input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]),
body.sur-espace #panneau select,body.sur-espace #panneau textarea{border-radius:10px;min-height:44px}
body.sur-espace #panneau input:focus-visible,body.sur-espace #panneau select:focus-visible,body.sur-espace #panneau textarea:focus-visible{
  outline:3px solid rgba(143,168,240,.45);outline-offset:1px;border-color:var(--bleu-texte,#8FC2FF)}
body.sur-espace #panneau label{font-weight:600}
body.sur-espace #panneau table{border-collapse:separate;border-spacing:0}
body.sur-espace #panneau tbody tr:nth-child(even) td{background:rgba(143,168,240,.05)}
@media (max-width:1140px){
  body.sur-espace .rub-onglets{position:sticky;top:60px;z-index:6;box-shadow:0 10px 22px rgba(7,18,48,.18)}
  body.sur-espace .app-tete{margin-bottom:12px}
  body.sur-espace .app-tete h1{font-size:28px}
  body.sur-espace .app-tete p{font-size:14.5px;margin-top:4px}
}
@media (max-width:620px){
  .esp-rubs{grid-template-columns:minmax(0,1fr)}
  .esp-lanceur h2{font-size:21px}
  .esp-accueil{padding:8px 12px}
  body.sur-espace .app-tete h1{font-size:25px}
  body.sur-espace .rub-onglets button{padding:10px 13px;font-size:14.5px}
  body.sur-espace #panneau .carte{padding:16px}
}`;
  document.head.appendChild(css);
  // l'espace est peut-être déjà affiché : on l'habille tout de suite
  if (document.getElementById("panneau")) setTimeout(() => { try { if (S.ui.onglet === "tableau") rendrePanneau(); habiller(); } catch(err){} }, 0);
})();
