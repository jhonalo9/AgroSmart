package pe.agroandes.agrosmart.service;

import org.junit.jupiter.api.Test;
import pe.agroandes.agrosmart.model.Estado;

import static org.junit.jupiter.api.Assertions.assertEquals;

class EvaluadorEstadoTest {

    private final EvaluadorEstado evaluador = new EvaluadorEstado();

    @Test
    void sueloHumedoEsNormal() {
        assertEquals(Estado.NORMAL, evaluador.evaluar(24, 75));
    }

    @Test
    void sueloMedioEsAtencion() {
        assertEquals(Estado.ATENCION, evaluador.evaluar(24, 35));
    }

    @Test
    void sueloMuySecoEsCritica() {
        assertEquals(Estado.CRITICA, evaluador.evaluar(24, 15));
    }

    @Test
    void limitesDeLosUmbrales() {
        assertEquals(Estado.NORMAL, evaluador.evaluar(24, 50));
        assertEquals(Estado.ATENCION, evaluador.evaluar(24, 49.9));
        assertEquals(Estado.ATENCION, evaluador.evaluar(24, 20));
        assertEquals(Estado.CRITICA, evaluador.evaluar(24, 19.9));
    }

    @Test
    void temperaturaAltaEleva_NormalAAtencion() {
        assertEquals(Estado.ATENCION, evaluador.evaluar(36, 70));
    }

    @Test
    void temperaturaAltaNoReduceUnaCritica() {
        assertEquals(Estado.CRITICA, evaluador.evaluar(38, 10));
    }
}
