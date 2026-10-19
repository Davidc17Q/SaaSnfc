# CLAUDE.md — Guía para Claude Code en el proyecto NFCloud

Este archivo orienta a Claude Code al trabajar en este repositorio y es la
**fuente de verdad**. `AGENTS.md` y `.kiro/steering/` son legado de Kiro; si algo
entra en conflicto, prevalece este archivo.

---

## Qué es el proyecto

NFCloud: plataforma SaaS B2B de **redirección dinámica y analítica para puntos
NFC/QR**. Un punto físico (tarjeta/sticker) lleva un código corto; al escanear,
`/r/:code` resuelve a un destino configurable (reseñas de Google, WhatsApp, menú,
etc.) y registra el evento para analítica por sede. Multi-empresa (multi-tenant).

Objetivo de marca: que se vea **caro, confiable y bien desarrollado** para
gerentes y directivos de cadenas. Premium = disciplina y restricción, no efectos
vistosos. El dato es la estrella.

## Stack y arquitectura

- Backend: **Node.js + Fastify + TypeScript** (`strict: true`).
- Datos: **PostgreSQL** (`pg`) y **Redis** (`ioredis`, caché de dispositivos +
  anti-doble-conteo de escaneos).
- Frontend: **HTML/CSS/JS vanilla sin framework**, **Chart.js local**
  (`public/chart.umd.min.js`). Iconos Lucide propios (`public/icons.js`).
- Despliegue: **Railway** (`npm start`). Correo: **Resend** (API HTTP) vía
  `src/lib/mailer.ts`.

Archivos clave:
- `src/db/schema.sql` — esquema (aditivo e idempotente: `CREATE TABLE IF NOT
  EXISTS`, `ADD COLUMN IF NOT EXISTS`). Se aplica ejecutando todo el archivo.
- `src/db/migrate.ts` — aplica el schema (`npm run migrate`).
- `src/types.ts` — tipos compartidos.
- `src/routes/redirect.ts` — motor público `/r/:deviceId` (fuera del auth guard).
  Resuelve dispositivo (Redis → Postgres), bifurca a encuesta si `mode='survey'`,
  si no redirige 302 y registra `scan_events` con dedupe. NO romper este flujo.
- `src/routes/api.ts` — API del panel (`/api/*`, bajo auth guard). Contiene
  `resolveCompanyId`, `buildFilters`, patrones multi-tenant.
- `src/lib/` — `auth.ts` (sesión por cookie firmada, roles superadmin /
  company_admin), `os.ts`, `channel.ts`, `transition.ts`, `survey.ts`,
  `report.ts`, `report-data.ts`, `mailer.ts`, `scheduler.ts`, `shortcode.ts`.
- `public/` — `index.html` (SPA de secciones `#view-*`), `app.js` (navegación,
  charts, modales), `styles.css` (tokens del sistema de diseño), `login.*`.

## Comandos

- `npm run build` — compila TypeScript (`tsc`). **Ejecútalo tras cada cambio** y
  corrige errores antes de dar por hecha una tarea. El build de Railway usa esto;
  en modo estricto vigila `string | undefined`.
- `npm run dev` — desarrollo local (tsx watch). No lo lances como proceso
  bloqueante en automatizaciones.
- `npm run migrate` — aplica `src/db/schema.sql`.

## Estilo de ejecución

- Idioma de respuestas, código y comentarios: **español**.
- En tareas de código: **sin texto entre tool calls**. No anunciar lo que vas a
  hacer, no explicar la salida de cada comando, no comentar errores: corrígelos.
  Agrupa en paralelo las tool calls independientes.
- Única excepción a mitad de tarea: estás bloqueado o necesitas una decisión del
  usuario. Entonces una o dos frases, directo al punto.
- Al terminar: un único resumen de 1-3 viñetas (qué cambió y qué no se verificó).
- **Cambios mínimos y dirigidos**: edita solo lo que cambia; no reescrituras
  completas salvo que el cambio lo exija.
- Sin disculpas ni relleno. Si te corrigen, entrega la solución directa.
- **Verificación no se suprime**: ejecuta `npm run build` (y pruebas si aplican)
  antes de cerrar. Si una verificación falla y no se resuelve, dilo en el resumen.
- Limpia archivos temporales creados para verificar.
- **Preguntas conceptuales / de diseño**: respóndelas completas y normales (la
  brevedad aplica a tareas de código, no a análisis).

## Diseño UI/UX

Antes de tocar cualquier interfaz, gráfico o el informe mensual, **carga la
skill `nfcloud-design`** (`.claude/skills/nfcloud-design/SKILL.md`): contiene el
sistema visual (tokens, color, tipografía, componentes) y las reglas de diseño
orientado a directivos. Para gráficos, úsala junto con la skill `dataviz`.

## Reglas de datos y seguridad

- **Multi-tenant estricto**: `company_admin` solo ve/gestiona su empresa; el
  `companyId` sale de la sesión en el servidor (nunca confiar en el cliente).
  `superadmin` según `?companyId`. Reutiliza `resolveCompanyId` / `getSession` y
  los helpers de scope (`locationInScope`, `templateInScope`).
- **No romper** el motor `/r/:deviceId`: el flujo 302 + `scan_events` + dedupe
  (Redis `SET NX EX`) debe quedar intacto en cualquier cambio.
- Schema siempre **aditivo e idempotente**. No borrar ni alterar columnas
  existentes de forma destructiva.
- **Sin dependencias nuevas** salvo justificación clara.
- La hora del negocio se evalúa en `APP_TIMEZONE` (por defecto `America/Bogota`),
  no en UTC.

## Convenciones de git

- Commits en español, descriptivos (`feat:`, `fix:`). Hacer commit solo cuando la
  tarea esté verificada (build en verde).
- No tocar la configuración de git. Evitar operaciones destructivas sin permiso.
