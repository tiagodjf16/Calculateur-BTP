// Affichage en conduite : tableau de bord (vitesse, carburant, témoins), GPS, bandeau d'intervention, messages.
import { $, clamp, formatTemps } from './outils.js';

const RAD = Math.PI / 180;

export class Hud {
  constructor(monde) {
    this.monde = monde;
    this.tb = $('#tableau');
    this.gps = $('#gps');
    this.g = this.tb.getContext('2d');
    this.gg = this.gps.getContext('2d');
    this.carte = new Image();
    this.carte.src = 'data/ortho.jpg';
    this.trajet = null;
    this.cible = null;
    this.zoom = 420;                 // mètres visibles sur le GPS
    this.t = 0;
    this._taille();
    addEventListener('resize', () => this._taille());
  }

  _taille() {
    const r = Math.min(2, window.devicePixelRatio || 1);
    this._aRevoir = false;
    // la hauteur du tableau de bord suit exactement sa largeur : compact (téléphone) ou à aiguilles
    const lt = this.tb.getBoundingClientRect().width;
    if (lt >= 2) this.tb.style.height = Math.round(lt * (lt < 470 && document.documentElement.dataset.mode === 'tactile' ? 0.235 : 0.3)) + 'px';
    for (const c of [this.tb, this.gps]) {
      const b = c.getBoundingClientRect();
      if (b.width < 2 || b.height < 2) { this._aRevoir = true; continue; }       // masqué : on y reviendra
      const w = Math.round(b.width * r), hh = Math.round(b.height * r);
      if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; }
    }
  }

  annonce(titre, texte = '', duree = 5) {
    const a = $('#annonce');
    a.innerHTML = `<b>${titre}</b>${texte ? `<span>${texte}</span>` : ''}`;
    a.classList.add('visible');
    clearTimeout(this._ta);
    this._ta = setTimeout(() => a.classList.remove('visible'), duree * 1000);
  }

  /** Bandeau d'action du moment. `action` : vrai s'il déclenche quelque chose (touche F, ou appui sur le bandeau). */
  aide(texte, action = true) {
    const a = $('#action');
    if (!texte) { if (!a.hidden) a.hidden = true; this._aide = null; return; }
    if (this._aide !== texte) { this._aide = texte; a.innerHTML = texte; }
    a.classList.toggle('info', !action);
    if (a.hidden) a.hidden = false;
  }

  mission(etat, titre, texte, chrono) {
    $('#m-etat').textContent = etat;
    $('#m-etat').dataset.etat = etat;
    $('#m-titre').textContent = titre;
    $('#m-texte').innerHTML = texte;
    $('#m-chrono').textContent = chrono == null ? '' : formatTemps(chrono);
  }

  /** Destination du GPS : { x, z, nom } ou null. */
  destination(cible, vehicule) {
    this.cible = cible;
    this.trajet = cible ? this.monde.itineraire(vehicule.x, vehicule.z, cible.x, cible.z) : null;
    this.recalcul = 0;
  }

  maj(dt, v, etat) {
    this.t += dt;
    if (this._aRevoir) this._taille();
    this._tableau(v, etat);
    this.img = (this.img || 0) + 1;
    if (this.img % 2 === 0) this._gps(v, dt * 2);
  }

  // ------------------------------------------------------------------ tableau de bord
  _tableau(v, etat) {
    const g = this.g, W = this.tb.width, H = this.tb.height, k = H / 200;
    if (W < 4 || H < 4) return;
    if (H / W < 0.27) { this._compact(v, etat); return; }         // téléphone : tableau de bord compact
    g.setTransform(k, 0, 0, k, 0, 0);
    const w = W / k;
    g.clearRect(0, 0, w, 200);
    // fond du combiné
    const fond = g.createLinearGradient(0, 0, 0, 200);
    fond.addColorStop(0, 'rgba(14,16,20,0.94)');
    fond.addColorStop(1, 'rgba(4,5,7,0.97)');
    g.fillStyle = fond;
    this._rr(g, 4, 14, w - 8, 182, 26);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.lineWidth = 1.5;
    g.stroke();
    const cxG = 108, cxD = w - 108, cy = 108, R = 84;
    // ---- compteur de vitesse
    this._cadran(g, cxG, cy, R, 0, 180, 10, 20, v.vitesseKmh, (n) => n);
    g.fillStyle = '#e9edf2'; g.textAlign = 'center';
    g.font = '600 26px system-ui'; g.fillText(Math.round(v.vitesseKmh), cxG, cy + 46);
    g.font = '10px system-ui'; g.fillStyle = '#8b95a1'; g.fillText('km/h', cxG, cy + 60);
    // ---- jauge de carburant
    const niveau = v.carburant / v.reservoir;
    g.lineCap = 'butt';
    g.lineWidth = 3;
    g.strokeStyle = '#3a414b';
    g.beginPath(); g.arc(cxD, cy, R - 4, 180 * RAD, 360 * RAD); g.stroke();
    g.strokeStyle = '#c0392b';
    g.beginPath(); g.arc(cxD, cy, R - 4, 180 * RAD, 204 * RAD); g.stroke();
    for (let i = 0; i <= 8; i++) {
      const a = (180 + i * 22.5) * RAD, long = i % 2 ? 7 : 13;
      g.strokeStyle = i < 2 ? '#e74c3c' : '#dfe4ea'; g.lineWidth = i % 2 ? 1.5 : 2.5;
      g.beginPath(); g.moveTo(cxD + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); g.lineTo(cxD + Math.cos(a) * (R - 8 - long), cy + Math.sin(a) * (R - 8 - long)); g.stroke();
    }
    g.fillStyle = '#dfe4ea'; g.font = '600 13px system-ui';
    g.fillText('0', cxD - R + 34, cy + 5); g.fillText('1/2', cxD, cy - R + 38); g.fillText('1', cxD + R - 34, cy + 5);
    this._pompe(g, cxD - 9, cy - 34, niveau < 0.15 ? (Math.floor(this.t * 2) % 2 ? '#ffb020' : '#7a5510') : '#8b95a1');
    this._aiguille(g, cxD, cy, R - 16, (180 + clamp(niveau, 0, 1) * 180) * RAD);
    g.fillStyle = '#e9edf2'; g.font = '600 17px system-ui'; g.textAlign = 'center';
    g.fillText(`${v.carburant.toFixed(0)} L`, cxD, cy + 38);
    g.font = '10px system-ui'; g.fillStyle = niveau < 0.15 ? '#ffb020' : '#8b95a1';
    g.fillText(niveau < 0.15 ? 'RÉSERVE — faire le plein' : 'gazole', cxD, cy + 54);
    // ---- afficheur central
    const mx = w / 2;
    g.fillStyle = 'rgba(120,170,255,0.06)';
    this._rr(g, mx - 92, 34, 184, 92, 10); g.fill();
    g.fillStyle = '#f4f6f8'; g.font = '700 40px system-ui'; g.textAlign = 'center';
    g.fillText(v.moteur ? v.rapport : '—', mx, 80);
    g.font = '11px system-ui'; g.fillStyle = '#8b95a1';
    g.fillText(v.moteur ? 'boîte automatique' : document.documentElement.dataset.mode === 'tactile' ? 'moteur arrêté' : 'moteur arrêté — touche M', mx, 98);
    g.font = '12px system-ui'; g.fillStyle = '#c9d1da';
    const h = new Date();
    g.textAlign = 'left'; g.fillText(`${v.km.toFixed(1)} km`, mx - 84, 118);
    g.textAlign = 'right'; g.fillText(`${String(h.getHours()).padStart(2, '0')}:${String(h.getMinutes()).padStart(2, '0')}`, mx + 84, 118);
    // ---- témoins
    const temoins = this._temoins(v, etat);
    const x0 = mx - (temoins.length * 31) / 2;
    temoins.forEach(([nom, on, coul], i) => this._temoin(g, nom, x0 + i * 31 + 15, 152, on ? coul : '#2a2f37', on));
    this._fleches(g, v, mx, 60, 118, 1);
  }

  _temoins(v, etat) {
    const clign = Math.floor(this.t * 2.6) % 2 === 0;
    return [
      ['ceinture', !v.ceinture, v.moteur && !v.ceinture && v.vitesseKmh > 5 ? (clign ? '#ff3b30' : '#5a1512') : '#ff3b30'],
      ['frein', v.freinMain, '#ff3b30'],
      ['moteur', !v.moteur, '#ffb020'],
      ['codes', v.codes, '#30d158'],
      ['gyro', v.gyro, clign ? '#3d8bff' : '#1d4fb0'],
      ['sirene', v.deuxTons, '#3d8bff'],
      ['balisage', v.balisage, '#ffb020'],
      ['porte', etat.porteOuverte, '#ff3b30'],
    ];
  }

  /** Flèches des clignotants, de part et d'autre de x. */
  _fleches(g, v, mx, y, ecart, e) {
    for (const s of [-1, 1]) {
      const on = (v.clignotant === s || v.clignotant === 2) && v.cliAllume;
      g.fillStyle = on ? '#30d158' : '#232830';
      const x = mx + s * ecart;
      g.beginPath();
      g.moveTo(x + s * 13 * e, y); g.lineTo(x, y - 11 * e); g.lineTo(x, y - 5 * e); g.lineTo(x - s * 11 * e, y - 5 * e); g.lineTo(x - s * 11 * e, y + 5 * e); g.lineTo(x, y + 5 * e); g.lineTo(x, y + 11 * e);
      g.closePath(); g.fill();
    }
  }

  /** Tableau de bord compact (téléphone) : vitesse, rapport, carburant, témoins. 400 × 94 unités. */
  _compact(v, etat) {
    const g = this.g, W = this.tb.width, H = this.tb.height, k = H / 94, w = W / k, mx = w / 2;
    g.setTransform(k, 0, 0, k, 0, 0);
    g.clearRect(0, 0, w, 94);
    const fond = g.createLinearGradient(0, 0, 0, 94);
    fond.addColorStop(0, 'rgba(14,16,20,0.93)');
    fond.addColorStop(1, 'rgba(4,5,7,0.97)');
    g.fillStyle = fond;
    this._rr(g, 1, 1, w - 2, 92, 18);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.13)'; g.lineWidth = 1.2; g.stroke();
    g.textBaseline = 'alphabetic';
    // vitesse
    g.fillStyle = '#f4f6f8'; g.textAlign = 'right'; g.font = '700 42px system-ui';
    g.fillText(Math.round(v.vitesseKmh), 84, 48);
    g.textAlign = 'left'; g.font = '600 12px system-ui'; g.fillStyle = '#8b95a1';
    g.fillText('km/h', 89, 48);
    // rapport de boîte et clignotants
    g.fillStyle = 'rgba(120,170,255,0.10)';
    this._rr(g, mx - 25, 10, 50, 44, 10); g.fill();
    g.fillStyle = '#f4f6f8'; g.textAlign = 'center'; g.font = '700 33px system-ui';
    g.fillText(v.moteur ? v.rapport : '—', mx, 44);
    this._fleches(g, v, mx, 32, 46, 0.85);
    // carburant
    const niveau = clamp(v.carburant / v.reservoir, 0, 1), reserve = niveau < 0.15, clign = Math.floor(this.t * 2) % 2 === 0;
    const bx = w - 106, bw = 92, coul = reserve ? (clign ? '#ffb020' : '#7a5510') : '#dfe4ea';
    this._pompe(g, bx - 24, 13, reserve ? coul : '#8b95a1', false);
    g.fillStyle = '#2a2f37'; this._rr(g, bx, 17, bw, 9, 4.5); g.fill();
    g.fillStyle = coul; this._rr(g, bx, 17, Math.max(9, bw * niveau), 9, 4.5); g.fill();
    g.textAlign = 'right'; g.font = '600 16px system-ui'; g.fillStyle = reserve ? '#ffb020' : '#e9edf2';
    g.fillText(`${v.carburant.toFixed(0)} L`, w - 14, 48);
    if (reserve) { g.textAlign = 'left'; g.font = '700 9.5px system-ui'; g.fillText('RÉSERVE', bx - 24, 47); }
    // témoins
    const temoins = this._temoins(v, etat), pas = 36, x0 = mx - (temoins.length * pas) / 2;
    temoins.forEach(([nom, on, c], i) => this._temoin(g, nom, x0 + i * pas + pas / 2, 74, on ? c : '#2a2f37', on, 0.92));
  }

  _rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  _cadran(g, cx, cy, R, min, max, petit, grand, valeur, etiquette) {
    const a0 = 135, balayage = 270;
    g.lineWidth = 3; g.strokeStyle = '#3a414b';
    g.beginPath(); g.arc(cx, cy, R - 4, a0 * RAD, (a0 + balayage) * RAD); g.stroke();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let n = min; n <= max; n += petit) {
      const a = (a0 + ((n - min) / (max - min)) * balayage) * RAD, majeur = n % grand === 0;
      g.strokeStyle = n >= 130 ? '#e74c3c' : '#dfe4ea'; g.lineWidth = majeur ? 2.5 : 1.2;
      const l = majeur ? 12 : 6;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); g.lineTo(cx + Math.cos(a) * (R - 8 - l), cy + Math.sin(a) * (R - 8 - l)); g.stroke();
      if (majeur) { g.fillStyle = '#dfe4ea'; g.font = '600 11px system-ui'; g.fillText(etiquette(n), cx + Math.cos(a) * (R - 31), cy + Math.sin(a) * (R - 31)); }
    }
    g.textBaseline = 'alphabetic';
    this._aiguille(g, cx, cy, R - 14, (a0 + (clamp(valeur, min, max) - min) / (max - min) * balayage) * RAD);
  }

  _aiguille(g, cx, cy, l, a) {
    g.save();
    g.translate(cx, cy); g.rotate(a);
    g.shadowColor = 'rgba(255,60,40,0.7)'; g.shadowBlur = 8;
    g.fillStyle = '#ff4a36';
    g.beginPath(); g.moveTo(-14, -2.4); g.lineTo(l, -0.7); g.lineTo(l, 0.7); g.lineTo(-14, 2.4); g.closePath(); g.fill();
    g.restore();
    g.fillStyle = '#15181d'; g.beginPath(); g.arc(cx, cy, 9, 0, 7); g.fill();
    g.strokeStyle = '#4a515c'; g.lineWidth = 1.5; g.stroke();
  }

  _pompe(g, x, y, coul, fenetre = true) {
    g.fillStyle = coul; g.strokeStyle = coul; g.lineWidth = 1.6;
    g.fillRect(x, y, 11, 15);
    if (fenetre) g.clearRect(x + 2, y + 2, 7, 5); else { g.fillStyle = '#0b0d10'; g.fillRect(x + 2, y + 2, 7, 5); g.fillStyle = coul; }
    g.fillRect(x - 1.5, y + 15, 14, 2);
    g.beginPath(); g.moveTo(x + 11, y + 5); g.lineTo(x + 15, y + 8); g.lineTo(x + 15, y + 14); g.stroke();
  }

  _temoin(g, nom, x, y, coul, on, e = 1) {
    g.save();
    g.translate(x, y);
    g.scale(e, e);
    if (on) { g.shadowColor = coul; g.shadowBlur = 9; }
    g.strokeStyle = coul; g.fillStyle = coul; g.lineWidth = 1.8; g.lineCap = 'round'; g.lineJoin = 'round';
    g.textAlign = 'center';
    if (nom === 'ceinture') {
      g.beginPath(); g.arc(0, -8, 3.4, 0, 7); g.fill();
      g.beginPath(); g.moveTo(-6, 9); g.quadraticCurveTo(-7, -3, 0, -3); g.quadraticCurveTo(7, -3, 6, 9); g.stroke();
      g.lineWidth = 2.6; g.beginPath(); g.moveTo(-6, -1); g.lineTo(6, 8); g.stroke();
    } else if (nom === 'frein') {
      g.beginPath(); g.arc(0, 0, 7.5, 0, 7); g.stroke();
      g.beginPath(); g.arc(0, 0, 11.5, -0.9, 0.9); g.stroke();
      g.beginPath(); g.arc(0, 0, 11.5, Math.PI - 0.9, Math.PI + 0.9); g.stroke();
      g.font = '700 10px system-ui'; g.fillText('P', 0, 3.6);
    } else if (nom === 'moteur') {
      g.beginPath(); g.arc(0, 1, 7.5, -1.0, Math.PI + 1.0); g.stroke();
      g.beginPath(); g.moveTo(0, -10); g.lineTo(0, -1); g.stroke();
    } else if (nom === 'codes') {
      g.beginPath(); g.moveTo(1, -8); g.quadraticCurveTo(12, 0, 1, 8); g.closePath(); g.stroke();
      for (const dy of [-6, -1, 4]) { g.beginPath(); g.moveTo(-3, dy); g.lineTo(-11, dy + 3); g.stroke(); }
    } else if (nom === 'gyro') {
      g.beginPath(); g.moveTo(-6, 7); g.lineTo(-6, 0); g.quadraticCurveTo(-6, -7, 0, -7); g.quadraticCurveTo(6, -7, 6, 0); g.lineTo(6, 7); g.closePath(); g.fill();
      g.fillRect(-9, 7, 18, 2.5);
      for (const a of [-2.4, -1.57, -0.74]) { g.beginPath(); g.moveTo(Math.cos(a) * 10, Math.sin(a) * 10 - 1); g.lineTo(Math.cos(a) * 13.5, Math.sin(a) * 13.5 - 1); g.stroke(); }
    } else if (nom === 'sirene') {
      g.beginPath(); g.moveTo(-9, -3); g.lineTo(-4, -3); g.lineTo(2, -8); g.lineTo(2, 8); g.lineTo(-4, 3); g.lineTo(-9, 3); g.closePath(); g.fill();
      g.beginPath(); g.arc(2, 0, 5.5, -0.9, 0.9); g.stroke();
      g.beginPath(); g.arc(2, 0, 9.5, -0.9, 0.9); g.stroke();
    } else if (nom === 'balisage') {
      g.beginPath(); g.moveTo(0, -9); g.lineTo(10, 8); g.lineTo(-10, 8); g.closePath(); g.stroke();
      g.font = '700 10px system-ui'; g.fillText('!', 0, 5.5);
    } else if (nom === 'porte') {
      g.strokeRect(-6, -9, 12, 18);
      g.beginPath(); g.moveTo(6, -6); g.lineTo(12, -9); g.moveTo(-6, -6); g.lineTo(-12, -9); g.stroke();
    }
    g.restore();
  }

  // ------------------------------------------------------------------ GPS
  _gps(v, dt) {
    const g = this.gg, W = this.gps.width, H = this.gps.height, m = this.monde;
    const ech = W / this.zoom;                           // pixels par mètre
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#20252b';
    g.fillRect(0, 0, W, H);
    g.save();
    g.translate(W / 2, H * 0.62);
    g.rotate(v.cap - Math.PI);
    g.scale(ech, ech);
    g.translate(-v.x, -v.z);
    if (this.carte.complete && this.carte.naturalWidth) {
      g.globalAlpha = 0.92;
      g.drawImage(this.carte, -m.L / 2, -m.H / 2, m.L, m.H);
      g.globalAlpha = 1;
    }
    // itinéraire
    if (this.cible) {
      this.recalcul -= dt;
      if (this.recalcul <= 0) {
        this.recalcul = 2.5;
        const rp = v.route;
        if (!this.trajet || (rp && this._ecartTrajet(v) > 45)) this.trajet = m.itineraire(v.x, v.z, this.cible.x, this.cible.z);
      }
      if (this.trajet) {
        g.lineJoin = 'round'; g.lineCap = 'round';
        g.strokeStyle = 'rgba(20,60,160,0.9)'; g.lineWidth = 11 / ech;
        this._trace(g); g.stroke();
        g.strokeStyle = '#4d9bff'; g.lineWidth = 7 / ech;
        this._trace(g); g.stroke();
      }
      g.fillStyle = '#ff3b30'; g.strokeStyle = '#fff'; g.lineWidth = 2.5 / ech;
      g.beginPath(); g.arc(this.cible.x, this.cible.z, 9 / ech, 0, 7); g.fill(); g.stroke();
    }
    const cs = m.caserne;
    g.fillStyle = '#d6281a'; g.strokeStyle = '#fff'; g.lineWidth = 2 / ech;
    g.fillRect(cs.x - 7 / ech, cs.z - 7 / ech, 14 / ech, 14 / ech); g.strokeRect(cs.x - 7 / ech, cs.z - 7 / ech, 14 / ech, 14 / ech);
    if (m.station) { g.fillStyle = '#ffb020'; g.beginPath(); g.arc(m.station.x, m.station.z, 7 / ech, 0, 7); g.fill(); g.stroke(); }
    g.restore();
    // véhicule (flèche fixe) et habillage
    g.save();
    g.translate(W / 2, H * 0.62);
    const s = W / 230;
    g.fillStyle = '#fff'; g.strokeStyle = '#0b2a6b'; g.lineWidth = 2 * s;
    g.beginPath(); g.moveTo(0, -11 * s); g.lineTo(8 * s, 9 * s); g.lineTo(0, 5 * s); g.lineTo(-8 * s, 9 * s); g.closePath(); g.fill(); g.stroke();
    g.restore();
    // nord
    g.save();
    g.translate(W - 22 * s, 22 * s);
    g.rotate(v.cap - Math.PI);
    g.fillStyle = 'rgba(10,14,20,0.75)'; g.beginPath(); g.arc(0, 0, 14 * s, 0, 7); g.fill();
    g.fillStyle = '#ff4a36'; g.beginPath(); g.moveTo(0, -11 * s); g.lineTo(4.5 * s, 0); g.lineTo(-4.5 * s, 0); g.closePath(); g.fill();
    g.fillStyle = '#dfe4ea'; g.beginPath(); g.moveTo(0, 11 * s); g.lineTo(4.5 * s, 0); g.lineTo(-4.5 * s, 0); g.closePath(); g.fill();
    g.restore();
    // bandeau : rue et distance
    const rue = v.route && v.route.r.nom ? v.route.r.nom : '';
    let bas = rue;
    if (this.cible) {
      const d = this._reste(v);
      bas = `${d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m'} · ${this.cible.nom}`;
    }
    $('#gps-rue').textContent = rue || '—';
    $('#gps-cible').textContent = this.cible ? bas : 'Aucune destination';
  }

  _trace(g) {
    g.beginPath();
    this.trajet.forEach(([x, z], i) => (i ? g.lineTo(x, z) : g.moveTo(x, z)));
  }

  _ecartTrajet(v) {
    let md = 1e9;
    for (const [x, z] of this.trajet) md = Math.min(md, Math.hypot(x - v.x, z - v.z));
    return md;
  }

  _reste(v) {
    if (!this.trajet) return Math.hypot(this.cible.x - v.x, this.cible.z - v.z);
    // distance le long de l'itinéraire à partir du point le plus proche
    let k = 0, md = 1e9;
    this.trajet.forEach(([x, z], i) => { const d = Math.hypot(x - v.x, z - v.z); if (d < md) { md = d; k = i; } });
    let d = 0;
    for (let i = k; i + 1 < this.trajet.length; i++) d += Math.hypot(this.trajet[i + 1][0] - this.trajet[i][0], this.trajet[i + 1][1] - this.trajet[i][1]);
    return d;
  }
}
