/* Onglet Communication › Affiches, rangé dans l'ordre de ce qu'on vient y faire :
   1. « Comment ça marche ? » replié tout en haut ;
   2. les affiches de la semaine (elles partent toutes seules : les résultats le lundi à 9 h, les rencontres le mercredi à 9 h),
      avec une barre d'outils rangée
      (quelle semaine, quel format d'aperçu, actualiser) ;
   3. « Publier maintenant » (si une publication automatique n'a pas marché) : bloc dépliant ;
   4. « Publier une photo ou une vidéo » (une affiche faite à la main, des photos, des vidéos) : bloc dépliant ;
   5. les réglages Facebook et Instagram : bloc dépliant, fermé.
   On reprend les morceaux dessinés par l'application (mêmes éléments, mêmes data-a, id et name) et on les range autrement :
   rien ne change dans la publication. Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.panAffiches !== "function" || typeof ONG === "undefined") return;

  const AIDE = `<ol>
      <li>Le club publie tout seul sur Facebook et Instagram : <b>le lundi à 9 h</b> les résultats du week-end passé, <b>le mercredi à 9 h</b> les rencontres du week-end qui arrive. Tu n'as rien à faire.</li>
      <li>Regarde-les juste en dessous. Touche une affiche pour la voir en grand, copier son texte ou la télécharger (pour TikTok par exemple).</li>
      <li>Une publication du lundi ou du mercredi n'a pas marché, ou tu veux republier ? Ouvre <b>« Publier maintenant »</b>.</li>
      <li>Une photo, une vidéo ou une affiche faite par toi ? Ouvre <b>« Publier une photo ou une vidéo »</b>.</li>
    </ol>
    <p class="ong-aff-astuce">Une affiche de stage, de loto ou de tournoi ? Va dans l'onglet <button type="button" class="ong-aff-lien" data-ev-a="aller">Événements</button>.</p>`;

  /* titre d'un bloc dépliant : le nom en gras, une phrase courte dessous */
  const tete = (titre, sous) => `<b>${titre}</b><small>${sous}</small>`;

  /* « Affiches de la semaine » : le titre (qui replie la bande), puis une barre d'outils rangée par thème */
  function rangerSemaine(carte){
    const t = carte.querySelector(".as-tete"); if (!t) return;
    carte.classList.add("ong-aff-sem");
    const sem = t.querySelector(".as-semaine"), outils = t.querySelector(".as-outils");
    if (!sem && !outils) return;                                         // bande repliée : le titre seul
    const barre = document.createElement("div");
    barre.className = "ong-aff-outils";
    if (sem){
      const g = document.createElement("div"); g.className = "ong-aff-og";
      g.innerHTML = `<span class="ong-aff-ol">Semaine</span>`;
      g.appendChild(sem); barre.appendChild(g);
    }
    if (outils){
      const maj = outils.querySelector('[data-a="aff-sem-maj"]');
      const g = document.createElement("div"); g.className = "ong-aff-og";
      g.innerHTML = `<span class="ong-aff-ol">Voir au format</span>`;
      outils.querySelectorAll('[data-a="aff-sem-fmt"]').forEach(b => { b.title = b.dataset.k === "fb" ? "Publication Facebook" : b.dataset.k === "carre" ? "Publication Instagram" : "Story (Facebook et Instagram)"; });
      g.appendChild(outils); barre.appendChild(g);
      if (maj){
        maj.classList.add("ong-aff-maj");
        maj.innerHTML = `<span aria-hidden="true">↻</span><span class="ong-aff-maj-t"> Actualiser</span>`;
        maj.setAttribute("aria-label", "Actualiser les affiches");
        maj.title = "Redemander les affiches au serveur";
        barre.appendChild(maj);
      }
    }
    t.after(barre);
    const note = carte.querySelector(".as-note");
    if (note) note.innerHTML = `<span class="ong-aff-leg">🏠 domicile · ✈️ extérieur</span><span>Touche une affiche pour la voir en grand, copier son texte ou la télécharger. Une feuille « aucun match » n'est pas publiée.</span>`;
  }

  /* « Publier maintenant » : sans son titre (il est sur le bloc), « Publication » dit « Annonce » comme partout ailleurs */
  function corpsPublierSemaine(carte){
    const tt = carte.querySelector(".af-tete"); if (tt) tt.remove();
    carte.querySelectorAll("[data-ps-opt]").forEach(i => {
      if (!/_pub$/.test(i.dataset.psOpt)) return;
      const l = i.closest("label");
      [...l.childNodes].forEach(n => { if (n.nodeType === 3 && /Publication/.test(n.nodeValue)) n.nodeValue = n.nodeValue.replace("Publication", "Annonce"); });
    });
    const go = carte.querySelector('[data-a="ps-publier"]');
    if (go){
      const aide = document.createElement("small"); aide.className = "ong-aff-mini";
      aide.textContent = "Annonce : dans le fil de la page · Story : visible 24 h.";
      const reseaux = [...carte.querySelectorAll(".ps-reseau")].pop();
      if (reseaux) reseaux.after(aide);
    }
    const div = document.createElement("div"); div.className = "ong-aff-ps";
    while (carte.firstChild) div.appendChild(carte.firstChild);
    return div;
  }

  /* « Publier une photo ou une vidéo » : 1. les fichiers, 2. le message, 3. où publier, puis le bouton */
  function corpsPhoto(carte){
    const g = carte.querySelector(".ap-grille");
    const img = g.querySelector(".ap-image"), txt = g.querySelector(".ap-texte");
    const lab = (n, l) => { const b = document.createElement("b"); b.className = "ps-lab"; b.textContent = n + ". " + l; return b; };
    img.prepend(lab(1, "Tes photos ou vidéos"));
    const depot = img.querySelector(".ap-depot");
    if (depot){                                                         // le texte du dépôt, sans majuscules partout
      const b = depot.querySelector("b"), s = depot.querySelector("small");
      if (b) b.textContent = "Choisir des photos ou des vidéos";
      if (s) s.innerHTML = `Une ou plusieurs · JPEG, PNG ou MP4<span class="ong-aff-glisse"> · tu peux aussi les glisser ici</span>`;
    }
    // le message : son libellé devient l'étape 2
    const ta = txt.querySelector("#ap-texte"), lm = ta && ta.closest("label");
    if (lm) [...lm.childNodes].forEach(n => { if (n.nodeType === 3 && n.nodeValue.trim() === "Message") n.nodeValue = "2. Le message"; });
    // où publier : les deux rangées (réseaux, format) dans un seul cadre
    const blocs = [...txt.querySelectorAll(".ap-bloc")];
    if (blocs.length === 2){
      const cadre = document.createElement("div"); cadre.className = "ap-bloc ong-aff-ou";
      cadre.appendChild(lab(3, "Où publier"));
      const ligne = (titre, bloc) => {
        const r = document.createElement("div"); r.className = "ong-aff-ligne";
        r.innerHTML = `<span class="ong-aff-ol">${titre}</span>`;
        const l = bloc.querySelector(".af-choix-l"); if (l) r.appendChild(l);
        return r;
      };
      cadre.appendChild(ligne("Sur", blocs[0]));
      cadre.appendChild(ligne("En", blocs[1]));
      const aide = blocs[1].querySelector(".ap-aide"); if (aide){ aide.textContent = "Annonce : dans le fil de la page · Story : visible 24 h. Tu peux cocher les deux."; cadre.appendChild(aide); }
      blocs[0].replaceWith(cadre); blocs[1].remove();
    }
    const go = txt.querySelector('[data-a="aff-prete-publier"]');
    if (go && go.disabled){                                             // pas encore de fichier : on dit pourquoi le bouton est grisé
      const m = document.createElement("small"); m.className = "ong-aff-mini ong-aff-attente";
      m.textContent = "Choisis d'abord une photo ou une vidéo (étape 1).";
      go.after(m);
    }
    const div = document.createElement("div"); div.className = "ong-aff-photo";
    div.appendChild(g);
    return div;
  }

  const REGLAGES = `<p class="ong-aff-reg-txt">La page Facebook reliée, le compte Instagram, la pause des publications automatiques et l'envoi d'un test se règlent sur une page à part.</p>
    <div class="btns ong-aff-reg-btns"><a class="btn contour" href="/api/facebook.php" target="_blank" rel="noopener">⚙️ Ouvrir les réglages Facebook et Instagram</a></div>`;

  /* « Publier maintenant » : cochée d'office, l'annonce du jour qu'on rattrape (les résultats partent le lundi à 9 h, les rencontres
     le mercredi à 9 h). L'application cochait les deux : rattraper le lundi aurait aussi publié les rencontres avant le mercredi.
     (Le serveur note ce qui part à la main : le lundi ou le mercredi ne le republie pas.) */
  function choixDuJour(){
    if (S.ui.pubSem) return;
    const d = new Date(), j = d.getDay();                                // 0 dimanche … 6 samedi
    const resultats = j === 1 || j === 2 || (j === 3 && d.getHours() < 9);
    S.ui.pubSem = { annonces: [resultats ? "resultats" : "rencontres"], fb_pub: true, fb_story: false, ig_pub: true, ig_story: false };
  }

  const avant = window.panAffiches;
  window.panAffiches = function(){
    if (S.heberge) try { choixDuJour(); } catch(err){}
    const h = avant.apply(this, arguments);
    if (!S.heberge) return h;                                           // fichier ouvert hors ligne : l'ancien outil, pas touché
    return ONG.transformer(h, racine => {
      const g = racine.querySelector(".ap-grille"), photo = g && g.closest(".carte");
      const sem = racine.querySelector(".as-carte"), ps = racine.querySelector(".ps-carte");
      if (!photo || !sem || !ps) throw new Error("onglet Affiches : morceaux introuvables");   // ONG.transformer garde alors l'affichage d'origine
      const u = S.ui.affPrete || {}, c = S.ui.pubSem || {};
      rangerSemaine(sem);
      const html = `<div class="ong-aff">
        ${ONG.aide("aff-aide", "Comment ça marche ?", AIDE)}
        <span data-ong-aff="semaine"></span>
        ${ONG.pli("aff-publier", tete("Publier maintenant", "Si la publication du lundi ou du mercredi n'a pas marché, ou pour republier"), `<span data-ong-aff="ps"></span>`, !!c.etat, "📣")}
        ${ONG.pli("aff-photo", tete("Publier une photo ou une vidéo", "Ton affiche, tes photos ou tes vidéos, tout de suite sur Facebook et Instagram"), `<span data-ong-aff="photo"></span>`, !!((u.fichiers && u.fichiers.length) || u.etat), "🖼️")}
        ${ONG.pli("aff-reglages", tete("Réglages Facebook et Instagram", "Page reliée, compte Instagram, pause, test"), REGLAGES, false, "⚙️")}
      </div>`;
      const t = document.createElement("template"); t.innerHTML = html;
      const z = t.content;
      const place = (k, el) => { const p = z.querySelector(`[data-ong-aff="${k}"]`); if (p) p.replaceWith(el); };
      place("semaine", sem);
      place("ps", corpsPublierSemaine(ps));
      place("photo", corpsPhoto(photo));
      z.querySelectorAll(".ong-pli").forEach(d => d.classList.add("ong-aff-pli"));
      // l'icône du bloc : la classe « plus » est aussi celle du menu « Plus » de l'application (cachée, fixée en bas de l'écran)
      z.querySelectorAll(".ong-aff-pli>summary>.plus").forEach(i => { i.className = "ong-aff-ico"; });
      while (racine.firstChild) racine.firstChild.remove();
      racine.appendChild(z);
    });
  };

  const css = document.createElement("style");
  css.id = "onglets-affiches-css";
  const R = "body.sur-espace #panneau .ong-aff";
  css.textContent = `
${R} .ong-aide{margin-bottom:16px}
${R} .ong-aff-astuce{margin:10px 0 0;font-size:14.5px}
${R} .ong-aff-lien{background:none;border:0;padding:0;font:inherit;font-weight:800;color:#F3D48A;text-decoration:underline;cursor:pointer}
/* affiches de la semaine : la carte principale */
${R} .as-carte{padding:18px 20px 16px;margin-bottom:18px;border-color:rgba(143,168,240,.35)}
${R} .as-tete{display:block}
${R} .as-titre{display:grid;grid-template-columns:minmax(0,1fr) auto;column-gap:12px;row-gap:4px;width:100%;align-items:center;min-height:44px}
${R} .as-titre b{font:800 24px var(--display)}
${R} .as-titre small{grid-column:1;font-size:14.5px}
${R} .as-fleche{grid-column:2;grid-row:1/span 2;width:36px;height:36px;border-radius:10px;border:1px solid var(--ligne);display:grid;place-items:center;font-size:13px}
${R} .ong-aff-outils{display:flex;flex-wrap:wrap;align-items:center;gap:10px 22px;margin:14px 0 4px;padding:10px 12px;border-radius:14px;background:rgba(5,11,31,.35);border:1px solid rgba(143,168,240,.16)}
${R} .ong-aff-og{display:flex;align-items:center;gap:10px;flex-wrap:wrap;min-width:0}
${R} .ong-aff-ol{font:800 11.5px var(--corps);letter-spacing:.1em;text-transform:uppercase;color:#8FA3D6;white-space:nowrap}
${R} .ong-aff-outils .as-semaine,${R} .ong-aff-outils .as-outils{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
${R} .ong-aff-outils .as-fmt{min-height:38px;padding:7px 14px;font-size:14px}
${R} .ong-aff-outils .as-quand{padding:0 4px;font-size:14.5px}
${R} .ong-aff-maj{margin-left:auto}
${R} .as-bande{gap:16px;padding:14px 2px 8px}
${R} .as-nom{font-size:12.5px;color:#C9D4F2}
${R} .as-vignette{width:92px;border-radius:10px;transition:transform .15s,border-color .15s}
${R} .as-vignette:hover{transform:translateY(-2px)}
${R} .as-note{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:13.5px;line-height:1.5}
${R} .ong-aff-leg{white-space:nowrap;color:var(--texte);font-weight:700}
/* blocs dépliants : titre en gras, une phrase dessous */
${R} .ong-aff-pli{margin-bottom:14px}
${R} .ong-aff-pli>summary{min-height:64px;padding:12px 20px}
${R} .ong-aff-ico{flex:none;width:44px;height:44px;border-radius:13px;display:grid;place-items:center;font-size:21px;line-height:1;background:rgba(47,107,255,.2);border:1px solid rgba(127,166,255,.45)}
${R} .ong-aff-pli .ong-pli-t{display:grid;gap:2px}
${R} .ong-aff-pli .ong-pli-t b{font:800 21px var(--display);letter-spacing:.2px}
${R} .ong-aff-pli .ong-pli-t small{font:500 14px var(--corps);color:var(--texte-doux);letter-spacing:0}
${R} .ong-aff-pli .pli-corps{padding-top:16px}
/* publier maintenant */
${R} .ong-aff-ps{display:grid;gap:12px}
${R} .ong-aff-ps .ps-tuile{margin:0;min-height:50px}
${R} .ong-aff-ps .ps-reseau{min-height:58px}
${R} .ong-aff-ps .ps-reseau .af-choix{margin:0;min-height:44px}
${R} .ong-aff-mini{display:block;margin-top:8px;font-size:13px;color:var(--texte-doux)}
${R} .ong-aff-ps .af-go{width:100%;margin-top:14px}
${R} .ong-aff-ps .ps-verif{display:block;margin-top:10px;text-align:center;font-size:13.5px;color:var(--texte-doux)}
${R} .ong-aff-ps .af-go,${R} .ong-aff-photo .af-go{min-height:52px}
/* publier une photo ou une vidéo */
${R} .ong-aff-photo .ap-grille{grid-template-columns:minmax(0,320px) minmax(0,1fr);gap:22px;margin-top:0}
${R} .ong-aff-photo .ap-image .ps-lab{margin-bottom:10px}
${R} .ong-aff-photo .ap-depot{aspect-ratio:auto;min-height:250px;padding:20px;font-size:40px;font-weight:400;letter-spacing:0;text-transform:none;gap:8px;border-color:rgba(143,168,240,.4);background:rgba(5,11,31,.3);transition:border-color .15s,background .15s}
${R} .ong-aff-photo .ap-depot:hover{border-color:var(--bleu-texte);background:rgba(47,107,255,.08)}
${R} .ong-aff-photo .ap-depot b{font:800 20px var(--display);text-transform:none;letter-spacing:.2px}
${R} .ong-aff-photo .ap-depot small{font:500 14px var(--corps);text-transform:none;letter-spacing:0;color:var(--texte-doux);max-width:240px;line-height:1.45}
${R} .ong-aff-photo .ap-texte{gap:14px}
${R} .ong-aff-photo .ap-texte>label{margin:0;font:800 13px var(--corps);letter-spacing:.08em;color:var(--texte-doux)}
${R} .ong-aff-photo .ap-texte textarea{min-height:190px}
${R} .ong-aff-ou{gap:10px;padding:14px 16px}
${R} .ong-aff-ligne{display:grid;grid-template-columns:44px minmax(0,1fr);align-items:center;gap:10px}
${R} .ong-aff-ligne .af-choix{margin:0;min-height:44px}
${R} .ong-aff-ou .ap-aide{font-size:13px}
${R} .ong-aff-photo .af-go{width:100%;justify-self:stretch}
${R} .ong-aff-photo .af-go:disabled{opacity:.5;cursor:not-allowed}
${R} .ong-aff-attente{margin-top:-4px;text-align:center}
${R} .ong-aff-photo .ap-vign-x{width:30px;height:30px;font-size:18px}
${R} .ong-aff-photo .ap-vign-ajout small{text-transform:none;letter-spacing:0;font:700 12.5px var(--corps)}
@media (pointer:coarse){ ${R} .ong-aff-glisse{display:none} }
/* réglages */
${R} .ong-aff-reg-txt{margin:0;color:var(--texte-doux);font-size:15px;line-height:1.5;max-width:720px}
${R} .ong-aff-reg-btns{margin-top:14px}
/* thème clair */
:root[data-theme="light"] ${R} .ong-aff-outils{background:#F3F6FD;border-color:#D5DBEA}
:root[data-theme="light"] ${R} .ong-aff-ol{color:var(--texte-doux)}
:root[data-theme="light"] ${R} .as-nom{color:var(--texte-doux)}
:root[data-theme="light"] ${R} .ong-aff-lien{color:#7A5B00}
:root[data-theme="light"] ${R} .ong-aff-ico{background:rgba(47,107,255,.12);border-color:rgba(47,107,255,.35)}
:root[data-theme="light"] ${R} .ong-aff-photo .ap-depot{background:#F7F9FE;border-color:#C9D4F2}
@media (max-width:760px){
  ${R} .as-carte{padding:14px 14px 12px}
  ${R} .as-titre b{font-size:21px}
  ${R} .as-titre small{font-size:13.5px}
  ${R} .ong-aff-outils{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px 8px;padding:10px}
  ${R} .ong-aff-og{display:grid;gap:6px}
  ${R} .ong-aff-og:first-child{grid-column:1/-1}
  ${R} .ong-aff-outils .as-fmt{min-height:44px}
  ${R} .ong-aff-outils .as-outils{flex-wrap:nowrap}
  ${R} .ong-aff-outils .as-outils .as-fmt{flex:1;padding:7px 8px}
  ${R} .ong-aff-maj{margin-left:0;align-self:end;width:44px;padding:0!important;font-size:18px!important}
  ${R} .ong-aff-maj-t{display:none}
  ${R} .as-vignette{width:84px}
  ${R} .ong-aff-pli>summary{padding:12px 14px;gap:10px}
  ${R} .ong-aff-ico{width:40px;height:40px;font-size:19px}
  ${R} .ong-aff-pli .ong-pli-t b{font-size:19px}
  ${R} .ong-aff-pli .ong-pli-t small{font-size:13px}
  ${R} .ong-aff-pli .pli-corps{padding:14px 14px 18px}
  ${R} .ong-aff-photo .ap-grille{grid-template-columns:minmax(0,1fr);gap:18px}
  ${R} .ong-aff-photo .ap-depot{min-height:170px}
  ${R} .ong-aff-ou{padding:12px}
  ${R} .ong-aff-ligne{grid-template-columns:minmax(0,1fr);gap:6px}
  ${R} .ong-aff-ligne .af-choix-l{flex-wrap:nowrap}
  ${R} .ong-aff-ligne .af-choix{flex:1;justify-content:center;padding:10px 8px}
  ${R} .ong-aff-reg-btns .btn{width:100%;text-align:center}
}`;
  document.head.appendChild(css);
})();
