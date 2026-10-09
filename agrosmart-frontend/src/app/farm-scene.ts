import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Estado, Lectura } from './models';



const COLORES: Record<Estado, { suelo: number; cultivo: number; emisivo: number; bandera: number }> = {
  NORMAL:   { suelo: 0x7c5a3a, cultivo: 0x4ade80, emisivo: 0x22c55e, bandera: 0x16a34a },
  ATENCION: { suelo: 0x8a6b42, cultivo: 0xfbbf24, emisivo: 0xf59e0b, bandera: 0xf59e0b },
  CRITICA:  { suelo: 0x7a3f2a, cultivo: 0xf87171, emisivo: 0xdc2626, bandera: 0xdc2626 },
};
const EMOJI: Record<Estado, string> = { NORMAL: '😊', ATENCION: '😟', CRITICA: '😱' };
const BORDE: Record<Estado, string> = { NORMAL: '#22c55e', ATENCION: '#f59e0b', CRITICA: '#dc2626' };
const ETIQUETA: Record<Estado, string> = { NORMAL: 'Normal', ATENCION: 'Atención', CRITICA: 'Crítica' };
const EMISION: Record<Estado, number> = { NORMAL: 0.15, ATENCION: 0.22, CRITICA: 0.35 };

interface Lienzo { canvas: HTMLCanvasElement; tex: THREE.CanvasTexture; }
interface Riego {
  grupo: THREE.Group; puntos: THREE.Points; pos: Float32Array;
  vel: { x: number; y: number; z: number }[]; n: number;
}
interface ParcelaVista {
  id: string; group: THREE.Group; datos: Lectura; clave: string;
  matSuelo: THREE.MeshStandardMaterial; matCultivo: THREE.MeshStandardMaterial;
  matBandera: THREE.MeshStandardMaterial; matAnillo: THREE.MeshBasicMaterial;
  anillo: THREE.Mesh; bandera: THREE.Mesh; plantas: THREE.Mesh[]; hitBox: THREE.Mesh;
  billboard: Lienzo; emoji: Lienzo; emojiSprite: THREE.Sprite; riego: Riego;
  materiales: { mat: THREE.Material; base: number }[];
  factor: number; factorObj: number; factorAplicado: number;
  escala: number; escalaObj: number;
}
interface Callbacks { onFoco: (id: string | null) => void; }

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function rectRedondo(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function nuevoLienzo(w: number, h: number): Lienzo {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return { canvas, tex };
}

function dibujarBillboard(l: Lienzo, d: Lectura) {
  const ctx = l.canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 320, 200);
  ctx.fillStyle = 'rgba(15, 28, 46, 0.9)';
  rectRedondo(ctx, 6, 6, 308, 188, 24);
  ctx.fill();
  ctx.strokeStyle = BORDE[d.estado];
  ctx.lineWidth = 6;
  rectRedondo(ctx, 6, 6, 308, 188, 24);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px Inter, sans-serif';
  ctx.fillText(`Parcela ${d.parcela}`, 160, 48);
  ctx.font = '40px Inter, sans-serif';
  ctx.fillText(EMOJI[d.estado], 160, 100);
  ctx.font = 'bold 22px Inter, sans-serif';
  ctx.fillStyle = '#dff3ff';
  ctx.fillText(`🌡️ ${d.temperatura.toFixed(1)}°C`, 100, 150);
  ctx.fillText(`💧 ${d.humedad_suelo.toFixed(0)}%`, 230, 150);
  ctx.font = 'bold 18px Inter, sans-serif';
  ctx.fillStyle = BORDE[d.estado];
  ctx.fillText(ETIQUETA[d.estado].toUpperCase(), 160, 180);
  l.tex.needsUpdate = true;
}

function dibujarEmoji(l: Lienzo, estado: Estado) {
  const ctx = l.canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 256);
  ctx.font = '200px Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(EMOJI[estado], 128, 138);
  l.tex.needsUpdate = true;
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
  private posInicial = { cam: new THREE.Vector3(12, 12, 14), target: new THREE.Vector3(0, 1.2, 0) };
  private anim: { p0: THREE.Vector3; t0: THREE.Vector3; p1: THREE.Vector3; t1: THREE.Vector3; dur: number; ini: number } | null = null;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private ro: ResizeObserver;
  private down = { x: 0, y: 0 };
  private liberado = false;

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

    this.scene.background = new THREE.Color(0xbfe3ff);
    this.scene.fog = new THREE.Fog(0xbfe3ff, 30, 80);

    this.camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 200);
    this.camera.position.copy(this.posInicial.cam);
    this.camera.lookAt(0, 0, 0);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6;
    this.controls.maxDistance = 40;
    this.controls.maxPolarAngle = Math.PI / 2.2;
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
    const f = Math.max(1, Math.min(1.8, 1.25 / aspecto)); // en pantallas verticales, acerca menos la cámara
    this.irA(new THREE.Vector3(p.x + 4 * f, 1.2 + 4.3 * f, p.z + 4 * f), new THREE.Vector3(p.x, 1.2, p.z), 900);
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
    this.irA(new THREE.Vector3(0, 22, 0.01), new THREE.Vector3(0, 0, 0), 700);
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
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) (Array.isArray(mat) ? mat : [mat]).forEach(x => x.dispose());
    });
    this.renderer.dispose();
    el.remove();
  }

  // ------------------------------------------------------------------ entorno
  private crearEntorno(): void {
    this.scene.add(new THREE.HemisphereLight(0xdff3ff, 0x5a4a2f, 1.0));

    const sol = new THREE.DirectionalLight(0xfff4d6, 1.6);
    sol.position.set(15, 22, 12);
    sol.castShadow = true;
    sol.shadow.mapSize.set(2048, 2048);
    sol.shadow.camera.left = -25; sol.shadow.camera.right = 25;
    sol.shadow.camera.top = 25; sol.shadow.camera.bottom = -25;
    sol.shadow.camera.near = 1; sol.shadow.camera.far = 60;
    sol.shadow.bias = -0.0005;
    this.scene.add(sol);

    const relleno = new THREE.DirectionalLight(0xa9c8ff, 0.35);
    relleno.position.set(-10, 8, -8);
    this.scene.add(relleno);

    const cielo = new THREE.Mesh(
      new THREE.SphereGeometry(100, 32, 16),
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
      new THREE.CircleGeometry(60, 64),
      new THREE.MeshStandardMaterial({ color: 0x6bbf59, roughness: 0.95, metalness: 0 }));
    cesped.rotation.x = -Math.PI / 2;
    cesped.position.y = -0.02;
    cesped.receiveShadow = true;
    this.scene.add(cesped);

    const disco = new THREE.Mesh(new THREE.SphereGeometry(2.2, 24, 24), new THREE.MeshBasicMaterial({ color: 0xfff3b0 }));
    disco.position.set(28, 32, -22);
    this.scene.add(disco);

    const matNube = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0, transparent: true, opacity: 0.92 });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      for (let j = 0; j < 5; j++) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.7 + Math.random() * 0.7, 12, 12), matNube);
        s.position.set((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 1.2);
        g.add(s);
      }
      g.position.set((Math.random() - 0.5) * 60, 12 + Math.random() * 5, (Math.random() - 0.5) * 60);
      g.scale.setScalar(1.2 + Math.random() * 0.8);
      g.userData['velocidad'] = 0.05 + Math.random() * 0.08;
      this.scene.add(g);
      this.nubes.push(g);
    }
  }

  // ------------------------------------------------------------------ parcelas
  private crearParcela(d: Lectura): ParcelaVista {
    const c = COLORES[d.estado];
    const group = new THREE.Group();

    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.0, 3.15, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x8bc97a, roughness: 1, metalness: 0 }));
    base.position.y = 0.15; base.castShadow = true; base.receiveShadow = true;
    group.add(base);

    const matSuelo = new THREE.MeshStandardMaterial({ color: c.suelo, roughness: 1, metalness: 0 });
    const tierra = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 2.75, 0.18, 8), matSuelo);
    tierra.position.y = 0.38; tierra.castShadow = true; tierra.receiveShadow = true;
    group.add(tierra);

    const matSurco = new THREE.MeshStandardMaterial({ color: 0x5a3f22, roughness: 1 });
    for (let i = -1; i <= 1; i++) {
      const surco = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.04, 0.12), matSurco);
      surco.position.set(0, 0.48, i * 1.4);
      group.add(surco);
    }

    const matCultivo = new THREE.MeshStandardMaterial({
      color: c.cultivo, emissive: c.emisivo, emissiveIntensity: EMISION[d.estado], roughness: 0.7,
    });
    const matTallo = new THREE.MeshStandardMaterial({ color: 0x3d8b3d, roughness: 0.9 });
    const plantas: THREE.Mesh[] = [];
    for (let f = 0; f < 3; f++) {
      for (let col = 0; col < 3; col++) {
        const px = (col - 1) * 1.5;
        const pz = (f - 1) * 1.4;
        const tallo = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 6), matTallo);
        tallo.position.set(px, 0.72, pz); tallo.castShadow = true;
        group.add(tallo);
        let copa: THREE.Mesh;
        if ((f + col) % 2 === 0) {
          copa = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), matCultivo);
          copa.scale.y = 0.85;
        } else {
          copa = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.6, 8), matCultivo);
        }
        copa.position.set(px, 1.0, pz); copa.castShadow = true;
        group.add(copa);
        plantas.push(copa);
      }
    }

    const matAnillo = new THREE.MeshBasicMaterial({ color: c.emisivo, transparent: true, opacity: 0.7, side: THREE.DoubleSide });
    const anillo = new THREE.Mesh(new THREE.RingGeometry(2.85, 3.05, 32), matAnillo);
    anillo.rotation.x = -Math.PI / 2; anillo.position.y = 0.34;
    group.add(anillo);

    const hitBox = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 3, 8), new THREE.MeshBasicMaterial({ visible: false }));
    hitBox.position.y = 1.5;
    hitBox.userData['id'] = d.parcela;
    group.add(hitBox);

    const matPoste = new THREE.MeshStandardMaterial({ color: 0xb8c0cc, roughness: 0.6, metalness: 0.4 });
    const poste = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 3, 8), matPoste);
    poste.position.set(0, 1.9, -2.4); poste.castShadow = true;
    group.add(poste);

    const panel = new THREE.Mesh(
      new THREE.BoxGeometry(0.7, 0.05, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.4, metalness: 0.6 }));
    panel.position.set(0, 3.4, -2.4); panel.rotation.x = -0.3; panel.castShadow = true;
    group.add(panel);

    const billboard = nuevoLienzo(320, 200);
    dibujarBillboard(billboard, d);
    const spriteB = new THREE.Sprite(new THREE.SpriteMaterial({ map: billboard.tex, transparent: true, depthTest: true }));
    spriteB.scale.set(3.6, 2.25, 1);
    spriteB.position.set(0, 2.6, -2.35);
    group.add(spriteB);

    const riego = this.crearRiego();
    riego.grupo.position.set(0, 0.4, 0);
    riego.grupo.visible = d.estado === 'CRITICA';
    group.add(riego.grupo);

    const matBandera = new THREE.MeshStandardMaterial({
      color: c.bandera, emissive: c.emisivo, emissiveIntensity: 0.3, side: THREE.DoubleSide, roughness: 0.6,
    });
    const bandera = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), matBandera);
    bandera.position.set(0.35, 3.8, -2.4);
    group.add(bandera);

    const emoji = nuevoLienzo(256, 256);
    dibujarEmoji(emoji, d.estado);
    const emojiSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: emoji.tex, transparent: true, depthTest: false }));
    emojiSprite.scale.set(1.6, 1.6, 1);
    emojiSprite.position.set(0, 4.6, -2.4);
    emojiSprite.renderOrder = 10;
    group.add(emojiSprite);

    // Materiales que se atenúan en modo foco
    const set = new Set<THREE.Material>();
    group.traverse(o => {
      if (o === hitBox || o instanceof THREE.Sprite) return;
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (!m) return;
      (Array.isArray(m) ? m : [m]).forEach(x => set.add(x));
    });
    set.delete(matAnillo);
    const materiales = [...set].map(m => ({ mat: m, base: m.opacity }));

    return {
      id: d.parcela, group, datos: d,
      clave: `${d.temperatura}|${d.humedad_suelo}|${d.estado}`,
      matSuelo, matCultivo, matBandera, matAnillo, anillo, bandera, plantas, hitBox,
      billboard, emoji, emojiSprite, riego, materiales,
      factor: 1, factorObj: 1, factorAplicado: 1, escala: 1, escalaObj: 1,
    };
  }

  private crearRiego(): Riego {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.5, metalness: 0.5 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 8), mat);
    base.position.y = 0.15;
    const torre = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8), mat);
    torre.position.y = 0.7;
    const cabeza = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0x2d3748, metalness: 0.6, roughness: 0.3 }));
    cabeza.position.y = 1.15;
    g.add(base, torre, cabeza);

    const n = 120;
    const pos = new Float32Array(n * 3);
    const vel: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.3;
      pos[i * 3 + 1] = 1.15;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
      const ang = Math.random() * Math.PI * 2;
      const v = 1.5 + Math.random() * 1.2;
      vel.push({ x: Math.cos(ang) * v, y: 1 + Math.random() * 0.5, z: Math.sin(ang) * v });
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const puntos = new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x60a5fa, size: 0.12, transparent: true, opacity: 0.85, sizeAttenuation: true, depthWrite: false,
    }));
    puntos.frustumCulled = false;
    g.add(puntos);
    return { grupo: g, puntos, pos, vel, n };
  }

  private actualizar(pv: ParcelaVista, d: Lectura): void {
    const cambioEstado = pv.datos.estado !== d.estado;
    pv.datos = d;
    if (cambioEstado) this.aplicarEstado(pv, d.estado);
    const clave = `${d.temperatura}|${d.humedad_suelo}|${d.estado}`;
    if (clave !== pv.clave) {
      pv.clave = clave;
      dibujarBillboard(pv.billboard, d);
    }
  }

  private aplicarEstado(pv: ParcelaVista, estado: Estado): void {
    const c = COLORES[estado];
    pv.matSuelo.color.setHex(c.suelo);
    pv.matCultivo.color.setHex(c.cultivo);
    pv.matCultivo.emissive.setHex(c.emisivo);
    pv.matCultivo.emissiveIntensity = EMISION[estado];
    pv.matBandera.color.setHex(c.bandera);
    pv.matBandera.emissive.setHex(c.emisivo);
    pv.matAnillo.color.setHex(c.emisivo);
    dibujarEmoji(pv.emoji, estado);
    pv.riego.grupo.visible = estado === 'CRITICA';
  }

  private quitar(pv: ParcelaVista): void {
    this.scene.remove(pv.group);
    pv.group.traverse(o => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (mat) {
        (Array.isArray(mat) ? mat : [mat]).forEach(x => {
          (x as THREE.SpriteMaterial).map?.dispose();
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
      this.parcelas.get(id)?.group.position.set((col - (enFila - 1) / 2) * 6.5, 0, (fila - (filas - 1) / 2) * 6.5);
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
    this.posInicial.cam.set(12 * k, 12 * k, 14 * k);
    this.controls.maxDistance = Math.max(40, 30 * k);
  }

  private aplicarObjetivosFoco(): void {
    for (const pv of this.parcelas.values()) {
      if (this.foco === null) { pv.factorObj = 1; pv.escalaObj = 1; }
      else if (pv.id === this.foco) { pv.factorObj = 1; pv.escalaObj = 1.08; }
      else { pv.factorObj = 0.25; pv.escalaObj = 0.55; }
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
      if (n.position.x > 35) n.position.x = -35;
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

    pv.emojiSprite.position.y = 4.6 + Math.sin(t * 2 + k) * 0.15;
    pv.bandera.rotation.y = Math.sin(t * 3 + k) * 0.3;

    let op = 0.7, esc = 1;
    if (pv.datos.estado === 'CRITICA') { esc = 1 + Math.sin(t * 4) * 0.08; op = 0.5 + Math.sin(t * 4) * 0.3; }
    else if (pv.datos.estado === 'ATENCION') { op = 0.5 + Math.sin(t * 2) * 0.2; }
    pv.anillo.scale.set(esc, esc, 1);
    pv.matAnillo.opacity = op * pv.factor;

    pv.plantas.forEach((pl, i) => {
      const off = i * 0.5 + k;
      pl.rotation.z = Math.sin(t * 1.5 + off) * 0.06;
      pl.rotation.x = Math.cos(t * 1.2 + off) * 0.04;
    });

    const r = pv.riego;
    if (r.grupo.visible) {
      for (let i = 0; i < r.n; i++) {
        const v = r.vel[i];
        r.pos[i * 3] += v.x * dt;
        r.pos[i * 3 + 1] += v.y * dt;
        r.pos[i * 3 + 2] += v.z * dt;
        v.y -= 3.5 * dt;
        if (r.pos[i * 3 + 1] < 0.4) {
          r.pos[i * 3] = (Math.random() - 0.5) * 0.3;
          r.pos[i * 3 + 1] = 1.15;
          r.pos[i * 3 + 2] = (Math.random() - 0.5) * 0.3;
          const ang = Math.random() * Math.PI * 2;
          const vel = 1.5 + Math.random() * 1.2;
          v.x = Math.cos(ang) * vel; v.y = 1 + Math.random() * 0.5; v.z = Math.sin(ang) * vel;
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
        `${EMOJI[d.estado]} Parcela ${d.parcela} · ${ETIQUETA[d.estado]} · ${d.temperatura.toFixed(1)}°C · ${d.humedad_suelo.toFixed(0)}% suelo`;
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
