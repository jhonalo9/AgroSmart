package pe.agroandes.agrosmart.web;

import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import pe.agroandes.agrosmart.model.Cultivo;
import pe.agroandes.agrosmart.model.LecturaDto;
import pe.agroandes.agrosmart.model.LecturaResponse;
import pe.agroandes.agrosmart.service.LecturaService;
import pe.agroandes.agrosmart.service.ParcelaService;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api")
public class LecturaController {

    /** Cuerpo de PUT /api/parcelas/{id}/cultivo */
    public record CambioCultivo(String cultivo) { }

    private final LecturaService service;
    private final ParcelaService parcelas;

    public LecturaController(LecturaService service, ParcelaService parcelas) {
        this.service = service;
        this.parcelas = parcelas;
    }

    /** Alternativa HTTP al MQTT (y util para probar con curl). */
    @PostMapping("/lecturas")
    @ResponseStatus(HttpStatus.CREATED)
    public LecturaResponse registrar(@RequestBody LecturaDto dto) {
        var l = service.registrar(dto);
        return LecturaResponse.de(l, parcelas.cultivoDe(l.getParcela()));
    }

    @GetMapping("/parcelas")
    public List<String> parcelas() {
        return service.parcelas();
    }

    /** Ultima lectura de cada parcela (con su cultivo): alimenta la granja 3D y las tarjetas. */
    @GetMapping("/parcelas/resumen")
    public List<LecturaResponse> resumen() {
        return service.parcelas().stream()
                .map(service::ultima)
                .flatMap(Optional::stream)
                .map(l -> LecturaResponse.de(l, parcelas.cultivoDe(l.getParcela())))
                .toList();
    }

    @GetMapping("/parcelas/{id}/lecturas")
    public List<LecturaResponse> historial(@PathVariable String id,
                                           @RequestParam(defaultValue = "50") int limite) {
        Cultivo cultivo = parcelas.cultivoDe(id);
        return service.historial(id, limite).stream().map(l -> LecturaResponse.de(l, cultivo)).toList();
    }

    @GetMapping("/parcelas/{id}/ultima")
    public ResponseEntity<LecturaResponse> ultima(@PathVariable String id) {
        return service.ultima(id)
                .map(l -> ResponseEntity.ok(LecturaResponse.de(l, parcelas.cultivoDe(l.getParcela()))))
                .orElse(ResponseEntity.notFound().build());
    }

    /** Cambia el cultivo de una parcela. */
    @PutMapping("/parcelas/{id}/cultivo")
    public ResponseEntity<Map<String, Object>> cambiarCultivo(@PathVariable String id, @RequestBody CambioCultivo cuerpo) {
        Optional<Cultivo> cultivo = Cultivo.desdeTexto(cuerpo.cultivo());
        if (cultivo.isEmpty()) {
            Map<String, Object> error = Map.of("error", "Cultivo no válido. Usa: PAPAYA, MAIZ, PAPA, ESPARRAGO o TOMATE.");
            return ResponseEntity.badRequest().body(error);
        }
        Optional<Cultivo> guardado = parcelas.cambiarCultivo(id, cultivo.get());
        if (guardado.isEmpty()) {
            Map<String, Object> error = Map.of("error", "La parcela " + id + " no existe.");
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(error);
        }
        Map<String, Object> ok = Map.of("parcela", id, "cultivo", guardado.get());
        return ResponseEntity.ok(ok);
    }

    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String, Object> datosInvalidos(ConstraintViolationException e) {
        return Map.of("error", "Datos invalidos",
                "detalle", e.getConstraintViolations().stream()
                        .map(v -> v.getPropertyPath() + ": " + v.getMessage()).toList());
    }
}
