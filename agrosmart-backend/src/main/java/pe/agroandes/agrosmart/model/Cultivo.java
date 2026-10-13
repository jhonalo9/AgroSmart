package pe.agroandes.agrosmart.model;

import java.text.Normalizer;
import java.util.Optional;

/** Cultivos que maneja AgroAndes. */
public enum Cultivo {
    PAPAYA("Papaya"), MAIZ("Maíz"), PAPA("Papa"), ESPARRAGO("Espárrago"), TOMATE("Tomate");

    private final String etiqueta;

    Cultivo(String etiqueta) { this.etiqueta = etiqueta; }

    public String getEtiqueta() { return etiqueta; }

    /** Cultivo inicial según el número de la parcela: P01 papaya, P02 maíz, P03 papa, P04 espárrago, P05 tomate, y vuelve a empezar. */
    public static Cultivo porDefecto(String parcela) {
        int n = 0;
        for (char c : parcela.toCharArray()) {
            if (Character.isDigit(c)) n = (n * 10 + (c - '0')) % 100000;
        }
        if (n == 0) return values()[Math.floorMod(parcela.hashCode(), values().length)];
        return values()[Math.floorMod(n - 1, values().length)];
    }

    /** Acepta "PAPAYA", "papaya", "Maíz", "maiz"... */
    public static Optional<Cultivo> desdeTexto(String texto) {
        if (texto == null) return Optional.empty();
        String limpio = Normalizer.normalize(texto.trim().toUpperCase(), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        for (Cultivo c : values()) {
            if (c.name().equals(limpio)) return Optional.of(c);
        }
        return Optional.empty();
    }
}
