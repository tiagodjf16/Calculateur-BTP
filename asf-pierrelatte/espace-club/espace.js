/* Espace dirigeants : simple à prendre en main, propre et beau.
   - En haut : le tableau tactique en 3D (bureau3d.js), avec le nom de la personne, son rôle, « Voir le site » et « Se déconnecter ».
   - Plus de menu à gauche : l'Accueil « Où veux-tu aller ? » montre toutes les rubriques et leurs onglets en grandes cartes.
   - Chaque page : un bandeau (rubrique, à quoi sert l'onglet, bouton « Accueil ») et les onglets de la rubrique.
   - Téléphone : une barre des rubriques en bas de l'écran.
   - L'intérieur des onglets : mêmes cadres, mêmes champs, mêmes boutons partout.
   Ajouté sans modifier le script de l'application (on se branche sur panTableau et rendreEspace). */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.rendreEspace !== "function" || typeof RUBRIQUES === "undefined") return;
  const icone = k => (typeof ICONES !== "undefined" && ICONES[k]) ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONES[k]}" stroke-linecap="round" stroke-linejoin="round"/></svg>` : "";
  const desc = k => ((typeof ONGLETS !== "undefined" ? ONGLETS : []).find(o => o[0] === k) || [])[4] || "";
  const badge = k => { try { return typeof badgeOnglet === "function" ? badgeOnglet(k) : ""; } catch(err){ return ""; } };
  const nom = k => { try { return typeof nomOnglet === "function" ? nomOnglet(k) : k; } catch(err){ return k; } };
  const rubsDuCompte = () => { try { return rubriquesVisibles(ongletsVisibles()); } catch(err){ return []; } };
  const TEINTE = { equipes: "#2F6BFF", matchs: "#16A34A", com: "#F59E0B", vie: "#E0457B", reglages: "#8B5CF6" };

  /* Accueil : les raccourcis vers tous les onglets du compte, rangés par rubrique */
  function raccourcis(){
    const rubs = rubsDuCompte().filter(r => r[0] !== "accueil");
    if (!rubs.length) return "";
    return `<section class="esp-lanceur" aria-labelledby="esp-lanceur-t">
      <h2 id="esp-lanceur-t">Où veux-tu aller ?</h2>
      <div class="esp-rubs">${rubs.map(([k, l, ico, tabs, d]) => `<div class="esp-rub" style="--teinte:${TEINTE[k] || "#2F6BFF"}">
        <div class="esp-rub-t"><span class="esp-rub-ico" aria-hidden="true">${ico}</span><span><b>${esc(l)}</b><small>${esc(d || "")}</small></span></div>
        <div class="esp-tuiles">${tabs.map(t => `<button type="button" class="esp-tuile" data-a="onglet" data-k="${esc(t)}">
          <span class="esp-tuile-ico">${icone(t)}</span><span class="esp-tuile-txt"><b>${esc(nom(t))}${badge(t)}</b><small>${esc(desc(t))}</small></span><span class="esp-fl" aria-hidden="true">›</span></button>`).join("")}</div>
      </div>`).join("")}</div>
    </section>`;
  }
  if (typeof window.panTableau === "function"){
    const avant = window.panTableau;
    window.panTableau = function(){ return raccourcis() + avant.apply(this, arguments); };
  }

  /* en haut de page : qui est connecté, voir le site, se déconnecter */
  function heroCompte(){
    const wrap = document.querySelector("#p-espace .titre-page .wrap"); if (!wrap) return;
    const p = wrap.querySelector("p");
    if (p && p.dataset.orig == null) p.dataset.orig = p.textContent;
    const moi = document.querySelector("#espace .app-moi");
    let carte = wrap.querySelector(".esp-moi");
    if (!moi){ if (carte) carte.remove(); if (p) p.textContent = p.dataset.orig; return; }
    const nomC = ((moi.querySelector(".app-moi-haut b") || {}).textContent || "").trim();
    const role = ((moi.querySelector(".app-moi-haut small") || {}).textContent || "").trim();
    const img = moi.querySelector(".app-moi-haut img");
    const ini = ((moi.querySelector(".app-ini") || {}).textContent || "").trim();
    const sortir = !!moi.querySelector('[data-a="deconnexion"]');
    const prenom = /membre du club/i.test(nomC) ? "" : nomC.split(/\s+/)[0];
    if (p) p.textContent = `Bonjour${prenom ? " " + prenom.charAt(0).toUpperCase() + prenom.slice(1).toLowerCase() : ""} ! Que veux-tu faire aujourd'hui ?`;
    const html = `<span class="esp-moi-av">${img ? `<img src="${esc(img.getAttribute("src") || "")}" alt="">` : esc(ini || "?")}</span>
      <span class="esp-moi-txt"><b>${esc(nomC)}</b><small>${esc(role)}</small></span>
      <span class="esp-moi-bts"><a class="esp-moi-bt" href="#accueil"><span aria-hidden="true">↗</span> Voir le site</a>${sortir ? `<button type="button" class="esp-moi-bt sortir" data-a="deconnexion"><span aria-hidden="true">⏻</span> Se déconnecter</button>` : ""}</span>`;
    if (!carte){ carte = document.createElement("div"); carte.className = "esp-moi"; wrap.appendChild(carte); }
    if (carte.dataset.html !== html){ carte.innerHTML = html; carte.dataset.html = html; }
  }

  /* téléphone : une barre en bas avec les rubriques, toujours à portée du pouce */
  const COURT = { accueil: "Accueil", equipes: "Équipes", matchs: "Matchs", com: "Com.", vie: "Vie club", reglages: "Réglages" };
  function barreBas(){
    let b = document.getElementById("esp-barre");
    if (location.hash !== "#espace" || !document.getElementById("panneau")){ if (b) b.remove(); document.body.classList.remove("avec-barre"); return; }
    const rubs = rubsDuCompte(); if (!rubs.length) return;
    const act = (rubs.find(r => r[3].includes(S.ui.onglet)) || [])[0];
    const html = rubs.map(([k, l, ico, tabs]) => `<button type="button" class="${k === act ? "on" : ""}" aria-current="${k === act ? "page" : "false"}" data-a="${tabs.length > 1 ? "rubrique" : "onglet"}" data-k="${esc(tabs.length > 1 ? k : tabs[0])}"><span class="esp-barre-ico" aria-hidden="true">${ico}</span><span>${esc(COURT[k] || l)}</span>${tabs.includes("messages") ? badge("messages") : ""}</button>`).join("");
    if (!b){ b = document.createElement("nav"); b.id = "esp-barre"; b.setAttribute("aria-label", "Rubriques de l'espace club"); document.body.appendChild(b); }
    b.innerHTML = html; document.body.classList.add("avec-barre");
  }
  window.addEventListener("hashchange", () => setTimeout(() => { barreBas(); heroCompte(); }, 0));
  // la barre du bas est hors de #espace : on relaie ses boutons au gestionnaire de l'application
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest("#esp-barre button"); if (!b) return;
    ev.preventDefault();
    const proxy = document.querySelector("#espace .esp-relais") || (() => { const x = document.createElement("button"); x.type = "button"; x.className = "esp-relais"; x.hidden = true; const z = document.getElementById("espace"); if (z) z.appendChild(x); return x; })();
    proxy.dataset.a = b.dataset.a; proxy.dataset.k = b.dataset.k; proxy.click();
    setTimeout(() => window.scrollTo({ top: 0 }), 0);
  });

  /* chaque page : le bandeau de la rubrique (à quoi sert l'onglet ouvert + « Accueil ») */
  function habiller(){
    const z = document.getElementById("espace"); if (!z) return;
    heroCompte(); barreBas();
    const app = z.querySelector(".app"); if (!app) return;
    app.classList.add("esp-app");
    app.classList.toggle("esp-sur-accueil", S.ui.onglet === "tableau");
    const main = z.querySelector(".app-main");
    if (main && !main.querySelector(".esp-version")) main.insertAdjacentHTML("beforeend", `<p class="esp-version">Espace club · version du 4 octobre 2026</p>`);
    const tete = z.querySelector(".app-tete"); if (!tete) return;
    tete.classList.add("esp-bandeau");
    const rub = rubsDuCompte().find(r => r[3].includes(S.ui.onglet));
    if (rub) tete.style.setProperty("--teinte", TEINTE[rub[0]] || "#2F6BFF");
    const pd = tete.querySelector("p"), d = desc(S.ui.onglet);
    if (pd && d) pd.textContent = d;
    if (S.ui.onglet !== "tableau" && !tete.querySelector(".esp-accueil"))
      tete.insertAdjacentHTML("beforeend", `<button type="button" class="esp-accueil" data-a="onglet" data-k="tableau"><span aria-hidden="true">←</span> Accueil</button>`);
    const ongs = z.querySelector(".rub-onglets");
    const actif = ongs && ongs.querySelector('[aria-selected="true"]');
    if (actif) try { actif.scrollIntoView({ block: "nearest", inline: "center" }); } catch(err){}
  }
  const espaceAvant = window.rendreEspace;
  window.rendreEspace = function(){
    const r = espaceAvant.apply(this, arguments);
    try { habiller(); } catch(err){}
    return r;
  };
  // changer d'onglet : on repart du haut de la page (sous l'en-tête 3D)
  document.addEventListener("click", ev => {
    const b = ev.target.closest && ev.target.closest('#espace [data-a="onglet"], #espace [data-a="rubrique"], #drawer-contenu [data-a="onglet"], #drawer-contenu [data-a="rubrique"]');
    if (b && b.dataset.k !== S.ui.onglet) setTimeout(() => {
      const z = document.getElementById("espace"); const y = z ? z.getBoundingClientRect().top + window.scrollY - 90 : 0;
      window.scrollTo({ top: b.dataset.k === "tableau" ? 0 : Math.max(0, Math.min(window.scrollY, y)), behavior: "auto" });
    }, 0);
  }, true);

  /* cartes en relief : elles s'inclinent sous la souris (ordinateur) */
  if (matchMedia("(hover: hover) and (pointer: fine)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches){
    document.addEventListener("pointermove", ev => {
      const c = ev.target.closest && ev.target.closest(".esp-rub"); if (!c) return;
      const r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
      c.style.setProperty("--rx", (-y * 5).toFixed(2) + "deg"); c.style.setProperty("--ry", (x * 7).toFixed(2) + "deg");
      c.style.setProperty("--mx", ((x + 0.5) * 100).toFixed(1) + "%"); c.style.setProperty("--my", ((y + 0.5) * 100).toFixed(1) + "%");
    }, { passive: true });
    document.addEventListener("pointerout", ev => {
      const c = ev.target.closest && ev.target.closest(".esp-rub"); if (!c || c.contains(ev.relatedTarget)) return;
      c.style.removeProperty("--rx"); c.style.removeProperty("--ry");
    }, { passive: true });
  }

  const css = document.createElement("style");
  css.id = "espace-css";
  css.textContent = `
/* ================= EN-TÊTE 3D ================= */
#p-espace .titre-page.esp-hero{position:relative;isolation:isolate;overflow:hidden;background:radial-gradient(90% 140% at 75% 30%,#173a2a 0%,#0b1426 45%,#050915 100%);
  min-height:clamp(340px,27vw,470px);display:flex;align-items:center;padding:40px 0 34px;border-bottom:1px solid rgba(227,182,76,.25)}
#p-espace .titre-page.esp-hero::before,#p-espace .titre-page.esp-hero::after{content:none}
#p-espace .titre-page.esp-hero .wrap{width:100%;max-width:1320px;position:relative;z-index:2}
#p-espace .esp-3d{position:absolute;inset:0;width:100%;height:100%;display:block;z-index:0}
#p-espace .esp-hero-voile{position:absolute;inset:0;z-index:1;pointer-events:none;
  background:linear-gradient(90deg,rgba(3,7,20,.92) 0%,rgba(3,7,20,.74) 24%,rgba(3,7,20,.22) 46%,rgba(3,7,20,0) 60%),
             linear-gradient(0deg,rgba(3,7,20,.55) 0%,rgba(3,7,20,0) 28%)}
#p-espace .titre-page.esp-hero h1{text-shadow:0 6px 30px rgba(0,0,0,.55)}
#p-espace .titre-page.esp-hero p{max-width:34ch;font-size:19px;color:#E6ECFF;text-shadow:0 2px 12px rgba(0,0,0,.6)}
.esp-moi{display:inline-flex;align-items:center;gap:14px;flex-wrap:wrap;margin-top:22px;padding:10px 12px 10px 10px;border-radius:20px;
  background:linear-gradient(135deg,rgba(255,255,255,.14),rgba(255,255,255,.05));border:1px solid rgba(255,255,255,.22);
  -webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);box-shadow:0 18px 40px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.18);
  animation:monte .8s .2s cubic-bezier(.2,.8,.2,1) both}
.esp-moi-av{width:48px;height:48px;border-radius:50%;flex:none;display:grid;place-items:center;overflow:hidden;font:800 18px var(--display);color:#0B1633;
  background:linear-gradient(135deg,#F7D774,#C9A227);box-shadow:0 0 0 3px rgba(255,255,255,.25)}
.esp-moi-av img{width:100%;height:100%;object-fit:cover}
.esp-moi-txt{display:grid;line-height:1.2;min-width:0;margin-right:6px}
.esp-moi-txt b{font:800 18px var(--display);color:#fff;letter-spacing:.2px}
.esp-moi-txt small{font:600 13.5px var(--corps);color:#C9D4F2}
.esp-moi-bts{display:flex;gap:8px;flex-wrap:wrap}
.esp-moi-bt{display:inline-flex;align-items:center;gap:7px;min-height:42px;padding:9px 15px;border-radius:12px;font:700 14.5px var(--corps);cursor:pointer;
  text-decoration:none;color:#fff;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.3);transition:background .15s,border-color .15s,transform .12s}
.esp-moi-bt:hover{background:rgba(255,255,255,.2);border-color:rgba(255,255,255,.55)}
.esp-moi-bt:active{transform:scale(.97)}
.esp-moi-bt.sortir{background:rgba(220,38,38,.18);border-color:rgba(248,113,113,.5)}
.esp-moi-bt.sortir:hover{background:rgba(220,38,38,.32)}
/* ================= PLUS DE MENU À GAUCHE ================= */
body.sur-espace .app.esp-app{grid-template-columns:minmax(0,1fr);max-width:1320px;margin:0 auto}
body.sur-espace .app.esp-app>.app-nav{display:none}
body.sur-espace footer .defile{display:none}
#p-espace .bloc{background:radial-gradient(1200px 500px at 70% -10%,rgba(37,87,196,.16),transparent 70%)}
/* ================= ACCUEIL : OÙ VEUX-TU ALLER ? ================= */
body.sur-espace .esp-sur-accueil .app-tete.esp-bandeau{display:none}
.esp-lanceur{margin:6px 0 30px}
.esp-lanceur h2{font:900 30px var(--display);font-style:italic;text-transform:uppercase;letter-spacing:.3px;margin:0 0 16px;display:flex;align-items:center;gap:12px}
.esp-lanceur h2::after{content:"";flex:1;height:2px;background:linear-gradient(90deg,rgba(227,182,76,.6),transparent)}
.esp-rubs{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:18px;perspective:1200px}
.esp-rub{--teinte:#2F6BFF;position:relative;display:grid;gap:10px;align-content:start;padding:16px;border-radius:22px;overflow:hidden;
  background:linear-gradient(160deg,#16275a,#0b1530);border:1px solid rgba(143,168,240,.25);
  background:linear-gradient(160deg,color-mix(in srgb,var(--teinte) 22%,#14234d) 0%,#101c3f 45%,#0b1530 100%);
  border:1px solid color-mix(in srgb,var(--teinte) 35%,rgba(143,168,240,.25));
  box-shadow:0 1px 0 rgba(255,255,255,.1) inset,0 22px 44px rgba(3,8,24,.45),0 4px 10px rgba(3,8,24,.3);
  transform:rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));transform-style:preserve-3d;transition:transform .25s ease-out,box-shadow .25s}
.esp-rub::before{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  background:radial-gradient(420px circle at var(--mx,30%) var(--my,0%),rgba(255,255,255,.10),transparent 45%)}
.esp-rub:hover{box-shadow:0 1px 0 rgba(255,255,255,.14) inset,0 30px 60px rgba(3,8,24,.55),0 0 0 1px color-mix(in srgb,var(--teinte) 50%,transparent)}
.esp-rub-t{display:flex;align-items:center;gap:12px;color:#fff;transform:translateZ(30px)}
.esp-rub-t b{display:block;font:800 21px var(--display);letter-spacing:.2px;line-height:1.1}
.esp-rub-t small{display:block;font:500 13px var(--corps);color:#AFC0EA;margin-top:2px}
.esp-rub-ico{width:52px;height:52px;flex:none;border-radius:16px;display:grid;place-items:center;font-size:27px;
  background:var(--teinte);
  background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.55),transparent 42%),linear-gradient(145deg,var(--teinte),color-mix(in srgb,var(--teinte) 45%,#050a1c));
  box-shadow:0 10px 22px color-mix(in srgb,var(--teinte) 45%,transparent),inset 0 -3px 6px rgba(0,0,0,.25),inset 0 2px 2px rgba(255,255,255,.35)}
.esp-tuiles{display:grid;gap:8px;transform:translateZ(18px)}
.esp-tuile{display:flex;align-items:center;gap:12px;width:100%;text-align:left;color:#fff;cursor:pointer;min-height:60px;padding:10px 12px;border-radius:14px;
  background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);transition:background .15s,border-color .15s,transform .12s}
.esp-tuile:hover{background:rgba(255,255,255,.13);border-color:rgba(255,255,255,.22);transform:translateX(3px)}
.esp-tuile:active{transform:scale(.98)}
.esp-tuile:focus-visible{outline:3px solid #8FC2FF;outline-offset:2px}
.esp-tuile-ico{width:38px;height:38px;flex:none;border-radius:11px;display:grid;place-items:center;color:#fff;
  background:var(--teinte);
  background:linear-gradient(145deg,color-mix(in srgb,var(--teinte) 85%,#fff),color-mix(in srgb,var(--teinte) 70%,#000));box-shadow:0 6px 14px color-mix(in srgb,var(--teinte) 35%,transparent)}
.esp-tuile-ico svg{width:20px;height:20px;stroke:currentColor;fill:none;stroke-width:1.9}
.esp-tuile-txt{flex:1;min-width:0;display:grid;gap:2px}
.esp-tuile-txt b{font:700 16.5px var(--corps);display:flex;align-items:center;gap:8px}
.esp-tuile-txt small{font:500 13px var(--corps);color:#AFC0EA;line-height:1.35}
.esp-fl{font:700 22px var(--corps);color:#AFC0EA;flex:none;transition:transform .15s}
.esp-tuile:hover .esp-fl{transform:translateX(3px);color:#fff}
/* ================= BANDEAU DE CHAQUE PAGE ================= */
body.sur-espace .app-tete.esp-bandeau{--teinte:#2F6BFF;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:0 0 14px;padding:18px 22px;
  border-radius:22px;color:#fff;position:relative;overflow:hidden;
  background:linear-gradient(120deg,#1a3270,#0f1e46 55%,#0a1532);
  background:linear-gradient(120deg,color-mix(in srgb,var(--teinte) 40%,#0f1e46) 0%,#0f1e46 55%,#0a1532 100%);
  border:1px solid color-mix(in srgb,var(--teinte) 40%,rgba(143,168,240,.2));box-shadow:0 1px 0 rgba(255,255,255,.1) inset,0 18px 40px rgba(3,8,24,.4)}
body.sur-espace .app-tete.esp-bandeau::after{content:"";position:absolute;right:-60px;top:-80px;width:280px;height:280px;border-radius:50%;pointer-events:none;
  background:radial-gradient(circle,color-mix(in srgb,var(--teinte) 45%,transparent),transparent 65%);opacity:.6}
body.sur-espace .app-tete.esp-bandeau>div{position:relative;z-index:1;min-width:0}
body.sur-espace .app-tete.esp-bandeau h1{display:flex;align-items:center;gap:14px;color:#fff;font-size:32px;font-style:italic;text-transform:uppercase;font-weight:900}
body.sur-espace .app-tete.esp-bandeau .rub-ico-grand{width:54px;height:54px;border-radius:17px;display:grid;place-items:center;font-size:28px;flex:none;font-style:normal;
  background:radial-gradient(circle at 30% 25%,rgba(255,255,255,.55),transparent 42%),linear-gradient(145deg,var(--teinte),color-mix(in srgb,var(--teinte) 45%,#050a1c));
  box-shadow:0 10px 22px color-mix(in srgb,var(--teinte) 45%,transparent),inset 0 -3px 6px rgba(0,0,0,.25)}
body.sur-espace .app-tete.esp-bandeau p{color:#D5DEFA;margin-top:6px;font-size:16px}
.esp-accueil{position:relative;z-index:1;flex:none;display:inline-flex;align-items:center;gap:8px;min-height:44px;padding:10px 18px;border-radius:13px;cursor:pointer;
  font:800 15px var(--corps);color:#fff;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.35);transition:background .15s,transform .12s}
.esp-accueil:hover{background:rgba(255,255,255,.22)}
.esp-accueil:active{transform:scale(.97)}
/* onglets de la rubrique : un sélecteur clair */
body.sur-espace .rub-onglets{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;margin:0 0 22px;padding:6px;
  background:rgba(10,20,48,.75);border:1px solid rgba(143,168,240,.2);border-radius:16px;-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px)}
body.sur-espace .rub-onglets::-webkit-scrollbar{display:none}
body.sur-espace .rub-onglets button{flex:1 0 auto;min-height:46px;padding:10px 18px;border-radius:12px;border:0;background:none;color:#C9D4F2;
  font:700 15.5px var(--corps);cursor:pointer;white-space:nowrap;display:inline-flex;align-items:center;justify-content:center;gap:8px;transition:background .15s,color .15s}
body.sur-espace .rub-onglets button:hover{background:rgba(143,168,240,.14);color:#fff}
body.sur-espace .rub-onglets button[aria-selected="true"]{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);color:#fff;box-shadow:0 8px 20px rgba(47,107,255,.35),inset 0 1px 0 rgba(255,255,255,.25)}
/* ================= L'INTÉRIEUR DES ONGLETS : PROPRE ET RÉGULIER ================= */
body.sur-espace #panneau{display:block;overflow-x:clip}   /* clip (et non hidden) : les barres « collantes » des onglets restent en place */
body.sur-espace #panneau .carte,body.sur-espace #panneau .pli{border-radius:20px;border:1px solid rgba(143,168,240,.2);
  background:linear-gradient(180deg,rgba(26,44,96,.55),rgba(14,26,60,.55)),var(--carte);box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 16px 36px rgba(3,8,24,.32)}
body.sur-espace #panneau .carte{padding:22px 24px;margin-bottom:18px}
body.sur-espace #panneau .carte>h2:first-child{display:flex;align-items:center;gap:10px;font-size:23px;margin:0 0 14px;padding-bottom:12px;border-bottom:1px solid rgba(143,168,240,.16)}
body.sur-espace #panneau h3.sous{display:flex;align-items:center;gap:10px;border-left:0;padding-left:0;font-size:22px;margin:30px 0 14px}
body.sur-espace #panneau h3.sous::before{content:"";width:6px;height:22px;border-radius:3px;background:linear-gradient(180deg,#F7D774,#C9A227);flex:none}
/* champs : même hauteur partout, libellés alignés */
body.sur-espace #panneau .grille{align-items:start;gap:16px 18px}
body.sur-espace #panneau label{align-content:start}
body.sur-espace #panneau input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),
body.sur-espace #panneau select,body.sur-espace #panneau .dp-champ{height:48px;min-height:48px;border-radius:12px;background:rgba(5,11,31,.55);border:1px solid rgba(143,168,240,.28);padding:0 14px;font-size:16px}
body.sur-espace #panneau textarea{border-radius:12px;background:rgba(5,11,31,.55);border:1px solid rgba(143,168,240,.28);min-height:44px;padding:12px 14px}
body.sur-espace #panneau .dp-champ{margin:0}
body.sur-espace #panneau input:hover,body.sur-espace #panneau select:hover,body.sur-espace #panneau textarea:hover,body.sur-espace #panneau .dp-champ:hover{border-color:rgba(143,168,240,.55)}
body.sur-espace #panneau input:focus-visible,body.sur-espace #panneau select:focus-visible,body.sur-espace #panneau textarea:focus-visible{
  outline:0;border-color:#5B8CFF;box-shadow:0 0 0 4px rgba(91,140,255,.25)}
body.sur-espace #panneau input::placeholder,body.sur-espace #panneau textarea::placeholder{color:#7F90BE}
/* boutons : l'action principale se voit tout de suite */
body.sur-espace #panneau .btn{min-height:46px;display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:13px;font:800 15.5px var(--corps);letter-spacing:.1px;padding:10px 18px}
body.sur-espace #panneau .btn.petit{min-height:40px;font-size:14.5px;padding:8px 14px;border-radius:11px}
body.sur-espace #panneau .btn.bleu{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);border-color:transparent;color:#fff;box-shadow:0 10px 22px rgba(47,107,255,.3),inset 0 1px 0 rgba(255,255,255,.25)}
body.sur-espace #panneau .btn.bleu:hover{filter:brightness(1.08);transform:translateY(-1px)}
body.sur-espace #panneau .btn.contour{background:rgba(255,255,255,.05);border:1px solid rgba(143,168,240,.4);color:#E6ECFF}
body.sur-espace #panneau .btn.contour:hover{background:rgba(143,168,240,.14);border-color:rgba(143,168,240,.7)}
body.sur-espace #panneau .btn.danger{background:rgba(220,38,38,.08);border:1px solid rgba(248,113,113,.55);color:#FCA5A5}
body.sur-espace #panneau .btn.danger:hover{background:rgba(220,38,38,.2)}
body.sur-espace #panneau .btn:disabled{opacity:.5;cursor:not-allowed;transform:none;filter:none}
body.sur-espace #panneau .carte>div:last-child>.btn.bleu:only-child,body.sur-espace #panneau form.carte>div:last-child>.btn.bleu{min-width:220px;min-height:50px;font-size:16.5px}
/* lignes de liste et éléments */
body.sur-espace #panneau .rangee{border-radius:16px;background:linear-gradient(180deg,rgba(26,44,96,.45),rgba(14,26,60,.45));border:1px solid rgba(143,168,240,.18);padding:14px 18px;margin-bottom:10px}
body.sur-espace #panneau .rangee:hover{border-color:rgba(143,168,240,.45)}
body.sur-espace #panneau .rangee .txt{flex:1;min-width:200px}
body.sur-espace #panneau .item{border-radius:18px;background:linear-gradient(180deg,rgba(26,44,96,.5),rgba(14,26,60,.5));border:1px solid rgba(143,168,240,.18)}
body.sur-espace #panneau .statut,body.sur-espace #panneau .etiq{border-radius:999px}
/* messages vides : clairs et aérés */
body.sur-espace #panneau .vide,body.sur-espace #panneau .etat-vide{border:1.5px dashed rgba(143,168,240,.3);border-radius:18px;background:rgba(10,20,48,.4);color:#AFC0EA}
body.sur-espace #panneau .etat-vide b{color:#fff}
/* tableaux */
body.sur-espace #panneau table{border-collapse:separate;border-spacing:0;border:1px solid rgba(143,168,240,.2);border-radius:16px;overflow:hidden}
body.sur-espace #panneau th{background:rgba(143,168,240,.1)}
body.sur-espace #panneau tbody tr:nth-child(even) td{background:rgba(143,168,240,.05)}
body.sur-espace #panneau tbody tr:hover td{background:rgba(143,168,240,.1)}
/* textes d'aide plus lisibles */
body.sur-espace #panneau .quoi,body.sur-espace #panneau .legende,body.sur-espace #panneau .aide{color:#AFC0EA;line-height:1.5}
.esp-relais{display:none}
#esp-barre{display:none}
.esp-version{margin:30px 0 6px;text-align:center;color:var(--texte-doux);font:600 12px var(--corps);letter-spacing:.04em;opacity:.75}
/* ================= THÈME CLAIR ================= */
:root[data-theme="light"] body.sur-espace #panneau .carte,:root[data-theme="light"] body.sur-espace #panneau .pli,
:root[data-theme="light"] body.sur-espace #panneau .rangee,:root[data-theme="light"] body.sur-espace #panneau .item{background:var(--carte);box-shadow:0 10px 26px rgba(7,18,48,.08)}
:root[data-theme="light"] body.sur-espace #panneau input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]),:root[data-theme="light"] body.sur-espace #panneau select,
:root[data-theme="light"] body.sur-espace #panneau textarea,:root[data-theme="light"] body.sur-espace #panneau .dp-champ{background:#fff;border-color:#C9D4F2}
:root[data-theme="light"] body.sur-espace #panneau .btn.contour{color:var(--texte)}
:root[data-theme="light"] body.sur-espace #panneau .btn.danger{background:#fff;color:#B91C1C;border-color:#F87171}
:root[data-theme="light"] body.sur-espace #panneau .btn.danger:hover{background:#FEE2E2}
:root[data-theme="light"] body.sur-espace #panneau .quoi{color:var(--texte-doux)}
:root[data-theme="light"] body.sur-espace .rub-onglets{background:var(--carte)}
:root[data-theme="light"] body.sur-espace .rub-onglets button{color:var(--texte)}
:root[data-theme="light"] body.sur-espace .rub-onglets button[aria-selected="true"]{color:#fff}
/* ================= TABLETTE ET TÉLÉPHONE ================= */
@media (max-width:1140px){
  #esp-barre{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;position:fixed;left:0;right:0;bottom:0;z-index:40;
    background:rgba(6,12,32,.94);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);border-top:1px solid rgba(143,168,240,.25);
    padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 28px rgba(0,0,0,.35)}
  #esp-barre button{position:relative;display:grid;justify-items:center;gap:2px;border:0;background:none;color:#C9D4F2;cursor:pointer;
    padding:6px 2px;border-radius:12px;font:700 11px var(--corps);min-height:54px}
  #esp-barre .esp-barre-ico{font-size:22px;line-height:1.1;filter:grayscale(.35);opacity:.85}
  #esp-barre button.on{color:#fff;background:rgba(47,107,255,.35)}
  #esp-barre button.on .esp-barre-ico{filter:none;opacity:1}
  #esp-barre .menu-badge{position:absolute;top:2px;right:18%}
  body.avec-barre{padding-bottom:calc(80px + env(safe-area-inset-bottom,0px))!important}
  body.sur-espace .rub-onglets{position:sticky;top:60px;z-index:6;box-shadow:0 10px 22px rgba(3,8,24,.35)}
  body.sur-espace .rub-onglets button{flex:none}
  body.sur-espace .app-tete.esp-bandeau{padding:16px;border-radius:18px;margin-bottom:12px}
  body.sur-espace .app-tete.esp-bandeau h1{font-size:25px;gap:12px}
  body.sur-espace .app-tete.esp-bandeau .rub-ico-grand{width:44px;height:44px;font-size:23px;border-radius:14px}
  body.sur-espace .app-tete.esp-bandeau p{font-size:14.5px}
}
@media (max-width:700px){
  #p-espace .titre-page.esp-hero{min-height:0;padding:30px 0 22px}
  #p-espace .esp-hero-voile{background:linear-gradient(180deg,rgba(3,7,20,.82) 0%,rgba(3,7,20,.45) 45%,rgba(3,7,20,.8) 100%)}
  #p-espace .titre-page.esp-hero p{font-size:16.5px}
  .esp-moi{display:flex;margin-top:16px;padding:10px;gap:10px}
  .esp-moi-av{width:42px;height:42px;font-size:16px}
  .esp-moi-txt{flex:1}
  .esp-moi-bts{width:100%}
  .esp-moi-bt{flex:1;justify-content:center}
  .esp-rubs{grid-template-columns:minmax(0,1fr);gap:14px}
  .esp-lanceur h2{font-size:24px}
  .esp-accueil{padding:8px 13px;min-height:40px}
  body.sur-espace .rub-onglets button{padding:10px 14px;font-size:14.5px}
  body.sur-espace #panneau .carte{padding:16px}
  body.sur-espace #panneau .carte>div:last-child>.btn.bleu:only-child,body.sur-espace #panneau form.carte>div:last-child>.btn.bleu{width:100%}
}`;
  document.head.appendChild(css);
  // l'espace est peut-être déjà affiché : on l'habille tout de suite
  if (document.getElementById("panneau")) setTimeout(() => { try { if (S.ui.onglet === "tableau") rendrePanneau(); habiller(); } catch(err){} }, 0);
})();
