/* Foot animation : les plateaux et brassages publiés par le district, récupérés sur le site de la FFF (epreuves.fff.fr).
   La FFF refuse les robots (le serveur du club ne peut pas les lire seul) : c'est le navigateur du dirigeant qui les lit,
   avec le favori « ⚽ Envoyer au site ASF », sur la page Foot animation du club. Le favori ouvre le site du club et lui
   envoie les plateaux ; ce module les reçoit (seulement depuis epreuves.fff.fr) et les range proprement :
   - une fiche par plateau et par équipe, dans la bonne équipe de l'onglet (les mêmes noms que CATS_AN), avec la date, l'heure,
     le club qui reçoit, l'adresse du stade (Waze) et les clubs rencontrés : le calendrier, l'onglet, les affiches s'en servent ;
   - une fiche déjà saisie à la main (même équipe, même jour) est reprise, pas doublée ;
   - ce que le coach a changé (heure, adresse, clubs, scores, poules) n'est jamais écrasé : seul ce qui vient encore de la FFF
     est mis à jour ;
   - un plateau annulé ou retiré par le district disparaît (sauf s'il a déjà des scores) ; rien n'est retiré pour un mois que
     la FFF n'a pas renvoyé ;
   - une épreuve que le site ne sait pas ranger est signalée : le bureau choisit l'équipe une fois (site/fal-equipes).
   Fiches : matchs/pl-fff-<épreuve>-<journée>-<site>-<équipe>, avec fal (repères FFF) et fffDernier (ce que la FFF a donné).
   L'ancien favori ne marchait pas (personne ne recevait ses plateaux, et son bouton n'était plus affiché).
   Ajouté sans modifier le script de l'application. */
(function(){
  "use strict";
  if (typeof S === "undefined" || typeof window.panAnimation !== "function" || typeof CATS_AN === "undefined" || typeof ONG === "undefined") return;
  const e = ONG.e;
  const FFF = "https://epreuves.fff.fr", CLUB = "2177", CDG = 125, SITE = "https://asf-pierrelatte.fr";
  const PAGE_CLUB = `${FFF}/animation-loisir/cdg/${CDG}/club/${CLUB}`;
  const STADE = typeof ADRESSE_CLUB === "string" ? ADRESSE_CLUB : "Stade Gustave Jaume, avenue Pierre de Coubertin, 26700 Pierrelatte";
  const CATS = CATS_AN.map(c => c[0]);
  const typeDe = lab => (CATS_AN.find(c => c[0] === lab) || [])[1] || "Plateau";
  const propre = (s, n) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, n || 160);
  const maj = s => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  const slugId = s => maj(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
  const auj = () => (typeof aujourdhui === "function" ? aujourdhui() : new Date().toISOString().slice(0, 10));
  const niv = () => { try { return typeof niveau === "function" ? niveau() : null; } catch(err){ return null; } };
  const peutEcrire = () => ["bureau", "entraineur"].includes(niv());
  const bureau = () => niv() === "bureau";
  const lire = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch(err){ return null; } };
  const garder = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch(err){} };

  /* ---------- le favori (il s'exécute sur epreuves.fff.fr, dans le navigateur du dirigeant) ---------- */
  const CODE_FAVORI = `(async()=>{
const CL="${CLUB}",CG=${CDG},SITE="${SITE}",PAGE="${PAGE_CLUB}";
if(!/(^|\\.)epreuves\\.fff\\.fr$/.test(location.hostname)){if(confirm("Ce favori s'utilise sur la page Foot animation du club, sur le site de la FFF. L'ouvrir maintenant ?"))location.href=PAGE;return;}
const w=window.open(SITE+"/?fal=1#espace","asffal");
if(!w){alert("Ton navigateur a bloqué l'ouverture du site du club : autorise les fenêtres pour epreuves.fff.fr, puis reclique sur le favori.");return;}
const rap=[],T=x=>String(x==null?"":x);let jeton="";
const lire=async u=>{const h={Accept:"application/ld+json, application/json"};if(jeton)h["X-Competition"]=jeton;const r=await fetch(u,{headers:h,credentials:"include"});rap.push(r.status+" "+u.replace(/^.*\\/api\\/fal\\//,""));if(!r.ok)throw new Error("réponse "+r.status);return r.json();};
const B="/api/fal/cdg/"+CG+"/club/"+CL,n=new Date(),a=n.getMonth()>=6?n.getFullYear():n.getFullYear()-1,mois=[],dep=new Date(n.getFullYear(),n.getMonth()-1,1);
for(let i=0;i<11;i++){const d=new Date(a,7+i,1);if(d>=dep)mois.push(d.getFullYear()+String(d.getMonth()+1).padStart(2,"0"));}
const collecter=async()=>{const c=await lire(B+"/epreuves"),eps=(c.epreuves||c["hydra:member"]||[]).map(x=>({epNo:T(x.epNo),epNom:T(x.epNom),caCod:T(x.caCod)})),sites=[],etat={};
for(const ep of eps)for(const m of mois){try{const r=await lire(B+"/epreuve/"+ep.epNo+"/sites?mois="+m);
for(const s of((r.epreuve||{}).sites||r.sites||[])){const eq=s.equipes||[],nos=eq.filter(x=>x.club&&T(x.club.clNo)===CL),o=s.organisateur||{},t=s.terrain||{};if(!nos.length&&T(o.clNo)!==CL)continue;
sites.push({epNo:ep.epNo,epNom:ep.epNom,caCod:ep.caCod,joNo:T(s.joNo),siNo:T(s.siNo),lib:[s.phLib,s.seLib,s.poLib].filter(Boolean).join(" "),date:T(s.date||s.joDate),heure:s.heureCommuniquee!==false,annule:!!s.isCancelled,
org:{no:T(o.clNo),nom:T(o.clNom),logo:T(o.logo)},terrain:{nom:T(t.nom),adresse:[].concat(t.adresse||[]).filter(Boolean).join(", ")},nos:nos.map(x=>({eq:T(x.eqCod),nom:T(x.eqNom)})),
autres:eq.filter(x=>!(x.club&&T(x.club.clNo)===CL)).map(x=>({nom:T(x.club?x.club.clNom:x.eqNom),logo:T(x.club?x.club.logo:"")}))});}
etat[ep.epNo+":"+m]="ok";}catch(x){etat[ep.epNo+":"+m]="erreur";}}
return{eps,sites,etat};};
let res;try{res=await collecter();}catch(x){alert("La FFF n'a pas répondu ("+x.message+"). Recharge la page de la FFF, puis reclique sur le favori.");return;}
if(!res.sites.length&&res.eps.length){try{const s=document.getElementById("ng-state")||document.querySelector('script[type="application/json"]'),m=s&&s.textContent.match(/"token"\\s*:\\s*"([^"]{10,})"/);if(m){jeton=m[1];res=await collecter();}}catch(x){}}
const msg={type:"asf-fal",v:2,eps:res.eps,sites:res.sites,etat:res.etat,lu:new Date().toISOString()};
let recu=false;if(window.__asfFal)removeEventListener("message",window.__asfFal);window.__asfFal=ev=>{if(ev.origin!==SITE||!ev.data)return;if(ev.data.type==="asf-fal-recu")recu=true;if(ev.data.type==="asf-fal-fin")alert(ev.data.texte);};addEventListener("message",window.__asfFal);
for(let i=0;i<120&&!recu;i++){try{w.postMessage(msg,SITE);}catch(x){}await new Promise(r=>setTimeout(r,500));}
if(!recu){alert(res.sites.length+" plateau(x) trouvé(s), mais le site du club ne répond pas : ouvre asf-pierrelatte.fr, puis reclique sur le favori.");return;}
if(!res.sites.length&&confirm("Aucun plateau du club trouvé sur la FFF. Copier le rapport pour la personne qui s'occupe du site ?")){const t=rap.join("\\n");try{await navigator.clipboard.writeText(t);alert("Rapport copié.");}catch(x){prompt("Rapport à copier :",rap.join(" | "));}}
})();`;
  const LIEN_FAVORI = "javascript:" + encodeURIComponent(CODE_FAVORI.replace(/\n/g, ""));

  /* ---------- l'équipe de l'onglet pour un plateau de la FFF ---------- */
  const table = () => (S.falEquipes && typeof S.falEquipes === "object" ? S.falEquipes : {});
  function etiquette(s, eq){
    const t = table(), k1 = `${s.epNo}:${eq || ""}`, k0 = String(s.epNo);
    if (Object.prototype.hasOwnProperty.call(t, k1)) return CATS.includes(t[k1]) ? t[k1] : null;   // "" : ne pas importer
    if (Object.prototype.hasOwnProperty.call(t, k0)) return CATS.includes(t[k0]) ? t[k0] : null;
    const texte = maj([s.epNom, s.caCod, s.lib, (s.nos.find(x => x.eq === eq) || {}).nom].join(" "));
    const c = maj(s.caCod).match(/\d{1,2}/), u = texte.match(/U\s?(\d{1,2})/), age = c ? +c[0] : u ? +u[1] : 0;
    let lab = null;
    if (age === 13) lab = eq ? `U13 · ÉQUIPE ${+eq || eq}` : null;
    else if (age === 6 || age === 7) lab = "U6 · U7";
    else if (age === 8 || age === 9) lab = /PROMOTION/.test(texte) ? "U8 · U9 Promotion" : /ESPOIR/.test(texte) ? "U8 · U9 Espoir" : /BOURGEON/.test(texte) ? "U8 · U9 Bourgeon" : "U8 · U9";
    else if (age === 10 || age === 11) lab = /AVENIR/.test(texte) ? "U10 · U11 Avenir" : /ESPOIR/.test(texte) ? "U10 · U11 Espoir" : /BOURGEON/.test(texte) ? "U10 · U11 Bourgeons" : null;
    return lab && CATS.includes(lab) ? lab : null;
  }

  /* ---------- date et heure de Paris ---------- */
  function quand(s, brassage){
    const brut = String(s.date || ""), m = brut.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return null;
    let date = m[1], heure = "";
    if (m[2] && s.heure !== false){
      const d = new Date(brut);
      if (!isNaN(d) && /[zZ]|[+-]\d{2}:?\d{2}$/.test(brut)){
        const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
          .formatToParts(d).map(x => [x.type, x.value]));
        date = `${p.year}-${p.month}-${p.day}`; heure = `${p.hour}:${p.minute}`;
      } else heure = `${m[2]}:${m[3]}`;
      if (heure === "00:00") heure = "";
    }
    return { date, heure: heure || (brassage ? "14:00" : "10:00") };
  }

  /* ---------- ce que la FFF donne pour une fiche ---------- */
  function depuisFff(s, lab){
    const comp = typeDe(lab), q = quand(s, comp === "Brassage"); if (!q) return null;
    const dom = s.org.no === CLUB;
    const adversaires = [...new Set(s.autres.map(x => propre(x.nom, 80)).filter(Boolean))].slice(0, 12);
    return { date: q.date, heure: q.heure, dom, adv: dom ? "" : propre(s.org.nom, 80),
      adresse: dom ? STADE : [propre(s.terrain.nom, 80), propre(s.terrain.adresse, 160)].filter(Boolean).join(", "), adversaires };
  }
  const scores = m => (Array.isArray(m.resultats) && m.resultats.length > 0)
    || (Array.isArray(m.rencontres) && m.rencontres.some(r => r && ((r.bp !== null && r.bp !== "" && r.bp !== undefined) || (r.bc !== null && r.bc !== "" && r.bc !== undefined))))
    || (Array.isArray(m.poules) && m.poules.some(q => q && Array.isArray(q.matchs) && q.matchs.some(p => p && p.sa !== null && p.sa !== "" && p.sa !== undefined)));
  const egal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const rencontresDe = (adv, avant) => adv.map(a => { const r = (avant || []).find(x => x && x.adv === a); return r ? { heure: r.heure || "", adv: a, bp: r.bp ?? null, bc: r.bc ?? null } : { heure: "", adv: a, bp: null, bc: null }; });

  /* ---------- l'import ---------- */
  let enCours = false;
  async function importer(p){
    if (enCours) return null;
    enCours = true;
    const bilan = { lu: p.lu || new Date().toISOString(), crees: 0, maj: 0, reprises: 0, retires: 0, gardes: 0, erreurs: 0, nonRanges: [], total: 0 };
    try {
      // la base relue juste avant (un coach a pu changer une fiche il y a quelques secondes, ailleurs)
      const fiches = new Map();
      try {
        const r = await fetch((window.ASFP_API || "/api") + "/db", { headers: { Accept: "application/json" }, cache: "no-store", credentials: "same-origin" });
        const d = r.ok ? await r.json() : null;
        if (!d || typeof d !== "object") throw new Error("base illisible");
        Object.entries(d).forEach(([k, v]) => { if (k.startsWith("matchs/pl-") && v && typeof v === "object") fiches.set(k.slice(7), { ...v, id: k.slice(7) }); });
      } catch(err){ (S.matchsAnimation || []).filter(m => String(m.id).startsWith("pl-")).forEach(m => fiches.set(m.id, m)); }
      const tous = () => [...fiches.values()];
      const ecrire = async (id, doc) => { try { await S.db.doc("matchs/" + id).set(doc); fiches.set(id, { ...doc, id }); return true; } catch(err){ bilan.erreurs++; return false; } };
      const effacer = async id => { try { await S.db.doc("matchs/" + id).delete(); fiches.delete(id); bilan.retires++; } catch(err){ bilan.erreurs++; } };
      const vus = new Set(), parEp = {};
      for (const s of p.sites){
        parEp[s.epNo] = (parEp[s.epNo] || 0) + 1;
        const cle = `${s.epNo}-${s.joNo || 0}-${s.siNo}`;
        const groupes = new Map();                                       // équipe de l'onglet → nos équipes FFF
        (s.nos.length ? s.nos : [{ eq: "", nom: "" }]).forEach(x => {
          const lab = etiquette(s, x.eq);
          if (!lab){ if (!bilan.nonRanges.some(n => n.epNo === s.epNo && n.eq === x.eq)) bilan.nonRanges.push({ epNo: s.epNo, eq: x.eq, ep: s.epNom, cat: s.caCod, lib: s.lib, nom: x.nom }); return; }
          groupes.set(lab, [...(groupes.get(lab) || []), x.eq]);
        });
        for (const [lab, eqs] of groupes){
          const id = `pl-fff-${slugId(s.epNo)}-${slugId(s.joNo || "0")}-${slugId(s.siNo)}-${slugId(lab)}`.slice(0, 120);
          vus.add(cle + "|" + lab);
          bilan.total++;
          const fff = depuisFff(s, lab); if (!fff) continue;
          let doc = tous().find(m => m.fal && m.fal.cle === cle && m.equipe === lab) || tous().find(m => m.id === id);
          let idDoc = doc ? doc.id : id;
          if (!doc && !s.annule){                                        // déjà saisi à la main ? on le reprend
            const c = tous().filter(m => String(m.id).startsWith("pl-") && !m.fal && m.equipe === lab && m.date === fff.date);
            if (c.length === 1){ doc = c[0]; idDoc = doc.id; bilan.reprises++; }
          }
          const fal = { cle, epNo: s.epNo, joNo: s.joNo, siNo: s.siNo, ep: propre(s.epNom, 120), cat: propre(s.caCod, 20), eq: eqs.filter(Boolean), org: s.org.no };
          if (s.annule){
            if (doc && doc.fal){ if (scores(doc)) bilan.gardes++; else await effacer(doc.id); }
            continue;
          }
          if (!doc){
            const comp = typeDe(lab);
            if (await ecrire(id, { equipe: lab, comp, format: comp === "Brassage" ? "brassage" : "plateau", date: fff.date, heure: fff.heure, dom: fff.dom, adv: fff.adv,
              adresse: fff.adresse, adversaires: fff.adversaires, rencontres: rencontresDe(fff.adversaires, []), resultats: [], poules: [], bp: null, bc: null,
              source: "fff", fal, fffDernier: fff })) bilan.crees++;
            continue;
          }
          // mise à jour : seulement ce que le coach n'a pas changé depuis le dernier import (ou ce qui est vide)
          const avant = doc.fffDernier || null, x = { ...doc };
          delete x.id; delete x._maj;
          ["date", "heure", "dom", "adv", "adresse"].forEach(k => {
            const libre = avant ? egal(doc[k], avant[k]) : (doc[k] === undefined || doc[k] === null || doc[k] === "");
            if (libre) x[k] = fff[k];
          });
          const advAvant = Array.isArray(doc.adversaires) ? doc.adversaires : [];
          if (doc.format !== "poules" && (avant ? egal(advAvant, avant.adversaires) : !advAvant.length)){
            x.adversaires = fff.adversaires; x.rencontres = rencontresDe(fff.adversaires, doc.rencontres);
          }
          if (!x.dom && x.adresse && /\bgustave\s+jaume\b/i.test(x.adresse)) x.adresse = fff.adresse;   // jamais notre stade pour un plateau à l'extérieur
          x.fal = fal; x.fffDernier = fff; x.source = x.source || "fff";
          const ancien = { ...doc }; delete ancien.id; delete ancien._maj;
          if (!egal(x, ancien) && await ecrire(idDoc, x)) bilan.maj++;
        }
      }
      // retirés par le district : seulement les mois que la FFF a bien renvoyés, pour une épreuve qui a encore des plateaux, à venir, sans score
      const aujD = auj();
      for (const m of tous().filter(m => m.fal && m.fal.cle)){
        if (vus.has(m.fal.cle + "|" + m.equipe)) continue;
        const mois = String(m.date || "").slice(0, 7).replace("-", "");
        if (!parEp[m.fal.epNo] || p.etat[`${m.fal.epNo}:${mois}`] !== "ok" || (m.date || "") < aujD) continue;
        if (scores(m)){ bilan.gardes++; continue; }
        await effacer(m.id);
      }
    } finally { enCours = false; }
    garder("asfp-fal-bilan", bilan);
    if (bureau()) try { await S.db.doc("site/fal-import").set(bilan); } catch(err){}   // vu aussi sur les autres appareils
    try { rendrePanneau(); } catch(err){}
    return bilan;
  }
  const phrase = b => !b ? "" : `${b.total ? b.total + " plateau(x) et brassage(s) du club" : "Aucun plateau du club"} : ${b.crees} ajouté(s), ${b.maj} mis à jour, ${b.reprises ? b.reprises + " déjà saisi(s) repris, " : ""}${b.retires} retiré(s)`
    + (b.gardes ? `, ${b.gardes} gardé(s) car déjà avec des scores` : "") + (b.nonRanges.length ? `. ${b.nonRanges.length} épreuve(s) à ranger dans l'onglet Foot animation.` : ".")
    + (b.erreurs ? ` (${b.erreurs} enregistrement(s) refusé(s) : reconnecte-toi et recommence.)` : "");

  /* ---------- réception : seulement depuis epreuves.fff.fr ; gardée jusqu'à la connexion ---------- */
  const valide = d => d && d.type === "asf-fal" && Array.isArray(d.sites) && d.sites.length <= 2000 && Array.isArray(d.eps) && d.eps.length <= 200 && d.etat && typeof d.etat === "object";
  const nettoyer = d => ({ lu: propre(d.lu, 40), eps: d.eps.map(x => ({ epNo: propre(x.epNo, 20), epNom: propre(x.epNom, 120), caCod: propre(x.caCod, 20) })),
    etat: Object.fromEntries(Object.entries(d.etat).slice(0, 3000).map(([k, v]) => [propre(k, 40), v === "ok" ? "ok" : "erreur"])),
    sites: d.sites.filter(s => s && s.epNo && s.siNo).map(s => ({ epNo: propre(s.epNo, 20), epNom: propre(s.epNom, 120), caCod: propre(s.caCod, 20), joNo: propre(s.joNo, 20), siNo: propre(s.siNo, 20),
      lib: propre(s.lib, 160), date: propre(s.date, 40), heure: s.heure !== false, annule: !!s.annule,
      org: { no: propre(s.org && s.org.no, 20), nom: propre(s.org && s.org.nom, 80), logo: propre(s.org && s.org.logo, 300) },
      terrain: { nom: propre(s.terrain && s.terrain.nom, 80), adresse: propre(s.terrain && s.terrain.adresse, 160) },
      nos: (Array.isArray(s.nos) ? s.nos : []).slice(0, 10).map(x => ({ eq: propre(x && x.eq, 10), nom: propre(x && x.nom, 80) })),
      autres: (Array.isArray(s.autres) ? s.autres : []).slice(0, 30).map(x => ({ nom: propre(x && x.nom, 80), logo: propre(x && x.logo, 300) })) })) });
  let source = null, dernierLu = "";
  const repondre = texte => { try { if (source) source.postMessage({ type: "asf-fal-fin", texte }, FFF); } catch(err){} };
  window.addEventListener("message", ev => {
    if (ev.origin !== FFF || !valide(ev.data)) return;
    source = ev.source;
    try { ev.source.postMessage({ type: "asf-fal-recu" }, FFF); } catch(err){}
    if (ev.data.lu && ev.data.lu === dernierLu) return;                  // le même envoi, répété par le favori
    dernierLu = ev.data.lu || "";
    const p = nettoyer(ev.data);
    garder("asfp-fal-attente", p); garder("asfp-fal-dernier", p);
    attendreEtImporter();
  });
  let attente = null;
  function attendreEtImporter(){
    if (attente) return;
    const debut = Date.now();
    attente = setInterval(async () => {
      const p = lire("asfp-fal-attente");
      if (!p){ clearInterval(attente); attente = null; return; }
      if (!S.db || !S.pret || !peutEcrire()){
        if (Date.now() - debut > 15 * 60000){ clearInterval(attente); attente = null; }
        return;
      }
      clearInterval(attente); attente = null;
      try { localStorage.removeItem("asfp-fal-attente"); } catch(err){}
      const b = await importer(p);
      const t = b ? phrase(b) : "Import déjà en cours.";
      if (typeof toast === "function") toast(t);
      repondre(t);
    }, 1000);
  }
  if (lire("asfp-fal-attente")) attendreEtImporter();                       // reçu avant la connexion : on reprend

  /* ---------- table des équipes (bureau) ---------- */
  (function suivre(){
    if (!S.db){ setTimeout(suivre, 500); return; }
    try { S.db.doc("site/fal-equipes").onSnapshot(d => { S.falEquipes = d.exists ? d.data() : {}; }); } catch(err){}
    try { S.db.doc("site/fal-import").onSnapshot(d => { S.falBilan = d.exists ? d.data() : null; }); } catch(err){}
  })();
  document.addEventListener("click", async ev => {
    const b = ev.target.closest && ev.target.closest("[data-fal-a]"); if (!b) return;
    ev.preventDefault();
    const a = b.dataset.falA;
    if (a === "copier"){
      try { await navigator.clipboard.writeText(LIEN_FAVORI); toast("Code du favori copié : colle-le comme adresse d'un nouveau favori."); }
      catch(err){ window.prompt("Copie ce code, puis colle-le comme adresse d'un nouveau favori :", LIEN_FAVORI); }
      return;
    }
    if (a === "ranger"){
      if (!bureau()){ toast("Seul le bureau peut choisir l'équipe d'une épreuve.", true); return; }
      const t = { ...table() };
      document.querySelectorAll("[data-fal-cle]").forEach(s => { if (s.value !== "?") t[s.dataset.falCle] = s.value === "-" ? "" : s.value; });
      b.disabled = true;
      const ok = typeof ecrire === "function" ? await ecrire(() => S.db.doc("site/fal-equipes").set(t), "Équipes enregistrées.") : false;
      b.disabled = false;
      if (!ok) return;
      S.falEquipes = t;
      const p = lire("asfp-fal-dernier");
      if (p){ const r = await importer(p); if (r) toast(phrase(r)); }
      return;
    }
    if (a === "reimporter"){
      const p = lire("asfp-fal-dernier"); if (!p){ toast("Aucun envoi de la FFF reçu sur cet appareil : utilise le favori.", true); return; }
      if (!peutEcrire()){ toast("Connecte-toi avec un compte coach ou bureau.", true); return; }
      const r = await importer(p); if (r) toast(phrase(r));
    }
  });

  /* ---------- la carte dans l'onglet Foot animation ---------- */
  function carte(){
    const loc = lire("asfp-fal-bilan"), part = S.falBilan && S.falBilan.lu ? S.falBilan : null;
    const b = loc && (!part || String(loc.lu) >= String(part.lu)) ? loc : part, dernier = lire("asfp-fal-dernier");
    const quandTxt = b && b.lu ? (() => { const d = new Date(b.lu); return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); })() : "";
    const nr = b && Array.isArray(b.nonRanges) ? b.nonRanges : [];
    const opts = sel => `<option value="?">Choisir l'équipe…</option>${CATS.map(c => `<option value="${e(c)}" ${sel === c ? "selected" : ""}>${e(c)}</option>`).join("")}<option value="-">Ne pas importer</option>`;
    const ranger = nr.length ? `<div class="fal-ranger"><b>À ranger (${nr.length})</b><p>Le site ne sait pas dans quelle équipe mettre ${nr.length > 1 ? "ces épreuves" : "cette épreuve"} :</p>
        ${nr.map(n => `<label class="fal-ligne"><span>${e(n.ep || "Épreuve " + n.epNo)}${n.lib ? " · " + e(n.lib) : ""}${n.eq ? ` · équipe ${e(n.eq)}` : ""}</span>
          <select data-fal-cle="${e(n.epNo + ":" + (n.eq || ""))}" ${bureau() ? "" : "disabled"}>${opts("")}</select></label>`).join("")}
        ${bureau() ? `<button type="button" class="btn bleu petit" data-fal-a="ranger">Enregistrer et ranger les plateaux</button>` : `<p class="fal-mini">Le bureau choisit l'équipe une fois.</p>`}</div>` : "";
    const corps = `
      <p class="fal-etat">${b ? `Dernier envoi de la FFF : <b>${e(quandTxt)}</b>. ${e(phrase(b))}` : "Aucun envoi de la FFF pour l'instant."}</p>
      ${ranger}
      <ol class="fal-etapes">
        <li><b>Une seule fois : ajoute le favori.</b> Sur ordinateur, fais glisser ce bouton dans la barre de favoris
          (Ctrl + Maj + B pour l'afficher) : <a class="btn bleu petit fal-favori" href="${e(LIEN_FAVORI)}" title="Fais glisser ce bouton dans ta barre de favoris">⚽ Envoyer au site ASF</a>
          <br><span class="fal-mini">Sur téléphone : <button type="button" class="fal-lien" data-fal-a="copier">copie le code du favori</button>, ajoute un favori à n'importe quelle page,
          puis modifie-le : nom « Envoyer au site ASF », adresse = colle le code.</span></li>
        <li><b>Quand le district publie des dates :</b> ouvre <a href="${e(PAGE_CLUB)}" target="_blank" rel="noopener">la page Foot animation du club sur la FFF</a>,
          puis touche le favori (sur téléphone : tape « Envoyer » dans la barre d'adresse et choisis le favori).</li>
        <li>Le site du club s'ouvre et range tout seul les plateaux et brassages : la bonne équipe, l'heure, le stade (pour Waze), les clubs rencontrés.
          Ce que les coachs ont saisi (heures, scores, poules) est gardé ; un plateau annulé est retiré.</li>
      </ol>
      ${dernier && peutEcrire() ? `<button type="button" class="btn contour petit" data-fal-a="reimporter">Ranger à nouveau le dernier envoi</button>` : ""}`;
    return ONG.pli("anim-fff", `<b>📥 Plateaux de la FFF</b><small>${b ? "Dernier envoi : " + e(quandTxt) : "Le district publie les dates : un clic les fait venir ici"}</small>`, corps, !b || nr.length > 0, "⚽")
      .replace('class="pli ong-pli"', 'class="pli ong-pli fal-carte"');
  }
  const avant = window.panAnimation;
  window.panAnimation = function(){
    const h = avant.apply(this, arguments);
    if (!S.heberge) return h;
    return ONG.transformer(h, r => {
      const t = document.createElement("template"); t.innerHTML = carte();
      const choix = r.querySelector(".ong-anim-choix");
      if (choix) choix.before(t.content); else r.prepend(t.content);
    });
  };
  // ouvert par le favori (?fal=1) : on le dit tout de suite
  try {
    if (new URLSearchParams(location.search).get("fal") === "1") setTimeout(() => {
      if (typeof toast === "function") toast(peutEcrire() ? "Réception des plateaux de la FFF…" : "Plateaux de la FFF reçus : connecte-toi (coach ou bureau) pour les ranger.");
    }, 1500);
  } catch(err){}

  const css = document.createElement("style");
  css.id = "fal-import-css";
  css.textContent = `
.fal-carte{margin-bottom:16px}
.fal-carte .fal-etat{margin:0 0 10px;font-size:14.5px;line-height:1.45}
.fal-carte .fal-etapes{display:grid;gap:12px;padding-left:20px;margin:10px 0;font-size:14.5px;line-height:1.5}
.fal-carte .fal-favori{display:inline-block;margin:6px 0 2px;cursor:grab}
.fal-carte .fal-mini{font-size:13px;color:var(--texte-doux)}
.fal-carte .fal-lien{background:none;border:0;padding:0;font:inherit;font-weight:700;color:#9FC0FF;text-decoration:underline;cursor:pointer}
.fal-carte .fal-ranger{border:1px solid rgba(234,179,8,.5);background:rgba(234,179,8,.08);border-radius:12px;padding:12px;margin:8px 0 12px;display:grid;gap:8px}
.fal-carte .fal-ranger p{margin:0;font-size:14px}
.fal-carte .fal-ligne{display:grid;grid-template-columns:minmax(0,1fr) minmax(160px,auto);gap:8px;align-items:center;font-size:14px}
@media (max-width:600px){.fal-carte .fal-ligne{grid-template-columns:minmax(0,1fr)}}
:root[data-theme="light"] .fal-carte .fal-lien{color:#1C4FD6}`;
  document.head.appendChild(css);
})();
