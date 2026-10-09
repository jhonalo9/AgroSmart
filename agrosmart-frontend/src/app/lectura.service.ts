import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_URL } from './config';
import { Lectura } from './models';

@Injectable({ providedIn: 'root' })
export class LecturaService {
  private http = inject(HttpClient);

  /** Ultima lectura de cada parcela. */
  resumen(): Observable<Lectura[]> {
    return this.http.get<Lectura[]>(`${API_URL}/parcelas/resumen`);
  }

  /** Historial de una parcela (la mas reciente primero). */
  historial(parcela: string, limite = 30): Observable<Lectura[]> {
    return this.http.get<Lectura[]>(`${API_URL}/parcelas/${parcela}/lecturas?limite=${limite}`);
  }

  /** Consulta al chatbot (el backend arma el prompt con las lecturas reales). */
  chat(mensaje: string, parcela: string | null): Observable<{ respuesta: string }> {
    return this.http.post<{ respuesta: string }>(`${API_URL}/chat`, { mensaje, parcela });
  }
}
