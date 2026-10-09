package pe.agroandes.agrosmart.model;

import jakarta.persistence.*;
import java.time.Instant;

@Entity
@Table(name = "lecturas", indexes = {
        @Index(name = "idx_lecturas_parcela_fecha", columnList = "parcela, fechaHora")
})
public class Lectura {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 20)
    private String parcela;

    @Column(nullable = false)
    private Double temperatura;

    @Column(nullable = false)
    private Double humedadAmbiental;

    @Column(nullable = false)
    private Double humedadSuelo;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Estado estado;

    @Column(nullable = false)
    private Instant fechaHora;

    protected Lectura() { }

    public Lectura(String parcela, Double temperatura, Double humedadAmbiental,
                   Double humedadSuelo, Estado estado, Instant fechaHora) {
        this.parcela = parcela;
        this.temperatura = temperatura;
        this.humedadAmbiental = humedadAmbiental;
        this.humedadSuelo = humedadSuelo;
        this.estado = estado;
        this.fechaHora = fechaHora;
    }

    public Long getId() { return id; }
    public String getParcela() { return parcela; }
    public Double getTemperatura() { return temperatura; }
    public Double getHumedadAmbiental() { return humedadAmbiental; }
    public Double getHumedadSuelo() { return humedadSuelo; }
    public Estado getEstado() { return estado; }
    public Instant getFechaHora() { return fechaHora; }
}
