export type Estado = 'NORMAL' | 'ATENCION' | 'CRITICA';

export interface Lectura {
  id: number;
  parcela: string;
  temperatura: number;
  humedad_ambiental: number;
  humedad_suelo: number;
  estado: Estado;
  fecha_hora: string;
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
