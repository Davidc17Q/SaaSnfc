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

## Relación con los planes de prueba

El modelo de planes ya sigue la misma filosofía: cuando una prueba gratis vence
y el cliente no paga, la empresa pasa a **Básico** y **sus tarjetas siguen
funcionando** (solo se bloquea el panel). Si vuelve, se reactiva desde
*Empresas → Plan*, sin regrabar.
