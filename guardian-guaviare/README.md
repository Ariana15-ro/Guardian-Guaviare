# Guardián del Guaviare

Dashboard de monitoreo ambiental para el departamento del Guaviare (Colombia), con focos de calor reales de NASA FIRMS y datos de demostración para río y deforestación.

> **Demostración, no sistema oficial de alerta.** Los focos de calor reales vienen de NASA FIRMS (VIIRS) y no son confirmaciones de incendios; río y deforestación siguen siendo datos simulados.

## Stack

- React 19 + TypeScript + Vite
- Leaflet + OpenStreetMap (mapa interactivo sin clave de API)
- Recharts y Chart.js (gráficos)
- Tailwind CSS
- NASA FIRMS (VIIRS SNPP NRT) para focos de calor del Guaviare
- Datos sintéticos etiquetados para río, deforestación y modo demo

## Cómo correrlo

```bash
cd guardian-guaviare
npm install
npm run dev
```

Abre http://localhost:5173

## Características

- Mapa interactivo con focos NASA FIRMS y eventos simulados diferenciados
- Filtros por tipo, severidad y estado
- Conteo de focos de calor NASA FIRMS; río y deforestación simulados
- Gráficos de tendencia del nivel del río y focos de calor (últimas 20 lecturas)
- Historial de alertas seleccionable que centra el mapa
- Simulador de foco de calor con aviso sonoro, marcador animado y botón para restablecer
- Botones para inyectar eventos de demostración (foco de calor / deforestación / río)
- Envío de alertas a ntfy.sh desde un endpoint backend protegido
- Generación automática de nuevos eventos cada ~30 segundos

## Datos reales y alertas

La clave de FIRMS y el tema de ntfy solo se usan en las funciones serverless; no se incluyen en el frontend. Copia `.env.example` como `.env.local` y completa las variables en tu entorno local o en la configuración de Vercel:

| Variable | Requerida | Uso |
| --- | --- | --- |
| `FIRMS_MAP_KEY` | Sí | Clave de NASA FIRMS, consumida exclusivamente por `api/fuegos.ts` y `api/notificar.ts`. |
| `NTFY_TOPIC` | Para notificar | Tema de ntfy.sh al que se publican las alertas. |
| `CRON_SECRET` | Para notificar | Token Bearer que protege `/api/notificar`. |
| `DASHBOARD_URL` | Para notificar | URL pública del tablero, usada en el enlace de cada alerta. |
| `NOTIFY_WINDOW_HOURS` | No | Ventana de antigüedad para notificar focos nominales/altos, en horas (por defecto, `6`). |
| `SUPABASE_URL` | No | URL del proyecto Supabase para deduplicación persistente. |
| `SUPABASE_SERVICE_ROLE_KEY` | No | Clave secreta de servidor para insertar registros de deduplicación. Nunca usar en el frontend. |

Obtén una `MAP_KEY` gratuita desde la página de [NASA FIRMS API](https://firms.modaps.eosdis.nasa.gov/api/area/), siguiendo el registro/acceso solicitado por NASA. Crea un tema en [ntfy.sh](https://ntfy.sh/) con un nombre largo y único y suscríbete desde su app o web. Los temas públicos no son privados: no incluyas datos sensibles en las notificaciones y no pongas el nombre del tema en el frontend.

### Configurar la deduplicación de Supabase

1. En el proyecto Supabase, abre **SQL Editor**, pega el contenido completo de [`supabase/schema.sql`](./supabase/schema.sql) y ejecútalo. El esquema se puede ejecutar varias veces.
2. En **Project Settings → API**, copia la **Project URL** a `SUPABASE_URL` y la `service_role` key a `SUPABASE_SERVICE_ROLE_KEY`. Añádelas únicamente al entorno del servidor (por ejemplo, `.env.local` para pruebas locales y las variables de entorno del proyecto); nunca las pongas en el frontend ni en variables `VITE_*`.
3. Llama a `/api/notificar` con su Bearer. En una respuesta exitosa, comprueba que el campo JSON `deduplication` tenga el valor `supabase`. Si Supabase no está configurado o su API falla, se usa deduplicación en memoria y se devuelve `memoria-mejor-esfuerzo`.

### Probar localmente

Vite por sí solo no ejecuta las funciones de `api/`; usa Vercel Dev localmente (esto **no despliega**):

```powershell
Copy-Item .env.example .env.local
# Edita .env.local y completa las variables requeridas
npx vercel dev
```

Abre la URL local que indique Vercel Dev. El dashboard consulta `GET /api/fuegos` al cargar y cada 10 minutos; ante un fallo, reintenta y activa el modo demo con un aviso visible. `/api/fuegos` es de solo lectura y nunca notifica.

Prueba manual de la ruta protegida de notificación (desde PowerShell, cambia URL y secreto por los tuyos):

```powershell
curl.exe -X POST "http://localhost:3000/api/notificar" `
  -H "Authorization: Bearer TU_CRON_SECRET"
```

`/api/notificar` también admite GET con el mismo Bearer. Solo considera focos de confianza nominal/alta adquiridos dentro de `NOTIFY_WINDOW_HOURS` (6 horas por defecto) y limita el envío a cinco notificaciones por ejecución (si hay más focos, agrupa el resto). Las notificaciones indican: “detección satelital, no confirmada”. Con Supabase, los IDs insertados en `notified_hotspots` evitan notificaciones duplicadas; si Supabase no está disponible, la deduplicación usa un `Set` en memoria de mejor esfuerzo y las instancias serverless pueden reiniciarse o no compartir memoria, por lo que pueden repetirse alertas.

### Programar un cron externo

En [cron-job.org](https://cron-job.org/) (plan gratuito), crea un trabajo que ejecute cada 15 minutos:

- URL: `https://TU-DOMINIO/api/notificar`
- Método: `POST`
- Cabecera: `Authorization: Bearer TU_CRON_SECRET`

Guarda el secreto en el gestor de credenciales del cron y en las variables de entorno del backend; no lo publiques en el repositorio ni en el navegador.

### Modo demo

El botón **SIMULACRO · Foco de calor** genera un evento únicamente en la interfaz (incluido el sonido) y no llama al endpoint de notificaciones ni a ntfy. El selector permite cambiar entre **Datos reales** y **Modo demo**.

## Compilar para despliegue posterior

La publicación en Vercel queda a cargo del usuario. Desde esta carpeta, `npm run build` compila el frontend; para ejecutar también las funciones API en local usa `npx vercel dev`.
