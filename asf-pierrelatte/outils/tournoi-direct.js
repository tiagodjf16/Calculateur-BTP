<script id="tournoi-direct-js">
/* =====================================================================
   TOURNOIS EN DIRECT : la page des spectateurs, son QR code, l'affiche à imprimer
   - chaque tournoi a sa page (#tournoi/<id>), celle du QR code, avec seulement le tournoi (ni menu, ni barre du bas, ni pied
     de page, ni animation d'ouverture) : en arrivant, on choisit son équipe parmi les inscrites (retenu sur le téléphone) ;
     « Mon équipe » donne son classement, son prochain match et son heure, ses résultats ; puis le programme (les matchs par
     horaire, sinon par tour), le classement des poules, la phase finale et le vainqueur, l'équipe choisie mise en avant ;
     la page se met à jour toute seule dès qu'un score est validé dans l'espace club (le site relit ses données toutes les
     30 secondes), les scores qui viennent d'arriver s'éclairent ;
   - horaires : les matchs de poule alternent (poule A, poule B, A, B…), chaque équipe soufflant entre deux matchs si possible ;
     l'heure de chacun part de l'heure du premier match, de la durée d'un match, de la pause et du nombre de terrains
     (création du tournoi, ou carte « Horaires des matchs » dans « Gérer ») ; la phase finale suit, tour après tour ;
   - espace club › Matchs et plateaux › Tournois › Gérer : le QR code de cette page, l'affiche A4 à imprimer, le QR code
     en image, le lien à copier ; un tournoi créé est mis en ligne tout de suite (« Retirer du site » le cache) ;
   - page Tournois du site : un tournoi par carte (en direct, à venir, terminé), qui ouvre sa page.
   Ajouté sans modifier le script de l'application.
   ===================================================================== */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.rendreTournois !== "function") return;
  /* ---------- QR code (norme ISO 18004) : octets, correction M, versions 1 à 10, masque choisi au plus lisible ---------- */
  const QR = (() => {
    // correction M : [codes de correction par bloc, nombre de blocs], versions 1 à 10
    const ECC_M = [null, [10, 1], [16, 1], [26, 1], [18, 2], [24, 2], [16, 4], [18, 4], [22, 4], [22, 5], [26, 5]];
    const mult = (x, y) => { let z = 0; for (let i = 7; i >= 0; i--){ z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; } return z & 0xFF; };
    function diviseur(deg){
      const r = new Array(deg).fill(0); r[deg - 1] = 1; let racine = 1;
      for (let i = 0; i < deg; i++){
        for (let j = 0; j < deg; j++){ r[j] = mult(r[j], racine); if (j + 1 < deg) r[j] ^= r[j + 1]; }
        racine = mult(racine, 0x02);
      }
      return r;
    }
    function reste(data, div){
      const r = new Array(div.length).fill(0);
      data.forEach(b => { const f = b ^ r.shift(); r.push(0); div.forEach((c, i) => { r[i] ^= mult(c, f); }); });
      return r;
    }
    const modulesBruts = v => { let r = (16 * v + 128) * v + 64; if (v >= 2){ const n = Math.floor(v / 7) + 2; r -= (25 * n - 10) * n - 55; if (v >= 7) r -= 36; } return r; };
    const capacite = v => Math.floor(modulesBruts(v) / 8) - ECC_M[v][0] * ECC_M[v][1];       // octets de données
    function alignements(v){
      if (v === 1) return [];
      const n = Math.floor(v / 7) + 2, taille = v * 4 + 17, pas = Math.ceil((v * 4 + 4) / (n * 2 - 2)) * 2, l = [6];
      for (let p = taille - 7; l.length < n; p -= pas) l.splice(1, 0, p);
      return l;
    }
    function matrice(texte){
      const octets = [...new TextEncoder().encode(String(texte))];
      let v = 1; while (v <= 10 && 4 + (v < 10 ? 8 : 16) + octets.length * 8 > capacite(v) * 8) v++;
      if (v > 10) throw new Error("texte trop long pour le QR code");
      // 1. les bits : mode octets, longueur, données, fin, remplissage
      const bits = [], ajout = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
      ajout(4, 4); ajout(octets.length, v < 10 ? 8 : 16); octets.forEach(o => ajout(o, 8));
      const cap = capacite(v) * 8;
      ajout(0, Math.min(4, cap - bits.length)); ajout(0, (8 - bits.length % 8) % 8);
      for (let p = 0xEC; bits.length < cap; p ^= 0xEC ^ 0x11) ajout(p, 8);
      const data = []; for (let i = 0; i < bits.length; i += 8) data.push(parseInt(bits.slice(i, i + 8).join(""), 2));
      // 2. correction d'erreurs par blocs, puis entrelacement
      const [ecl, nb] = ECC_M[v], bruts = Math.floor(modulesBruts(v) / 8), courts = nb - bruts % nb, lgCourt = Math.floor(bruts / nb), div = diviseur(ecl);
      const blocs = []; let k = 0;
      for (let i = 0; i < nb; i++){
        const d = data.slice(k, k + lgCourt - ecl + (i < courts ? 0 : 1)); k += d.length;
        const c = reste(d, div); if (i < courts) d.push(0);
        blocs.push(d.concat(c));
      }
      const tout = [];
      for (let i = 0; i < blocs[0].length; i++) blocs.forEach((b, j) => { if (i !== lgCourt - ecl || j >= courts) tout.push(b[i]); });
      // 3. la grille : motifs fixes, puis les données en zigzag
      const n = v * 4 + 17, m = Array.from({ length: n }, () => new Array(n).fill(false)), fixe = Array.from({ length: n }, () => new Array(n).fill(false));
      const pose = (x, y, noir) => { m[y][x] = noir; fixe[y][x] = true; };
      for (let i = 0; i < n; i++){ pose(6, i, i % 2 === 0); pose(i, 6, i % 2 === 0); }
      const repere = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++){ const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < n && y >= 0 && y < n) pose(x, y, d !== 2 && d !== 4); } };
      repere(3, 3); repere(n - 4, 3); repere(3, n - 4);
      const al = alignements(v);
      al.forEach((a, i) => al.forEach((b, j) => { if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) pose(a + dx, b + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1); }));
      const format = masque => {                         // correction M (00) + masque, BCH, xor 0x5412
        const d = masque; let r = d; for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
        const b = ((d << 10) | r) ^ 0x5412, bit = i => ((b >>> i) & 1) === 1;
        for (let i = 0; i <= 5; i++) pose(8, i, bit(i));
        pose(8, 7, bit(6)); pose(8, 8, bit(7)); pose(7, 8, bit(8));
        for (let i = 9; i < 15; i++) pose(14 - i, 8, bit(i));
        for (let i = 0; i < 8; i++) pose(n - 1 - i, 8, bit(i));
        for (let i = 8; i < 15; i++) pose(8, n - 15 + i, bit(i));
        pose(8, n - 8, true);
      };
      format(0);
      if (v >= 7){
        let r = v; for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1F25);
        const b = (v << 12) | r;
        for (let i = 0; i < 18; i++){ const noir = ((b >>> i) & 1) === 1, a = n - 11 + i % 3, c = Math.floor(i / 3); pose(a, c, noir); pose(c, a, noir); }
      }
      let i = 0;
      for (let droite = n - 1; droite >= 1; droite -= 2){
        if (droite === 6) droite = 5;
        for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++){
          const x = droite - j, haut = ((droite + 1) & 2) === 0, y = haut ? n - 1 - vert : vert;
          if (!fixe[y][x] && i < tout.length * 8){ m[y][x] = ((tout[i >>> 3] >>> (7 - (i & 7))) & 1) === 1; i++; }
        }
      }
      // 4. le masque le plus lisible (règles de pénalité de la norme)
      const MASQUES = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x, y) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
        (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => x * y % 2 + x * y % 3 === 0,
        (x, y) => (x * y % 2 + x * y % 3) % 2 === 0, (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0];
      const appliquer = k => { for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!fixe[y][x] && MASQUES[k](x, y)) m[y][x] = !m[y][x]; };
      function penalite(){
        let p = 0, noirs = 0;
        const lignes = [...m.map(l => l.slice()), ...m[0].map((_, x) => m.map(l => l[x]))];
        lignes.forEach(l => {
          let run = 1;
          for (let x = 1; x <= l.length; x++){ if (x < l.length && l[x] === l[x - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
          const s = l.map(b => b ? "1" : "0").join("");
          for (const motif of ["10111010000", "00001011101"]) for (let k = s.indexOf(motif); k >= 0; k = s.indexOf(motif, k + 1)) p += 40;
        });
        for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++){ const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
        m.forEach(l => l.forEach(b => { if (b) noirs++; }));
        p += Math.floor(Math.abs(noirs * 20 - n * n * 10) / (n * n)) * 10;
        return p;
      }
      let meilleur = 0, pMin = Infinity;
      for (let k = 0; k < 8; k++){ appliquer(k); format(k); const p = penalite(); if (p < pMin){ pMin = p; meilleur = k; } appliquer(k); }
      appliquer(meilleur); format(meilleur);
      return m;
    }
    /* image SVG nette à toutes les tailles (marge blanche de 4 modules, exigée par les lecteurs) */
    function svg(texte, opts){
      const o = opts || {}, m = matrice(texte), n = m.length, q = 4, t = n + q * 2;
      let d = "";
      m.forEach((l, y) => l.forEach((b, x) => { if (b) d += `M${x + q} ${y + q}h1v1h-1z`; }));
      return `<svg class="${o.classe || "qr"}" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges" role="img" aria-label="${o.label || "QR code"}"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="${o.couleur || "#06192F"}"/></svg>`;
    }
    /* dans un canevas (affiche, image à télécharger) : x, y, côté en pixels, marge comprise */
    function dessiner(ctx, texte, x, y, cote, couleur){
      const m = matrice(texte), n = m.length, q = 4, t = n + q * 2, u = cote / t;
      ctx.fillStyle = "#fff"; ctx.fillRect(x, y, cote, cote);
      ctx.fillStyle = couleur || "#06192F";
      m.forEach((l, j) => l.forEach((b, i) => { if (b) ctx.fillRect(Math.floor(x + (i + q) * u), Math.floor(y + (j + q) * u), Math.ceil(u), Math.ceil(u)); }));
    }
    return { matrice, svg, dessiner };
  })();
  window.ASF_QR = QR;

  const H = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const auj = () => { try { return aujourdhui(); } catch(e){ return new Date().toISOString().slice(0, 10); } };
  const dateL = d => { try { return d ? dateLongue(d) : ""; } catch(e){ return d || ""; } };
  const logo = n => { try { return logoEquipeT(n); } catch(e){ return `<span class="t-logo">${H(String(n || "?").charAt(0).toUpperCase())}</span>`; } };
  const clPoule = (t, i) => { try { return classementPoule(t, i); } catch(e){ return []; } };
  const gagnant = m => { try { return vainqueur(m); } catch(e){ return null; } };
  const repe = t => { try { return repeches(t).map(e => e.nom); } catch(e){ return []; } };
  const pts = e => { try { return points(e); } catch(x){ return (+e.g || 0) * 3 + (+e.n || 0); } };
  const membre = () => { try { return !!peutCoacher(); } catch(e){ return false; } };
  const dire = (t, err) => { try { toast(t, err); } catch(e){} };
  const LETTRE = i => "ABCDEFGH".charAt(i) || String(i + 1);
  const aScore = m => typeof m.sa === "number" && typeof m.sb === "number";
  const matchsDe = t => Array.isArray(t.matchs) ? t.matchs : [];
  const poulesDe = t => Array.isArray(t.poules) ? t.poules : [];
  const maj1 = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  const nomFichier = s => String(s || "tournoi").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "tournoi";
  /* l'adresse de la page d'un tournoi (celle du QR code) */
  const BASE = () => /^https?:$/.test(location.protocol) ? location.origin + location.pathname : "https://asf-pierrelatte.fr/";
  const lienDe = t => BASE() + "#tournoi/" + encodeURIComponent(t.id);
  const idDuHash = () => { const r = location.hash.match(/^#tournoi\/([^/?#]+)/); try { return r ? decodeURIComponent(r[1]) : ""; } catch(e){ return ""; } };
  /* le blason du club en tête de la page du tournoi : une image, pas un lien (la page ne mène qu'au tournoi) */
  const BLASON = `<span class="trn-blason" aria-hidden="true">${typeof LOGO_SRC !== "undefined" ? `<img src="${LOGO_SRC}" alt="">` : ""}</span>`;
  const CHEV = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>`;
  const ICO_QR = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="14" y="3.5" width="6.5" height="6.5" rx="1"/><rect x="3.5" y="14" width="6.5" height="6.5" rx="1"/><path d="M14 14h2.5v2.5H14zM18 18h2.5v2.5H18zM18 14h2.5M14 18v2.5"/></svg>`;
  const PIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;

  /* ---------- où en est le tournoi : à venir, en direct, terminé ---------- */
  function etat(t){
    const ms = matchsDe(t).filter(m => !m.exempt), joues = ms.filter(aScore).length, total = ms.length;
    const ko = matchsDe(t).some(m => m.phase !== "poule");
    let ch = null; try { ch = champion(t); } catch(e){}
    if (!ch && !(+t.qualif > 0) && poulesDe(t).length === 1 && total && joues === total) ch = (clPoule(t, 0)[0] || {}).nom || null;
    const fini = !!ch || (total > 0 && joues === total && !(+t.qualif > 0 && !ko));
    const a = auj(), d = String(t.date || "");
    const k = fini ? "fini" : d && d > a ? "avenir" : d && d < a ? (joues ? "fini" : "avenir") : (d === a || joues ? "direct" : "avenir");
    return { k, joues, total, ch, ko };
  }
  const ETAT_L = { direct: "En direct", avenir: "À venir", fini: "Terminé" };
  const pastille = e => `<span class="trn-etat ${e.k}">${e.k === "direct" ? "<i></i>" : ""}${ETAT_L[e.k]}</span>`;
  const compte = e => `${e.joues} match${e.joues > 1 ? "s" : ""} joué${e.joues > 1 ? "s" : ""} sur ${e.total}`;
  const metaDe = t => [t.cat, maj1(dateL(t.date)), t.horaire && t.horaire.debut ? "dès " + hTxt(t.horaire.debut) : "", t.lieu].filter(Boolean).map(H).join(" · ");
  const visible = t => !!t && (!!t.publie || membre());
  /* l'équipe du spectateur, retenue sur son téléphone pour ce tournoi ("-" : il a préféré tout voir) */
  const equipesDe = t => [...new Set(poulesDe(t).flat().filter(Boolean))];
  const CLE_EQ = id => "asf-trn-equipe:" + id;
  function equipeChoisie(t){
    let v = ""; try { v = localStorage.getItem(CLE_EQ(t.id)) || ""; } catch(e){}
    return v === "-" || equipesDe(t).includes(v) ? v : "";
  }
  const retenirEquipe = (t, v) => { try { if (v) localStorage.setItem(CLE_EQ(t.id), v); else localStorage.removeItem(CLE_EQ(t.id)); } catch(e){} };
  /* page d'un tournoi : seulement le tournoi (classe aussi posée dès le <head>, pour une arrivée directe par le QR code) */
  const modeTournoi = () => document.documentElement.classList.toggle("trn-mode", /^#tournoi\//.test(location.hash));
  modeTournoi();
  window.addEventListener("hashchange", modeTournoi);

  /* ---------- horaires des matchs ---------- */
  const minutesDe = h => { const m = String(h || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
  const hhmm = n => `${String(Math.floor(n / 60) % 24).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
  const hTxt = h => h ? String(h).slice(0, 5).replace(":", "h") : "";
  const borne = (v, a, b, d) => { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(b, Math.max(a, n)) : d; };
  function reglages(src){
    const d = minutesDe(src && src.debut);
    return d === null ? null : { debut: hhmm(d), duree: borne(src.duree, 3, 90, 10), pause: borne(src.pause, 0, 60, 0), terrains: borne(src.terrains, 1, 8, 1) };
  }
  /* les matchs de poule : poule A, poule B, A, B… ; à chaque créneau, autant de matchs que de terrains, jamais deux fois la même
     équipe, et de préférence pas une équipe qui vient de jouer ; les matchs déjà joués gardent leur heure */
  function programmer(t, src){
    const h = reglages(src), P = poulesDe(t), ms = matchsDe(t);
    const poule = ms.filter(m => m.phase === "poule"), joues = h ? poule.filter(aScore) : [];
    const parPoule = P.map((_, i) => poule.filter(m => m.poule === i && !joues.includes(m)));
    const file = []; for (let k = 0; parPoule.some(l => k < l.length); k++) parPoule.forEach(l => { if (k < l.length) file.push(l[k]); });
    const ko = ms.filter(m => m.phase !== "poule");
    if (!h){ t.matchs = [...file, ...ko]; return t; }                    // pas d'heure de début : seulement l'alternance des poules
    const pas = h.duree + h.pause, d0 = minutesDe(h.debut), N = h.terrains, out = [];
    let creneau = 0, avant = new Set();
    while (file.length){
      const dans = new Set(), pris = [];
      const essai = repos => { for (const m of file){ if (pris.length >= N) break;
        if (pris.includes(m) || dans.has(m.a) || dans.has(m.b) || (repos && (avant.has(m.a) || avant.has(m.b)))) continue;
        pris.push(m); dans.add(m.a); dans.add(m.b); } };
      essai(true); essai(false);
      if (!pris.length) pris.push(file[0]);
      pris.forEach((m, k) => { m.heure = hhmm(d0 + creneau * pas); m.terrain = k + 1; file.splice(file.indexOf(m), 1); out.push(m); });
      avant = dans; creneau++;
    }
    ko.forEach(m => { if (!aScore(m)){ delete m.heure; delete m.terrain; } });
    t.matchs = [...joues, ...out, ...ko];
    t.horaire = h;
    horaireKO(t);
    return t;
  }
  /* la phase finale : ses matchs à la suite des derniers horaires, tour après tour */
  function horaireKO(t){
    const h = t && t.horaire; if (!h || minutesDe(h.debut) === null) return;
    const pas = (+h.duree || 10) + (+h.pause || 0), N = Math.max(1, +h.terrains || 1), ms = matchsDe(t);
    const sans = ms.filter(m => m.phase !== "poule" && !m.exempt && !m.heure && m.a && m.b && !aScore(m));
    if (!sans.length) return;
    const deja = ms.filter(m => m.heure && !sans.includes(m)).map(m => minutesDe(m.heure)).filter(x => x !== null);
    let t0 = deja.length ? Math.max(...deja) + pas : minutesDe(h.debut);
    [...new Set(sans.map(m => m.tour))].sort((a, b) => a - b).forEach(tour => {
      const l = sans.filter(m => m.tour === tour);
      l.forEach((m, i) => { m.heure = hhmm(t0 + Math.floor(i / N) * pas); m.terrain = i % N + 1; });
      t0 += Math.ceil(l.length / N) * pas;
    });
  }
  ["lancerFinale", "avancer"].forEach(nom => {                          // les matchs de phase finale reçoivent leur heure en naissant
    const avant = window[nom]; if (typeof avant !== "function") return;
    window[nom] = function(t){ const r = avant.apply(this, arguments); try { horaireKO(t); } catch(e){} return r; };
  });
  const terrainTxt = (t, m) => m.terrain && t.horaire && +t.horaire.terrains > 1 ? ` · Terrain ${m.terrain}` : "";

  /* ---------- une carte de match : les deux équipes, leur score, le vainqueur en blanc ---------- */
  const ST = { id: "", onglet: "matchs", sig: "", vus: {}, moi: "" };
  function carteM(t, m, tag){
    if (m.exempt) return `<div class="trn-m exempt${m.a === ST.moi ? " moi" : ""}">${tag ? `<span class="trn-m-tag">${H(tag)}</span>` : ""}
      <div class="trn-m-l g">${logo(m.a)}<span>${H(m.a)}</span><b></b></div><p class="trn-m-note">Qualifiée d'office pour le tour suivant</p></div>`;
    const j = aScore(m), w = j ? gagnant(m) : null, cle = t.id + "|" + m.id, sc = j ? `${m.sa}-${m.sb}-${m.tab || ""}` : "";
    const nouveau = j && ST.vus[cle] !== undefined && ST.vus[cle] !== sc;
    ST.vus[cle] = sc;
    const ligne = (n, s) => `<div class="trn-m-l${w ? (w === n ? " g" : " p") : ""}${n && n === ST.moi ? " moi" : ""}">${n ? logo(n) : `<span class="t-logo">?</span>`}<span>${H(n || "À déterminer")}</span><b>${j ? s : ""}</b></div>`;
    const aMoi = !!ST.moi && (m.a === ST.moi || m.b === ST.moi), lieu = terrainTxt(t, m);
    return `<div class="trn-m${j ? " joue" : ""}${nouveau ? " nouveau" : ""}${aMoi ? " moi" : ""}">
      <span class="trn-m-tag"><span>${H((tag || "") + (tag ? lieu : lieu.replace(/^ · /, "")))}</span>${j ? (nouveau ? `<em class="neuf">Nouveau score</em>` : (m.heure ? `<small>${hTxt(m.heure)}</small>` : ""))
        : `<em>${m.heure ? hTxt(m.heure) : "À jouer"}</em>`}</span>
      ${ligne(m.a, m.sa)}${ligne(m.b, m.sb)}${j && m.tab && m.sa === m.sb ? `<p class="trn-m-note">${H(m.tab)} gagne aux tirs au but</p>` : ""}</div>`;
  }

  /* ---------- onglet Matchs : les tours de poule, puis la phase finale ---------- */
  function ongletMatchs(t){
    const ms = matchsDe(t), poule = ms.filter(m => m.phase === "poule"), ko = ms.filter(m => m.phase !== "poule");
    const tagDe = m => m.phase === "poule" ? `Poule ${LETTRE(m.poule || 0)}` : m.phase;
    let secs;
    if (ms.some(m => m.heure)){                                           // le programme : un créneau par horaire
      const avecH = ms.filter(m => m.heure), heures = [...new Set(avecH.map(m => m.heure))].sort();
      secs = heures.map(h => ({ titre: hTxt(h), l: avecH.filter(m => m.heure === h).sort((a, b) => (a.terrain || 0) - (b.terrain || 0)), tag: tagDe, heure: true }));
      const sans = ms.filter(m => !m.heure);
      [...new Set(sans.map(m => m.phase === "poule" ? "poule" : m.tour))].forEach(k => { const l = sans.filter(m => (m.phase === "poule" ? "poule" : m.tour) === k);
        secs.push({ titre: k === "poule" ? "Matchs de poule" : l[0].phase, l, tag: tagDe }); });
    } else {
      const tours = [...new Set(poule.map(m => +m.journee || 1))].sort((a, b) => a - b);
      secs = tours.map(j => ({ titre: tours.length > 1 ? `Tour ${j}` : "Matchs de poule",
        l: poule.filter(m => (+m.journee || 1) === j).sort((a, b) => (a.poule || 0) - (b.poule || 0)), tag: tagDe }));
      [...new Set(ko.map(m => m.tour))].sort((a, b) => a - b).forEach(n => { const l = ko.filter(m => m.tour === n); secs.push({ titre: l[0].phase, l, tag: () => l[0].phase }); });
    }
    if (!secs.length) return `<p class="fa-vide">Les matchs s'afficheront ici après le tirage au sort.</p>`;
    const enCours = secs.findIndex(s => s.l.some(m => !m.exempt && !aScore(m)));
    return secs.map((s, i) => `<h3 class="trn-sec${s.heure ? " trn-sec-h" : ""}">${H(s.titre)}${i === enCours && ST.etat === "direct" ? `<em>${s.heure ? "À suivre" : "En cours"}</em>` : ""}</h3>
      <div class="trn-grille">${s.l.map(m => carteM(t, m, s.tag(m))).join("")}</div>`).join("");
  }

  /* ---------- onglet Classement : une table par poule (qualifiés en vert, repêchés en doré) ---------- */
  function ongletClassement(t){
    const Q = +t.qualif || 0, rep = repe(t), P = poulesDe(t);
    if (!P.length) return `<p class="fa-vide">Le classement s'affichera après le tirage au sort.</p>`;
    const diff = e => { const d = (+e.bp || 0) - (+e.bc || 0); return (d > 0 ? "+" : "") + d; };
    return P.map((p, i) => {
      const l = clPoule(t, i), ms = matchsDe(t).filter(m => m.phase === "poule" && m.poule === i);
      return `<section class="trn-poule"><h3 class="trn-sec">Poule ${LETTRE(i)}<small>${ms.filter(aScore).length} / ${ms.length} matchs joués</small></h3>
        <div class="trn-cl"><div class="trn-cl-l trn-cl-t"><span></span><span></span><span>J</span><span class="gnp">G</span><span class="gnp">N</span><span class="gnp">P</span><span>Diff</span><span class="pts">Pts</span></div>
        ${l.map((e, r) => `<div class="trn-cl-l${r < Q ? " q" : rep.includes(e.nom) ? " r" : ""}${e.nom === ST.moi ? " moi" : ""}"><span class="rg">${r + 1}</span><span class="eq">${logo(e.nom)}<b>${H(e.nom)}</b></span>
          <span>${e.j}</span><span class="gnp">${e.g}</span><span class="gnp">${e.n}</span><span class="gnp">${e.p}</span><span>${diff(e)}</span><span class="pts">${pts(e)}</span></div>`).join("")}</div></section>`;
    }).join("") + (Q ? `<p class="trn-legende"><span class="q"></span>${Q > 1 ? `Les ${Q} premiers sont qualifiés` : "Le premier est qualifié"} pour la phase finale${+t.repechage ? `<span class="r"></span>${+t.repechage > 1 ? `Les ${+t.repechage} meilleurs ${Q + 1}es sont repêchés` : `Le meilleur ${Q + 1}e est repêché`}` : ""}</p>`
      : `<p class="trn-legende">3 points la victoire, 1 le match nul ; à égalité, la différence de buts départage.</p>`);
  }

  /* ---------- onglet Mon équipe : choisir son équipe parmi les inscrites, puis tout sur elle ---------- */
  function choixEquipe(t){
    const P = poulesDe(t);
    return `<section class="trn-choix"><h2 class="trn-choix-t">Choisis ton équipe</h2>
        <p class="trn-choix-s">Ses matchs, leurs horaires, ses scores et son classement s'afficheront en premier. Tu pourras en changer quand tu veux.</p>
        ${P.map((p, i) => `${P.length > 1 ? `<h3 class="trn-sec">Poule ${LETTRE(i)}</h3>` : ""}<div class="trn-choix-l">${(p || []).filter(Boolean).map(n =>
          `<button type="button" class="trn-eq" data-trn-eq="${H(n)}">${logo(n)}<b>${H(n)}</b></button>`).join("")}</div>`).join("")}
        <button type="button" class="trn-passer" data-trn-eq="-">Voir tout le tournoi sans choisir d'équipe</button></section>`;
  }
  const rangTxt = r => r === 1 ? "1re" : r + "e";
  function ongletEquipe(t, e){
    const moi = ST.moi;
    if (!moi) return choixEquipe(t);
    const ms = matchsDe(t).filter(m => m.a === moi || m.b === moi);
    const pi = poulesDe(t).findIndex(p => (p || []).includes(moi)), cl = pi >= 0 ? clPoule(t, pi) : [];
    const r = cl.findIndex(x => x.nom === moi), l = cl[r] || { j: 0, g: 0, n: 0, p: 0, bp: 0, bc: 0 }, Q = +t.qualif || 0;
    const ko = ms.filter(m => m.phase !== "poule"), perdu = ko.find(m => aScore(m) && gagnant(m) && gagnant(m) !== moi);
    const poulesFinies = matchsDe(t).filter(m => m.phase === "poule").every(aScore);
    let statut = "", cls = "";
    if (e.ch === moi){ statut = "🏆 Vainqueur du tournoi !"; cls = "or"; }
    else if (perdu){ statut = `Éliminée en phase finale (${perdu.phase.toLowerCase()})`; cls = "fin"; }
    else if (ko.length){ statut = "✓ Qualifiée pour la phase finale"; cls = "ok"; }
    else if (Q && poulesFinies && r >= 0){ const q = r < Q || repe(t).includes(moi); statut = q ? "✓ Qualifiée pour la phase finale" : "Éliminée en poule"; cls = q ? "ok" : "fin"; }
    const tag = m => m.phase === "poule" ? `Poule ${LETTRE(m.poule || 0)}${m.journee && !m.heure ? " · Tour " + m.journee : ""}` : m.phase;
    const joues = ms.filter(m => !m.exempt && aScore(m)).reverse(), aVenir = ms.filter(m => !m.exempt && !aScore(m));
    const prochain = aVenir.find(m => m.a && m.b), autres = aVenir.filter(m => m !== prochain);
    const diff = (+l.bp || 0) - (+l.bc || 0);
    return `<section class="trn-moi">
        <div class="trn-moi-tete">${logo(moi)}<div class="trn-moi-nom"><b>${H(moi)}</b><small>${pi >= 0 ? `Poule ${LETTRE(pi)}${r >= 0 && l.j ? ` · ${rangTxt(r + 1)} sur ${cl.length}` : ""}` : ""}</small></div>
          <button type="button" class="trn-changer" data-trn-changer>Changer d'équipe</button></div>
        <div class="trn-moi-stats">${[["Pts", pts(l)], ["J", l.j], ["G", l.g], ["N", l.n], ["P", l.p], ["Diff", (diff > 0 ? "+" : "") + diff]].map(([k, v]) => `<div><b>${v}</b><small>${k}</small></div>`).join("")}</div>
        ${statut ? `<p class="trn-moi-statut ${cls}">${statut}</p>` : ""}</section>
      ${prochain ? `<h3 class="trn-sec">Prochain match${prochain.heure ? `<small>à ${hTxt(prochain.heure)}${terrainTxt(t, prochain).replace(" · ", ", ")}</small>` : ""}</h3><div class="trn-grille">${carteM(t, prochain, tag(prochain))}</div>` : ""}
      ${joues.length ? `<h3 class="trn-sec">Ses résultats</h3><div class="trn-grille">${joues.map(m => carteM(t, m, tag(m))).join("")}</div>` : ""}
      ${autres.length ? `<h3 class="trn-sec">Ses matchs suivants</h3><div class="trn-grille">${autres.map(m => carteM(t, m, tag(m))).join("")}</div>` : ""}
      ${!ms.length ? `<p class="fa-vide">Pas encore de match pour ${H(moi)}.</p>` : ""}`;
  }

  /* ---------- onglet Phase finale : le tableau, tour par tour, jusqu'au vainqueur ---------- */
  function ongletFinale(t, e){
    const ko = matchsDe(t).filter(m => m.phase !== "poule"), Q = +t.qualif || 0, R = +t.repechage || 0;
    if (!ko.length){
      const n = Q * poulesDe(t).length + R;
      return `<p class="fa-vide">${Q ? `La phase finale commencera après les poules : ${Q > 1 ? `les ${Q} premiers` : "le premier"} de chaque poule${R ? ` et ${R} repêché${R > 1 ? "s" : ""}` : ""}, soit ${n} équipe${n > 1 ? "s" : ""}.`
        : "Ce tournoi n'a pas de phase finale : le classement des poules donne le vainqueur."}</p>`;
    }
    const tours = [...new Set(ko.map(m => m.tour))].sort((a, b) => a - b);
    return `<div class="trn-tableau">${tours.map(n => { const l = ko.filter(m => m.tour === n);
        return `<div class="trn-tour"><h4>${H(l[0].phase)}</h4><div class="trn-tour-l">${l.map(m => carteM(t, m, "")).join("")}</div></div>`; }).join("")}
      ${e.ch ? `<div class="trn-tour trn-coupe"><h4>Vainqueur</h4><div class="trn-vainqueur"><span class="trn-trophee" aria-hidden="true">🏆</span>${logo(e.ch)}<b>${H(e.ch)}</b></div></div>` : ""}</div>`;
  }

  /* ---------- la page d'un tournoi ---------- */
  function rendrePage(force){
    const z = document.getElementById("trn"); if (!z) return;
    const id = idDuHash(); if (!id) return;
    const t = (S.tournois || []).find(x => x.id === id);
    if (ST.id !== id && t){ ST.id = id; ST.sig = ""; ST.onglet = equipeChoisie(t) === "-" ? "matchs" : "equipe"; }
    if (!t || !visible(t)){
      const msg = !S.pret ? "Chargement du tournoi…" : "Ce tournoi n'est pas (ou plus) en ligne.";
      const html = `<div class="eqp-tete trn-tete">${BLASON}<h1 class="eqp-titre">Tournoi</h1></div>
        <div class="wrap trn-corps"><p class="fa-vide">${msg}</p></div>`;
      if (html !== ST.sig){ ST.sig = html; z.innerHTML = html; }
      return;
    }
    const e = etat(t); ST.etat = e.k;
    const choix = equipeChoisie(t); ST.moi = choix && choix !== "-" ? choix : "";
    const ko = e.ko || +t.qualif > 0;
    if (ST.onglet === "finale" && !ko) ST.onglet = "matchs";
    const sig = JSON.stringify([t, ST.onglet, e.k, choix]);
    if (!force && sig === ST.sig) return;
    ST.sig = sig;
    const pct = e.total ? Math.round(e.joues / e.total * 100) : 0;
    const ONGS = [["equipe", "Mon équipe"], ["matchs", "Matchs"], ["classement", "Classement"], ...(ko ? [["finale", "Phase finale"]] : [])];
    const corps = ST.onglet === "equipe" ? ongletEquipe(t, e) : ST.onglet === "classement" ? ongletClassement(t) : ST.onglet === "finale" ? ongletFinale(t, e) : ongletMatchs(t);
    const q = t.lieu ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.lieu)}` : "";
    z.innerHTML = `<div class="eqp-tete trn-tete ${e.k}">
        ${BLASON}
        <h1 class="eqp-titre">${H(t.nom || "Tournoi")}</h1>
        <button type="button" class="hexa-b" data-trn-partager aria-label="Partager la page du tournoi (QR code)">${ICO_QR}</button>
        <p class="trn-meta">${metaDe(t)}${q ? ` <a class="trn-pin" href="${q}" target="_blank" rel="noopener" aria-label="Voir le lieu sur le plan">${PIN}</a>` : ""}</p>
        <div class="trn-ligne">${pastille(e)}${e.total ? `<span class="trn-compte">${compte(e)}</span>` : ""}</div>
        ${e.total ? `<div class="trn-barre" aria-hidden="true"><i style="width:${pct}%"></i></div>` : ""}
        ${e.ch ? `<div class="trn-champion"><span aria-hidden="true">🏆</span>${logo(e.ch)}<div><small>Vainqueur</small><b>${H(e.ch)}</b></div></div>` : ""}
        ${e.k === "direct" ? `<p class="trn-auto">Les scores arrivent tout seuls, sans recharger la page.</p>` : ""}</div>
      <nav class="club-onglets eqp-onglets" aria-label="${H(t.nom || "Tournoi")}">${ONGS.map(([k, l]) => `<button type="button" class="${ST.onglet === k ? "actif" : ""}" data-trno="${k}">${l}</button>`).join("")}</nav>
      <div class="wrap trn-corps">${corps}</div>`;
  }

  /* ---------- la page Tournois du site : une carte par tournoi ---------- */
  function rendreListe(){
    const z = document.getElementById("liste-tournois"); if (!z) return;
    const l = (S.tournois || []).filter(t => t && t.publie);
    if (!l.length) return;                                     // le message « Aucun tournoi en cours » de l'application reste
    const rang = { direct: 0, avenir: 1, fini: 2 };
    const ls = l.map(t => ({ t, e: etat(t) })).sort((a, b) => rang[a.e.k] - rang[b.e.k]
      || (a.e.k === "avenir" ? String(a.t.date || "").localeCompare(String(b.t.date || "")) : String(b.t.date || "").localeCompare(String(a.t.date || ""))));
    z.innerHTML = `<div class="trn-liste">${ls.map(({ t, e }) => carteTournoi(t, e)).join("")}</div>`;
  }
  function carteTournoi(t, e){
    e = e || etat(t);
    return `<a class="trn-carte ${e.k}" href="#tournoi/${encodeURIComponent(t.id)}">
        <span class="trn-carte-ico" aria-hidden="true">🏆</span>
        <span class="trn-carte-t"><b>${H(t.nom || "Tournoi")}</b><small>${metaDe(t)}</small>
          ${e.ch ? `<small class="trn-carte-v">Vainqueur : ${H(e.ch)}</small>` : e.total && e.joues ? `<small>${compte(e)}</small>` : ""}</span>
        ${pastille(e)}${CHEV}</a>`;
  }
  window.ASF_TOURNOI = { carte: t => carteTournoi(t), lien: lienDe, programmer };      // l'onglet Matchs montre le tournoi de son week-end

  /* ---------- partager : le QR code de la page, le lien ---------- */
  function copier(txt){
    const fini = ok => dire(ok ? "Lien copié : colle-le où tu veux (message, réseaux…)." : "Copie impossible : appuie longuement sur le lien pour le copier.", !ok);
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(txt).then(() => fini(true), () => fini(vieuxCopier(txt)));
    else fini(vieuxCopier(txt));
  }
  function vieuxCopier(txt){
    const ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("readonly", ""); ta.style.cssText = "position:fixed;left:-9999px;top:0";
    document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, txt.length);
    let ok = false; try { ok = document.execCommand("copy"); } catch(e){} ta.remove(); return ok;
  }
  function ouvrirPartage(t){
    if (typeof zoneModale !== "function") return;
    const url = lienDe(t);
    zoneModale().innerHTML = `<div class="modale-fond trn-qr-fond"><div class="modale trn-qr-modale" role="dialog" aria-label="Suivre ${H(t.nom)} en direct" data-trn-t="${H(t.id)}">
      <div class="modale-tete"><div><b>Suivre le tournoi en direct</b><small>${H(t.nom || "")}</small></div><button type="button" class="modale-x" data-stage-fermer aria-label="Fermer">×</button></div>
      <div class="modale-corps"><div class="trn-qr">${QR.svg(url, { label: "QR code de la page du tournoi" })}</div>
        <p class="trn-qr-txt">Fais scanner ce QR code avec l'appareil photo d'un téléphone : la page du tournoi s'ouvre, avec les scores en direct.</p>
        <p class="trn-qr-lien">${H(url)}</p></div>
      <div class="modale-pied">${navigator.share ? `<button type="button" class="btn bleu" data-trn-a="partager">Partager le lien</button>` : ""}
        <button type="button" class="btn ${navigator.share ? "contour" : "bleu"}" data-trn-a="copier">Copier le lien</button></div></div></div>`;
    document.body.classList.add("modale-ouverte");
  }

  /* ---------- images : le QR code seul, et l'affiche A4 à imprimer ---------- */
  function enregistrer(blob, nom){
    if (!blob){ dire("Image impossible à fabriquer sur cet appareil.", true); return; }
    try { if (window.ASFP_AFF && typeof ASFP_AFF.enregistrerImage === "function") return ASFP_AFF.enregistrerImage(blob, nom); } catch(e){}
    try { S.downloads.save({ filename: nom, data: blob }); } catch(e){ dire("Téléchargement impossible.", true); }
  }
  const chargerImage = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
  async function polices(){ try { await Promise.all(['400 120px "Bebas Neue"', '700 40px "Barlow"', '500 40px "Barlow"'].map(f => document.fonts.load(f))); } catch(e){} }
  function imageQR(t){
    const c = document.createElement("canvas"); c.width = c.height = 1200;
    QR.dessiner(c.getContext("2d"), lienDe(t), 0, 0, 1200, "#000");
    c.toBlob(b => enregistrer(b, `qr-code-${nomFichier(t.nom)}.png`), "image/png");
  }
  /* texte sur une ou deux lignes, la police réduite jusqu'à ce qu'il tienne */
  function titreAjuste(x, txt, cx, y, larg, taille, min){
    const mots = String(txt).toUpperCase().split(/\s+/).filter(Boolean);
    for (let s = taille; s >= min; s -= 4){
      x.font = `400 ${s}px "Bebas Neue","Arial Narrow",Arial,sans-serif`;
      if (x.measureText(mots.join(" ")).width <= larg){ x.fillText(mots.join(" "), cx, y + s); return y + s; }
      for (let k = 1; k < mots.length; k++){
        const a = mots.slice(0, k).join(" "), b = mots.slice(k).join(" ");
        if (x.measureText(a).width <= larg && x.measureText(b).width <= larg){ x.fillText(a, cx, y + s); x.fillText(b, cx, y + s * 2); return y + s * 2; }
      }
    }
    x.font = `400 ${min}px "Bebas Neue","Arial Narrow",Arial,sans-serif`; x.fillText(mots.join(" "), cx, y + min, larg); return y + min;
  }
  async function affiche(t){
    await polices();
    const W = 1240, HT = 1754, c = document.createElement("canvas"); c.width = W; c.height = HT;
    const x = c.getContext("2d"); x.textAlign = "center"; x.textBaseline = "alphabetic";
    const g = x.createLinearGradient(0, 0, W * .4, HT); g.addColorStop(0, "#030E1C"); g.addColorStop(1, "#0B2747");
    x.fillStyle = g; x.fillRect(0, 0, W, HT);
    const halo = x.createRadialGradient(W / 2, 0, 20, W / 2, 0, 760); halo.addColorStop(0, "rgba(208,46,38,.30)"); halo.addColorStop(1, "rgba(208,46,38,0)");
    x.fillStyle = halo; x.fillRect(0, 0, W, 800);
    x.strokeStyle = "rgba(255,255,255,.07)"; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 560); x.lineTo(W, 180); x.stroke();
    // le blason du club
    x.fillStyle = "#fff"; x.beginPath(); x.arc(W / 2, 190, 118, 0, Math.PI * 2); x.fill();
    const img = typeof LOGO_SRC !== "undefined" ? await chargerImage(LOGO_SRC) : null;
    if (img) x.drawImage(img, W / 2 - 102, 88, 204, 204);
    x.fillStyle = "#C9B07F"; x.font = '700 34px "Barlow",Arial,sans-serif'; x.fillText("ATOM'SPORTS FOOTBALL PIERRELATTE", W / 2, 374);
    // le tournoi
    x.fillStyle = "#fff";
    let y = titreAjuste(x, t.nom || "Tournoi", W / 2, 392, W - 140, 150, 74);
    const meta = [t.cat, maj1(dateL(t.date)), t.lieu].filter(Boolean).join("  ·  ");
    x.fillStyle = "#D0D9E1"; x.font = '500 38px "Barlow",Arial,sans-serif'; x.fillText(meta, W / 2, y + 62, W - 140);
    x.fillStyle = "#D02E26"; x.fillRect(W / 2 - 50, y + 96, 100, 8);
    // le QR code, dans son cadre blanc
    const qy = y + 150, cote = Math.min(720, HT - 330 - qy), qx = (W - cote) / 2;          // le QR code prend la place qui reste
    x.fillStyle = "#fff"; x.beginPath();
    if (x.roundRect) x.roundRect(qx - 24, qy - 24, cote + 48, cote + 48, 34); else x.rect(qx - 24, qy - 24, cote + 48, cote + 48);
    x.fill();
    QR.dessiner(x, lienDe(t), qx, qy, cote, "#06192F");
    x.fillStyle = "#fff"; x.font = '400 86px "Bebas Neue","Arial Narrow",Arial,sans-serif'; x.fillText("SCANNEZ POUR SUIVRE LES SCORES", W / 2, qy + cote + 130, W - 100);
    x.fillStyle = "#D02E26"; x.font = '400 86px "Bebas Neue","Arial Narrow",Arial,sans-serif'; x.fillText("EN DIRECT", W / 2, qy + cote + 218);
    x.fillStyle = "#8F9BB0"; x.font = '500 30px "Barlow",Arial,sans-serif'; x.fillText("Matchs, classements et phase finale, mis à jour à chaque score", W / 2, qy + cote + 276, W - 100);
    c.toBlob(b => enregistrer(b, `affiche-${nomFichier(t.nom)}.png`), "image/png");
  }

  /* ---------- espace club : la carte « Page des spectateurs » dans « Gérer » un tournoi ---------- */
  function carteAdmin(t){
    const url = lienDe(t);
    return `<section class="trn-qr-carte" data-trn-t="${H(t.id)}">
      <div class="trn-qr-mini" aria-hidden="true">${QR.svg(url)}</div>
      <div class="trn-qr-info">
        <h3>📱 Page des spectateurs</h3>
        <p>${t.publie ? "<b>En ligne.</b> Les spectateurs scannent ce QR code et suivent le tournoi en direct : chaque score que tu valides s'affiche tout seul sur leur téléphone (30 secondes au plus)."
          : "<b>Pas encore en ligne.</b> Mets le tournoi sur le site : le QR code ouvrira sa page, avec les scores en direct."}</p>
        <p class="trn-qr-lien"><a href="#tournoi/${encodeURIComponent(t.id)}" target="_blank" rel="noopener">${H(url)}</a></p>
        <div class="trn-qr-btns">
          ${t.publie ? "" : `<button type="button" class="btn bleu" data-a="toggle-tournoi">Mettre en ligne</button>`}
          <button type="button" class="btn ${t.publie ? "bleu" : "contour"}" data-trn-a="affiche">🖨️ Affiche à imprimer</button>
          <button type="button" class="btn contour" data-trn-a="qr-png">⬇️ QR code en image</button>
          <button type="button" class="btn contour" data-trn-a="copier">🔗 Copier le lien</button>
        </div>
      </div></section>`;
  }
  function carteHoraires(t){
    const h = t.horaire || {}, ms = matchsDe(t), reste = ms.some(m => m.heure && !aScore(m) && !m.exempt);
    const opt = (l, v, f) => l.map(x => `<option value="${x}" ${+v === x ? "selected" : ""}>${f(x)}</option>`).join("");
    return `<section class="trn-h-carte" data-trn-t="${H(t.id)}">
      <h3>⏱️ Horaires des matchs</h3>
      <p>${t.horaire ? `Premier match à <b>${hTxt(h.debut)}</b>, ${h.duree} min par match${h.pause ? `, ${h.pause} min entre deux` : ""}, ${h.terrains} terrain${h.terrains > 1 ? "s" : ""}. Les matchs alternent poule A, poule B… et chaque équipe souffle entre deux matchs : les horaires sont sur la page des spectateurs.`
        : "Donne l'heure du premier match et le temps d'un match : les horaires se calculent tout seuls, en alternant poule A, poule B… La phase finale suit."}</p>
      <div class="trn-h-champs">
        <label>Premier match<input type="time" data-trn-h="debut" value="${H(h.debut || "10:00")}"></label>
        <label>Durée d'un match<select data-trn-h="duree">${opt([5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45], h.duree || 10, x => x + " min")}</select></label>
        <label>Pause entre deux<select data-trn-h="pause">${opt([0, 1, 2, 3, 4, 5, 8, 10, 15], h.pause ?? 2, x => x ? x + " min" : "aucune")}</select></label>
        <label>Terrains<select data-trn-h="terrains">${opt([1, 2, 3, 4, 5, 6], h.terrains || 1, x => x)}</select></label>
      </div>
      <div class="trn-qr-btns"><button type="button" class="btn ${t.horaire ? "contour" : "bleu"}" data-trn-a="horaires">${t.horaire ? "Recalculer les horaires" : "Calculer les horaires"}</button>
        ${t.horaire && reste ? `<button type="button" class="btn contour" data-trn-a="retard" data-min="5">⏳ Retard : +5 min</button><button type="button" class="btn contour" data-trn-a="retard" data-min="-5">−5 min</button>` : ""}</div>
      ${t.horaire && ms.filter(m => m.phase === "poule").some(aScore) ? `<p class="trn-h-note">Les matchs déjà joués gardent leur heure ; « Recalculer » place les autres à partir de l'heure indiquée.</p>` : ""}
    </section>`;
  }
  const avantPT = window.panTournois;
  if (typeof avantPT === "function" && typeof ONG !== "undefined") window.panTournois = function(){
    const h = avantPT.apply(this, arguments);
    const t = S.ui && !S.ui.tirage && S.ui.tournoi && (S.tournois || []).find(x => x.id === S.ui.tournoi);
    if (!t) return h;
    return ONG.transformer(h, r => {
      const tpl = document.createElement("template"); tpl.innerHTML = carteAdmin(t) + carteHoraires(t);
      const tete = r.querySelector(".ong-tn-tete");
      if (tete) tete.after(tpl.content); else r.prepend(tpl.content);
      const N = t.horaire ? +t.horaire.terrains || 1 : 1;                       // l'heure de chaque match, sur sa ligne
      r.querySelectorAll("#t-edit [data-m]").forEach(d => { const m = matchsDe(t).find(x => x.id === d.dataset.m); if (!m || !m.heure) return;
        d.insertAdjacentHTML("afterbegin", `<p class="trn-h-badge">🕒 ${hTxt(m.heure)}${N > 1 && m.terrain ? ` · Terrain ${m.terrain}` : ""}</p>`); });
    });
  };

  /* ---------- actions ---------- */
  document.addEventListener("click", ev => {
    const el = ev.target.closest ? ev.target : null; if (!el) return;
    const o = el.closest("#trn [data-trno]");
    if (o){ ST.onglet = o.dataset.trno; rendrePage(true); return; }
    const q = el.closest("#trn [data-trn-eq]");
    if (q){
      const t = (S.tournois || []).find(x => x.id === idDuHash()); if (!t) return;
      retenirEquipe(t, q.dataset.trnEq); ST.onglet = q.dataset.trnEq === "-" ? "matchs" : "equipe"; rendrePage(true);
      const n = document.querySelector("#trn .eqp-onglets"); if (n) n.scrollIntoView({ block: "start", behavior: "smooth" });
      return;
    }
    if (el.closest("#trn [data-trn-changer]")){
      const t = (S.tournois || []).find(x => x.id === idDuHash()); if (!t) return;
      retenirEquipe(t, ""); ST.onglet = "equipe"; rendrePage(true); return;
    }
    const tid = () => { const c = el.closest("[data-trn-t]"); return c ? c.dataset.trnT : (S.ui && S.ui.tournoi) || idDuHash(); };
    const tDe = id => (S.tournois || []).find(x => x.id === id);
    if (el.closest("[data-trn-partager]")){ const t = tDe(idDuHash()); if (t) ouvrirPartage(t); return; }
    if (el.matches(".trn-qr-fond")){ try { fermerModale(); } catch(e){} return; }
    const a = el.closest("[data-trn-a]"); if (!a) return;
    const t = tDe(tid()); if (!t) return;
    ev.preventDefault();
    const k = a.dataset.trnA;
    if (k === "copier") copier(lienDe(t));
    if (k === "partager" && navigator.share) navigator.share({ title: t.nom || "Tournoi", text: `${t.nom || "Tournoi"} : les scores en direct`, url: lienDe(t) }).catch(() => {});
    if (k === "qr-png") imageQR(t);
    if (k === "affiche"){ a.disabled = true; affiche(t).finally(() => { a.disabled = false; }); }
    if ((k === "horaires" || k === "retard") && typeof ecrire === "function"){
      const t2 = JSON.parse(JSON.stringify(t));
      if (k === "horaires"){
        const c = a.closest(".trn-h-carte"), v = n => ((c && c.querySelector(`[data-trn-h="${n}"]`)) || {}).value;
        programmer(t2, { debut: v("debut"), duree: v("duree"), pause: v("pause"), terrains: v("terrains") });
        if (!t2.horaire){ dire("Choisis l'heure du premier match.", true); return; }
      } else {
        const d = +a.dataset.min || 5;
        matchsDe(t2).forEach(m => { if (m.heure && !aScore(m) && !m.exempt){ const n = minutesDe(m.heure); if (n !== null) m.heure = hhmm(Math.max(0, n + d)); } });
      }
      a.disabled = true;
      ecrire(() => S.db.doc("tournois/" + t.id).update({ matchs: t2.matchs, horaire: t2.horaire || null }),
        k === "horaires" ? "Horaires calculés : ils sont sur la page des spectateurs." : `Matchs restants décalés de ${+a.dataset.min > 0 ? "+" : ""}${+a.dataset.min} min.`)
        .then(() => { a.disabled = false; try { rendrePanneau(); } catch(e){} });
    }
  });

  /* ---------- redessiner : à chaque arrivée de données, et en ouvrant la page d'un tournoi ---------- */
  const avantRT = window.rendreTournois;
  window.rendreTournois = function(){
    try { return avantRT.apply(this, arguments); }
    finally { try { rendreListe(); if (/^#tournoi\//.test(location.hash)) rendrePage(); } catch(err){ console.warn("tournois", err); } }
  };
  window.addEventListener("hashchange", () => { if (/^#tournoi\//.test(location.hash)) rendrePage(true); else if (location.hash === "#tournois") rendreListe(); });
  rendreListe();
  if (/^#tournoi\//.test(location.hash)) rendrePage(true);
})();
</script>
