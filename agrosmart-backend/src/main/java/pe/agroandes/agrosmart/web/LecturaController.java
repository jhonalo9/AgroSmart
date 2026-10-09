package pe.agroandes.agrosmart.web;

import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import pe.agroandes.agrosmart.model.LecturaDto;
import pe.agroandes.agrosmart.model.LecturaResponse;
import pe.agroandes.agrosmart.service.LecturaService;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api")
public class LecturaController {

    private final LecturaService service;

    public LecturaController(LecturaService service) {
        this.service = service;
    }

    /** Alternativa HTTP al MQTT (y util para probar con curl). */
    @PostMapping("/lecturas")
    @ResponseStatus(HttpStatus.CREATED)
    public LecturaResponse registrar(@RequestBody LecturaDto dto) {
        return LecturaResponse.de(service.registrar(dto));
    }

    @GetMapping("/parcelas")
    public List<String> parcelas() {
        return service.parcelas();
    }

    /** Ultima lectura de cada parcela: alimenta las tarjetas del dashboard. */
    @GetMapping("/parcelas/resumen")
    public List<LecturaResponse> resumen() {
        return service.parcelas().stream()
                .map(service::ultima)
                .flatMap(java.util.Optional::stream)
                .map(LecturaResponse::de)
                .toList();
    }

    @GetMapping("/parcelas/{id}/lecturas")
    public List<LecturaResponse> historial(@PathVariable String id,
                                           @RequestParam(defaultValue = "50") int limite) {
        return service.historial(id, limite).stream().map(LecturaResponse::de).toList();
    }

    @GetMapping("/parcelas/{id}/ultima")
    public ResponseEntity<LecturaResponse> ultima(@PathVariable String id) {
        return service.ultima(id)
                .map(l -> ResponseEntity.ok(LecturaResponse.de(l)))
                .orElse(ResponseEntity.notFound().build());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> datosInvalidos(ConstraintViolationException e) {
        return Map.of("error", "Datos invalidos",
                "detalle", e.getConstraintViolations().stream()
                        .map(v -> v.getPropertyPath() + ": " + v.getMessage()).toList());
    }
}
