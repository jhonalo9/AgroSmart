# AgroSmart AI

Sistema de monitoreo agricola con IoT (ESP32 en Wokwi + MQTT), backend Spring Boot,
dashboard Angular y chatbot con LLM.

![CI/CD](../../actions/workflows/ci-cd.yml/badge.svg)

## Estructura
- `backend/`   Spring Boot + PostgreSQL + MQTT + chatbot
- `frontend/`  Dashboard Angular
- `iot/`       Codigo del ESP32 (sketch de Wokwi) y enlace al proyecto
- `.github/workflows/ci-cd.yml`  Pipeline CI/CD

## Pipeline CI/CD
GitHub -> push -> GitHub Actions -> Build -> Tests -> Docker build -> Deploy (simulado)

| Job | Que hace |
|---|---|
| backend | Compila con Maven y ejecuta las pruebas unitarias |
| frontend | `npm ci` y compilacion de produccion de Angular |
| docker | Construye las imagenes; en `main` las publica en ghcr.io |
| deploy-simulado | Valida el compose de despliegue y simula el despliegue (solo en `main`) |

## Ejecutar todo con Docker
    docker compose -f docker-compose.deploy.yml up --build

(Opcional: `ANTHROPIC_API_KEY` como variable de entorno para el chatbot.)
