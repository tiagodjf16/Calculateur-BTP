/* Briques communes pour ranger l'intérieur des onglets de l'espace club, toutes pareilles d'un onglet à l'autre.
   - ONG.transformer(html, fn) : retravaille le HTML rendu par l'application (fn reçoit un fragment), renvoie le HTML.
   - ONG.barre(titre, sousTitre, actionsHtml) : en tête d'onglet, ce qu'on regarde à gauche et l'action principale à droite.
   - ONG.titre(texte, nb) : titre de section, avec un compteur.
   - ONG.aide(cle, titre, html) : « 💡 Comment ça marche ? » replié (l'état ouvert/fermé est retenu).
   - ONG.pli(cle, titre, html, ouvertParDefaut, icone) : bloc dépliant (formulaire de création, réglages rares…), état retenu.
   - ONG.ouvert(cle, defaut) : l'état retenu d'un bloc (pour ceux qui fabriquent leur propre <details data-ong-pli>).
   - ONG.vide(titre, texte, actionHtml) : liste vide.
   - ONG.groupe(libelle, html) : un groupe de pastilles ou de boutons avec son libellé.
   Mêmes places partout : « 💡 Comment ça marche ? » en premier sous les onglets, puis la barre (titre + action principale).
   Classe « ong-archive » sur un ONG.pli : le bloc replié des éléments passés (compos, stages, créneaux…), plus discret.
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined") return;
  const e = s => typeof esc === "function" ? esc(s) : String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const etats = () => (S.ui.ongPli = S.ui.ongPli || {});
  const ouvert = (cle, defaut) => { const v = etats()[cle]; return v == null ? !!defaut : !!v; };
  window.ONG = {
    e,
    ouvert,
    transformer(html, fn){
      const t = document.createElement("template"); t.innerHTML = html;
      try { fn(t.content); } catch(err){ if (window.console) console.warn("ONG.transformer", err); return html; }
      return t.innerHTML;
    },
    barre: (titre, sous, actions) => `<div class="ong-barre"><div class="ong-barre-txt"><h2>${titre}</h2>${sous ? `<p>${sous}</p>` : ""}</div>${actions ? `<div class="ong-barre-act">${actions}</div>` : ""}</div>`,
    titre: (t, nb) => `<h3 class="ong-titre">${t}${nb != null ? `<span class="ong-nb">${nb}</span>` : ""}</h3>`,
    aide: (cle, titre, html) => `<details class="ong-aide" data-ong-pli="${e(cle)}" ${ouvert(cle, false) ? "open" : ""}><summary><span aria-hidden="true">💡</span>${titre || "Comment ça marche ?"}</summary><div class="ong-aide-corps">${html}</div></details>`,
    pli: (cle, titre, html, defaut, icone) => `<details class="pli ong-pli" data-ong-pli="${e(cle)}" ${ouvert(cle, defaut) ? "open" : ""}><summary><span class="plus" aria-hidden="true">${icone || "+"}</span><span class="ong-pli-t">${titre}</span><span class="ong-pli-fl" aria-hidden="true">▾</span></summary><div class="pli-corps">${html}</div></details>`,
    vide: (titre, texte, action) => `<div class="ong-vide"><b>${titre}</b>${texte ? `<span>${texte}</span>` : ""}${action ? `<div class="ong-vide-act">${action}</div>` : ""}</div>`,
    groupe: (libelle, html) => `<div class="ong-groupe"><span class="ong-groupe-l">${libelle}</span><div class="ong-groupe-c">${html}</div></div>`,
  };
  // les blocs dépliants retiennent leur état d'un affichage à l'autre (l'application redessine souvent l'onglet)
  document.addEventListener("toggle", ev => {
    const d = ev.target; if (!d || !d.matches || !d.matches("details[data-ong-pli]")) return;
    etats()[d.dataset.ongPli] = d.open;
  }, true);

  const css = document.createElement("style");
  css.id = "ong-commun-css";
  css.textContent = `
/* barre du haut d'un onglet : quoi à gauche, action principale à droite */
body.sur-espace .ong-barre{display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:0 0 16px}
body.sur-espace .ong-barre-txt{min-width:0}
body.sur-espace .ong-barre h2{font:800 26px var(--display);margin:0;letter-spacing:.2px}
body.sur-espace .ong-barre p{margin:4px 0 0;color:#AFC0EA;font-size:15px}
body.sur-espace .ong-barre-act{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
/* l'action principale de la barre : la même taille dans tous les onglets */
body.sur-espace #panneau .ong-barre-act>.btn.bleu{min-height:50px;font-size:16px;padding:12px 22px}
/* titre de section avec compteur */
body.sur-espace .ong-titre{display:flex;align-items:center;gap:10px;font:800 21px var(--display);margin:28px 0 12px}
body.sur-espace .ong-titre::before{content:"";width:6px;height:22px;border-radius:3px;background:linear-gradient(180deg,#F7D774,#C9A227);flex:none}
body.sur-espace .ong-nb{font:800 13px var(--corps);min-width:26px;height:26px;padding:0 8px;border-radius:999px;display:inline-grid;place-items:center;background:rgba(143,168,240,.18);color:#DCE5FF}
/* aide repliée */
body.sur-espace .ong-aide{margin:0 0 16px;border:1px solid rgba(227,182,76,.3);border-radius:14px;background:rgba(227,182,76,.06)}
body.sur-espace .ong-aide>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 16px;font:700 15px var(--corps);color:#F3DFA2;min-height:46px}
body.sur-espace .ong-aide>summary::-webkit-details-marker{display:none}
body.sur-espace .ong-aide>summary::after{content:"▾";margin-left:auto;transition:transform .2s;opacity:.8}
body.sur-espace .ong-aide[open]>summary::after{transform:rotate(180deg)}
body.sur-espace .ong-aide-corps{padding:0 18px 14px;color:#D5DEFA;font-size:15px;line-height:1.55}
body.sur-espace .ong-aide-corps ol,body.sur-espace .ong-aide-corps ul{margin:4px 0 0 20px;padding:0;display:grid;gap:6px}
/* bloc dépliant (formulaires de création, réglages rares) */
body.sur-espace .ong-pli>summary{gap:12px}
body.sur-espace .ong-pli-t{flex:1;min-width:0}
body.sur-espace .ong-pli-fl{opacity:.7;transition:transform .2s}
body.sur-espace .ong-pli[open]>summary .ong-pli-fl{transform:rotate(180deg)}
body.sur-espace .ong-pli[open]>summary .plus{transform:none}
/* le « + » des blocs dépliants : la règle générale .plus du site (bouton flottant du téléphone) le mettait en position fixe en bas à gauche, ou le cachait */
body.sur-espace .pli>summary .plus{position:static!important;display:grid!important;inset:auto!important;width:30px;height:30px;padding:0;margin:0;border:0;box-shadow:none;z-index:auto;flex:none}
body.sur-espace .ong-pli>summary{font-size:21px}
/* bloc replié des éléments passés : plus discret, le même dans tous les onglets */
body.sur-espace #panneau details.ong-pli.ong-archive{box-shadow:none;background:rgba(10,20,48,.35)}
body.sur-espace #panneau details.ong-pli.ong-archive>summary{font:800 18px var(--display);padding:12px 18px;min-height:52px}
body.sur-espace #panneau details.ong-pli.ong-archive>summary .plus{width:30px;height:30px;font-size:16px;border-radius:10px;background:rgba(143,168,240,.18);color:#DCE5FF;box-shadow:none}
/* liste vide */
body.sur-espace .ong-vide{display:grid;justify-items:center;gap:6px;text-align:center;padding:30px 20px;border:1.5px dashed rgba(143,168,240,.3);border-radius:18px;background:rgba(10,20,48,.4);color:#AFC0EA}
body.sur-espace .ong-vide b{font:800 20px var(--display);color:#fff}
body.sur-espace .ong-vide span{max-width:460px;line-height:1.5}
body.sur-espace .ong-vide-act{margin-top:8px}
/* groupe de pastilles avec libellé */
body.sur-espace .ong-groupe{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;align-items:start;padding:10px 0;border-top:1px solid rgba(143,168,240,.12)}
body.sur-espace .ong-groupe:first-child{border-top:0}
body.sur-espace .ong-groupe-l{font:800 12px var(--corps);letter-spacing:.12em;text-transform:uppercase;color:#AFC0EA;padding-top:12px}
body.sur-espace .ong-groupe-c{display:flex;flex-wrap:wrap;gap:8px}
:root[data-theme="light"] body.sur-espace .ong-barre p,:root[data-theme="light"] body.sur-espace .ong-groupe-l{color:var(--texte-doux)}
:root[data-theme="light"] body.sur-espace .ong-vide b{color:var(--texte)}
:root[data-theme="light"] body.sur-espace .ong-nb{background:rgba(28,63,158,.12);color:var(--texte)}
:root[data-theme="light"] body.sur-espace .ong-aide-corps{color:var(--texte)}
:root[data-theme="light"] body.sur-espace .ong-aide>summary{color:#7A5B00}
:root[data-theme="light"] body.sur-espace #panneau details.ong-pli.ong-archive{background:var(--carte)}
:root[data-theme="light"] body.sur-espace #panneau details.ong-pli.ong-archive>summary .plus{background:rgba(28,79,214,.12);color:#1C4FD6}
@media (max-width:700px){
  body.sur-espace .ong-barre{align-items:stretch}
  body.sur-espace .ong-barre-act{width:100%}
  body.sur-espace .ong-barre-act>.btn{flex:1}
  body.sur-espace .ong-groupe{grid-template-columns:minmax(0,1fr);gap:6px}
  body.sur-espace .ong-groupe-l{padding-top:0}
  body.sur-espace .ong-pli>summary{font-size:19px}
  body.sur-espace .ong-barre h2{font-size:24px}
}`;
  document.head.appendChild(css);
})();
