import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Cultivo, Estado, Lectura } from './models';
import { CONFIG, liberarCache, partesDe } from './plantas';

const COLOR_ESTADO: Record<Estado, number> = { NORMAL: 0x22c55e, ATENCION: 0xf59e0b, CRITICA: 0xdc2626 };
const EMOJI: Record<Estado, string> = { NORMAL: '😊', ATENCION: '😟', CRITICA: '😱' };
const BORDE: Record<Estado, string> = { NORMAL: '#22c55e', ATENCION: '#f59e0b', CRITICA: '#dc2626' };
const ETIQUETA: Record<Estado, string> = { NORMAL: 'Normal', ATENCION: 'Atención', CRITICA: 'Crítica' };

// Separación entre lotes (el lote mide 7.0 x 5.8 con su base de grava)
const ESPACIO_X = 8.2;
const ESPACIO_Z = 7.6;

const C_SECO = new THREE.Color(0xc7a878);
const C_HUMEDO = new THREE.Color(0x3b2616);
const C_AMARILLO = new THREE.Color(0xd6c043);
const C_MARRON = new THREE.Color(0x85572a);

interface Lienzo { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; }
interface Riego { grupo: THREE.Group; puntos: THREE.Points; pos: Float32Array; vel: number[]; n: number; }
interface ParcelaVista {
  id: string; group: THREE.Group; datos: Lectura; clave: string; cultivo: Cultivo;
  matSuelo: THREE.MeshStandardMaterial; matCamellon: THREE.MeshStandardMaterial;
  matHoja: THREE.MeshStandardMaterial; matTallo: THREE.MeshStandardMaterial; matFruto: THREE.MeshStandardMaterial;
  matTubo: THREE.MeshStandardMaterial; matBandera: THREE.MeshStandardMaterial; matAnillo: THREE.MeshBasicMaterial;
  anillo: THREE.Group; bandera: THREE.Mesh; grietas: THREE.Group;
  contenedor: THREE.Group | null; follaje: THREE.Group | null; hojas: THREE.Mesh | null; colorHoja: THREE.Color;
  hitBox: THREE.Mesh; billboard: Lienzo; emoji: Lienzo; emojiSprite: THREE.Sprite; riego: Riego;
  materiales: { mat: THREE.Material; base: number }[];
  factor: number; factorObj: number; factorAplicado: number;
  escala: number; escalaObj: number;
  m: number; mObj: number;           // marchitez actual / objetivo (0 sana ... 1 marchita)
}
interface Callbacks { onFoco: (id: string | null) => void; }

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function rng(seed: number): () => number {
  return () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

/** Pérdida de vigor de la planta según el suelo (y el calor): 0 = sana, 1 = marchita. */
function marchitez(d: Lectura): number {
  const s = d.humedad_suelo;
  let m = s >= 50 ? 0 : s >= 20 ? (0.55 * (50 - s)) / 30 : 0.55 + 0.45 * Math.min(1, (20 - s) / 20);
  if (d.temperatura > 35) m = Math.max(m, 0.25);
  return m;
}

function rectRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function nuevoLienzo(w: number, h: number): Lienzo {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, tex };
}

function nombreCultivo(d: Lectura): string { return CONFIG[d.cultivo ?? 'PAPAYA'].nombre; }

function dibujarBillboard(l: Lienzo, d: Lectura) {
  const ctx = l.canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 320, 230);
  ctx.fillStyle = 'rgba(15, 28, 46, 0.9)';
  rectRedondo(ctx, 6, 6, 308, 218, 24); ctx.fill();
  ctx.strokeStyle = BORDE[d.estado]; ctx.lineWidth = 6;
  rectRedondo(ctx, 6, 6, 308, 218, 24); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px Inter, sans-serif';
  ctx.fillText(`Parcela ${d.parcela}`, 160, 44);
  ctx.fillStyle = '#9fe3b5'; ctx.font = '600 20px Inter, sans-serif';
  ctx.fillText(nombreCultivo(d), 160, 72);
  ctx.fillStyle = '#ffffff'; ctx.font = '40px Inter, sans-serif';
  ctx.fillText(EMOJI[d.estado], 160, 122);
  ctx.font = 'bold 22px Inter, sans-serif'; ctx.fillStyle = '#dff3ff';
  ctx.fillText(`🌡️ ${d.temperatura.toFixed(1)}°C`, 100, 172);
  ctx.fillText(`💧 ${d.humedad_suelo.toFixed(0)}%`, 230, 172);
  ctx.font = 'bold 18px Inter, sans-serif'; ctx.fillStyle = BORDE[d.estado];
  ctx.fillText(ETIQUETA[d.estado].toUpperCase(), 160, 207);
  l.tex.needsUpdate = true;
}

function dibujarEmoji(l: Lienzo, estado: Estado) {
  const ctx = l.canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.font = '200px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(EMOJI[estado], 128, 138);
  l.tex.needsUpdate = true;
}

function texturaCesped(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#6bbf59'; x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    x.fillStyle = Math.random() < 0.5
      ? `rgba(55,125,48,${0.15 + Math.random() * 0.25})`
      : `rgba(160,220,105,${0.12 + Math.random() * 0.22})`;
    x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 2 + Math.random() * 5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function texturaTierra(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 1800; i++) {
    const g = 150 + Math.floor(Math.random() * 100);
    x.fillStyle = `rgba(${g},${g},${g},0.65)`;
    x.fillRect(Math.random() * 128, Math.random() * 128, 1 + Math.random() * 3, 1 + Math.random() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Escena 3D de la granja (Three.js). Sin dependencias de Angular. */
export class FarmScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private clock = new THREE.Clock();
  private raf = 0;
  private parcelas = new Map<string, ParcelaVista>();
  private nubes: THREE.Group[] = [];
  private foco: string | null = null;
  private nPrevio = 0;
  private posInicial = { cam: new THREE.Vector3(15, 15, 17.5), target: new THREE.Vector3(0, 1.2, 0) };
  private anim: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; dur: number; ini: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ro: ResizeObserver;
  private down = { x: 0, y: 0 };
  private liberado = false;
  private texTierra: THREE.CanvasTexture;
  private texCesped: THREE.CanvasTexture;

  constructor(private cont: HTMLElement, private tooltip: HTMLElement, private cb: Callbacks) {
    const w = cont.clientWidth || 800;
    const h = cont.clientHeight || 480;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    cont.prepend(this.renderer.domElement);

    this.texTierra = texturaTierra();
    this.texCesped = texturaCesped();

    this.scene.background = new THREE.Color(0xbfe3ff);
    this.scene.fog = new THREE.Fog(0xbfe3ff, 35, 90);

    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 220);
    this.camera.position.copy(this.posInicial.cam);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 5;
    this.controls.maxDistance = 50;
    this.controls.maxPolarAngle = Math.PI / 2.15;
    this.controls.target.copy(this.posInicial.target);
    this.controls.enablePan = false;
    // En celular: el scroll vertical de la página sigue funcionando; arrastrar en horizontal rota, pellizcar hace zoom
    this.renderer.domElement.style.touchAction = 'pan-y';

    this.crearEntorno();

    const el = this.renderer.domElement;
    el.addEventListener('pointermove', this.alMover);
    el.addEventListener('pointerdown', this.alPresionar);
    el.addEventListener('pointerup', this.alSoltar);
    el.addEventListener('dblclick', this.alDobleClic);

    this.ro = new ResizeObserver(() => this.redimensionar());
    this.ro.observe(cont);

    // Redibuja los textos 3D cuando la fuente Inter termine de cargar
    document.fonts?.ready.then(() => {
      for (const pv of this.parcelas.values()) {
        dibujarBillboard(pv.billboard, pv.datos);
        dibujarEmoji(pv.emoji, pv.datos.estado);
      }
    });

    this.animar();
  }

  // ------------------------------------------------------------------ API pública
  setParcelas(lista: Lectura[]): void {
    if (this.liberado) return;
    const ids = new Set(lista.map(d => d.parcela));
    for (const [id, pv] of [...this.parcelas.entries()]) {
      if (!ids.has(id)) { this.quitar(pv); this.parcelas.delete(id); }
    }
    if (this.foco && !ids.has(this.foco)) this.salirFoco();

    for (const d of lista) {
      const pv = this.parcelas.get(d.parcela);
      if (!pv) {
        const nuevo = this.crearParcela(d);
        this.parcelas.set(d.parcela, nuevo);
        this.scene.add(nuevo.group);
      } else {
        this.actualizar(pv, d);
      }
    }
    this.distribuir(lista.map(d => d.parcela));
    this.aplicarObjetivosFoco();
  }

  enfocar(id: string): void {
    const pv = this.parcelas.get(id);
    if (!pv) return;
    this.foco = id;
    const p = pv.group.position;
    const aspecto = (this.cont.clientWidth || 800) / (this.cont.clientHeight || 480);
    const f = Math.max(1, Math.min(1.8, 1.25 / aspecto)); // en pantallas verticales, aleja un poco la cámara
    this.irA(new THREE.Vector3(p.x + 4.4 * f, 1.0 + 4.6 * f, p.z + 6.0 * f), new THREE.Vector3(p.x, 0.9, p.z), 900);
    this.aplicarObjetivosFoco();
    this.cb.onFoco(id);
  }

  salirFoco(): void {
    if (this.foco === null) return;
    this.foco = null;
    this.irA(this.posInicial.cam.clone(), this.posInicial.target.clone(), 900);
    this.aplicarObjetivosFoco();
    this.cb.onFoco(null);
  }

  vistaInicial(): void {
    if (this.foco !== null) { this.salirFoco(); return; }
    this.irA(this.posInicial.cam.clone(), this.posInicial.target.clone(), 700);
  }

  vistaSuperior(): void {
    if (this.foco !== null) { this.salirFoco(); return; }
    this.irA(new THREE.Vector3(0, 26, 0.01), new THREE.Vector3(0, 0, 0), 700);
  }

  dispose(): void {
    this.liberado = true;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener('pointermove', this.alMover);
    el.removeEventListener('pointerdown', this.alPresionar);
    el.removeEventListener('pointerup', this.alSoltar);
    el.removeEventListener('dblclick', this.alDobleClic);
    this.controls.dispose();
    for (const pv of this.parcelas.values()) this.quitar(pv);
    this.parcelas.clear();
    this.liberarObjeto(this.scene);
    liberarCache();
    this.texTierra.dispose();
    this.texCesped.dispose();
    this.renderer.dispose();
    el.remove();
  }

  // ------------------------------------------------------------------ entorno
  private crearEntorno(): void {
    this.scene.add(new THREE.HemisphereLight(0xdff3ff, 0x5a4a2f, 1.0));

    const sol = new THREE.DirectionalLight(0xfff4d6, 1.7);
    sol.position.set(18, 26, 14);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.camera.left = -30; sol.shadow.camera.right = 30;
    sol.shadow.camera.top = 30; sol.shadow.camera.bottom = -30;
    sol.shadow.camera.near = 1; sol.shadow.camera.far = 80;
    sol.shadow.bias = -0.0004;
    sol.shadow.normalBias = 0.04;
    this.scene.add(sol);

    const relleno = new THREE.DirectionalLight(0xa9c8ff, 0.35);
    relleno.position.set(-10, 8, -8);
    this.scene.add(relleno);

    const cielo = new THREE.Mesh(
      new THREE.SphereGeometry(110, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: { top: { value: new THREE.Color(0x5aa9e6) }, bottom: { value: new THREE.Color(0xd9f0ff) } },
        vertexShader: `varying vec3 vWorld;
          void main(){ vWorld=(modelMatrix*vec4(position,1.0)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
        fragmentShader: `uniform vec3 top; uniform vec3 bottom; varying vec3 vWorld;
          void main(){ float h=normalize(vWorld).y; float t=clamp(h*0.5+0.5,0.0,1.0); gl_FragColor=vec4(mix(bottom,top,t),1.0); }`,
      }));
    this.scene.add(cielo);

    const cesped = new THREE.Mesh(
      new THREE.CircleGeometry(70, 64),
      new THREE.MeshStandardMaterial({ map: this.texCesped, roughness: 0.95, metalness: 0 }));
    cesped.rotation.x = -Math.PI / 2;
    cesped.position.y = -0.02;
    cesped.receiveShadow = true;
    this.scene.add(cesped);

    const disco = new THREE.Mesh(new THREE.SphereGeometry(2.4, 24, 24), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
    disco.position.set(32, 36, -26);
    this.scene.add(disco);

    const matNube = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 5; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.7 + Math.random() * 0.7, 12, 12), matNube);
        s.position.set((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.2);
        g.add(s);
      }
      g.position.set((Math.random() - 0.5) * 70, 14 + Math.random() * 5, (Math.random() - 0.5) * 70);
      g.scale.setScalar(1.3 + Math.random() * 0.8);
      g.userData['velocidad'] = 0.05 + Math.random() * 0.08;
      this.scene.add(g);
      this.nubes.push(g);
    }

    this.crearArboles();
  }

  /** Árboles lejanos (fusionados por material para no gastar dibujados). */
  private crearArboles(): void {
    const r = rng(77);
    const troncos: THREE.BufferGeometry[] = [], copasA: THREE.BufferGeometry[] = [], copasB: THREE.BufferGeometry[] = [];
    const preparar = (g: THREE.BufferGeometry, x: number, y: number, z: number) => {
      g.translate(x, y, z);
      const n = g.index ? g.toNonIndexed() : g;
      n.deleteAttribute('uv');
      return n;
    };
    for (let i = 0; i < 18; i++) {
      const ang = r() * Math.PI * 2, rad = 27 + r() * 16;
      const x = Math.cos(ang) * rad, z = Math.sin(ang) * rad, h = 2.4 + r() * 1.8;
      const tronco = new THREE.CylinderGeometry(0.22, 0.32, h, 6); tronco.translate(0, h / 2, 0);
      troncos.push(preparar(tronco, x, 0, z));
      const lista = r() < 0.5 ? copasA : copasB;
      lista.push(preparar(new THREE.IcosahedronGeometry(1.5 + r() * 0.8, 1), x, h + 0.8, z));
      lista.push(preparar(new THREE.IcosahedronGeometry(1.0 + r() * 0.5, 1), x + (r() - 0.5), h + 1.9, z + (r() - 0.5)));
    }
    const añadir = (gs: THREE.BufferGeometry[], color: number) => {
      const g = mergeGeometries(gs, false);
      if (g) this.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.95, flatShading: true })));
    };
    añadir(troncos, 0x6b4a2b);
    añadir(copasA, 0x3f8f3f);
    añadir(copasB, 0x55a34c);
  }

  // ------------------------------------------------------------------ parcelas
  private crearParcela(d: Lectura): ParcelaVista {
    const cultivo: Cultivo = d.cultivo ?? 'PAPAYA';
    const group = new THREE.Group();

    const matGrava = new THREE.MeshStandardMaterial({ color: 0xcbbd95, roughness: 1, map: this.texTierra });
    const matMadera = new THREE.MeshStandardMaterial({ color: 0x8a6a45, roughness: 0.9 });
    const matSuelo = new THREE.MeshStandardMaterial({ color: 0x4a3220, roughness: 1, map: this.texTierra });
    const matCamellon = new THREE.MeshStandardMaterial({ color: 0x45301f, roughness: 1, map: this.texTierra });
    const matHoja = new THREE.MeshStandardMaterial({ color: CONFIG[cultivo].colorHoja, roughness: 0.8, side: THREE.DoubleSide });
    const matTallo = new THREE.MeshStandardMaterial({ color: CONFIG[cultivo].colorTallo, roughness: 0.9 });
    const matFruto = new THREE.MeshStandardMaterial({ color: CONFIG[cultivo].colorFruto, roughness: 0.6 });
    const matTubo = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 });
    const matGrieta = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 1 });

    // Base de grava
    const pad = new THREE.Mesh(new THREE.BoxGeometry(7.0, 0.1, 5.8), matGrava);
    pad.position.y = 0.05; pad.receiveShadow = true;
    group.add(pad);

    // Marco de madera del lote
    const largoX = new THREE.BoxGeometry(6.2, 0.22, 0.18);
    const largoZ = new THREE.BoxGeometry(0.18, 0.22, 5.0);
    for (const sz of [-1, 1]) {
      const a = new THREE.Mesh(largoX, matMadera); a.position.set(0, 0.21, sz * 2.41); a.castShadow = true; a.receiveShadow = true; group.add(a);
      const b = new THREE.Mesh(largoZ, matMadera); b.position.set(sz * 3.01, 0.21, 0); b.castShadow = true; b.receiveShadow = true; group.add(b);
    }

    // Tierra del lote (su color depende de la humedad del suelo)
    const suelo = new THREE.Mesh(new THREE.BoxGeometry(5.84, 0.2, 4.64), matSuelo);
    suelo.position.y = 0.2; suelo.receiveShadow = true;
    group.add(suelo);

    // Grietas (solo se ven con el suelo muy seco)
    const grietas = new THREE.Group();
    grietas.position.y = 0.305; grietas.visible = false;
    const rg = rng(hash(d.parcela));
    for (let i = 0; i < 18; i++) {
      const len = 0.4 + rg() * 0.9;
      const c = new THREE.Mesh(new THREE.BoxGeometry(len, 0.01, 0.025 + rg() * 0.02), matGrieta);
      c.position.set((rg() - 0.5) * 5.2, 0, (rg() - 0.5) * 4.0);
      c.rotation.y = rg() * Math.PI;
      grietas.add(c);
    }
    group.add(grietas);

    // Anillo rectangular de estado
    const matAnillo = new THREE.MeshBasicMaterial({ color: COLOR_ESTADO[d.estado], transparent: true, opacity: 0.7 });
    const anillo = new THREE.Group();
    for (const sz of [-1, 1]) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(7.6, 0.04, 0.12), matAnillo); a.position.set(0, 0.03, sz * 3.2); anillo.add(a);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.04, 6.52), matAnillo); b.position.set(sz * 3.8, 0.03, 0); anillo.add(b);
    }
    group.add(anillo);

    // Zona de clic
    const hitBox = new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.4, 6.2), new THREE.MeshBasicMaterial({ visible: false }));
    hitBox.position.y = 1.7;
    hitBox.userData['id'] = d.parcela;
    group.add(hitBox);

    // Poste del sensor con panel solar (fuera del lote, al fondo)
    const px = -2.5, pz = -3.05;
    const poste = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.6, metalness: 0.4 }));
    poste.position.set(px, 1.7, pz); poste.castShadow = true;
    group.add(poste);
    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.05, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4, metalness: 0.6 }));
    panel.position.set(px, 3.4, pz); panel.rotation.x = -0.3; panel.castShadow = true;
    group.add(panel);

    const billboard = nuevoLienzo(320, 230);
    dibujarBillboard(billboard, d);
    const spriteB = new THREE.Sprite(new THREE.SpriteMaterial({ map: billboard.tex, transparent: true, depthTest: true }));
    spriteB.scale.set(3.6, 2.59, 1);
    spriteB.position.set(px, 2.75, pz + 0.05);
    group.add(spriteB);

    const riego = this.crearRiego();
    riego.grupo.position.set(0, 0.3, 0);
    riego.grupo.visible = d.estado === 'CRITICA';
    group.add(riego.grupo);

    const matBandera = new THREE.MeshStandardMaterial({
      color: COLOR_ESTADO[d.estado], emissive: COLOR_ESTADO[d.estado], emissiveIntensity: 0.3, side: THREE.DoubleSide, roughness: 0.6,
    });
    const bandera = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), matBandera);
    bandera.position.set(px + 0.35, 3.85, pz);
    group.add(bandera);

    const emoji = nuevoLienzo(256, 256);
    dibujarEmoji(emoji, d.estado);
    const emojiSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoji.tex, transparent: true, depthTest: false }));
    emojiSprite.scale.set(1.6, 1.6, 1);
    emojiSprite.position.set(px, 4.7, pz);
    emojiSprite.renderOrder = 10;
    group.add(emojiSprite);

    const pv: ParcelaVista = {
      id: d.parcela, group, datos: d, clave: '', cultivo,
      matSuelo, matCamellon, matHoja, matTallo, matFruto, matTubo, matBandera, matAnillo,
      anillo, bandera, grietas, contenedor: null, follaje: null, hojas: null, colorHoja: new THREE.Color(CONFIG[cultivo].colorHoja),
      hitBox, billboard, emoji, emojiSprite, riego, materiales: [],
      factor: 1, factorObj: 1, factorAplicado: 1, escala: 1, escalaObj: 1,
      m: marchitez(d), mObj: marchitez(d),
    };
    pv.clave = this.claveDe(d);
    this.reconstruirCultivo(pv, cultivo);
    this.aplicarSuelo(pv, d);
    return pv;
  }

  private claveDe(d: Lectura): string {
    return `${d.temperatura}|${d.humedad_suelo}|${d.estado}|${d.cultivo ?? 'PAPAYA'}`;
  }

  /** Arma camellones, riego por goteo y plantas del cultivo indicado. */
  private reconstruirCultivo(pv: ParcelaVista, cultivo: Cultivo): void {
    if (pv.contenedor) {
      pv.group.remove(pv.contenedor);
      this.liberarObjeto(pv.contenedor);
    }
    const cfg = CONFIG[cultivo];
    const partes = partesDe(cultivo);
    const cont = new THREE.Group();
    cont.position.y = 0.3; // sobre la tierra

    const bedGeo = new THREE.BoxGeometry(5.6, 0.16, cfg.anchoCamellon);
    const tuboGeo = new THREE.CylinderGeometry(0.022, 0.022, 5.6, 6);
    tuboGeo.rotateZ(Math.PI / 2);
    for (const z of cfg.filasZ) {
      const bed = new THREE.Mesh(bedGeo, pv.matCamellon);
      bed.position.set(0, 0.08, z); bed.castShadow = true; bed.receiveShadow = true;
      cont.add(bed);
      const tubo = new THREE.Mesh(tuboGeo, pv.matTubo);
      tubo.position.set(0, 0.17, z + cfg.anchoCamellon * 0.28);
      cont.add(tubo);
    }

    const follaje = new THREE.Group();
    follaje.position.y = 0.16; // las raíces están sobre los camellones
    const hojas = new THREE.Mesh(partes.hojas, pv.matHoja);
    hojas.castShadow = true;
    follaje.add(hojas);
    if (partes.tallos) { const m = new THREE.Mesh(partes.tallos, pv.matTallo); m.castShadow = true; follaje.add(m); }
    if (partes.frutos) { const m = new THREE.Mesh(partes.frutos, pv.matFruto); m.castShadow = true; follaje.add(m); }
    cont.add(follaje);

    pv.matTallo.color.setHex(cfg.colorTallo);
    pv.matFruto.color.setHex(cfg.colorFruto);
    pv.colorHoja.setHex(cfg.colorHoja);
    pv.contenedor = cont; pv.follaje = follaje; pv.hojas = hojas; pv.cultivo = cultivo;
    pv.group.add(cont);

    pv.m = pv.mObj;
    this.aplicarSalud(pv);
    this.recolectarMateriales(pv);
  }

  /** Postura (morph) y color de las hojas según la marchitez actual. */
  private aplicarSalud(pv: ParcelaVista): void {
    if (pv.hojas?.morphTargetInfluences) pv.hojas.morphTargetInfluences[0] = pv.m;
    if (pv.m < 0.55) pv.matHoja.color.copy(pv.colorHoja).lerp(C_AMARILLO, pv.m / 0.55);
    else pv.matHoja.color.copy(C_AMARILLO).lerp(C_MARRON, (pv.m - 0.55) / 0.45);
  }

  /** Color y brillo de la tierra según la humedad del suelo; grietas si está muy seca. */
  private aplicarSuelo(pv: ParcelaVista, d: Lectura): void {
    const w = clamp(d.humedad_suelo / 70, 0, 1);
    pv.matSuelo.color.copy(C_SECO).lerp(C_HUMEDO, w);
    pv.matCamellon.color.copy(pv.matSuelo.color).multiplyScalar(0.92);
    pv.matSuelo.roughness = pv.matCamellon.roughness = 1 - 0.3 * w;
    pv.grietas.visible = d.humedad_suelo < 25;
  }

  private recolectarMateriales(pv: ParcelaVista): void {
    const previos = new Map(pv.materiales.map(x => [x.mat, x.base] as const));
    const set = new Set<THREE.Material>();
    pv.group.traverse(o => {
      if (o === pv.hitBox || o instanceof THREE.Sprite) return;
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(x => set.add(x));
    });
    set.delete(pv.matAnillo);
    pv.materiales = [...set].map(m => ({ mat: m, base: previos.get(m) ?? m.opacity }));
    pv.factorAplicado = -1; // fuerza reaplicar la atenuación
  }

  /** Lluvia de riego (se muestra cuando la parcela está en estado crítico). */
  private crearRiego(): Riego {
    const n = 160;
    const pos = new Float32Array(n * 3);
    const vel: number[] = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 5.4;
      pos[i * 3 + 1] = 0.3 + Math.random() * 1.9;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 4.2;
      vel.push(2.2 + Math.random() * 1.2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const puntos = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x60a5fa, size: 0.09, transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false,
    }));
    puntos.frustumCulled = false;
    const grupo = new THREE.Group();
    grupo.add(puntos);
    return { grupo, puntos, pos, vel, n };
  }

  private actualizar(pv: ParcelaVista, d: Lectura): void {
    const prev = pv.datos;
    pv.datos = d;
    if (prev.estado !== d.estado) this.aplicarEstado(pv, d.estado);
    const cultivo: Cultivo = d.cultivo ?? 'PAPAYA';
    if (cultivo !== pv.cultivo) this.reconstruirCultivo(pv, cultivo);
    this.aplicarSuelo(pv, d);
    pv.mObj = marchitez(d);
    const clave = this.claveDe(d);
    if (clave !== pv.clave) {
      pv.clave = clave;
      dibujarBillboard(pv.billboard, d);
    }
  }

  private aplicarEstado(pv: ParcelaVista, estado: Estado): void {
    const c = COLOR_ESTADO[estado];
    pv.matBandera.color.setHex(c);
    pv.matBandera.emissive.setHex(c);
    pv.matAnillo.color.setHex(c);
    dibujarEmoji(pv.emoji, estado);
    pv.riego.grupo.visible = estado === 'CRITICA';
  }

  private liberarObjeto(obj: THREE.Object3D): void {
    obj.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry && !m.geometry.userData['compartida']) m.geometry.dispose();
    });
  }

  private quitar(pv: ParcelaVista): void {
    this.scene.remove(pv.group);
    pv.group.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry && !m.geometry.userData['compartida']) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) {
        (Array.isArray(mat) ? mat : [mat]).forEach(x => {
          if (x instanceof THREE.SpriteMaterial) x.map?.dispose();
          x.dispose();
        });
      }
    });
  }

  private distribuir(ids: string[]): void {
    const n = ids.length;
    const cols = Math.min(3, Math.max(n, 1));
    const filas = Math.ceil(n / cols);
    ids.forEach((id, i) => {
      const fila = Math.floor(i / cols);
      const col = i % cols;
      const enFila = Math.min(cols, n - fila * cols);
      this.parcelas.get(id)?.group.position.set((col - (enFila - 1) / 2) * ESPACIO_X, 0, (fila - (filas - 1) / 2) * ESPACIO_Z);
    });

    if (n !== this.nPrevio) {
      this.calcularInicial();
      if (this.foco === null) {
        if (this.nPrevio === 0) {
          this.camera.position.copy(this.posInicial.cam);
          this.controls.target.copy(this.posInicial.target);
        } else {
          this.irA(this.posInicial.cam.clone(), this.posInicial.target.clone(), 700);
        }
      }
      this.nPrevio = n;
    }
  }

  /** Distancia de la cámara según cuántas parcelas hay y la forma de la pantalla (vertical = más lejos). */
  private calcularInicial(): void {
    const n = Math.max(this.parcelas.size, 1);
    const aspecto = (this.cont.clientWidth || 800) / (this.cont.clientHeight || 480);
    const k = Math.max(1, Math.sqrt(n / 5)) * Math.min(2.2, Math.max(1, 1.45 / aspecto));
    this.posInicial.cam.set(15 * k, 15 * k, 17.5 * k);
    this.controls.maxDistance = Math.max(50, 38 * k);
  }

  private aplicarObjetivosFoco(): void {
    for (const pv of this.parcelas.values()) {
      if (this.foco === null) { pv.factorObj = 1; pv.escalaObj = 1; }
      else if (pv.id === this.foco) { pv.factorObj = 1; pv.escalaObj = 1.04; }
      else { pv.factorObj = 0.25; pv.escalaObj = 0.6; }
    }
  }

  private irA(p1: THREE.Vector3, t1: THREE.Vector3, dur: number): void {
    this.anim = { p0: this.camera.position.clone(), t0: this.controls.target.clone(), p1, t1, dur, ini: performance.now() };
  }

  // ------------------------------------------------------------------ bucle
  private animar = (): void => {
    this.raf = requestAnimationFrame(this.animar);
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    if (this.cont.clientWidth === 0) return; // vista oculta: no dibujar

    for (const n of this.nubes) {
      n.position.x += (n.userData['velocidad'] as number) * dt;
      if (n.position.x > 40) n.position.x = -40;
    }

    let k = 0;
    for (const pv of this.parcelas.values()) this.animarParcela(pv, dt, t, k++);

    if (this.anim) {
      const a = this.anim;
      const p = Math.min((performance.now() - a.ini) / a.dur, 1);
      const e = easeInOutCubic(p);
      this.camera.position.lerpVectors(a.p0, a.p1, e);
      this.controls.target.lerpVectors(a.t0, a.t1, e);
      if (p >= 1) this.anim = null;
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };

  private animarParcela(pv: ParcelaVista, dt: number, t: number, k: number): void {
    const s = Math.min(1, dt * 6);
    pv.factor += (pv.factorObj - pv.factor) * s;
    if (Math.abs(pv.factor - pv.factorObj) < 0.002) pv.factor = pv.factorObj;
    if (pv.factor !== pv.factorAplicado) {
      for (const { mat, base } of pv.materiales) {
        mat.opacity = base * pv.factor;
        const transp = pv.factor < 0.999 || base < 1;
        if (mat.transparent !== transp) { mat.transparent = transp; mat.needsUpdate = true; }
      }
      pv.factorAplicado = pv.factor;
    }
    pv.escala += (pv.escalaObj - pv.escala) * s;
    if (Math.abs(pv.escala - pv.escalaObj) < 0.002) pv.escala = pv.escalaObj;
    pv.group.scale.setScalar(pv.escala);

    // La planta se marchita (o se recupera) de forma gradual
    if (pv.m !== pv.mObj) {
      pv.m += (pv.mObj - pv.m) * Math.min(1, dt * 1.2);
      if (Math.abs(pv.m - pv.mObj) < 0.002) pv.m = pv.mObj;
      this.aplicarSalud(pv);
    }

    pv.emojiSprite.position.y = 4.7 + Math.sin(t * 2 + k) * 0.15;
    pv.bandera.rotation.y = Math.sin(t * 3 + k) * 0.3;

    if (pv.follaje) {
      const viento = 1 - pv.m * 0.6; // una planta marchita se mueve menos
      pv.follaje.rotation.z = Math.sin(t * 1.4 + k) * 0.012 * viento;
      pv.follaje.rotation.x = Math.cos(t * 1.1 + k) * 0.008 * viento;
    }

    let op = 0.7, esc = 1;
    if (pv.datos.estado === 'CRITICA') { esc = 1 + Math.sin(t * 4) * 0.015; op = 0.5 + Math.sin(t * 4) * 0.3; }
    else if (pv.datos.estado === 'ATENCION') { op = 0.5 + Math.sin(t * 2) * 0.2; }
    pv.anillo.scale.set(esc, 1, esc);
    pv.matAnillo.opacity = op * pv.factor;

    const r = pv.riego;
    if (r.grupo.visible) {
      for (let i = 0; i < r.n; i++) {
        r.pos[i * 3 + 1] -= r.vel[i] * dt;
        if (r.pos[i * 3 + 1] < 0.35) {
          r.pos[i * 3] = (Math.random() - 0.5) * 5.4;
          r.pos[i * 3 + 1] = 2.0 + Math.random() * 0.4;
          r.pos[i * 3 + 2] = (Math.random() - 0.5) * 4.2;
        }
      }
      r.puntos.geometry.attributes['position'].needsUpdate = true;
    }
  }

  // ------------------------------------------------------------------ eventos
  private redimensionar(): void {
    const w = this.cont.clientWidth, h = this.cont.clientHeight;
    if (w === 0 || h === 0) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);

    // Reencuadra la granja si el usuario no movió la cámara (rotar el celular, redimensionar la ventana)
    const anterior = this.posInicial.cam.clone();
    this.calcularInicial();
    if (this.foco === null && !this.anim && this.camera.position.distanceTo(anterior) < 0.5) {
      this.camera.position.copy(this.posInicial.cam);
    }
  }

  private idEn(e: PointerEvent): string | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects([...this.parcelas.values()].map(p => p.hitBox), false);
    return hits.length ? (hits[0].object.userData['id'] as string) : null;
  }

  private alMover = (e: PointerEvent): void => {
    const canvas = this.renderer.domElement;
    if (this.foco !== null) { this.tooltip.classList.remove('show'); canvas.style.cursor = 'grab'; return; }
    const id = this.idEn(e);
    if (id) {
      const d = this.parcelas.get(id)!.datos;
      const rect = canvas.getBoundingClientRect();
      this.tooltip.textContent =
        `${EMOJI[d.estado]} Parcela ${d.parcela} · ${nombreCultivo(d)} · ${ETIQUETA[d.estado]} · ${d.temperatura.toFixed(1)}°C · ${d.humedad_suelo.toFixed(0)}% suelo`;
      this.tooltip.style.left = e.clientX - rect.left + 'px';
      this.tooltip.style.top = e.clientY - rect.top + 'px';
      this.tooltip.classList.add('show');
      canvas.style.cursor = 'pointer';
    } else {
      this.tooltip.classList.remove('show');
      canvas.style.cursor = 'grab';
    }
  };

  private alPresionar = (e: PointerEvent): void => { this.down = { x: e.clientX, y: e.clientY }; };

  private alSoltar = (e: PointerEvent): void => {
    if (Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return; // fue un arrastre
    if (this.anim) return;
    const id = this.idEn(e);
    if (id && id !== this.foco) this.enfocar(id);
  };

  private alDobleClic = (): void => { if (this.foco !== null) this.salirFoco(); };
}
