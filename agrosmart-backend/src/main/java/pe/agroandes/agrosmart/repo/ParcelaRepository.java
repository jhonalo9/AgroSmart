package pe.agroandes.agrosmart.repo;

import org.springframework.data.jpa.repository.JpaRepository;
import pe.agroandes.agrosmart.model.Parcela;

public interface ParcelaRepository extends JpaRepository<Parcela, String> { }
