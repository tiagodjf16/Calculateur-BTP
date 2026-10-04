/* Mes équipes › Compos, Entraînements, Effectifs : l'intérieur des onglets, rangé et simple à prendre en main.
   - Tout en haut, comme dans tous les onglets : « 💡 Comment ça marche ? » replié, en quelques étapes.
   - Juste dessous : l'équipe (bien visible, « Ton équipe » quand le coach n'en a qu'une), ses chiffres et l'action principale.
   - Entraînements : les créneaux dans un cadre clair (enregistrés tout seuls), puis la semaine et ses séances.
   - Effectifs : « Joueurs de … » avec la recherche juste au-dessus de la liste ; l'import Footclubs et l'ajout dans des cadres
     qu'on ferme ; « Peuvent aussi jouer » replié sous la liste.
   - Compos : « Tes compos » et « + Nouvelle compo », le filtre par équipe, À faire, À venir, les compos passées repliées ;
     « Supprimer » en rouge, à part. L'éditeur : un en-tête (retour, le match, enregistrer) puis les réglages ;
     au téléphone, « Étape 1 sur 2 » et les boutons du bas au-dessus de la barre des rubriques.
   On reprend tels quels les éléments rendus par l'application (mêmes data-a, data-c, data-ent, data-conv, name…) :
   on les range seulement autrement. Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.ONG === "undefined") return;
  const e = ONG.e;
  const el = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const enfants = r => [...r.children];
  const texte = (n, t) => { if (n) n.textContent = t; };
  // remplace le premier morceau de texte d'un élément (le libellé d'un <label> qui contient son champ)
  const libelle = (lab, t) => { if (!lab) return; const n = [...lab.childNodes].find(x => x.nodeType === 3 && x.textContent.trim()); if (n) n.textContent = t; };
  const envelopper = (r, classes) => { const w = el(`<div class="ong-eq ${classes}"></div>`); while (r.firstChild) w.appendChild(r.firstChild); r.appendChild(w); return w; };
  const nbJoueurs = n => `${n} joueur${n > 1 ? "s" : ""}`;

  /* ---------- la barre d'équipe (Entraînements, Effectifs) ---------- */
  function rangerBarre(w){
    const b = w.querySelector(".eqb"); if (!b) return null;
    b.classList.add("ong-eq-barre");
    const sel = b.querySelector('select[data-a="choix-eq"]'), lab = b.querySelector(".eqb-eq > span");
    if (sel && sel.options.length <= 1){                                  // un coach avec une seule équipe : son nom, en grand
      b.classList.add("ong-eq-seule");
      texte(lab, "Ton équipe");
      sel.insertAdjacentHTML("afterend", `<b class="ong-eq-nom">${e(sel.value || S.ui.eq || "")}</b>`);
    } else {
      texte(lab, "Choisis l'équipe");
    }
    return b;
  }
  // l'action principale à droite (et en premier au téléphone), les autres plus discrètes
  function ordonnerActions(b, principal, secondaires){
    const z = b && b.querySelector(".eqb-actions"); if (!z) return;
    secondaires.filter(Boolean).forEach(x => { x.classList.remove("bleu"); x.classList.add("contour"); z.appendChild(x); });
    if (principal){ principal.classList.remove("contour"); principal.classList.add("bleu", "ong-eq-princ"); z.appendChild(principal); }
  }

  /* =====================================================================
     ENTRAÎNEMENTS
     ===================================================================== */
  const AIDE_ENT = `<ol>
    <li>Ajoute tes <b>créneaux</b> une seule fois (jour, heure, lieu) : les séances de chaque semaine apparaissent toutes seules.</li>
    <li>Touche <b>« Prévenir les joueurs »</b> : ils reçoivent une notification et répondent présent ou absent.</li>
    <li>Pour un match, touche <b>« Demander les dispos »</b> sur sa carte.</li>
    <li>Les flèches ‹ › changent de semaine. « Voir les réponses » montre qui vient.</li></ol>`;
  function rangerEntrainements(r){
    const w = envelopper(r, "ong-eq-ent");
    const eq = S.ui.eq, cr = creneauxDe(eq);
    const b = rangerBarre(w);
    if (b){
      const btCr = b.querySelector('[data-a="ent-creneaux"]'), btPrev = b.querySelector('[data-a="prevenir-ent"]');
      if (btCr){
        if (!cr.length) btCr.remove();                                    // sans créneau, le cadre est déjà ouvert
        else { btCr.innerHTML = `<span aria-hidden="true">🕒</span> ${S.ui.creneauxOuvert ? "Fermer les créneaux" : "Modifier les créneaux"}`;
          btCr.setAttribute("aria-expanded", S.ui.creneauxOuvert ? "true" : "false"); }
      }
      if (cr.length) ordonnerActions(b, btPrev, [btCr]);
      else if (btPrev){ btPrev.classList.remove("bleu"); btPrev.classList.add("contour"); }   // d'abord ajouter un créneau (bouton bleu du cadre)
      b.insertAdjacentHTML("beforebegin", ONG.aide("eq-ent-aide", "Comment ça marche ?", AIDE_ENT));      // l'aide en premier, comme dans tous les onglets
    }

    // le cadre des créneaux
    const carte = enfants(w).find(x => x.classList.contains("carte") && x.querySelector('[data-a="add-creneau-ent"]'));
    if (carte){
      carte.classList.add("ong-ent-cr");
      carte.removeAttribute("style");
      const h = carte.querySelector("h3"); if (h) h.remove();
      const fermer = S.ui.creneauxOuvert && cr.length ? `<button type="button" class="btn contour petit" data-a="ent-creneaux">✓ Terminé</button>` : "";
      carte.insertAdjacentHTML("afterbegin", `<div class="ong-ent-cr-tete"><div>
          <h3 class="ong-ent-h">Créneaux de chaque semaine${cr.length ? `<span class="ong-nb">${cr.length}</span>` : ""}</h3>
          <p class="quoi">${cr.length ? "Chaque changement est enregistré tout de suite." : `Indique quand ${e(eq)} s'entraîne : les séances se créeront toutes seules chaque semaine.`}</p></div>${fermer}</div>`);
      carte.querySelectorAll(".rangee[data-cr]").forEach(l => {
        l.classList.add("ong-ent-ligne");
        l.querySelectorAll("label").forEach(x => x.removeAttribute("style"));
        const del = l.querySelector('[data-a="del-creneau-ent"]');
        if (del){ del.textContent = "Retirer"; del.setAttribute("aria-label", "Retirer ce créneau"); }
      });
      const aucun = carte.querySelector(":scope > p.quoi"); if (aucun) aucun.remove();       // déjà dit dans l'en-tête du cadre
      const add = carte.querySelector('[data-a="add-creneau-ent"]');
      if (add){ add.closest(".btns").classList.add("ong-ent-add"); if (!cr.length){ add.classList.remove("contour"); add.classList.add("bleu"); } }
    }

    // la semaine : flèches, jours, puis les séances
    const nav = w.querySelector(".ent-nav"), jours = w.querySelector(".ent-jours");
    if (nav && jours){
      const sem = el(`<section class="ong-ent-sem" aria-label="La semaine"></section>`);
      nav.before(sem); sem.append(nav, jours);
    }
    const vide = enfants(w).find(x => x.classList.contains("ent-vide"));
    if (vide) vide.outerHTML = ONG.vide("Rien de prévu cette semaine", cr.length
      ? "Aucun entraînement ni match cette semaine." : "Ajoute tes créneaux juste au-dessus : les séances apparaîtront toutes seules chaque semaine.");
    // personne n'a encore répondu : on le dit simplement
    w.querySelectorAll(".ent-carte .en-compte").forEach(c => {
      const t = [...c.children].map(x => x.textContent);
      if (/^0 /.test(t[0] || "") && /^0 /.test(t[1] || "")) c.innerHTML = `<span class="ong-ent-rien">Pas encore de réponse · ${e(t[2] || "")}</span>`;
    });
  }

  /* =====================================================================
     EFFECTIFS
     ===================================================================== */
  const AIDE_EFF = `<ol>
    <li>Choisis l'équipe tout en haut.</li>
    <li>Ajoute les joueurs : <b>« Importer depuis Footclubs »</b> pour toute la liste d'un coup, ou <b>« + Ajouter un joueur »</b> un par un.</li>
    <li>Touche le rond d'un joueur pour ajouter ou changer sa <b>photo</b>.</li>
    <li>La croix rouge ✕ retire le joueur de cette équipe.</li></ol>`;
  function rangerEffectifs(r){
    const w = envelopper(r, "ong-eq-eff");
    const eq = S.ui.eq, n = effectifDe(eq).length;
    const ouvert = S.ui.importLic ? "import" : S.ui.effOuvert;
    const b = rangerBarre(w);
    if (b){
      const btAj = b.querySelector('[data-a="eff-panneau"][data-k="ajout"]'), btImp = b.querySelector('[data-a="eff-panneau"][data-k="import"]');
      if (btImp){ btImp.innerHTML = `<span aria-hidden="true">📥</span> Importer depuis Footclubs`; btImp.setAttribute("aria-expanded", ouvert === "import" ? "true" : "false"); }
      if (btAj) btAj.setAttribute("aria-expanded", ouvert === "ajout" ? "true" : "false");
      ordonnerActions(b, btAj, [btImp]);
      b.insertAdjacentHTML("beforebegin", ONG.aide("eq-eff-aide", "Comment ça marche ?", AIDE_EFF));      // l'aide en premier, comme dans tous les onglets
    }
    const cherche = w.querySelector("[data-cherche-eff]");

    // ajouter un joueur : un titre et « Fermer »
    const form = w.querySelector('form[data-form="joueur"]');
    const cAjout = form && form.closest(".carte");
    if (cAjout){
      cAjout.classList.add("ong-eff-cadre"); cAjout.removeAttribute("style");
      cAjout.insertAdjacentHTML("afterbegin", `<div class="ong-eff-cadre-tete"><h3 class="ong-ent-h">Ajouter un joueur à ${e(eq)}</h3>
        <button type="button" class="btn contour petit" data-a="eff-panneau" data-k="ajout">Fermer</button></div>`);
      form.classList.add("ong-eff-form");
      const ok = form.querySelector("button:not([type=button])"); if (ok) ok.classList.add("ong-eq-princ");
    }
    // importer depuis Footclubs : trois étapes au lieu d'un long paragraphe
    const fich = w.querySelector("[data-fichier-licencies]");
    const cImp = fich && fich.closest(".carte");
    if (cImp){
      cImp.classList.add("ong-eff-cadre", "ong-eff-import"); cImp.removeAttribute("style");
      const h2 = cImp.querySelector(":scope > h2"), p = cImp.querySelector(":scope > p");
      if (h2) h2.outerHTML = `<div class="ong-eff-cadre-tete"><h3 class="ong-ent-h">Importer depuis Footclubs</h3>${S.ui.importLic ? "" : `<button type="button" class="btn contour petit" data-a="eff-panneau" data-k="import">Fermer</button>`}</div>`;
      if (p) p.outerHTML = `<ol class="ong-eff-etapes">
          <li>Dans <b>Footclubs</b>, ouvre le menu <b>Licences</b> et exporte la liste (Excel ou CSV).</li>
          <li>Touche le bouton ci-dessous et choisis ce fichier.</li>
          <li>Vérifie le nombre de joueurs trouvés, puis valide.</li></ol>`;
      const lab = fich.closest("label.btn");
      if (lab){ libelle(lab, "📂 Choisir le fichier Footclubs"); lab.removeAttribute("style"); lab.classList.add("ong-eff-fichier");
        const z = lab.closest(".btns"); if (z) z.removeAttribute("style"); }
      const res = cImp.querySelector(".rangee"); if (res){ res.removeAttribute("style"); res.classList.add("ong-eff-res"); }
      const ann = cImp.querySelector('[data-a="annuler-import-lic"]'); if (ann){ ann.classList.remove("contour"); ann.classList.add("danger"); }
      const coller = cImp.querySelector(":scope > details"); if (coller){ coller.classList.add("ong-eff-coller");
        const s = coller.querySelector("summary"); if (s){ s.removeAttribute("style"); s.textContent = "Pas de fichier ? Colle les lignes copiées depuis Footclubs"; } }
    }

    // la liste : un titre avec le nombre, la recherche juste au-dessus
    const liste = enfants(w).find(x => x.classList.contains("effl") || x.classList.contains("eff-vide"));
    const elig = enfants(w).find(x => x.matches("details.pli"));
    if (liste){
      const titre = el(`<div class="ong-eff-tete">${ONG.titre("Joueurs de " + e(eq), n)}</div>`);
      liste.before(titre);
      if (cherche){ if (n) titre.appendChild(cherche); else cherche.remove(); }
      if (liste.classList.contains("eff-vide")){
        liste.outerHTML = n ? ONG.vide("Aucun joueur trouvé", "Vérifie l'orthographe, ou efface la recherche.")
          : ONG.vide(`${e(eq)} n'a encore aucun joueur`, ouvert ? "Remplis le cadre ci-dessus." : "Touche « Importer depuis Footclubs » en haut pour toute la liste d'un coup, ou « + Ajouter un joueur » un par un.");
      } else {
        liste.querySelectorAll(".effj").forEach(j => {
          const nom = (j.querySelector(".effj-txt b") || {}).textContent || "";
          const x = j.querySelector('[data-a="del-joueur"]');
          if (x){ x.textContent = "✕"; x.setAttribute("title", "Retirer de l'équipe"); x.setAttribute("aria-label", `Retirer ${nom.trim()} de l'équipe`); }
          const av = j.querySelector(".effj-av"); if (av && !av.querySelector("img")) av.classList.add("ong-sans-photo");
        });
      }
    } else if (cherche && !n) cherche.remove();
    // « Peuvent aussi jouer » : replié, sous la liste, comme les autres blocs dépliants
    if (elig){
      const s = elig.querySelector("summary"), m = /·\s*(\d+)\s*$/.exec(s ? s.textContent : "");
      elig.removeAttribute("style");
      elig.classList.add("ong-pli", "ong-eff-elig");
      elig.dataset.ongPli = "eq-eff-elig";
      if (ONG.ouvert("eq-eff-elig", false)) elig.setAttribute("open", ""); else elig.removeAttribute("open");
      if (s) s.innerHTML = `<span class="plus" aria-hidden="true">+</span><span class="ong-pli-t">Peuvent aussi jouer avec ${e(eq)}${m ? `<span class="ong-nb">${m[1]}</span>` : ""}</span><span class="ong-pli-fl" aria-hidden="true">▾</span>`;
      w.appendChild(elig);
    }
  }

  /* =====================================================================
     COMPOS : la liste
     ===================================================================== */
  const AIDE_COMPOS = `<ol>
    <li>Touche <b>« + Nouvelle compo »</b>, ou un match de « À faire cette semaine ».</li>
    <li>Choisis le match : l'adversaire, la date et le lieu se remplissent tout seuls.</li>
    <li>Coche les joueurs convoqués, puis place-les sur le terrain.</li>
    <li><b>« Valider et prévenir »</b> publie la compo et prévient les convoqués sur leur téléphone. Le brouillon la garde pour plus tard.</li></ol>`;
  function rangerCompos(r){
    const tous = enfants(r);
    const barre = tous.find(x => x.classList.contains("eqb"));
    const chips = barre && barre.querySelector(".acc-chips");
    const btNew = barre && barre.querySelector('[data-a="nouvelle-compo"]');
    const afaire = tous.find(x => x.classList.contains("cp-afaire"));
    const liste = tous.find(x => x.classList.contains("cp-liste"));
    const vide = tous.find(x => x.classList.contains("ent-vide"));
    const passees = tous.find(x => x.matches("details.cp-passees"));
    const nAvenir = liste ? liste.querySelectorAll(".cp-carte").length : 0;

    const w = el(`<div class="ong-eq ong-eq-compos"></div>`);
    w.insertAdjacentHTML("beforeend", ONG.barre("Tes compos", "Prépare l'équipe de chaque match et préviens les joueurs convoqués.", ""));
    const act = w.querySelector(".ong-barre-act") || (() => { const a = el(`<div class="ong-barre-act"></div>`); w.querySelector(".ong-barre").appendChild(a); return a; })();
    if (btNew){ btNew.classList.add("ong-eq-princ"); act.appendChild(btNew); }
    const nbChips = chips ? chips.querySelectorAll("[data-a='compo-filtre']").length : 0;
    if (chips && nbChips > 2){                                            // filtre utile seulement avec plusieurs équipes
      const g = el(`<div class="ong-cp-filtre">${ONG.groupe("Équipe", "")}</div>`);
      const c = g.querySelector(".ong-groupe-c");
      [...chips.children].forEach(x => c.appendChild(x));
      w.appendChild(g);
    }
    w.insertAdjacentHTML("afterbegin", ONG.aide("eq-compos-aide", "Comment ça marche ?", AIDE_COMPOS));   // l'aide en premier, comme dans tous les onglets
    if (afaire){
      const n = afaire.querySelectorAll("[data-a='nouvelle-compo']").length;
      w.insertAdjacentHTML("beforeend", `${ONG.titre("À faire cette semaine", n)}<p class="quoi ong-cp-sous">Ces matchs n'ont pas encore de compo : touche-en un pour la commencer.</p>`);
      w.appendChild(afaire);
    }
    w.insertAdjacentHTML("beforeend", ONG.titre("Compos à venir", nAvenir));
    if (liste) w.appendChild(liste);
    else if (vide) w.insertAdjacentHTML("beforeend", ONG.vide("Aucune compo à venir", "Touche « + Nouvelle compo » en haut pour préparer ton prochain match."));
    if (passees){
      const s = passees.querySelector("summary"), m = /\((\d+)\)/.exec(s ? s.textContent : "");
      passees.classList.add("pli", "ong-pli", "ong-archive");                // le même bloc « passé » que dans les autres onglets
      passees.dataset.ongPli = "eq-cp-passees";
      if (ONG.ouvert("eq-cp-passees", false)) passees.setAttribute("open", ""); else passees.removeAttribute("open");
      if (s) s.innerHTML = `<span class="plus" aria-hidden="true">🗂</span><span class="ong-pli-t">Compos passées${m ? `<span class="ong-nb">${m[1]}</span>` : ""}</span><span class="ong-pli-fl" aria-hidden="true">▾</span>`;
      const corps = passees.querySelector(".cp-liste"); if (corps) corps.classList.add("pli-corps");
      w.appendChild(passees);
    }
    // les cartes : Modifier, Publier / Retirer du site, et Supprimer en rouge, à part
    w.querySelectorAll(".cp-carte[data-c]").forEach(c => {
      const a = c.querySelector(".cp-actions"); if (!a) return;
      const tg = a.querySelector('[data-a="toggle-compo"]');
      if (tg && /retirer/i.test(tg.textContent)) tg.textContent = "Retirer du site";
      const del = a.querySelector('[data-a="del-compo"]');
      if (del){
        const nv = el(`<button type="button" class="btn danger petit ong-eq-suppr" data-a="del-compo" title="Supprimer la compo" aria-label="Supprimer la compo"><span aria-hidden="true">🗑</span><span class="ong-eq-suppr-t">Supprimer</span></button>`);
        del.replaceWith(nv);
      }
    });
    r.replaceChildren(w);
  }

  /* =====================================================================
     COMPOS : l'éditeur (ordinateur) et la compo au téléphone
     ===================================================================== */
  const AIDE_EDITEUR = `<ol>
    <li>En haut : choisis l'<b>équipe</b>, le <b>match</b> (les infos se remplissent toutes seules) et le <b>système</b> de jeu.</li>
    <li>À gauche : <b>coche</b> les joueurs convoqués.</li>
    <li>Au centre : <b>glisse</b> chaque joueur sur sa place, ou touche une place puis un joueur.</li>
    <li>À droite : le banc, le capitaine, le rendez-vous et le mot du coach.</li>
    <li>Termine par <b>« Valider et prévenir »</b> : la compo est publiée et les convoqués sont prévenus.</li></ol>`;
  function titreCompo(c){
    const quand = c.date ? (typeof dateLongue === "function" ? dateLongue(c.date) : c.date) + (c.heure ? " · " + hFr(c.heure) : "") : "date à choisir";
    return { t: `${e(c.equipe)}${c.adv ? ` <span>contre</span> ${e(c.adv)}` : ` <span>· nouvelle compo</span>`}`,
      s: `${e(quand)} · ${c.dom ? "à domicile" : "à l'extérieur"}`, pub: !!c.publie };
  }
  function rangerEditeur(r){
    const cmp = r.querySelector(".cmp"); if (!cmp) return;
    const c = S.ui.compo || {};
    cmp.classList.add("ong-eq", "ong-eq-cmp");
    const barre = cmp.querySelector(".cmp-barre");
    if (barre){
      const fermer = barre.querySelector('[data-a="fermer-compo"]'), act = barre.querySelector(".cmp-actions"), compte = barre.querySelector(".cmp-compte");
      const labels = enfants(barre).filter(x => x.tagName === "LABEL");
      if (fermer) fermer.textContent = "← Retour aux compos";
      const br = act && act.querySelector('[data-pub="0"]'); if (br) br.textContent = "Enregistrer le brouillon";
      const t = titreCompo(c);
      const haut = el(`<div class="ong-cmp-haut"><div class="ong-cmp-titre" data-ong-affiche="titre"><b>${t.t}</b><small>${t.s}<span class="etiq ${t.pub ? "ok" : "attente"}">${t.pub ? "Publiée" : "Brouillon"}</span></small></div></div>`);
      if (fermer) haut.prepend(fermer);
      if (act) haut.appendChild(act);
      const regl = el(`<div class="ong-cmp-regl"></div>`);
      labels.forEach(l => regl.appendChild(l));
      if (compte) regl.appendChild(compte);
      barre.append(haut, regl);
      barre.insertAdjacentHTML("afterend", ONG.aide("eq-cmp-aide", "Comment ça marche ?", AIDE_EDITEUR));
    }
    const hb = cmp.querySelector(".cmp-bloc-banc > h3");
    if (hb){ const m = /(\d+)/.exec(hb.textContent); hb.innerHTML = `Banc et capitaine${m ? `<span class="ong-nb">${m[1]}</span>` : ""}`; }
    const hm = cmp.querySelector(".cmp-match > h3"); if (hm){ hm.removeAttribute("style"); hm.textContent = "Infos du match et rendez-vous"; }
    cmp.querySelectorAll(".cmp-champs label").forEach(l => {
      const ch = l.querySelector("[data-c]"); if (!ch) return;
      if (ch.dataset.c === "rdvHeure") libelle(l, "Rendez-vous à");
      if (ch.dataset.c === "dom") libelle(l, "Terrain");
      if (ch.dataset.c === "date" || ch.dataset.c === "rdvLieu") l.classList.add("large");   // la date en toutes lettres tient sur une ligne
    });
    const liste = cmp.querySelector(".cmp-liste > h3");
    if (liste && !cmp.querySelector(".ong-cmp-astuce")) liste.insertAdjacentHTML("afterend", `<p class="cmp-aide ong-cmp-astuce">Coche les joueurs du match.</p>`);
  }
  function rangerMobile(r){
    const mb = r.querySelector(".mb"); if (!mb) return;
    const c = S.ui.compo || {}, etape = S.ui.compoEtape === 2 ? 2 : 1;
    mb.classList.add("ong-eq", "ong-eq-mb");
    const tete = mb.querySelector(".mb-tete");
    if (tete){
      const sp = tete.querySelector(":scope > span");
      if (sp) sp.outerHTML = `<span class="ong-mb-etape" aria-label="Étape ${etape} sur 2"><i class="on"></i><i class="${etape === 2 ? "on" : ""}"></i>Étape ${etape} sur 2 · ${etape === 1 ? "le match" : "la compo"}</span>`;
    }
    const cartes = enfants(mb).filter(x => x.classList.contains("carte"));
    if (etape === 1){
      const [premiere] = cartes;
      if (premiere && !premiere.querySelector("h2")) premiere.insertAdjacentHTML("afterbegin", `<h2>Le match</h2>`);
      // le résumé du match (adversaire, quand, où) : remis à jour après une saisie, voir « le premier toucher » plus bas
      const resume = premiere && premiere.querySelector(":scope > .mb-resume, :scope > p.quoi");
      if (resume) resume.dataset.ongAffiche = "resume";
      const main = cartes.find(x => /match à la main/i.test((x.querySelector("h2") || {}).textContent || ""));
      if (main && premiere){ main.removeAttribute("style"); texte(main.querySelector("h2"), "Pas dans la liste ? Saisis le match"); premiere.after(main); }
      const conv = cartes.find(x => /convocation/i.test((x.querySelector("h2") || {}).textContent || ""));
      if (conv){ conv.removeAttribute("style"); texte(conv.querySelector("h2"), "Rendez-vous et mot du coach"); }
      const suiv = mb.querySelector('.mb-bas [data-a="cmp-etape"][data-k="2"]'); if (suiv) suiv.textContent = "Suivant : faire la compo →";
    } else {
      const bas = mb.querySelector(".mb-bas");
      if (bas){
        bas.classList.add("ong-mb-bas3");
        const pub = bas.querySelector('[data-pub="1"]'), br = bas.querySelector('[data-pub="0"]');
        if (br) br.textContent = "Brouillon";
        if (pub){ pub.textContent = c.publie ? "Mettre à jour et prévenir" : "Valider et prévenir"; pub.classList.add("ong-eq-princ"); bas.prepend(pub); }
      }
      const hb = cartes.map(x => x.querySelector(":scope > h2")).find(h => h && /banc/i.test(h.textContent));
      if (hb){ const m = /(\d+)/.exec(hb.textContent); hb.innerHTML = `Banc et capitaine${m ? `<span class="ong-nb">${m[1]}</span>` : ""}`; }
    }
  }

  /* =====================================================================
     ÉDITEUR DE COMPO : le premier toucher après une saisie ne se perd plus
     L'application garde chaque frappe dans S.ui.compo (événement input), puis, quand le champ perd le focus (événement change),
     redessine tout l'onglet (rendrePanneau). Or le champ perd le focus au moment où le doigt (ou la souris) s'enfonce sur un
     bouton : ce bouton est remplacé entre l'appui et le clic, et le clic se perd (« Suivant », « Brouillon », « Valider et
     prévenir », « ← Compos », une place du terrain, le champ suivant…). Il fallait toucher deux fois.
     Pour les champs texte de l'éditeur (adversaire, lieu du rendez-vous, mot du coach) : l'application enregistre la valeur
     exactement comme avant, mais on retient son redessin pendant ce « change ». Une fois le clic passé, on remet à jour ce qui
     affiche ces champs (le titre au PC, le résumé du match au téléphone), sans toucher aux champs ni aux boutons. Si le bouton
     touché a déjà redessiné l'onglet (étape suivante, enregistrement…), il n'y a rien à faire.
     ===================================================================== */
  const CHAMP_TEXTE = 'input[data-c]:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea[data-c]';
  let retenir = false, retenu = false, appui = false, apres = null, secours = 0;
  if (typeof window.rendrePanneau === "function"){
    const rendreAvant = window.rendrePanneau;
    window.rendrePanneau = function(){
      if (retenir){ retenu = true; return; }                                // le redessin demandé pendant ce change attend le clic
      return rendreAvant.apply(this, arguments);
    };
  }
  // ce qui ne fait qu'afficher la compo ([data-ong-affiche]) : remplacé par sa nouvelle version, si l'éditeur est toujours là
  function majAffichage(racine){
    if (!racine || !racine.isConnected || !S.ui.compo || S.ui.onglet !== "compos") return;
    const vieux = racine.querySelectorAll("[data-ong-affiche]"); if (!vieux.length) return;
    let neuf; try { neuf = el(`<div>${window.panCompoEditeur()}</div>`); } catch(err){ return; }
    vieux.forEach(x => {
      const n = neuf && neuf.querySelector(`[data-ong-affiche="${x.dataset.ongAffiche}"]`);
      if (n && n.outerHTML !== x.outerHTML) x.replaceWith(n);
    });
  }
  // l'appui fini (souris relâchée, doigt levé : le clic vient d'être envoyé), on lance la mise à jour
  const lancer = () => { clearTimeout(secours); const f = apres; apres = null; if (f) setTimeout(f, 0); };
  window.addEventListener("mousedown", () => { appui = true; }, true);
  ["mouseup", "dragend", "pointercancel"].forEach(t => window.addEventListener(t, () => { appui = false; if (apres) lancer(); }, true));
  // fin du change : si l'application voulait redessiner, la mise à jour de l'affichage attend la fin de l'appui
  function finChange(){
    if (!retenir) return;
    retenir = false;
    if (!retenu) return;
    const racine = document.querySelector("#panneau .cmp, #panneau .mb");
    apres = () => majAffichage(racine);
    if (appui){ clearTimeout(secours); secours = setTimeout(lancer, 3000); } else lancer();   // filet : jamais plus de 3 s d'attente
  }
  window.addEventListener("change", ev => {                                // avant tous les écouteurs de la page
    const t = ev.target, p = document.getElementById("panneau");
    if (!S.ui.compo || S.ui.onglet !== "compos" || !p || !t || !t.matches || !t.matches(CHAMP_TEXTE) || !p.contains(t)) return;
    retenir = true; retenu = false;
    setTimeout(finChange, 0);                                              // filet, si l'événement n'arrivait pas jusqu'en haut
  }, true);
  window.addEventListener("change", finChange);                            // après tous les écouteurs de la page

  /* ---------- une recherche sans lettre ni chiffre (« - », « . », « ' ») ----------
     L'application compare avec slug(recherche), qui vaut « x » quand il ne reste aucune lettre : tout le monde disparaissait.
     On la traite comme une recherche vide ; le champ garde ce qui a été tapé. */
  const sansMot = q => !/[0-9a-z]/i.test(String(q || "").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
  const rechercheSansMot = (nom, cle, champ) => {
    if (typeof window[nom] !== "function") return;
    const avant = window[nom];
    window[nom] = function(){
      const q = S.ui[cle];
      if (typeof q !== "string" || !q.trim() || !sansMot(q)) return avant.apply(this, arguments);
      S.ui[cle] = "";
      let h; try { h = avant.apply(this, arguments); } finally { S.ui[cle] = q; }
      return champ ? ONG.transformer(h, r => { const c = r.querySelector(champ); if (c) c.setAttribute("value", q); }) : h;
    };
  };
  rechercheSansMot("panEffectifs", "chercheEff", "[data-cherche-eff]");          // Effectifs
  rechercheSansMot("panCompoEditeur", "chercheJoueur", "[data-cherche-joueur]"); // compo, liste des joueurs (PC)
  rechercheSansMot("listeChoixHtml", "chercheChoix", null);                      // compo, fenêtre « choisir un joueur »

  /* ---------- branchements ---------- */
  const brancher = (nom, fn) => {
    if (typeof window[nom] !== "function") return;
    const avant = window[nom];
    window[nom] = function(){ const h = avant.apply(this, arguments); return ONG.transformer(h, fn); };
  };
  brancher("panEntrainements", rangerEntrainements);
  brancher("panEffectifs", rangerEffectifs);
  brancher("panCompos", rangerCompos);
  // panCompoEditeur rend la version téléphone (panCompoMobile) sous 860 px : on range l'une ou l'autre
  brancher("panCompoEditeur", r => { if (r.querySelector(".mb")) rangerMobile(r); else rangerEditeur(r); });

  /* ---------- styles ---------- */
  const S0 = "body.sur-espace #panneau";
  const css = document.createElement("style");
  css.id = "onglets-equipes-css";
  css.textContent = `
/* ===== barre d'équipe : l'équipe, ses chiffres, les actions ===== */
${S0} .ong-eq .ong-eq-barre{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr) auto;align-items:center;gap:14px 20px;margin:0 0 14px;padding:16px 20px;
  border-radius:20px;border:1px solid rgba(143,168,240,.22);background:linear-gradient(180deg,rgba(26,44,96,.6),rgba(14,26,60,.6));box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 16px 36px rgba(3,8,24,.28)}
${S0} .ong-eq .ong-eq-barre .eqb-eq{display:grid!important;gap:6px;margin:0;min-width:0}
${S0} .ong-eq .ong-eq-barre .eqb-eq>span{font:800 12px var(--corps);letter-spacing:.12em;text-transform:uppercase;color:#AFC0EA}
${S0} .ong-eq .ong-eq-barre .eqb-eq select{width:100%;min-width:0;font-weight:800;font-size:17px}
${S0} .ong-eq .ong-eq-seule .eqb-eq select{display:none}
${S0} .ong-eq .ong-eq-nom{font:800 26px/1.1 var(--display);color:#fff}
${S0} .ong-eq .ong-eq-barre .eqb-chiffres{gap:8px;min-width:0}
${S0} .ong-eq .ong-eq-barre .eqb-chiffres>div{padding:7px 14px;background:rgba(143,168,240,.12)}
${S0} .ong-eq .ong-eq-barre .eqb-chiffres small{color:#C9D4F2}
${S0} .ong-eq .ong-eq-barre .eqb-actions{margin:0;justify-content:flex-end;flex-wrap:nowrap;gap:10px}
${S0} .ong-eq .ong-eq-barre .eqb-actions .btn{min-height:46px;white-space:nowrap}
${S0} .ong-eq .ong-ent-h{display:flex;align-items:center;gap:10px;font:800 20px var(--display);margin:0}
/* le « + » des blocs dépliants : à sa place dans le titre (la classe .plus du site est aussi un menu fixe) */
${S0} .ong-eq .pli>summary .plus{position:static;inset:auto;padding:0;box-shadow:none;border:0;z-index:auto;flex:none}
/* les blocs repliés (compos passées, peuvent aussi jouer) : secondaires, donc à la taille d'un titre de section, le nombre bien aligné */
${S0} .ong-eq .ong-pli>summary{font-size:21px;padding:14px 18px;min-height:58px}
${S0} .ong-eq .ong-pli-t{display:block;line-height:1.25}
/* le nombre suit le dernier mot, même quand le titre passe sur deux lignes (téléphone) */
${S0} .ong-eq .ong-pli-t .ong-nb,${S0} .ong-eq .ong-ent-h .ong-nb{vertical-align:middle;margin-left:10px;position:relative;top:-2px}
/* ===== entraînements ===== */
${S0} .ong-eq-ent .ong-ent-cr{padding:18px 20px}
${S0} .ong-eq-ent .ong-ent-cr-tete{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px}
${S0} .ong-eq-ent .ong-ent-cr-tete .quoi{margin:4px 0 0;font-size:14.5px}
${S0} .ong-eq-ent .ong-ent-cr-tete .btn{flex:none;white-space:nowrap;min-height:44px}
${S0} .ong-eq-ent .ong-ent-cr-tete .ong-ent-h{display:block;line-height:1.2}
${S0} .ong-eq-ent .ong-ent-ligne{display:grid;grid-template-columns:170px 140px minmax(0,1fr) auto;align-items:end;gap:12px;padding:12px 14px;margin:0 0 8px}
${S0} .ong-eq-ent .ong-ent-ligne label{margin:0;min-width:0}
${S0} .ong-eq-ent .ong-ent-ligne .btn.danger{min-height:48px}
${S0} .ong-eq-ent .ong-ent-aucun{margin:0 0 6px;padding:12px 14px;border-radius:12px;background:rgba(143,168,240,.08)}
${S0} .ong-eq-ent .ong-ent-add{margin-top:10px}
${S0} .ong-eq-ent .ong-ent-sem{margin:4px 0 14px;padding:12px 14px 14px;border-radius:18px;border:1px solid rgba(143,168,240,.16);background:rgba(10,20,48,.35)}
${S0} .ong-eq-ent .ong-ent-sem .ent-nav{margin:0 0 10px}
${S0} .ong-eq-ent .ong-ent-sem .ent-jours{margin:0}
${S0} .ong-eq-ent .ent-fl{width:46px;height:46px;flex:none}
${S0} .ong-eq-ent .ent-titre b{font-size:21px}
${S0} .ong-eq-ent .ent-carte{border-radius:18px;padding:14px 16px;border-color:rgba(143,168,240,.2);background:linear-gradient(180deg,rgba(26,44,96,.45),rgba(14,26,60,.45))}
${S0} .ong-eq-ent .ent-carte .ent-date{align-self:start;align-content:center;min-height:60px}
${S0} .ong-eq-ent .ent-carte.ent-match{border-left:4px solid #E3B64C}
${S0} .ong-eq-ent .ent-carte .en-det summary{min-height:36px;display:flex;align-items:center;gap:6px}
${S0} .ong-eq-ent .ent-carte .en-det summary::before,${S0} .ong-eq-eff .ong-eff-coller>summary::before{content:"▸";transition:transform .2s}
${S0} .ong-eq-ent .ent-carte .en-det[open] summary::before,${S0} .ong-eq-eff .ong-eff-coller[open]>summary::before{transform:rotate(90deg)}
${S0} .ong-eq-ent .ong-ent-rien{color:#AFC0EA;font-size:13.5px}
/* ===== effectifs ===== */
${S0} .ong-eq-eff .ong-eff-cadre{padding:18px 20px}
${S0} .ong-eq-eff .ong-eff-cadre-tete{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 12px}
${S0} .ong-eq-eff .ong-eff-form{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr) auto;align-items:end;gap:14px;margin:0}
${S0} .ong-eq-eff .ong-eff-form>label{margin:0}
${S0} .ong-eq-eff .ong-eff-form .btn{min-height:48px}
${S0} .ong-eq-eff .ong-eff-etapes{margin:0 0 14px 22px;padding:0;display:grid;gap:6px;color:#D5DEFA;line-height:1.5}
${S0} .ong-eq-eff .ong-eff-fichier{text-transform:none;letter-spacing:.1px;min-height:50px;padding:12px 22px;font-size:16px}
${S0} .ong-eq-eff .ong-eff-import .btns{margin:0 0 12px}
${S0} .ong-eq-eff .ong-eff-res{display:flex;flex-wrap:wrap;align-items:flex-end;gap:12px}
${S0} .ong-eq-eff .ong-eff-res .btn.danger{margin-left:auto}
${S0} .ong-eq-eff .ong-eff-coller>summary{cursor:pointer;color:#AFC0EA;font-weight:700;min-height:44px;display:flex;align-items:center;gap:8px;list-style:none}
${S0} .ong-eq-eff .ong-eff-coller>summary::-webkit-details-marker{display:none}
${S0} .ong-eq-eff .ong-eff-tete{display:flex;align-items:center;justify-content:space-between;gap:12px 16px;flex-wrap:wrap;margin:22px 0 12px}
${S0} .ong-eq-eff .ong-eff-tete .ong-titre{margin:0}
${S0} .ong-eq-eff .ong-eff-tete .eff-cherche{flex:0 1 420px;width:auto;margin:0}
${S0} .ong-eq-eff .effl{gap:10px;grid-template-columns:repeat(auto-fill,minmax(340px,1fr))}
${S0} .ong-eq-eff .effj{min-height:72px;border-radius:16px;border-color:rgba(143,168,240,.2);background:linear-gradient(180deg,rgba(26,44,96,.5),rgba(14,26,60,.5))}
${S0} .ong-eq-eff .effj[data-j],:root[data-theme="light"] ${S0} .ong-eq-eff .effj[data-j]{border-left:4px solid var(--c)}   /* la couleur de la catégorie d'âge */
${S0} .ong-eq-eff .effj-av{align-content:center;justify-items:center;width:52px;height:52px}
${S0} .ong-eq-eff .effj-av span{line-height:1;color:#fff}
${S0} .ong-eq-eff .effj-av.ong-sans-photo i{opacity:.9;height:17px}
${S0} .ong-eq-eff .effj-x{width:40px;height:40px;border-radius:12px;border:1px solid rgba(248,113,113,.45);color:#FCA5A5;background:rgba(220,38,38,.06);font-size:16px;margin-left:4px}
${S0} .ong-eq-eff .effj-x:hover{background:rgba(220,38,38,.2);border-color:#F87171;color:#FECACA}
${S0} .ong-eq-eff .ong-eff-elig{margin:22px 0 0}
${S0} .ong-eq-eff .ong-eff-elig .elig-liste{margin-top:14px}
/* ===== compos : la liste ===== */
${S0} .ong-eq-compos .ong-cp-filtre{margin:0 0 6px}
${S0} .ong-eq-compos .ong-cp-filtre .acc-chip{min-height:44px;padding:8px 16px}
${S0} .ong-eq-compos .ong-cp-sous{margin:-4px 0 12px;font-size:14.5px}
/* « À faire cette semaine » : des tuiles assez larges pour lire le match et sa date d'un coup d'œil */
${S0} .ong-eq-compos .cp-afaire{grid-template-columns:repeat(auto-fill,minmax(420px,1fr))}
${S0} .ong-eq-compos .cp-afaire .tb-item{min-height:64px;border-radius:18px}
@media (max-width:520px){ ${S0} .ong-eq-compos .cp-afaire{grid-template-columns:minmax(0,1fr)} }
${S0} .ong-eq-compos .ong-titre:first-of-type{margin-top:22px}
${S0} .ong-eq-compos .cp-liste{display:grid;gap:10px}
${S0} .ong-eq-compos .cp-carte{border-radius:18px;padding:14px 16px;border-color:rgba(143,168,240,.2);background:linear-gradient(180deg,rgba(26,44,96,.5),rgba(14,26,60,.5))}
${S0} .ong-eq-compos .cp-carte.pub,:root[data-theme="light"] ${S0} .ong-eq-compos .cp-carte.pub{border-left:4px solid #22C55E}
${S0} .ong-eq-compos .cp-carte .ent-date{min-height:64px;align-content:center}
${S0} .ong-eq-compos .cp-actions{gap:10px}
${S0} .ong-eq-compos .cp-actions .btn.petit{min-height:44px}
${S0} .ong-eq-compos .ong-eq-suppr{margin-left:14px;position:relative}
${S0} .ong-eq-compos .ong-eq-suppr::before{content:"";position:absolute;left:-13px;top:8px;bottom:8px;width:1px;background:rgba(143,168,240,.22)}
${S0} .ong-eq-compos .cp-passees{margin-top:22px}
${S0} .ong-eq-compos .cp-passees>summary{margin:0;color:inherit}
${S0} .ong-eq-compos .cp-passees .pli-corps{display:grid;gap:10px;padding-top:14px}
${S0} .ong-eq-compos .cp-passees .cp-carte{opacity:.85}
/* ===== l'éditeur de compo (ordinateur) ===== */
${S0} .ong-eq-cmp .cmp-barre{display:grid;gap:14px;padding:16px 18px;border-radius:20px;align-items:stretch}
${S0} .ong-eq-cmp .ong-cmp-haut{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
${S0} .ong-eq-cmp .ong-cmp-titre{flex:1;min-width:220px;display:grid;gap:4px}
${S0} .ong-eq-cmp .ong-cmp-titre b{font:800 24px/1.15 var(--display);color:#fff}
${S0} .ong-eq-cmp .ong-cmp-titre b span{font:600 17px var(--corps);color:#C9D4F2}
${S0} .ong-eq-cmp .ong-cmp-titre small{display:flex;align-items:center;gap:10px;flex-wrap:wrap;color:#C9D4F2;font-size:14.5px}
${S0} .ong-eq-cmp .ong-cmp-haut .cmp-actions{margin-left:auto;gap:10px}
${S0} .ong-eq-cmp .ong-cmp-regl{display:grid;grid-template-columns:minmax(150px,200px) minmax(200px,1.3fr) minmax(150px,200px) auto;align-items:end;gap:12px 14px;
  padding-top:14px;border-top:1px solid rgba(255,255,255,.14)}
${S0} .ong-eq-cmp .ong-cmp-regl label{margin:0;min-width:0}
${S0} .ong-eq-cmp .ong-cmp-regl .cmp-compte{margin:0;justify-content:flex-end;padding-bottom:8px}
${S0} .ong-eq-cmp .cmp-barre+.ong-aide{margin-top:-2px}
${S0} .ong-eq-cmp .cmp-col{border-radius:18px;padding:16px}
${S0} .ong-eq-cmp .cmp-col h3,${S0} .ong-eq-cmp .cmp-centre h3{display:flex;align-items:center;gap:10px}
${S0} .ong-eq-cmp .ong-cmp-astuce{margin:-4px 0 10px}
${S0} .ong-eq-cmp .cmp-match{margin-top:18px;padding-top:16px;border-top:1px solid rgba(143,168,240,.18)}
${S0} .ong-eq-cmp .cmp-match>h3{margin:0 0 10px}
${S0} .ong-eq-cmp .cmp-bloc-banc>label{display:grid;gap:6px}
/* une seule case « ajouter au banc » suffit */
${S0} .ong-eq-cmp .cmp-banc .chip-vide~.chip-vide,${S0} .ong-eq-mb .cmp-banc .chip-vide~.chip-vide{display:none}
/* tablette (une seule colonne) : dans l'ordre du travail — convoquer, placer, puis banc et infos du match */
@media (max-width:1100px){
  ${S0} .ong-eq-cmp .cmp-liste{order:1}
  ${S0} .ong-eq-cmp .cmp-centre{order:2}
  ${S0} .ong-eq-cmp .cmp-droite{order:3}
}
@media (max-width:1240px){
  ${S0} .ong-eq-cmp .ong-cmp-regl{grid-template-columns:repeat(3,minmax(0,1fr))}
  ${S0} .ong-eq-cmp .ong-cmp-regl .cmp-compte{grid-column:1/-1;justify-content:flex-start;padding:0}
}
/* ===== la compo au téléphone ===== */
${S0} .ong-eq-mb .mb-tete{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 12px;align-items:center}
${S0} .ong-eq-mb .mb-tete b{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
${S0} .ong-eq-mb .mb-tete .btn{min-height:44px}
${S0} .ong-eq-mb .ong-mb-etape{grid-column:1/-1;display:flex;align-items:center;gap:6px;color:#C9D4F2;font:700 13.5px var(--corps)}
${S0} .ong-eq-mb .ong-mb-etape i{width:26px;height:6px;border-radius:3px;background:rgba(143,168,240,.25)}
${S0} .ong-eq-mb .ong-mb-etape i.on{background:#2F6BFF}
${S0} .ong-eq-mb .ong-mb-etape i:last-of-type{margin-right:6px}
${S0} .ong-eq-mb>.carte{margin:0 0 14px}
${S0} .ong-eq-mb>.carte>h2:first-child{font-size:21px}
${S0} .ong-eq-mb>.carte>label:first-child{margin-top:0}
${S0} .ong-eq-mb .mb-bas{margin-top:6px;padding:10px 0}
${S0} .ong-eq-mb .ong-mb-bas3{display:grid;grid-template-columns:1fr 1fr;gap:8px}
${S0} .ong-eq-mb .ong-mb-bas3 .ong-eq-princ{grid-column:1/-1}
${S0} .ong-eq-mb .mb-bas .btn{min-height:50px;font-size:16px;padding:10px 8px}
${S0} .ong-eq-mb .chip-vide,${S0} .ong-eq-mb .chip-j{min-height:44px}
/* #panneau coupe ce qui dépasse en largeur : « clip » au lieu de « hidden » pour que les boutons du bas (téléphone) et les colonnes de l'éditeur (ordinateur) restent collés à l'écran */
${S0}:has(.ong-eq-mb),${S0}:has(.ong-eq-cmp){overflow:visible;overflow-x:clip}
@media (max-width:1140px){
  body.avec-barre #panneau .ong-eq-mb .mb-bas{bottom:calc(67px + env(safe-area-inset-bottom,0px))}
  /* le site cache toutes les .plus sous 1140 px (c'est aussi un menu fixe) : on remet le « + » des blocs dépliants */
  ${S0} .ong-eq .pli>summary .plus{display:grid!important}
}
/* ===== thème clair ===== */
:root[data-theme="light"] ${S0} .ong-eq .ong-eq-barre{background:var(--carte);box-shadow:0 10px 26px rgba(7,18,48,.08);border-color:#D5DEF5}
:root[data-theme="light"] ${S0} .ong-eq .ong-eq-barre .eqb-eq>span,:root[data-theme="light"] ${S0} .ong-eq .ong-eq-barre .eqb-chiffres small,
:root[data-theme="light"] ${S0} .ong-eq-ent .ong-ent-rien,:root[data-theme="light"] ${S0} .ong-eq-eff .ong-eff-coller>summary{color:var(--texte-doux)}
:root[data-theme="light"] ${S0} .ong-eq .ong-eq-nom{color:var(--texte)}
:root[data-theme="light"] ${S0} .ong-eq-eff .ong-eff-etapes{color:var(--texte)}
:root[data-theme="light"] ${S0} .ong-eq-ent .ong-ent-sem{background:var(--carte);border-color:#D5DEF5}
:root[data-theme="light"] ${S0} .ong-eq-ent .ent-carte.ent-match{border-left-color:#E3B64C}
:root[data-theme="light"] ${S0} .ong-eq-ent .ent-carte,:root[data-theme="light"] ${S0} .ong-eq-eff .effj,:root[data-theme="light"] ${S0} .ong-eq-compos .cp-carte{background:var(--carte);border-color:#D5DEF5}
:root[data-theme="light"] ${S0} .ong-eq-eff .effj-x{color:#B91C1C;border-color:#F3A6A6;background:#FFF5F5}
:root[data-theme="light"] ${S0} .ong-eq-mb .ong-mb-etape{color:var(--texte-doux)}
/* thème clair : la règle sombre des champs (habillage) l'emporte sur la claire ; on la corrige ici pour nos onglets */
:root[data-theme="light"] ${S0} .ong-eq input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=color]):not([type=file]){background:#fff;color:var(--texte);border-color:#C9D4F2}
:root[data-theme="light"] ${S0} .ong-eq input::placeholder{color:#7C87A6}
:root[data-theme="light"] ${S0} .ong-eq .ong-nb{background:rgba(28,63,158,.1);color:var(--texte)}
:root[data-theme="light"] ${S0} .ong-eq .btn.danger{color:#B91C1C;border-color:#F3A6A6;background:#FFF5F5}
:root[data-theme="light"] ${S0} .ong-eq-eff .effj-av span{color:#fff}
/* la barre de l'éditeur reste bleu foncé : libellés et boutons clairs */
:root[data-theme="light"] ${S0} .ong-eq-cmp .cmp-barre label{color:#C9D4F2}
:root[data-theme="light"] ${S0} .ong-eq-cmp .cmp-barre .btn.contour{color:#fff;border-color:rgba(255,255,255,.4);background:rgba(255,255,255,.08)}
/* ===== téléphone ===== */
@media (max-width:760px){
  ${S0} .ong-eq .ong-eq-barre{grid-template-columns:minmax(0,1fr);gap:12px;padding:14px}
  ${S0} .ong-eq .ong-eq-barre .eqb-chiffres>div{padding:5px 11px}
  ${S0} .ong-eq .ong-eq-barre .eqb-chiffres b{font-size:16px}
  ${S0} .ong-eq .ong-eq-barre .eqb-actions{display:grid;grid-template-columns:minmax(0,1fr);width:100%}
  ${S0} .ong-eq .ong-eq-barre .eqb-actions .ong-eq-princ{order:-1;min-height:50px}
  ${S0} .ong-eq .ong-eq-barre .eqb-actions .btn{white-space:normal}
  ${S0} .ong-eq-ent .ong-ent-cr{padding:14px}
  ${S0} .ong-eq-ent .ong-ent-ligne{grid-template-columns:minmax(0,1fr) minmax(0,1fr);padding:12px}
  ${S0} .ong-eq-ent .ong-ent-ligne label:nth-of-type(3){grid-column:1/-1}
  ${S0} .ong-eq-ent .ong-ent-ligne .btn.danger{grid-column:1/-1;min-height:44px}
  ${S0} .ong-eq-ent .ong-ent-add .btn{width:100%}
  ${S0} .ong-eq-ent .ong-ent-sem{padding:10px}
  ${S0} .ong-eq-ent .ent-titre b{font-size:17px}
  ${S0} .ong-eq-ent .ent-nav{gap:8px}
  ${S0} .ong-eq-ent .ent-carte{padding:12px}
  ${S0} .ong-eq-ent .ent-corps .btn{justify-self:stretch}
  ${S0} .ong-eq-eff .ong-eff-cadre{padding:14px}
  ${S0} .ong-eq-eff .ong-eff-form{grid-template-columns:minmax(0,1fr)}
  ${S0} .ong-eq-eff .ong-eff-fichier{width:100%}
  ${S0} .ong-eq-eff .ong-eff-res>*{width:100%;max-width:none!important}
  ${S0} .ong-eq-eff .ong-eff-res .btn.danger{margin-left:0}
  ${S0} .ong-eq-eff .ong-eff-tete .eff-cherche{flex:1 1 100%}
  ${S0} .ong-eq-compos .cp-actions{display:grid;grid-template-columns:1fr 1fr auto;gap:8px}
  ${S0} .ong-eq-compos .ong-eq-suppr{margin-left:6px;min-width:46px;padding:8px 10px}
  ${S0} .ong-eq-compos .ong-eq-suppr::before{left:-8px}
  ${S0} .ong-eq-compos .ong-eq-suppr-t{display:none}
  ${S0} .ong-eq-compos .ong-cp-filtre .ong-groupe-c{flex-wrap:nowrap;overflow-x:auto;padding-bottom:4px;-webkit-overflow-scrolling:touch}
  ${S0} .ong-eq-compos .ong-cp-filtre .acc-chip{flex:none}
}
@media (max-width:420px){
  ${S0} .ong-eq-eff .ong-eff-cadre-tete{flex-wrap:wrap}
  ${S0} .ong-eq .ong-pli>summary{font-size:19px;padding:12px 14px}
}`;
  document.head.appendChild(css);
})();
