# NFCloud — Contexto completo del proyecto

Documento de traspaso para retomar el proyecto en una conversación nueva. Resume qué
es, cómo está construido, qué se ha hecho, qué está en proceso y qué conviene hacer.

> Dueño: David Quintero Gallego. Estudiante de Ingeniería de Sistemas (EAFIT).
> Workspace principal: `c:\Users\AcerNitro\Downloads\saas-nfc` (su plataforma propia).

---

## 1. Qué es NFCloud (en una frase)

Plataforma SaaS B2B que convierte cualquier punto físico de un negocio en un canal
digital **medible y actualizable a distancia**: una tarjeta NFC o código QR cuyo
destino se cambia desde un panel central, y cada interacción queda registrada por sede.
Primer territorio: Valle de Aburrá (Colombia).

**Idea central:** la tarjeta es fija (guarda un código, no el destino), el destino es
editable desde un panel, y cada escaneo alimenta la analítica. Se cambian campañas sin
reimprimir nada.

---

## 2. Estado del negocio (tracción real)

- **Lalico** (licorería, Medellín): de 5 a 29 reseñas en Google en 2 semanas. Caso
  estrella medible.
- **Celumóvil** (accesorios celular, Itagüí): ficha de Google creada desde cero; Google
  reporta 139 vistas y 32 "cómo llegar" en septiembre. Leads de WhatsApp rastreables.
- **Río Vivo** (spa): primera venta formal cerrada por cotización.
- **El profe (Santiago Jiménez Londoño):** segundo cliente de pago (2 tarjetas, $60k) y
  además asesor/aliado estratégico del proyecto (sin beneficio comercial para él).

**Objetivo comercial grande en el horizonte:** cadena "Hogar y Moda" (~84 sedes,
promedio Google 3,8★ con pocas reseñas por sede). Es el caso ancla.

**On Going** (centro de emprendimiento de EAFIT): hubo/hay acercamiento para validación
y mentoría. El profe conectó a David con el decano de Derecho para una posible clase de
integraciones con Claude (tema aparte, pendiente de definir).

---

## 3. Arquitectura técnica (la plataforma propia — ESTA es la base)

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Fastify + TypeScript |
| Base de datos | PostgreSQL (`pg`) |
| Caché | Redis (ioredis) — ruta rápida de redirección |
| Frontend | HTML + CSS + JS vanilla (sin framework ni bundler) |
| Gráficos | Chart.js (local) |
| QR | qrcode-generator (local) |
| Auth | Cookie de sesión firmada HMAC + contraseñas scrypt |
| Infra local | Docker Compose (Postgres + Redis) |
| Deploy | Railway (app + Postgres + Redis gestionados) |

### Estructura de carpetas (resumen)
```
saas-nfc/
├─ src/
│  ├─ server.ts            bootstrap Fastify (orden de registro importa)
│  ├─ config.ts            variables de entorno
│  ├─ types.ts             tipos (incluye DeviceCache con company_name y transition)
│  ├─ db/ schema.sql, pool.ts, redis.ts, migrate.ts, seed.ts
│  ├─ lib/ auth.ts, os.ts, channel.ts, shortcode.ts, transition.ts (pantalla de carga)
│  └─ routes/ api.ts (API del panel), redirect.ts (motor /r/:deviceId)
├─ public/                 frontend estático (index.html, app.js, styles.css, login, logos)
├─ documentos/             documentos de negocio/preparación (NO afectan la app)
├─ assets/                 logos y fotos (fuera de public, no se sirven)
├─ dist/                   salida compilada por tsc
└─ docker-compose.yml, railway.json, package.json
```

### Modelo de datos (PostgreSQL)
- `companies` (tenant), `users` (rol superadmin / company_admin), `locations` (sedes),
  `devices` (puntos NFC/QR), `scan_events` (analítica), `bulk_updates` (campañas,
  revertibles).
- Multi-tenant: `company_admin` ve solo su empresa; `superadmin` ve todo. El `companyId`
  se toma de la sesión en el servidor (el cliente no puede escaparse de su empresa).

### Flujo de redirección (`src/routes/redirect.ts`)
`GET /r/:deviceId` → valida id/código → resuelve device (Redis primero, Postgres
fallback, rellena caché EX 3600) → si activo, redirige 302 → registra el escaneo de
forma asíncrona (setImmediate) con anti-doble-conteo (dedupe Redis, ventana configurable
`SCAN_DEDUPE_SECONDS`, default 30s).

---

## 4. Lo último que se implementó (pantalla de transición)

Se añadió una **pantalla de carga animada opcional** antes de redirigir:

- **Archivo:** `src/lib/transition.ts` genera el HTML. Secuencia: logo NFCloud con pulso
  + "Conectando con {empresa}" (0–700ms) → checkmark verde + "¡Conexión exitosa!"
  (700ms–1.3s) → `window.location.replace(destino)` a los 1.3s (para que el botón Atrás
  no vuelva a la pantalla). Respeta `prefers-reduced-motion`. Usa el logo
  `public/logo-icono-blanco.png` embebido en base64.
- **Activación (doble vía):**
  1. Columna `transition BOOLEAN` en `devices` (default false). Si true, esa tarjeta
     muestra la pantalla.
  2. Parámetro `?preview=1` en la URL, para forzarla en demos sin tocar la config.
- **Control de la columna:** endpoint `PATCH /api/devices/:id/transition` protegido
  **solo para superadmin** (otros reciben 403). En el panel de Dispositivos aparece un
  botón (ícono "activity") **solo si el rol es superadmin**; al activar se pone verde y
  refresca la caché de Redis.
- **Por defecto está DESACTIVADA:** las tarjetas normales siguen con 302 instantáneo
  (no se añade fricción a reseñas/WhatsApp). Es una función de David (superadmin), no
  visible para los clientes.

**Decisión de diseño detrás de esto:** la velocidad instantánea es parte del valor del
producto; por eso la pantalla es opcional y controlada, no el comportamiento por defecto.

---

## 5. Mejoras de UX/UI ya implementadas en el panel (`public/app.js`, `styles.css`)

- Auto-refresco del dashboard cada 8s + refresco al volver a la pestaña
  (`visibilitychange`).
- Gráficos que se actualizan sin parpadeo (`upsertChart` en vez de destruir y recrear).
- Chips de filtros activos (sede/fecha/canal) con opción de quitar; solo en vistas de
  analítica.
- Estados vacíos claros cuando una gráfica no tiene datos.
- Loaders/skeleton (shimmer) en tarjetas de gráficos durante la carga.
- Accesibilidad: `aria-label` en botones de solo-ícono, foco visible por teclado.
- Combobox de búsqueda de sede al crear dispositivo (en vez de un `<select>` largo).
- Modal de confirmación propio (reemplaza el `confirm()` nativo) para borrados y acciones.
- Fix de bug: creación de sede ahora asigna `company_id` (antes quedaba huérfana).
- Fix: filtro global de sede se oculta en vistas de gestión (evita confusión con el
  buscador de la tabla).
- Fix: benchmark de la comparativa ejecutiva ignora el filtro de sede (ya no colapsa el
  Top 3).

---

## 6. Dos plataformas distintas (importante no confundir)

1. **NFCloud propia (ESTE workspace, `saas-nfc`):** TypeScript + Fastify + Redis.
   La construyó David, la controla, está más pulida en experiencia. **Es la base de
   trabajo.** Desplegada en Railway.
2. **NFCloud del profe (`nfcloud-profe`, repo github.com/sjimenezlon/nfcloud):**
   JavaScript + serverless (Vercel) + Neon Postgres. La estructuró el profe. Tiene más
   funcionalidades de negocio (calificación interna por aspectos, planes, alta rápida,
   hoja de instalación, modelo de negocio, presentación comercial) pero menos pulido de
   UX. David tiene acceso al repo.

**Decisión pendiente (a hablar con el profe):** cuál será la base definitiva. NO fusionar
las dos arquitecturas (son muy distintas); elegir una y portar lo mejor de la otra. Por
ahora se trabaja sobre la propia. Hay un PR abierto en el repo del profe con el logo de
NFCloud (branding), pendiente de que el profe lo apruebe.

### Diferencias clave de producto
- La del profe tiene **3 modos de punto**: redirigir, calificar (encuesta propia por
  aspectos según sector) y menú. La propia solo redirige.
- La del profe distingue NFC vs QR (`?v=n` / `?v=q`) con el mismo código. La propia usa
  un solo enlace.
- La del profe NO tiene anti-doble-conteo ni auto-refresco (la propia sí).

---

## 7. Modelo de negocio y precios (estructurado con el profe)

Dos componentes: **hardware (pago único)** + **plataforma (suscripción mensual)**.

**Planes de plataforma (según tamaño del cliente):**
- **Punto** $39.900/mes — 1 sede, hasta 6 puntos (tarifa plana, no se multiplica).
- **Sedes** $34.900 por sede/mes — 2 a 10 sedes.
- **Red** $19.900 por sede/mes — 11+ sedes.
- **Institución** $49.900 por punto de atención/mes — entidades públicas, mínimo 3
  puntos (se multiplica por ventanilla).

**Hardware (pago único, aprox.):** tarjeta NFC $29.900; paquete 10 tarjetas $199.000;
hablador acrílico 3 chips $129.000; kit de inicio $249.000; instalación por sede $60.000.

**Mercado (datos del RUES, Cámaras de Comercio):** TAM ~95.624 negocios; SAM ~55.000;
SOM (meta 12 meses) 167 clientes. Segundo mercado: instituciones públicas (Decreto 1499
exige medir satisfacción del ciudadano).

**Costo de producción bajo = fortaleza** (margen alto, negocio escalable tipo SaaS), no
debilidad. La narrativa de venta es resultado (reputación, leads), no tecnología.

---

## 8. Documentos de apoyo (carpeta `documentos/`)

- `RESUMEN-PROYECTO-PROFESOR.md` — resumen para el profe (con fotos del producto).
- `RESPALDO-EVIDENCIA.md` — estudios/datos verificables (Harvard, BrightLocal, Womply).
- `ENTENDER-PLATAFORMA-PROFE.md` — guía de la plataforma del profe y el modelo.
- `GLOSARIO.md` — términos técnicos explicados.
- `PREPARACION-REUNIONES.md` y `HOJA-RUTA-ONGOING-VIERNES.md` — guiones de reunión.
- Hay un conversor `scripts/md-to-html.js` para pasar estos .md a HTML autocontenido
  (imágenes embebidas), y de ahí a PDF desde el navegador.

Nota: nada en `documentos/`, `assets/` ni `scripts/` afecta la app desplegada (el
servidor solo sirve `public/`). El `README.md` de la raíz sí es parte del repo.

---

## 9. Pendientes / qué conviene hacer

**Técnico (plataforma propia):**
- La base local tiene un **esquema antiguo** (solo `devices`, `locations`,
  `scan_events`; faltan `companies`, `users`, `bulk_updates`). La migración completa
  (`npm run migrate`) falla por un slug duplicado en el backfill — conviene arreglar el
  script de migración para que sea idempotente de verdad con datos preexistentes.
- Al desplegar la pantalla de transición a Railway, correr el `ALTER TABLE devices ADD
  COLUMN IF NOT EXISTS transition BOOLEAN NOT NULL DEFAULT false;` (o la migración).
- El motor hace fallback robusto si no existe `companies`/`transition` (funciona en
  esquema viejo y nuevo), pero lo ideal es normalizar el esquema.

**Producto (ideas evaluadas, no implementadas en la propia):**
- Calificación interna por aspectos (la tiene el profe; abre el mercado institucional).
- Alta rápida (empresa+sede+kit en un formulario), hoja de instalación imprimible,
  informe mensual PDF.
- Conexión con reseñas de Google (Google Places API) para mostrar nota/reseñas en el
  panel — posible pero con límites (costo, solo ~5 reseñas, no publica/responde).
- Eliminar el parpadeo ya está hecho; faltaría, si se quiere, persistir filtros en
  URL/localStorage, ordenamiento por columnas y paginación en tablas grandes.

**Comercial:**
- Definir con el profe la plataforma base (reunión pendiente).
- Cerrar Hogar y Moda (empezar por un piloto de pocas sedes, incluida una de peor
  calificación como Junín).

---

## 10. Cómo correr localmente

```
docker compose up -d        # Postgres + Redis
npm install
npm run migrate             # (o aplicar ALTERs sueltos si el backfill falla)
npm run dev                 # servidor con recarga (tsx watch), http://localhost:3000
```
Variables de entorno en `.env` (local apunta a Docker). En Railway se configuran en el
panel del servicio. El `.env` real no se sube a git.

**Probar la pantalla de transición:** activar el toggle (superadmin) en un dispositivo y
abrir `/r/<id>`, o forzarla con `/r/<id>?preview=1`.

---

## 11. Estilo de trabajo esperado (steering del proyecto)

Hay un steering en `.kiro/steering/execution-style.md`: durante tareas de código, no
narrar entre tool calls, no anunciar pasos, ejecutar en silencio y dar un único resumen
final breve. Preguntas conceptuales se responden normal. Respetarlo.

---

*Documento de traspaso. Resume el estado del proyecto para continuar en otra sesión.*
