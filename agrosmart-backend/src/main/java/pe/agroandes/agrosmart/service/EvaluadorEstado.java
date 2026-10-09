package pe.agroandes.agrosmart.service;

import org.springframework.stereotype.Component;
import pe.agroandes.agrosmart.model.Estado;

/**
 * Reglas de estado de la parcela (mismas de la biblioteca de prompts de la Fase 2):
 * humedad de suelo >= 50 -> NORMAL, 20-49 -> ATENCION, < 20 -> CRITICA.
 * Una temperatura > 35 C eleva un NORMAL a ATENCION.
 */
@Component
public class EvaluadorEstado {

    static final double SUELO_NORMAL_MIN = 50;
    static final double SUELO_CRITICO_MAX = 20;
    static final double TEMP_ALTA = 35;

    public Estado evaluar(double temperatura, double humedadSuelo) {
        Estado estado;
        if (humedadSuelo < SUELO_CRITICO_MAX) {
            estado = Estado.CRITICA;
        } else if (humedadSuelo < SUELO_NORMAL_MIN) {
            estado = Estado.ATENCION;
        } else {
            estado = Estado.NORMAL;
        }
        if (estado == Estado.NORMAL && temperatura > TEMP_ALTA) {
            estado = Estado.ATENCION;
        }
        return estado;
    }
}
