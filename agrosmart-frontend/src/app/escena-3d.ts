import { AfterViewInit, Component, ElementRef, NgZone, OnDestroy, effect, inject, input, output, signal, viewChild } from '@angular/core';
import type { FarmScene } from './farm-scene';
import { Lectura } from './models';



import {
  LucideHouse,
  LucideArrowUp,
  LucideMouse,
  LucideHand,
} from '@lucide/angular';

/** Granja 3D. Three.js se carga bajo demanda (chunk aparte) para no inflar el bundle inicial. */
@Component({
  selector: 'app-escena-3d',
  template: `
    <section class="scene-card">
      <div class="scene-header">
        <div class="scene-title">
          <span class="icon-box">🏡</span>
          Granja interactiva <span>· {{ foco() ? 'Parcela ' + foco() : 'todas' }}</span>
        </div>
        <div class="scene-hint">
          <span class="hint-desktop">🖱️ Arrastra para rotar · Rueda para zoom · Clic en una parcela</span>
          <span class="hint-touch">👆 Desliza para rotar · Pellizca para zoom · Toca una parcela</span>
        </div>
      </div>
      <div id="scene3d" class="modo-foco" [class.activo]="foco() !== null" #lienzo>
        <div class="scene-tooltip" #tooltip></div>
        <div class="foco-badge" [class.show]="foco() !== null">
          <span class="dot-foco"></span><span>Viendo Parcela {{ foco() }}</span>
        </div>
        <div class="scene-legend">
          <span><span class="dot NORMAL"></span>Feliz</span>
          <span><span class="dot ATENCION"></span>Sedienta</span>
          <span><span class="dot CRITICA"></span>¡Urgente!</span>
        </div>
        <div class="scene-controls">
          <button (click)="escena?.vistaInicial()" title="Vista inicial">🏠</button>
          <button (click)="escena?.vistaSuperior()" title="Vista superior">⬆</button>
        </div>
        @if (errorGl()) {
          <div class="scene-msg">No se pudo iniciar la vista 3D (WebGL no disponible).<br>Usa la vista «Tendencia».</div>
        } @else if (parcelas().length === 0) {
          <div class="scene-msg">Esperando lecturas de los sensores…</div>
        }
      </div>
    </section>
  `,
})
export class Escena3d implements AfterViewInit, OnDestroy {
  parcelas = input.required<Lectura[]>();
  focoChange = output<string | null>();

  foco = signal<string | null>(null);
  errorGl = signal(false);

  private zone = inject(NgZone);
  private lienzo = viewChild.required<ElementRef<HTMLElement>>('lienzo');
  private tooltip = viewChild.required<ElementRef<HTMLElement>>('tooltip');
  escena: FarmScene | null = null;
  private destruido = false;

  constructor() {
    effect(() => {
      const lista = this.parcelas();
      this.escena?.setParcelas(lista);
    });
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      const { FarmScene } = await import('./farm-scene');
      if (this.destruido) return;
      this.zone.runOutsideAngular(() => {
        this.escena = new FarmScene(this.lienzo().nativeElement, this.tooltip().nativeElement, {
          onFoco: id => this.zone.run(() => { this.foco.set(id); this.focoChange.emit(id); }),
        });
      });
      this.escena!.setParcelas(this.parcelas());
    } catch (e) {
      console.error('No se pudo iniciar la escena 3D', e);
      this.errorGl.set(true);
    }
  }

  enfocar(id: string): void { this.escena?.enfocar(id); }
  salirFoco(): void { this.escena?.salirFoco(); }

  ngOnDestroy(): void {
    this.destruido = true;
    this.escena?.dispose();
    this.escena = null;
  }
}
