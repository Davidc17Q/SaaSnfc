# Verificación — Función 1: Calificación interna por aspectos

## Comando ejecutado

El worktree no tiene `node_modules` propio (comparte el del repo base). Se ejecutó
el compilador TypeScript del repo base contra el `tsconfig.json` del worktree, que
es exactamente lo que hace `npm run build` (`tsc`):

```
node <repo-base>/node_modules/typescript/bin/tsc -p <worktree>/tsconfig.json
```

- Type-check (`--noEmit`): sin errores de TypeScript. `EXIT=0`.
- Emit completo (a `dist/`): compila y emite sin errores. `EXIT=0`.

Nota: en este entorno Windows la ejecución de `npm.ps1` está bloqueada por la
política de scripts de PowerShell; por eso se invoca `tsc` directamente con `node`.
El resultado es equivalente al de `npm run build` (el script `build` es `tsc`).

## Camino de redirección intacto (mode != 'survey')

- `GET /r/:deviceId`: la rama de encuesta solo se activa cuando
  `device.mode === 'survey'` y hace `return` ANTES del bloque de preview/redirect
  y del `setImmediate` que inserta `scan_events`. Para cualquier otro valor
  (incluye `mode` undefined de esquema/caché antiguo) el flujo es idéntico al
  anterior: pantalla de transición opcional o `302`, con registro de
  `scan_events` y su anti-doble-conteo (`dedupeKey` + `SET NX EX`) sin cambios.
- `resolveDevice()`: la consulta rica añade `d.mode, d.survey_template_id`; la
  consulta de fallback (esquema antiguo) NO los referencia, por lo que `mode`
  queda `undefined` y se trata como `redirect`. La lógica de caché no cambió.
- Las rutas nuevas de encuesta cuelgan del prefijo `/r/`, heredando la exención
  del guard de autenticación (no se tocó `auth.ts`).

## Dependencias

- `package.json` sin cambios. No se añadieron dependencias.

## Alcance / multi-tenant

- CRUD de plantillas y `GET /api/survey-results` respetan `resolveCompanyId`:
  `company_admin` solo opera sobre su empresa; el `company_id` se fuerza en el
  servidor. `PATCH /api/devices/:id` valida que la plantilla pertenezca a la MISMA
  empresa que la sede del punto.
