package pe.agroandes.agrosmart.service;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import pe.agroandes.agrosmart.model.Cultivo;
import pe.agroandes.agrosmart.model.Parcela;
import pe.agroandes.agrosmart.repo.LecturaRepository;
import pe.agroandes.agrosmart.repo.ParcelaRepository;

import java.util.Optional;

@Service
public class ParcelaService {

    private final ParcelaRepository repo;
    private final LecturaRepository lecturas;

    public ParcelaService(ParcelaRepository repo, LecturaRepository lecturas) {
        this.repo = repo;
        this.lecturas = lecturas;
    }

    /** Cultivo guardado; si la parcela aún no tiene registro, el que le corresponde por defecto. */
    public Cultivo cultivoDe(String parcela) {
        return repo.findById(parcela).map(Parcela::getCultivo).orElseGet(() -> Cultivo.porDefecto(parcela));
    }

    /** Se llama al llegar una lectura: si la parcela es nueva, le asigna su cultivo inicial. */
    public void asegurar(String parcela) {
        if (repo.existsById(parcela)) return;
        try {
            repo.save(new Parcela(parcela, Cultivo.porDefecto(parcela)));
        } catch (DataIntegrityViolationException yaExiste) {
            // otra lectura simultánea la creó primero: no pasa nada
        }
    }

    /** Cambia el cultivo. Vacío si la parcela no existe (nunca envió lecturas). */
    public Optional<Cultivo> cambiarCultivo(String parcela, Cultivo cultivo) {
        if (!lecturas.parcelas().contains(parcela)) return Optional.empty();
        repo.save(new Parcela(parcela, cultivo));
        return Optional.of(cultivo);
    }
}
