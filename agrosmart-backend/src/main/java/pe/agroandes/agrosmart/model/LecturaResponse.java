package pe.agroandes.agrosmart.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

/** Lectura tal como la consume el dashboard. */
public record LecturaResponse(
        Long id,
        String parcela,
        Double temperatura,
        @JsonProperty("humedad_ambiental") Double humedadAmbiental,
        @JsonProperty("humedad_suelo") Double humedadSuelo,
        Estado estado,
        @JsonProperty("fecha_hora") Instant fechaHora
) {
    public static LecturaResponse de(Lectura l) {
        return new LecturaResponse(l.getId(), l.getParcela(), l.getTemperatura(),
                l.getHumedadAmbiental(), l.getHumedadSuelo(), l.getEstado(), l.getFechaHora());
    }
}
