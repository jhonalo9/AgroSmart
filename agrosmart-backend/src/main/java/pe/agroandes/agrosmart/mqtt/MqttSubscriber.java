package pe.agroandes.agrosmart.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.eclipse.paho.client.mqttv3.*;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import pe.agroandes.agrosmart.model.LecturaDto;
import pe.agroandes.agrosmart.service.LecturaService;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** Se suscribe al broker MQTT y guarda cada lectura que publican los nodos ESP32. */
@Component
@ConditionalOnProperty(name = "agrosmart.mqtt.enabled", havingValue = "true", matchIfMissing = true)
public class MqttSubscriber implements MqttCallback {

    private static final Logger log = LoggerFactory.getLogger(MqttSubscriber.class);

    private final LecturaService service;
    private final ObjectMapper mapper;
    private final String broker;
    private final String topic;
    private MqttClient client;

    public MqttSubscriber(LecturaService service, ObjectMapper mapper,
                          @Value("${agrosmart.mqtt.broker}") String broker,
                          @Value("${agrosmart.mqtt.topic}") String topic) {
        this.service = service;
        this.mapper = mapper;
        this.broker = broker;
        this.topic = topic;
    }

    @PostConstruct
    void init() throws MqttException {
        client = new MqttClient(broker, "agrosmart-backend-" + UUID.randomUUID(), new MemoryPersistence());
        client.setCallback(this);
    }

    /** Intenta conectar al iniciar y reintenta cada 10 s si se cae la conexion. */
    @Scheduled(initialDelay = 1000, fixedDelay = 10000)
    synchronized void asegurarConexion() {
        if (client == null || client.isConnected()) {
            return;
        }
        try {
            MqttConnectOptions opts = new MqttConnectOptions();
            opts.setCleanSession(true);
            opts.setConnectionTimeout(10);
            opts.setKeepAliveInterval(30);
            client.connect(opts);
            client.subscribe(topic, 1);
            log.info("MQTT conectado a {} y suscrito a {}", broker, topic);
        } catch (MqttException e) {
            log.warn("No se pudo conectar a MQTT ({}). Se reintentara.", e.getMessage());
        }
    }

    @Override
    public void messageArrived(String t, MqttMessage message) {
        String payload = new String(message.getPayload(), StandardCharsets.UTF_8);
        try {
            LecturaDto dto = mapper.readValue(payload, LecturaDto.class);
            var guardada = service.registrar(dto);
            log.info("Lectura guardada [{}] {} -> {}", t, dto.parcela(), guardada.getEstado());
        } catch (Exception e) {
            log.warn("Mensaje descartado en {}: {} | {}", t, e.getMessage(), payload);
        }
    }

    @Override
    public void connectionLost(Throwable cause) {
        log.warn("Conexion MQTT perdida: {}", cause == null ? "?" : cause.getMessage());
    }

    @Override
    public void deliveryComplete(IMqttDeliveryToken token) { }

    @PreDestroy
    void cerrar() {
        try {
            if (client != null) {
                if (client.isConnected()) client.disconnect();
                client.close();
            }
        } catch (MqttException ignored) { }
    }
}
