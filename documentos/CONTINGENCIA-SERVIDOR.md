# Plan de contingencia: que las tarjetas sigan funcionando sin el servidor

> Guía para el día en que no se pueda (o no se quiera) mantener el servidor de
> NFCloud. Objetivo: que **todas las tarjetas sigan llevando a su destino**
> (web, WhatsApp, Instagram, reseñas…) **sin regrabar ninguna**.

---

## La idea en una frase

Las tarjetas tienen grabado **el dominio** (`https://nfcloudco.com/r/CODIGO`),
no el servidor. Mientras conserves el dominio, puedes hacer que responda con una
**tabla de redirecciones estática en Cloudflare**, sin Railway y sin costo.

- **El dominio NO se puede perder**: si se pierde, sí hay que regrabar todo.
- **El servidor (Railway) SÍ se puede apagar**: Cloudflare lo reemplaza.

---

## Seguros que conviene tener desde ya

1. **Dominio pagado por varios años** (5–10) y con renovación automática.
2. **DNS del dominio en Cloudflare** (ya lo está: nfcloudco.com pasa por Cloudflare).
3. **Chips grabados con contraseña de escritura** (NTAG213/215/216 lo permiten):
   nadie puede sobrescribirlos con una app, y tú sí puedes reprogramarlos.
4. **En las condiciones del cliente**: "Si NFCloud dejara de operar, tus
   tarjetas seguirán llevando a tu destino final sin costo."
5. **Exportar las redirecciones de vez en cuando** (paso 1 de abajo) y guardar
   el archivo fuera de Railway (Drive, correo).

---

## Paso a paso si hay que apagar el servidor

### 1. Exportar la tabla de redirecciones (con el servidor todavía activo)

En Railway → servicio **Postgres** → pestaña **Data** (o **Query**), ejecuta:

```sql
-- Una fila por punto activo: dirección de la tarjeta -> destino final.
-- Incluye el código corto y el identificador largo (tarjetas antiguas).
SELECT 'nfcloudco.com/r/' || d.code AS origen, d.target_url AS destino, 302 AS estado
  FROM devices d
 WHERE d.status = 'active' AND d.code IS NOT NULL
UNION ALL
SELECT 'nfcloudco.com/r/' || d.id::text, d.target_url, 302
  FROM devices d
 WHERE d.status = 'active'
 ORDER BY 1;
```

Descarga el resultado como **CSV** (`redirecciones-nfcloud.csv`).

> Los puntos en modo **encuesta** no pueden funcionar sin servidor: en el CSV
> quedan apuntando a su `target_url` (el destino por defecto). Revisa que ese
> destino tenga sentido (por ejemplo, las reseñas de Google).

### 2. Cargar las redirecciones en Cloudflare

1. Cloudflare → tu cuenta → **Rules → Redirect Rules → Bulk Redirects**.
2. **Create list** → tipo *Redirect* → **Upload CSV** con el archivo del paso 1
   (columnas: origen, destino, código 302). Si pide nombres de columnas, usa
   *Source URL*, *Target URL* y *Status*.
3. **Create Bulk Redirect Rule** que use esa lista y actívala.
4. Verifica los límites del plan gratuito en ese momento (cantidad de
   redirecciones por lista/cuenta). Para cientos o algunos miles de tarjetas
   suele alcanzar; si no, la alternativa es un **Cloudflare Worker** que lea un
   JSON `{ "CODIGO": "https://destino" }` (también gratis en volúmenes bajos).

### 3. Apuntar el dominio a Cloudflare en lugar de Railway

1. Cloudflare → **DNS** del dominio.
2. Cambia el registro que hoy apunta a Railway por uno **proxied** (nube
   naranja) que no dependa de un servidor, por ejemplo un registro `AAAA` con
   valor `100::` (dirección "vacía" que Cloudflare acepta para reglas).
3. Prueba 3 o 4 tarjetas reales con el celular. Deben abrir su destino.

### 4. Avisar a los clientes

"Tus tarjetas siguen funcionando con normalidad. El panel de métricas queda en
pausa." No hay que regrabar nada.

---

## Si después quieres volver a encender NFCloud

1. Vuelve a desplegar el servidor (Railway u otro).
2. En Cloudflare, **desactiva la Bulk Redirect Rule** y devuelve el registro DNS
   al servidor.
3. Todo vuelve a funcionar con métricas, sin tocar las tarjetas.

---

## Respaldos de la base (hacerlo ya, y cada semana)

Railway guarda la base en un volumen; si se daña o se borra por error, sin copia
se pierden las sedes, los códigos de las tarjetas y todo el historial.

1. **Copia propia, fuera de Railway** (probada: respaldo y restauración):

   ```
   scriptsespaldo-produccion.ps1
   ```

   Pide `DATABASE_PUBLIC_URL` y deja en `respaldos\` (fuera de git) la copia
   completa (`nfcloud-FECHA.dump`) y la tabla de redirecciones
   (`redirecciones-FECHA.csv`, la del paso 1 de arriba). Súbelos a Drive.
   Frecuencia: **cada lunes** y **antes y después del montaje de cada lote**.
2. **Copias de Railway**: en el servicio Postgres → *Backups*, activar la copia
   diaria si el plan la incluye. Es la más cómoda para restaurar, pero vive en
   el mismo proveedor: no reemplaza la copia propia.
3. **Restaurar** (en una base vacía, local o nueva en Railway):

   ```
   pg_restore --no-owner --dbname=<URL de la base vacía> nfcloud-FECHA.dump
   ```

   Probar una restauración en local **una vez al mes**: un respaldo que nunca se
   ha restaurado no es un respaldo.
4. Automatizarlo (pendiente de decidir): una tarea diaria que suba la copia
   cifrada a Cloudflare R2. Necesita credenciales de R2 y un lugar donde correr
   que no sea este repositorio mientras sea público.

---

## Si el servidor se cae unas horas (no para siempre)

Qué pasa hoy: Cloudflare muestra un error 502/521 y **las tarjetas no abren**
hasta que Railway vuelva. Las interacciones de ese rato no se registran.

**Antes (para enterarse a tiempo):**

- Monitor externo gratuito (UptimeRobot, Better Stack) sobre
  `https://nfcloudco.com/healthz` cada minuto, con aviso al celular. Responde
  `{"ok":true,"db":true,"cache":true}`; si `db` es `false` las tarjetas siguen
  funcionando desde la caché unos minutos, pero hay que actuar.
- Railway ya comprueba `/healthz` antes de pasar el tráfico a una versión nueva:
  un despliegue que no arranca **no reemplaza** al que funciona.

**Durante:**

1. Railway → servicio → *Deployments*: si el último despliegue falló, **Redeploy**
   del anterior (o `git revert` del commit y `git push`).
2. Si es Postgres: Railway → Postgres → reiniciar. Si se perdieron datos,
   restaurar el último respaldo.
3. Si Railway completo está caído y va para largo (más de 30–60 minutos en
   horario de tiendas): activar la tabla de redirecciones en Cloudflare con el
   último `redirecciones-FECHA.csv` (pasos 2 y 3 de arriba). Las tarjetas vuelven
   a abrir en minutos; al volver Railway, desactivar la regla.

**Mejora propuesta (no construida): respaldo automático en Cloudflare.** Un
Worker delante de `/r/*` que intenta el servidor y, si responde 5xx o tarda más
de 3 segundos, redirige con una copia de `código → destino` guardada en
Cloudflare KV (sincronizada cada hora). El cliente nunca ve el error; solo se
pierde el registro de esas interacciones. Con 82 sedes instaladas es el seguro
que más vale la pena: convierte una caída en una molestia invisible.

---

## Relación con los planes de prueba

El modelo de planes ya sigue la misma filosofía: cuando una prueba gratis vence
y el cliente no paga, la empresa pasa a **Básico** y **sus tarjetas siguen
funcionando** (solo se bloquea el panel). Si vuelve, se reactiva desde
*Empresas → Plan*, sin regrabar.
