/* Accueil de l'espace club (onglet « tableau ») : un vrai tableau de bord, rangé et facile à lire.
   - En haut (sous « Où veux-tu aller ? », ajouté par espace.js) : « En un coup d'œil », la date et combien de choses à faire.
   - Ordinateur : à gauche « Ce week-end » (tous les matchs, jour par jour, une ligne par match) ;
     à droite « À faire » (messages, compos, inscriptions, bénévoles) puis les notifications de l'appareil.
   - Téléphone : « À faire » d'abord (c'est court et c'est ce qu'il faut traiter), puis le week-end, la saison, les notifications.
   - En bas : « La saison » en quatre chiffres.
   On reprend tels quels les boutons rendus par l'application (data-a="onglet", "notif-test", "notif-etat") ;
   seule la liste du week-end est redessinée à partir des données (aucune action dedans).
   Ajouté sans modifier le script de l'application (on se branche sur panTableau). */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.panTableau !== "function" || typeof window.ONG === "undefined") return;
  const e = ONG.e;
  const majuscule = t => String(t || "").replace(/^./, c => c.toUpperCase());

  /* les matchs et plateaux du week-end, comme les calcule panTableau */
  function leWeekend(){
    const autor = equipesAutorisees();
    const permis = m => !autor.length || autor.includes(m.equipe) || autor.includes(eqDe(m));
    const k = (new Date().getDay() + 2) % 7, we = weekendScores(k <= 2 ? 0 : 1);
    const tri = (S.matchs || []).filter(permis).filter(m => we.jours.includes(m.date))
      .sort((a, b) => (a.date + (a.heure || "")).localeCompare(b.date + (b.heure || "")));
    const fal = (S.matchsAnimation || []).filter(m => /^pl-/.test(m.id) && we.jours.includes(m.date) && permis(m))
      .sort((a, b) => (a.heure || "").localeCompare(b.heure || ""));
    return { we, tri, fal, bureauSeul: autor.length && !peutBureau() };
  }

  /* une ligne : l'heure, l'équipe et l'adversaire, l'état à droite */
  function ligneMatch(m, auj){
    const c = (S.compos || []).find(x => x.equipe === m.equipe && x.date === m.date);
    let etat = "";
    if (joue(m)){
      const r = issue(m);
      etat = `<span class="ong-tb-score ${r === "V" ? "v" : r === "D" ? "d" : "n"}" title="${r === "V" ? "Victoire" : r === "D" ? "Défaite" : "Match nul"}">${e(m.bp)} – ${e(m.bc)}</span>`;
    } else if (!/^vet-/.test(m.id)){
      if (m.date < auj) etat = `<span class="ong-tb-puce gris">score en attente</span>`;
      else etat = c && c.publie ? `<span class="ong-tb-puce ok">compo publiée ✓</span>` : `<span class="ong-tb-puce or">compo à faire</span>`;
    }
    const adv = String(m.adv || "").replace(/\s+\d+$/, "");
    return `<div class="ong-tb-m"><span class="ong-tb-h">${e(hFr(m.heure) || "–")}</span>
      <span class="ong-tb-mt"><b>${e(eqDe(m))}</b><small>${m.dom ? "🏠 reçoit" : "✈️ chez"} ${e(adv)}${m.comp ? ` · ${e(m.comp)}` : ""}</small></span>${etat}</div>`;
  }
  const lignePlateau = m => `<div class="ong-tb-m"><span class="ong-tb-h">${e(hFr(m.heure) || "–")}</span>
    <span class="ong-tb-mt"><b>${e(m.equipe)}</b><small>${e(m.comp || "Plateau")} · ${m.dom ? "à domicile" : "chez " + e(m.adv || "")}</small></span>
    <span class="ong-tb-puce bleu">plateau</span></div>`;

  function blocWeekend(){
    const { we, tri, fal, bureauSeul } = leWeekend(), auj = aujourdhui();
    const jourL = d => majuscule(jd(d).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));
    const debut = jd(we.ven), fin = jd(we.dim);
    const sous = `Du vendredi ${debut.getDate()}${debut.getMonth() !== fin.getMonth() ? " " + MOIS[debut.getMonth()] : ""} au dimanche ${fin.getDate()} ${MOIS[fin.getMonth()]}`;
    const n = tri.length + fal.length;
    const jours = we.jours.map(d => {
      const ms = tri.filter(m => m.date === d), fs = fal.filter(m => m.date === d);
      if (!ms.length && !fs.length) return "";
      return `<div class="ong-tb-jour${d === auj ? " auj" : ""}"><div class="ong-tb-jour-t"><b>${e(jourL(d))}</b>${d === auj ? `<span class="ong-tb-auj">aujourd'hui</span>` : ""}<span class="ong-tb-jour-n">${ms.length + fs.length} match${ms.length + fs.length > 1 ? "s" : ""}</span></div>
        ${ms.map(m => ligneMatch(m, auj)).join("")}${fs.map(lignePlateau).join("")}</div>`;
    }).join("");
    return `<div class="ong-tb-zone ong-tb-we">${ONG.titre("Ce week-end", n || null)}<p class="ong-tb-sous">${e(sous)}</p>
      ${n ? `<div class="ong-tb-carte">${jours}</div>`
          : ONG.vide("Aucun match ce week-end" + (bureauSeul ? " pour tes équipes" : ""), "Les matchs du calendrier et les plateaux de foot animation apparaîtront ici.")}</div>`;
  }

  const avant = window.panTableau;
  window.panTableau = function(){
    const html = avant.apply(this, arguments);
    return ONG.transformer(html, frag => {
      const items = [...frag.querySelectorAll(".tb-afaire > .tb-item")];
      const notif = frag.querySelector(".tb-notif");
      const chiffres = frag.querySelector(".tb-chiffres");
      if (!chiffres) throw new Error("tableau : rendu inattendu");     // on garde l'affichage d'origine
      const n = items.length;
      const date = majuscule(new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" }));

      const racine = document.createElement("section");
      racine.className = "ong-tb";
      racine.setAttribute("aria-labelledby", "ong-tb-t");
      racine.innerHTML = `<div class="ong-tb-tete"><h2 id="ong-tb-t">En un coup d'œil</h2>
          <p>${e(date)} <span class="ong-tb-etat ${n ? "afaire" : "ok"}">${n ? `${n} chose${n > 1 ? "s" : ""} à faire` : "✓ tout est à jour"}</span></p></div>
        <div class="ong-tb-grille">
          <div class="ong-tb-zone ong-tb-af">${ONG.titre("À faire", n || null)}<div class="ong-tb-liste"></div></div>
          ${blocWeekend()}
          <div class="ong-tb-zone ong-tb-app"></div>
          <div class="ong-tb-zone ong-tb-saison">${ONG.titre("La saison")}</div>
        </div>`;
      const liste = racine.querySelector(".ong-tb-liste");
      if (n) items.forEach(b => { b.classList.add("ong-tb-item"); liste.appendChild(b); });
      else liste.outerHTML = `<div class="ong-tb-rien"><span aria-hidden="true">✅</span><div><b>Rien à traiter</b><small>Aucun message non lu, aucune compo ni demande en attente.</small></div></div>`;
      const app = racine.querySelector(".ong-tb-app");
      if (notif){
        // les deux boutons (Tester, Téléphones reliés) côte à côte sous le texte
        notif.classList.add("ong-tb-notif");
        const bts = document.createElement("div"); bts.className = "ong-tb-notif-bts";
        notif.querySelectorAll(":scope > .btn").forEach(b => bts.appendChild(b));
        if (bts.children.length) notif.appendChild(bts);
        app.appendChild(notif);
      } else app.remove();
      chiffres.classList.add("ong-tb-chiffres");
      racine.querySelector(".ong-tb-saison").appendChild(chiffres);

      while (frag.firstChild) frag.removeChild(frag.firstChild);
      frag.appendChild(racine);
    });
  };

  const css = document.createElement("style");
  css.id = "onglets-accueil-css";
  css.textContent = `
body.sur-espace #panneau .ong-tb{margin-top:4px}
/* en-tête : même style que « Où veux-tu aller ? » */
body.sur-espace #panneau .ong-tb-tete{margin:0 0 6px}
body.sur-espace #panneau .ong-tb-tete h2{font:900 30px var(--display);font-style:italic;text-transform:uppercase;letter-spacing:.3px;margin:0;display:flex;align-items:center;gap:12px}
body.sur-espace #panneau .ong-tb-tete h2::after{content:"";flex:1;height:2px;background:linear-gradient(90deg,rgba(227,182,76,.6),transparent)}
body.sur-espace #panneau .ong-tb-tete p{margin:8px 0 0;display:flex;align-items:center;flex-wrap:wrap;gap:10px;color:#C9D4F2;font:600 16px var(--corps)}
body.sur-espace #panneau .ong-tb-etat{font:800 13.5px var(--corps);padding:5px 12px;border-radius:999px}
body.sur-espace #panneau .ong-tb-etat.afaire{background:rgba(227,182,76,.18);color:#F3DFA2;border:1px solid rgba(227,182,76,.4)}
body.sur-espace #panneau .ong-tb-etat.ok{background:rgba(34,197,94,.14);color:#86EFAC;border:1px solid rgba(34,197,94,.35)}
/* la grille : week-end à gauche, à faire et l'appareil à droite */
body.sur-espace #panneau .ong-tb-grille{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);grid-template-areas:"we af" "we app" "saison saison";grid-template-rows:auto 1fr auto;gap:0 28px;align-items:start}
body.sur-espace #panneau .ong-tb-we{grid-area:we}
body.sur-espace #panneau .ong-tb-af{grid-area:af}
body.sur-espace #panneau .ong-tb-app{grid-area:app;padding-top:16px}
body.sur-espace #panneau .ong-tb-saison{grid-area:saison}
body.sur-espace #panneau .ong-tb-zone{min-width:0}
body.sur-espace #panneau .ong-tb .ong-titre{margin:26px 0 10px}
body.sur-espace #panneau .ong-tb-sous{margin:-4px 0 12px;color:#AFC0EA;font-size:14.5px}
/* À faire : une pile de raccourcis */
body.sur-espace #panneau .ong-tb-liste{display:grid;gap:10px}
body.sur-espace #panneau .ong-tb-item{width:100%;min-height:64px;padding:12px 14px;border-radius:16px;border:1px solid rgba(143,168,240,.2);border-left-width:5px;
  background:linear-gradient(180deg,rgba(26,44,96,.55),rgba(14,26,60,.55)),var(--carte);transition:border-color .15s,transform .12s}
body.sur-espace #panneau .ong-tb-item:hover{border-color:rgba(143,168,240,.55);transform:translateY(-1px)}
body.sur-espace #panneau .ong-tb-item.rouge{border-left-color:#E11D2E}
body.sur-espace #panneau .ong-tb-item.or{border-left-color:#E3B64C}
body.sur-espace #panneau .ong-tb-item:not(.rouge):not(.or){border-left-color:#4F7BFF}
body.sur-espace #panneau .ong-tb-item .tb-ico{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:22px;background:rgba(143,168,240,.12)}
body.sur-espace #panneau .ong-tb-item .tb-txt b{font:800 16.5px var(--corps)}
body.sur-espace #panneau .ong-tb-item .tb-txt small{color:#AFC0EA;font-size:14px}
body.sur-espace #panneau .ong-tb-item .tb-fl{font-size:26px;color:#AFC0EA}
body.sur-espace #panneau .ong-tb-rien{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;border:1px solid rgba(34,197,94,.3);background:rgba(34,197,94,.07)}
body.sur-espace #panneau .ong-tb-rien>span{font-size:24px}
body.sur-espace #panneau .ong-tb-rien div{display:grid;gap:2px}
body.sur-espace #panneau .ong-tb-rien b{font:800 16.5px var(--corps)}
body.sur-espace #panneau .ong-tb-rien small{color:#AFC0EA;font-size:14px;line-height:1.4}
/* Ce week-end : une carte, un bandeau par jour, une ligne par match */
body.sur-espace #panneau .ong-tb-carte{border-radius:20px;border:1px solid rgba(143,168,240,.2);overflow:hidden;
  background:linear-gradient(180deg,rgba(26,44,96,.55),rgba(14,26,60,.55)),var(--carte);box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 16px 36px rgba(3,8,24,.32)}
body.sur-espace #panneau .ong-tb-jour+.ong-tb-jour{border-top:1px solid rgba(143,168,240,.18)}
body.sur-espace #panneau .ong-tb-jour-t{display:flex;align-items:center;gap:10px;padding:10px 18px;background:rgba(143,168,240,.08)}
body.sur-espace #panneau .ong-tb-jour-t b{font:800 17px var(--display);color:#F3DFA2;letter-spacing:.2px}
body.sur-espace #panneau .ong-tb-auj{font:800 11.5px var(--corps);text-transform:uppercase;letter-spacing:.08em;padding:3px 9px;border-radius:999px;background:#E3B64C;color:#0B1633}
body.sur-espace #panneau .ong-tb-jour-n{margin-left:auto;font:700 13px var(--corps);color:#AFC0EA}
body.sur-espace #panneau .ong-tb-m{display:flex;align-items:center;gap:14px;padding:11px 18px;min-height:58px}
body.sur-espace #panneau .ong-tb-m+.ong-tb-m{border-top:1px solid rgba(143,168,240,.09)}
body.sur-espace #panneau .ong-tb-h{width:54px;flex:none;font:800 16px var(--display);color:#fff}
body.sur-espace #panneau .ong-tb-mt{flex:1;min-width:0;display:grid;gap:1px}
body.sur-espace #panneau .ong-tb-mt b{font:800 16px var(--corps)}
body.sur-espace #panneau .ong-tb-mt small{color:#AFC0EA;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.sur-espace #panneau .ong-tb-puce{flex:none;font:700 12.5px var(--corps);padding:5px 11px;border-radius:999px;white-space:nowrap;border:1px solid transparent}
body.sur-espace #panneau .ong-tb-puce.ok{background:rgba(34,197,94,.14);color:#86EFAC;border-color:rgba(34,197,94,.3)}
body.sur-espace #panneau .ong-tb-puce.or{background:rgba(227,182,76,.16);color:#F3DFA2;border-color:rgba(227,182,76,.4)}
body.sur-espace #panneau .ong-tb-puce.gris{background:rgba(143,168,240,.1);color:#AFC0EA;border-color:rgba(143,168,240,.22)}
body.sur-espace #panneau .ong-tb-puce.bleu{background:rgba(79,123,255,.16);color:#BFD0FF;border-color:rgba(79,123,255,.35)}
body.sur-espace #panneau .ong-tb-score{flex:none;min-width:64px;text-align:center;font:900 17px var(--display);padding:5px 10px;border-radius:10px;color:#fff;background:rgba(143,168,240,.16)}
body.sur-espace #panneau .ong-tb-score.v{background:rgba(34,197,94,.22);color:#86EFAC}
body.sur-espace #panneau .ong-tb-score.d{background:rgba(239,68,68,.2);color:#FCA5A5}
/* notifications de l'appareil : discret */
body.sur-espace #panneau .ong-tb-notif{margin:0;padding:14px 16px;border-radius:16px;border:1px dashed rgba(143,168,240,.3);background:rgba(10,20,48,.35);gap:10px 12px}
body.sur-espace #panneau .ong-tb-notif>div:not(.ong-tb-notif-bts){min-width:0;flex:1 1 180px}
body.sur-espace #panneau .ong-tb-notif b{font:800 15.5px var(--corps)}
body.sur-espace #panneau .ong-tb-notif small{color:#AFC0EA;font-size:14px;line-height:1.4}
body.sur-espace #panneau .ong-tb-notif>.ong-tb-notif-bts{flex:1 1 100%;min-width:0;display:flex;gap:10px;flex-wrap:wrap}
body.sur-espace #panneau .ong-tb-notif .ong-tb-notif-bts .btn{flex:1 1 140px;min-height:46px}
/* la saison : quatre chiffres */
body.sur-espace #panneau .ong-tb-chiffres>*{border-radius:18px;padding:16px 18px;border:1px solid rgba(143,168,240,.2);
  background:linear-gradient(180deg,rgba(26,44,96,.45),rgba(14,26,60,.45)),var(--carte);position:relative}
body.sur-espace #panneau .ong-tb-chiffres b{font:900 32px var(--display);line-height:1.05}
body.sur-espace #panneau .ong-tb-chiffres small{color:#AFC0EA;font-size:14.5px}
body.sur-espace #panneau .ong-tb-chiffres button:hover{border-color:rgba(143,168,240,.55)}
body.sur-espace #panneau .ong-tb-chiffres button::after{content:"›";position:absolute;right:16px;top:50%;transform:translateY(-50%);font-size:24px;color:#AFC0EA}
/* thème clair */
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-tete p,:root[data-theme="light"] body.sur-espace #panneau .ong-tb-sous,
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-item .tb-txt small,:root[data-theme="light"] body.sur-espace #panneau .ong-tb-item .tb-fl,
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-rien small,:root[data-theme="light"] body.sur-espace #panneau .ong-tb-jour-n,
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-mt small,:root[data-theme="light"] body.sur-espace #panneau .ong-tb-notif small,
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-chiffres small,:root[data-theme="light"] body.sur-espace #panneau .ong-tb-chiffres button::after{color:var(--texte-doux)}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-item,:root[data-theme="light"] body.sur-espace #panneau .ong-tb-carte,
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-chiffres>*{background:var(--carte);border-color:var(--ligne);box-shadow:0 10px 26px rgba(7,18,48,.08)}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-item.rouge{border-left-color:#E11D2E}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-item.or{border-left-color:#E3B64C}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-item:not(.rouge):not(.or){border-left-color:#4F7BFF}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-notif{background:transparent;border-color:var(--ligne)}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-jour-t{background:#EEF2FB}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-jour-t b{color:#8A6400}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-jour+.ong-tb-jour,:root[data-theme="light"] body.sur-espace #panneau .ong-tb-m+.ong-tb-m{border-color:var(--ligne)}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-h,:root[data-theme="light"] body.sur-espace #panneau .ong-tb .ong-nb{color:var(--texte)}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-etat.afaire,:root[data-theme="light"] body.sur-espace #panneau .ong-tb-puce.or{color:#7A5B00}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-etat.ok,:root[data-theme="light"] body.sur-espace #panneau .ong-tb-puce.ok,
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-score.v{color:#15803D}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-score.d{color:#B91C1C}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-score{color:var(--texte)}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-puce.gris{color:var(--texte-doux)}
:root[data-theme="light"] body.sur-espace #panneau .ong-tb-puce.bleu{color:#1C4FD6}
/* téléphone : tout en une colonne, « À faire » d'abord */
@media (max-width:900px){
  body.sur-espace #panneau .ong-tb-grille{grid-template-columns:minmax(0,1fr);grid-template-areas:"af" "we" "saison" "app";grid-template-rows:auto}
  body.sur-espace #panneau .ong-tb-app{padding-top:22px}
}
@media (max-width:700px){
  body.sur-espace #panneau .ong-tb-tete h2{font-size:24px}
  body.sur-espace #panneau .ong-tb-jour-t{padding:10px 14px}
  body.sur-espace #panneau .ong-tb-m{padding:10px 14px;gap:10px}
  body.sur-espace #panneau .ong-tb-h{width:44px;font-size:15px}
  body.sur-espace #panneau .ong-tb-mt small{white-space:normal;overflow:visible}
  body.sur-espace #panneau .ong-tb-puce{font-size:12px;padding:4px 9px}
  body.sur-espace #panneau .ong-tb-chiffres{grid-template-columns:1fr 1fr}
  body.sur-espace #panneau .ong-tb-chiffres b{font-size:28px}
  body.sur-espace #panneau .ong-tb-chiffres>*{padding:14px}
  body.sur-espace #panneau .ong-tb-chiffres button::after{top:18px;transform:none;right:12px}
}`;
  document.head.appendChild(css);
})();
