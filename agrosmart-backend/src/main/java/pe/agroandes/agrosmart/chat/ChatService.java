package pe.agroandes.agrosmart.chat;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.util.StreamUtils;
import pe.agroandes.agrosmart.model.Lectura;
import pe.agroandes.agrosmart.service.LecturaService;
import pe.agroandes.agrosmart.service.ParcelaService;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Optional;

/** Arma el prompt (rol + datos + tarea) con las lecturas reales y consulta al LLM. */
@Service
public class ChatService {

    private static final DateTimeFormatter HORA =
            DateTimeFormatter.ofPattern("HH:mm:ss").withZone(ZoneId.of("America/Lima"));

    private final LecturaService lecturas;
    private final ParcelaService parcelas;
    private final LlmClient llm;
    private final String systemPrompt;

    public ChatService(LecturaService lecturas, ParcelaService parcelas, LlmClient llm,
                       @Value("classpath:prompts/chatbot-system.txt") Resource promptSistema) throws IOException {
        this.lecturas = lecturas;
        this.parcelas = parcelas;
        this.llm = llm;
        this.systemPrompt = StreamUtils.copyToString(promptSistema.getInputStream(), StandardCharsets.UTF_8);
    }

    public ChatResponse responder(ChatRequest req) {
        String prompt = construirPrompt(req);
        return new ChatResponse(llm.completar(systemPrompt, prompt));
    }

    String construirPrompt(ChatRequest req) {
        StringBuilder sb = new StringBuilder("<datos_parcelas>\n");

        if (req.parcela() != null && !req.parcela().isBlank()) {
            sb.append("Parcela consultada: ").append(req.parcela())
              .append(" (cultivo: ").append(parcelas.cultivoDe(req.parcela()).getEtiqueta()).append(")\n");
            List<Lectura> hist = lecturas.historial(req.parcela(), 10);
            if (hist.isEmpty()) {
                sb.append("Sin lecturas registradas para esta parcela.\n");
            } else {
                sb.append("Últimas lecturas (la más reciente primero):\n");
                hist.forEach(l -> sb.append("- ").append(linea(l)).append("\n"));
            }
            sb.append("\n");
        }

        sb.append("Última lectura de cada parcela:\n");
        List<String> todas = lecturas.parcelas();
        if (todas.isEmpty()) {
            sb.append("- No hay datos registrados todavía.\n");
        }
        for (String p : todas) {
            Optional<Lectura> u = lecturas.ultima(p);
            u.ifPresent(l -> sb.append("- ").append(linea(l)).append("\n"));
        }
        sb.append("</datos_parcelas>\n\n<pregunta_usuario>\n")
          .append(req.mensaje().replace("<", "").replace(">", ""))
          .append("\n</pregunta_usuario>");
        return sb.toString();
    }

    private String linea(Lectura l) {
        return String.format("%s (%s) a las %s: temperatura %.1f °C, humedad ambiental %.1f %%, humedad del suelo %.1f %%, estado calculado %s",
                l.getParcela(), parcelas.cultivoDe(l.getParcela()).getEtiqueta(), HORA.format(l.getFechaHora()),
                l.getTemperatura(), l.getHumedadAmbiental(), l.getHumedadSuelo(), l.getEstado());
    }
}
