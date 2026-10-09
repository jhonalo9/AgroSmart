package pe.agroandes.agrosmart.repo;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import pe.agroandes.agrosmart.model.Lectura;

import java.util.List;
import java.util.Optional;

public interface LecturaRepository extends JpaRepository<Lectura, Long> {

    List<Lectura> findByParcelaOrderByFechaHoraDesc(String parcela, Pageable pageable);

    Optional<Lectura> findFirstByParcelaOrderByFechaHoraDesc(String parcela);

    @Query("select distinct l.parcela from Lectura l order by l.parcela")
    List<String> parcelas();
}
