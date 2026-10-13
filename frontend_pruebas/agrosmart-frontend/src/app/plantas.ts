import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Cultivo } from './models';

/** Aspecto y distribución de cada cultivo dentro del lote (coordenadas locales, el lote mide 5.8 x 4.6). */
export interface ConfigCultivo {
  nombre: string;
  filasZ: number[];          // posición (z) de cada camellón
  anchoCamellon: number;
  colorHoja: number; colorTallo: number; colorFruto: number;
}

export const CONFIG: Record<Cultivo, ConfigCultivo> = {
  PAPAYA:    { nombre: 'Papaya',    filasZ: [-1.1, 1.1],                 anchoCamellon: 1.3,  colorHoja: 0x3c8a3a, colorTallo: 0x8d9160, colorFruto: 0xe9a73b },
  MAIZ:      { nombre: 'Maíz',      filasZ: [-1.8, -0.9, 0, 0.9, 1.8],   anchoCamellon: 0.55, colorHoja: 0x62ae3c, colorTallo: 0x6a9a3a, colorFruto: 0xe3cd6a },
  PAPA:      { nombre: 'Papa',      filasZ: [-1.8, -0.9, 0, 0.9, 1.8],   anchoCamellon: 0.7,  colorHoja: 0x4b9b3d, colorTallo: 0x5b8a3a, colorFruto: 0xe6def5 },
  ESPARRAGO: { nombre: 'Espárrago', filasZ: [-1.65, -0.55, 0.55, 1.65],  anchoCamellon: 0.8,  colorHoja: 0x78b862, colorTallo: 0x8fb36a, colorFruto: 0xc83a35 },
  TOMATE:    { nombre: 'Tomate',    filasZ: [-1.8, -0.9, 0, 0.9, 1.8],   anchoCamellon: 0.6,  colorHoja: 0x3e8a3d, colorTallo: 0x5a7f34, colorFruto: 0xd9342b },
};

export interface PartesCultivo {
  hojas: THREE.BufferGeometry;            // con un "morph target": la pose marchita
  tallos: THREE.BufferGeometry | null;
  frutos: THREE.BufferGeometry | null;
}

// ---------------------------------------------------------------- utilidades
function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();
function mover(g: THREE.BufferGeometry, x: number, y: number, z: number, yaw = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(0, yaw, 0);
  _q.setFromEuler(_e);
  _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
  g.applyMatrix4(_m);
  return g;
}

/** Hoja: tira curva que parte del origen hacia +Z. pitch = inclinación inicial (rad, + sube), curva = cuánto se dobla hacia abajo. */
function hoja(len: number, ancho: number, pitch: number, curva: number, forma: (t: number) => number, n: number) {
  const L: THREE.Vector3[] = [], R: THREE.Vector3[] = [];
  let y = 0, z = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) {
      const th = pitch - curva * ((i - 0.5) / n);
      y += Math.sin(th) * len / n;
      z += Math.cos(th) * len / n;
    }
    const hw = (ancho / 2) * forma(i / n);
    L.push(new THREE.Vector3(-hw, y, z));
    R.push(new THREE.Vector3(hw, y, z));
  }
  const pos: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = L[i], b = R[i], c = L[i + 1], d = R[i + 1];
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, b.x, b.y, b.z, d.x, d.y, d.z, c.x, c.y, c.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Cilindro vertical con la base en y. */
function tubo(rTop: number, rBase: number, h: number, x: number, y: number, z: number, seg = 6) {
  const g = new THREE.CylinderGeometry(rTop, rBase, h, seg, 1, false);
  g.translate(0, h / 2, 0);
  return mover(g, x, y, z);
}

/** Varilla inclinada (pecíolo, mazorca): elev = ángulo sobre la horizontal en la dirección yaw. */
function varilla(len: number, rTop: number, rBase: number, elev: number, yaw: number, x: number, y: number, z: number, seg = 5) {
  const g = new THREE.CylinderGeometry(rTop, rBase, len, seg, 1, false);
  g.translate(0, len / 2, 0);
  g.rotateX(Math.PI / 2 - elev);
  return mover(g, x, y, z, yaw);
}

function bola(r: number, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1) {
  return mover(new THREE.SphereGeometry(r, 8, 6), x, y, z, 0, sx, sy, sz);
}

const formaOval = (t: number) => Math.sqrt(Math.max(0, Math.sin(Math.PI * t)));
const formaMaiz = (t: number) => (t < 0.85 ? 0.6 + 0.4 * Math.sin(Math.min(1, t / 0.3) * Math.PI / 2) : ((1 - t) / 0.15));
const formaFino = (t: number) => 1 - 0.6 * t;
const formaPapaya = (t: number) => formaOval(t) * (0.78 + 0.22 * Math.abs(Math.cos(t * Math.PI * 3)));

interface Acum { hojas: THREE.BufferGeometry[]; tallos: THREE.BufferGeometry[]; frutos: THREE.BufferGeometry[]; }

// ---------------------------------------------------------------- cultivos
// p = 0 planta sana, p = 1 planta marchita (solo cambia la postura de las hojas; el azar es idéntico en ambas)

function papaya(a: Acum, r: () => number, p: number) {
  const zs = [-1.1, 1.1], xs = [-1.8, 0, 1.8];
  zs.forEach((z0, fz) => xs.forEach(x0 => {
    const x = x0 + (fz ? 0.6 : -0.3) + (r() - 0.5) * 0.2;
    const z = z0 + (r() - 0.5) * 0.2;
    const h = 1.7 + r() * 0.35;
    a.tallos.push(tubo(0.085, 0.15, h, x, 0, z, 8));
    for (let k = 1; k <= 7; k++) {                       // anillos del tronco (cicatrices de hojas)
      const t = k / 8, rad = 0.15 - 0.065 * t + 0.012;
      a.tallos.push(tubo(rad, rad, 0.03, x, h * t, z, 8));
    }
    const n = 9;
    for (let i = 0; i < n; i++) {
      const yaw = (i * 2 * Math.PI) / n + r() * 0.25;
      const elev = 0.75 + r() * 0.2, lp = 0.7 + r() * 0.15;
      a.tallos.push(varilla(lp, 0.016, 0.026, elev, yaw, x, h, z, 4));
      const tx = x + Math.sin(yaw) * Math.cos(elev) * lp;
      const ty = h + Math.sin(elev) * lp;
      const tz = z + Math.cos(yaw) * Math.cos(elev) * lp;
      a.hojas.push(mover(hoja(0.95, 0.95, 0.45 - p * 1.0, 0.5 + p * 1.2, formaPapaya, 10), tx, ty, tz, yaw));
    }
    for (let i = 0; i < 3; i++) {
      const ang = r() * Math.PI * 2;
      a.frutos.push(bola(0.11, x + Math.cos(ang) * 0.17, h - 0.14 - r() * 0.1, z + Math.sin(ang) * 0.17, 1, 1.7, 1));
    }
  }));
}

function maiz(a: Acum, r: () => number, p: number) {
  const zs = [-1.8, -0.9, 0, 0.9, 1.8];
  for (let i = 0; i < 7; i++) for (const z0 of zs) {
    const x = -2.6 + i * 0.87 + (r() - 0.5) * 0.15, z = z0 + (r() - 0.5) * 0.12, h = 1.5 + r() * 0.3;
    a.tallos.push(tubo(0.03, 0.05, h, x, 0, z, 5));
    for (let k = 0; k < 7; k++) {
      const y = 0.25 + (k * (h - 0.45)) / 6, yaw = k * 2.4 + r() * 0.4, len = 0.95 - k * 0.07;
      a.hojas.push(mover(hoja(len, 0.17, 0.5 - p * 0.85, 0.9 + p * 0.9, formaMaiz, 5), x, y, z, yaw));
    }
    a.frutos.push(varilla(0.26, 0.035, 0.045, 1.2, r() * 6.28, x, h * 0.55, z, 5));
  }
}

function papa(a: Acum, r: () => number, p: number) {
  const zs = [-1.8, -0.9, 0, 0.9, 1.8];
  for (let i = 0; i < 6; i++) for (const z0 of zs) {
    const x = -2.35 + i * 0.94 + (r() - 0.5) * 0.15, z = z0 + (r() - 0.5) * 0.12;
    a.tallos.push(tubo(0.015, 0.025, 0.3, x, 0, z, 4));
    for (let k = 0; k < 9; k++) {
      const yaw = k * 2.4 + r(), y = 0.1 + (k % 3) * 0.09 + r() * 0.04, len = 0.38 + r() * 0.1;
      a.hojas.push(mover(hoja(len, 0.3, 0.85 - p * 1.1, 0.5 + p * 0.9, formaOval, 4), x, y, z, yaw));
    }
    for (let k = 0; k < 2; k++) a.frutos.push(bola(0.04, x + (r() - 0.5) * 0.2, 0.4 + r() * 0.06, z + (r() - 0.5) * 0.2));
  }
}

function esparrago(a: Acum, r: () => number, p: number) {
  const zs = [-1.65, -0.55, 0.55, 1.65];
  for (let i = 0; i < 5; i++) for (const z0 of zs) {
    const px = -2.3 + i * 1.15 + (r() - 0.5) * 0.15, pz = z0 + (r() - 0.5) * 0.12;
    for (let s = 0; s < 2; s++) {
      const x = px + (s ? 0.1 : -0.1), z = pz + (s ? -0.06 : 0.06), h = 1.3 + r() * 0.3;
      a.tallos.push(tubo(0.012, 0.03, h, x, 0, z, 4));
      for (let k = 0; k < 14; k++) {
        const f = k / 13, y = 0.45 + f * (h - 0.5), yaw = k * 2.4 + r(), len = 0.42 - 0.12 * f + r() * 0.05;
        a.hojas.push(mover(hoja(len, 0.05, 0.9 - p * 1.2, 0.3 + p * 1.0, formaFino, 3), x, y, z, yaw));
      }
      a.frutos.push(bola(0.03, x + (r() - 0.5) * 0.25, 0.6 + r() * 0.5, z + (r() - 0.5) * 0.25));
    }
  }
}

function tomate(a: Acum, r: () => number, p: number) {
  const zs = [-1.8, -0.9, 0, 0.9, 1.8];
  for (let i = 0; i < 5; i++) for (const z0 of zs) {
    const x = -2.3 + i * 1.15 + (r() - 0.5) * 0.15, z = z0 + (r() - 0.5) * 0.12;
    a.tallos.push(tubo(0.025, 0.04, 0.95, x, 0, z, 5));
    for (let k = 0; k < 10; k++) {
      const y = 0.2 + k * 0.07, yaw = k * 2.4 + r(), len = 0.42 + r() * 0.06;
      a.hojas.push(mover(hoja(len, 0.24, 0.55 - p * 0.95, 0.6 + p * 1.0, formaOval, 4), x, y, z, yaw));
    }
    for (let k = 0; k < 4; k++) {
      const ang = r() * Math.PI * 2;
      a.frutos.push(bola(0.075, x + Math.cos(ang) * 0.17, 0.3 + r() * 0.35, z + Math.sin(ang) * 0.17));
    }
  }
}

const CONSTRUCTORES: Record<Cultivo, (a: Acum, r: () => number, p: number) => void> = {
  PAPAYA: papaya, MAIZ: maiz, PAPA: papa, ESPARRAGO: esparrago, TOMATE: tomate,
};
const SEMILLA: Record<Cultivo, number> = { PAPAYA: 11, MAIZ: 23, PAPA: 37, ESPARRAGO: 41, TOMATE: 59 };

function generar(c: Cultivo, p: number): Acum {
  const a: Acum = { hojas: [], tallos: [], frutos: [] };
  CONSTRUCTORES[c](a, rng(SEMILLA[c]), p);
  return a;
}

function fusionar(gs: THREE.BufferGeometry[]): THREE.BufferGeometry | null {
  if (!gs.length) return null;
  const lista = gs.map(g => {
    const x = g.index ? g.toNonIndexed() : g;
    x.deleteAttribute('uv');
    return x;
  });
  const m = mergeGeometries(lista, false);
  if (!m) throw new Error('No se pudieron fusionar las geometrías del cultivo');
  m.userData['compartida'] = true;
  return m;
}

// ---------------------------------------------------------------- caché (se comparte entre parcelas del mismo cultivo)
const cache = new Map<Cultivo, PartesCultivo>();

export function partesDe(c: Cultivo): PartesCultivo {
  let partes = cache.get(c);
  if (!partes) {
    const sana = generar(c, 0), marchita = generar(c, 1);
    const h0 = fusionar(sana.hojas)!, h1 = fusionar(marchita.hojas)!;
    const n0 = h0.getAttribute('position').count, n1 = h1.getAttribute('position').count;
    if (n0 !== n1) throw new Error(`Poses de ${c} con distinta cantidad de vértices (${n0} vs ${n1})`);
    h0.morphAttributes['position'] = [h1.getAttribute('position') as THREE.BufferAttribute];
    h0.morphTargetsRelative = false;
    partes = { hojas: h0, tallos: fusionar(sana.tallos), frutos: fusionar(sana.frutos) };
    cache.set(c, partes);
  }
  return partes;
}

export function liberarCache(): void {
  for (const p of cache.values()) { p.hojas.dispose(); p.tallos?.dispose(); p.frutos?.dispose(); }
  cache.clear();
}
