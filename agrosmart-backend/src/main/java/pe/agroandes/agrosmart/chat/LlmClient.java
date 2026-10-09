package pe.agroandes.agrosmart.chat;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;

/**
 * Cliente de la API del LLM (Anthropic Messages API).
 * Si luego quieres usar otro proveedor (OpenAI, Gemini...), solo cambia esta clase.
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
            throw new IllegalStateException("Falta configurar la variable de entorno ANTHROPIC_API_KEY");
        }
        try {
            Map<String, Object> body = Map.of(
                    "model", model,
                    "max_tokens", maxTokens,
                    "system", system,
                    "messages", List.of(Map.of("role", "user", "content", usuario)));

            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .header("content-type", "application/json")
                    .header("x-api-key", apiKey)
                    .header("anthropic-version", "2023-06-01")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (res.statusCode() / 100 != 2) {
                log.warn("La API del LLM respondió {}: {}", res.statusCode(), res.body());
                throw new LlmException("El modelo respondió con error " + res.statusCode());
            }

            StringBuilder texto = new StringBuilder();
            for (JsonNode bloque : mapper.readTree(res.body()).path("content")) {
                if ("text".equals(bloque.path("type").asText())) {
                    texto.append(bloque.path("text").asText());
                }
            }
            if (texto.isEmpty()) {
                throw new LlmException("El modelo no devolvió texto");
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
