package pe.agroandes.agrosmart.model;

import jakarta.persistence.*;

/** Datos fijos de una parcela (hoy: qué cultivo tiene). */
@Entity
@Table(name = "parcelas")
public class Parcela {

    @Id
    @Column(length = 20)
    private String id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Cultivo cultivo;

    protected Parcela() { }

    public Parcela(String id, Cultivo cultivo) {
        this.id = id;
        this.cultivo = cultivo;
    }

    public String getId() { return id; }
    public Cultivo getCultivo() { return cultivo; }
}
