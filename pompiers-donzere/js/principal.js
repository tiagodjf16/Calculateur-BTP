// Point d'entrée : rendu, boucle de jeu, caméras, commandes de conduite.
import * as THREE from 'three';
import { Monde } from './monde.js';
import { Vehicule } from './vehicule.js';
import { Sons } from './audio.js';
import { Entrees } from './entrees.js';
import { Hud } from './hud.js';
import { Garde } from './garde.js';
import { $, amorti, clamp, ecartAngle } from './outils.js';

const options = location.hash.replace('#', '').split('-');
const leger = options.includes('leger') || (matchMedia('(pointer: coarse)').matches && !options.includes('complet'));

const renderer = new THREE.WebGLRenderer({ canvas: $('#vue'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, leger ? 1.5 : 2));
renderer.setSize(innerWidth, innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.82;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.3, 14000);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const monde = new Monde(scene, renderer, leger);
const vsav = new Vehicule(scene, monde);
const sons = new Sons();
const entrees = new Entrees();
let hud, garde;
const jeu = { etat: 'accueil', vue: 0, temps: 0, pause: false };
window.__jeu = { jeu, monde, vsav, scene, camera, renderer, sons, entrees };      // pour les essais automatiques
queueMicrotask(() => { window.__jeu.cam = cam; });

function etape(texte, part) {
  $('#charge-texte').textContent = texte;
  $('#charge-niveau').style.width = Math.round(part * 100) + '%';
}

async function charger() {
  try {
    await monde.charger(etape);
    etape('Véhicule de secours…', 0.9);
    await vsav.charger(['modeles_prives/vsav_bspp_web', 'modeles/vsav']);
    if (vsav.credits) $('#credits').textContent += ' · Véhicule : ' + vsav.credits;
    // stationnement devant le centre de secours
    const c = monde.caserne, r = monde.routeProche(c.x, c.z, 300);
    if (r) { vsav.placer(r.x, r.z, Math.atan2(r.dx, r.dz)); monde.station = { x: r.x - r.dx * 26, z: r.z - r.dz * 26, nom: 'Pompe à gazole du centre de secours' }; }
    hud = new Hud(monde);
    garde = new Garde({ monde, vsav, hud, sons, entrees, jeu, scene, camera });
    window.__jeu.garde = garde; window.__jeu.hud = hud;
    await garde.charger();
    cam.pos.copy(vsav.point(0, 3, -9));
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
  hud._taille();
  jeu.etat = 'conduite';
  garde.commencer();
});

// ------------------------------------------------------------------ caméras
const cam = { pos: new THREE.Vector3(), cap: 0, lacet: 0, tangage: 0, repos: 0, vise: new THREE.Vector3() };
const VUES = ['Poursuite', 'Rapprochée', 'Poste de conduite', 'Vue de dessus'];
let glisse = null;
$('#vue').addEventListener('pointerdown', (e) => { glisse = { x: e.clientX, y: e.clientY }; });
addEventListener('pointerup', () => { glisse = null; });
addEventListener('pointermove', (e) => {
  if (!glisse || jeu.etat === 'accueil') return;
  cam.lacet -= (e.clientX - glisse.x) * 0.006;
  cam.tangage = clamp(cam.tangage + (e.clientY - glisse.y) * 0.004, -0.25, 0.9);
  glisse = { x: e.clientX, y: e.clientY };
  cam.repos = 2.5;
});

function majCamera(dt) {
  const v = vsav;
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
    camera.fov = 68;
  } else if (jeu.vue === 3) {
    camera.position.set(v.x - Math.sin(a) * 0.1, v.y + 75, v.z - Math.cos(a) * 0.1);
    cible.set(v.x, v.y, v.z);
    camera.fov = 45;
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
    camera.fov = 52;
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
        break;
      }
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

let dernier = performance.now();
function boucle(maintenant) {
  requestAnimationFrame(boucle);
  const dt = Math.min(0.05, (maintenant - dernier) / 1000);
  dernier = maintenant;
  if (jeu.etat !== 'accueil' && !jeu.pause) {
    for (let k = 0; k < (jeu.accel || 1); k++) {            // jeu.accel > 1 : avance rapide (essais automatiques)
      jeu.temps += dt;
      commandes(dt);
      const conduite = jeu.etat === 'conduite';
      vsav.maj(dt, conduite ? entrees.commande() : { avant: 0, arriere: 0, direction: 0, frein: 1 });
      garde.maj(dt);
    }
    hud.maj(dt, vsav, { porteOuverte: vsav.portes.ar > 0.05 || vsav.portes.lat > 0.05 });
    sons.moteur(vsav.moteur, regime(vsav), vsav.gaz || 0, Math.abs(vsav.v), jeu.vue === 2);
    sons.deuxTons(vsav.deuxTons, jeu.vue === 2);
  }
  majCamera(dt);
  monde.suivre(camera, vsav.groupe.position);
  renderer.render(scene, camera);
}

charger();
