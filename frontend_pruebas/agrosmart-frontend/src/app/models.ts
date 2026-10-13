export type Estado = 'NORMAL' | 'ATENCION' | 'CRITICA';

export type Cultivo = 'PAPAYA' | 'MAIZ' | 'PAPA' | 'ESPARRAGO' | 'TOMATE';

/** Cultivos que maneja AgroAndes (código que usa el backend y nombre para mostrar). */
export const CULTIVOS: { codigo: Cultivo; nombre: string }[] = [
  { codigo: 'PAPAYA', nombre: 'Papaya' },
  { codigo: 'MAIZ', nombre: 'Maíz' },
  { codigo: 'PAPA', nombre: 'Papa' },
  { codigo: 'ESPARRAGO', nombre: 'Espárrago' },
  { codigo: 'TOMATE', nombre: 'Tomate' },
];

export interface Lectura {
  id: number;
  parcela: string;
  temperatura: number;
  humedad_ambiental: number;
  humedad_suelo: number;
  estado: Estado;
  fecha_hora: string;
  cultivo?: Cultivo;
}

export interface Alerta {
  hora: Date;
  parcela: string;
  estado: Estado;
  mensaje: string;
  icono: string;
}

export interface MensajeChat {
  rol: 'usuario' | 'bot' | 'error';
  texto: string;
  hora: Date;
}
