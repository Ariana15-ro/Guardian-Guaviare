# Guardián del Guaviare · contexto para agentes de código

Proyecto de demostración (sin presupuesto, un solo desarrollador). Tablero web de monitoreo ambiental del departamento de Guaviare (Colombia): focos de calor REALES (NASA FIRMS) y datos SIMULADOS de río y deforestación, siempre etiquetados como simulados. No es un sistema oficial de alerta.

## Estructura
- Raíz del repo `Guardian-Guaviare/`: `.github/workflows/notificar.yml` (cron de respaldo) y la app en la subcarpeta `guardian-guaviare/` (ahí está `package.json`; los comandos npm se corren en esa carpeta).
- `guardian-guaviare/src/`: React + Vite + TypeScript, Leaflet (OpenStreetMap claro, con atribución; NO usar CARTO), Chart.js.
- `guardian-guaviare/api/` (funciones serverless de Vercel, ESM: los imports relativos llevan extensión `.js`):
  - `fuegos.ts`: GET público, solo lectura. Focos de las últimas 24 h, `last5DaysCount`, `lastDetection`, campo `inGuaviare` por foco.
  - `notificar.ts`: protegido con `Authorization: Bearer $CRON_SECRET`. Notifica por ntfy.sh solo focos dentro del Guaviare, deduplica en Supabase por celda de 0.05° y día UTC, hace rollback si falla el envío y responde 503 si Supabase no está disponible.
  - `salud.ts`: comprobación de NASA, Supabase y configuración.
  - `_lib/firms.ts` (consulta VIIRS SNPP, NOAA-20 y NOAA-21 NRT, parser por nombre de columna) y `_lib/guaviare-boundary.ts` (contorno y `isInsideGuaviare`).
- `guardian-guaviare/public/`: `guaviare.geojson`, `focos-historicos-guaviare.json` (captura real 16–19/10/2026 para el modo histórico), PWA (`manifest.webmanifest`, `sw.js`), iconos y `og-image.png`.
- `guardian-guaviare/supabase/schema.sql`: tabla `notified_hotspots` con RLS activado y sin políticas públicas.

## Variables de entorno (nombres; los valores viven solo en Vercel y en `.env.local`)
`FIRMS_MAP_KEY`, `NTFY_TOPIC`, `CRON_SECRET`, `DASHBOARD_URL`, `NOTIFY_WINDOW_HOURS` (6), `NOTIFY_MIN_FRP`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

## Reglas obligatorias
1. NUNCA abras, imprimas ni copies `.env*` ni pidas valores de claves. No escribas claves en el código, el README, los logs ni los mensajes.
2. Ninguna clave en el frontend ni en variables `VITE_*`. NASA, Supabase y ntfy solo se llaman desde `api/`.
3. NO despliegues ni ejecutes comandos de Vercel que publiquen. El desarrollador hace `git push` y Vercel despliega.
4. Cualquier envío real de notificaciones solo ocurre desde `api/notificar.ts`. El botón de simulacro y el modo histórico NUNCA llaman a `/api/notificar`.
5. Lo simulado debe verse siempre etiquetado ("SIMULADO"); el texto dice "foco de calor" y "detección satelital, no confirmada", no "incendio confirmado".
6. Al terminar cada tarea: correr `npm run build` en `guardian-guaviare/` (debe pasar sin errores ni advertencias) y `git diff --check`; resumir los cambios y archivos tocados. No hagas commits ni push.
7. No agregues dependencias de pago ni servicios que requieran tarjeta. Cambios mínimos y enfocados: no reescribas archivos enteros sin necesidad.
8. Mantén el diseño responsive (360–1280 px), la PWA y el modo histórico (`?demo=historico`) funcionando.
9. El repositorio es PÚBLICO: nada sensible en ningún archivo.

## Atribuciones que deben seguir visibles
NASA FIRMS (VIIRS), © OpenStreetMap contributors (mapa) y geoBoundaries / OpenStreetMap, ODbL (contorno).

## Pendientes conocidos
- Etiqueta de severidad de los focos reales ("Alta" con FRP bajo y confianza nominal) y KPI que mezclan reales y simulados.
- Gráficas: reemplazar la línea "Focos NASA FIRMS · últimas 24 h" por barras de focos reales por día (5 días); la tendencia de 7 días muestra ceros al inicio.
- Panel "Eventos detectados" duplicado; los reales deben ir primero.
- Insignia "En vivo" → "Demo en vivo".
- Modo presentación (opcional) y APK vía PWABuilder (fuera del código).
