#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <ArduinoJson.h>

// ---------- Configuración ----------
const char* WIFI_SSID = "Wokwi-GUEST";   // red simulada de Wokwi
const char* WIFI_PASS = "";
const char* MQTT_HOST = "broker.hivemq.com";
const int   MQTT_PORT = 1883;

// Cambia este tópico por uno único de tu equipo
const char* TOPIC = "agroandes/jhonatan-mercedes-2026/P01/lecturas";
const char* PARCELA = "P01";

const int PIN_DHT  = 15;
const int PIN_SUELO = 34;
const unsigned long INTERVALO_MS = 5000;

DHT dht(PIN_DHT, DHT22);
WiFiClient espClient;
PubSubClient mqtt(espClient);
unsigned long ultimoEnvio = 0;

void conectarWifi() {
  Serial.print("Conectando a Wi-Fi");
  WiFi.begin(WIFI_SSID, WIFI_PASS, 6);
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println(" OK");
}

void conectarMqtt() {
  while (!mqtt.connected()) {
    String clientId = "agrosmart-" + String(PARCELA) + "-" + String(random(0xffff), HEX);
    Serial.print("Conectando a MQTT... ");
    if (mqtt.connect(clientId.c_str())) {
      Serial.println("OK");
    } else {
      Serial.print("fallo rc=");
      Serial.println(mqtt.state());
      delay(2000);
    }
  }
}

float leerHumedadSuelo() {
  long suma = 0;
  for (int i = 0; i < 10; i++) {
    suma += analogRead(PIN_SUELO);
    delay(5);
  }
  float crudo = suma / 10.0;                 // 0 - 4095
  return constrain(crudo * 100.0 / 4095.0, 0, 100);
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  conectarWifi();
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) conectarWifi();
  if (!mqtt.connected()) conectarMqtt();
  mqtt.loop();

  if (millis() - ultimoEnvio >= INTERVALO_MS) {
    ultimoEnvio = millis();

    float temp = dht.readTemperature();
    float humAmb = dht.readHumidity();
    float humSuelo = leerHumedadSuelo();

    if (isnan(temp) || isnan(humAmb)) {
      Serial.println("Error leyendo el DHT22, se omite el envío");
      return;
    }

    StaticJsonDocument<192> doc;
    doc["parcela"] = PARCELA;
    doc["temperatura"] = round(temp * 10) / 10.0;
    doc["humedad_ambiental"] = round(humAmb * 10) / 10.0;
    doc["humedad_suelo"] = round(humSuelo * 10) / 10.0;

    char payload[192];
    serializeJson(doc, payload);

    bool ok = mqtt.publish(TOPIC, payload);
    Serial.print(ok ? "Publicado: " : "Fallo al publicar: ");
    Serial.println(payload);
  }
}