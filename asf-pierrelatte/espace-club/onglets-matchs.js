/* Onglets Matchs et plateaux › Vétérans et Tournois, rangés pour que ce soit simple.
   Vétérans :
   - en tête « Matchs des vétérans » avec « + Ajouter un match » ; la longue phrase grise devient « Comment ça marche ? » replié ;
   - les matchs rangés par ce qu'il y a à faire : « Prochain match » bien en vue, « Scores à saisir » en orange,
     « Ensuite » (les autres à venir), « Déjà joués » (score en vert, gris ou rouge) ;
   - la fiche ouverte rangée en blocs : le match, quand, où, le score (en premier quand il reste à saisir) ;
     « Supprimer » à l'écart d'« Enregistrer ».
   Tournois : quatre étapes bien visibles.
   1. Le tournoi  2. Les équipes  3. Le tirage au sort (dans « Créer un tournoi »), puis l'écran du tirage,
   4. Les poules et résultats (l'écran « Gérer » : poules, classements, scores, phase finale ; « Supprimer » tout en bas).
   Ajouté sans modifier le script de l'application : on reprend le HTML de panVeterans / panTournois et on déplace ses
   éléments (tous les data-a, data-vc, data-nt, data-m, data-s, data-t, ids et formulaires sont gardés tels quels). */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof ONG === "undefined") return;
  const e = ONG.e;
  const pl = (n, s, p) => n + " " + (n > 1 ? (p || s + "s") : s);
  const maj1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const elt = html => { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  /* les éléments du premier niveau (le HTML rendu est un fragment : « :scope > » n'y marche pas) */
  const haut = (racine, sel) => [...racine.children].filter(x => x.matches(sel));
  /* le premier texte d'un libellé (avant son champ) */
  const libelle = (label, txt) => { if (!label) return; const n = [...label.childNodes].find(x => x.nodeType === 3 && x.textContent.trim()); if (n) n.textContent = txt; };
  /* remplace le contenu de la racine par le nouveau rangement ; ce qui n'a pas été repris (inconnu) est gardé à la fin */
  function monter(racine, html, places, jeter){
    (jeter || []).forEach(x => x && x.remove && x.remove());
    const t = document.createElement("template"); t.innerHTML = html;
    const z = t.content;
    z.querySelectorAll("[data-ong-place]").forEach(p => {
      const v = places[p.dataset.ongPlace], l = (Array.isArray(v) ? v : [v]).filter(Boolean);
      if (l.length) p.replaceWith(...l); else p.remove();
    });
    const reste = [...racine.childNodes].filter(x => x.nodeType === 1 || (x.nodeType === 3 && x.textContent.trim()));
    const garde = z.firstElementChild || z;
    reste.forEach(x => garde.appendChild(x));
    while (racine.firstChild) racine.firstChild.remove();
    racine.appendChild(z);
  }
  const jours = d => { try { return Math.round((jd(d) - jd(aujourdhui())) / 864e5); } catch(err){ return null; } };
  const dans = n => n === 0 ? "Aujourd'hui" : n === 1 ? "Demain" : n > 1 ? `Dans ${n} jours` : "";

  /* =====================================================================
     VÉTÉRANS
     ===================================================================== */
  if (typeof window.panVeterans === "function"){
    const AIDE_VET = `<ol>
        <li>Touche <b>« + Ajouter un match »</b> : il s'ouvre tout seul. Choisis l'adversaire, la date et le lieu, puis touche <b>« Enregistrer »</b>.</li>
        <li>Le match apparaît dans le calendrier du site et part sur les affiches du lundi à 9 h. Semaine sans match saisi : rien n'est publié.</li>
        <li>Après le match, touche-le dans <b>« Scores à saisir »</b>, mets le score et enregistre : l'affiche des résultats part toute seule.</li>
      </ol>`;
    const docVet = id => (S.matchs || []).find(x => x.id === id) || { id };
    const cleVet = m => (m.date || "") + (m.heure || "");

    /* carte repliée : une étiquette claire selon ce qu'il y a à faire */
    function decorerRepliee(x, genre){
      const a = x.a, bt = a.querySelector(".pl-tete"); if (!bt) return;
      const txt = bt.querySelector(".pl-txt"), vide = bt.querySelector(".pl-vide"), modif = bt.querySelector(".pl-modif"), score = bt.querySelector(".pl-score");
      if (genre === "saisir"){
        if (vide) vide.remove();
        if (txt) txt.insertAdjacentHTML("beforeend", `<span class="ong-vet-puce saisir">Score à saisir</span>`);
        if (modif) modif.textContent = "✏️ Mettre le score";
      }
      if (genre === "prochain" && txt){
        const n = jours(x.m.date), quand = x.m.date ? maj1(dateLongue(x.m.date)) + (x.m.heure ? " à " + hFr(x.m.heure) : "") : "";
        txt.insertAdjacentHTML("beforeend", `<span class="ong-vet-puce prochain">${e(dans(n) || "Bientôt")}${quand ? " · " + e(quand) : ""}</span>`);
      }
      if (genre === "joue" && score){
        const i = issue(x.m);
        score.classList.add("ong-vet-" + i);
        score.title = ISSUE_L[i] || "";
      }
    }
    /* carte ouverte : des blocs dans l'ordre le match → quand → où → score (le score d'abord quand il reste à saisir) */
    function rangerOuverte(x, genre){
      const a = x.a, g = a.querySelector(".grille"), btns = a.querySelector(".btns");
      a.classList.add("ong-vet-ouverte");
      if (!g) return;
      const lab = k => { const i = g.querySelector(`[data-vc="${k}"]`); return i ? i.closest("label") : null; };
      const v = x.v, adv = String(v.adv || "").replace(/\s+\d+$/, "");
      const tb = a.querySelector(".an-tete > div:not(.bdate) > b");                      // même écriture du club que sur la carte repliée
      if (tb && adv) tb.textContent = v.dom === false ? joliClub(adv) + " – Pierrelatte" : "Pierrelatte – " + joliClub(adv);
      libelle(lab("adresse"), "Adresse du stade (pour Waze et Google Maps)");
      libelle(lab("bp"), "Pierrelatte");
      libelle(lab("bc"), adv ? joliClub(adv) : "Adversaire");
      const bloc = (titre, cls, labels, note) => {
        const d = elt(`<div class="ong-vet-bloc ${cls}"><h4>${titre}</h4><div class="ong-vet-champs"></div>${note ? `<p class="ong-vet-note">${note}</p>` : ""}</div>`);
        const c = d.querySelector(".ong-vet-champs"); labels.filter(Boolean).forEach(l => c.appendChild(l)); return d;
      };
      const passe = genre === "saisir" || genre === "joue";
      const scores = v.dom === false ? [lab("bc"), lab("bp")] : [lab("bp"), lab("bc")];      // dans l'ordre du titre « domicile – extérieur »
      const bScore = bloc("Score", "ong-vb-score", scores, passe ? "Mets le score puis touche « Enregistrer » : l'affiche des résultats part toute seule."
        : "À remplir après le match : l'affiche des résultats partira toute seule.");
      const ch = bScore.querySelector(".ong-vet-champs"); if (ch.children.length === 2) ch.children[0].after(elt(`<span class="ong-vet-tiret" aria-hidden="true">–</span>`));
      const blocs = elt(`<div class="ong-vet-blocs"></div>`);
      const bMatch = bloc("Le match", "ong-vb-match", [lab("adv"), lab("comp")]);
      const l = [bMatch, bloc("Quand", "ong-vb-quand", [lab("date"), lab("heure")]), bloc("Où", "ong-vb-ou", [lab("dom"), lab("adresse")])];
      if (passe) l.unshift(bScore); else l.push(bScore);
      l.forEach(b => blocs.appendChild(b));
      [...g.children].forEach(r => bMatch.querySelector(".ong-vet-champs").appendChild(r));   // un champ inconnu : gardé
      g.replaceWith(blocs);
      if (btns){
        btns.classList.add("ong-vet-btns");
        const del = btns.querySelector('[data-a="vet-del"]');
        if (del){ del.classList.add("ong-a-part"); btns.appendChild(del); }
      }
    }
    const avantVet = window.panVeterans;
    window.panVeterans = function(){
      const h = avantVet.apply(this, arguments);
      return ONG.transformer(h, racine => {
        const auj = aujourdhui();
        const ajout = racine.querySelector('[data-a="vet-ajout"]');
        const l = [...racine.querySelectorAll("article.an-carte[data-vet]")].map(a => { const m = docVet(a.dataset.vet); return { a, m, v: avecBrouillonVet(m) }; });
        // rangé d'après le match enregistré : une fiche ne change pas de liste tant qu'elle n'est pas enregistrée
        const joues = l.filter(x => joue(x.m)).sort((p, q) => cleVet(q.m).localeCompare(cleVet(p.m)));
        const aSaisir = l.filter(x => !joue(x.m) && (x.m.date || "") < auj).sort((p, q) => cleVet(q.m).localeCompare(cleVet(p.m)));
        const aVenir = l.filter(x => !joue(x.m) && (x.m.date || "") >= auj).sort((p, q) => cleVet(p.m).localeCompare(cleVet(q.m)));
        const prochain = aVenir.slice(0, 1), ensuite = aVenir.slice(1);
        const ranger = (liste, genre) => liste.forEach(x => {
          x.a.classList.add("ong-vet-" + genre);
          if (x.a.classList.contains("pliee")) decorerRepliee(x, genre); else rangerOuverte(x, genre);
        });
        ranger(aSaisir, "saisir"); ranger(prochain, "prochain"); ranger(ensuite, "ensuite"); ranger(joues, "joue");
        if (ajout) ajout.classList.add("ong-vet-ajout");
        const sous = l.length ? [prochain.length ? "Prochain match : " + e(dateLongue(prochain[0].m.date)) : "Aucun match à venir",
          aSaisir.length ? `<b class="ong-vet-alerte">${pl(aSaisir.length, "score à saisir", "scores à saisir")}</b>` : ""].filter(Boolean).join(" · ")
          : "La FFF ne publie pas leurs matchs : c'est ici qu'on les saisit.";
        const section = (titre, n, cle, note) => `${ONG.titre(titre, n)}${note ? `<p class="ong-vet-mini">${note}</p>` : ""}<div class="ong-vet-liste" data-ong-place="${cle}"></div>`;
        const html = `<div class="ong-vet">
          ${ONG.barre("Matchs des vétérans", sous, `<span data-ong-place="ajout"></span>`)}
          ${ONG.aide("vet-aide", "Comment ça marche ?", AIDE_VET + (l.length ? `<p class="ong-vet-astuce">La FFF ne publie pas les matchs des vétérans : c'est ici qu'on les saisit.</p>` : ""))}
          ${l.length ? "" : ONG.vide("Aucun match des vétérans", "Ajoute le prochain match : il partira sur les affiches du lundi.")}
          ${prochain.length ? section("Prochain match", null, "prochain") : ""}
          ${aSaisir.length ? section("Scores à saisir", aSaisir.length, "saisir", "Touche un match pour mettre son score.") : ""}
          ${ensuite.length ? section("Plus tard", ensuite.length, "ensuite") : ""}
          ${joues.length ? section("Déjà joués", joues.length, "joues") : ""}
        </div>`;
        const jeter = haut(racine, ".an-barre, p.quoi, .etat-vide");
        monter(racine, html, { ajout, prochain: prochain.map(x => x.a), saisir: aSaisir.map(x => x.a), ensuite: ensuite.map(x => x.a), joues: joues.map(x => x.a) }, jeter);
        // le match qu'on vient d'ajouter s'ouvre : on l'amène sous les yeux
        if (S.ui.ongVetAjout){
          const avant = S.ui.ongVetAjout; S.ui.ongVetAjout = null;
          const nouveau = [...((S.ui.deplies && S.ui.deplies) || [])].find(id => String(id).startsWith("vet-") && !avant.has(id));
          if (nouveau) setTimeout(() => { const c = document.querySelector(`#panneau [data-vet="${CSS.escape(nouveau)}"]`); if (c) c.scrollIntoView({ behavior: "smooth", block: "start" }); }, 60);
        }
      });
    };
    document.addEventListener("click", ev => {
      if (ev.target.closest && ev.target.closest('#panneau [data-a="vet-ajout"]')) S.ui.ongVetAjout = new Set(S.ui.deplies || []);
    }, true);
  }

  /* =====================================================================
     TOURNOIS
     ===================================================================== */
  if (typeof window.panTournois === "function"){
    const ETAPES = [["Le tournoi", "Tournoi"], ["Les équipes", "Équipes"], ["Le tirage au sort", "Tirage"], ["Les poules et résultats", "Résultats"]];
    const num = (i, fait) => `<span class="ong-tn-num" aria-hidden="true">${fait ? "✓" : i}</span>`;
    const etapes = cur => `<ol class="ong-tn-etapes" aria-label="Les étapes du tournoi">${ETAPES.map(([t, c], k) => { const i = k + 1, fait = i < cur;
      return `<li class="${fait ? "fait" : i === cur ? "en-cours" : "a-venir"}"${i === cur ? ` aria-current="step"` : ""}>${num(i, fait)}<span class="ong-tn-et-t"><span class="long">${t}</span><span class="court">${c}</span></span></li>`; }).join("")}</ol>`;
    const AIDE_LISTE = `<ol>
        <li><b>Le tournoi</b> : donne-lui un nom, une catégorie, une date et un lieu.</li>
        <li><b>Les équipes</b> : touche « + Ajouter une équipe » et tape le nom du club (« pierrelatte », « donzère », « orange », « bagnols »… : Drôme-Ardèche, Gard-Lozère et Grand Vaucluse). Le logo est retrouvé tout seul.</li>
        <li><b>Le tirage au sort</b> : choisis le nombre de poules et de qualifiés, puis touche « Faire le tirage au sort ». Les équipes d'un même club vont dans des poules différentes. Valide le tirage, ou refais-le.</li>
        <li><b>Les poules et résultats</b> : le jour J, touche « Gérer », tape les scores et valide : les classements se calculent tout seuls. « Afficher sur le site » : les familles suivent en direct.</li>
      </ol>`;
    const AIDE_SCORES = `<ol>
        <li>Tape les buts de chaque équipe, puis touche <b>« Valider »</b> : le classement de la poule se met à jour tout seul.</li>
        <li>Quand tous les matchs de poule ont un score, touche <b>« Lancer la phase finale »</b> : ses matchs se créent tout seuls.</li>
        <li>Match nul en phase finale : valide le score, choisis le vainqueur aux tirs au but, puis valide encore.</li>
        <li>Touche <b>« Afficher sur le site »</b> pour que les familles suivent les scores en direct.</li>
      </ol>`;
    const aScore = m => typeof m.sa === "number" && typeof m.sb === "number";
    function avancement(t){
      const ms = Array.isArray(t.matchs) ? t.matchs : [];
      const pm = ms.filter(m => m.phase === "poule"), ko = ms.filter(m => m.phase !== "poule");
      let ch = null; try { ch = champion(t); } catch(err){}
      return { total: pm.length, faits: pm.filter(aScore).length, ko: ko.length, koFaits: ko.filter(m => m.exempt || aScore(m)).length, champion: ch };
    }
    const nbEquipes = t => (Array.isArray(t.poules) ? t.poules : []).reduce((s, p) => s + (Array.isArray(p) ? p.length : 0), 0);

    /* ---------- liste des tournois + « Créer un tournoi » en 3 étapes ---------- */
    function resumeTirage(n){
      const N = (n.liste || []).length, P = +n.poules || 1, Q = +n.qualif || 0;
      if (!N) return { ok: false, txt: "Ajoute d'abord les équipes (étape 2)." };
      if (N < P * 2) return { ok: false, txt: `Il faut au moins ${P * 2} équipes pour ${pl(P, "poule")} : ajoute-en encore ${P * 2 - N}${P > 1 ? ", ou baisse le nombre de poules" : ""}.` };
      const petit = Math.floor(N / P), grand = petit + (N % P ? 1 : 0);
      const tailles = petit === grand ? `${petit} équipes` : `${petit} ou ${grand} équipes`;
      const matchs = petit === grand ? pl(petit - 1, "match") : `${petit - 1} ou ${pl(grand - 1, "match")}`;
      let txt = `${N} équipes → ${P > 1 ? `${P} poules de ${tailles}` : `une poule de ${tailles}`} : chaque équipe joue ${matchs}.`;
      if (Q > 0 && Q * P < 2) return { ok: false, txt: txt + " Avec une seule poule, prends 2 qualifiés." };
      if (Q > 0 && N / P <= Q) return { ok: false, txt: txt + ` ${Q} qualifiés par poule, c'est trop : baisse le nombre de qualifiés.` };
      txt += Q > 0 ? ` ${Q > 1 ? `Les ${Q} premiers` : "Le premier"} de chaque poule ${Q > 1 ? "vont" : "va"} en phase finale.` : " Pas de phase finale : le classement des poules donne le résultat.";
      return { ok: true, txt };
    }
    function vueListe(racine){
      const n = S.ui.nouveauT || { liste: [] }, liste = Array.isArray(n.liste) ? n.liste : [];
      const tous = S.tournois || [];
      const form = racine.querySelector('form[data-form="tournoi"]');
      const cartes = haut(racine, ".cartes")[0];
      const P = +n.poules || 1, fait1 = !!String(n.nom || "").trim(), fait2 = liste.length >= P * 2;
      const etape = (i, titre, fait, extra) => `<section class="ong-tn-etape${fait ? " fait" : ""}" data-ong-tn-etape="${i}">
          <h4 class="ong-tn-et-tete">${num(i, fait)}<span>${titre}</span>${extra || ""}</h4><div class="ong-tn-et-corps" data-ong-tn-corps="${i}"></div></section>`;
      if (form){
        form.classList.add("ong-tn-form");
        const lab = k => { const i = form.querySelector(`[data-nt="${k}"]`); return i ? i.closest("label") : null; };
        const grille = form.querySelector(":scope > .grille"), rep = form.querySelector(":scope > .t-rep"), eqs = form.querySelector(":scope > .t-equipes");
        const go = form.querySelector('button:not([type="button"])'), goBloc = go && go.closest(".pleine");
        libelle(lab("nom"), "Nom du tournoi");
        libelle(lab("qualif"), "Qualifiés par poule");
        const iCat = form.querySelector('[data-nt="cat"]'); if (iCat && !iCat.placeholder) iCat.placeholder = "U11, U13, Seniors…";
        const iLieu = form.querySelector('[data-nt="lieu"]'); if (iLieu && !iLieu.placeholder) iLieu.placeholder = "Stade Gustave Jaume";
        const r = resumeTirage(n);
        const t = elt(`<div>${etape(1, "Le tournoi", fait1)}${etape(2, "Les équipes", fait2, `<span class="ong-nb">${liste.length}</span>`)}${etape(3, "Le tirage au sort", false)}
          <p class="ong-tn-ensuite">${num(4)}<span><b>Ensuite</b> : tu valides les poules tirées au sort, puis tu saisis les scores le jour du tournoi.</span></p></div>`);
        const corps = i => t.querySelector(`[data-ong-tn-corps="${i}"]`);
        const g1 = elt(`<div class="ong-tn-g1"></div>`); [lab("nom"), lab("cat"), lab("date"), lab("lieu")].filter(Boolean).forEach(x => g1.appendChild(x));
        corps(1).appendChild(g1);
        if (eqs){
          const b = eqs.querySelector(":scope > .ps-lab"); if (b) b.remove();
          const s = eqs.querySelector(":scope > small.quoi");
          if (s){ s.className = "ong-tn-indice"; s.textContent = "Touche « + Ajouter une équipe » et tape le nom du club. Plusieurs équipes du même club : choisis leur numéro (1, 2, 3) dans le petit menu."; }
          const aj = eqs.querySelector('[data-a="t-eq-ajouter"]'); if (aj) aj.innerHTML = `<span class="ong-tn-plus" aria-hidden="true">+</span>Ajouter une équipe`;
          corps(2).appendChild(eqs);
        }
        const g3 = elt(`<div class="ong-tn-g3"></div>`); [lab("poules"), lab("qualif")].filter(Boolean).forEach(x => g3.appendChild(x));
        corps(3).appendChild(g3);
        if (rep) corps(3).appendChild(rep);
        corps(3).appendChild(elt(`<p class="ong-tn-resume ${r.ok ? "ok" : "attention"}">${r.ok ? "✓ " : "⚠️ "}${e(r.txt)}</p>`));
        if (go){ go.innerHTML = `<span aria-hidden="true">🎲</span> Faire le tirage au sort`; go.classList.add("ong-tn-go"); corps(3).appendChild(goBloc || go); }
        if (grille) [...grille.children].forEach(x => g1.appendChild(x));        // un champ inconnu : gardé
        if (grille) grille.remove();
        [...form.children].forEach(x => { if (!x.matches("input[type=hidden]")) corps(3).insertBefore(x, corps(3).firstChild); });
        while (t.firstChild) form.appendChild(t.firstChild);
      }
      if (cartes){
        cartes.classList.add("ong-tn-cartes");
        cartes.querySelectorAll("article.item[data-t]").forEach(a => {
          const t = tous.find(x => x.id === a.dataset.t); if (!t) return;
          const av = avancement(t), txt = a.querySelector(".item-txt");
          const etat = av.champion ? `🏆 Vainqueur : ${e(av.champion)}` : av.ko ? "Phase finale en cours" : av.total && av.faits === av.total ? "Poules terminées" : av.faits ? `${av.faits} / ${av.total} scores de poule saisis` : "Aucun score pour l'instant";
          if (txt) txt.insertAdjacentHTML("beforeend", `<span class="ong-tn-prog${av.champion ? " fini" : ""}">${etat}</span>`);
          const g = a.querySelector('[data-a="ouvrir-tournoi"]'); if (g) g.textContent = "Gérer";
          const et = a.querySelector(".etiq"); if (et && !t.publie) et.textContent = "Pas sur le site";
        });
      }
      const ouvertDefaut = !tous.length || fait1 || liste.length > 0;
      const html = `<div class="ong-tn ong-tn-liste">
        ${ONG.barre("Tournois", "Tirage au sort des poules, puis scores et classements en direct sur le site.", "")}
        ${ONG.aide("tournois-aide", "Comment ça marche ?", AIDE_LISTE)}
        ${ONG.pli("tournois-creer", `Créer un tournoi<small class="ong-tn-pli-sous">Le tournoi, les équipes, puis le tirage au sort</small>`, `<span data-ong-place="form"></span>`, ouvertDefaut, "+")}
        ${tous.length ? `${ONG.titre("Tes tournois", tous.length)}<span data-ong-place="cartes"></span>`
          : ONG.vide("Aucun tournoi pour l'instant", "Ton tournoi apparaîtra ici dès que tu auras validé son tirage au sort.")}
      </div>`;
      const jeter = [haut(racine, "details.pli")[0], haut(racine, ".etat-vide")[0]];
      monter(racine, html, { form, cartes }, jeter);
    }

    /* ---------- étape 3 : l'écran du tirage au sort ---------- */
    function vueTirage(racine){
      const T = S.ui.tirage || {}, P = (T.poules || []).length, N = (T.ordre || T.liste || []).length;
      const poules = haut(racine, ".poules")[0], btns = haut(racine, ".btns")[0];
      if (poules){
        poules.removeAttribute("style"); poules.classList.add("ong-tn-tirage-poules");
        poules.querySelectorAll(":scope > .carte").forEach((c, i) => {
          const h = c.querySelector("h3"); if (h){ h.removeAttribute("style"); h.insertAdjacentHTML("beforeend", `<span class="ong-nb">${((T.poules || [])[i] || []).length}</span>`); }
        });
      }
      if (btns){
        btns.classList.add("ong-tn-btns");
        const enCours = btns.querySelector(":scope > span.quoi"); if (enCours) enCours.remove();
        const ann = btns.querySelector('[data-a="annuler-tirage"]'); if (ann){ ann.classList.add("ong-a-part"); btns.appendChild(ann); }
        const val = btns.querySelector('[data-a="valider-tirage"]'); if (val) val.innerHTML = "✓ Valider ces poules";
        const ref = btns.querySelector('[data-a="refaire-tirage"]'); if (ref) ref.innerHTML = `<span aria-hidden="true">🎲</span> Refaire le tirage`;
      }
      const html = `<div class="ong-tn ong-tn-vue-tirage">
        ${etapes(3)}
        ${ONG.barre(`Tirage au sort`, `${e(T.nom || "")} · ${pl(N, "équipe")} · ${pl(P, "poule")}`, "")}
        <p class="ong-tn-statut ${T.fini ? "fini" : ""}" role="status">${T.fini ? "✓ Tirage terminé. Vérifie les poules : valide-les pour créer le tournoi, ou refais le tirage." : "🎲 Tirage en cours…"}</p>
        <span data-ong-place="poules"></span>
        <span data-ong-place="btns"></span>
      </div>`;
      monter(racine, html, { poules, btns }, [haut(racine, "h2")[0]]);
    }

    /* ---------- étape 4 : les poules et résultats d'un tournoi ---------- */
    function rangerDuel(d){
      d.removeAttribute("style"); d.classList.add("ong-tn-duel");
      if (!d.matches("[data-m]")) return;                               // exemptée : rien à saisir
      const act = [...d.children].find(x => x.querySelector('[data-a="valider-score"]'));
      const eqs = elt(`<div class="ong-tn-eqs"></div>`);
      [...d.children].filter(x => x !== act).forEach(x => eqs.appendChild(x));
      d.insertBefore(eqs, d.firstChild);
      eqs.querySelectorAll(".num").forEach(i => { i.removeAttribute("style"); });
      const tab = eqs.querySelector("[data-tab]"); if (tab){ tab.removeAttribute("style"); tab.closest("div").classList.add("ong-tn-tab"); }
      if (!act) return;
      act.removeAttribute("style"); act.classList.add("ong-tn-act");
      const fait = d.querySelector('[data-s="sa"]') && d.querySelector('[data-s="sa"]').value !== "" && d.querySelector('[data-s="sb"]').value !== "";
      d.classList.add(fait ? "fait" : "a-faire");
      const st = act.querySelector(".quoi"); if (st){ st.className = "ong-tn-etat"; st.textContent = fait ? "✓ Validé" : "À saisir"; }
      const b = act.querySelector('[data-a="valider-score"]');
      if (b){ b.textContent = "Valider"; b.setAttribute("aria-label", "Valider le score"); if (fait){ b.classList.remove("bleu"); b.classList.add("contour"); } }
    }
    function vueTournoi(racine, t){
      const av = avancement(t), P = (t.poules || []).length;
      const nav = haut(racine, ".btns")[0];
      const fermer = nav && nav.querySelector('[data-a="fermer-tournoi"]'), bascule = nav && nav.querySelector('[data-a="toggle-tournoi"]'), suppr = nav && nav.querySelector('[data-a="del-tournoi"]');
      const edit = racine.querySelector("#t-edit");
      const finale = racine.querySelector('[data-a="lancer-finale"]'), finaleBloc = finale && finale.closest(".btns");
      if (fermer){ fermer.innerHTML = `<span aria-hidden="true">←</span> Tous les tournois`; fermer.classList.add("ong-tn-retour"); }
      if (suppr) suppr.textContent = "Supprimer le tournoi";
      if (bascule) bascule.classList.remove("petit");
      let champ = null;
      if (edit){
        const grille = edit.querySelector(":scope > .poules");
        if (grille) grille.classList.add("ong-tn-poules");
        edit.querySelectorAll(".poule").forEach((p, i) => {
          p.classList.add("ong-tn-poule");
          const ms = (t.matchs || []).filter(m => m.phase === "poule" && m.poule === i), faits = ms.filter(aScore).length;
          const h = p.querySelector("h3");
          if (h) h.insertAdjacentHTML("beforeend", `<span class="ong-tn-poule-info${ms.length && faits === ms.length ? " fini" : ""}">${pl(((t.poules || [])[i] || []).length, "équipe")} · ${faits} / ${ms.length} ${faits > 1 ? "joués" : "joué"}</span>`);
          const z = [...p.children].find(x => x.querySelector && x.querySelector(".duel"));
          if (z){ z.removeAttribute("style"); z.classList.add("ong-tn-matchs"); z.insertAdjacentHTML("beforebegin", `<p class="ong-tn-sous">Matchs</p>`); }
        });
        const sous = edit.querySelector(":scope > h3.sous");
        if (sous) sous.replaceWith(elt(ONG.titre("Phase finale")));
        const tf = edit.querySelector(":scope > .tableau-final"); if (tf) tf.classList.add("ong-tn-final");
        edit.querySelectorAll(".duel").forEach(rangerDuel);
        const lg = edit.querySelector(":scope > p.quoi"); if (lg){ lg.removeAttribute("style"); lg.className = "ong-tn-legende"; }
        champ = edit.querySelector(":scope > .champion");
        if (champ){ champ.className = "ong-tn-champion"; champ.innerHTML = `<span aria-hidden="true">🏆</span> ${champ.innerHTML}`; }
      }
      if (finaleBloc){
        finaleBloc.querySelectorAll(":scope > span.quoi").forEach(x => x.remove());
        finaleBloc.classList.add("ong-tn-finale-act");
        finale.classList.add("ong-tn-go");
      }
      const reste = av.total - av.faits, pct = av.total ? Math.round(av.faits / av.total * 100) : 0;
      const meta = [t.cat, t.date ? dateLongue(t.date) : "", t.lieu, pl(nbEquipes(t), "équipe")].filter(Boolean).map(e).join(" · ");
      const html = `<div class="ong-tn ong-tn-vue">
        <div class="ong-tn-nav"><span data-ong-place="fermer"></span></div>
        ${etapes(4)}
        <div class="ong-tn-tete">
          <div class="ong-tn-tete-txt">
            <h2>${e(t.nom || "Tournoi")}</h2>
            <p>${maj1(meta)}</p>
            <div class="ong-tn-avance" aria-label="Scores de poule saisis"><div class="ong-tn-barre"><i style="width:${pct}%"></i></div>
              <span>${av.total ? `${av.faits} / ${av.total} matchs de poule joués` : "Aucun match de poule"}${av.ko ? ` · phase finale : ${av.koFaits} / ${av.ko}` : ""}</span></div>
          </div>
          <div class="ong-tn-tete-act">
            <span class="etiq ${t.publie ? "ok" : ""}">${t.publie ? "Visible sur le site" : "Pas encore sur le site"}</span>
            <span data-ong-place="bascule"></span>
          </div>
          <span data-ong-place="champ"></span>
        </div>
        ${ONG.aide("tournoi-scores", "Comment saisir les scores ?", AIDE_SCORES)}
        ${ONG.titre("Les poules", P)}
        ${t.qualif > 0 ? `<p class="ong-tn-cle"><span class="q" aria-hidden="true"></span>En vert : ${t.qualif > 1 ? `les ${t.qualif} premiers, qualifiés` : "le premier, qualifié"} pour la phase finale.</p>` : ""}
        <span data-ong-place="edit"></span>
        ${finaleBloc ? `${ONG.titre("Phase finale")}<div class="ong-tn-finale">
          <p>${reste > 0 ? `Encore <b>${pl(reste, "match")} de poule</b> sans score. Le bouton s'active quand tous les scores sont validés.`
            : "Tous les matchs de poule ont un score : lance la phase finale, ses matchs se créent tout seuls."}</p>
          <span data-ong-place="finale"></span></div>` : ""}
        <div class="ong-tn-zone-suppr"><p>Supprimer le tournoi efface aussi tous ses scores.</p><span data-ong-place="suppr"></span></div>
      </div>`;
      const jeter = [haut(racine, "h2")[0], haut(racine, "p.quoi")[0]];
      monter(racine, html, { fermer, bascule, champ, edit, finale: finaleBloc, suppr }, jeter);
      if (nav && !nav.children.length) nav.remove();
    }

    let prof = 0;
    const avantT = window.panTournois;
    window.panTournois = function(){
      prof++;
      try {
        const h = avantT.apply(this, arguments);
        if (prof > 1) return h;                                   // appel imbriqué (tournoi introuvable) : rangé une seule fois
        return ONG.transformer(h, racine => {
          if (S.ui.tirage) return vueTirage(racine);
          const t = S.ui.tournoi && (S.tournois || []).find(x => x.id === S.ui.tournoi);
          if (t) return vueTournoi(racine, t);
          vueListe(racine);
        });
      } finally { prof--; }
    };

    /* le nom tapé coche tout de suite l'étape 1 ; un score modifié se voit avant d'être validé */
    document.addEventListener("input", ev => {
      const t = ev.target; if (!t || !t.matches) return;
      if (t.matches('#panneau .ong-tn-form [data-nt="nom"]')){
        const s = t.closest(".ong-tn-form").querySelector('[data-ong-tn-etape="1"]'); if (!s) return;
        const fait = !!t.value.trim(); s.classList.toggle("fait", fait);
        const n = s.querySelector(".ong-tn-num"); if (n) n.textContent = fait ? "✓" : "1";
      }
      if (t.matches("#panneau .ong-tn-duel [data-s]")){
        const d = t.closest(".ong-tn-duel"); if (!d || d.classList.contains("modifie")) return;
        d.classList.add("modifie");
        const st = d.querySelector(".ong-tn-etat"); if (st) st.textContent = "Pas encore validé";
        const b = d.querySelector('[data-a="valider-score"]'); if (b){ b.classList.remove("contour"); b.classList.add("bleu"); }
      }
    }, true);
    // « Lancer la phase finale » et « Afficher sur le site / Retirer du site » enregistrent sans redessiner l'onglet sur le site
    // en ligne (là, l'onglet ne se redessine pas tout seul) : on le redessine dès que l'enregistrement est revenu
    document.addEventListener("click", ev => {
      if (!(ev.target.closest && ev.target.closest('#panneau [data-a="lancer-finale"], #panneau [data-a="toggle-tournoi"]'))) return;
      const avant = S.tournois; let n = 0;
      const minuteur = setInterval(() => {
        if (++n > 80 || S.ui.onglet !== "tournois"){ clearInterval(minuteur); return; }
        if (S.tournois === avant) return;
        clearInterval(minuteur);
        const p = document.getElementById("panneau"), act = document.activeElement;
        if (p && p.contains(act) && act.matches("input,select,textarea")) return;     // quelqu'un tape un score : on ne le dérange pas
        rendrePanneau();
      }, 100);
    }, true);
    // tournoi créé : « Créer un tournoi » se referme pour la prochaine fois
    document.addEventListener("click", ev => {
      if (ev.target.closest && ev.target.closest('#panneau [data-a="valider-tirage"]') && S.ui.ongPli) delete S.ui.ongPli["tournois-creer"];
    }, true);
  }

  /* =====================================================================
     STYLE (sombre par défaut, lisible en clair)
     ===================================================================== */
  const V = "body.sur-espace #panneau .ong-vet", T = "body.sur-espace #panneau .ong-tn", L = ':root[data-theme="light"]';
  const css = document.createElement("style");
  css.id = "onglets-matchs-css";
  css.textContent = `
/* ---------- commun ---------- */
${V} .ong-a-part,${T} .ong-a-part{margin-left:auto}
${V} .ong-titre,${T} .ong-titre{margin:26px 0 12px}
${V} .ong-aide,${T} .ong-aide{margin-bottom:6px}
/* ---------- Vétérans ---------- */
${V} .ong-barre p b.ong-vet-alerte{color:#F3C969}
${V} .ong-vet-ajout{min-height:50px;font-size:16px;padding:12px 22px}
${V} .ong-vet-astuce{margin:10px 0 0;font-size:14px;color:#AFC0EA}
${V} .ong-vet-mini{margin:-4px 0 10px;font-size:14px;color:#AFC0EA}
${V} .ong-vet-liste{display:grid;gap:12px}
${V} .ong-vet-liste>.an-carte{margin:0;border-left-width:1px}
${V} .an-carte.passe{border-left:1px solid var(--ligne)}
${V} .pl-tete{min-height:72px;padding:12px 16px;gap:16px}
${V} .pl-txt>b{font:800 18px var(--display);letter-spacing:.1px}
${V} .pl-txt>small{font-size:14px}
${V} .pl-modif{font-size:14px}
${V} .ong-vet-puce{justify-self:start;margin-top:4px;display:inline-flex;align-items:center;gap:6px;font:800 13px var(--corps);padding:4px 11px;border-radius:999px}
${V} .ong-vet-puce.saisir{background:rgba(245,166,35,.16);color:#F7C566;border:1px solid rgba(245,166,35,.45)}
${V} .ong-vet-puce.saisir::before{content:"";width:8px;height:8px;border-radius:50%;background:#F5A623;box-shadow:0 0 0 3px rgba(245,166,35,.25)}
${V} .ong-vet-puce.prochain{background:rgba(47,107,255,.2);color:#CFE0FF;border:1px solid rgba(127,166,255,.5)}
/* le prochain match : bien en vue */
${V} .an-carte.ong-vet-prochain{border:1.5px solid rgba(127,166,255,.75);background:linear-gradient(135deg,rgba(47,107,255,.22),rgba(15,28,68,.6) 60%),var(--carte);box-shadow:0 14px 34px rgba(47,107,255,.22)}
${V} .an-carte.ong-vet-prochain .pl-tete{min-height:92px;padding:16px 18px}
${V} .an-carte.ong-vet-prochain .pl-txt>b{font-size:22px}
${V} .an-carte.ong-vet-prochain .bdate{background:linear-gradient(135deg,#2F6BFF,#1C4FD6);box-shadow:0 8px 18px rgba(47,107,255,.35)}
/* les scores à saisir : en orange */
${V} .an-carte.ong-vet-saisir{border:1px solid rgba(245,166,35,.5);border-left:5px solid #F5A623;background:linear-gradient(90deg,rgba(245,166,35,.1),transparent 55%),var(--carte)}
${V} .an-carte.ong-vet-saisir .pl-modif{color:#F7C566}
${V} .an-carte.ong-vet-joue{border-left:1px solid var(--ligne)}
${V} .pl-score{min-width:62px;text-align:center}
${V} .pl-score.ong-vet-V{background:rgba(34,197,94,.18);color:#86EFAC}
${V} .pl-score.ong-vet-N{background:rgba(143,168,240,.16);color:#DCE5FF}
${V} .pl-score.ong-vet-D{background:rgba(239,68,68,.16);color:#FCA5A5}
/* fiche ouverte */
${V} .an-carte.ong-vet-ouverte{padding:18px 20px;gap:14px}
${V} .an-carte.ong-vet-ouverte .an-tete{padding-bottom:12px;border-bottom:1px solid rgba(143,168,240,.16)}
${V} .ong-vet-blocs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
${V} .ong-vet-bloc{display:block;border:1px solid rgba(143,168,240,.18);border-radius:14px;padding:12px 14px 14px;background:rgba(5,11,31,.25);min-width:0}
${V} .ong-vet-bloc h4{margin:0 0 10px;font:800 12px var(--corps);letter-spacing:.12em;text-transform:uppercase;color:#AFC0EA}
${V} .ong-vet-champs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
${V} .ong-vb-match .ong-vet-champs{grid-template-columns:minmax(0,1.4fr) minmax(0,1fr)}
${V} .ong-vb-ou .ong-vet-champs{grid-template-columns:minmax(0,.8fr) minmax(0,1.6fr)}
${V} .ong-vet-champs label{display:grid;gap:6px;margin:0;min-width:0}
${V} .ong-vb-score .ong-vet-champs{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:end}
${V} .ong-vb-score input{text-align:center;font:800 22px var(--display)!important}
${V} .ong-vet-tiret{font:800 26px var(--display);color:#AFC0EA;padding-bottom:8px}
${V} .ong-vet-note{margin:10px 0 0;font-size:13.5px;color:#AFC0EA}
${V} .ong-vet-saisir .ong-vb-score,${V} .ong-vet-joue .ong-vb-score{grid-column:1/-1;border-color:rgba(245,166,35,.5);background:rgba(245,166,35,.07)}
${V} .ong-vet-saisir .ong-vb-score h4{color:#F7C566}
${V} .ong-vet-saisir .ong-vb-score .ong-vet-champs,${V} .ong-vet-joue .ong-vb-score .ong-vet-champs{max-width:520px}
${V} .ong-vet-joue .ong-vb-score{border-color:rgba(143,168,240,.18);background:rgba(5,11,31,.25)}
${V} .ong-vet-btns{margin-top:2px;align-items:center}
${V} .ong-vet-btns .btn.bleu{min-width:170px}
/* ---------- Tournois ---------- */
${T} .ong-tn-num{flex:none;width:30px;height:30px;border-radius:50%;display:inline-grid;place-items:center;font:900 15px var(--corps);background:rgba(143,168,240,.18);color:#DCE5FF;border:1.5px solid rgba(143,168,240,.4)}
/* la frise des 4 étapes */
${T} .ong-tn-etapes{list-style:none;margin:0 0 18px;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;counter-reset:none}
${T} .ong-tn-etapes li{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;border:1px solid rgba(143,168,240,.18);background:rgba(10,20,48,.45);color:#AFC0EA;font:700 14.5px var(--corps);min-width:0;position:relative}
${T} .ong-tn-etapes li .court{display:none}
${T} .ong-tn-etapes li.fait{color:#BBF7D0;border-color:rgba(34,197,94,.35)}
${T} .ong-tn-etapes li.fait .ong-tn-num{background:#16A34A;border-color:#16A34A;color:#fff}
${T} .ong-tn-etapes li.en-cours{color:#fff;border-color:#7FA6FF;background:linear-gradient(180deg,rgba(47,107,255,.35),rgba(28,79,214,.25));box-shadow:0 8px 20px rgba(47,107,255,.25)}
${T} .ong-tn-etapes li.en-cours .ong-tn-num{background:#2F6BFF;border-color:#fff;color:#fff}
${T} .ong-tn-etapes li.a-venir{opacity:.75}
/* créer un tournoi (le « + » du bloc : la règle globale .plus du menu du site le cachait ou le fixait en bas de l'écran) */
${T} .pli>summary .plus{position:static!important;display:grid!important;flex:none;box-shadow:none;padding:0;border:0;width:32px;height:32px;background:linear-gradient(180deg,#2F6BFF,#1C4FD6);color:#fff}
${T} .ong-pli>summary{flex-wrap:wrap}
${T} .ong-pli-t{display:grid;gap:2px}
${T} .ong-tn-pli-sous{font:600 14px var(--corps);color:#AFC0EA;letter-spacing:0}
${T} .ong-pli .pli-corps{padding-top:6px}
${T} .ong-tn-form{display:grid;gap:14px}
${T} .ong-tn-etape{border:1px solid rgba(143,168,240,.18);border-radius:16px;padding:16px 18px 18px;background:rgba(5,11,31,.22)}
${T} .ong-tn-et-tete{display:flex;align-items:center;gap:12px;margin:0 0 14px;font:800 20px var(--display);color:#fff}
${T} .ong-tn-etape.fait .ong-tn-num{background:#16A34A;border-color:#16A34A;color:#fff}
${T} .ong-tn-g1{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,.8fr) minmax(0,1.1fr) minmax(0,1.3fr);gap:14px 16px}
${T} .ong-tn-g3{display:grid;grid-template-columns:repeat(2,minmax(0,260px));gap:14px 16px}
${T} .ong-tn-form label{display:grid;gap:6px;margin:0;min-width:0}
${T} .ong-tn-form .t-rep{margin:14px 0 0;padding:0;border:0;background:none}
${T} .ong-tn-form .t-rep .af-choix{justify-self:start;display:inline-flex!important;min-height:46px;background:rgba(5,11,31,.45)}
${T} .ong-tn-form .t-rep .af-choix::before{content:"";width:20px;height:20px;border-radius:6px;border:2px solid rgba(143,168,240,.6);flex:none;display:grid;place-items:center}
${T} .ong-tn-form .t-rep .af-choix.on::before{content:"✓";background:#2F6BFF;border-color:#2F6BFF;color:#fff;font:900 13px var(--corps)}
${T} .ong-tn-form .t-rep small.quoi{font-size:14px}
${T} .ong-tn-resume{margin:14px 0 0;padding:10px 14px;border-radius:12px;font-size:15px;line-height:1.45}
${T} .ong-tn-resume.ok{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);color:#C7F5D6}
${T} .ong-tn-resume.attention{background:rgba(245,166,35,.1);border:1px solid rgba(245,166,35,.4);color:#F7D9A0}
${T} .ong-tn-form .pleine{margin:0}
${T} .ong-tn-et-corps>.pleine:last-child,${T} .ong-tn-et-corps>.ong-tn-go:last-child{margin-top:16px}
${T} .ong-tn-go{min-height:52px!important;font-size:17px!important;padding:12px 26px!important}
${T} .ong-tn-ensuite{display:flex;align-items:center;gap:12px;margin:0;padding:4px 4px 0;color:#AFC0EA;font-size:14.5px}
${T} .ong-tn-ensuite .ong-tn-num{opacity:.7}
/* les équipes : des tuiles bien alignées */
${T} .t-equipes{margin:0;gap:10px}
${T} .t-puces{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:10px}
${T} .t-puce{border-radius:14px;padding:6px 6px 6px 10px;min-height:52px;gap:10px;background:rgba(10,20,48,.55);border-color:rgba(143,168,240,.25);font-size:15px;min-width:0}
${T} .t-puce>span:nth-child(2){flex:1;min-width:0;overflow-wrap:anywhere;line-height:1.25}
${T} .t-puce .t-logo{width:30px;height:30px}
${T} .t-puce .t-num{height:38px!important;min-width:52px;border-radius:10px!important;font-size:14px!important}
${T} .t-puce button[data-a="t-eq-retirer"]{width:40px;height:40px;border-radius:10px;display:grid;place-items:center;font-size:22px;flex:none}
${T} .t-puce button[data-a="t-eq-retirer"]:hover{background:rgba(239,68,68,.14)}
${T} .t-ajout{justify-content:center;border:1.5px dashed rgba(127,166,255,.6);background:rgba(47,107,255,.08);color:#CFE0FF;font:800 15px var(--corps);border-radius:14px;min-height:52px}
${T} .t-ajout:hover{background:rgba(47,107,255,.18)}
${T} .ong-tn-plus{width:24px;height:24px;border-radius:8px;background:#2F6BFF;color:#fff;display:inline-grid;place-items:center;font:900 16px var(--corps)}
${T} .ong-tn-indice{font-size:14px;color:#AFC0EA;line-height:1.45}
/* la liste des tournois */
${T} .ong-tn-cartes .item{padding:14px 18px}
${T} .ong-tn-cartes .item-txt h3{font:800 20px var(--display);margin:0}
${T} .ong-tn-cartes .item-txt p{margin:2px 0 0}
${T} .ong-tn-prog{display:inline-block;margin-top:6px;font:700 13.5px var(--corps);color:#CFE0FF}
${T} .ong-tn-prog.fini{color:#F7D774}
${T} .ong-tn-cartes [data-a="ouvrir-tournoi"]{min-width:110px}
/* écran du tirage */
${T} .ong-tn-statut{margin:0 0 16px;padding:12px 16px;border-radius:14px;background:rgba(47,107,255,.12);border:1px solid rgba(127,166,255,.35);color:#DCE5FF;font:700 15.5px var(--corps)}
${T} .ong-tn-statut.fini{background:rgba(34,197,94,.1);border-color:rgba(34,197,94,.35);color:#C7F5D6}
${T} .ong-tn-tirage-poules{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}
${T} .ong-tn-tirage-poules>.carte{margin:0;padding:16px 18px}
${T} .ong-tn-tirage-poules h3{display:flex;align-items:center;gap:10px;font:800 24px var(--display);margin:0 0 6px}
${T} .ong-tn-tirage-poules .tirage-poule{margin:0;padding:0}
${T} .ong-tn-tirage-poules .tirage-poule li{padding:9px 0;font-size:16px;border-bottom-color:rgba(143,168,240,.14)}
${T} .ong-tn-tirage-poules .tirage-poule li:last-child{border-bottom:0}
${T} .ong-tn-btns{align-items:center;margin-top:18px}
${T} .ong-tn-btns [data-a="valider-tirage"]{min-height:52px;font-size:17px;padding:12px 26px}
/* étape 4 : un tournoi */
${T} .ong-tn-nav{margin:0 0 14px}
${T} .ong-tn-retour{min-height:44px}
${T} .ong-tn-tete{display:flex;flex-wrap:wrap;align-items:center;gap:16px 24px;padding:20px 22px;border-radius:20px;border:1px solid rgba(143,168,240,.22);margin-bottom:16px;
  background:linear-gradient(180deg,rgba(26,44,96,.55),rgba(14,26,60,.55)),var(--carte);box-shadow:0 1px 0 rgba(255,255,255,.07) inset,0 16px 36px rgba(3,8,24,.32)}
${T} .ong-tn-tete-txt{flex:1;min-width:260px}
${T} .ong-tn-tete h2{font:800 30px var(--display);margin:0;letter-spacing:.2px}
${T} .ong-tn-tete p{margin:4px 0 0;color:#AFC0EA;font-size:15.5px}
${T} .ong-tn-tete-act{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
${T} .ong-tn-avance{display:flex;align-items:center;gap:12px;margin-top:12px;font:700 14px var(--corps);color:#DCE5FF;flex-wrap:wrap}
${T} .ong-tn-barre{width:200px;max-width:100%;height:10px;border-radius:999px;background:rgba(143,168,240,.18);overflow:hidden}
${T} .ong-tn-barre i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#22C55E,#86EFAC)}
${T} .ong-tn-champion{flex-basis:100%;display:flex;align-items:center;gap:12px;font:800 26px var(--display);color:#1A1405;background:linear-gradient(135deg,#F7DC92,#E3B64C);border-radius:14px;padding:12px 18px}
${T} .ong-tn-cle{display:flex;align-items:center;gap:8px;margin:-4px 0 12px;font-size:14px;color:#AFC0EA}
${T} .ong-tn-cle .q{width:14px;height:14px;border-radius:4px;background:var(--victoire,#16A34A)}
${T} .ong-tn-poules{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,430px),1fr));gap:16px}
${T} .ong-tn-poule{border:1px solid rgba(143,168,240,.2);border-radius:18px;padding:16px;background:linear-gradient(180deg,rgba(26,44,96,.45),rgba(14,26,60,.45));min-width:0}
${T} .ong-tn-poule h3{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px 12px;font:800 24px var(--display);margin:0 0 10px}
${T} .ong-tn-poule-info{font:700 13.5px var(--corps);color:#AFC0EA}
${T} .ong-tn-poule-info.fini{color:#86EFAC}
${T} .ong-tn-poule .scroll table{width:100%}
${T} .ong-tn-poule td,${T} .ong-tn-poule th{padding:8px 10px}
${T} .ong-tn-sous{margin:14px 0 8px;font:800 12px var(--corps);letter-spacing:.12em;text-transform:uppercase;color:#AFC0EA}
${T} .ong-tn-matchs{display:grid;gap:8px}
/* un match : les deux équipes et leur score à gauche, « Valider » à droite */
${T} .ong-tn-duel{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:stretch;margin:0!important;border-radius:14px;border:1px solid rgba(143,168,240,.2);background:rgba(5,11,31,.3);overflow:hidden}
${T} .ong-tn-duel.exempt{display:block;padding:0}
${T} .ong-tn-eqs{display:grid;grid-template-columns:minmax(0,1fr);justify-content:stretch;align-content:center;gap:0;padding:0;min-width:0}
${T} .ong-tn-eqs>div{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 10px 6px 14px;min-height:50px}
${T} .ong-tn-eqs>div+div{border-top:1px solid rgba(143,168,240,.14)}
${T} .ong-tn-eqs>div>span{min-width:0;overflow-wrap:anywhere}
${T} .ong-tn-eqs .gagne{background:rgba(34,197,94,.1);font-weight:800}
${T} .ong-tn-duel input.num{width:58px!important;height:42px!important;min-height:42px!important;padding:0 4px!important;text-align:center;font:800 19px var(--display)!important;flex:none}
${T} .ong-tn-tab{flex-wrap:wrap;font-size:14px}
${T} .ong-tn-tab select{height:42px!important;min-height:42px!important;width:auto;max-width:100%}
${T} .ong-tn-act{display:flex!important;flex-direction:column;align-items:stretch;justify-content:center;gap:6px;padding:8px 10px;border-left:1px solid rgba(143,168,240,.14);min-width:118px}
${T} .ong-tn-act .btn{min-height:44px}
${T} .ong-tn-etat{font:800 12.5px var(--corps);text-align:center}
${T} .ong-tn-duel.fait .ong-tn-etat{color:#86EFAC}
${T} .ong-tn-duel.a-faire{border-color:rgba(245,166,35,.5);border-left:4px solid #F5A623}
${T} .ong-tn-duel.a-faire .ong-tn-etat{color:#F7C566}
${T} .ong-tn-duel.modifie{border-color:rgba(127,166,255,.7)}
${T} .ong-tn-duel.modifie .ong-tn-etat{color:#CFE0FF}
${T} .ong-tn-legende{margin:12px 0 0;font-size:14px;color:#AFC0EA}
${T} .ong-tn-final{display:grid!important;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:16px;overflow:visible}
${T} .ong-tn-final .tour{min-width:0;justify-content:flex-start;gap:10px}
${T} .ong-tn-final .tour h4{margin:0;font:800 20px var(--display);color:#F3DFA2}
${T} .ong-tn-finale{display:flex;flex-wrap:wrap;align-items:center;gap:12px 20px;padding:16px 18px;border-radius:16px;border:1px solid rgba(143,168,240,.2);background:rgba(10,20,48,.4)}
${T} .ong-tn-finale>p{flex:1;min-width:240px;margin:0;color:#D5DEFA;line-height:1.5}
${T} .ong-tn-finale-act{margin:0}
${T} .ong-tn-zone-suppr{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;margin-top:34px;padding:14px 18px;border-radius:16px;border:1px dashed rgba(248,113,113,.35)}
${T} .ong-tn-zone-suppr p{margin:0;color:#AFC0EA;font-size:14.5px}
/* ---------- thème clair ---------- */
${L} ${V} .ong-vet-astuce,${L} ${V} .ong-vet-mini,${L} ${V} .ong-vet-note,${L} ${V} .ong-vet-bloc h4,${L} ${V} .ong-vet-tiret{color:var(--texte-doux)}
${L} ${V} .ong-barre p b.ong-vet-alerte{color:#B45309}
${L} ${V} .ong-vet-puce.saisir{background:#FFF4E0;color:#9A5B00;border-color:#F5C26B}
${L} ${V} .ong-vet-puce.prochain{background:#E6EEFF;color:#1C4FD6;border-color:#9DB8FF}
${L} ${V} .an-carte.ong-vet-prochain{background:linear-gradient(135deg,#E9F0FF,#fff 60%);border-color:#7FA6FF}
${L} ${V} .an-carte.ong-vet-saisir{background:linear-gradient(90deg,#FFF6E6,#fff 55%)}
${L} ${V} .an-carte.ong-vet-saisir .pl-modif,${L} ${V} .ong-vet-saisir .ong-vb-score h4{color:#9A5B00}
${L} ${V} .pl-score.ong-vet-V{background:#DCFCE7;color:#15803D}
${L} ${V} .pl-score.ong-vet-N{background:#E8EEFB;color:#1E3A8A}
${L} ${V} .pl-score.ong-vet-D{background:#FEE2E2;color:#B91C1C}
${L} ${V} .ong-vet-bloc{background:#F6F8FE;border-color:#D7E0F5}
${L} ${V} .ong-vet-saisir .ong-vb-score{background:#FFF8EC;border-color:#F5C26B}
${L} ${T} .ong-tn-num{background:#E8EEFB;color:#1E3A8A;border-color:#B9C8EE}
${L} ${T} .ong-tn-etapes li{background:#fff;border-color:#D7E0F5;color:var(--texte-doux)}
${L} ${T} .ong-tn-etapes li.fait{color:#15803D;border-color:#A7E3BC}
${L} ${T} .ong-tn-etapes li.en-cours{background:linear-gradient(180deg,#2F6BFF,#1C4FD6);border-color:#1C4FD6;color:#fff}
${L} ${T} .ong-tn-etapes li.en-cours .ong-tn-num{background:#fff;color:#1C4FD6;border-color:#fff}
${L} ${T} .ong-tn-etape.fait .ong-tn-num,${L} ${T} .ong-tn-etapes li.fait .ong-tn-num{background:#16A34A;border-color:#16A34A;color:#fff}
${L} ${T} .ong-tn-duel.a-faire{border-color:#F5C26B;border-left-color:#F5A623}
${L} ${T} .ong-tn-duel.modifie{border-color:#7FA6FF}
${L} ${T} .ong-tn-pli-sous,${L} ${T} .ong-tn-indice,${L} ${T} .ong-tn-ensuite,${L} ${T} .ong-tn-sous,${L} ${T} .ong-tn-poule-info,${L} ${T} .ong-tn-cle,${L} ${T} .ong-tn-legende,${L} ${T} .ong-tn-zone-suppr p,${L} ${T} .ong-tn-tete p{color:var(--texte-doux)}
${L} ${T} .ong-tn-etape,${L} ${T} .ong-tn-form .t-rep,${L} ${T} .ong-tn-finale{background:#F6F8FE;border-color:#D7E0F5}
${L} ${T} .ong-tn-et-tete,${L} ${T} .ong-tn-avance{color:var(--texte)}
${L} ${T} .ong-tn-form .t-rep .af-choix{background:#fff}
${L} ${T} .ong-tn-resume.ok{background:#ECFDF3;color:#166534}
${L} ${T} .ong-tn-resume.attention{background:#FFF6E6;color:#8A5300}
${L} ${T} .t-puce{background:#fff;border-color:#C9D4F2}
${L} ${T} .t-ajout{background:#EEF3FF;color:#1C4FD6}
${L} ${T} .ong-tn-prog{color:#1C4FD6}
${L} ${T} .ong-tn-prog.fini{color:#8A6400}
${L} ${T} .ong-tn-statut{background:#EEF3FF;color:#1E3A8A}
${L} ${T} .ong-tn-statut.fini{background:#ECFDF3;color:#166534}
${L} ${T} .ong-tn-tete,${L} ${T} .ong-tn-poule{background:var(--carte);box-shadow:0 10px 26px rgba(7,18,48,.08);border-color:#D7E0F5}
${L} ${T} .ong-tn-duel{background:#fff;border-color:#D7E0F5}
${L} ${T} .ong-tn-eqs .gagne{background:#ECFDF3}
${L} ${T} .ong-tn-duel.fait .ong-tn-etat{color:#15803D}
${L} ${T} .ong-tn-duel.a-faire .ong-tn-etat{color:#9A5B00}
${L} ${T} .ong-tn-duel.modifie .ong-tn-etat{color:#1C4FD6}
${L} ${T} .ong-tn-final .tour h4{color:#8A6400}
${L} ${T} .ong-tn-finale>p{color:var(--texte)}
${L} ${V} .btn.danger,${L} ${T} .btn.danger{color:#B91C1C;border-color:rgba(220,38,38,.55);background:rgba(220,38,38,.06)}
${L} ${V} input:not([type=checkbox]):not([type=radio]):not([type=hidden]),${L} ${T} input:not([type=checkbox]):not([type=radio]):not([type=hidden]),${L} ${T} select,${L} ${V} select{background:#fff;border-color:#C9D4F2;color:var(--texte)}
${L} ${V} .ong-nb,${L} ${T} .ong-nb{background:rgba(28,79,214,.12);color:#1C4FD6}
/* ---------- tablette ---------- */
@media (max-width:1000px){
  ${T} .ong-tn-g1{grid-template-columns:repeat(2,minmax(0,1fr))}
  ${V} .ong-vet-blocs{grid-template-columns:minmax(0,1fr)}
}
/* ---------- téléphone ---------- */
@media (max-width:700px){
  ${V} .btn.petit,${T} .btn.petit,${V} .btn.btn,${T} .btn.btn{min-height:46px}
  ${V} .ong-vet-ajout{width:100%}
  ${V} .pl-tete{padding:12px;gap:12px;align-items:flex-start}
  ${V} .pl-txt>b{font-size:17px}
  ${V} .an-carte.ong-vet-prochain .pl-tete{padding:14px 12px}
  ${V} .an-carte.ong-vet-prochain .pl-txt>b{font-size:19px}
  ${V} .pl-modif,${V} .pl-score{align-self:center}
  ${V} .pl-modif{font-size:0;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:rgba(143,168,240,.12);border:1px solid rgba(143,168,240,.25)}
  ${V} .pl-modif::before{content:"✏️";font-size:17px}
  ${V} .ong-vet-saisir .pl-modif{background:rgba(245,166,35,.14);border-color:rgba(245,166,35,.45)}
  ${V} .pl-score{min-width:54px;font-size:18px;padding:4px 8px}
  ${V} .an-carte.ong-vet-ouverte{padding:14px}
  ${V} .ong-vet-bloc{padding:12px}
  ${V} .ong-vet-champs,${V} .ong-vb-match .ong-vet-champs,${V} .ong-vb-ou .ong-vet-champs{grid-template-columns:minmax(0,1fr)}
  ${V} .ong-vb-quand .ong-vet-champs{grid-template-columns:minmax(0,1.3fr) minmax(0,1fr)}
  ${V} .ong-vb-score .ong-vet-champs{grid-template-columns:minmax(0,1fr) auto minmax(0,1fr)}
  ${V} .ong-vet-btns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  ${V} .ong-vet-btns .btn.bleu{grid-column:1/-1;min-width:0}
  ${V} .ong-vet-btns .an-brouillon{grid-column:1/-1;order:-1}
  ${V} .ong-vet-btns .ong-a-part{margin-left:0;grid-column:1/-1;margin-top:8px}
  ${T} .ong-tn-etapes{gap:4px}
  ${T} .ong-tn-etapes li{flex-direction:column;gap:4px;padding:8px 4px;text-align:center;font-size:12.5px}
  ${T} .ong-tn-etapes li .long{display:none}
  ${T} .ong-tn-etapes li .court{display:inline}
  ${T} .ong-tn-etape{padding:14px}
  ${T} .ong-tn-et-tete{font-size:19px}
  ${T} .ong-tn-g1,${T} .ong-tn-g3{grid-template-columns:minmax(0,1fr)}
  ${T} .ong-tn-g3{grid-template-columns:repeat(2,minmax(0,1fr))}
  ${T} .t-puces{grid-template-columns:minmax(0,1fr)}
  ${T} .t-puce .t-num{height:44px!important}
  ${T} .t-puce button[data-a="t-eq-retirer"]{width:44px;height:44px}
  ${T} .ong-tn-duel input.num,${T} .ong-tn-tab select{height:44px!important;min-height:44px!important}
  ${T} .ong-tn-go{width:100%}
  ${T} .ong-tn-et-corps>.pleine .btn{width:100%}
  ${T} .ong-tn-cartes .item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px 14px;align-items:center;padding:14px}
  ${T} .ong-tn-cartes .bdate{grid-column:1;grid-row:1}
  ${T} .ong-tn-cartes .item-txt{grid-column:2/4;grid-row:1}
  ${T} .ong-tn-cartes .etiq{grid-column:1/3;grid-row:2;justify-self:start}
  ${T} .ong-tn-cartes [data-a="ouvrir-tournoi"]{grid-column:3;grid-row:2}
  ${T} .ong-tn-btns{display:grid;grid-template-columns:minmax(0,1fr)}
  ${T} .ong-tn-btns .ong-a-part{margin-left:0;margin-top:6px}
  ${T} .ong-tn-tete{padding:16px}
  ${T} .ong-tn-tete h2{font-size:25px}
  ${T} .ong-tn-tete-txt{min-width:0;flex-basis:100%}
  ${T} .ong-tn-tete-act{width:100%}
  ${T} .ong-tn-tete-act .btn{flex:1}
  ${T} .ong-tn-champion{font-size:21px}
  ${T} .ong-tn-poule{padding:12px}
  ${T} .ong-tn-eqs>div{padding:6px 8px 6px 12px;min-height:48px}
  ${T} .ong-tn-duel input.num{width:52px!important}
  ${T} .ong-tn-act{min-width:96px;padding:8px}
  ${T} .ong-tn-act .btn{padding:8px 10px}
  ${T} .ong-tn-finale-act,${T} .ong-tn-finale-act .btn{width:100%}
  ${T} .ong-tn-zone-suppr .btn{width:100%}
}`;
  document.head.appendChild(css);
})();
