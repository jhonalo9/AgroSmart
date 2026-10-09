package pe.agroandes.agrosmart.model;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.*;

/** Mensaje que envia el nodo ESP32 (MQTT) o un cliente HTTP. */
public record LecturaDto(
        @NotBlank
        @Pattern(regexp = "^[A-Za-z0-9_-]{1,20}$", message = "parcela invalida")
        String parcela,

        @NotNull @DecimalMin("-40") @DecimalMax("80")
        Double temperatura,

        @JsonProperty("humedad_ambiental")
        @NotNull @DecimalMin("0") @DecimalMax("100")
        Double humedadAmbiental,

        @JsonProperty("humedad_suelo")
        @NotNull @DecimalMin("0") @DecimalMax("100")
        Double humedadSuelo
) { }
