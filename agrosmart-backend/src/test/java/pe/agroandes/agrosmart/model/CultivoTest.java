package pe.agroandes.agrosmart.model;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CultivoTest {

    @Test
    void cultivoInicialSegunNumeroDeParcela() {
        assertEquals(Cultivo.PAPAYA, Cultivo.porDefecto("P01"));
        assertEquals(Cultivo.MAIZ, Cultivo.porDefecto("P02"));
        assertEquals(Cultivo.PAPA, Cultivo.porDefecto("P03"));
        assertEquals(Cultivo.ESPARRAGO, Cultivo.porDefecto("P04"));
        assertEquals(Cultivo.TOMATE, Cultivo.porDefecto("P05"));
    }

    @Test
    void vuelveAEmpezarDespuesDeLaQuinta() {
        assertEquals(Cultivo.PAPAYA, Cultivo.porDefecto("P06"));
        assertEquals(Cultivo.TOMATE, Cultivo.porDefecto("P10"));
    }

    @Test
    void parcelaSinNumeroTambienTieneCultivo() {
        assertTrue(Cultivo.desdeTexto(Cultivo.porDefecto("NORTE").name()).isPresent());
    }

    @Test
    void aceptaTextoConTildesYMinusculas() {
        assertEquals(Cultivo.MAIZ, Cultivo.desdeTexto("Maíz").orElseThrow());
        assertEquals(Cultivo.ESPARRAGO, Cultivo.desdeTexto("espárrago").orElseThrow());
        assertEquals(Cultivo.TOMATE, Cultivo.desdeTexto(" TOMATE ").orElseThrow());
    }

    @Test
    void rechazaCultivosDesconocidos() {
        assertTrue(Cultivo.desdeTexto("banana").isEmpty());
        assertTrue(Cultivo.desdeTexto(null).isEmpty());
    }
}
