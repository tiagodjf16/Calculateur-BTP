// Point d'entrée : rendu, boucle de jeu, caméras, commandes de conduite (clavier ou écran tactile).
import * as THREE from '../vendor/three.module.min.js';
import { Monde } from './monde.js';
import { Vehicule } from './vehicule.js';
import { Sons } from './audio.js';
import { Entrees } from './entrees.js';
import { Hud } from './hud.js';
import { Garde } from './garde.js';
import { $, amorti, clamp, ecartAngle } from './outils.js';

const RAD = Math.PI / 180;
const options = location.hash.replace('#', '').split('-');
const entrees = new Entrees();
// version allégée : modèles et textures plus petits, ombres plus courtes. Pour tout téléphone ou tablette (même avec une
// souris), et pour les ordinateurs à petite mémoire : la version complète demande environ 1 Go de mémoire graphique.
const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
const petiteMemoire = navigator.deviceMemory > 0 && navigator.deviceMemory <= 4;
const leger = options.includes('leger') || ((entrees.tactile || mobile || petiteMemoire) && !options.includes('complet'));

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#vue'), antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('#charge-texte').textContent = 'Erreur';
  $('#diagnostic').textContent = 'Cet appareil ou ce navigateur ne peut pas afficher la 3D (WebGL 2 indisponible). Essayez avec un navigateur à jour.';
  throw e;
}
// finesse de l'image : réglée toute seule selon la fluidité (« auto »), ou choisie dans le menu Plus / touche O
const qualite = { mode: options.includes('fixe') ? 'fixe' : 'auto', max: Math.min(window.devicePixelRatio || 1, leger ? 1.5 : 2), min: leger ? 0.62 : 0.75,
  echelle: 1, temps: 0, images: 0, stable: 0, remontees: 0 };
qualite.echelle = qualite.max;
renderer.setPixelRatio(qualite.echelle);
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = leger ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 14000);

const monde = new Monde(scene, renderer, leger);
const vsav = new Vehicule(scene, monde);
const sons = new Sons();
let hud, garde;
const jeu = { etat: 'accueil', vue: 0, temps: 0, pause: false, elargi: 1 };
window.__jeu = { jeu, monde, vsav, scene, camera, renderer, sons, entrees, qualite };      // pour les essais automatiques
queueMicrotask(() => { window.__jeu.cam = cam; });

const NOMS_QUALITE = { auto: 'Qualité : auto', haute: 'Qualité : haute', eco: 'Qualité : éco', fixe: 'Qualité : fixe' };

/** Écran en hauteur : on élargit le champ vertical pour garder la rue visible de part et d'autre du véhicule. */
function champ(degres) {
  return jeu.elargi === 1 ? degres : Math.min(94, (2 * Math.atan(Math.tan((degres * RAD) / 2) * jeu.elargi)) / RAD);
}
jeu.champ = champ;

/** Cadrage : le véhicule est placé au-dessus du tableau de bord et des commandes, selon la forme de l'écran. */
let cadre = '';
function cadrage() {
  const W = innerWidth, H = innerHeight, aspect = W / H;
  jeu.elargi = aspect < 0.956 ? Math.min(1.9, 0.956 / aspect) : 1;
  let dy = 0;
  if (jeu.etat === 'intervention') dy = H * 0.04;
  else if (jeu.etat !== 'accueil') {
    if (!entrees.tactile) dy = Math.min(H * 0.085, 70);
    else if (aspect < 1) dy = Math.min(H * 0.16, 200);
    else dy = Math.min(H * 0.07, 34);
  }
  const cle = `${W}x${H}:${Math.round(dy)}`;
  if (cle === cadre) return;
  cadre = cle;
  if (dy) camera.setViewOffset(W, H, 0, dy, W, H); else camera.clearViewOffset();
  camera.aspect = aspect;
  camera.updateProjectionMatrix();
}

function redimensionner() {
  renderer.setSize(innerWidth, innerHeight, false);
  cadrage();
  if (hud) hud._taille();
}
addEventListener('resize', redimensionner);
addEventListener('orientationchange', () => setTimeout(redimensionner, 250));

function infoCommandes() {
  const p = $('#commandes-info');
  if (!p) return;
  p.innerHTML = entrees.tactile
    ? 'Commandes tactiles : <b>volant</b> en bas à gauche, <b>pédales</b> en bas à droite. Le jeu se joue téléphone debout ou couché.'
    : 'Sur ordinateur : clavier (<b>Z Q S D</b> pour conduire, les autres touches s\'affichent en jeu). Sur téléphone : commandes tactiles.';
}
if (entrees.boutons.qualite) entrees.boutons.qualite.querySelector('span').textContent = NOMS_QUALITE[qualite.mode];
entrees.surMode = () => { infoCommandes(); if (hud) { cadrage(); hud._taille(); } $('#plus').hidden = true; };
infoCommandes();

function etape(texte, part) {
  $('#charge-texte').textContent = texte;
  $('#charge-niveau').style.width = Math.round(part * 100) + '%';
}

async function charger() {
  try {
    await monde.charger(etape);
    etape('Véhicule de secours…', 0.9);
    await vsav.charger(leger ? ['modeles_prives/vsav_bspp_leger', 'modeles_prives/vsav_bspp_web', 'modeles/vsav'] : ['modeles_prives/vsav_bspp_web', 'modeles/vsav']);
    if (vsav.credits) $('#credits').textContent += ' · Véhicule : ' + vsav.credits;
    // stationnement devant le centre de secours
    const c = monde.caserne, r = monde.routeProche(c.x, c.z, 300);
    if (r) { vsav.placer(r.x, r.z, Math.atan2(r.dx, r.dz)); monde.station = { x: r.x - r.dx * 26, z: r.z - r.dz * 26, nom: 'Pompe à gazole du centre de secours' }; }
    hud = new Hud(monde);
    garde = new Garde({ monde, vsav, hud, sons, entrees, jeu, scene, camera });
    window.__jeu.garde = garde; window.__jeu.hud = hud;
    await garde.charger();
    cam.pos.copy(vsav.point(0, 3, -9));
    cadrage();
    etape('Prêt', 1);
    if (monde.alertes.length) $('#diagnostic').textContent = monde.alertes.join(' · ');
    $('#jouer').disabled = false;
    renderer.compile(scene, camera);
    requestAnimationFrame(boucle);
  } catch (e) {
    console.error(e);
    etape('Erreur', 0);
    $('#diagnostic').textContent = 'Erreur de chargement : ' + (e.message || e);
  }
}

$('#jouer').addEventListener('click', () => {
  sons.demarrer();
  $('#accueil').remove();
  $('#hud').hidden = false;
  jeu.etat = 'conduite';
  cadrage();
  hud._taille();
  garde.commencer();
  if (entrees.tactile) aideTactile(true);
});

/** Rappel des commandes tactiles (le jeu attend pendant qu'il est affiché). */
function aideTactile(ouvert) {
  $('#aide-tactile').hidden = !ouvert;
  $('#plus').hidden = true;
  jeu.pause = ouvert;
}
$('#aide-fermer').addEventListener('click', () => aideTactile(false));
// le son peut être suspendu par le téléphone (appel, changement d'application) : il reprend au premier appui
addEventListener('pointerdown', () => sons.reprendre(), { passive: true });

// ------------------------------------------------------------------ fluidité : la finesse de l'image s'adapte à l'appareil
function appliquerEchelle(e) {
  qualite.echelle = e;
  renderer.setPixelRatio(e);
  renderer.setSize(innerWidth, innerHeight, false);
}
function ajusterQualite(dt) {
  const q = qualite;
  if (q.mode !== 'auto' || jeu.etat === 'accueil' || jeu.pause || jeu.temps < 3 || dt > 0.5) return;
  q.temps += dt; q.images++;
  if (q.temps < 2) return;
  const ips = q.images / q.temps;
  q.temps = 0; q.images = 0;
  let e = q.echelle;
  if (ips < 26) {
    q.stable = 0;
    if (e > q.min + 0.01) e = Math.max(q.min, e * (ips < 16 ? 0.72 : 0.86));
    else monde.ombres(false);                      // déjà au plus bas : on renonce aux ombres portées
  } else if (ips > 50) {
    if (++q.stable >= 8 && e < q.max - 0.01 && q.remontees < 2) { e = Math.min(q.max, e * 1.15); q.remontees++; q.stable = 0; }
  } else q.stable = 0;
  if (Math.abs(e - q.echelle) > 0.01) appliquerEchelle(e);
}
function changerQualite() {
  const q = qualite, suivant = { auto: 'haute', haute: 'eco', eco: 'auto', fixe: 'auto' }[q.mode];
  q.mode = suivant; q.temps = 0; q.images = 0; q.stable = 0; q.remontees = 0;
  monde.ombres(suivant !== 'eco');
  appliquerEchelle(suivant === 'eco' ? Math.max(q.min, Math.min(1, q.max) * 0.8) : q.max);
  const b = entrees.boutons.qualite;
  if (b) b.querySelector('span').textContent = NOMS_QUALITE[suivant];
  hud.annonce(NOMS_QUALITE[suivant], suivant === 'auto' ? 'L\'image s\'adapte à la fluidité de l\'appareil.' : suivant === 'haute' ? 'Image la plus fine.' : 'Image allégée, sans ombres : plus fluide.', 2.2);
}

$('#vue').addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  jeu.pause = true;
  const d = document.createElement('div');
  d.className = 'voile';
  d.innerHTML = '<div class="aide-carte panneau"><h2>Affichage interrompu</h2><ul><li>L\'appareil a manqué de mémoire graphique. Fermez d\'autres applications ou onglets, puis relancez le jeu.</li></ul><button type="button">Relancer</button></div>';
  document.body.appendChild(d);
  d.querySelector('button').addEventListener('click', () => location.reload());
});

// ------------------------------------------------------------------ caméras
const cam = { pos: new THREE.Vector3(), cap: 0, lacet: 0, tangage: 0, repos: 0, vise: new THREE.Vector3() };
const VUES = ['Poursuite', 'Rapprochée', 'Poste de conduite', 'Vue de dessus'];
let glisse = null;                       // un seul doigt (ou la souris) fait tourner la vue ; les autres conduisent
$('#vue').addEventListener('pointerdown', (e) => {
  $('#plus').hidden = true;
  if (!glisse) glisse = { id: e.pointerId, x: e.clientX, y: e.clientY };
});
const finGlisse = (e) => { if (glisse && e.pointerId === glisse.id) glisse = null; };
addEventListener('pointerup', finGlisse);
addEventListener('pointercancel', finGlisse);
addEventListener('pointermove', (e) => {
  if (!glisse || e.pointerId !== glisse.id || jeu.etat === 'accueil') return;
  cam.lacet -= (e.clientX - glisse.x) * 0.006;
  cam.tangage = clamp(cam.tangage + (e.clientY - glisse.y) * 0.004, -0.25, 0.9);
  glisse.x = e.clientX; glisse.y = e.clientY;
  cam.repos = 2.5;
});

function majCamera(dt) {
  const v = vsav;
  cadrage();
  if (garde && garde.piloteCamera(dt, cam)) return;          // l'intervention pilote sa propre caméra
  cam.repos -= dt;
  if (cam.repos <= 0 && Math.abs(v.v) > 1.5) { cam.lacet = amorti(cam.lacet, 0, 3, dt); cam.tangage = amorti(cam.tangage, 0, 3, dt); }
  cam.cap += ecartAngle(v.cap, cam.cap) * (1 - Math.exp(-5 * dt));
  const a = cam.cap + cam.lacet;
  const p = new THREE.Vector3(), cible = new THREE.Vector3();
  if (jeu.vue === 2) {                                   // poste de conduite
    const vol = v.volant ? v.volant.position : new THREE.Vector3(0.43, 1.4, 1.3);
    v.caisse.localToWorld(p.set(vol.x, vol.y + 0.33, vol.z - 0.5));
    v.caisse.localToWorld(cible.set(vol.x * 0.3 + Math.sin(cam.lacet) * 6, vol.y + 0.15 - cam.tangage * 3, vol.z + 6));
    camera.position.copy(p);
    camera.fov = champ(68);
  } else if (jeu.vue === 3) {
    camera.position.set(v.x - Math.sin(a) * 0.1, v.y + 75, v.z - Math.cos(a) * 0.1);
    cible.set(v.x, v.y, v.z);
    camera.fov = champ(45);
  } else {
    const loin = jeu.vue === 1 ? 5.2 : 7.3, haut = (jeu.vue === 1 ? 1.7 : 2.65) + cam.tangage * 6;
    const recul = loin * (1 + clamp(Math.abs(v.v) / 60, 0, 0.25));
    // la caméra ne traverse pas les bâtiments : on la rapproche du véhicule si un mur s'interpose
    let libre = recul;
    for (let k = 1; k <= 12; k++) {
      const dd = (recul * k) / 12;
      if (dd > 2.6 && monde.collision(v.x - Math.sin(a) * dd, v.z - Math.cos(a) * dd, 0.45)) { libre = Math.max(2.6, dd - recul / 12); break; }
    }
    cam.recul = libre < (cam.recul ?? recul) ? libre : amorti(cam.recul ?? recul, libre, 2.5, dt);
    p.set(v.x - Math.sin(a) * cam.recul, v.y + haut, v.z - Math.cos(a) * cam.recul);
    p.y = Math.max(p.y, monde.hauteur(p.x, p.z) + 0.7);
    cam.pos.lerp(p, 1 - Math.exp(-9 * dt));
    camera.position.copy(cam.pos);
    cible.set(v.x + Math.sin(v.cap) * 1.5, v.y + 1.35, v.z + Math.cos(v.cap) * 1.5);
    camera.fov = champ(52);
  }
  cam.vise.lerp(cible, jeu.vue >= 2 ? 1 : 1 - Math.exp(-12 * dt));
  camera.lookAt(cam.vise);
  camera.updateProjectionMatrix();
}

// ------------------------------------------------------------------ commandes de conduite
let rappelCeinture = 0, ticCli = false;
function commandes(dt) {
  const v = vsav;
  for (const code of entrees.lire()) {
    if (garde.touche(code)) continue;
    switch (code) {
      case 'KeyM': case 'Semicolon':
        if (v.carburant <= 0) { hud.annonce('Panne sèche', 'Le réservoir est vide.'); break; }
        v.moteur = !v.moteur;
        sons.coup(v.moteur ? 900 : 300, 0.5, 0.45);
        if (v.moteur) v.rapport = v.freinMain ? 'P' : 'N';
        break;
      case 'KeyC': v.ceinture = !v.ceinture; sons.clic(); hud.annonce(v.ceinture ? 'Ceinture bouclée' : 'Ceinture détachée', '', 1.6); break;
      case 'KeyP': v.freinMain = !v.freinMain; sons.clic(); break;
      case 'KeyG': v.gyro = !v.gyro; sons.clic(); break;
      case 'KeyT': v.deuxTons = !v.deuxTons; if (v.deuxTons) v.gyro = true; break;
      case 'KeyB': v.balisage = !v.balisage; sons.clic(); break;
      case 'KeyL': v.codes = !v.codes; sons.clic(); break;
      case 'KeyQ': v.clignotant = v.clignotant === -1 ? 0 : -1; break;
      case 'KeyE': v.clignotant = v.clignotant === 1 ? 0 : 1; break;
      case 'KeyZ': v.clignotant = v.clignotant === 2 ? 0 : 2; break;
      case 'KeyV': jeu.vue = (jeu.vue + 1) % VUES.length; hud.annonce(VUES[jeu.vue], '', 1.2); break;
      case 'KeyH': $('#touches').classList.toggle('cache'); break;
      case 'KeyR': {
        const r = monde.routeProche(v.x, v.z, 400);
        if (r) v.placer(r.x, r.z, Math.atan2(r.dx, r.dz));
        $('#plus').hidden = true;
        break;
      }
      case 'Plus': $('#plus').hidden = !$('#plus').hidden; break;
      case 'KeyO': case 'Qualite': changerQualite(); break;
      case 'Aide': aideTactile(true); break;
      default:
    }
  }
  sons.klaxon(entrees.tenue('KeyK'));
  // alarme de ceinture
  if (v.moteur && !v.ceinture && v.vitesseKmh > 8) {
    rappelCeinture -= dt;
    if (rappelCeinture <= 0) { sons.ceinture(); rappelCeinture = 1.5; }
  } else rappelCeinture = 0.4;
  if (v.cliAllume !== ticCli) { ticCli = v.cliAllume; if (v.clignotant) sons.clic(); }
}

const rapports = [0, 4.5, 9, 14.5, 21, 29, 60];
function regime(v) {
  const s = Math.abs(v.v);
  let k = 0;
  while (k < rapports.length - 2 && s > rapports[k + 1]) k++;
  return clamp(0.16 + ((s - rapports[k]) / (rapports[k + 1] - rapports[k])) * 0.62 + (v.gaz || 0) * 0.16, 0.12, 1);
}

// Petit écran : la tablette de bilan et l'écran de fin couvrent toute l'image ; inutile de dessiner la ville derrière.
const petitEcran = matchMedia('(max-width: 860px), (max-height: 520px)');
function vueMasquee() {
  if (!petitEcran.matches) return false;
  if (jeu.etat === 'bilan') return true;
  return jeu.etat === 'intervention' && !!garde.inter && !garde.inter.finie && !garde.inter.ecran.classList.contains('reduit');
}

let dernier = performance.now(), sautees = 0;
function boucle(maintenant) {
  requestAnimationFrame(boucle);
  const reel = (maintenant - dernier) / 1000, dt = Math.min(0.05, reel);
  dernier = maintenant;
  const masquee = vueMasquee();
  if (!masquee) ajusterQualite(reel);
  if (jeu.etat !== 'accueil' && !jeu.pause) {
    for (let k = 0; k < (jeu.accel || 1); k++) {            // jeu.accel > 1 : avance rapide (essais automatiques)
      jeu.temps += dt;
      commandes(dt);
      const conduite = jeu.etat === 'conduite';
      vsav.maj(dt, conduite ? entrees.commande(vsav.v) : { avant: 0, arriere: 0, direction: 0, frein: 1 });
      garde.maj(dt);
    }
    if (entrees.tactile) entrees.etat(vsav);
    hud.maj(dt, vsav, { porteOuverte: vsav.portes.ar > 0.05 || vsav.portes.lat > 0.05 });
    sons.moteur(vsav.moteur, regime(vsav), vsav.gaz || 0, Math.abs(vsav.v), jeu.vue === 2);
    sons.deuxTons(vsav.deuxTons, jeu.vue === 2);
  }
  majCamera(dt);
  monde.suivre(camera, vsav.groupe.position);
  if (masquee && ++sautees < 30) return;                    // une image de temps en temps suffit derrière la tablette
  sautees = 0;
  renderer.render(scene, camera);
}

charger();
