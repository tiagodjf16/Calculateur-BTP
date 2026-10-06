/* Samsung Internet (le navigateur des téléphones Samsung, qui ouvre aussi l'appli Android quand il est le navigateur par
   défaut) : son mode sombre repeint les sites, même ceux qui sont déjà sombres (il ne tient pas compte de « color-scheme »).
   Il assombrit les fonds clairs (le doré devient marron) et les dégradés clairs (un texte en dégradé doré ou blanc devient
   foncé, presque illisible), et il éclaircit les textes foncés. Il laisse tels quels les fonds foncés, les textes clairs et
   les photos. Sur Samsung Internet seulement, la page n'utilise donc que ce que ce mode ne touche pas :
   - un texte en dégradé devient d'une couleur unie claire (le doré, ou le blanc) ; un reflet animé est retiré ;
   - un fond doré sous un texte foncé (boutons, pastilles, initiales) devient bleu nuit, avec le bord et le texte dorés.
   Le reste de la page, et les autres navigateurs (iPhone, Chrome, ordinateurs), ne changent pas.
   La classe « samsung » est posée dès l'en-tête de la page (build.py), avant le premier affichage. */
(function(){
  "use strict";
  if (!/SamsungBrowser\//.test(navigator.userAgent || "")) return;
  const racine = document.documentElement;
  racine.classList.add("samsung");

  const css = document.createElement("style");
  css.textContent = `
/* les textes en dégradé les plus visibles, dès le premier affichage */
html.samsung .hero.hero-stade h1 em,html.samsung .cal-saison,html.samsung .clx-rang,html.samsung #p-accueil .chiffres b{
  background:none!important;color:#E3B64C!important;-webkit-text-fill-color:currentColor!important;filter:none!important;animation:none!important}
html.samsung .titre-page h1,html.samsung .eq-infos b{background:none!important;color:#fff!important;-webkit-text-fill-color:currentColor!important;filter:none!important}
html.samsung .hero-stade .annee{background:none!important;animation:none!important}
/* les boutons dorés, dès le premier affichage */
html.samsung .btn.plein,html.samsung .btn.stage-bt,html.samsung .retour-espace,html.samsung .retour-site{
  background:#0F1C44!important;color:#F7DC92!important;border:1.5px solid #E3B64C!important;box-shadow:none!important;text-shadow:none!important}
/* repérés par la page (voir plus bas) */
html.samsung .ss-uni{background:none!important;-webkit-text-fill-color:currentColor!important;filter:none!important;animation:none!important}
html.samsung .ss-reflet{background-image:none!important;animation:none!important}
html.samsung .ss-or{background:#0F1C44!important;color:#F7DC92!important;border-color:#E3B64C!important;box-shadow:none!important;text-shadow:none!important}
html.samsung .ss-or:not([class*="ini"]):not([class*="avatar"]){border-style:solid!important;border-width:1.5px!important}
html.samsung [class*="ini"].ss-or,html.samsung [class*="avatar"].ss-or{box-shadow:0 0 0 1.5px #E3B64C inset!important}`;
  document.head.appendChild(css);

  /* ---------- repérer, partout dans la page, ce que le mode sombre de Samsung abîmerait ---------- */
  const couleurs = s => (String(s || "").match(/rgba?\([^)]*\)/g) || []).map(c => c.match(/[\d.]+/g).map(Number));
  const lum = c => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(c[0]) + .7152 * f(c[1]) + .0722 * f(c[2]); };
  const alpha = c => c.length > 3 ? c[3] : 1;
  const doree = c => c[0] > 170 && c[1] > 110 && c[0] - c[2] > 60 && c[1] - c[2] > 25;          // or, jaune, ambre
  const IGNORES = new Set(["SCRIPT", "STYLE", "LINK", "META", "CANVAS", "IMG", "VIDEO", "SVG", "PATH", "IFRAME", "BR", "SOURCE", "PICTURE"]);
  function regarder(el){
    if (!el || el.nodeType !== 1 || IGNORES.has(el.tagName.toUpperCase())) return;
    if (racine.dataset.theme === "light") return;                // thème clair choisi : Samsung assombrit tout, comme il veut
    if (el.classList.contains("ss-or")) el.classList.remove("ss-or");      // l'élément a pu changer (bouton choisi, onglet actif…)
    const cs = getComputedStyle(el), image = cs.backgroundImage || "";
    // 1) un texte en dégradé
    if ((cs.webkitBackgroundClip === "text" || cs.backgroundClip === "text") && /gradient/.test(image)){
      const st = couleurs(image);
      if (!st.length || st.some(c => alpha(c) < .1)){ el.classList.add("ss-reflet"); return; }      // un reflet qui passe
      const pleins = st.filter(c => alpha(c) > .4), or = pleins.find(doree);
      const c = or || pleins.slice().sort((a, b) => lum(b) - lum(a))[0] || [255, 255, 255];
      el.style.setProperty("color", `rgb(${c[0]},${c[1]},${c[2]})`, "important");
      el.classList.add("ss-uni");
      return;
    }
    // 2) un fond doré sous un texte foncé
    if (/url\(/.test(image)) return;                             // une photo : Samsung n'y touche pas
    const fond = /gradient/.test(image) ? couleurs(image) : couleurs(cs.backgroundColor);
    const opaques = fond.filter(c => alpha(c) > .6);
    if (!opaques.length || opaques.filter(doree).length * 2 < opaques.length) return;
    const texte = couleurs(cs.color)[0];
    if (texte && lum(texte) < .25) el.classList.add("ss-or");
  }

  /* au chargement, puis à chaque morceau de page dessiné ou changé, par petits paquets pour ne rien ralentir */
  const file = new Set();
  let prevu = false;
  const plusTard = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 120 }) : f => setTimeout(f, 30);
  function vider(delai){
    prevu = false;
    const fin = Date.now() + 12;
    for (const el of file){
      file.delete(el);
      if (el.isConnected){ try { regarder(el); } catch(err){} }
      if (Date.now() > fin && file.size){ prevoir(); return; }
    }
  }
  function prevoir(){ if (!prevu){ prevu = true; plusTard(vider); } }
  function ajouter(n){
    if (!n || n.nodeType !== 1) return;
    file.add(n);
    if (n.querySelectorAll) n.querySelectorAll("*").forEach(x => file.add(x));
    prevoir();
  }
  function demarrer(){
    if (!document.body) return;
    ajouter(document.body);
    // (nos propres classes « ss-… » ne comptent pas comme un changement)
    const sans = v => String(v || "").split(/\s+/).filter(c => c && !c.startsWith("ss-")).sort().join(" ");
    new MutationObserver(lot => {
      for (const m of lot){
        if (m.type === "childList") m.addedNodes.forEach(ajouter);
        else if (m.target.nodeType === 1){
          if (m.attributeName === "class" && sans(m.oldValue) === sans(m.target.getAttribute("class"))) continue;
          file.add(m.target); prevoir();
        }
      }
    }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ["class", "aria-pressed", "aria-current", "aria-selected"] });
    // le thème du site (clair / sombre) change : tout est revu
    new MutationObserver(() => ajouter(document.body)).observe(racine, { attributes: true, attributeFilter: ["data-theme"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", demarrer); else demarrer();
})();
