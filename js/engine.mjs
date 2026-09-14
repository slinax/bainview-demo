/*  Bainview — moteur 3D paramétrique
 *  Construit une salle de bain complète à partir d'un objet de configuration.
 *  Aucune dimension n'est codée en dur : tout dérive de cfg.piece.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

/* =======================================================================
   1. CATALOGUE
   ======================================================================= */
export const FAIENCES = {
  emeraude:   { nom: 'Vert émeraude',  h: 163, s: 72, l: 20, hex: '#0e6b52', format: '10 × 10 zellige', prix: 89 },
  sauge:      { nom: 'Vert sauge',     h: 120, s: 20, l: 42, hex: '#6d8a63', format: '10 × 10 zellige', prix: 82 },
  bleucanard: { nom: 'Bleu canard',    h: 191, s: 62, l: 24, hex: '#176b7a', format: '10 × 10 zellige', prix: 89 },
  terracotta: { nom: 'Terracotta',     h: 14,  s: 52, l: 42, hex: '#a35a3a', format: '10 × 10 terre cuite', prix: 74 },
  sable:      { nom: 'Sable mat',      h: 34,  s: 22, l: 62, hex: '#bda683', format: '10 × 10 mat', prix: 58 },
  blanc:      { nom: 'Blanc craie',    h: 40,  s: 8,  l: 84, hex: '#dedad2', format: '10 × 10 mat', prix: 42 },
  anthracite: { nom: 'Anthracite',     h: 205, s: 8,  l: 20, hex: '#2f353a', format: '10 × 10 mat', prix: 66 }
};
export const METAUX = {
  laiton: { nom: 'Laiton brossé', hex: 0xc9a15a, rug: 0.21, css: '#c9a15a', coef: 1.35 },
  inox:   { nom: 'Inox brossé',   hex: 0xc4c9cb, rug: 0.33, css: '#c4c9cb', coef: 1.15 },
  noir:   { nom: 'Noir mat',      hex: 0x2a2e30, rug: 0.48, css: '#2a2e30', coef: 1.25 },
  chrome: { nom: 'Chromé',        hex: 0xe2e6e8, rug: 0.08, css: '#e2e6e8', coef: 1 }
};
export const BOIS = {
  chene: { nom: 'Chêne clair', rgb: [138, 96, 58],  css: '#8a603a' },
  teck:  { nom: 'Teck',        rgb: [126, 82, 46],  css: '#7e522e' },
  noyer: { nom: 'Noyer',       rgb: [86, 56, 38],   css: '#563826' },
  frene: { nom: 'Frêne blanc', rgb: [178, 152, 116], css: '#b29874' }
};
export const PARTIS = {
  spa:          { nom: 'Douche + baignoire', desc: 'Douche à l’italienne d’angle, baignoire îlot si la place le permet' },
  traversante:  { nom: 'Douche traversante', desc: 'Douche sur toute la largeur, banc maçonné, double vasque' },
  wetroom:      { nom: 'Wetroom & bain japonais', desc: 'Aucune paroi, sol en pente, ofuro encastré' }
};

/* Tarifs indicatifs de référence, en euros HT. Chaque entreprise saisit les siens
   dans ses réglages : ceux-ci ne servent que de point de départ. */
export const TARIFS = {
  faience: null,        // null = prix du catalogue selon la teinte choisie
  sol: 62,              // fourniture du revêtement de sol, au m²
  poseM2: 78,           // pose carrelage mur et sol, au m²
  etancheite: 34,       // système d'étanchéité liquide sous carrelage, au m²
  douche: 1450,         // receveur de plain-pied, paroi, robinetterie
  baignoire: 1900,
  vasque: 1150,         // meuble, plan, vasque, mitigeur
  wc: 780,
  ofuro: 3400,
  claustra: 620,
  verriere: 890,
  depose: 950           // dépose de l'existant et évacuation
};

export function configParDefaut() {
  return {
    piece: { L: 3, P: 3, H: 2.5 },
    porte: { mur: 'avant', position: 0.5 },
    parti: 'spa',
    materiaux: { faience: 'emeraude', metal: 'laiton', bois: 'chene' },
    options: { baignoire: true, wc: true, plantes: true, verriere: true }
  };
}

/* =======================================================================
   2. TEXTURES PROCÉDURALES (mises en cache par palette)
   ======================================================================= */
const cacheTex = new Map();
let ANISO = 8;

function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(canvas, srgb, rx, ry) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.set(rx, ry);
  return t;
}
function bruit(n) {
  const a = new Float32Array(n * n);
  for (let i = 0; i < a.length; i++) a[i] = Math.random();
  return (x, y) => {
    const fx = x * n, fy = y * n;
    let x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = fx - x0, ty = fy - y0;
    x0 = ((x0 % n) + n) % n; y0 = ((y0 % n) + n) % n;
    const x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
    const s = t => t * t * (3 - 2 * t), u = s(tx), v = s(ty);
    const a00 = a[y0 * n + x0], a10 = a[y0 * n + x1], a01 = a[y1 * n + x0], a11 = a[y1 * n + x1];
    return (a00 * (1 - u) + a10 * u) * (1 - v) + (a01 * (1 - u) + a11 * u) * v;
  };
}
function fbm(list) {
  const o = list.map(([f, a]) => ({ a, n: bruit(f) }));
  const tot = o.reduce((s, x) => s + x.a, 0);
  return (x, y) => o.reduce((s, x2) => s + x2.a * x2.n(x, y), 0) / tot;
}
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* faïence : carreaux émaillés, taille du motif en mètres */
function faience(p, motif, cases) {
  const S = 1024, c = cv(S, S), g = c.getContext('2d');
  const R = cv(S, S), gr = R.getContext('2d'), B = cv(S, S), gb = B.getContext('2d');
  const joint = 'hsl(' + p.h + ',' + Math.round(p.s * 0.5) + '%,' + Math.max(6, p.l - 12) + '%)';
  g.fillStyle = joint; g.fillRect(0, 0, S, S);
  gr.fillStyle = '#e8e8e8'; gr.fillRect(0, 0, S, S);
  gb.fillStyle = '#3a3a3a'; gb.fillRect(0, 0, S, S);
  const pas = S / cases, j = 4;
  for (let iy = 0; iy < cases; iy++) for (let ix = 0; ix < cases; ix++) {
    const x = ix * pas + j, y = iy * pas + j, w = pas - 2 * j, h = pas - 2 * j;
    const hh = p.h + (Math.random() * 8 - 4);
    const ss = Math.max(0, p.s + Math.random() * 14 - 7);
    const ll = p.l + Math.random() * 8;
    g.fillStyle = 'hsl(' + hh + ',' + ss + '%,' + ll + '%)';
    rr(g, x, y, w, h, 6); g.fill();
    const lg = g.createLinearGradient(x, y, x + w, y + h);
    lg.addColorStop(0, 'rgba(255,255,255,' + (0.06 + Math.random() * 0.06) + ')');
    lg.addColorStop(0.4, 'rgba(255,255,255,0.012)');
    lg.addColorStop(0.7, 'rgba(0,0,0,0.085)');
    lg.addColorStop(1, 'rgba(255,255,255,' + (0.02 + Math.random() * 0.035) + ')');
    g.fillStyle = lg; rr(g, x, y, w, h, 6); g.fill();
    gr.fillStyle = 'hsl(0,0%,' + (9 + Math.random() * 9) + '%)'; rr(gr, x, y, w, h, 6); gr.fill();
    gb.fillStyle = 'hsl(0,0%,' + (84 + Math.random() * 10) + '%)'; rr(gb, x, y, w, h, 6); gb.fill();
  }
  const rep = 1 / motif;
  return { map: tex(c, true, rep, rep), rug: tex(R, false, rep, rep), bosse: tex(B, false, rep, rep) };
}

/* enduit lissé, sans joint */
function enduit(rgb, motif, contraste) {
  const S = 512, c = cv(S, S), g = c.getContext('2d');
  const f1 = fbm([[3, 1], [7, 0.6], [17, 0.32], [41, 0.16]]);
  const f2 = fbm([[9, 1], [23, 0.5]]);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = f1(x / S, y / S), m = f2(x / S * 1.7 + 0.3, y / S * 1.7);
    const k = (n - 0.5) * contraste + (m - 0.5) * contraste * 0.45;
    const i = (y * S + x) * 4;
    for (let ch = 0; ch < 3; ch++)
      img.data[i + ch] = Math.max(0, Math.min(255, rgb[ch] + k * rgb[ch] * 0.9));
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c, true, 1 / motif, 1 / motif) };
}

function boisTex(rgb) {
  const S = 1024, c = cv(S, S), g = c.getContext('2d');
  const f = fbm([[4, 1], [11, 0.5], [29, 0.25]]);
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const n = f(x / S * 0.6, y / S * 3.2);
    const grain = Math.sin(y / S * 30 + n * 8) * 0.5 + 0.5;
    const k = Math.pow(grain, 3) * 0.5 + n * 0.5;
    const i = (y * S + x) * 4;
    img.data[i] = rgb[0] + k * 46; img.data[i + 1] = rgb[1] + k * 38; img.data[i + 2] = rgb[2] + k * 26;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { map: tex(c, true, 1, 1) };
}

function palette(mat) {
  const cle = mat.faience + '|' + mat.bois;
  if (cacheTex.has(cle)) return cacheTex.get(cle);
  const f = FAIENCES[mat.faience] ?? FAIENCES.emeraude;
  const p = {
    grand: faience(f, 0.5, 5),
    mosaique: faience(f, 0.3, 6),
    enduitHaut: enduit([Math.round(f.l * 2.3) + 30, Math.round(f.l * 2.2) + 40, Math.round(f.l * 2.1) + 36], 2.2, 0.3),
    sol: enduit([132, 122, 105], 2.6, 0.22),
    bois: boisTex((BOIS[mat.bois] ?? BOIS.chene).rgb)
  };
  cacheTex.set(cle, p);
  return p;
}

/* =======================================================================
   3. MATÉRIAUX
   ======================================================================= */
function materiaux(cfg) {
  const p = palette(cfg.materiaux);
  const met = METAUX[cfg.materiaux.metal] ?? METAUX.laiton;
  return {
    faience: new THREE.MeshPhysicalMaterial({
      map: p.grand.map, roughnessMap: p.grand.rug, bumpMap: p.grand.bosse, bumpScale: 0.01,
      metalness: 0, roughness: 1, clearcoat: 0.45, clearcoatRoughness: 0.09, envMapIntensity: 0.5
    }),
    mosaique: new THREE.MeshPhysicalMaterial({
      map: p.mosaique.map, roughnessMap: p.mosaique.rug, bumpMap: p.mosaique.bosse, bumpScale: 0.008,
      metalness: 0, roughness: 1, clearcoat: 0.28, clearcoatRoughness: 0.22, envMapIntensity: 0.45
    }),
    haut: new THREE.MeshStandardMaterial({ map: p.enduitHaut.map, roughness: 0.95, metalness: 0, envMapIntensity: 0.3 }),
    sol: new THREE.MeshStandardMaterial({ map: p.sol.map, roughness: 0.9, metalness: 0, envMapIntensity: 0.3 }),
    plafond: new THREE.MeshStandardMaterial({ color: 0xf3f1ec, roughness: 0.98 }),
    bois: new THREE.MeshStandardMaterial({ map: p.bois.map, roughness: 0.68, metalness: 0, envMapIntensity: 0.35 }),
    pierre: new THREE.MeshStandardMaterial({ color: 0xc6bdab, roughness: 0.5, metalness: 0, envMapIntensity: 0.4 }),
    metal: new THREE.MeshStandardMaterial({ color: met.hex, metalness: 1, roughness: met.rug, envMapIntensity: 1.1 }),
    metalMat: new THREE.MeshStandardMaterial({ color: met.hex, metalness: 1, roughness: Math.min(1, met.rug + 0.2), envMapIntensity: 0.9 }),
    noir: new THREE.MeshStandardMaterial({ color: 0x15181a, metalness: 0.35, roughness: 0.55 }),
    ceramique: new THREE.MeshPhysicalMaterial({ color: 0xfbfaf7, roughness: 0.12, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04 }),
    miroir: new THREE.MeshStandardMaterial({ color: 0x9fadb2, metalness: 1, roughness: 0.075, envMapIntensity: 0.85 }),
    verre: new THREE.MeshPhysicalMaterial({
      color: 0xe6f4f0, metalness: 0, roughness: 0.02, transmission: 0.97,
      thickness: 0.006, ior: 1.5, transparent: true, envMapIntensity: 0.22
    }),
    verreDepoli: new THREE.MeshPhysicalMaterial({
      color: 0xeaf3f7, metalness: 0, roughness: 0.5, transmission: 0.82,
      thickness: 0.02, ior: 1.5, transparent: true, envMapIntensity: 0.6
    }),
    eau: new THREE.MeshPhysicalMaterial({
      color: 0x9fd8cb, metalness: 0, roughness: 0.06, transmission: 0.85,
      thickness: 0.35, ior: 1.33, transparent: true, envMapIntensity: 0.8
    }),
    textile: new THREE.MeshStandardMaterial({ color: 0xd6ccb9, roughness: 0.95 }),
    textileB: new THREE.MeshStandardMaterial({ color: 0xb6c2ba, roughness: 0.95 }),
    feuille: new THREE.MeshStandardMaterial({ color: 0x18452e, roughness: 0.66, side: THREE.DoubleSide, envMapIntensity: 0.35 }),
    feuilleC: new THREE.MeshStandardMaterial({ color: 0x44793f, roughness: 0.75, side: THREE.DoubleSide, envMapIntensity: 0.35 }),
    tige: new THREE.MeshStandardMaterial({ color: 0x2f5a35, roughness: 0.85 }),
    pot: new THREE.MeshStandardMaterial({ color: 0x8e8e88, roughness: 0.92 }),
    terre: new THREE.MeshStandardMaterial({ color: 0x2c2f2e, roughness: 0.85 }),
    led: new THREE.MeshStandardMaterial({ color: 0xfff3dd, emissive: 0xffe9c4, emissiveIntensity: 2.2, roughness: 1 }),
    jour: new THREE.MeshBasicMaterial({ color: 0xf6fbff })
  };
}

/* =======================================================================
   4. PRIMITIVES
   ======================================================================= */
function uvMetres(geo) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let u, v;
    if (nx >= ny && nx >= nz) { u = z; v = y; }
    else if (ny >= nx && ny >= nz) { u = x; v = z; }
    else { u = x; v = y; }
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
  return geo;
}
function creerBoite(parent, w, h, d, mat, x, y, z) {
  const m = new THREE.Mesh(uvMetres(new THREE.BoxGeometry(w, h, d)), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function creerCyl(parent, r1, r2, h, mat, x, y, z, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), mat);
  m.position.set(x, y, z);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
  return m;
}
function tige(parent, a, b, r, mat) {
  const d = new THREE.Vector3().subVectors(b, a), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, L, 7), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize());
  m.castShadow = true;
  parent.add(m);
  return m;
}
function panneau(parent, w, h, mat, trous, x0 = 0) {
  const s = new THREE.Shape();
  s.moveTo(x0, 0); s.lineTo(x0 + w, 0); s.lineTo(x0 + w, h); s.lineTo(x0, h); s.closePath();
  (trous ?? []).forEach(([x, y, ww, hh]) => {
    const p = new THREE.Path();
    p.moveTo(x, y); p.lineTo(x + ww, y); p.lineTo(x + ww, y + hh); p.lineTo(x, y + hh); p.closePath();
    s.holes.push(p);
  });
  const g = new THREE.ShapeGeometry(s);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/* =======================================================================
   5. VÉGÉTATION
   ======================================================================= */
function feuilleGeo(l, w, fenetres, pointe) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(w * 0.58, l * 0.1, w * 0.54, l * 0.62, 0, l);
  s.bezierCurveTo(-w * 0.54, l * 0.62, -w * 0.58, l * 0.1, 0, 0);
  for (let i = 0; i < (fenetres ?? 0); i++) {
    const t = 0.24 + i * (0.5 / fenetres), cote = (i % 2) ? 1 : -1;
    const h = new THREE.Path();
    h.absellipse(cote * w * 0.19, l * t, w * 0.125, l * 0.055, 0, Math.PI * 2, true);
    s.holes.push(h);
  }
  const g = new THREE.ShapeGeometry(s, 16), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -(x / w) * (x / w) * w * 0.55 - Math.pow(y / l, 3) * l * (pointe ?? 0.16));
  }
  g.computeVertexNormals();
  return g;
}
const M4 = new THREE.Matrix4(), QQ = new THREE.Quaternion(), S1 = new THREE.Vector3(1, 1, 1);
function pousser(liste, geo, pos, rot, ech) {
  const g = geo.clone();
  QQ.setFromEuler(rot);
  g.applyMatrix4(M4.compose(pos, QQ, ech ?? S1));
  liste.push(g);
}
function fusionner(parent, liste, mat) {
  if (!liste.length) return;
  const m = new THREE.Mesh(mergeGeometries(liste, false), mat);
  m.castShadow = m.receiveShadow = true;
  parent.add(m);
}
function monstera(parent, M, x, z, ech) {
  const p = new THREE.Group(); parent.add(p);
  p.position.set(x, 0, z); p.scale.setScalar(ech);
  creerCyl(p, 0.17, 0.135, 0.36, M.pot, 0, 0.18, 0, 26);
  creerCyl(p, 0.155, 0.155, 0.02, M.terre, 0, 0.355, 0, 24);
  const f = [], gF = feuilleGeo(0.4, 0.34, 4, 0.22);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2 + Math.random() * 0.5;
    const h = 0.38 + Math.random() * 0.5, r = 0.1 + h * 0.26;
    tige(p, new THREE.Vector3(Math.cos(a) * 0.05, 0.34, Math.sin(a) * 0.05),
      new THREE.Vector3(Math.cos(a) * r, 0.34 + h, Math.sin(a) * r), 0.011, M.tige);
    pousser(f, gF, new THREE.Vector3(Math.cos(a) * r, 0.34 + h, Math.sin(a) * r),
      new THREE.Euler(-1.05 - Math.random() * 0.35, -a + Math.PI / 2, 0),
      new THREE.Vector3(1, 1, 1).multiplyScalar(0.8 + Math.random() * 0.45));
  }
  fusionner(p, f, M.feuille);
}
function sansevieria(parent, M, x, z, ech) {
  const p = new THREE.Group(); parent.add(p);
  p.position.set(x, 0, z); p.scale.setScalar(ech);
  creerCyl(p, 0.155, 0.135, 0.3, M.pot, 0, 0.15, 0, 22);
  creerCyl(p, 0.142, 0.142, 0.02, M.terre, 0, 0.295, 0, 20);
  const l = [], gL = feuilleGeo(0.86, 0.085, 0, 0.05);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + Math.random() * 0.4, r = 0.02 + Math.random() * 0.055;
    pousser(l, gL, new THREE.Vector3(Math.cos(a) * r, 0.29, Math.sin(a) * r),
      new THREE.Euler(-0.1 - Math.random() * 0.16, -a + Math.PI / 2, (Math.random() - 0.5) * 0.3),
      new THREE.Vector3(1, 1, 1).multiplyScalar(0.62 + Math.random() * 0.55));
  }
  fusionner(p, l, M.feuille);
}
function suspension(parent, M, x, z, y, H) {
  const p = new THREE.Group(); parent.add(p);
  p.position.set(x, 0, z);
  creerCyl(p, 0.13, 0.105, 0.14, M.bois, 0, y, 0, 20);
  creerCyl(p, 0.12, 0.12, 0.015, M.terre, 0, y + 0.058, 0, 18);
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2;
    tige(p, new THREE.Vector3(Math.cos(a) * 0.11, y + 0.055, Math.sin(a) * 0.11),
      new THREE.Vector3(0, H - 0.02, 0), 0.004, M.metalMat);
  }
  const f = [], t = [], gF = feuilleGeo(0.11, 0.09, 0, 0.1);
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2 + Math.random() * 0.6;
    const L = 0.45 + Math.random() * 0.5, r0 = 0.1 + Math.random() * 0.05, y0 = y + 0.05;
    const c = new THREE.CatmullRomCurve3([
      new THREE.Vector3(Math.cos(a) * 0.05, y0, Math.sin(a) * 0.05),
      new THREE.Vector3(Math.cos(a) * r0, y0 - 0.06, Math.sin(a) * r0),
      new THREE.Vector3(Math.cos(a) * (r0 + 0.05), y0 - L * 0.45, Math.sin(a) * (r0 + 0.05)),
      new THREE.Vector3(Math.cos(a) * (r0 - 0.02), y0 - L * 0.78, Math.sin(a) * (r0 - 0.02)),
      new THREE.Vector3(Math.cos(a) * (r0 + 0.03), y0 - L, Math.sin(a) * (r0 + 0.03))
    ]);
    t.push(new THREE.TubeGeometry(c, 16, 0.006, 5, false));
    for (let k = 0; k < 6; k++) {
      pousser(f, gF, c.getPointAt(0.12 + k * 0.145),
        new THREE.Euler(-1.5 - Math.random() * 0.6, k * 2.1 + a, 0),
        new THREE.Vector3(1, 1, 1).multiplyScalar(0.75 + Math.random() * 0.5));
    }
  }
  fusionner(p, t, M.tige);
  fusionner(p, f, M.feuilleC);
}

/* =======================================================================
   6. ÉQUIPEMENTS
   ======================================================================= */
function meubleVasque(g, M, x0, z0, longueur, prof, cote) {
  /* cote = +1 : adossé au mur x=0 (le meuble s'étend vers +x) */
  const h = 0.45, bas = 0.45, plan = 0.9;
  const cx = x0 + cote * prof / 2, zc = z0 + longueur / 2;
  creerBoite(g, prof, h, longueur, M.bois, cx, bas + h / 2, zc);
  creerBoite(g, prof + 0.04, 0.04, longueur + 0.08, M.pierre, cx, plan - 0.02, zc);
  creerBoite(g, prof * 0.85, 0.012, longueur - 0.06, M.led, cx, bas - 0.01, zc);
  const nb = longueur > 1.2 ? 2 : 1;
  for (let i = 0; i < nb; i++) {
    const lz = longueur / nb - 0.02;
    const z = z0 + longueur / nb * (i + 0.5);
    creerBoite(g, 0.015, 0.19, lz, M.bois, x0 + cote * (prof + 0.008), 0.78, z);
    creerBoite(g, 0.02, 0.012, lz - 0.04, M.metal, x0 + cote * (prof + 0.012), 0.665, z);
  }
  /* vasques */
  for (let i = 0; i < nb; i++) {
    const zc2 = z0 + longueur / nb * (i + 0.5);
    const bx = Math.min(0.4, prof - 0.1), bz = Math.min(0.6, longueur / nb - 0.2), e = 0.013, hb = 0.12, y0 = 0.94;
    const cx2 = x0 + cote * (prof / 2 + 0.02);
    creerBoite(g, bx, 0.012, bz, M.ceramique, cx2, y0, zc2);
    creerBoite(g, e, hb, bz, M.ceramique, cx2 - bx / 2, y0 + hb / 2, zc2);
    creerBoite(g, e, hb, bz, M.ceramique, cx2 + bx / 2, y0 + hb / 2, zc2);
    creerBoite(g, bx, hb, e, M.ceramique, cx2, y0 + hb / 2, zc2 - bz / 2);
    creerBoite(g, bx, hb, e, M.ceramique, cx2, y0 + hb / 2, zc2 + bz / 2);
    /* mitigeur mural */
    creerCyl(g, 0.026, 0.026, 0.05, M.metal, x0 + cote * 0.025, 1.22, zc2, 18).rotation.z = Math.PI / 2;
    creerCyl(g, 0.016, 0.016, 0.22, M.metal, x0 + cote * 0.14, 1.22, zc2, 14).rotation.z = Math.PI / 2;
  }
  /* miroir */
  const hm = Math.min(1.5, 0.9 + longueur * 0.3);
  const ym = 1.35 + hm / 2;
  const halo = creerBoite(g, 0.012, hm + 0.1, longueur - 0.06, M.led, x0 + cote * 0.006, ym, zc);
  const glace = creerBoite(g, 0.012, hm, longueur - 0.1, M.miroir, x0 + cote * 0.03, ym, zc);
  return { hauteurMiroir: ym + hm / 2, mural: [halo, glace] };
}

function wcSuspendu(g, M, x, z, orientation) {
  /* orientation : 'x+' le WC regarde vers +x, adossé au mur x */
  const p = new THREE.Group(); g.add(p);
  p.position.set(x, 0, z);
  if (orientation === 'z+') p.rotation.y = -Math.PI / 2;
  creerBoite(p, 0.22, 1.05, 0.8, M.faience, 0.11, 0.525, 0);
  creerBoite(p, 0.26, 0.03, 0.84, M.pierre, 0.13, 1.065, 0);
  creerBoite(p, 0.54, 0.3, 0.37, M.ceramique, 0.49, 0.545, 0);
  creerBoite(p, 0.5, 0.022, 0.35, M.ceramique, 0.47, 0.706, 0);
  creerBoite(p, 0.06, 0.14, 0.2, M.metal, 0.245, 0.9, 0);
  return p;
}

function baignoireIlot(g, M, cx, cz, longueur, largeur, angle) {
  const pts = [
    [0, 0], [0.2, 0], [0.28, 0.045], [0.325, 0.16], [0.348, 0.34], [0.355, 0.53],
    [0.352, 0.555], [0.332, 0.558], [0.322, 0.53], [0.305, 0.33], [0.268, 0.14],
    [0.2, 0.075], [0.05, 0.062], [0, 0.06]
  ].map(v => new THREE.Vector2(v[0], v[1]));
  const geo = new THREE.LatheGeometry(pts, 56);
  geo.scale(longueur / 0.71, 1, largeur / 0.71);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
    color: 0xf7f6f2, roughness: 0.1, metalness: 0, clearcoat: 1,
    clearcoatRoughness: 0.03, side: THREE.DoubleSide, envMapIntensity: 1.1
  }));
  m.position.set(cx, 0, cz);
  m.rotation.y = angle ?? 0;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}

function cielDePluie(g, M, x, z, hauteur, mural, murZ) {
  if (mural) {
    const arm = creerCyl(g, 0.018, 0.018, 0.46, M.metal, x, hauteur, murZ - 0.23, 14);
    arm.rotation.x = Math.PI / 2;
    creerBoite(g, 0.11, 0.11, 0.03, M.metal, x, hauteur, murZ - 0.015);
    creerCyl(g, 0.15, 0.15, 0.028, M.metal, x, hauteur - 0.015, murZ - 0.45, 32);
    creerCyl(g, 0.142, 0.142, 0.006, M.noir, x, hauteur - 0.032, murZ - 0.45, 32);
  } else {
    creerCyl(g, 0.05, 0.05, 0.02, M.metal, x, hauteur + 0.6, z, 18);
    creerCyl(g, 0.022, 0.022, 0.6, M.metal, x, hauteur + 0.3, z, 12);
    creerBoite(g, 0.4, 0.045, 0.4, M.metal, x, hauteur, z);
    creerBoite(g, 0.37, 0.012, 0.37, M.noir, x, hauteur - 0.024, z);
  }
}

function robinetterieDouche(g, M, x, murZ) {
  creerCyl(g, 0.026, 0.026, 0.05, M.metal, x, 1.05, murZ - 0.02, 16).rotation.x = Math.PI / 2;
  creerBoite(g, 0.3, 0.055, 0.055, M.metal, x, 1.05, murZ - 0.04);
  creerCyl(g, 0.012, 0.012, 0.85, M.metal, x, 1.52, murZ - 0.045, 12);
  const d = creerCyl(g, 0.026, 0.032, 0.2, M.metal, x - 0.07, 1.72, murZ - 0.1, 14);
  d.rotation.set(0.35, 0, 0.35);
}

function niche(g, M, x, z, largeur, hauteur, y, normale) {
  /* normale : 'z' (mur du fond) */
  const prof = 0.11;
  creerBoite(g, largeur, 0.012, prof, M.mosaique, x, y, z + prof / 2);
  creerBoite(g, largeur, 0.012, prof, M.mosaique, x, y + hauteur, z + prof / 2);
  creerBoite(g, 0.012, hauteur, prof, M.mosaique, x - largeur / 2, y + hauteur / 2, z + prof / 2);
  creerBoite(g, 0.012, hauteur, prof, M.mosaique, x + largeur / 2, y + hauteur / 2, z + prof / 2);
  creerBoite(g, largeur, hauteur, 0.012, M.faience, x, y + hauteur / 2, z + prof);
  creerBoite(g, largeur - 0.05, 0.012, 0.02, M.led, x, y + hauteur - 0.02, z + 0.03);
  creerCyl(g, 0.032, 0.032, 0.19, M.ceramique, x - 0.18, y + 0.105, z + 0.06, 16);
  creerCyl(g, 0.028, 0.028, 0.15, M.terre, x - 0.06, y + 0.085, z + 0.06, 16);
  creerCyl(g, 0.035, 0.035, 0.22, M.metalMat, x + 0.16, y + 0.12, z + 0.06, 16);
}

/* =======================================================================
   7. AGENCEMENTS
   ======================================================================= */
function agencement(g, M, cfg, W, D, H, murs) {
  const parti = cfg.parti;
  const opt = cfg.options ?? {};
  const bandeau = H >= 3 ? 2.6 : Math.max(1.9, H - 0.35);
  const resume = { elements: [], alertes: [], postes: [] };

  if (parti === 'traversante') {
    /* --- douche sur toute la largeur, au fond --- */
    const prof = Math.max(0.9, Math.min(1.35, D * 0.36));
    const z0 = D - prof;
    const bac = panneau(g, W, prof, M.mosaique);
    bac.rotation.x = -Math.PI / 2; bac.position.set(0, 0.004, D);
    const entree = Math.min(0.95, W * 0.34);
    const verre = creerBoite(g, W - entree, 2.05, 0.008, M.verre, entree + (W - entree) / 2, 1.025, z0);
    verre.castShadow = false;
    creerBoite(g, W - entree, 0.02, 0.03, M.metal, entree + (W - entree) / 2, 0.012, z0);
    creerBoite(g, W - entree + 0.02, 0.025, 0.025, M.metal, entree + (W - entree) / 2, 2.05, z0);
    creerBoite(g, 1.05, 0.012, 0.075, M.metal, W / 2, 0.01, D - 0.055);
    cielDePluie(g, M, W * 0.3, 0, Math.min(2.35, H - 0.3), true, D);
    cielDePluie(g, M, W * 0.72, 0, Math.min(2.35, H - 0.3), true, D);
    robinetterieDouche(g, M, W * 0.5, D);
    if (prof > 0.95) {
      const lb = Math.min(0.6, W * 0.22);
      creerBoite(g, lb, 0.45, prof - 0.1, M.bois, W - lb / 2, 0.225, z0 + prof / 2 + 0.05);
      resume.elements.push('Banc maçonné ' + lb.toFixed(2).replace('.', ',') + ' m');
    }
    niche(g, M, W * 0.5, D, Math.min(0.8, W * 0.3), 0.32, 1.1);
    resume.elements.push('Douche traversante ' + W.toFixed(2).replace('.', ',') + ' × ' + prof.toFixed(2).replace('.', ',') + ' m');
    resume.postes.push('douche');

    const lv = Math.min(1.6, Math.max(0.6, z0 - 0.9));
    if (lv >= 0.6) {
      const v = meubleVasque(g, M, 0, 0.45, lv, 0.5, 1);
      if (murs[0]) murs[0].extras.push(...v.mural);
      resume.elements.push((lv > 1.2 ? 'Double vasque ' : 'Vasque ') + lv.toFixed(2).replace('.', ',') + ' m');
      resume.postes.push('vasque');
    }
    if (opt.wc !== false && W >= 2.2) {
      wcSuspendu(g, M, W, 0.65, 'x-').rotation.y = Math.PI;
      resume.elements.push('WC suspendu');
      resume.postes.push('wc');
    }
    if (opt.plantes !== false) {
      monstera(g, M, Math.min(W - 0.4, 0.42), Math.max(0.4, z0 - 0.45), 0.7);
      if (H >= 2.7) suspension(g, M, W - 0.45, 0.5, H - 1.15, H);
    }
  }

  else if (parti === 'wetroom') {
    /* --- pas de paroi, estrade + ofuro --- */
    const lE = Math.min(1.8, W * 0.6), pE = Math.min(1.3, D * 0.45), hE = 0.55;
    const z0 = D - pE;
    creerBoite(g, 0.22, hE, pE, M.bois, 0.11, hE / 2, z0 + pE / 2);
    const bx0 = 0.28, bx1 = Math.min(lE - 0.28, bx0 + 1.25), ep = 0.055;
    const oz0 = z0 + 0.4;
    creerBoite(g, lE - bx1 - ep, hE, pE, M.bois, (bx1 + ep + lE) / 2, hE / 2, z0 + pE / 2);
    creerBoite(g, bx1 - bx0 + 2 * ep, hE, oz0 - z0, M.bois, (bx0 + bx1) / 2, hE / 2, (z0 + oz0) / 2);
    creerBoite(g, bx1 - bx0, 0.012, D - oz0 - ep, M.faience, (bx0 + bx1) / 2, 0.006, (oz0 + ep + D) / 2);
    creerBoite(g, ep, hE, D - oz0, M.faience, bx0 - ep / 2, hE / 2, (oz0 + D) / 2);
    creerBoite(g, ep, hE, D - oz0, M.faience, bx1 + ep / 2, hE / 2, (oz0 + D) / 2);
    creerBoite(g, bx1 - bx0 + 2 * ep, hE, ep, M.faience, (bx0 + bx1) / 2, hE / 2, oz0 + ep / 2);
    const eau = creerBoite(g, bx1 - bx0 - 0.01, 0.005, D - oz0 - ep - 0.01, M.eau, (bx0 + bx1) / 2, 0.42, (oz0 + ep + D) / 2);
    eau.castShadow = false;
    creerBoite(g, lE, 0.02, 0.02, M.led, lE / 2, 0.05, z0 - 0.005);
    creerBoite(g, 0.9, 0.27, 0.32, M.bois, Math.min(0.9, lE / 2), 0.135, z0 - 0.16);
    resume.elements.push('Ofuro ' + (bx1 - bx0).toFixed(2).replace('.', ',') + ' × ' + (D - oz0 - ep).toFixed(2).replace('.', ',') + ' m, profondeur 0,55 m');
    resume.postes.push('ofuro', 'douche');

    creerBoite(g, Math.min(1.05, W * 0.4), 0.02, 0.085, M.metal, W * 0.7, 0.004, D * 0.5);
    cielDePluie(g, M, W - 0.7, D - pE - 0.55, Math.min(2.3, H - 0.45), false);
    robinetterieDouche(g, M, W - 0.02, D - pE - 0.25);
    niche(g, M, Math.min(lE - 0.3, 0.75), D, Math.min(0.85, lE * 0.5), 0.3, 0.95);

    const lc = Math.min(1.3, Math.max(0.6, D - pE - 0.9));
    if (lc >= 0.6) {
      const v = meubleVasque(g, M, W, 0.4, lc, 0.55, -1);
      if (murs[1]) murs[1].extras.push(...v.mural);
      resume.elements.push('Console monolithe ' + lc.toFixed(2).replace('.', ',') + ' m');
      resume.postes.push('vasque');
    }
    if (opt.wc !== false) {
      const p = wcSuspendu(g, M, 0, 0.45, 'x+');
      resume.elements.push('WC suspendu derrière claustra');
      resume.postes.push('wc', 'claustra');
      const cl = new THREE.Group(); g.add(cl);
      for (let i = 0; i < 10; i++) creerBoite(cl, 0.045, 1.9, 0.045, M.bois, 0.95, 0.95, 0.05 + i * 0.085);
      creerBoite(cl, 0.06, 0.05, 0.9, M.bois, 0.95, 1.925, 0.47);
    }
    if (opt.plantes !== false) {
      monstera(g, M, Math.min(1.3, W * 0.45), Math.max(0.45, D * 0.2), 0.7);
      if (H >= 2.7) suspension(g, M, Math.min(0.8, W * 0.3), D - pE * 0.6, H - 1.1, H);
    }
    resume.alertes.push('Étanchéité sous carrelage sur tout le sol et 2 m de mur, VMC renforcée.');
  }

  else {
    /* --- spa : douche d'angle + baignoire si la place le permet --- */
    const s = Math.max(0.85, Math.min(1.5, Math.min(W, D) * 0.46));
    const x0 = W - s, z0 = D - s;
    const bac = panneau(g, s, s, M.mosaique);
    bac.rotation.x = -Math.PI / 2; bac.position.set(x0, 0.004, D);
    const p1 = creerBoite(g, s, 2.05, 0.008, M.verre, x0 + s / 2, 1.025, z0); p1.castShadow = false;
    const retour = Math.max(0.3, s - 0.7);
    const p2 = creerBoite(g, 0.008, 2.05, retour, M.verre, x0, 1.025, D - retour / 2); p2.castShadow = false;
    creerBoite(g, s, 0.02, 0.03, M.metal, x0 + s / 2, 0.012, z0);
    creerBoite(g, s + 0.02, 0.025, 0.025, M.metal, x0 + s / 2, 2.05, z0);
    creerBoite(g, 0.025, 0.025, retour, M.metal, x0, 2.05, D - retour / 2);
    creerBoite(g, Math.min(1, s * 0.7), 0.012, 0.075, M.metal, x0 + s / 2, 0.01, D - 0.055);
    cielDePluie(g, M, x0 + s / 2, 0, Math.min(2.35, H - 0.3), true, D);
    robinetterieDouche(g, M, x0 + s * 0.28, D);
    niche(g, M, x0 + s / 2, D, Math.min(0.7, s * 0.5), 0.32, 1.1);
    resume.elements.push('Douche à l’italienne ' + s.toFixed(2).replace('.', ',') + ' × ' + s.toFixed(2).replace('.', ',') + ' m');
    resume.postes.push('douche');

    const zWC = opt.wc !== false ? 0.85 : 0;
    const lv = Math.min(1.6, Math.max(0.6, D - 0.55 - zWC - 0.15));
    if (lv >= 0.6) {
      const v = meubleVasque(g, M, 0, 0.55, lv, 0.5, 1);
      if (murs[0]) murs[0].extras.push(...v.mural);
      resume.elements.push((lv > 1.2 ? 'Double vasque ' : 'Vasque ') + lv.toFixed(2).replace('.', ',') + ' m');
      resume.postes.push('vasque');
    } else resume.alertes.push('Pièce trop étroite pour un meuble vasque standard.');

    if (opt.wc !== false) {
      wcSuspendu(g, M, 0, D - 0.4, 'x+');
      resume.elements.push('WC suspendu');
      resume.postes.push('wc');
    }

    const largeurLibre = x0;
    const profLibre = z0;
    if (opt.baignoire !== false && largeurLibre >= 1.5 && profLibre >= 0.95 && W * D >= 5) {
      const lb = Math.min(1.7, largeurLibre - 0.12), la = Math.min(0.78, profLibre - 0.1);
      baignoireIlot(g, M, W - 0.08 - lb / 2, 0.12 + la / 2, lb, la, 0);
      creerCyl(g, 0.055, 0.055, 0.012, M.metal, W - 0.12 - lb, 0.006, 0.12 + la / 2, 20);
      creerCyl(g, 0.024, 0.024, 1, M.metal, W - 0.12 - lb, 0.5, 0.12 + la / 2, 16);
      creerCyl(g, 0.018, 0.018, 0.26, M.metal, W - 0.12 - lb + 0.13, 0.99, 0.12 + la / 2, 14).rotation.z = Math.PI / 2;
      resume.elements.push('Baignoire îlot ' + lb.toFixed(2).replace('.', ',') + ' × ' + la.toFixed(2).replace('.', ',') + ' m');
      resume.postes.push('baignoire');
    } else if (opt.baignoire !== false) {
      resume.alertes.push('Pas assez de place pour une baignoire îlot : douche seule.');
    }
    if (W * D < 4) resume.alertes.push('Moins de 4 m² : vérifier la circulation devant chaque appareil.');

    if (opt.plantes !== false) {
      const px = Math.min(x0 - 0.35, 0.75), pz = Math.max(0.5, z0 - 0.4);
      if (px > 0.5) monstera(g, M, px, pz, 0.65);
      if (H >= 2.7) suspension(g, M, Math.max(0.5, x0 - 0.3), Math.max(0.45, D * 0.18), H - 1.2, H);
    }
  }
  return resume;
}

/* =======================================================================
   8. CONSTRUCTION DE LA PIÈCE
   ======================================================================= */
function construire(cfg) {
  const M = materiaux(cfg);
  const racine = new THREE.Group();
  const murs = [];
  const pivot = cfg.porte.mur;
  const L = cfg.piece.L, P = cfg.piece.P, H = cfg.piece.H;
  /* la scène est toujours bâtie porte au sud (z=0), puis pivotée */
  const tourne = (pivot === 'gauche' || pivot === 'droite');
  const W = tourne ? P : L;
  const D = tourne ? L : P;
  const g = new THREE.Group();
  racine.add(g);
  if (pivot === 'fond') { g.rotation.y = Math.PI; g.position.set(L, 0, P); }
  else if (pivot === 'gauche') { g.rotation.y = Math.PI / 2; g.position.set(0, 0, P); }
  else if (pivot === 'droite') { g.rotation.y = -Math.PI / 2; g.position.set(L, 0, 0); }

  const bandeau = H >= 3 ? 2.6 : Math.max(1.9, H - 0.35);
  const lp = 0.9;
  const px = Math.max(0.08, Math.min(W - lp - 0.08, (W - lp) * (cfg.porte.position ?? 0.5)));
  const hp = Math.min(2.15, H - 0.25);

  /* sol */
  const sol = panneau(g, W, D, M.sol);
  sol.rotation.x = -Math.PI / 2; sol.position.set(0, 0, D);
  creerBoite(g, W + 0.24, 0.12, D + 0.24,
    new THREE.MeshStandardMaterial({ color: 0x1b1f21, roughness: 0.9 }), W / 2, -0.062, D / 2);

  /* murs : faïence en bas, enduit au-dessus */
  function mur(long, trousBas, nx, ny, nz, cx, cy, cz, rotY, pos, posHaut) {
    const bas = panneau(g, long, bandeau, M.faience, trousBas);
    bas.rotation.y = rotY; bas.position.copy(pos);
    const rec = { mesh: bas, n: new THREE.Vector3(nx, ny, nz), c: new THREE.Vector3(cx, cy, cz), extras: [] };
    if (H - bandeau > 0.02) {
      const haut = panneau(g, long, H - bandeau, M.haut);
      haut.rotation.y = rotY; haut.position.copy(posHaut);
      rec.extras.push(haut);
    }
    murs.push(rec);
    return rec;
  }
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  mur(D, null, 1, 0, 0, 0, H / 2, D / 2, Math.PI / 2, V(0, 0, D), V(0, bandeau, D));
  const trousDroite = (cfg.options?.verriere && H >= 2.4)
    ? [[Math.max(0.2, D * 0.15), Math.min(1.25, bandeau - 0.9), 0.6, Math.min(1.1, bandeau - 1.35)]] : null;
  mur(D, trousDroite, -1, 0, 0, W, H / 2, D / 2, -Math.PI / 2, V(W, 0, 0), V(W, bandeau, 0));
  mur(W, null, 0, 0, -1, W / 2, H / 2, D, Math.PI, V(W, 0, D), V(W, bandeau, D));
  mur(W, [[px, 0.004, lp, hp - 0.004]], 0, 0, 1, W / 2, H / 2, 0, 0, V(0, 0, 0), V(0, bandeau, 0));

  /* plafond */
  const plaf = panneau(g, W, D, M.plafond);
  plaf.rotation.x = Math.PI / 2; plaf.position.set(0, H, 0);
  murs.push({ mesh: plaf, n: new THREE.Vector3(0, -1, 0), c: new THREE.Vector3(W / 2, H, D / 2), extras: [] });

  /* listel */
  if (H - bandeau > 0.02) {
    creerBoite(g, W, 0.012, 0.02, M.metal, W / 2, bandeau, 0.01);
    creerBoite(g, W, 0.012, 0.02, M.metal, W / 2, bandeau, D - 0.01);
    creerBoite(g, 0.02, 0.012, D, M.metal, 0.01, bandeau, D / 2);
    creerBoite(g, 0.02, 0.012, D, M.metal, W - 0.01, bandeau, D / 2);
  }

  /* huisserie + vantail */
  const porteG = new THREE.Group(); g.add(porteG);
  creerBoite(porteG, 0.04, hp + 0.04, 0.14, M.metal, px - 0.02, (hp + 0.04) / 2, 0);
  creerBoite(porteG, 0.04, hp + 0.04, 0.14, M.metal, px + lp + 0.02, (hp + 0.04) / 2, 0);
  creerBoite(porteG, lp + 0.08, 0.04, 0.14, M.metal, px + lp / 2, hp + 0.02, 0);
  creerBoite(porteG, lp, hp, 0.02, M.noir, px + lp / 2, hp / 2, -0.06);
  murs[3].extras.push(porteG);

  /* verrière */
  if (trousDroite) {
    const [zf, yf, wf, hf] = trousDroite[0];
    const f = new THREE.Group(); g.add(f); murs[1].extras.push(f);
    creerBoite(f, 0.045, hf + 0.08, 0.05, M.metalMat, W - 0.02, yf + hf / 2, zf);
    creerBoite(f, 0.045, hf + 0.08, 0.05, M.metalMat, W - 0.02, yf + hf / 2, zf + wf);
    creerBoite(f, 0.05, 0.045, wf + 0.06, M.metalMat, W - 0.02, yf, zf + wf / 2);
    creerBoite(f, 0.05, 0.045, wf + 0.06, M.metalMat, W - 0.02, yf + hf, zf + wf / 2);
    creerBoite(f, 0.04, 0.03, wf, M.metalMat, W - 0.02, yf + hf / 2, zf + wf / 2);
    const v = creerBoite(f, 0.012, hf, wf, M.verreDepoli, W - 0.03, yf + hf / 2, zf + wf / 2);
    v.castShadow = false;
    const j = creerBoite(f, 0.02, hf + 0.1, wf + 0.1, M.jour, W + 0.1, yf + hf / 2, zf + wf / 2);
    j.castShadow = j.receiveShadow = false;
  }

  /* spots */
  const nx = W > 2.4 ? 2 : 1, nz = D > 2.4 ? 2 : 1;
  for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
    const x = W * (i + 0.5) / nx, z = D * (k + 0.5) / nz;
    creerCyl(g, 0.055, 0.055, 0.012, M.noir, x, H - 0.012, z, 18);
    creerCyl(g, 0.044, 0.044, 0.006, M.led, x, H - 0.02, z, 18);
  }

  const resume = agencement(g, M, cfg, W, D, H, murs);

  /* ---- métré : tout est déduit de la géométrie réellement construite ---- */
  const aireOuvertures = lp * Math.min(hp, bandeau)
    + (trousDroite ? trousDroite[0][2] * Math.max(0, Math.min(bandeau, trousDroite[0][1] + trousDroite[0][3]) - trousDroite[0][1]) : 0);
  const perimetre = 2 * (W + D);
  const solM2 = W * D;
  const faienceM2 = Math.max(0, perimetre * bandeau - aireOuvertures);
  const enduitM2 = Math.max(0, perimetre * (H - bandeau));
  const zoneHumide = cfg.parti === 'wetroom' ? solM2 : Math.min(solM2, 2.2);
  resume.metre = {
    solM2, faienceM2, enduitM2, perimetre, bandeau,
    volumeM3: solM2 * H,
    carrelageM2: faienceM2 + solM2,
    carreaux: Math.ceil((faienceM2 + zoneHumide) * 100 * 1.08),
    etancheiteM2: cfg.parti === 'wetroom' ? solM2 + perimetre * 2 : zoneHumide + Math.sqrt(zoneHumide) * 2 * 2,
    ouverturesM2: aireOuvertures
  };
  if (cfg.options?.verriere && trousDroite) resume.postes.push('verriere');
  resume.postes.push('depose');

  return { racine, groupe: g, murs, M, W, D, H, resume, dims: { L, P, H } };
}

/* =======================================================================
   8 bis. ESTIMATION
   Fourchette indicative de fournitures et de pose, jamais un devis.
   ======================================================================= */
const LIBELLES = {
  douche: 'Douche : receveur de plain-pied, paroi, robinetterie',
  baignoire: 'Baignoire îlot et robinetterie',
  vasque: 'Meuble vasque, plan, mitigeur, miroir',
  wc: 'WC suspendu, bâti-support, plaque',
  ofuro: 'Bain japonais encastré et estrade',
  claustra: 'Claustra bois',
  verriere: 'Fenêtre haute / verrière',
  depose: 'Dépose de l’existant et évacuation'
};

export function estimer(resume, cfg, tarifs = {}) {
  const t = { ...TARIFS, ...tarifs };
  const m = resume.metre;
  const f = FAIENCES[cfg.materiaux.faience] ?? FAIENCES.emeraude;
  const coef = (METAUX[cfg.materiaux.metal] ?? METAUX.chrome).coef;
  const prixFaience = Number(t.faience) > 0 ? Number(t.faience) : f.prix;
  const lignes = [];
  const ligne = (libelle, detail, montant) =>
    lignes.push({ libelle, detail, montant: Math.round(montant) });

  ligne('Faïence murale', `${arr(m.faienceM2)} m² × ${prixFaience} € (${f.nom.toLowerCase()}, ${f.format})`,
    m.faienceM2 * prixFaience);
  ligne('Revêtement de sol', `${arr(m.solM2)} m² × ${t.sol} €`, m.solM2 * t.sol);
  ligne('Étanchéité sous carrelage', `${arr(m.etancheiteM2)} m² × ${t.etancheite} €`,
    m.etancheiteM2 * t.etancheite);
  ligne('Pose du carrelage', `${arr(m.carrelageM2)} m² × ${t.poseM2} €`, m.carrelageM2 * t.poseM2);

  const vus = new Set();
  for (const p of resume.postes) {
    if (vus.has(p) || !t[p]) continue;
    vus.add(p);
    const majore = (p === 'douche' || p === 'baignoire' || p === 'vasque') ? coef : 1;
    ligne(LIBELLES[p] ?? p, majore > 1 ? `robinetterie ${(METAUX[cfg.materiaux.metal] ?? {}).nom?.toLowerCase() ?? ''}` : '',
      t[p] * majore);
  }
  const total = lignes.reduce((a, l) => a + l.montant, 0);
  return { lignes, total, bas: Math.round(total * 0.88 / 50) * 50, haut: Math.round(total * 1.18 / 50) * 50 };
}
const arr = (v) => v.toFixed(1).replace('.', ',');
export const euros = (v) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);

/* =======================================================================
   8 ter. MARQUEURS D'ANNOTATION
   ======================================================================= */
const cacheMarqueur = new Map();
function textureMarqueur(n, couleur) {
  const cle = n + '|' + couleur;
  if (cacheMarqueur.has(cle)) return cacheMarqueur.get(cle);
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 8, 0, Math.PI * 2);
  g.fillStyle = couleur; g.fill();
  g.lineWidth = 7; g.strokeStyle = 'rgba(255,255,255,.95)'; g.stroke();
  g.fillStyle = '#fff';
  g.font = '600 62px Archivo, Segoe UI, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(String(n), S / 2, S / 2 + 3);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  cacheMarqueur.set(cle, t);
  return t;
}

/* =======================================================================
   9. VUE
   ======================================================================= */
export function creerVue(hote, options = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.98;
  hote.appendChild(renderer.domElement);
  ANISO = renderer.capabilities.getMaxAnisotropy();
  RectAreaLightUniformsLib.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d0f11);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100);

  /* Chaîne de post-traitement : occlusion ambiante par GTAO, puis correction
     colorimétrique, puis anticrénelage SMAA (l'antialias matériel du contexte
     ne s'applique pas aux cibles de rendu du compositeur). */
  const composer = new EffectComposer(renderer);
  const passeRendu = new RenderPass(scene, camera);
  composer.addPass(passeRendu);
  const gtao = new GTAOPass(scene, camera, 1, 1);
  gtao.blendIntensity = 0.85;
  gtao.updateGtaoMaterial({
    radius: 0.22, distanceExponent: 1.2, thickness: 0.4,
    scale: 1.0, samples: 16, screenSpaceRadius: false
  });
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  const smaa = new SMAAPass(1, 1);
  composer.addPass(smaa);
  let qualiteHaute = !options.qualiteBasse;

  /* Étiquettes de cotation : du HTML positionné en 3D, donc toujours net */
  const rendu2D = new CSS2DRenderer();
  rendu2D.domElement.style.cssText =
    'position:absolute;inset:0;pointer-events:none;overflow:hidden';
  hote.appendChild(rendu2D.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);

  /* ---------------------------------------------------------- cotation --
     Lignes épaisses (Line2) parce qu'une ligne d'un pixel disparaît à
     l'impression, et étiquettes HTML pour rester lisibles à toute distance. */
  const materiauCote = new LineMaterial({
    color: 0xffffff, linewidth: 1.6, transparent: true, opacity: 0.75,
    depthTest: false, resolution: new THREE.Vector2(1, 1)
  });
  const groupeCotes = new THREE.Group();
  groupeCotes.visible = false;
  scene.add(groupeCotes);
  let cotesDemandees = false;

  function ligneCote(a, b) {
    const g = new LineGeometry();
    g.setPositions([a.x, a.y, a.z, b.x, b.y, b.z]);
    const l = new Line2(g, materiauCote);
    l.computeLineDistances();
    l.renderOrder = 998;
    groupeCotes.add(l);
    return l;
  }
  function etiquetteCote(texte, position) {
    const d = document.createElement('div');
    d.className = 'cote-3d';
    d.textContent = texte;
    d.style.cssText =
      'font:500 11px/1 Archivo,Segoe UI,sans-serif;color:#0f1412;background:rgba(255,255,255,.92);' +
      'border-radius:4px;padding:3px 6px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.28);' +
      'transform:translate(-50%,-50%);user-select:none';
    const o = new CSS2DObject(d);
    o.position.copy(position);
    groupeCotes.add(o);
    return o;
  }
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const metres = (v) => v.toFixed(2).replace('.', ',') + ' m';

  /* une cote = un trait, deux pattes d'extrémité, une étiquette au milieu */
  function coter(a, b, decalage, texte) {
    const d = new THREE.Vector3().subVectors(b, a);
    const perp = V3(-d.z, 0, d.x).normalize().multiplyScalar(decalage);
    const a2 = a.clone().add(perp), b2 = b.clone().add(perp);
    ligneCote(a2, b2);
    ligneCote(a, a2.clone().addScaledVector(perp.clone().normalize(), 0.06));
    ligneCote(b, b2.clone().addScaledVector(perp.clone().normalize(), 0.06));
    etiquetteCote(texte, a2.clone().lerp(b2, 0.5).setY(a2.y + 0.04));
  }

  function construireCotes() {
    for (const o of [...groupeCotes.children]) {
      groupeCotes.remove(o);
      if (o.isLine2) o.geometry.dispose();
      if (o.element) o.element.remove();
    }
    if (!piece) return;
    const { L, P, H } = piece.dims;
    const y = 0.015, e = 0.3;
    coter(V3(0, y, 0), V3(L, y, 0), -e, metres(L));
    coter(V3(L, y, 0), V3(L, y, P), -e, metres(P));
    /* hauteur sous plafond, en élévation dans l'angle libre */
    const x0 = -e, z0 = -e;
    ligneCote(V3(x0, 0, z0), V3(x0, H, z0));
    ligneCote(V3(x0 - 0.06, 0, z0), V3(x0 + 0.06, 0, z0));
    ligneCote(V3(x0 - 0.06, H, z0), V3(x0 + 0.06, H, z0));
    etiquetteCote('h. ' + metres(H), V3(x0, H / 2, z0));
    etiquetteCote(
      (L * P).toFixed(1).replace('.', ',') + ' m² au sol',
      V3(L / 2, y, P / 2)
    );
  }
  function afficherCotes(actif) {
    cotesDemandees = actif;
    if (actif && !groupeCotes.children.length) construireCotes();
    groupeCotes.visible = actif;
  }

  controls.enableDamping = true; controls.dampingFactor = 0.06;
  controls.minDistance = 0.5; controls.maxDistance = 25;
  controls.maxPolarAngle = Math.PI * 0.497;
  controls.autoRotateSpeed = 0.5;

  const hemi = new THREE.HemisphereLight(0xdfeaff, 0x50524c, 0.38);
  const amb = new THREE.AmbientLight(0xffffff, 0.12);
  const soleil = new THREE.DirectionalLight(0xfff2df, 1.85);
  soleil.castShadow = true;
  soleil.shadow.mapSize.set(2048, 2048);
  soleil.shadow.camera.near = 1; soleil.shadow.camera.far = 30;
  soleil.shadow.bias = -0.0006; soleil.shadow.normalBias = 0.02;
  scene.add(hemi, amb, soleil, soleil.target);
  const spots = [];

  let piece = null, nuit = false, cfgCourant = null;
  const groupeMarqueurs = new THREE.Group();
  scene.add(groupeMarqueurs);
  let listeMarqueurs = [], couleurMarqueur = '#0e6b52';
  let pointageActif = false, surPointage = null;
  const v3 = new THREE.Vector3(), nTmp = new THREE.Vector3(), cTmp = new THREE.Vector3();

  function vider(obj) {
    obj.traverse(o => {
      if (o.isMesh) {
        o.geometry.dispose();
        const l = Array.isArray(o.material) ? o.material : [o.material];
        l.forEach(m => { if (m && !m.userData.partage) m.dispose(); });
      }
    });
  }

  function maj(cfg) {
    cfgCourant = JSON.parse(JSON.stringify(cfg));
    if (piece) { scene.remove(piece.racine); vider(piece.racine); }
    spots.forEach(s => scene.remove(s, s.target));
    spots.length = 0;
    piece = construire(cfgCourant);
    scene.add(piece.racine);

    const { L, P, H } = piece.dims;
    soleil.position.set(L * 2.4, H * 2.2, P * 2.6);
    soleil.target.position.set(L / 2, H * 0.35, P / 2);
    const r = Math.max(L, P) * 1.1;
    soleil.shadow.camera.left = -r * 2; soleil.shadow.camera.right = r * 2;
    soleil.shadow.camera.top = r * 2.2; soleil.shadow.camera.bottom = -r;
    soleil.shadow.camera.updateProjectionMatrix();

    const nx = L > 2.4 ? 2 : 1, nz = P > 2.4 ? 2 : 1;
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      const sp = new THREE.SpotLight(0xfff4e6, 11, Math.max(6, H * 2), 0.62, 0.55, 1.6);
      sp.position.set(L * (i + 0.5) / nx, H - 0.05, P * (k + 0.5) / nz);
      sp.target.position.set(L * (i + 0.5) / nx, 0, P * (k + 0.5) / nz);
      scene.add(sp, sp.target);
      spots.push(sp);
    }
    ambiance(nuit);
    dessinerMarqueurs();
    if (cotesDemandees) construireCotes();
    return piece.resume;
  }

  function dessinerMarqueurs() {
    for (const m of [...groupeMarqueurs.children]) {
      groupeMarqueurs.remove(m);
      if (m.material.map) m.material.dispose();
    }
    listeMarqueurs.forEach((p, i) => {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: textureMarqueur(p.n ?? i + 1, couleurMarqueur),
        depthTest: false, transparent: true, sizeAttenuation: false
      }));
      sp.position.set(p.x, p.y, p.z);
      sp.scale.set(0.045, 0.045, 1);
      sp.renderOrder = 999;
      groupeMarqueurs.add(sp);
    });
  }

  /* clic dans la scène : on distingue le clic du glissé d'orbite */
  let depart = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { depart = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!pointageActif || !depart || !piece) return;
    const dx = e.clientX - depart[0], dy = e.clientY - depart[1];
    depart = null;
    if (dx * dx + dy * dy > 36) return;
    const r = renderer.domElement.getBoundingClientRect();
    const souris = new THREE.Vector2(
      ((e.clientX - r.left) / r.width) * 2 - 1,
      -((e.clientY - r.top) / r.height) * 2 + 1
    );
    const rayon = new THREE.Raycaster();
    rayon.setFromCamera(souris, camera);
    const touches = rayon.intersectObject(piece.racine, true)
      .filter(t => t.object.visible && t.object.type !== 'Sprite');
    if (touches.length && surPointage) {
      const p = touches[0].point;
      surPointage({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) });
    }
  });

  function ambiance(n) {
    nuit = n;
    hemi.intensity = n ? 0.02 : 0.38;
    amb.intensity = n ? 0.04 : 0.12;
    soleil.intensity = n ? 0.08 : 1.85;
    scene.environmentIntensity = n ? 0.1 : 1;
    spots.forEach(s => s.intensity = n ? 15 : 6);
    if (piece) piece.M.led.emissiveIntensity = n ? 5 : 2.2;
    if (piece) piece.M.jour.color.set(n ? 0x121a24 : 0xf6fbff);
    renderer.toneMappingExposure = n ? 1.06 : 0.98;
    scene.background.set(n ? 0x08090b : 0x0d0f11);
  }

  const VUES = () => {
    const { L, P, H } = piece.dims;
    return {
      ensemble: { p: [L * 1.75, H * 1.5, P * 1.85], t: [L / 2, H * 0.32, P / 2] },
      entree:   { p: [L * 0.5, Math.min(1.65, H * 0.65), 0.35], t: [L * 0.6, H * 0.4, P] },
      douche:   { p: [L * 0.25, Math.min(1.7, H * 0.68), P * 0.22], t: [L * 0.8, H * 0.5, P * 0.85] },
      vasque:   { p: [L * 0.72, Math.min(1.6, H * 0.62), P * 0.62], t: [0.1, H * 0.45, P * 0.42] },
      plan:     { p: [L / 2, Math.max(L, P) * 3.1, P / 2 + 0.02], t: [L / 2, 0.3, P / 2] }
    };
  };
  let tween = null;
  function vue(nom, instantane) {
    if (!piece) return;
    const v = VUES()[nom] ?? VUES().ensemble;
    const p = new THREE.Vector3(...v.p), t = new THREE.Vector3(...v.t);
    if (instantane) { camera.position.copy(p); controls.target.copy(t); tween = null; }
    else tween = { p, t, p0: camera.position.clone(), t0: controls.target.clone(), k: 0 };
  }

  function murs() {
    if (!piece || options.mursFixes) return;
    const q = piece.groupe.quaternion;
    for (const w of piece.murs) {
      nTmp.copy(w.n).applyQuaternion(q);
      cTmp.copy(w.c).applyMatrix4(piece.groupe.matrixWorld);
      const vis = v3.copy(camera.position).sub(cTmp).dot(nTmp) > 0;
      w.mesh.visible = vis;
      for (const e of w.extras) e.visible = vis;
    }
  }

  function redimensionner() {
    const w = hote.clientWidth || 800, h = hote.clientHeight || 600;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    const dpr = renderer.getPixelRatio();
    gtao.setSize(w * dpr, h * dpr);
    smaa.setSize(w * dpr, h * dpr);
    rendu2D.setSize(w, h);
    materiauCote.resolution.set(w * dpr, h * dpr);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(redimensionner);
  ro.observe(hote);
  redimensionner();

  renderer.setAnimationLoop(() => {
    if (tween) {
      tween.k = Math.min(1, tween.k + 0.04);
      const e = 1 - Math.pow(1 - tween.k, 3);
      camera.position.lerpVectors(tween.p0, tween.p, e);
      controls.target.lerpVectors(tween.t0, tween.t, e);
      if (tween.k >= 1) tween = null;
    }
    murs();
    controls.update();
    dessiner();
    rendu2D.render(scene, camera);
  });

  function dessiner() {
    if (qualiteHaute) composer.render();
    else renderer.render(scene, camera);
  }

  return {
    maj(cfg) { const r = maj(cfg); if (!controls.target.lengthSq()) vue('ensemble', true); return r; },
    vue,
    ambiance,
    rotation(on) { controls.autoRotate = on; },
    qualite(haute) { qualiteHaute = !!haute; },
    cotes(actif) { afficherCotes(!!actif); },
    marqueurs(liste, couleur) {
      listeMarqueurs = Array.isArray(liste) ? liste : [];
      if (couleur) couleurMarqueur = couleur;
      dessinerMarqueurs();
    },
    pointage(actif, rappel) {
      pointageActif = !!actif;
      surPointage = rappel ?? null;
      renderer.domElement.style.cursor = actif ? 'crosshair' : '';
    },
    /* captures pour la fiche imprimable : on change de point de vue,
       on rend, on restitue la caméra du visiteur */
    /* Captures pour la fiche : on force une taille fixe pour que le PDF sorte
       identique quel que soit l'écran, puis on restitue l'affichage. */
    async captures(noms, largeur = 1600, hauteur = 1000) {
      const posAvant = camera.position.clone(), cibleAvant = controls.target.clone();
      const dprAvant = renderer.getPixelRatio();
      const cotesAvant = groupeCotes.visible;
      const fondAvant = scene.background.getHex();
      groupeCotes.visible = false;
      /* fond clair : ces images finissent sur une page blanche */
      scene.background.set(0xf2f4f2);
      renderer.setPixelRatio(1);
      renderer.setSize(largeur, hauteur, false);
      composer.setSize(largeur, hauteur);
      gtao.setSize(largeur, hauteur);
      smaa.setSize(largeur, hauteur);
      camera.aspect = largeur / hauteur;
      camera.updateProjectionMatrix();
      const sorties = {};
      for (const n of noms) {
        vue(n, true);
        controls.update();
        murs();
        dessiner();
        dessiner();
        sorties[n] = renderer.domElement.toDataURL('image/jpeg', 0.92);
      }
      sorties.ratio = largeur / hauteur;
      camera.position.copy(posAvant);
      controls.target.copy(cibleAvant);
      controls.update();
      renderer.setPixelRatio(dprAvant);
      scene.background.set(fondAvant);
      groupeCotes.visible = cotesAvant;
      redimensionner();
      return sorties;
    },
    png(nom) {
      dessiner();
      const a = document.createElement('a');
      a.download = (nom ?? 'apercu') + '.png';
      a.href = renderer.domElement.toDataURL('image/png');
      a.click();
    },
    async glb(nom) {
      const buf = await new Promise((res, rej) =>
        new GLTFExporter().parse(piece.racine, res, rej, { binary: true, onlyVisible: false }));
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
      a.download = (nom ?? 'projet') + '.glb';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    },
    dispose() { ro.disconnect(); renderer.setAnimationLoop(null); renderer.dispose(); }
  };
}
