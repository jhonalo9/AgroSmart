import { DatePipe } from '@angular/common';
import { Component, DestroyRef, ElementRef, HostListener, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap, timer } from 'rxjs';
import { REFRESCO_MS } from './config';
import { Escena3d } from './escena-3d';
import { LecturaService } from './lectura.service';
import { Alerta, Estado, Lectura, MensajeChat } from './models';



import {
  LucideArrowLeft,
  LucideBell,
  LucideBot,
  LucideChartNoAxesCombined,
  LucideCircleAlert,
  LucideCircleCheck,
  LucideClipboardList,
  LucideDroplets,
  LucideHouse,
  LucideMapPin,
  LucideMessageCircle,
  LucidePause,
  LucidePlay,
  LucideSend,
  LucideSprout,
  LucideThermometer,
  LucideTrendingUp,
  LucideUserRound,
  LucideX,
  LucideAlertTriangle
} from '@lucide/angular';

type Vista = '3d' | 'tendencia';

@Component({
  selector: 'app-root',
  imports: [
    DatePipe,
    Escena3d,
    LucideArrowLeft,
    LucideBell,
    LucideBot,
    LucideChartNoAxesCombined,
    LucideCircleAlert,
    LucideCircleCheck,
    LucideClipboardList,
    LucideDroplets,
    LucideHouse,
    LucideMapPin,
    LucideMessageCircle,
    LucidePause,
    LucidePlay,
    LucideSend,
    LucideSprout,
    LucideThermometer,
    LucideTrendingUp,
    LucideUserRound,
    LucideX,
    LucideAlertTriangle
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private api = inject(LecturaService);
  private destroyRef = inject(DestroyRef);
  private escena = viewChild(Escena3d);
  private hilo = viewChild<ElementRef<HTMLElement>>('hilo');

  // pantalla angosta: la gráfica usa un lienzo más compacto y letras más grandes
  compacto = signal(typeof window !== 'undefined' && window.innerWidth < 640);

  // ---- datos ----
  resumen = signal<Lectura[]>([]);
  historial = signal<Lectura[]>([]);          // cronológico (antiguo -> reciente)
  seleccionada = signal<string | null>(null);
  enfocada = signal<string | null>(null);
  vista = signal<Vista>('3d');
  conectado = signal(true);
  pausado = signal(false);
  cargado = signal(false);

  // ---- alertas ----
  alertas = signal<Alerta[]>([]);
  sinLeer = signal(0);
  modalAlertas = signal(false);
  private estadoPrevio = new Map<string, Estado>();

  // ---- chat ----
  chatAbierto = signal(false);
  mensajes = signal<MensajeChat[]>([{
    rol: 'bot', hora: new Date(),
    texto: '¡Hola! Soy AgroSmart AI 🌱. Pregúntame por el estado de las parcelas o pídeme recomendaciones.'
  }]);
  escribiendo = signal(false);
  noLeidos = signal(0);

  // ---- derivados ----
  actual = computed(() => this.resumen().find(l => l.parcela === this.seleccionada()) ?? null);
  modoFoco = computed(() => this.enfocada() !== null);
  ultimas = computed(() => [...this.historial()].reverse().slice(0, 10));
  hayCritica = computed(() => this.resumen().some(l => l.estado === 'CRITICA'));

  conteo = computed(() => {
    const c = { NORMAL: 0, ATENCION: 0, CRITICA: 0 };
    this.resumen().forEach(l => c[l.estado]++);
    return c;
  });

  promedios = computed(() => {
    const r = this.resumen();
    const m = (f: (l: Lectura) => number) => (r.length ? r.reduce((s, l) => s + f(l), 0) / r.length : 0);
    return { hay: r.length > 0, t: m(l => l.temperatura), a: m(l => l.humedad_ambiental), s: m(l => l.humedad_suelo) };
  });

  resumenAlertas = computed(() => {
    const c = { CRITICA: 0, ATENCION: 0, NORMAL: 0 };
    this.alertas().forEach(a => c[a.estado]++);
    return c;
  });

  titulo = computed(() => {
    const a = this.actual();
    if (this.vista() === 'tendencia' && a) return `Tendencia · Parcela ${a.parcela}`;
    if (this.modoFoco() && a) return `Parcela ${a.parcela} · Monitoreo en vivo`;
    return 'Vista general · Todas las parcelas';
  });

  subtitulo = computed(() => {
    const a = this.actual();
    if ((this.vista() === 'tendencia' || this.modoFoco()) && a)
      return `Última lectura ${this.fmtHora(a.fecha_hora)} · ${this.etiqueta(a.estado)}`;
    const n = this.resumen().length;
    return n ? `${n} ${n === 1 ? 'parcela' : 'parcelas'} · ${this.conteo().CRITICA} en estado crítico` : 'Esperando datos de los sensores';
  });

  sugerencias = computed(() => {
    const id = this.seleccionada();
    return [
      '¿Qué parcela necesita riego?',
      'Resumen general',
      'Recomienda acciones para la crítica',
      id ? `¿Cómo está la parcela ${id}?` : '¿Cómo están las parcelas?',
    ];
  });

  /** Datos de la gráfica de tendencia (escala común 0-100). */
  grafica = computed(() => {
    const h = this.historial();
    const c = this.compacto();
    const ancho = c ? 480 : 900, alto = c ? 300 : 320, margen = c ? 38 : 50;
    const anchoUtil = ancho - margen - 16, altoUtil = alto - 50, base = 25 + altoUtil;
    const y = (v: number) => base - (Math.min(Math.max(v, 0), 100) / 100) * altoUtil;
    const x = (i: number) => margen + (i / Math.max(h.length - 1, 1)) * anchoUtil;
    const pts = (f: (l: Lectura) => number) => h.map((l, i) => `${x(i)},${y(f(l))}`).join(' ');
    const paso = Math.max(1, Math.ceil(h.length / (c ? 4 : 8)));
    return {
      ancho, alto, margen, base, compacto: c, xCritico: ancho - 12,
      guias: [0, 20, 40, 60, 80, 100].map(v => ({ v, y: y(v) })),
      yCritico: y(20),
      ejeX: h.map((l, i) => ({ x: x(i), t: this.fmtHora(l.fecha_hora) })).filter((_, i) => i % paso === 0),
      temperatura: pts(l => l.temperatura),
      ambiente: pts(l => l.humedad_ambiental),
      suelo: pts(l => l.humedad_suelo),
      area: h.length ? `${margen},${base} ${pts(l => l.humedad_suelo)} ${x(h.length - 1)},${base}` : '',
    };
  });

  ngOnInit(): void {
    try { if (localStorage.getItem('agrosmart_vista') === 'tendencia') this.vista.set('tendencia'); } catch { /* sin storage */ }

    timer(0, REFRESCO_MS).pipe(
      switchMap(() => this.pausado() ? of(null) : this.api.resumen().pipe(
        catchError(() => { this.conectado.set(false); return of(null); })
      )),
      takeUntilDestroyed(this.destroyRef)
    ).subscribe(datos => { if (datos) this.procesarResumen(datos); });
  }

  private procesarResumen(datos: Lectura[]): void {
    this.conectado.set(true);
    this.cargado.set(true);
    this.detectarAlertas(datos);
    this.resumen.set(datos);
    const sel = this.seleccionada();
    if (datos.length && (!sel || !datos.some(d => d.parcela === sel))) this.seleccionada.set(datos[0].parcela);
    this.cargarHistorial();
  }

  private cargarHistorial(): void {
    const id = this.seleccionada();
    if (!id) return;
    this.api.historial(id, 20).pipe(catchError(() => of([] as Lectura[])))
      .subscribe(h => { if (id === this.seleccionada()) this.historial.set([...h].reverse()); });
  }

  // ---- navegación ----
  seleccionar(id: string): void {
    if (id === this.enfocada() && this.vista() === '3d') return;
    if (id !== this.seleccionada()) {
      this.seleccionada.set(id);
      this.historial.set([]);
      this.cargarHistorial();
    }
    if (this.vista() === '3d') this.escena()?.enfocar(id);
  }

  /** La escena 3D avisa cuando se entra o sale del modo foco (clic en una parcela, Esc, etc.). */
  alCambiarFoco(id: string | null): void {
    this.enfocada.set(id);
    if (id && id !== this.seleccionada()) {
      this.seleccionada.set(id);
      this.historial.set([]);
      this.cargarHistorial();
    }
  }

  volverGeneral(): void { this.escena()?.salirFoco(); }

  cambiarVista(v: Vista): void {
    if (v === this.vista()) return;
    this.vista.set(v);
    try { localStorage.setItem('agrosmart_vista', v); } catch { /* sin storage */ }
    if (v === 'tendencia') this.escena()?.salirFoco();
  }

  alternarPausa(): void { this.pausado.update(p => !p); }

  // ---- alertas ----
  private detectarAlertas(datos: Lectura[]): void {
    for (const l of datos) {
      const previo = this.estadoPrevio.get(l.parcela);
      const hayAlerta = previo === undefined ? l.estado !== 'NORMAL' : previo !== l.estado;
      if (hayAlerta) {
        this.alertas.update(a => [this.crearAlerta(l), ...a].slice(0, 30));
        if (l.estado !== 'NORMAL') this.sinLeer.update(n => n + 1);
      }
      this.estadoPrevio.set(l.parcela, l.estado);
    }
  }

  private crearAlerta(l: Lectura): Alerta {
    const suelo = l.humedad_suelo.toFixed(1);
    let icono = '✅';
    let mensaje = `Volvió a estado normal (suelo ${suelo} %).`;
    if (l.estado === 'CRITICA') {
      icono = '🚨';
      mensaje = `Humedad de suelo ${suelo} %: revisar de inmediato el suministro de agua.`;
    } else if (l.estado === 'ATENCION') {
      if (l.humedad_suelo >= 50) { icono = '🌡️'; mensaje = `Temperatura de ${l.temperatura.toFixed(1)} °C: vigilar el estrés térmico del cultivo.`; }
      else { icono = '⚠️'; mensaje = `Humedad de suelo ${suelo} %: verificar el riego.`; }
    }
    return { hora: new Date(), parcela: l.parcela, estado: l.estado, mensaje, icono };
  }

  abrirAlertas(): void {
    this.modalAlertas.set(true);
    this.sinLeer.set(0);
    document.body.classList.add('modal-open');
  }

  cerrarAlertas(): void {
    this.modalAlertas.set(false);
    document.body.classList.remove('modal-open');
  }

  // ---- chat ----
  alternarChat(): void {
    const abrir = !this.chatAbierto();
    this.chatAbierto.set(abrir);
    if (abrir) this.noLeidos.set(0);
  }

  enviar(entrada: HTMLInputElement, texto?: string): void {
    const mensaje = (texto ?? entrada.value).trim();
    if (!mensaje || this.escribiendo()) return;
    entrada.value = '';
    this.agregar({ rol: 'usuario', texto: mensaje, hora: new Date() });
    this.escribiendo.set(true);
    this.api.chat(mensaje, this.seleccionada()).subscribe({
      next: r => {
        this.agregar({ rol: 'bot', texto: r.respuesta, hora: new Date() });
        this.escribiendo.set(false);
        if (!this.chatAbierto()) this.noLeidos.update(n => n + 1);
      },
      error: e => {
        this.agregar({ rol: 'error', texto: e?.error?.error ?? 'No se pudo obtener respuesta del asistente.', hora: new Date() });
        this.escribiendo.set(false);
      }
    });
  }

  private agregar(m: MensajeChat): void {
    this.mensajes.update(l => [...l, m]);
    setTimeout(() => {
      const el = this.hilo()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  @HostListener('window:resize')
  alRedimensionar(): void {
    const c = window.innerWidth < 640;
    if (c !== this.compacto()) this.compacto.set(c);
  }

  @HostListener('document:keydown.escape')
  alEscape(): void {
    if (this.modalAlertas()) this.cerrarAlertas();
    else if (this.chatAbierto()) this.chatAbierto.set(false);
    else if (this.modoFoco()) this.volverGeneral();
  }

  // ---- utilidades de plantilla ----
  etiqueta(e: Estado): string { return e === 'ATENCION' ? 'Atención' : e === 'CRITICA' ? 'Crítica' : 'Normal'; }
  emoji(e: Estado): string { return e === 'NORMAL' ? '😊' : e === 'ATENCION' ? '😟' : '😱'; }
  fmtHora(iso: string | Date): string {
    return new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
