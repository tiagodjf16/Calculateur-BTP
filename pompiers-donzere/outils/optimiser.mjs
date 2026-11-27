// Allège un GLB pour le web : fusion des sommets, simplification douce, textures WebP, compression Meshopt.
// Usage : node outils/optimiser.mjs entree.glb sortie.glb [ratio=0.6] [textureMax=4096] [erreur=0.0006] [bitsPosition=14] [bord=0]
// bord=1 : les bords des maillages ne bougent pas (toits et murs restent jointifs) ; seuls les pans intérieurs sont simplifiés.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, weld, simplify, simplifyPrimitive, prune, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

const [, , entree, sortie, ratio = '0.6', texMax = '4096', erreur = '0.0006', bitsPosition = '14', bord = '0', lisser = ''] = process.argv;
await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(entree);
const compte = () => {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) t += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(t);
};
const avant = compte();
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
etapes.push(prune({ keepLeaves: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 90, resize: [+texMax, +texMax] }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizePosition: +bitsPosition, quantizeTexcoord: 14, quantizeNormal: 10 }));
await doc.transform(...etapes);
await io.write(sortie, doc);
console.log(`triangles ${avant} -> ${compte()} | ${(fs.statSync(entree).size / 1e6).toFixed(1)} Mo -> ${(fs.statSync(sortie).size / 1e6).toFixed(1)} Mo`);
