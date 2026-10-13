package pe.agroandes.agrosmart.chat;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Cliente de la API de Google Gemini (generateContent).
 * Si luego quieres usar otro proveedor, solo cambia esta clase: el resto del sistema no se entera.
 */
@Component
public class LlmClient {

    private static final Logger log = LoggerFactory.getLogger(LlmClient.class);

    private final ObjectMapper mapper;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
    private final String apiKey;
    private final String model;
    private final String url;
    private final int maxTokens;

    public LlmClient(ObjectMapper mapper,
                     @Value("${agrosmart.llm.api-key:}") String apiKey,
                     @Value("${agrosmart.llm.model}") String model,
                     @Value("${agrosmart.llm.url}") String url,
                     @Value("${agrosmart.llm.max-tokens}") int maxTokens) {
        this.mapper = mapper;
        this.apiKey = apiKey;
        this.model = model;
        this.url = url;
        this.maxTokens = maxTokens;
    }

    public String completar(String system, String usuario) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalStateException("Falta configurar la variable de entorno GEMINI_API_KEY");
        }
        try {
            Map<String, Object> body = Map.of(
                    "systemInstruction", Map.of("parts", List.of(Map.of("text", system))),
                    "contents", List.of(Map.of("role", "user", "parts", List.of(Map.of("text", usuario)))),
                    "generationConfig", Map.of("maxOutputTokens", maxTokens, "temperature", 0.3));

            // Acepta la URL base (.../v1beta/models) o una URL completa que ya termine en :generateContent
            String endpoint = url.contains(":generateContent")
                    ? url
                    : url.replaceAll("/+$", "") + "/" + model + ":generateContent";

            HttpRequest req = HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(30))
                    .header("content-type", "application/json")
                    .header("x-goog-api-key", apiKey)
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            int st = res.statusCode();
            if (st / 100 != 2) {
                log.warn("La API de Gemini respondió {}: {}", st, res.body());
                String msg;
                if (st == 429) {
                    msg = "Se alcanzó el límite de uso de la API de Gemini. Espera un minuto e intenta de nuevo.";
                } else if (st == 401 || st == 403 || (st == 400 && res.body().contains("API key not valid"))) {
                    msg = "La clave de API de Gemini no es válida o no tiene permisos.";
                } else if (st == 404) {
                    msg = "No se encontró el modelo '" + model + "'. Revisa la variable LLM_MODEL.";
                } else {
                    msg = "El modelo respondió con error " + st;
                }
                throw new LlmException(msg);
            }

            JsonNode raiz = mapper.readTree(res.body());
            String bloqueo = raiz.path("promptFeedback").path("blockReason").asText("");
            if (!bloqueo.isEmpty()) {
                throw new LlmException("El modelo bloqueó la consulta (" + bloqueo + ").");
            }

            JsonNode candidato = raiz.path("candidates").path(0);
            StringBuilder texto = new StringBuilder();
            for (JsonNode parte : candidato.path("content").path("parts")) {
                if (parte.path("thought").asBoolean(false)) continue; // omite el "razonamiento" interno si viniera
                texto.append(parte.path("text").asText(""));
            }
            if (texto.isEmpty()) {
                String fin = candidato.path("finishReason").asText("desconocido");
                throw new LlmException("El modelo no devolvió texto (motivo: " + fin + ").");
            }
            return texto.toString().trim();
        } catch (IOException e) {
            throw new LlmException("No se pudo contactar al modelo", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new LlmException("Consulta interrumpida", e);
        }
    }
}