package pe.agroandes.agrosmart.chat;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** Consulta del usuario. "parcela" es opcional: la parcela seleccionada en el dashboard. */
public record ChatRequest(
        @NotBlank @Size(max = 500) String mensaje,
        @Pattern(regexp = "^[A-Za-z0-9_-]{1,20}$") String parcela
) { }
