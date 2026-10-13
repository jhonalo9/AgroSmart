# AgroSmart AI - Dashboard (Angular 20 + Three.js)

Dashboard con granja 3D interactiva, vista de tendencia, centro de alertas y chat flotante
con el asistente (LLM). Consume la API del backend Spring Boot (consulta cada 3 s).

## Requisitos
- Node.js 20.19+ o 22.12+ y npm

## Ejecutar
    npm install        # instala Angular y Three.js
    npm start          # http://localhost:4200

El backend debe estar en http://localhost:8080 (se cambia en src/app/config.ts -> API_URL).

## Compilar para produccion
    npm run build      # salida en dist/agrosmart-frontend/browser

## Estructura
- src/app/config.ts            URL de la API y frecuencia de refresco
- src/app/models.ts            Tipos (Lectura, Alerta, MensajeChat)
- src/app/lectura.service.ts   Llamadas HTTP (resumen, historial, chat)
- src/app/app.ts / app.html    Layout: sidebar, topbar, KPIs, tendencia, tabla, alertas y chat
- src/app/escena-3d.ts         Componente Angular de la granja 3D (carga Three.js bajo demanda)
- src/app/farm-scene.ts        Escena Three.js (lote rectangular, cielo, riego, modo foco)
- src/app/plantas.ts           Modelos 3D de los cultivos (papaya, maiz, papa, esparrago, tomate)
- src/styles.css               Estilos globales del diseño
