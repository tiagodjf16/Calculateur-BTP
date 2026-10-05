/* ============================================================
   BUREAU 3D : en-tête de l'espace club
   Le tableau tactique du coach posé sur une table en bois, sous une lampe :
   les aimants des deux équipes, les flèches tracées au feutre qui se dessinent
   et l'action qui se joue (passe, appel, centre, frappe), en boucle.
   Rendu en temps réel (WebGL, sans bibliothèque) : objets calculés exactement
   (pas d'approximation), ombres douces, reflets, puis flou de mise au point.
   Si le navigateur ne sait pas faire de 3D, l'en-tête garde un fond dégradé.
   ============================================================ */
(() => {
  "use strict";
  const hero = document.querySelector("#p-espace .titre-page");
  if (!hero || hero.querySelector(".esp-3d")) return;
  hero.classList.add("esp-hero");
  const voile = document.createElement("div"); voile.className = "esp-hero-voile"; voile.setAttribute("aria-hidden", "true");
  const cv = document.createElement("canvas"); cv.className = "esp-3d"; cv.setAttribute("aria-hidden", "true");
  hero.prepend(voile); hero.prepend(cv);
  const sans3d = () => { cv.remove(); hero.classList.add("esp-hero-sans3d"); };
  let gl = null;
  try { gl = cv.getContext("webgl", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" }); } catch(e){}
  if (!gl) return sans3d();
  const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tactile = matchMedia("(pointer: coarse)").matches;

  const VS = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

  /* ---------- passe 1 : la scène ---------- */
  const FS_SCENE = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime, uFocal, uLens, uFocus, uAper, uExpo;
uniform vec3 uCam, uCR, uCU, uCF;
uniform vec4 uMag[22];
uniform vec3 uBall;
uniform mat3 uBallRot;
uniform vec2 uArr[12];
uniform float uArrT[4];
uniform float uArrA;

const float BX = 1.0, BZ = 0.64, BY = 0.035, FW = 0.04;
const float MR = 0.036, MH = 0.021, RB = 0.016;
const vec3 LP = vec3(-1.25, 2.5, 1.15);
const vec3 KEYCOL = vec3(1.0, 0.88, 0.74) * 8.0;
const vec3 FILLCOL = vec3(0.22, 0.34, 0.72) * 0.55;
const vec3 FILLDIR = vec3(0.62, 0.47, -0.63);
const vec3 SPOTDIR = vec3(0.4433, -0.8312, -0.3369);
const vec3 W0 = vec3(1.16, 0.0, 0.30), W1 = vec3(1.27, 0.0, 0.22), W2 = vec3(1.31, 0.0, 0.19);
const float WR = 0.026, WR2 = 0.011;
const vec3 P0 = vec3(0.98, 0.0, 0.78), P1 = vec3(1.36, 0.0, 0.58);
const float PR = 0.018;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bruit(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * bruit(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float sdBox2(vec2 p, vec2 b){ vec2 d = abs(p) - b; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }

/* ----- intersections exactes ----- */
float iSphere(vec3 ro, vec3 rd, vec3 c, float r){ vec3 oc = ro - c; float b = dot(oc, rd), h = b * b - dot(oc, oc) + r * r; if (h < 0.0) return -1.0; return -b - sqrt(h); }
float iCaps(vec3 ro, vec3 rd, vec3 pa, vec3 pb, float ra){
  vec3 ba = pb - pa, oa = ro - pa;
  float baba = dot(ba, ba), bard = dot(ba, rd), baoa = dot(ba, oa), rdoa = dot(rd, oa), oaoa = dot(oa, oa);
  float a = baba - bard * bard, b = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - ra * ra * baba, h = b * b - a * c;
  if (h >= 0.0){
    float t = (-b - sqrt(h)) / a, y = baoa + t * bard;
    if (y > 0.0 && y < baba) return t;
    vec3 oc = (y <= 0.0) ? oa : ro - pb;
    b = dot(rd, oc); c = dot(oc, oc) - ra * ra; h = b * b - c;
    if (h > 0.0) return -b - sqrt(h);
  }
  return -1.0;
}
vec3 nCaps(vec3 p, vec3 a, vec3 b, float r){ vec3 ba = b - a, pa = p - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return (pa - h * ba) / r; }
/* aimant : cylindre vertical posé sur le tableau, bord arrondi simulé par la normale */
float iMag(vec3 ro, vec3 rd, vec2 c, out vec3 n){
  float y1 = BY + MH, best = 1e9;
  vec2 oc = ro.xz - c;
  float tc = (y1 - ro.y) / rd.y;
  if (tc > 0.0){ vec2 q = oc + tc * rd.xz; if (dot(q, q) < MR * MR){ best = tc; float e = smoothstep(MR - 0.006, MR, length(q)); n = normalize(vec3(q.x / MR * e * 1.4, 1.0, q.y / MR * e * 1.4)); } }
  float a = dot(rd.xz, rd.xz), b = dot(oc, rd.xz), cc = dot(oc, oc) - MR * MR, h = b * b - a * cc;
  if (h > 0.0){
    float ts = (-b - sqrt(h)) / a, y = ro.y + ts * rd.y;
    if (ts > 0.0 && ts < best && y > BY && y < y1){ best = ts; vec2 q = (oc + ts * rd.xz) / MR; float e = smoothstep(y1 - 0.006, y1, y); n = normalize(vec3(q.x, e * 1.6, q.y)); }
  }
  return best < 1e8 ? best : -1.0;
}
/* ombre douce d'un segment épais (aimant, sifflet, feutre, ballon) vue depuis p vers la lampe */
float ombreSeg(vec3 ro, vec3 rd, vec3 a, vec3 b, float r, float k){
  vec3 ba = b - a, oa = ro - a;
  float baba = dot(ba, ba), bard = dot(ba, rd), rdoa = dot(rd, oa), baoa = dot(ba, oa);
  float den = baba - bard * bard;
  float s = den > 1e-7 ? clamp((baoa - rdoa * bard) / den, 0.0, 1.0) : 0.0;
  float t = max(s * bard - rdoa, 0.0);
  s = baba > 1e-7 ? clamp(dot(oa + t * rd, ba) / baba, 0.0, 1.0) : 0.0;
  float d = length(oa + t * rd - s * ba);
  float w = k * t + 0.0015;
  return smoothstep(0.0, 1.0, clamp((d - r + w) / (2.0 * w), 0.0, 1.0));
}

/* ----- le ciel de la pièce, pour les reflets ----- */
vec3 piece(vec3 d, float rough){
  vec3 c = mix(vec3(0.006, 0.008, 0.016), vec3(0.03, 0.04, 0.07), clamp(d.y * 0.6 + 0.4, 0.0, 1.0));
  float s = max(dot(d, -SPOTDIR), 0.0);
  c += vec3(1.0, 0.86, 0.68) * (pow(s, mix(90.0, 6.0, rough)) * mix(9.0, 0.6, rough) + pow(s, 6.0) * 0.18);
  float w = max(dot(d, normalize(vec3(0.85, 0.42, -0.55))), 0.0);
  c += vec3(0.28, 0.42, 0.9) * pow(w, mix(40.0, 4.0, rough)) * mix(1.6, 0.25, rough);
  return c;
}

/* ----- éclairage : lampe (ombres douces), lumière froide, ambiance, reflets ----- */
vec3 eclaire(vec3 p, vec3 n, vec3 v, vec3 alb, float rough, float metal, float ao, float sh){
  vec3 L = LP - p; float dist = length(L); L /= dist;
  float spot = smoothstep(0.78, 0.985, dot(-L, SPOTDIR));
  float att = 9.2 / (dist * dist);
  float ndl = max(dot(n, L), 0.0), ndv = max(dot(n, v), 1e-3);
  vec3 h = normalize(L + v);
  float ndh = max(dot(n, h), 0.0), a = max(rough * rough, 0.003), a2 = a * a;
  float dd = ndh * ndh * (a2 - 1.0) + 1.0, D = a2 / (3.14159 * dd * dd);
  vec3 F0 = mix(vec3(0.04), alb, metal);
  vec3 F = F0 + (1.0 - F0) * pow(1.0 - max(dot(v, h), 0.0), 5.0);
  float k = (rough + 1.0) * (rough + 1.0) / 8.0;
  float G = 1.0 / ((ndl * (1.0 - k) + k) * (ndv * (1.0 - k) + k));
  vec3 spec = D * F * G * 0.25;
  vec3 kd = (1.0 - F) * (1.0 - metal);
  vec3 col = (kd * alb / 3.14159 + spec) * ndl * KEYCOL * spot * att * sh;
  float ndf = max(dot(n, normalize(FILLDIR)), 0.0);
  col += (alb * (1.0 - metal) + F0 * 0.6) * ndf * FILLCOL * (0.35 + 0.65 * ao);
  col += alb * (1.0 - metal) * mix(vec3(0.010, 0.012, 0.018), vec3(0.05, 0.06, 0.09), n.y * 0.5 + 0.5) * ao;
  vec3 Fr = F0 + (max(vec3(1.0 - rough), F0) - F0) * pow(1.0 - ndv, 5.0);
  col += piece(reflect(-v, n), rough) * Fr * ao * mix(0.35, 1.0, sh);
  return col;
}

/* ----- ombres et occlusion sur un point ----- */
float ombres(vec3 p, int moi){
  vec3 L = normalize(LP - p);
  float sh = 1.0;
  if (p.y < BY - 0.001){                                         // le tableau sur la table
    float t = (BY * 0.5 - p.y) / L.y; vec2 q = p.xz + t * L.xz;
    float w = 0.06 * t + 0.003;
    sh *= smoothstep(-w, w, sdBox2(q, vec2(BX, BZ)));
  }
  for (int i = 0; i < 22; i++){
    if (i == moi) continue;
    vec4 m = uMag[i];
    sh *= ombreSeg(p, L, vec3(m.x, BY + 0.004, m.y), vec3(m.x, BY + MH - 0.004, m.y), MR - 0.002, 0.05);
  }
  sh *= ombreSeg(p, L, vec3(uBall.x, BY + RB, uBall.y), vec3(uBall.x, BY + RB, uBall.y), RB, 0.05);
  sh *= ombreSeg(p, L, W0 + vec3(0.0, WR, 0.0), W1 + vec3(0.0, WR, 0.0), WR, 0.05);
  sh *= ombreSeg(p, L, W1 + vec3(0.0, WR2, 0.0), W2 + vec3(0.0, WR2, 0.0), WR2, 0.05);
  sh *= ombreSeg(p, L, P0 + vec3(0.0, PR, 0.0), P1 + vec3(0.0, PR, 0.0), PR, 0.05);
  return sh;
}
float occlusion(vec3 p){
  float ao = 1.0;
  if (p.y < BY + 0.003){
    for (int i = 0; i < 22; i++){ float d = length(p.xz - uMag[i].xy) - MR; ao *= 1.0 - 0.55 * exp(-max(d, 0.0) * 70.0) * step(BY - 0.002, p.y); }
    ao *= 1.0 - 0.6 * exp(-max(length(p - vec3(uBall.x, BY + RB, uBall.y)) - RB, 0.0) * 90.0);
  }
  if (p.y < 0.003){
    float d = sdBox2(p.xz, vec2(BX, BZ));
    ao *= mix(0.35, 1.0, smoothstep(0.0, 0.07, d));
    ao *= 1.0 - 0.55 * exp(-max(length(p - (W0 + vec3(0.0, WR, 0.0))) - WR, 0.0) * 60.0);
    float dp = length(nCaps(p, P0 + vec3(0.0, PR, 0.0), P1 + vec3(0.0, PR, 0.0), PR)) * PR - PR;
    ao *= 1.0 - 0.5 * exp(-max(dp, 0.0) * 80.0);
  }
  return ao;
}

/* ----- le feutre vert : pelouse tondue, lignes du terrain, flèches au feutre ----- */
float lignesTerrain(vec2 q){
  float w = 0.0028, d = 1e3;
  d = min(d, abs(sdBox2(q, vec2(0.92, 0.58))));
  d = min(d, abs(q.x));
  d = min(d, abs(length(q) - 0.160));
  d = min(d, length(q) - 0.006 + w);
  vec2 s = vec2(abs(q.x), q.y);
  d = min(d, abs(sdBox2(s - vec2(0.92 - 0.1445, 0.0), vec2(0.1445, 0.353))));
  d = min(d, abs(sdBox2(s - vec2(0.92 - 0.048, 0.0), vec2(0.048, 0.1605))));
  d = min(d, length(s - vec2(0.727, 0.0)) - 0.005 + w);
  float arc = abs(length(s - vec2(0.727, 0.0)) - 0.160);
  d = min(d, s.x < 0.6315 ? arc : 1e3);
  d = min(d, abs(sdBox2(s - vec2(0.938, 0.0), vec2(0.018, 0.064))));
  vec2 c = vec2(s.x, abs(s.y)) - vec2(0.92, 0.58);
  d = min(d, (c.x < 0.0 && c.y < 0.0) ? abs(length(c) - 0.017) : 1e3);
  return 1.0 - smoothstep(w - 0.0012, w + 0.0012, d);
}
vec2 bez(vec2 a, vec2 b, vec2 c, float t){ return mix(mix(a, b, t), mix(b, c, t), t); }
vec4 fleches(vec2 q){                                            // rgb : encre, a : couverture
  vec4 res = vec4(0.0);
  for (int k = 0; k < 4; k++){
    float rev = 0.0; vec2 a = vec2(0.0), b = vec2(0.0), c = vec2(0.0);
    if (k == 0){ rev = uArrT[0]; a = uArr[0]; b = uArr[1]; c = uArr[2]; }
    else if (k == 1){ rev = uArrT[1]; a = uArr[3]; b = uArr[4]; c = uArr[5]; }
    else if (k == 2){ rev = uArrT[2]; a = uArr[6]; b = uArr[7]; c = uArr[8]; }
    else { rev = uArrT[3]; a = uArr[9]; b = uArr[10]; c = uArr[11]; }
    if (rev <= 0.001) continue;
    bool tiret = (k == 0 || k == 3);
    vec3 encre = tiret ? vec3(0.82, 0.84, 0.86) : vec3(0.95, 0.62, 0.08);
    float dmin = 1e3, acc = 0.0, sMin = 0.0;
    vec2 prev = a;
    for (int i = 1; i <= 10; i++){
      float t = float(i) / 10.0;
      if (t > rev + 0.1) break;
      vec2 cur = bez(a, b, c, min(t, rev));
      vec2 pa = q - prev, ba = cur - prev; float l = length(ba);
      float h = clamp(dot(pa, ba) / max(l * l, 1e-6), 0.0, 1.0);
      float d = length(pa - ba * h);
      if (d < dmin){ dmin = d; sMin = acc + h * l; }
      acc += l; prev = cur;
    }
    float on = 1.0;
    if (tiret) on = step(fract(sMin / 0.042), 0.58);
    float cov = (1.0 - smoothstep(0.0032, 0.0052, dmin)) * on;
    if (rev > 0.97){                                             // pointe de flèche
      vec2 dir = normalize(c - b), per = vec2(-dir.y, dir.x), r = q - c;
      float al = dot(r, dir), ac = abs(dot(r, per));
      float tri = step(-0.04, al) * step(al, 0.004) * step(ac, (al + 0.04) / 0.044 * 0.019);
      cov = max(cov, tri * smoothstep(0.97, 1.0, rev));
    }
    cov *= 0.9 * uArrA;
    res.rgb = mix(res.rgb, encre, cov); res.a = max(res.a, cov);
  }
  return res;
}

/* ----- le ballon du tableau : panneaux noirs aux sommets d'un icosaèdre ----- */
float panneaux(vec3 d){
  const float P = 1.618034;
  float m = 0.0;
  m = max(m, abs(dot(d, normalize(vec3(0.0, 1.0, P)))));
  m = max(m, abs(dot(d, normalize(vec3(0.0, 1.0, -P)))));
  m = max(m, abs(dot(d, normalize(vec3(1.0, P, 0.0)))));
  m = max(m, abs(dot(d, normalize(vec3(-1.0, P, 0.0)))));
  m = max(m, abs(dot(d, normalize(vec3(P, 0.0, 1.0)))));
  m = max(m, abs(dot(d, normalize(vec3(-P, 0.0, 1.0)))));
  return smoothstep(0.925, 0.94, m);
}

/* ----- la table en noyer ----- */
vec3 bois(vec2 q, out float vernis){
  float lame = floor((q.y + 3.0) / 0.34);
  vec2 w = vec2(q.x * 1.6 + hash(vec2(lame, 3.1)) * 40.0, q.y * 30.0);
  float g = fbm(vec2(w.x * 0.5, w.y * 0.22 + sin(w.x * 0.7 + lame) * 0.5));
  float veine = 0.5 + 0.5 * sin(q.y * 95.0 + g * 9.0 + lame * 4.0);
  vec3 c = mix(vec3(0.030, 0.013, 0.006), vec3(0.105, 0.050, 0.022), veine * 0.55 + g * 0.45);
  c *= 0.8 + 0.4 * hash(vec2(lame, 7.7));
  float f = fract((q.y + 3.0) / 0.34), joint = min(f, 1.0 - f) * 0.34;
  c *= mix(0.3, 1.0, smoothstep(0.0, 0.0025, joint));
  vernis = 0.28 + 0.2 * fbm(q * 9.0);
  return c;
}
/* cordon du sifflet posé sur la table (relief simulé) */
float cordon(vec2 q, out vec3 nn){
  vec2 pts0 = vec2(1.33, 0.18), pts1 = vec2(1.42, 0.08), pts2 = vec2(1.50, 0.12), pts3 = vec2(1.56, 0.30), pts4 = vec2(1.52, 0.52), pts5 = vec2(1.60, 0.74);
  float d = 1e3; vec2 cp = q;
  vec2 A[6]; A[0] = pts0; A[1] = pts1; A[2] = pts2; A[3] = pts3; A[4] = pts4; A[5] = pts5;
  for (int i = 0; i < 5; i++){
    vec2 a = A[i], b = A[i + 1], pa = q - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    vec2 c = a + ba * h; float dd = length(q - c);
    if (dd < d){ d = dd; cp = c; }
  }
  const float R = 0.0055;
  if (d < R){ vec2 s = (q - cp) / R; float u = clamp(length(s), 0.0, 0.999); nn = normalize(vec3(s.x, sqrt(1.0 - u * u), s.y)); }
  else nn = vec3(0.0, 1.0, 0.0);
  return d;
}

vec4 scene(vec3 ro, vec3 rd){                                    // rgb, a = distance
  float tMin = 1e9; int quoi = 0; vec3 n = vec3(0.0, 1.0, 0.0); int idx = 0;
  float tp = rd.y < 0.0 ? -ro.y / rd.y : -1.0;
  if (tp > 0.0){ tMin = tp; quoi = 1; }
  // le tableau (boîte)
  {
    vec3 inv = 1.0 / rd, t0 = (vec3(-BX, 0.0, -BZ) - ro) * inv, t1 = (vec3(BX, BY, BZ) - ro) * inv;
    vec3 mn = min(t0, t1), mx = max(t0, t1);
    float tn = max(max(mn.x, mn.y), mn.z), tf = min(min(mx.x, mx.y), mx.z);
    if (tn < tf && tn > 0.0 && tn < tMin){ tMin = tn; quoi = 2;
      n = (tn == mn.x) ? vec3(-sign(rd.x), 0.0, 0.0) : (tn == mn.y) ? vec3(0.0, -sign(rd.y), 0.0) : vec3(0.0, 0.0, -sign(rd.z)); }
  }
  // les aimants
  if (ro.y + rd.y * (tMin < 1e8 ? tMin : 10.0) < BY + MH + 0.01){
    for (int i = 0; i < 22; i++){
      vec3 nm; float t = iMag(ro, rd, uMag[i].xy, nm);
      if (t > 0.0 && t < tMin){ tMin = t; quoi = 3; n = nm; idx = i; }
    }
  }
  float tb = iSphere(ro, rd, vec3(uBall.x, BY + RB, uBall.y), RB);
  if (tb > 0.0 && tb < tMin){ tMin = tb; quoi = 4; }
  float tw = iCaps(ro, rd, W0 + vec3(0.0, WR, 0.0), W1 + vec3(0.0, WR, 0.0), WR);
  if (tw > 0.0 && tw < tMin){ tMin = tw; quoi = 5; }
  float tw2 = iCaps(ro, rd, W1 + vec3(0.0, WR2, 0.0), W2 + vec3(0.0, WR2, 0.0), WR2);
  if (tw2 > 0.0 && tw2 < tMin){ tMin = tw2; quoi = 6; }
  float tpen = iCaps(ro, rd, P0 + vec3(0.0, PR, 0.0), P1 + vec3(0.0, PR, 0.0), PR);
  if (tpen > 0.0 && tpen < tMin){ tMin = tpen; quoi = 7; }

  vec3 v = -rd;
  if (quoi == 0) return vec4(piece(rd, 0.6) * 0.15, 20.0);
  vec3 p = ro + rd * tMin;
  vec3 alb = vec3(0.5); float rough = 0.5, metal = 0.0;
  if (quoi == 1){                                                // table
    vec3 nn; float dc = cordon(p.xz, nn);
    if (dc < 0.0055){ n = nn; alb = vec3(0.02, 0.06, 0.40); rough = 0.55; }
    else {
      float vernis; alb = bois(p.xz, vernis); rough = vernis;
      if (dc < 0.012) alb *= mix(0.45, 1.0, (dc - 0.0055) / 0.0065);
      n = normalize(vec3((bruit(p.xz * 140.0) - 0.5) * 0.02, 1.0, (bruit(p.zx * 140.0) - 0.5) * 0.02));
    }
  } else if (quoi == 2){                                         // tableau
    vec2 q = p.xz;
    bool dessus = n.y > 0.5;
    bool cadre = !dessus || abs(q.x) > BX - FW || abs(q.y) > BZ - FW;
    if (cadre){
      alb = vec3(0.86, 0.87, 0.88); metal = 1.0; rough = 0.30 + 0.06 * bruit(q * vec2(4.0, 600.0));
      if (dessus){                                                // arêtes arrondies : la lumière accroche les bords
        float e = min(BX - abs(q.x), BZ - abs(q.y));
        float bord = 1.0 - smoothstep(0.0, 0.006, e);
        vec3 nb = abs(q.x) / BX > abs(q.y) / BZ ? vec3(sign(q.x), 0.0, 0.0) : vec3(0.0, 0.0, sign(q.y));
        float inner = 1.0 - smoothstep(0.0, 0.004, min(abs(abs(q.x) - (BX - FW)), abs(abs(q.y) - (BZ - FW))));
        n = normalize(mix(n, nb, bord * 0.7));
        alb *= 1.0 - 0.6 * inner;
      } else {
        float e = BY - p.y; n = normalize(mix(n, vec3(0.0, 1.0, 0.0), (1.0 - smoothstep(0.0, 0.006, e)) * 0.7));
      }
    } else {
      float bande = step(0.5, fract((q.x + 0.92) / 0.1314));
      float fibre = bruit(q * 900.0) * 0.6 + bruit(q * 260.0) * 0.4;
      alb = vec3(0.040, 0.150, 0.068) * (0.88 + 0.12 * bande) * (0.82 + 0.3 * fibre);
      rough = 0.85;
      float li = lignesTerrain(q);
      alb = mix(alb, vec3(0.74, 0.76, 0.74), li * 0.92); rough = mix(rough, 0.6, li);
      vec4 f = fleches(q);
      alb = mix(alb, f.rgb * 0.85, f.a); rough = mix(rough, 0.35, f.a);
      n = normalize(vec3((fibre - 0.5) * 0.06, 1.0, (bruit(q.yx * 900.0) - 0.5) * 0.06));
    }
  } else if (quoi == 3){                                         // aimant
    vec4 m = uMag[0];
    for (int i = 0; i < 22; i++) if (i == idx) m = uMag[i];
    bool bleu = m.z < 0.5;
    alb = bleu ? vec3(0.018, 0.06, 0.40) : vec3(0.52, 0.025, 0.022);
    rough = 0.22;
    if (p.y > BY + MH - 0.0005){
      float r = length(p.xz - m.xy);
      float anneau = smoothstep(0.0215, 0.0235, r) * (1.0 - smoothstep(0.0275, 0.0295, r));
      alb = mix(alb, vec3(0.80, 0.80, 0.80), anneau);
      if (m.w > 0.5) alb = mix(alb, vec3(0.85, 0.62, 0.10), 1.0 - smoothstep(0.009, 0.011, r));
    }
  } else if (quoi == 4){                                         // ballon
    vec3 c = vec3(uBall.x, BY + RB, uBall.y);
    n = normalize(p - c);
    alb = mix(vec3(0.82, 0.82, 0.80), vec3(0.015), panneaux(uBallRot * n));
    rough = 0.32;
  } else if (quoi == 5 || quoi == 6){                            // sifflet chromé
    n = quoi == 5 ? normalize(nCaps(p, W0 + vec3(0.0, WR, 0.0), W1 + vec3(0.0, WR, 0.0), WR))
                  : normalize(nCaps(p, W1 + vec3(0.0, WR2, 0.0), W2 + vec3(0.0, WR2, 0.0), WR2));
    alb = vec3(0.92, 0.90, 0.86); metal = 1.0; rough = 0.14;
    if (quoi == 5){ float fente = smoothstep(0.004, 0.0, abs(dot(p - W1, normalize(W1 - W0)) + 0.012)) * step(WR * 1.4, p.y); alb *= 1.0 - 0.85 * fente; }
  } else {                                                       // feutre
    n = normalize(nCaps(p, P0 + vec3(0.0, PR, 0.0), P1 + vec3(0.0, PR, 0.0), PR));
    float s = dot(p - P0, normalize(P1 - P0)) / length(P1 - P0);
    alb = s > 0.68 ? vec3(0.02, 0.07, 0.42) : (s < 0.04 ? vec3(0.7) : vec3(0.012));
    rough = s > 0.68 ? 0.25 : 0.38;
    if (s > 0.66 && s < 0.68) alb = vec3(0.6);
  }
  float sh = ombres(p + n * 0.0015, quoi == 3 ? idx : -1);
  float ao = occlusion(p);
  if (quoi == 3) ao *= mix(0.5, 1.0, smoothstep(BY, BY + 0.012, p.y));
  vec3 col = eclaire(p, n, v, alb, rough, metal, ao, sh);
  if (quoi == 3 || quoi == 4) col += alb * vec3(0.03, 0.10, 0.04) * max(0.0, 1.0 - abs(n.y)) * 0.6;   // reflet vert du feutre
  float brume = 1.0 - exp(-max(tMin - 2.2, 0.0) * 0.35);
  col = mix(col, vec3(0.006, 0.009, 0.02), brume);
  return vec4(col, tMin);
}

vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  vec3 rd = normalize(uCF * uFocal + (uv.x - uLens) * uCR + uv.y * uCU);
  vec4 s = scene(uCam, rd);
  vec3 c = aces(s.rgb * uExpo);
  c = pow(c, vec3(1.0 / 2.2));
  float coc = clamp(uAper * (s.a - uFocus) / s.a, -1.0, 1.0);
  gl_FragColor = vec4(c, coc * 0.5 + 0.5);
}`;

  /* ---------- passe 2 : mise au point (flou de profondeur), vignette, grain ---------- */
  const FS_FLOU = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uMaxR, uTime;
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec4 c0 = texture2D(uTex, uv);
  float sc = c0.a * 2.0 - 1.0, rc = abs(sc) * uMaxR;
  vec3 acc = c0.rgb; float wsum = 1.0;
  for (int i = 1; i < 28; i++){
    float fi = float(i);
    float r = sqrt(fi / 27.0) * uMaxR, an = fi * 2.39996;
    vec2 o = vec2(cos(an), sin(an)) * r;
    vec4 t = texture2D(uTex, uv + o / uRes);
    float st = t.a * 2.0 - 1.0, rt = abs(st) * uMaxR;
    float w = smoothstep(r - 1.2, r, rt);
    if (st > sc) w *= smoothstep(r - 1.2, r, rc);
    float lum = dot(t.rgb, vec3(0.299, 0.587, 0.114));
    w *= 1.0 + smoothstep(0.65, 1.0, lum) * 2.5;
    acc += t.rgb * w; wsum += w;
  }
  vec3 col = acc / wsum;
  vec2 q = uv - 0.5;
  col *= 1.0 - 0.55 * dot(q * vec2(1.15, 1.4), q * vec2(1.15, 1.4));
  float g = fract(sin(dot(gl_FragCoord.xy + fract(uTime) * 91.7, vec2(12.9898, 78.233))) * 43758.5453);
  col += (g - 0.5) * 0.028;
  gl_FragColor = vec4(col, 1.0);
}`;

  function prog(fs){
    const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, mk(gl.VERTEX_SHADER, VS)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs));
    gl.bindAttribLocation(p, 0, "aPos"); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++){ const inf = gl.getActiveUniform(p, i); u[inf.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(p, inf.name); }
    return { p, u };
  }
  let P1, P2;
  try { P1 = prog(FS_SCENE); P2 = prog(FS_FLOU); }
  catch(e){ window.__bureau3d = { erreur: String(e && e.message || e) }; return sans3d(); }
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const tex = gl.createTexture(), fbo = gl.createFramebuffer();
  let W = 0, H = 0;
  function taille(){
    const r = hero.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const max = tactile ? 200000 : 620000;
    let w = r.width * dpr, h = r.height * dpr;
    const k = Math.min(1, Math.sqrt(max / (w * h)));
    w = Math.max(2, Math.round(w * k)); h = Math.max(2, Math.round(h * k));
    if (w === W && h === H) return true;
    W = w; H = h; cv.width = W; cv.height = H;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return true;
  }

  /* ---------- l'action jouée sur le tableau ---------- */
  const BLEU = [[-0.86, 0], [-0.58, 0.40], [-0.62, 0.13], [-0.62, -0.13], [-0.58, -0.40], [-0.30, 0.05], [-0.36, -0.22], [-0.36, 0.27], [0.06, 0.42], [0.16, 0.03], [0.10, -0.36]];
  const ROUGE = [[0.86, 0], [0.62, 0.38], [0.64, 0.13], [0.64, -0.13], [0.62, -0.38], [0.38, 0.35], [0.40, 0.12], [0.40, -0.12], [0.38, -0.35], [0.05, 0.19], [0.03, -0.16]];
  const CM = 5, AIL = 8, BU = 9;
  const ARR = [
    [[-0.27, 0.07], [0.02, 0.30], [0.30, 0.41]],                 // passe vers l'ailier
    [[0.06, 0.42], [0.20, 0.47], [0.34, 0.42]],                  // appel de l'ailier
    [[0.18, 0.02], [0.48, -0.08], [0.69, 0.05]],                 // appel de l'avant-centre
    [[0.66, 0.34], [0.72, 0.22], [0.71, 0.08]],                  // centre
  ];
  const lisse = x => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
  const seg = (t, a, b) => lisse((t - a) / (b - a));
  const lerp = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
  const bz = (p, k) => lerp(lerp(p[0], p[1], k), lerp(p[1], p[2], k), k);
  const CYCLE = 12;
  function etat(T){
    const t = T % CYCLE;
    const retour = seg(t, 8.2, 9.8);
    const bleu = BLEU.map(p => p.slice()), rouge = ROUGE.map(p => p.slice());
    // l'ailier : appel puis conduite de balle
    const ail = t < 2.6 ? bz(ARR[1], seg(t, 0.6, 2.2)) : lerp([0.34, 0.42], [0.62, 0.36], seg(t, 2.6, 3.9));
    bleu[AIL] = lerp(ail, BLEU[AIL], retour);
    // l'avant-centre : appel dans la surface
    bleu[BU] = lerp(bz([[0.16, 0.03], ARR[2][1], [0.69, 0.05]], seg(t, 2.8, 4.4)), BLEU[BU], retour);
    // le bloc bleu monte un peu, le bloc rouge glisse vers le ballon
    const monte = seg(t, 1.0, 4.0) * (1 - retour);
    [1, 2, 3, 4, 5, 6, 7, 10].forEach(i => { bleu[i][0] += 0.07 * monte; });
    bleu[CM] = lerp(BLEU[CM], [-0.20, 0.08], monte);
    const glisse = seg(t, 1.6, 4.2) * (1 - retour);
    rouge.forEach((p, i) => { if (i){ p[1] += 0.06 * glisse; p[0] += (i <= 4 ? 0.05 : 0.03) * glisse; } });
    rouge[1] = lerp(rouge[1], [0.60, 0.33], seg(t, 2.6, 3.8) * (1 - retour));
    // le ballon
    let b;
    if (t < 1.0) b = [BLEU[CM][0] + 0.05, BLEU[CM][1] + 0.01];
    else if (t < 2.25) b = bz(ARR[0], seg(t, 1.0, 2.25));
    else if (t < 2.6) b = [0.30, 0.41];
    else if (t < 3.95){ const k = seg(t, 2.6, 3.9); const a = lerp([0.34, 0.42], [0.62, 0.36], k); b = [a[0] + 0.05, a[1] - 0.01]; }
    else if (t < 4.6) b = bz([[0.67, 0.35], [0.73, 0.21], [0.735, 0.06]], seg(t, 3.95, 4.6));
    else if (t < 5.1) b = lerp([0.735, 0.06], [0.955, 0.015], seg(t, 4.75, 5.1));
    else b = [0.955, 0.015];
    if (t >= 8.2) b = lerp([0.955, 0.015], [BLEU[CM][0] + 0.05, BLEU[CM][1] + 0.01], retour);
    const fl = [seg(t, 0.2, 0.9), seg(t, 0.05, 0.6), seg(t, 2.2, 2.9), seg(t, 3.2, 3.85)];
    const alpha = 1 - seg(t, 7.6, 8.4);
    return { bleu, rouge, b, fl, alpha };
  }

  /* ---------- le ballon roule ---------- */
  let rot = [1, 0, 0, 0, 1, 0, 0, 0, 1], dernierB = null;
  function rouler(b){
    if (dernierB){
      const dx = b[0] - dernierB[0], dz = b[1] - dernierB[1], d = Math.hypot(dx, dz);
      if (d > 1e-6 && d < 0.3){
        const ax = [dz / d, 0, -dx / d], an = d / 0.016, c = Math.cos(an), s = Math.sin(an), C = 1 - c;
        const [x, y, z] = ax;
        const R = [c + x * x * C, x * y * C - z * s, x * z * C + y * s, y * x * C + z * s, c + y * y * C, y * z * C - x * s, z * x * C - y * s, z * y * C + x * s, c + z * z * C];
        const m = new Array(9);
        for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) m[i * 3 + j] = R[i * 3] * rot[j] + R[i * 3 + 1] * rot[3 + j] + R[i * 3 + 2] * rot[6 + j];
        rot = m;
      }
    }
    dernierB = b;
  }

  /* ---------- caméra : lent travelling, suit un peu la souris sur ordinateur ---------- */
  let sx = 0, sy = 0, cx = 0, cy = 0;
  if (!tactile) hero.addEventListener("pointermove", e => { const r = hero.getBoundingClientRect(); sx = (e.clientX - r.left) / r.width - 0.5; sy = (e.clientY - r.top) / r.height - 0.5; });
  hero.addEventListener("pointerleave", () => { sx = 0; sy = 0; });
  function camera(T){
    const asp = W / H, large = asp > 1.7;
    cx += (sx - cx) * 0.05; cy += (sy - cy) * 0.05;
    const yaw = (large ? 0.30 : 0.40) + 0.07 * Math.sin(T * 0.11) + cx * 0.10;
    const pitch = (large ? 0.56 : 0.74) + 0.03 * Math.sin(T * 0.083) - cy * 0.05;
    const D = large ? 2.1 : 2.55 - Math.min(0.5, (asp - 1) * 0.5);
    const tg = large ? [0.30, 0.0, 0.06] : [0.30, 0.0, 0.10];
    const pos = [tg[0] + D * Math.cos(pitch) * Math.sin(yaw), tg[1] + D * Math.sin(pitch), tg[2] + D * Math.cos(pitch) * Math.cos(yaw)];
    const f = norm([tg[0] - pos[0], tg[1] - pos[1], tg[2] - pos[2]]);
    const r = norm([-f[2], 0, f[0]]);
    const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    const fov = large ? 0.50 : 0.66;
    const lens = large ? Math.min(0.62, 0.16 * asp) : 0;
    return { pos, f, r, u, focal: 0.5 / Math.tan(fov / 2), lens };
  }
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

  const mags = new Float32Array(22 * 4), arr = new Float32Array(24);
  ARR.forEach((a, i) => a.forEach((p, j) => { arr[(i * 3 + j) * 2] = p[0]; arr[(i * 3 + j) * 2 + 1] = p[1]; }));
  const t0 = performance.now();
  let tFixe = null;
  function dessiner(T){
    if (!taille()) return;
    const e = etat(T);
    e.bleu.forEach((p, i) => mags.set([p[0], p[1], 0, i === CM || i === AIL || i === BU ? 1 : 0], i * 4));
    e.rouge.forEach((p, i) => mags.set([p[0], p[1], 1, 0], (11 + i) * 4));
    rouler(e.b);
    const c = camera(T);
    const bp = [e.b[0], 0.051, e.b[1]];
    const focus = Math.hypot(bp[0] - c.pos[0], bp[1] - c.pos[1], bp[2] - c.pos[2]);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.viewport(0, 0, W, H);
    gl.useProgram(P1.p); const u = P1.u;
    gl.uniform2f(u.uRes, W, H); gl.uniform1f(u.uTime, T);
    gl.uniform3fv(u.uCam, c.pos); gl.uniform3fv(u.uCR, c.r); gl.uniform3fv(u.uCU, c.u); gl.uniform3fv(u.uCF, c.f);
    gl.uniform1f(u.uFocal, c.focal); gl.uniform1f(u.uLens, c.lens); gl.uniform1f(u.uFocus, focus);
    gl.uniform1f(u.uAper, 1.4); gl.uniform1f(u.uExpo, 1.15);
    gl.uniform4fv(u.uMag, mags); gl.uniform3f(u.uBall, e.b[0], e.b[1], 0);
    gl.uniformMatrix3fv(u.uBallRot, false, new Float32Array(rot));
    gl.uniform2fv(u.uArr, arr); gl.uniform1fv(u.uArrT, new Float32Array(e.fl)); gl.uniform1f(u.uArrA, e.alpha);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H);
    gl.useProgram(P2.p);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniform1i(P2.u.uTex, 0); gl.uniform2f(P2.u.uRes, W, H);
    gl.uniform1f(P2.u.uMaxR, Math.max(3, Math.min(9, H / 55))); gl.uniform1f(P2.u.uTime, T);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ---------- boucle : 30 images/s au plus, en pause quand l'en-tête n'est pas visible ---------- */
  let visible = true, raf = 0, dernier = 0, figeJusqua = 0;
  // un doigt sur l'écran (appui, défilement) : la scène reste figée un instant, le téléphone répond tout de suite à l'appui
  ["touchstart", "touchmove", "pointerdown"].forEach(t => window.addEventListener(t, () => { figeJusqua = performance.now() + 900; }, { passive: true, capture: true }));
  function boucle(now){
    raf = 0;
    if (!visible || document.hidden) return;
    if (W && now < figeJusqua){ raf = requestAnimationFrame(boucle); return; }
    if (now - dernier >= (tactile ? 50 : 33)){ dernier = now; dessiner(tFixe != null ? tFixe : (now - t0) / 1000); }
    if (!reduit && tFixe == null) raf = requestAnimationFrame(boucle);
  }
  const relancer = () => { if (!raf) raf = requestAnimationFrame(boucle); };
  if ("IntersectionObserver" in window) new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); if (visible) relancer(); }).observe(hero);
  document.addEventListener("visibilitychange", relancer);
  window.addEventListener("hashchange", () => setTimeout(relancer, 50));
  if ("ResizeObserver" in window) new ResizeObserver(() => { dernier = 0; relancer(); }).observe(hero);
  if (reduit) tFixe = 4.5;
  cv.addEventListener("webglcontextlost", e => { e.preventDefault(); sans3d(); });
  window.__bureau3d = { dessiner, figer: t => { tFixe = t; dernier = 0; relancer(); } };
  relancer();
})();
