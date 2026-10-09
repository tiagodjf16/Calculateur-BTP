/* Foot animation : les plateaux et brassages publiés par le district, récupérés sur le site de la FFF (epreuves.fff.fr).
   La FFF refuse les robots (le serveur du club est refusé, réponse 403) : c'est le navigateur du dirigeant qui les lit, avec le
   favori « ⚽ Envoyer au site ASF », sur la page Foot animation du club. Tout se passe dans le même onglet (sur iPhone, un onglet
   caché est mis en pause) : le favori lit la FFF en affichant où il en est, puis ouvre le site du club avec les plateaux dans
   l'adresse (#fal=…). Le site les garde, et un coach ou le bureau confirme d'un bouton « Ranger les plateaux » (une adresse
   fabriquée ailleurs ne peut donc rien écrire toute seule). Le rangement :
   - une fiche par plateau et par équipe de l'onglet (les noms de CATS_AN), avec la date et l'heure de Paris (heure vide si la FFF
     ne l'a pas donnée), le club qui reçoit, l'adresse du stade (Waze), les clubs rencontrés ;
   - une fiche saisie à la main (même équipe, même jour, un seul plateau ce jour-là) est reprise, pas doublée ; une fiche créée
     avec « + Ajouter un rendez-vous » et jamais remplie prend le lieu de la FFF ;
   - ce que le coach a changé n'est jamais écrasé (on compare avec fffDernier, ce que la FFF avait donné) ; le lieu (domicile,
     club, adresse) change d'un bloc quand la FFF change de club ; une fiche avec des scores ou déjà jouée garde ses rencontres ;
   - un plateau annulé ou retiré par le district disparaît (à venir, sans score, mois bien lu, équipe connue) ;
   - un envoi plus ancien que ce qui est en base ne défait rien (fal.lu) ; la base est relue juste avant, sinon rien n'est fait ;
   - l'équipe de chaque épreuve est devinée, et le bureau peut la choisir ou la corriger (site/fal-equipes).
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
  const slugId = s => maj(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "x";
  const auj = () => (typeof aujourdhui === "function" ? aujourdhui() : new Date().toISOString().slice(0, 10));
  const niv = () => { try { return typeof niveau === "function" ? niveau() : null; } catch(err){ return null; } };
  const peutEcrire = () => ["bureau", "entraineur"].includes(niv());
  const bureau = () => niv() === "bureau";
  const lire = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch(err){ return null; } };
  const garder = (k, v) => { try { if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch(err){} };
  const ATTENTE_MAX = 3 * 3600e3;
  const en_ligne = () => !!S.heberge || /^https?:$/.test(location.protocol);   // le site en ligne (pas le fichier ouvert hors ligne)                                         // un envoi reçu attend sa confirmation 3 heures au plus

  /* ---------- le favori (il s'exécute sur epreuves.fff.fr, dans le navigateur du dirigeant, dans l'onglet visible) ---------- */
  const CODE_FAVORI = `(async()=>{
const CL="${CLUB}",CG=${CDG},SITE="${SITE}",PAGE="${PAGE_CLUB}";
if(!/(^|\\.)epreuves\\.fff\\.fr$/.test(location.hostname)){if(confirm("Ce favori s'utilise sur la page Foot animation du club, sur le site de la FFF. L'ouvrir maintenant ?"))location.href=PAGE;return;}
const T=x=>String(x==null?"":x),rap=[],cles=[];let jeton="";
const box=document.createElement("div");box.style.cssText="position:fixed;z-index:2147483647;left:12px;right:12px;bottom:12px;padding:14px 16px;border-radius:14px;background:#0F2257;color:#fff;font:600 16px/1.4 system-ui,-apple-system,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,.45)";document.body.appendChild(box);
const dire=t=>{box.textContent="⚽ ASF Pierrelatte · "+t;};dire("lecture des plateaux sur la FFF…");
const lire=async u=>{const h={Accept:"application/ld+json, application/json"};if(jeton)h["X-Competition"]=jeton;const r=await fetch(u,{headers:h,credentials:"include"});rap.push(r.status+" "+u.replace(/^.*\\/api\\/fal\\//,""));if(!r.ok)throw new Error("réponse "+r.status);const j=await r.json();if(cles.length<8)cles.push(u.replace(/^.*\\/api\\/fal\\//,"")+" : "+Object.keys(j||{}).slice(0,15).join(","));return j;};
const B="/api/fal/cdg/"+CG+"/club/"+CL,n=new Date(),a=n.getMonth()>=6?n.getFullYear():n.getFullYear()-1,dep=new Date(n.getFullYear(),n.getMonth()-1,1),mois=[];
for(let i=0;i<11;i++){const d=new Date(a,7+i,1);if(d>=dep)mois.push(d.getFullYear()+String(d.getMonth()+1).padStart(2,"0"));}
const collecter=async()=>{const c=await lire(B+"/epreuves"),eps=(c.epreuves||c["hydra:member"]||[]).map(x=>({epNo:T(x.epNo),epNom:T(x.epNom),caCod:T(x.caCod)})),sites=[],etat={};let k=0;
for(const ep of eps)for(const m of mois){dire("lecture des plateaux sur la FFF… "+Math.round(100*(k++)/Math.max(1,eps.length*mois.length))+" %");try{const r=await lire(B+"/epreuve/"+ep.epNo+"/sites?mois="+m),l=(r.epreuve||{}).sites||r.sites||[];
if(l[0]&&cles.length<10)cles.push("site : "+Object.keys(l[0]).join(",")+" | équipe : "+Object.keys((l[0].equipes||[])[0]||{}).join(","));
for(const s of l){const eq=s.equipes||[],nos=eq.filter(x=>x.club&&T(x.club.clNo)===CL),o=s.organisateur||{},t=s.terrain||{};if(!nos.length&&T(o.clNo)!==CL)continue;
sites.push({epNo:ep.epNo,epNom:ep.epNom,caCod:ep.caCod,joNo:T(s.joNo),siNo:T(s.siNo),lib:[s.phLib,s.seLib,s.poLib].filter(Boolean).join(" "),date:T(s.date||s.joDate),heure:s.heureCommuniquee!==false,annule:!!s.isCancelled,
org:{no:T(o.clNo),nom:T(o.clNom)},terrain:{nom:T(t.nom),adresse:[].concat(t.adresse||[]).filter(Boolean).join(", ")},nos:nos.map(x=>({eq:T(x.eqCod),nom:T(x.eqNom)})),
autres:eq.filter(x=>!(x.club&&T(x.club.clNo)===CL)).map(x=>({nom:T(x.club?x.club.clNom:x.eqNom)}))});}
etat[ep.epNo+":"+m]="ok";}catch(x){etat[ep.epNo+":"+m]="erreur";rap.push("erreur "+x.message);}}
return{eps,sites,etat};};
let res;try{res=await collecter();}catch(x){box.remove();alert("La FFF n'a pas répondu ("+x.message+"). Recharge la page de la FFF, puis touche à nouveau le favori.");return;}
if(!res.sites.length&&res.eps.length){try{const s=document.getElementById("ng-state")||document.querySelector('script[type="application/json"]'),m=s&&s.textContent.match(/"token"\\s*:\\s*"([^"]{10,})"/);if(m){jeton=m[1];res=await collecter();}}catch(x){}}
if(!res.sites.length){dire("aucun plateau du club trouvé.");if(confirm("Aucun plateau du club trouvé sur la FFF. Copier le rapport pour la personne qui s'occupe du site ?")){const t=rap.concat(cles).join("\\n");try{await navigator.clipboard.writeText(t);alert("Rapport copié : colle-le dans un message.");}catch(x){prompt("Rapport à copier :",rap.concat(cles).join(" | "));}}box.remove();return;}
dire(res.sites.length+" plateau(x) trouvé(s) : ouverture du site du club…");
location.href=SITE+"/?fal=1#fal="+encodeURIComponent(JSON.stringify({type:"asf-fal",v:3,eps:res.eps,sites:res.sites,etat:res.etat,lu:new Date().toISOString(),cles}));
})();void 0`;
  const LIEN_FAVORI = "javascript:" + encodeURIComponent(CODE_FAVORI.replace(/\n/g, ""));

  /* ---------- l'équipe de l'onglet pour un plateau de la FFF : null = inconnue, false = « ne pas importer » ---------- */
  function etiquette(s, eq, t){
    const k1 = `${s.epNo}:${eq || ""}`, k0 = String(s.epNo);
    for (const k of [k1, k0]) if (Object.prototype.hasOwnProperty.call(t, k)) return t[k] === "" ? false : (CATS.includes(t[k]) ? t[k] : null);
    return deviner(s, eq);
  }
  function deviner(s, eq){
    const texte = maj([s.epNom, s.caCod, s.lib, (s.nos.find(x => x.eq === eq) || {}).nom].join(" "));
    const c = maj(s.caCod).match(/\d{1,2}/), u = texte.match(/U\s?(\d{1,2})/), age = c ? +c[0] : u ? +u[1] : 0;
    let lab = null;
    if (age === 13) lab = eq ? `U13 · ÉQUIPE ${+eq || eq}` : null;
    else if (age === 6 || age === 7) lab = "U6 · U7";
    else if (age === 8 || age === 9) lab = /PROMOTION/.test(texte) ? "U8 · U9 Promotion" : /ESPOIR/.test(texte) ? "U8 · U9 Espoir" : /BOURGEON/.test(texte) ? "U8 · U9 Bourgeon" : "U8 · U9";
    else if (age === 10 || age === 11) lab = /AVENIR/.test(texte) ? "U10 · U11 Avenir" : /ESPOIR/.test(texte) ? "U10 · U11 Espoir" : /BOURGEON/.test(texte) ? "U10 · U11 Bourgeons" : null;
    return lab && CATS.includes(lab) ? lab : null;
  }

  /* ---------- date et heure de Paris (heure "" si la FFF ne l'a pas donnée) ---------- */
  function quand(s){
    const brut = String(s.date || ""), m = brut.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}):(\d{2}))?/);
    if (!m) return null;
    let date = m[1], heure = m[2] ? `${m[2]}:${m[3]}` : "";
    if (m[2] && /[zZ]|[+-]\d{2}:?\d{2}$/.test(brut)){                    // donnée en UTC (ou avec décalage) : l'heure et le jour de Paris
      const d = new Date(brut);
      if (!isNaN(d)){
        const p = Object.fromEntries(new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
          .formatToParts(d).map(x => [x.type, x.value]));
        date = `${p.year}-${p.month}-${p.day}`; heure = `${p.hour}:${p.minute}`;
      }
    }
    if (s.heure === false || heure === "00:00") heure = "";
    return { date, heure };
  }

  /* ---------- ce que la FFF donne pour une fiche ---------- */
  function depuisFff(s, q){
    const dom = s.org.no === CLUB;
    const adversaires = [...new Set(s.autres.map(x => propre(x.nom, 80)).filter(Boolean))].slice(0, 12);
    return { date: q.date, heure: q.heure, dom, adv: dom ? "" : propre(s.org.nom, 80),
      adresse: dom ? STADE : [propre(s.terrain.nom, 80), propre(s.terrain.adresse, 160)].filter(Boolean).join(", "), adversaires };
  }
  const note = v => v !== null && v !== "" && v !== undefined;
  const scores = m => (Array.isArray(m.resultats) && m.resultats.length > 0)
    || (Array.isArray(m.rencontres) && m.rencontres.some(r => r && (note(r.bp) || note(r.bc))))
    || (Array.isArray(m.poules) && m.poules.some(q => q && Array.isArray(q.matchs) && q.matchs.some(p => p && (note(p.sa) || note(p.sb)))));
  const egal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const rencontresDe = (adv, avant) => adv.map(a => { const r = (avant || []).find(x => x && x.adv === a); return r ? { heure: r.heure || "", adv: a, bp: r.bp ?? null, bc: r.bc ?? null } : { heure: "", adv: a, bp: null, bc: null }; });
  /* une fiche créée avec « + Ajouter un rendez-vous » et jamais remplie (à domicile, notre stade, sans club) */
  const vierge = m => m.dom !== false && (!m.adresse || m.adresse === STADE) && !m.adv && !(Array.isArray(m.adversaires) && m.adversaires.length) && !scores(m);

  /* ---------- l'import ---------- */
  let enCours = false;
  async function importer(p){
    if (enCours) return { occupe: true };
    enCours = true;
    const bilan = { lu: p.lu || "", fait: new Date().toISOString(), crees: 0, maj: 0, reprises: 0, retires: 0, gardes: 0, erreurs: 0, ecartes: 0, total: 0, nonRanges: [], equipes: [] };
    try {
      // la base relue juste avant : sans elle, on ne fait rien (on écraserait des fiches qu'on ne voit pas)
      let d;
      try {
        const r = await fetch((window.ASFP_API || "/api") + "/db", { headers: { Accept: "application/json" }, cache: "no-store", credentials: "same-origin" });
        d = r.ok ? await r.json() : null;
      } catch(err){ d = null; }
      if (!d || typeof d !== "object") return { echec: "La base du site n'a pas pu être lue : rien n'a été changé. Réessaie dans un instant." };
      // un envoi plus récent a déjà été rangé (sur un autre appareil) : celui-ci ramènerait d'anciennes dates
      const range = d["site/fal-import"];
      if (range && range.lu && p.lu && String(range.lu) > String(p.lu))
        return { echec: "Un envoi plus récent de la FFF a déjà été rangé : rien n'a été changé. Relance le favori sur la page de la FFF pour avoir les dernières dates.", perime: true };
      const fiches = new Map();
      Object.entries(d).forEach(([k, v]) => { if (k.startsWith("matchs/pl-") && v && typeof v === "object") fiches.set(k.slice(7), { ...v, id: k.slice(7) }); });
      const tbl = d["site/fal-equipes"] && typeof d["site/fal-equipes"] === "object" ? d["site/fal-equipes"] : {};
      const tous = () => [...fiches.values()];
      const ecrire = async (id, doc) => { try { await S.db.doc("matchs/" + id).set(doc); fiches.set(id, { ...doc, id }); return true; } catch(err){ bilan.erreurs++; return false; } };
      const effacer = async id => { try { await S.db.doc("matchs/" + id).delete(); fiches.delete(id); bilan.retires++; } catch(err){ bilan.erreurs++; } };
      const plusRecent = m => !!(m.fal && m.fal.lu && p.lu && String(m.fal.lu) > String(p.lu));   // déjà rangé par un envoi plus récent

      // 1. chaque plateau : ses équipes de l'onglet
      const items = [], sitesNonRanges = new Set(), parEp = {};
      for (const s of p.sites){
        const q = quand(s);
        if (!q){ bilan.ecartes++; continue; }
        parEp[s.epNo] = (parEp[s.epNo] || 0) + 1;
        const cle = `${s.epNo}-${s.joNo || q.date}-${s.siNo}`;
        const groupes = new Map();
        (s.nos.length ? s.nos : [{ eq: "", nom: "" }]).forEach(x => {
          const lab = etiquette(s, x.eq, tbl);
          if (!bilan.equipes.some(n => n.epNo === s.epNo && n.eq === x.eq))
            bilan.equipes.push({ epNo: s.epNo, eq: x.eq, ep: propre(s.epNom, 80), lib: propre(s.lib, 80), nom: propre(x.nom, 60), lab: lab || "", devine: deviner(s, x.eq) || "",
              choisi: Object.prototype.hasOwnProperty.call(tbl, `${s.epNo}:${x.eq || ""}`) || Object.prototype.hasOwnProperty.call(tbl, String(s.epNo)), ignore: lab === false });
          if (lab === false) return;                                      // « ne pas importer » : choix du bureau
          if (!lab){ sitesNonRanges.add(cle); if (!bilan.nonRanges.some(n => n.epNo === s.epNo && n.eq === x.eq)) bilan.nonRanges.push({ epNo: s.epNo, eq: x.eq }); return; }
          groupes.set(lab, [...(groupes.get(lab) || []), x.eq]);
        });
        for (const [lab, eqs] of groupes) items.push({ s, q, cle, lab, eqs, fff: depuisFff(s, q) });
      }
      const memeJour = (lab, date) => items.filter(i => i.lab === lab && i.q.date === date).length;
      const vus = new Set();

      // 2. créer ou mettre à jour
      for (const it of items){
        const { s, cle, lab, eqs, fff } = it;
        bilan.total++;
        vus.add(cle + "|" + lab);
        const id = `pl-fff-${slugId(s.epNo)}-${slugId(s.joNo || it.q.date)}-${slugId(s.siNo)}-${slugId(lab)}`;
        let doc = tous().find(m => m.fal && m.fal.cle === cle && m.equipe === lab) || fiches.get(id);
        let repris = false;
        if (!doc && !s.annule && memeJour(lab, fff.date) === 1){             // déjà saisi à la main ? on le reprend (un seul possible)
          const c = tous().filter(m => !m.fal && m.equipe === lab && m.date === fff.date);
          if (c.length === 1){ doc = c[0]; repris = true; }
        }
        if (doc && plusRecent(doc)) continue;                              // un envoi plus récent est déjà passé : on n'y touche pas
        const fal = { cle, epNo: s.epNo, joNo: s.joNo, siNo: s.siNo, ep: propre(s.epNom, 120), cat: propre(s.caCod, 20), eq: eqs.filter(Boolean), org: s.org.no, lu: p.lu };
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
        // mise à jour : seulement ce que le coach n'a pas changé depuis le dernier import
        const avant = doc.fffDernier && typeof doc.fffDernier === "object" ? doc.fffDernier : null;
        const x = { ...doc }; delete x.id; delete x._maj;
        const libre = k => avant ? egal(doc[k], avant[k]) : !note(doc[k]);
        if (!avant && vierge(doc)){ x.dom = fff.dom; x.adv = fff.adv; x.adresse = fff.adresse; if (["", "10:00", "14:00"].includes(doc.heure || "")) x.heure = fff.heure; }
        else {
          const lieuFff = !avant || !egal(avant.dom, fff.dom) || !egal(avant.adv, fff.adv), lieuCoach = !!avant && (!egal(doc.dom, avant.dom) || !egal(doc.adv, avant.adv));
          if (avant && lieuFff && !lieuCoach){ x.dom = fff.dom; x.adv = fff.adv; x.adresse = fff.adresse; }   // la FFF a changé de club : le lieu change d'un bloc
          else ["dom", "adv", "adresse"].forEach(k => { if (libre(k)) x[k] = fff[k]; });
          if (libre("heure")) x.heure = fff.heure;
        }
        if (libre("date")) x.date = fff.date;
        const advAvant = Array.isArray(doc.adversaires) ? doc.adversaires : [];
        if (doc.format !== "poules" && !scores(doc) && (doc.date || "") >= auj() && (avant ? egal(advAvant, avant.adversaires) : !advAvant.length)){
          x.adversaires = fff.adversaires; x.rencontres = rencontresDe(fff.adversaires, doc.rencontres);
        }
        if (!x.dom && x.adresse && /\bgustave\s+jaume\b/i.test(x.adresse)) x.adresse = fff.adresse;   // jamais notre stade pour un plateau à l'extérieur
        x.fal = { ...fal, lu: doc.fal && doc.fal.lu ? doc.fal.lu : p.lu }; x.fffDernier = fff; x.source = x.source || "fff";
        const ancien = { ...doc }; delete ancien.id; delete ancien._maj;
        if (egal(x, ancien)) continue;
        x.fal.lu = p.lu;
        if (await ecrire(doc.id, x)){ if (repris) bilan.reprises++; else bilan.maj++; }
      }

      // 3. retirés par le district : mois bien lu, épreuve qui a encore des plateaux, équipe connue, à venir, sans score
      const aujD = auj();
      for (const m of tous().filter(m => m.fal && m.fal.cle)){
        if (vus.has(m.fal.cle + "|" + m.equipe) || sitesNonRanges.has(m.fal.cle) || plusRecent(m)) continue;
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
  const phrase = b => !b ? "" : b.echec ? b.echec : b.occupe ? "Un rangement est déjà en cours : attends quelques secondes." :
    `${b.total ? b.total + " plateau(x) et brassage(s) du club" : "Aucun plateau du club"} : ${b.crees} ajouté(s), ${b.maj} mis à jour, ${b.reprises ? b.reprises + " déjà saisi(s) repris, " : ""}${b.retires} retiré(s)`
    + (b.gardes ? `, ${b.gardes} gardé(s) car déjà avec des scores` : "") + (b.nonRanges && b.nonRanges.length ? `. ${b.nonRanges.length} équipe(s) de la FFF à choisir dans l'onglet Foot animation.` : ".")
    + (b.ecartes ? ` ${b.ecartes} plateau(x) sans date lisible, écarté(s).` : "") + (b.erreurs ? ` (${b.erreurs} enregistrement(s) refusé(s) : reconnecte-toi et recommence.)` : "");

  /* ---------- réception : l'adresse #fal=… ouverte par le favori ; gardée jusqu'à la confirmation ---------- */
  const nettoyer = d => ({ lu: propre(d.lu, 40), recu: Date.now(),
    eps: d.eps.slice(0, 200).map(x => ({ epNo: propre(x && x.epNo, 20), epNom: propre(x && x.epNom, 120), caCod: propre(x && x.caCod, 20) })),
    etat: Object.fromEntries(Object.entries(d.etat).slice(0, 3000).map(([k, v]) => [propre(k, 40), v === "ok" ? "ok" : "erreur"])),
    sites: d.sites.slice(0, 2000).filter(s => s && propre(s.epNo, 20) && propre(s.siNo, 20)).map(s => ({ epNo: propre(s.epNo, 20), epNom: propre(s.epNom, 120), caCod: propre(s.caCod, 20),
      joNo: propre(s.joNo, 20), siNo: propre(s.siNo, 20), lib: propre(s.lib, 160), date: propre(s.date, 40), heure: s.heure !== false, annule: !!s.annule,
      org: { no: propre(s.org && s.org.no, 20), nom: propre(s.org && s.org.nom, 80) },
      terrain: { nom: propre(s.terrain && s.terrain.nom, 80), adresse: propre(s.terrain && s.terrain.adresse, 160) },
      nos: (Array.isArray(s.nos) ? s.nos : []).slice(0, 10).map(x => ({ eq: propre(x && x.eq, 10), nom: propre(x && x.nom, 80) })),
      autres: (Array.isArray(s.autres) ? s.autres : []).slice(0, 30).map(x => ({ nom: propre(x && x.nom, 80) })) })) });
  const valide = d => d && d.type === "asf-fal" && d.v >= 3 && Array.isArray(d.sites) && Array.isArray(d.eps) && d.etat && typeof d.etat === "object";
  const enAttente = () => { const p = lire("asfp-fal-attente"); if (p && Date.now() - (+p.recu || 0) > ATTENTE_MAX){ garder("asfp-fal-attente", null); return null; } return p; };
  /* l'onglet Foot animation, carte dépliée, dès qu'un coach ou le bureau est connecté */
  function ouvrirOnglet(n, dire){
    if (typeof rendreEspace !== "function" || !S.ui){ if (n < 100) setTimeout(() => ouvrirOnglet(n + 1, dire), 200); return; }
    const p = enAttente(); if (!p) return;
    S.ui.ongPli = S.ui.ongPli || {}; S.ui.ongPli["anim-fff"] = true;
    if (peutEcrire() && S.db && S.pret && en_ligne()){
      S.ui.onglet = "animation"; try { rendreEspace(); } catch(err){}
      if (typeof toast === "function") toast(`${p.sites.length} plateau(x) reçu(s) de la FFF : touche « Ranger les plateaux ».`);
    } else if (n < 100) setTimeout(() => ouvrirOnglet(n + 1, dire), 300);
    else if (dire && typeof toast === "function") toast("Plateaux de la FFF reçus : connecte-toi (coach ou bureau), puis ouvre Foot animation.");
  }
  (function recevoir(){
    const h = location.hash || "";
    if (!h.startsWith("#fal=")) return;
    let d = null;
    try { d = JSON.parse(decodeURIComponent(h.slice(5))); } catch(err){ d = null; }
    history.replaceState(null, "", location.pathname + "?fal=1#espace");
    setTimeout(() => { try { window.dispatchEvent(new HashChangeEvent("hashchange")); } catch(err){} }, 0);
    if (!valide(d)){ setTimeout(() => { if (typeof toast === "function") toast("Envoi de la FFF illisible : recommence avec le favori.", true); }, 1500); return; }
    const p = nettoyer(d);
    garder("asfp-fal-attente", p); garder("asfp-fal-dernier", p);
    setTimeout(() => ouvrirOnglet(0, true), 0);       // après la fin de ce module : la carte doit être branchée sur l'onglet avant qu'on le dessine
  })();
  // reçu avant la connexion (la connexion recharge la page) : on rouvre l'onglet une fois connecté
  if (!/^#fal=/.test(location.hash || "") && location.hash === "#espace" && enAttente()) setTimeout(() => ouvrirOnglet(0, false), 0);
  // l'ancien favori (envoi par message, sans version) : on dit qu'il faut le remplacer
  window.addEventListener("message", ev => {
    if (ev.origin !== FFF || !ev.data || ev.data.type !== "asf-fal" || ev.data.v) return;
    try { ev.source.postMessage({ type: "asf-fal-err", msg: "Ce favori est ancien : remplace-le par le nouveau, dans l'onglet Foot animation du site du club." }, FFF); } catch(err){}
  });

  /* ---------- table des équipes (bureau) et boutons ---------- */
  (function suivre(){
    if (!S.db){ setTimeout(suivre, 500); return; }
    try { S.db.doc("site/fal-equipes").onSnapshot(d => { S.falEquipes = d.exists ? d.data() : {}; }); } catch(err){}
    try { S.db.doc("site/fal-import").onSnapshot(d => { S.falBilan = d.exists ? d.data() : null; }); } catch(err){}
  })();
  async function lancer(p, depuisAttente){
    if (!peutEcrire()){ toast("Connecte-toi avec un compte coach ou bureau.", true); return; }
    const b = await importer(p);
    if (b && b.occupe){ toast(phrase(b), true); return; }
    if (b && b.perime){ garder("asfp-fal-attente", null); garder("asfp-fal-dernier", null); try { rendrePanneau(); } catch(err){} }
    if (b && b.echec){ toast(b.echec, true); return; }
    if (depuisAttente) garder("asfp-fal-attente", null);
    toast(phrase(b));
    try { rendrePanneau(); } catch(err){}
  }
  document.addEventListener("click", async ev => {
    const b = ev.target.closest && ev.target.closest("[data-fal-a]"); if (!b) return;
    ev.preventDefault();
    const a = b.dataset.falA;
    if (a === "copier"){
      try { await navigator.clipboard.writeText(LIEN_FAVORI); toast("Code du favori copié : colle-le comme adresse du favori."); }
      catch(err){ window.prompt("Copie ce code, puis colle-le comme adresse du favori :", LIEN_FAVORI); }
      return;
    }
    if (a === "ranger-recu"){ const p = enAttente(); if (!p){ toast("Aucun envoi en attente : utilise le favori sur la page de la FFF.", true); return; } b.disabled = true; await lancer(p, true); b.disabled = false; return; }
    if (a === "oublier"){ garder("asfp-fal-attente", null); try { rendrePanneau(); } catch(err){} return; }
    if (a === "equipes"){
      if (!bureau()){ toast("Seul le bureau peut choisir les équipes.", true); return; }
      const t = { ...(S.falEquipes || {}) };
      document.querySelectorAll("[data-fal-cle]").forEach(s => { const k = s.dataset.falCle; if (s.value === "?") delete t[k]; else t[k] = s.value === "-" ? "" : s.value; });
      b.disabled = true;
      const ok = typeof ecrire === "function" ? await ecrire(() => S.db.doc("site/fal-equipes").set(t), "Équipes enregistrées.") : false;
      b.disabled = false;
      if (!ok) return;
      S.falEquipes = t;
      const p = lire("asfp-fal-dernier");
      if (p) await lancer(p, false);
      return;
    }
    if (a === "reimporter"){ const p = lire("asfp-fal-dernier"); if (!p){ toast("Aucun envoi de la FFF reçu sur cet appareil : utilise le favori.", true); return; } await lancer(p, false); }
  });

  /* ---------- la carte dans l'onglet Foot animation ---------- */
  const dateTxt = iso => { const d = new Date(iso); return isNaN(d) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long" }) + " à " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); };
  function carte(){
    const loc = lire("asfp-fal-bilan"), part = S.falBilan && (S.falBilan.fait || S.falBilan.lu) ? S.falBilan : null;
    const b = loc && (!part || String(loc.fait || loc.lu) >= String(part.fait || part.lu)) ? loc : part;
    const att = enAttente(), dernier = lire("asfp-fal-dernier");
    const eqs = b && Array.isArray(b.equipes) ? b.equipes : [], nr = eqs.filter(x => !x.lab && !x.ignore);
    const opts = x => `<option value="?">${x.devine ? "Automatique : " + e(x.devine) : "Choisir l'équipe…"}</option>${CATS.map(c => `<option value="${e(c)}" ${x.choisi && x.lab === c ? "selected" : ""}>${e(c)}</option>`).join("")}<option value="-" ${x.ignore ? "selected" : ""}>Ne pas importer</option>`;
    const ligne = x => `<label class="fal-ligne${!x.lab && !x.ignore ? " fal-manque" : ""}"><span>${e(x.ep || "Épreuve " + x.epNo)}${x.lib ? " · " + e(x.lib) : ""}${x.eq ? ` · équipe ${e(x.eq)}` : ""}${x.nom ? ` (${e(x.nom)})` : ""}</span>
        <select data-fal-cle="${e(x.epNo + ":" + (x.eq || ""))}" ${bureau() ? "" : "disabled"}>${opts(x)}</select></label>`;
    const equipes = eqs.length ? `<details class="fal-equipes" ${nr.length ? "open" : ""}><summary>${nr.length ? `⚠️ ${nr.length} équipe(s) de la FFF à choisir` : "Équipes de la FFF et équipes du site"}</summary>
        <p class="fal-mini">Chaque équipe engagée à la FFF va dans une équipe de l'onglet. « Automatique » : le site l'a devinée.</p>
        ${eqs.map(ligne).join("")}
        ${bureau() ? `<button type="button" class="btn bleu petit" data-fal-a="equipes">Enregistrer et ranger à nouveau</button>` : `<p class="fal-mini">Le bureau choisit les équipes.</p>`}</details>` : "";
    const recu = att ? `<div class="fal-recu"><b>📬 ${att.sites.length} plateau(x) reçu(s) de la FFF${att.lu ? " (" + e(dateTxt(att.lu)) + ")" : ""}</b>
        ${peutEcrire() ? `<button type="button" class="btn bleu" data-fal-a="ranger-recu">Ranger les plateaux</button>` : `<span class="fal-mini">Connecte-toi (coach ou bureau) pour les ranger.</span>`}
        <button type="button" class="fal-lien" data-fal-a="oublier">Ignorer cet envoi</button></div>` : "";
    const corps = `${recu}
      <p class="fal-etat">${b ? `Dernier rangement : <b>${e(dateTxt(b.fait || b.lu))}</b>. ${e(phrase(b))}` : "Aucun plateau reçu de la FFF pour l'instant."}</p>
      ${equipes}
      <ol class="fal-etapes">
        <li><b>Une seule fois : ajoute le favori.</b><br>
          <span class="fal-mini"><b>Ordinateur</b> : fais glisser ce bouton dans la barre de favoris (Ctrl + Maj + B pour l'afficher) :</span>
          <a class="btn bleu petit fal-favori" href="${e(LIEN_FAVORI)}" title="Fais glisser ce bouton dans ta barre de favoris">⚽ Envoyer au site ASF</a><br>
          <span class="fal-mini"><b>iPhone / Android</b> : <button type="button" class="fal-lien" data-fal-a="copier">copie le code du favori</button>, ajoute n'importe quelle page à tes favoris (signets),
          puis modifie ce favori : nom « Envoyer au site ASF », adresse = colle le code.</span></li>
        <li><b>Quand le district publie des dates :</b> ouvre <a href="${e(PAGE_CLUB)}" target="_blank" rel="noopener">la page Foot animation du club sur la FFF</a>,
          puis touche le favori (iPhone : icône des signets, puis le favori ; Android : tape « Envoyer » dans la barre d'adresse et choisis le favori).</li>
        <li>Le favori lit les plateaux, puis ouvre le site du club : touche <b>« Ranger les plateaux »</b>. Bonne équipe, heure, stade (Waze), clubs rencontrés ;
          ce que les coachs ont saisi est gardé ; un plateau annulé est retiré.</li>
      </ol>
      ${dernier && peutEcrire() && !att ? `<button type="button" class="btn contour petit" data-fal-a="reimporter">Ranger à nouveau le dernier envoi</button>` : ""}`;
    const sous = att ? "Des plateaux attendent d'être rangés" : b ? "Dernier rangement : " + e(dateTxt(b.fait || b.lu)) : "Le district publie les dates : le favori les fait venir ici";
    return ONG.pli("anim-fff", `<b>📥 Plateaux de la FFF</b><small>${sous}</small>`, corps, !b || !!att || nr.length > 0, "⚽")
      .replace('class="pli ong-pli"', 'class="pli ong-pli fal-carte"');
  }
  const avant = window.panAnimation;
  window.panAnimation = function(){
    const h = avant.apply(this, arguments);
    if (!en_ligne()) return h;
    return ONG.transformer(h, r => {
      const t = document.createElement("template"); t.innerHTML = carte();
      const choix = r.querySelector(".ong-anim-choix");
      if (choix) choix.before(t.content); else r.prepend(t.content);
    });
  };

  const css = document.createElement("style");
  css.id = "fal-import-css";
  css.textContent = `
.fal-carte{margin-bottom:16px}
.fal-carte .fal-etat{margin:0 0 10px;font-size:14.5px;line-height:1.45}
.fal-carte .fal-recu{display:flex;flex-wrap:wrap;gap:10px;align-items:center;border:1px solid rgba(91,140,255,.55);background:rgba(91,140,255,.12);border-radius:12px;padding:12px;margin:0 0 12px}
.fal-carte .fal-recu b{flex:1 1 100%}
.fal-carte .fal-etapes{display:grid;gap:12px;padding-left:20px;margin:10px 0;font-size:14.5px;line-height:1.5}
.fal-carte .fal-favori{display:inline-block;margin:6px 0 2px;cursor:grab}
.fal-carte .fal-mini{font-size:13px;color:var(--texte-doux)}
.fal-carte .fal-lien{background:none;border:0;padding:0;font:inherit;font-weight:700;color:#9FC0FF;text-decoration:underline;cursor:pointer}
.fal-carte .fal-equipes{border:1px solid rgba(143,168,240,.25);border-radius:12px;padding:10px 12px;margin:8px 0 12px}
.fal-carte .fal-equipes summary{cursor:pointer;font-weight:700}
.fal-carte .fal-ligne{display:grid;grid-template-columns:minmax(0,1fr) minmax(170px,auto);gap:8px;align-items:center;font-size:14px;margin:6px 0}
.fal-carte .fal-manque{border-left:3px solid #EAB308;padding-left:8px}
@media (max-width:600px){.fal-carte .fal-ligne{grid-template-columns:minmax(0,1fr)}}
:root[data-theme="light"] .fal-carte .fal-lien{color:#1C4FD6}`;
  document.head.appendChild(css);
})();
