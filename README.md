# NFCloud · Demo SaaS NFC B2B

Plataforma de **redirección dinámica y analítica en tiempo real** para dispositivos NFC.
MVP comercial pensado para presentar a una cadena corporativa: dashboard con métricas,
gestión de sedes/dispositivos y un motor de redirección que responde en milisegundos.

## Stack

- **Backend:** Node.js + Fastify + TypeScript
- **Datos:** PostgreSQL (persistencia) + Redis (caché de redirección)
- **Frontend:** HTML5 + TailwindCSS (CDN) + Chart.js — servido estático por Fastify
- **Infra:** Docker Compose (Postgres + Redis)

## Arquitectura

```
Navegador NFC ──GET /r/:deviceId──► Fastify ──► Redis (hit <50ms)
                                          └────► PostgreSQL (fallback + registro de escaneo)

Dashboard (public/) ──/api/*──► Fastify ──► PostgreSQL (agregaciones analíticas)
```

- El motor de redirección resuelve el destino desde **Redis** (ruta rápida) y cae a
  **Postgres** si no hay caché, rellenándola después.
- La redirección **302** se envía antes de registrar el `ScanEvent` (fire-and-forget con
  `setImmediate`) para no penalizar la latencia.
- Cambiar la `target_url` desde el dashboard **refresca la caché al instante**.

## Puesta en marcha

Requisitos: Node.js 18+ y Docker.

```bash
# 1. Levantar Postgres y Redis
docker-compose up -d

# 2. Instalar dependencias
npm install

# 3. Copiar variables de entorno (ya viene un .env por defecto)
#    Edita .env si cambiaste puertos/credenciales.

# 4. Poblar la base de datos con la simulación corporativa
npm run seed

# 5. Arrancar el servidor
npm run dev        # desarrollo (recarga en caliente)
# o
npm run build && npm start   # producción
```

Abre el dashboard en **http://localhost:3000/**

> En Windows con PowerShell, si `npm` está bloqueado por la política de ejecución,
> usa `npm.cmd install` / `npm.cmd run seed`, o ejecuta los comandos desde `cmd`.

## Datos de simulación (`npm run seed`)

- **2 sedes reales** con puntos NFC activos:
  - `Lalico - Licorería` (Medellín)
  - `Celumóvil` (Bogotá)
- **84 sedes simuladas** de la cadena `Hogar y Moda`, repartidas en 12 ciudades de
  Colombia (Medellín, Bogotá, Cali, Barranquilla, Cartagena, etc.).
- **15.000 eventos de escaneo** distribuidos en los últimos 30 días, con sesgo hacia
  horas comerciales y una distribución de SO realista (Android ~68% / iOS ~28%).

Al terminar, el seed imprime las **URLs de demostración** (`/r/{deviceId}`) de las
sedes reales para que puedas probar la redirección en vivo.

## Endpoints

### Motor de redirección
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/r/:deviceId` | Redirige 302 a la `target_url` y registra el escaneo. Si el dispositivo no existe o está inactivo, muestra la landing "Dispositivo NFC no configurado". |

### API del dashboard
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/kpis` | KPIs: total, semana, mes, sede más activa, pico de hora, SO. |
| GET | `/api/trend` | Serie diaria de escaneos (gráfico de líneas). |
| GET | `/api/top-locations` | Top 10 sedes por tráfico (gráfico de barras). |
| GET | `/api/hourly` | Escaneos por hora del día (0-23). |
| GET | `/api/locations` | Listado de sedes con nº de puntos NFC y total de clics. |
| GET | `/api/locations/:id/devices` | Dispositivos de una sede. |
| GET | `/api/devices` | Todos los dispositivos con su sede. |
| PATCH | `/api/devices/:id` | Actualiza `target_url` y/o `status` en tiempo real. |
| GET | `/api/health` | Estado de DB y Redis. |

Todos los endpoints analíticos aceptan filtros por query string: `from`, `to`
(fechas `YYYY-MM-DD`) y `locationId`.

## Funcionalidades del dashboard

- Tarjetas de KPIs: total de escaneos, sede más activa, pico de hora, iOS vs Android.
- Gráfico de líneas (tendencia diaria) + doughnut de SO.
- Top 10 sedes (barras) + escaneos por hora.
- Filtros por rango de fechas y por sede.
- Tabla de sedes (nombre, ciudad, estado, puntos NFC, total clics).
- Tabla de dispositivos con formulario para **cambiar la `target_url` en tiempo real**.
- Modo claro / oscuro.

## Estructura del proyecto

```
saas-nfc/
├─ docker-compose.yml       # Postgres + Redis
├─ package.json
├─ tsconfig.json
├─ public/                  # Dashboard estático
│  ├─ index.html
│  ├─ styles.css
│  └─ app.js
└─ src/
   ├─ config.ts
   ├─ server.ts             # Bootstrap de Fastify
   ├─ types.ts
   ├─ lib/os.ts             # Detección de SO por user-agent
   ├─ routes/
   │  ├─ redirect.ts        # Motor GET /r/:deviceId
   │  └─ api.ts             # API analítica y de gestión
   └─ db/
      ├─ schema.sql
      ├─ pool.ts            # Pool de PostgreSQL
      ├─ redis.ts           # Cliente Redis
      ├─ migrate.ts         # npm run migrate
      └─ seed.ts            # npm run seed
```

## Cómo probar la redirección en vivo

1. Corre `npm run seed` y copia una de las URLs `/r/{deviceId}` que imprime.
2. Ábrela en el navegador: serás redirigido a la `target_url` configurada.
3. Vuelve al dashboard: verás el nuevo escaneo reflejado en las métricas.
4. En la vista **Dispositivos NFC**, edita la `target_url` de ese punto y vuelve a
   abrir la URL `/r/{deviceId}`: el cambio surte efecto de inmediato (caché Redis).
