# AgroSmart AI - Backend IoT

Recibe las lecturas del ESP32 (Wokwi) por MQTT, calcula el estado de la parcela,
las guarda en PostgreSQL y las expone por API REST para el dashboard.

    ESP32 (Wokwi) -> broker MQTT -> Spring Boot -> PostgreSQL -> API REST -> Angular

## Requisitos
- Java 17, Maven 3.9+ (o el IDE: IntelliJ / VS Code con Java)
- Docker Desktop

## Ejecutar
1. Base de datos:        `docker compose up -d`
2. Backend:              `mvn spring-boot:run`
3. Pruebas unitarias:    `mvn test`

Si cambiaste el topico en el sketch de Wokwi, ponlo igual aqui
(`MQTT_TOPIC` o `agrosmart.mqtt.topic` en application.yml).

## Probar SIN Wokwi (HTTP)
    curl -X POST localhost:8080/api/lecturas -H "Content-Type: application/json" \
      -d '{"parcela":"P01","temperatura":24.1,"humedad_ambiental":62,"humedad_suelo":18}'

## Endpoints
| Metodo | Ruta | Descripcion |
|---|---|---|
| POST | /api/lecturas | Registrar una lectura (alternativa a MQTT) |
| GET | /api/parcelas | Lista de parcelas con datos |
| GET | /api/parcelas/resumen | Ultima lectura de cada parcela |
| GET | /api/parcelas/{id}/lecturas?limite=50 | Historial (mas reciente primero) |
| GET | /api/parcelas/{id}/ultima | Ultima lectura de la parcela |

## Variables de entorno (opcionales)
DB_URL, DB_USER, DB_PASSWORD, MQTT_BROKER, MQTT_TOPIC, CORS_ORIGIN
