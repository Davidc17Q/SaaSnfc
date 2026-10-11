# Entender la plataforma del profe (y el modelo de negocio)

Guía de consulta para David. Explica, con lenguaje sencillo, la versión de NFCloud
que estructuró el profe (Santiago) en Vercel, en qué se diferencia de la plataforma
propia (Railway), y toda la terminología de negocio que aparece en el sitio.

> Para qué sirve este documento: para llegar preparado a la reunión del **martes** con
> el profe (viabilidad comercial) y a **On Going**. Que ningún término te tome por
> sorpresa.

---

## 0. Lo esencial en una frase

El profe tomó la misma idea (tarjeta → toque → destino → se mide) y le agregó:
1. Un **modo nuevo** de punto: "calificar" (encuesta propia), además de "redirigir".
2. Medir si el uso fue por **NFC (tocar)** o **QR (escanear)**, con el mismo código.
3. Un **modelo de cobro** con dos partes: hardware (pago único) + plataforma
   (suscripción mensual por planes según el tamaño del cliente).

No es un sistema alienígena: es tu concepto + funciones de negocio + un motor técnico
distinto por debajo.

---

## 1. Las dos plataformas, lado a lado

| | **Tu NFCloud (Railway)** | **NFCloud del profe (Vercel)** |
|---|---|---|
| Lenguaje | TypeScript | JavaScript |
| Motor | Fastify (servidor encendido 24/7) | Funciones serverless (se encienden al entrar) |
| Base de datos | PostgreSQL + Redis (caché) | Neon Postgres (sin Redis) |
| Frontend | Dashboard pulido (auto-refresco, chips, combobox) | Panel funcional, hay que recargar para actualizar |
| Clientes | Reales (Lalico, Celumóvil, Río Vivo) | Datos demo ficticios |
| Código fuente | Lo tienes y lo controlas | Ya te lo compartió (repo en GitHub) |

**Por qué se siente distinta:** tu motor mantiene el dashboard "vivo" (se actualiza
solo); el del profe se enciende por petición, por eso hay que recargar. Son enfoques
distintos, ninguno está "mal".

**Decisión pendiente (para el martes):** no conviene fusionar dos arquitecturas tan
distintas; conviene elegir UNA base y llevar a ella las mejores ideas de la otra. Esa
decisión se habla con el profe.

---

## 2. El concepto nuevo: el "modo" de cada punto

En tu versión, toda tarjeta hacía lo mismo: **redirigir** (mandar afuera). El profe le
dio a cada punto uno de **tres modos**:

- **Redirigir** → lo de siempre: manda a Google, WhatsApp, Instagram, catálogo.
- **Calificar** → abre una **encuesta propia** dentro de la plataforma (estrellas de
  1 a 5 + aspectos + comentario). No manda afuera; guarda la respuesta en tu panel.
- **Menú** → abre una lista de opciones ("ver carta, calificar, reseña, WhatsApp")
  para que el cliente elija. Una sola tarjeta hace varias cosas.

### La calificación interna: quién, desde dónde, cuándo
- **Quién:** el mismo cliente, con su celular.
- **Desde dónde:** una página de encuesta que vive en TU plataforma (no en Google).
- **Cuándo:** cuando toca una tarjeta en **modo calificar** (ej. una en la ventanilla
  que dice "¿Cómo fue la atención?").
- **Por qué importa:** las reseñas de Google son públicas y no las controlas; la
  calificación interna es privada y tuya. Abre el mercado de **instituciones públicas**
  (deben medir satisfacción por ley) y de negocios que quieren saber qué falla antes de
  que se vuelva reseña pública.

---

## 3. Los códigos: QR vs NFC (la confusión más común)

Antes generabas **un código**, lo copiabas a la tarjeta y al QR, y listo. El profe hace
algo más fino, pero es casi lo mismo:

- Cada punto tiene **un solo código** (ej. `758854`), igual que tú.
- Genera **dos versiones del enlace** con ese mismo código:
  - Tarjeta **NFC**: `.../r/758854?v=n`  ← `n` de NFC (tocar)
  - **QR** impreso: `.../r/758854?v=q`  ← `q` de QR (escanear)

**No son dos puntos ni dos códigos.** Es un punto, un código, dos "sabores" del enlace.
La coletilla `?v=n` o `?v=q` solo sirve para que el panel sepa si la gente usó más el
toque o el escaneo. Tú antes usabas un solo sabor para todo; funcionaba igual, solo que
no distinguía el canal.

### Flujo para crear (jerarquía)
```
Empresa (ej. LaLico)
   └── Sede (ej. LaLico Itagüí)
         └── Puntos (cada tarjeta: etiqueta + familia + modo + destino)
```
1. Creas la empresa (o usas "Alta rápida", que crea empresa + sede + kit de puntos de
   una sola vez).
2. Creas la sede.
3. Creas cada punto eligiendo: **etiqueta** ("Reseñanos"), **familia**
   (reseña/whatsapp/instagram/neutro…), **modo** (redirigir/calificar/menú) y
   **destino** (la URL, si redirige).
4. El sistema te da el QR y el enlace NFC de cada punto para grabar/imprimir.

**La hoja de instalación:** es una guía con los QR de cada punto listos para imprimir y
pegar, más instrucciones ("fija el soporte, graba la tarjeta, toca una vez para
confirmar"). Sirve para que el montaje en el local sea ordenado. Los QR que muestra son
para instalar/imprimir.

---

## 4. Cómo leer los KPIs (los números del tablero)

Cada tarjeta de número responde UNA pregunta. El numerito pequeño de abajo es el
contexto.

**En Resumen:**
- **Escaneos y toques (ej. 2.429):** veces que se usaron las tarjetas (NFC + QR).
- **Calificaciones recibidas (ej. 468):** encuestas respondidas en el periodo.
- **Calificación promedio (ej. 3.89):** la nota de 1 a 5.
- **Positivas 4 y 5 (ej. 68%):** porcentaje de calificaciones buenas.
- **Con comentario (ej. 147):** cuántas traían texto escrito (valen oro).
- **Puntos activos (ej. 16/18 · 4):** 16 de 18 puntos funcionando, en 4 sedes.

**En Calificaciones:**
- **Recibidas (96 / −5%):** cuántas llegaron; el −5% es la comparación con el periodo
  anterior (esta vez 5% menos).
- **Promedio (4.33):** la nota.
- **Con comentario (34):** cuántas dejaron texto.
- **Negativas 1 y 2 (3% / 3 para responder):** porcentaje de malas, y cuántas negativas
  faltan por responder (tarea pendiente).

---

## 5. Para qué sirve cada módulo del sitio

- **Panel (dashboard):** el producto funcionando. Resumen, puntos, calificaciones,
  cambios, sedes, empresas. Es lo que usa el cliente y lo que gestionas tú.
- **Modelo:** el "cerebro" del negocio, **para ti y para gente de negocio** (On Going,
  inversores, el profe). Mercado, competencia, planes, simulador, estrategia, riesgos.
  Denso a propósito. NO se le muestra a un cliente normal.
- **Presentación:** la cara **bonita para mostrar/vender** (tipo diapositivas, visual,
  frases cortas). Para proyectar en reunión o pasar como PDF.

Regla: **Modelo = pensar y defender el negocio. Presentación = mostrar y enamorar.
Panel = el producto real.**

---

## 6. Terminología de mercado (TAM/SAM/SOM, cámaras, matrículas)

### TAM / SAM / SOM (la pizza)
- **TAM (mercado total) = la pizza entera.** Todos los que *en teoría* podrían usarlo:
  **95.624** negocios del Valle de Aburrá. El techo máximo.
- **SAM (mercado alcanzable) = la porción que de verdad puedes servir.** Los que tienen
  mostrador/mesa y están en tus 4 segmentos: **~55.000**.
- **SOM (meta a 12 meses) = el mordisco de este año.** Lo que puedes lograr realmente
  con tu capacidad actual: **167** clientes.

Para qué sirve: cuando pregunten "¿qué tan grande es tu negocio?", respondes con un
número ambicioso (TAM), uno realista (SAM) y uno concreto (SOM). Es lenguaje estándar
de emprendimiento.

### Cámaras de Comercio
Entidades oficiales donde se registra todo negocio legal en Colombia. La **Cámara de
Medellín para Antioquia** cubre 69 municipios; la **Cámara Aburrá Sur** cubre Itagüí,
Envigado, Sabaneta, La Estrella y Caldas. Son la **fuente oficial** de cuántos negocios
hay; por eso el profe las usa (da credibilidad, no es un número inventado).

### Matrícula
Cada **registro de negocio** en la Cámara (la "matrícula mercantil"). "95.624
matrículas activas" = 95.624 negocios registrados y vigentes. Ojo: una matrícula no
siempre es un local con mostrador (puede ser alguien que factura desde casa). Por eso
para el SAM se descartan las que no tienen atención presencial, y baja de 95.624 a
~55.000. "Tómese como techo" = ese número incluye zonas fuera del valle, no lo tomes
literal.

### El segundo mercado: Instituciones públicas
Un tipo de cliente distinto a los comercios: **alcaldías, hospitales, EPS, notarías,
universidades**. Les sirve porque **la ley los obliga a medir la satisfacción del
ciudadano** (Decreto 1499 de 2017, el "MIPG"). Hoy lo hacen con encuestas en papel o
correo: lento y ocasional. Tu **calificación interna** lo reemplaza: una tarjeta en
cada ventanilla, el ciudadano califica anónimo, y la entidad recibe un informe mensual.
Es un mercado con presupuesto y donde no compites con "el QR gratis".

---

## 7. Los planes y precios (con mucha plastilina)

El cambio mental clave: antes vendías **objetos** (tarjetas, hablador), pago único.
Ahora el modelo separa DOS cosas:

### Cosa 1 — Hardware (lo físico, pago ÚNICO)
Lo que ya hacías. Se paga una sola vez:
- Tarjeta NFC personalizada: ~$29.900
- Paquete de 10 tarjetas: ~$199.000
- Hablador acrílico con póster y 3 chips: ~$129.000
- Kit de inicio (hablador + 5 tarjetas + instalación): ~$249.000

### Cosa 2 — Plataforma (el software, pago MENSUAL / suscripción)
Esto es lo NUEVO en tu forma de cobrar: el cliente paga **cada mes** por usar el panel.
Cuatro planes según el **tamaño** del cliente:

| Plan | Para quién | Precio | Cómo se cobra |
|---|---|---|---|
| **Punto** | Negocio de 1 sede (licorería, spa) | $39.900/mes | Tarifa plana, **hasta 6 puntos incluidos** |
| **Sedes** | Negocio de 2 a 10 sedes | $34.900 por sede/mes | Se multiplica por sede |
| **Red** | Cadena de 11+ sedes (Hogar y Moda) | $19.900 por sede/mes | Se multiplica por sede (más barato por volumen) |
| **Institución** | Alcaldías, EPS, atención al ciudadano | $49.900 por punto/mes | **Se multiplica por cada ventanilla** (mín. 3) |

Lógica: entre más sedes, más barato por sede (descuento por volumen).

### Las dos dudas que más confunden

**Plan Punto — "¿$39.900 × 6 puntos, o $39.900 por tener hasta 6?"**
→ Es tarifa plana: **$39.900/mes da derecho a tener HASTA 6 tarjetas**, no se
multiplica. Del punto 7 en adelante, +$4.900 por punto.

**Plan Institución — "¿$49.900 por ventanilla, o fijo?"**
→ **Se multiplica: $49.900 por cada punto de atención (ventanilla), al mes.** Si una
alcaldía tiene 5 ventanillas con tarjeta de calificación → 5 × $49.900 = $249.500/mes.
Mínimo 3 puntos. Se multiplica porque cada ventanilla es un indicador que la entidad
debe reportar por separado (así lo exige la ley), y encaja con cómo presupuestan.

### Tu caso real (Lalico) traducido al modelo nuevo
- Antes: vendías 3 tarjetas + hablador = un pago único y ya.
- Ahora: le vendes el hardware (pago único) **+** lo suscribes al **plan Punto
  $39.900/mes** (una sede, hasta 6 tarjetas).
- La diferencia: antes cobrabas una vez; ahora cobras hardware una vez **y** la
  mensualidad cada mes. Ese "cada mes" es el oro del modelo SaaS: ingreso recurrente.

---

## 8. Qué tiene cada plataforma que la otra no (resumen)

**El profe tiene y tú no:**
- Calificación interna por aspectos (con tabla `calificaciones` y aspectos por sector).
- Modo de punto (redirigir / calificar / menú).
- Distinción NFC vs QR en el mismo código.
- Protección anti-abuso en calificaciones.
- Alta rápida, hoja de instalación, informe imprimible, modelo y presentación.

**Tú tienes y el profe no:**
- Auto-refresco del dashboard (el suyo hay que recargarlo).
- Gráficos que se actualizan sin parpadeo.
- Chips de filtros, combobox de búsqueda de sede, estados vacíos, accesibilidad.
- Redis como caché para redirección ultrarrápida.

Tu plataforma está más pulida en **experiencia**; la del profe tiene más
**funcionalidades de negocio**.

---

## 9. La pregunta para el profe el martes

> "Profe, tengo mi versión en Railway más pulida en experiencia de usuario y la tuya
> con más funcionalidades de negocio. Y me compartiste el repo. ¿Cómo avanzamos:
> tomamos una como base? ¿cuál? ¿el código es para que yo lo use/sea mío?"

Esa conversación define el camino técnico. No hay que resolverla antes del viernes.

---

*Documento de consulta personal. Resume lo trabajado para entender la plataforma del
profe y el modelo de negocio.*
