package pe.agroandes.agrosmart.service;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.Validator;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import pe.agroandes.agrosmart.model.*;
import pe.agroandes.agrosmart.repo.LecturaRepository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;

@Service
public class LecturaService {

    private final LecturaRepository repo;
    private final EvaluadorEstado evaluador;
    private final Validator validator;

    public LecturaService(LecturaRepository repo, EvaluadorEstado evaluador, Validator validator) {
        this.repo = repo;
        this.evaluador = evaluador;
        this.validator = validator;
    }

    /** Valida, calcula el estado y guarda. Se usa desde MQTT y desde el POST HTTP. */
    public Lectura registrar(LecturaDto dto) {
        Set<ConstraintViolation<LecturaDto>> errores = validator.validate(dto);
        if (!errores.isEmpty()) {
            throw new ConstraintViolationException(errores);
        }
        Estado estado = evaluador.evaluar(dto.temperatura(), dto.humedadSuelo());
        // Se usa la hora del servidor: el reloj del nodo simulado no es confiable.
        return repo.save(new Lectura(dto.parcela(), dto.temperatura(),
                dto.humedadAmbiental(), dto.humedadSuelo(), estado, Instant.now()));
    }

    public List<String> parcelas() {
        return repo.parcelas();
    }

    public List<Lectura> historial(String parcela, int limite) {
        int n = Math.max(1, Math.min(limite, 500));
        return repo.findByParcelaOrderByFechaHoraDesc(parcela, PageRequest.of(0, n));
    }

    public Optional<Lectura> ultima(String parcela) {
        return repo.findFirstByParcelaOrderByFechaHoraDesc(parcela);
    }
}
