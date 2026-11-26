// Le monde : Donzère réel (relief, photo aérienne, routes, bâtiments, eau, ciel) et les requêtes de jeu
// (altitude, route la plus proche, collisions, itinéraire GPS).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { alea, clamp, dansPolygone, procheSegment } from './outils.js';

const CARROSSABLE = new Set(['Route à 1 chaussée', 'Route à 2 chaussées', 'Rond-point', 'Bretelle', 'Route empierrée']);
const REVETUE = new Set(['Route à 1 chaussée', 'Route à 2 chaussées', 'Rond-point', 'Bretelle']);

export function chargeurGLTF() {
  const l = new GLTFLoader();
  l.setMeshoptDecoder(MeshoptDecoder);
  return l;
}

export class Monde {
  constructor(scene, renderer, leger) {
    this.scene = scene;
    this.renderer = renderer;
    this.leger = leger;
    this.tex = new THREE.TextureLoader();
    this.aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }

  texture(url, opts = {}) {
    return new Promise((ok, ko) => this.tex.load(url, (t) => {
      t.colorSpace = opts.lineaire ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.anisotropy = this.aniso;
      if (opts.repete) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      ok(t);
    }, undefined, () => ko(new Error('Image introuvable : ' + url))));
  }

  async charger(etape) {
    etape('Données IGN de Donzère…', 0.05);
    const d = (this.d = await (await fetch('data/donzere.json')).json());
    [this.L, this.H] = d.taille;
    this.n = d.relief.n;
    const bin = atob(d.relief.data);
    const octets = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
    this.rel = new Uint16Array(octets.buffer);
    this._index();
    etape('Ciel et lumière…', 0.12);
    await this._ciel();
    etape('Relief et photo aérienne IGN…', 0.25);
    await this._terrain();
    etape('Routes…', 0.5);
    await this._routes();
    this._eau();
    etape('Bâtiments…', 0.6);
    await this._batiments();
    etape('Végétation…', 0.8);
    await this._vegetation();
  }

  // ------------------------------------------------------------------ relief
  /** Altitude du sol (m), identique à la surface affichée (interpolation par triangles). */
  hauteur(x, z) {
    const n = this.n;
    const fx = clamp(((x + this.L / 2) / this.L) * (n - 1), 0, n - 1.0001);
    const fz = clamp(((z + this.H / 2) / this.H) * (n - 1), 0, n - 1.0001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const r = this.rel, k = j * n + i;
    const a = r[k], b = r[k + 1], c = r[k + n], dd = r[k + n + 1];
    return (u + v <= 1 ? a + (b - a) * u + (c - a) * v : dd + (c - dd) * (1 - u) + (b - dd) * (1 - v)) / 100;
  }

  // ------------------------------------------------------------------ index spatiaux (routes, bâtiments)
  _index() {
    const d = this.d;
    // routes : segments rangés dans une grille de 50 m + graphe pour le GPS
    this.C = 50;
    this.grilleRoutes = new Map();
    this.noeuds = new Map();
    const cle = (x, z) => Math.round(x) + ',' + Math.round(z);
    const noeud = (x, z) => {
      const k = cle(x, z);
      if (!this.noeuds.has(k)) this.noeuds.set(k, { x, z, aretes: [] });
      return this.noeuds.get(k);
    };
    d.routes.forEach((r, ri) => {
      r.ok = CARROSSABLE.has(r.n);
      if (!r.ok) return;
      const p = r.p;
      let long = 0;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i], az = p[i + 1], bx = p[i + 2], bz = p[i + 3];
        long += Math.hypot(bx - ax, bz - az);
        const i0 = Math.floor(Math.min(ax, bx) / this.C), i1 = Math.floor(Math.max(ax, bx) / this.C);
        const j0 = Math.floor(Math.min(az, bz) / this.C), j1 = Math.floor(Math.max(az, bz) / this.C);
        for (let gi = i0; gi <= i1; gi++) for (let gj = j0; gj <= j1; gj++) {
          const k = gi + ',' + gj;
          if (!this.grilleRoutes.has(k)) this.grilleRoutes.set(k, []);
          this.grilleRoutes.get(k).push([ax, az, bx, bz, ri]);
        }
      }
      const A = noeud(p[0], p[1]), B = noeud(p[p.length - 2], p[p.length - 1]);
      const cout = long * (r.n === 'Route empierrée' ? 3 : r.w >= 6 ? 0.8 : 1);
      A.aretes.push({ vers: B, cout, r, sens: 1 });
      B.aretes.push({ vers: A, cout, r, sens: -1 });
    });
    // bâtiments : grille de 40 m
    this.CB = 40;
    this.grilleBat = new Map();
    d.batiments.forEach((b, bi) => {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, cx = 0, cz = 0;
      for (let i = 0; i < b.p.length; i += 2) {
        x0 = Math.min(x0, b.p[i]); x1 = Math.max(x1, b.p[i]); z0 = Math.min(z0, b.p[i + 1]); z1 = Math.max(z1, b.p[i + 1]);
        cx += b.p[i]; cz += b.p[i + 1];
      }
      b.cx = cx / (b.p.length / 2); b.cz = cz / (b.p.length / 2);
      b.boite = [x0, z0, x1, z1];
      for (let gi = Math.floor(x0 / this.CB); gi <= Math.floor(x1 / this.CB); gi++)
        for (let gj = Math.floor(z0 / this.CB); gj <= Math.floor(z1 / this.CB); gj++) {
          const k = gi + ',' + gj;
          if (!this.grilleBat.has(k)) this.grilleBat.set(k, []);
          this.grilleBat.get(k).push(bi);
        }
    });
    // lieux utiles
    const lieu = (motif) => d.lieux.find((l) => motif.test(l.n));
    const cas = lieu(/Caserne de pompiers/i);
    this.caserne = cas ? { x: cas.x, z: cas.z, nom: cas.nom || 'Centre de secours' } : { x: 0, z: 0, nom: 'Centre de secours' };
    // sortie nord par la N7 : direction du centre hospitalier de Montélimar
    let nord = null;
    for (const r of d.routes) {
      if (!r.ok || !/NATIONALE 7|N7\b/i.test(r.nom || '')) continue;
      for (let i = 0; i < r.p.length; i += 2) if (!nord || r.p[i + 1] < nord.z) nord = { x: r.p[i], z: r.p[i + 1] };
    }
    this.hopital = nord || { x: this.L / 2 - 60, z: -this.H / 2 + 60 };
  }

  /** Route carrossable la plus proche : { d, x, z, dx, dz, r } (dx, dz = direction de la route). */
  routeProche(x, z, rayon = 120) {
    let meilleur = null, md = rayon;
    const gi0 = Math.floor((x - rayon) / this.C), gi1 = Math.floor((x + rayon) / this.C);
    const gj0 = Math.floor((z - rayon) / this.C), gj1 = Math.floor((z + rayon) / this.C);
    for (let gi = gi0; gi <= gi1; gi++) for (let gj = gj0; gj <= gj1; gj++) {
      const segs = this.grilleRoutes.get(gi + ',' + gj);
      if (!segs) continue;
      for (const s of segs) {
        const [px, pz] = procheSegment(x, z, s[0], s[1], s[2], s[3]);
        const dd = Math.hypot(px - x, pz - z);
        if (dd < md) {
          md = dd;
          const l = Math.hypot(s[2] - s[0], s[3] - s[1]) || 1;
          meilleur = { d: dd, x: px, z: pz, dx: (s[2] - s[0]) / l, dz: (s[3] - s[1]) / l, r: this.d.routes[s[4]] };
        }
      }
    }
    return meilleur;
  }

  /** Repousse un disque (x, z, rayon) hors des bâtiments. Renvoie [dx, dz] ou null. */
  collision(x, z, rayon) {
    const lus = this.grilleBat.get(Math.floor(x / this.CB) + ',' + Math.floor(z / this.CB));
    if (!lus) return null;
    for (const bi of lus) {
      const b = this.d.batiments[bi];
      if (x < b.boite[0] - rayon || x > b.boite[2] + rayon || z < b.boite[1] - rayon || z > b.boite[3] + rayon) continue;
      let md = 1e9, mx = 0, mz = 0;
      const p = b.p;
      for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) {
        const [px, pz] = procheSegment(x, z, p[j], p[j + 1], p[i], p[i + 1]);
        const dd = Math.hypot(px - x, pz - z);
        if (dd < md) { md = dd; mx = px; mz = pz; }
      }
      const dedans = dansPolygone(x, z, p);
      if (dedans || md < rayon) {
        const l = md || 1e-6;
        const s = dedans ? -(md + rayon) / l : (rayon - md) / l;
        return [(x - mx) * s, (z - mz) * s];
      }
    }
    return null;
  }

  /** Itinéraire routier (liste de points [x, z]) entre deux positions, ou null. */
  itineraire(x0, z0, x1, z1) {
    const proche = (x, z) => {
      let m = null, md = 1e9;
      for (const nd of this.noeuds.values()) {
        const dd = (nd.x - x) ** 2 + (nd.z - z) ** 2;
        if (dd < md) { md = dd; m = nd; }
      }
      return m;
    };
    const dep = proche(x0, z0), arr = proche(x1, z1);
    if (!dep || !arr) return null;
    const dist = new Map([[dep, 0]]), prec = new Map(), faits = new Set();
    const file = [dep];
    while (file.length) {
      let k = 0;
      for (let i = 1; i < file.length; i++) if (dist.get(file[i]) < dist.get(file[k])) k = i;
      const u = file.splice(k, 1)[0];
      if (u === arr) break;
      if (faits.has(u)) continue;
      faits.add(u);
      for (const a of u.aretes) {
        const nd = dist.get(u) + a.cout;
        if (nd < (dist.get(a.vers) ?? 1e12)) { dist.set(a.vers, nd); prec.set(a.vers, [u, a]); file.push(a.vers); }
      }
    }
    if (!prec.has(arr) && arr !== dep) return null;
    const morceaux = [];
    for (let u = arr; prec.has(u);) {
      const [avant, a] = prec.get(u);
      const pts = [];
      for (let i = 0; i < a.r.p.length; i += 2) pts.push([a.r.p[i], a.r.p[i + 1]]);
      morceaux.push(a.sens === 1 ? pts : pts.reverse());
      u = avant;
    }
    const chemin = [[x0, z0]];
    for (const m of morceaux.reverse()) for (const pt of m) chemin.push(pt);
    chemin.push([x1, z1]);
    return chemin;
  }

  // ------------------------------------------------------------------ ciel et lumière
  async _ciel() {
    const c = (this.ciel = await (await fetch('data/ciel.json')).json());
    const scene = this.scene;
    // direction du soleil dans l'image (convention panoramique de three.js), puis rotation pour le placer au sud-ouest
    const a0 = (c.u_soleil - 0.5) * 2 * Math.PI;
    const voulu = Math.atan2(0.86, -0.5);                     // z vers le sud, x vers l'ouest
    const rot = a0 - voulu;
    const el = c.elevation;
    this.soleilDir = new THREE.Vector3(Math.cos(el) * Math.cos(voulu), Math.sin(el), Math.cos(el) * Math.sin(voulu)).normalize();
    const env = await new Promise((ok, ko) => new RGBELoader().load('ciel/env.hdr', ok, undefined, ko));
    env.mapping = THREE.EquirectangularReflectionMapping;
    scene.environment = env;
    scene.environmentRotation = new THREE.Euler(0, rot, 0);
    scene.environmentIntensity = 1.0;
    // dôme du ciel (photo), non soumis au « développement » de l'image
    const carte = await this.texture(this.leger ? 'ciel/dome_leger.jpg' : 'ciel/dome.jpg');
    const bas = (c.sous_horizon_deg * Math.PI) / 180;
    const geo = new THREE.SphereGeometry(9000, 64, 24, 0, Math.PI * 2, 0, Math.PI / 2 + bas);
    const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: carte, side: THREE.DoubleSide, toneMapped: false, fog: false, depthWrite: false }));
    dome.scale.z = -1;
    dome.rotation.y = rot;
    dome.renderOrder = -10;
    dome.frustumCulled = false;
    scene.add(dome);
    this.dome = dome;
    const h = c.horizon;
    this.brume = new THREE.Color().setRGB(h[0] / 255, h[1] / 255, h[2] / 255, THREE.SRGBColorSpace);
    scene.fog = new THREE.FogExp2(this.brume, 0.00042);
    // soleil : lumière directionnelle avec ombres, qui suit le véhicule
    const e = c.eclairement_soleil, m = Math.max(...e);
    const soleil = new THREE.DirectionalLight(new THREE.Color(e[0] / m, e[1] / m, e[2] / m), m * 0.9);
    soleil.castShadow = true;
    const t = this.leger ? 1024 : 4096, portee = this.leger ? 70 : 150;
    soleil.shadow.mapSize.set(t, t);
    Object.assign(soleil.shadow.camera, { left: -portee, right: portee, top: portee, bottom: -portee, near: 10, far: 900 });
    soleil.shadow.bias = -0.0004;
    soleil.shadow.normalBias = 0.06;
    scene.add(soleil, soleil.target);
    this.soleil = soleil;
    this.porteeOmbres = portee;
  }

  /** À appeler à chaque image : le ciel et les ombres suivent la caméra / le véhicule. */
  suivre(camera, cible) {
    this.dome.position.set(camera.position.x, 0, camera.position.z);
    // on aligne la carte d'ombres sur une grille pour éviter le scintillement
    const pas = (this.porteeOmbres * 2) / this.soleil.shadow.mapSize.x * 8;
    const cx = Math.round(cible.x / pas) * pas, cz = Math.round(cible.z / pas) * pas;
    this.soleil.target.position.set(cx, cible.y, cz);
    this.soleil.position.copy(this.soleil.target.position).addScaledVector(this.soleilDir, 450);
  }

  // ------------------------------------------------------------------ terrain
  async _terrain() {
    const n = this.n, L = this.L, H = this.H, rel = this.rel;
    const q = this.leger ? 1 : 2;                                  // dalles de photo aérienne par côté
    const cartes = [];
    if (q === 1) cartes.push(await this.texture('data/ortho.jpg'));
    else for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) cartes.push(await this.texture(`data/ortho_${i}_${j}.jpg`));
    this.orthoLeger = q === 1 ? cartes[0] : await this.texture('data/ortho.jpg');
    const grain = await this.texture('textures/grain_sol.jpg', { repete: true });
    const pasX = L / (n - 1), pasZ = H / (n - 1);
    const h = (i, j) => rel[clamp(j, 0, n - 1) * n + clamp(i, 0, n - 1)] / 100;
    const m = (n - 1) / q;
    this.sol = new THREE.Group();
    for (let qj = 0; qj < q; qj++) for (let qi = 0; qi < q; qi++) {
      const nv = m + 1;
      const pos = new Float32Array(nv * nv * 3), uv = new Float32Array(nv * nv * 2), nor = new Float32Array(nv * nv * 3);
      for (let j = 0; j < nv; j++) for (let i = 0; i < nv; i++) {
        const gi = qi * m + i, gj = qj * m + j, k = j * nv + i;
        pos.set([-L / 2 + gi * pasX, h(gi, gj), -H / 2 + gj * pasZ], k * 3);
        uv.set([i / m, 1 - j / m], k * 2);
        const nx = (h(gi - 1, gj) - h(gi + 1, gj)) / (2 * pasX), nz = (h(gi, gj - 1) - h(gi, gj + 1)) / (2 * pasZ);
        const l = Math.hypot(nx, 1, nz);
        nor.set([nx / l, 1 / l, nz / l], k * 3);
      }
      const idx = new Uint32Array(m * m * 6);
      let t = 0;
      for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) {
        const a = j * nv + i, b = a + 1, c = a + nv, dd = c + 1;
        idx.set([a, c, b, b, c, dd], t); t += 6;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      geo.setIndex(new THREE.BufferAttribute(idx, 1));
      // pas de reflet spéculaire sur le sol : sinon le ciel « délave » la photo aérienne en vue rasante
      const mat = new THREE.MeshPhysicalMaterial({ map: cartes[qj * q + qi], roughness: 1, metalness: 0, specularIntensity: 0 });
      const echelle = (L / q) / 2.6;                               // le grain se répète tous les 2,6 m
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.uGrain = { value: grain };
        sh.uniforms.uEchelle = { value: echelle };
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D uGrain;\nuniform float uEchelle;')
          .replace('#include <map_fragment>', `#include <map_fragment>
            float pres = 1.0 - smoothstep(25.0, 140.0, length(vViewPosition));
            vec3 g1 = texture2D(uGrain, vMapUv * uEchelle).rgb;
            vec3 g2 = texture2D(uGrain, vMapUv * uEchelle * 0.23).rgb;
            // la photo aérienne est déjà éclairée par le soleil : on la ramène à une teinte de matière avant de l'éclairer
            diffuseColor.rgb = pow(diffuseColor.rgb, vec3(1.06)) * 0.82;
            diffuseColor.rgb *= mix(vec3(1.0), (g1 + g2) * 2.35, 0.42 * pres + 0.06);`);
      };
      const maille = new THREE.Mesh(geo, mat);
      maille.receiveShadow = true;
      this.sol.add(maille);
    }
    this.scene.add(this.sol);
    // au-delà de la carte : une grande plaine de la couleur des champs, fondue dans la brume
    const loin = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000), new THREE.MeshPhysicalMaterial({ color: 0x6f6a52, roughness: 1, specularIntensity: 0 }));
    loin.rotation.x = -Math.PI / 2;
    loin.position.y = -1.5;
    this.scene.add(loin);
  }

  // ------------------------------------------------------------------ routes
  async _routes() {
    const [enrobe, enrobeN] = await Promise.all([this.texture('textures/enrobe.jpg', { repete: true }), this.texture('textures/enrobe_n.jpg', { repete: true, lineaire: true })]);
    const P = [], UV = [], C = [], I = [];
    const MP = [], MI = [];
    const point = (x, z, a) => { P.push(x, this.hauteur(x, z) + 0.07, z); UV.push(x / 5, z / 5); C.push(1, 1, 1, a); return P.length / 3 - 1; };
    const marque = (x0, z0, x1, z1, larg) => {
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1, nx = (-dz / l) * larg / 2, nz = (dx / l) * larg / 2;
      const b = MP.length / 3;
      for (const [x, z] of [[x0 - nx, z0 - nz], [x0 + nx, z0 + nz], [x1 + nx, z1 + nz], [x1 - nx, z1 - nz]]) MP.push(x, this.hauteur(x, z) + 0.1, z);
      MI.push(b, b + 1, b + 2, b, b + 2, b + 3);
    };
    for (const r of this.d.routes) {
      if (!REVETUE.has(r.n)) continue;
      // on rééchantillonne la route tous les 4 m environ pour épouser le relief
      const pts = [];
      for (let i = 0; i + 3 < r.p.length; i += 2) {
        const ax = r.p[i], az = r.p[i + 1], bx = r.p[i + 2], bz = r.p[i + 3];
        const k = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
        for (let s = 0; s < k; s++) pts.push([ax + ((bx - ax) * s) / k, az + ((bz - az) * s) / k]);
      }
      pts.push([r.p[r.p.length - 2], r.p[r.p.length - 1]]);
      const demi = Math.max(1.6, r.w / 2 + 0.25), fondu = 0.5;
      let prec = null, cumul = 0;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const nx = -(b[1] - a[1]) / l, nz = (b[0] - a[0]) / l;
        const [x, z] = pts[i];
        const ligne = [point(x - nx * (demi + fondu), z - nz * (demi + fondu), 0), point(x - nx * demi, z - nz * demi, 1),
          point(x + nx * demi, z + nz * demi, 1), point(x + nx * (demi + fondu), z + nz * (demi + fondu), 0)];
        if (prec) for (let k = 0; k < 3; k++) I.push(prec[k], ligne[k], prec[k + 1], prec[k + 1], ligne[k], ligne[k + 1]);
        // marquage : axe en pointillés (3 m tracés, 10 m d'intervalle) sur les routes assez larges, rives sur les grands axes
        if (i > 0 && r.n !== 'Rond-point') {
          const p0 = pts[i - 1], seg = Math.hypot(x - p0[0], z - p0[1]);
          if (r.w >= 5.4 && cumul % 13 < 3) marque(p0[0], p0[1], x, z, 0.13);
          if (r.w >= 6.4) for (const s of [-1, 1]) marque(p0[0] + nx * s * (r.w / 2 - 0.2), p0[1] + nz * s * (r.w / 2 - 0.2), x + nx * s * (r.w / 2 - 0.2), z + nz * s * (r.w / 2 - 0.2), 0.16);
          cumul += seg;
        }
        prec = ligne;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 4));
    geo.setIndex(I);
    geo.computeVertexNormals();
    const mat = new THREE.MeshPhysicalMaterial({ map: enrobe, normalMap: enrobeN, roughness: 0.92, metalness: 0, specularIntensity: 0.35, vertexColors: true, transparent: true,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const chaussee = new THREE.Mesh(geo, mat);
    chaussee.receiveShadow = true;
    chaussee.renderOrder = 1;
    this.scene.add(chaussee);
    const gm = new THREE.BufferGeometry();
    gm.setAttribute('position', new THREE.Float32BufferAttribute(MP, 3));
    gm.setIndex(MI);
    gm.computeVertexNormals();
    const peinture = new THREE.Mesh(gm, new THREE.MeshStandardMaterial({ color: 0xd9d9d2, roughness: 0.7, transparent: true, opacity: 0.82,
      depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    peinture.receiveShadow = true;
    peinture.renderOrder = 2;
    this.scene.add(peinture);
  }

  _eau() {
    const mat = new THREE.MeshStandardMaterial({ color: 0x1d3238, roughness: 0.06, metalness: 0.0, envMapIntensity: 1.4 });
    for (const e of this.d.eau) {
      const pts = [];
      let bas = 1e9;
      for (let i = 0; i < e.p.length; i += 2) { pts.push(new THREE.Vector2(e.p[i], -e.p[i + 1])); bas = Math.min(bas, this.hauteur(e.p[i], e.p[i + 1])); }
      if (pts.length < 3) continue;
      const g = new THREE.ShapeGeometry(new THREE.Shape(pts));
      g.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.y = bas + 0.12;
      this.scene.add(m);
    }
  }

  // ------------------------------------------------------------------ bâtiments (générés dans Blender depuis la BD TOPO)
  async _batiments() {
    let gltf;
    try {
      gltf = await chargeurGLTF().loadAsync('modeles/batiments.glb');
    } catch (e) {
      console.warn('Bâtiments absents :', e.message);
      return;
    }
    const platMat = new THREE.MeshStandardMaterial({ map: this.orthoLeger, roughness: 0.95 });
    gltf.scene.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = o.receiveShadow = true;
      if (o.material.name === 'toit_plat') o.material = platMat;
      else {
        if (o.material.map) o.material.map.anisotropy = this.aniso;
        if (o.material.name === 'tuiles') o.material.side = THREE.DoubleSide;
        o.material.envMapIntensity = 0.9;
      }
    });
    this.scene.add(gltf.scene);
    this.batiments = gltf.scene;
  }

  // ------------------------------------------------------------------ végétation : arbres « imposteurs » (photos de vrais modèles 3D)
  async _vegetation() {
    let info;
    try {
      info = await (await fetch('textures/arbres.json')).json();
    } catch (e) {
      console.warn('Arbres absents');
      return;
    }
    const [carte, carteN] = await Promise.all([this.texture('textures/arbres.png'), this.texture('textures/arbres_n.png', { lineaire: true }).catch(() => null)]);
    const rnd = alea(12345);
    const esp = info.especes;                                     // [{ u0, u1, hauteur, largeur, poids, zones }]
    const places = esp.map(() => []);
    const max = this.leger ? 2500 : 9000;
    let total = 0;
    const surface = (p) => { let s = 0; for (let i = 0, j = p.length - 2; i < p.length; j = i, i += 2) s += p[j] * p[i + 1] - p[i] * p[j + 1]; return Math.abs(s) / 2; };
    for (const v of this.d.vegetation) {
      const dens = /Forêt fermée/.test(v.n) ? 1 / 55 : /Bois|Forêt ouverte/.test(v.n) ? 1 / 80 : /Haie/.test(v.n) ? 1 / 30 : /Verger/.test(v.n) ? 1 / 45 : 0;
      if (!dens) continue;
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let i = 0; i < v.p.length; i += 2) { x0 = Math.min(x0, v.p[i]); x1 = Math.max(x1, v.p[i]); z0 = Math.min(z0, v.p[i + 1]); z1 = Math.max(z1, v.p[i + 1]); }
      const nb = Math.min(700, Math.ceil(surface(v.p) * dens));
      const candidats = esp.map((e, k) => (new RegExp(e.zones).test(v.n) ? k : -1)).filter((k) => k >= 0);
      if (!candidats.length) continue;
      for (let k = 0, essais = 0; k < nb && essais < nb * 6 && total < max; essais++) {
        const x = x0 + rnd() * (x1 - x0), z = z0 + rnd() * (z1 - z0);
        if (!dansPolygone(x, z, v.p)) continue;
        const rp = this.routeProche(x, z, 14);
        if (rp && rp.d < rp.r.w / 2 + 2.2) continue;
        if (this.collision(x, z, 1.5)) continue;
        places[candidats[Math.floor(rnd() * candidats.length)]].push([x, z, 0.75 + rnd() * 0.6, rnd() * Math.PI]);
        k++; total++;
      }
    }
    // deux plans croisés par arbre, fusionnés par dalles de 275 m (pour n'afficher que les arbres visibles)
    const D = 275, dalles = new Map();
    esp.forEach((e, ei) => {
      for (const [x, z, s, a] of places[ei]) {
        const cle = Math.floor(x / D) + ',' + Math.floor(z / D);
        if (!dalles.has(cle)) dalles.set(cle, { P: [], UV: [], N: [], I: [] });
        const t = dalles.get(cle), y = this.hauteur(x, z) - 0.15, hh = e.hauteur * s, dl = (e.largeur * s) / 2;
        for (let k = 0; k < 2; k++) {
          const ca = Math.cos(a + (k * Math.PI) / 2), sa = Math.sin(a + (k * Math.PI) / 2), b = t.P.length / 3;
          t.P.push(x - ca * dl, y, z - sa * dl, x + ca * dl, y, z + sa * dl, x + ca * dl, y + hh, z + sa * dl, x - ca * dl, y + hh, z - sa * dl);
          t.UV.push(e.u0, 0, e.u1, 0, e.u1, 1, e.u0, 1);
          // normales « gonflées » vers l'extérieur et le haut : éclairage doux, comme un volume
          for (const [sx, sy] of [[-1, 0.25], [1, 0.25], [1, 1], [-1, 1]]) { const l = Math.hypot(sx * 0.7, sy + 0.4); t.N.push((ca * sx * 0.7) / l, (sy + 0.4) / l, (sa * sx * 0.7) / l); }
          t.I.push(b, b + 1, b + 2, b, b + 2, b + 3);
        }
      }
    });
    const mat = new THREE.MeshStandardMaterial({ map: carte, alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.9, metalness: 0, envMapIntensity: 0.7 });
    const ombre = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: carte, alphaTest: 0.42 });
    for (const t of dalles.values()) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(t.P, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(t.UV, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(t.N, 3));
      g.setIndex(t.I);
      const m = new THREE.Mesh(g, mat);
      m.castShadow = true;
      m.customDepthMaterial = ombre;
      this.scene.add(m);
    }
    this.nbArbres = total;
  }
}
