# Guardián del Guaviare

Dashboard de monitoreo ambiental para el departamento del Guaviare (Colombia).  
Simula sensores de **deforestación**, **incendios** y **nivel de ríos** con mapa en vivo, gráficos y sistema de alertas SMS/WhatsApp (simulado).

> **Datos de demostración (simulados).** Esta app no muestra mediciones ambientales reales.

## Stack

- React 19 + TypeScript + Vite
- Leaflet + OpenStreetMap (mapa interactivo sin clave de API)
- Recharts y Chart.js (gráficos)
- Tailwind CSS
- Datos 100% sintéticos con coordenadas reales del Guaviare

## Cómo correrlo

```bash
cd guardian-guaviare
npm install
npm run dev
```

Abre http://localhost:5173

## Características

- Mapa interactivo con eventos de diferentes severidades
- Filtros por tipo, severidad y estado
- Indicadores ambientales en vivo simulados, con umbrales de color
- Gráficos de tendencia del nivel del río y focos de calor (últimas 20 lecturas)
- Historial de alertas seleccionable que centra el mapa
- Simulador de incendio con aviso sonoro, marcador animado y botón para restablecer
- Botones para inyectar eventos de demostración (incendio / deforestación / río)
- Modal de alerta con simulación de envío SMS/WhatsApp + historial
- Generación automática de nuevos eventos cada ~30 segundos

## Despliegue gratuito en Vercel

No se necesita `vercel.json`, backend, variables de entorno ni claves API. Vercel detecta Vite y publica el contenido generado en `dist`.

1. Sube esta carpeta del proyecto (la que contiene `package.json`) a un repositorio de GitHub.
2. Inicia sesión en [vercel.com](https://vercel.com) con GitHub y elige **Add New → Project**.
3. Importa el repositorio y selecciona como **Root Directory** la carpeta que contiene este `package.json`.
4. Deja **Framework Preset** en `Vite` y confirma estos valores:
   - **Install Command:** `npm install`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
5. No agregues variables de entorno. Pulsa **Deploy**.
6. Vercel dará una URL pública; los siguientes `git push` a la rama conectada generarán nuevos despliegues.

Para probar localmente la misma compilación antes de desplegar:

```bash
npm ci
npm run build
npm run preview
```

## Demo en feria

1. Abre el dashboard
2. Usa los botones de la esquina superior derecha para generar eventos de demostración
3. Haz clic en un evento → se centra el mapa
4. Pulsa **Simular incendio** para probar el aviso y **Restablecer** para volver al estado anterior
5. Selecciona una alerta del historial para centrar el mapa
6. Muestra los gráficos y el historial

## Notas técnicas

- Cero costo de infraestructura
- Todo corre en el navegador
- Las alertas SMS/WhatsApp son solo demostrativas y nunca envían mensajes reales
- En producción real se reemplazaría el generador sintético por datos de FIRMS, IDEAM, etc. y Twilio/WhatsApp Business API
