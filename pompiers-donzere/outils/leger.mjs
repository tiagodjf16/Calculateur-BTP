// Variante « téléphone » d'un GLB : textures plafonnées (couleur d'un côté, relief/rugosité de l'autre),
// simplification des maillages, compression Meshopt. Sert à tenir dans la mémoire graphique d'un téléphone.
// Usage : node outils/leger.mjs entree.glb sortie.glb [ratio=0.5] [couleurMax=2048] [autresMax=1024] [erreur=0.001] [bitsPosition=14] [heros]
// heros : expression régulière sur le nom des textures de couleur qui gardent couleurMax (les autres passent à autresMax).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTTextureWebP } from '@gltf-transform/extensions';
import { dedup, weld, simplify, simplifyPrimitive, prune, compressTexture, listTextureSlots, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const [, , entree, sortie, ratio = '0.5', couleurMax = '2048', autresMax = '1024', erreur = '0.001', bitsPosition = '14', heros = '', bord = '0', lisser = ''] = process.argv;
const herosRe = heros ? new RegExp(heros) : null;
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(entree);
const triangles = () => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(t);
};
const memoire = () => doc.getRoot().listTextures().reduce((s, t) => { const d = t.getSize(); return s + (d ? d[0] * d[1] * 4 * 1.33 / 1048576 : 0); }, 0);
const avant = [triangles(), memoire()];
// lisser : expression régulière sur le nom des maillages dont les normales sont recalculées après fusion des sommets
// (toits mesurés : pans bien lisses, arêtes vives entre pans, et simplification possible à l'intérieur des pans).
const lisserRe = lisser ? new RegExp(lisser) : null;
const aLisser = () => doc.getRoot().listMeshes().filter((m) => lisserRe && lisserRe.test(m.getName())).flatMap((m) => m.listPrimitives());
const sansNormales = () => (d) => { for (const p of aLisser()) p.setAttribute('NORMAL', null); };
const normalesLisses = () => (d) => {
  for (const p of aLisser()) {
    const pos = p.getAttribute('POSITION'), ind = p.getIndices();
    if (!pos || !ind) continue;
    const P = pos.getArray(), I = ind.getArray(), N = new Float32Array(pos.getCount() * 3);
    for (let t = 0; t < I.length; t += 3) {
      const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], vx = P[c] - P[a], vy = P[c + 1] - P[a + 1], vz = P[c + 2] - P[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;          // longueur = 2 x aire : pondération par l'aire
      for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
    }
    for (let k = 0; k < N.length; k += 3) { const l = Math.hypot(N[k], N[k + 1], N[k + 2]) || 1; N[k] /= l; N[k + 1] /= l; N[k + 2] /= l; }
    p.setAttribute('NORMAL', d.createAccessor().setType('VEC3').setArray(N).setBuffer(pos.getBuffer()));
  }
};
const etapes = [dedup(), sansNormales(), weld(), normalesLisses()];
// avec « lisser », seuls ces maillages (les toits) sont simplifiés : les façades gardent leurs travées intactes
const simplifierToits = () => (d) => { for (const p of aLisser()) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: +ratio, error: +erreur, lockBorder: bord === '1' }); };
if (+ratio < 1) etapes.push(lisserRe ? simplifierToits() : simplify({ simplifier: MeshoptSimplifier, ratio: +ratio, error: +erreur, lockBorder: bord === '1' }));
/** Textures : celles de couleur gardent couleurMax (toutes, ou seulement les « héros »), les autres passent à autresMax. */
const textures = () => async (d) => {
  for (const t of d.getRoot().listTextures()) {
    const couleur = listTextureSlots(t).some((c) => /^(baseColor|emissive)/.test(c));
    const max = couleur && (!herosRe || herosRe.test(t.getName())) ? +couleurMax : +autresMax;
    await compressTexture(t, { encoder: sharp, targetFormat: 'webp', quality: 88, resize: [max, max] });
  }
  d.createExtension(EXTTextureWebP).setRequired(true);
};
etapes.push(prune({ keepLeaves: true }), textures(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: +bitsPosition, quantizeTexcoord: 14, quantizeNormal: 10 }));
await doc.transform(...etapes);
await io.write(sortie, doc);
console.log(`triangles ${avant[0]} -> ${triangles()} | textures en mémoire ${avant[1].toFixed(0)} -> ${memoire().toFixed(0)} Mo | fichier ${(fs.statSync(entree).size / 1e6).toFixed(1)} -> ${(fs.statSync(sortie).size / 1e6).toFixed(1)} Mo`);
for (const t of doc.getRoot().listTextures()) console.log('  ', (t.getSize() || []).join('x'), t.getName() || t.getURI() || '', '←', [...new Set(doc.getGraph().listParentEdges(t).map((e) => e.getName()))].join(','));
