# Contexto para continuar en un chat nuevo

> Léelo al empezar. Las reglas permanentes del proyecto están en `CLAUDE.md` y
> el sistema de diseño en la skill `nfcloud-design`; aquí solo va el estado.
>
> **Lo más reciente:** sección "HOGAR Y MODA: ESTADO AL 6 DE NOVIEMBRE DE 2026".

## Estado (25 de octubre de 2026)

- Producción: https://nfcloudco.com (Railway, rama `main`, último despliegue
  `a779566`). El esquema se aplica solo al arrancar (no hace falta migrar).
- Los JS/CSS del panel se sirven versionados (`app.js?v=<commit>`, en
  `src/server.ts`): tras cada despliegue el navegador recibe lo nuevo.
- Local: Postgres y Redis en Docker (`docker compose up -d`; Docker Desktop
  está en `%LOCALAPPDATA%\Programs\DockerDesktop` y a veces se cierra solo).
  `.claude/launch.json` arranca el panel con `npm run dev` en el puerto 3000.

### Hecho en esta etapa (todo publicado)

- **Ficha de cada sede** (`#sede/<id>`, endpoint `/api/locations/:id/summary`):
  posición en la cadena, resumen escrito, KPIs con variación, tendencia vs.
  promedio, puntos NFC con su uso y "Cambiar destino", reputación, encuesta,
  "Cómo llegan los clientes". Se abre desde alertas, ranking, gráfico de sedes
  y tablas.
- **NFC vs QR**: la URL del QR lleva `?s=q` y la del chip `?s=n`; sin marca =
  `unknown` (lo ya instalado). Columna `source` en `scan_events` y
  `survey_responses`. El modal del QR muestra los dos enlaces para copiar.
- **Avisos por segmento** (`src/lib/segments.ts`): `companies.segment` =
  Cadena / Negocio local / Profesional / Institución (NULL = automático; el
  Profesional se elige a mano en Empresas y usuarios). Informe, correo,
  alertas y ficha adaptan sus recomendaciones (el profesional no recibe
  "reforzar personal"; inactividad a los 14 días).
- **Vocabulario**: el informe y el correo dicen tiendas / sedes / tarjetas /
  puntos de atención según el segmento, o el nombre propio de la empresa
  (`unit_one`/`unit_many`, formato "singular / plural" en Empresas y usuarios).
- **"Desde que empezaste"** (`src/lib/since-start.ts`): valor acumulado desde
  la primera interacción, verde/rojo según el crecimiento vs. el primer mes
  (solo con 45+ días). En informe, correo y resumen del panel.
- **Avisos de sede inactiva por correo** (Informes → "Avisos de sede sin
  actividad"; `src/lib/inactivity-alerts.ts`, worker horario).
- Arreglos: crear sede (id repetido `locName`), anchos de modales
  (`max-w-sm/md`), `/api/locations/:id/devices` limitado a la empresa.

### Material comercial (en `cotizaciones/`, fuera de git)

- `hogar-y-moda/`: propuesta PDF (piloto 6 sedes, opciones A/B, competencia
  en Google Maps) y `hablador/` (carta y media carta: PDF de imprenta, PNG,
  PSD por capas). Los QR son de muestra; el logo es de baja resolución.
- `riovivo/hablador/`: hablador con Instagram/TikTok/WhatsApp, tarjeta solo de
  reseñas, renders y PSD. Los QR son de muestra; confirmar usuario de TikTok.
- Los habladores se generan desde HTML (`hablador-*.html`, `hablador.js`) con
  Chrome sin interfaz; los PSD con `psd-tools` por capas (`data-capa`).

### Hecho el 26 de octubre (en commits locales; ver `git log`)

- Gráfico de sedes con altura según el número de sedes, valor en la barra y
  sin el prefijo común ("Punto de Venta …").
- Canales: wa.link / walink.co cuentan como WhatsApp; "Tipo de destino"
  fijable a mano por punto (`devices.channel`); la caché de puntos se borra al
  editar (`dropDeviceCache`), ya no guarda objetos incompletos.
- Pantalla intermedia nueva (negocio + ícono y color del destino); destinos
  solo http(s)/tel/mailto/sms/whatsapp (`isSafeTarget`).
- Revisión del panel: nombres en MAYÚSCULAS se ven normales (`nice()`),
  fechas "27 sep", brecha en "N veces", "Salud de puntos", alertas plegadas.
- Avisos por WhatsApp con SMS de respaldo (Twilio, `src/lib/messaging.ts`);
  falta crear la cuenta: `documentos/AVISOS-WHATSAPP-TWILIO.md`.
- Valor estimado en pesos y metas del mes por sede (`src/routes/business.ts`;
  se configuran en Informes → Valor y metas).
- Rescate del cliente insatisfecho: encuesta con nota baja ofrece dejar
  WhatsApp; aviso al instante (casilla en Avisos).
- Mapa de calor día × hora y "Descargar todas (Excel)" en el resumen.

## Reunión con Hogar y Moda (jueves 29 de octubre, en la mañana)

- Para el día: cotización simple por sede (`cotizaciones/hogar-y-moda/cotizacion/
  Cotizacion-NFCloud-Hogar-y-Moda.pdf`: kit $249.900, plataforma $34.900/mes,
  tarjetas $40.000 o 10 por $350.000, escala por volumen) y guion con las
  muestras que lleva (`documentos/GUION-REUNION-PASO-A-PASO.md`). El número de
  sedes se sugiere de palabra (6 a 8). Refrescar la demo solo con
  `scripts\demo-produccion.ps1 -Continuar` (sin borrar los puntos grabados).
- Plan completo: `documentos/REUNION-HOGAR-Y-MODA.md` (también en HTML y PDF):
  meta, checklist, guion minuto a minuto, demo, precios, objeciones y cierre.
- Arreglado el 27 de octubre (`7c9cf64`): el resumen tomaba los destinos como
  alertas y "Destino principal" decía "Sin datos" desde que se añadió el mapa
  de calor. La demo ahora simula el origen NFC/QR.

## RESULTADO DE LA REUNIÓN (30 de octubre de 2026) — LO MÁS IMPORTANTE

- **Hogar y Moda aprobó NFCloud para sus 82 sedes** (sin piloto). Gerente
  (primo), su hermano (gerencia) y la persona de mercadeo de acuerdo. David
  quedó en un grupo de WhatsApp con mercadeo.
- **Precios acordados:** instalación física $180.000 por sede (pagada en
  cuotas) y plataforma **$10.000 por sede al mes** (David dijo "15–10 mil" y
  eligieron 10 mil). Totales: instalación $14.760.000; $820.000 al mes.
  Decisión: no renegociar los $10.000; proteger el margen dejando por escrito
  qué incluye y qué se cobra aparte, precio fijo 12 meses y ajuste por IPC.
- **Riesgos:** caja (materiales ≈ $71.600 por sede, ≈ $5,9 M en total, antes
  de cobrar las cuotas) → instalar **por lotes** con cuota o anticipo por lote;
  tiempo (~150 h) y sedes fuera de Medellín → kit enviado + instalación por el
  personal con guía en video.
- **Siguientes pasos:** anotar lo acordado; pedir en el grupo el Excel de
  sedes (nombre, dirección, ciudad, encargado, WhatsApp de crédito y cartera,
  enlace de ficha de Google) y la reunión de arranque; trabajar con mercadeo
  las fichas de Google (ya lo están haciendo); enviar el **acuerdo escrito**
  antes de comprar materiales; cotizar con el proveedor 82 + 82 habladores y
  ~330 chips; separar la empresa de demo "Hogar y Moda" en producción de la
  real; RUT, factura electrónica y retenciones con un contador; primer lote de
  ~10 sedes en Medellín.

## HOGAR Y MODA: ESTADO AL 6 DE NOVIEMBRE DE 2026 (lo más reciente)

Todo el material está en `cotizaciones/hogar-y-moda/` (fuera de git).

**Sedes (`sedes/`).** La empresa pasó `DIRECCIONES TIENDAS 2026.xlsx` (hoja XX,
81 sedes; la 82 es **Junín Motos**, sin dirección oficial). `HyM-control-sedes.xlsx`
(interno: cruce con Google, lotes, fichas sobrantes, preguntas; no compartir) y
`Hogar-y-Moda-datos-por-sede.xlsx` (plantilla de contactos para mercadeo). La hoja
`Hoja1` del Excel de la empresa trae un "contador" por almacén de 2024 sin
explicar; no se usó.

**Lotes:** 1 Centro (11), 2 resto de Medellín (14), 3 Valle de Aburrá (11),
4 Oriente (10), 5 y 6 fuera del Valle de Aburrá (36, kit enviado con guía en video).

**Fichas de Google.** Censo sin sesión (`documentos/CENSO-FICHAS-...`) y búsqueda
con la sesión de David el 3 nov. Yeison (community manager) diligenció
`Hogar-y-Moda-fichas-de-Google.xlsx` y con eso se armó
`Hogar-y-Moda-plan-fichas.xlsx`: 15 sedes ya en su cuenta
(`analisisecommercehym@gmail.com`, un Gmail: pedir que TI tenga acceso),
2 sin verificar (Manrique; Supía suspendida), **51 en correos de una agencia**
sin acceso, 9 sin ficha, 5 por aclarar. Google le deja pedir unas **3 fichas al
día** (dato de Yeison): plan diario por lote y reseñas, del 9 nov al 2 dic. Hoja
"Por aclarar" con 11 dudas; antes de imprimir: ¿Candelaria cerró? (Yeison: "ya no
existe"), ¿Junín 3 es Junín o Playa?, dirección de Junín Motos, Barbosa cambió a
Cra. 15 #15-53. Hallazgos: Junín Principal (2,7) tiene anuncio pagado; Cimitarra y
Puerto Boyacá aparecen sin dueño. El montaje no espera a las fichas: el chip de
reseñas sirve con el enlace de la ficha aunque no sea de la empresa, y se cambia
desde el panel. Mapa público de tiendas de Yeison (My Maps, 1,4 M de vistas): no
dice quién administra cada ficha.

**Hablador elegido.** La gerencia eligió la opción B ("Marea Abierta", franja
azul–verde). Versión vigente: `hablador/hablador-carta-b2.html` →
`hablador/opciones/Hablador-carta-resenas-y-credito.png`: dos áreas grandes,
**reseñas** (blanca) y **crédito** (verde suave, el gerente dice que es lo que más
le interesa), y abajo "Canal de WhatsApp" (promociones: "Ofertas más destacadas en
tu celular"). Título de mercadeo: "Tu opinión nos ayuda a mejorar" /
"¿Cuéntanos cómo fue tu experiencia hoy?" (lo pidieron con signos de
interrogación). Se quitó "¡Paga tu cuota sin hacer fila!" hasta que confirme el
gerente. Sin media carta por ahora. Falta: aprobación final, logo en alta y PDF de
imprenta por sede con los QR reales. Variantes anteriores: `hablador-carta.html`
(opción A), `hablador-carta-b.html`, `hablador-carta-b-credito.html`.

**Costos de materiales (cotizados por David).** Hablador acrílico carta $25.000
(media carta $15.000), tarjeta o chip $1.767 (100+, 7 % de descuento, falta
confirmar si ya incluido), póster en propalcote $5.000–$10.000 (cotizar como
82 archivos distintos). Con 1 hablador carta y 3 chips por sede: ≈ $3,1 M en total
(≈ $38.300 por sede). La instalación acordada sigue en $180.000 por sede.

**Cronograma** (`cronograma/Cronograma-NFCloud-Hogar-y-Moda.pdf` y `.png`):
montaje completo en noviembre. Diseño y configuración 9–10 nov; pedido de
acrílicos e impresión el 11 nov (≈ 8 y ≈ 5 días); prueba en Junín Principal 19–20;
lotes 1–3 y envío a sedes lejanas 23–27 nov; lote 4 el 30 nov; verificación 1–2
dic. Fichas en paralelo. Muy justo: depende de aprobar el diseño el 10 nov.

**Sigue pendiente:** el **acuerdo escrito** (alcance, cuotas por lote, quién hace
y paga el trabajo de fichas, permiso para usar el nombre y los resultados, precio
fijo 12 meses + IPC) antes de pagar materiales; separar la empresa demo
"Hogar y Moda" de la real en producción; RUT y facturación con un contador.

## Otros frentes (30 oct – 6 nov de 2026)

- **Incubadora On Going:** postulación enviada. One pager y logos en
  `documentos/incubadora/`.
- **Croydon:** diagnóstico de fichas en Antioquia
  (`cotizaciones/croydon/Diagnostico-Croydon-Antioquia.pdf`): 12 de 15 tiendas,
  7 por debajo de 4,0. Es grande (~110 tiendas en el país; decide el área de
  tiendas, Fabián Rubio). Otras candidatas revisadas: Baby Fresh, Óptica Santa
  Lucía, Fruta Fresca (ropa), Parmessano; Euro, Il Forno, Supermú y Mattelsa ya
  tienen buena reputación (para ellas el argumento es datos y sedes rezagadas).
- **Ideas de producto** para cadenas grandes (no construidas): cupón con canje en
  caja, base de clientes con autorización (Ley 1581), quejas por tema por sede,
  campañas programadas, medición por vendedor o mesa, "¿no hay tu talla?".
- **Heladería (prospecto):** hablador de 4 opciones a $220.000 (mínimo $190.000),
  menú digital +$100.000 si hay que hacerlo, plan opcional $19.900/mes.
- **Scripts para vaciar interacciones:** el de git es `src/db/vaciar-interacciones.ts`
  (`scripts/vaciar-riovivo-produccion.ps1`). Hay uno paralelo sin commit,
  `src/db/vaciar.ts` + `scripts/vaciar-produccion.ps1` (`npm run vaciar --
  --empresa lico`): decidir con cuál quedarse.

## Landing comercial (2 de noviembre de 2026)

- `landing/` es la página pública con escena 3D (three.js en `landing/vendor`,
  sin dependencia npm): `index.html`, `landing.css`, `landing.js`, artes en
  `art/`. No muestra precios: el formulario abre WhatsApp. Se previsualiza con
  la entrada `landing` de `.claude/launch.json` (puerto 4173).
- Publicada en `/empresas/` (quien entra a `/` sin sesión llega ahí). Tiene QR y formulario a WhatsApp.
- La landing es excepción de marketing a la regla "fondo carbón" de la skill de
  diseño: su fondo cambia por escena (azul, hueso, carbón) en el shader de
  `landing.js`; el panel sigue con su sistema sobrio.

## Revisión estética del panel (5 de noviembre de 2026)

- Skills nuevas en `.claude/skills/`: `impeccable` y 14 de Emil Kowalski (las web;
  no se instalaron `animate-expo`, `write-swift` ni `ask-sonner`).
  `nfcloud-design` sigue mandando y ya incluye movimiento y acabado.
- Panel, login y encuesta pulidos: controles con la fuente de la marca, gráficos
  con Plus Jakarta y curvas `monotone`, KPIs antes que alertas, modales accesibles
  (`setupModals()`), móvil con objetivos de 44 px y barra de una sola fila.
- Auditoría con Impeccable en toda la plataforma: títulos, etiquetas, gráficos
  accesibles e informe, correo, redirección y landing depurados. Nombres de sede
  normalizados también en el servidor (`src/lib/names.ts`). El detector solo deja
  avisos de la fuente (decisión de marca) y falsos positivos de la landing.
- Sin revisar a fondo: correos de avisos y lectura con lector de pantalla real.
- 8 nov: login con el azul de la landing y tarjetas reales de clientes. Sesión
  deslizante (con "recordar" se renueva sola pasada la mitad de los 7 días) y
  cookie `nfc_cliente`: quien ya inició sesión alguna vez y la tiene vencida va
  de `/` al login, no a la landing.

## Pendiente

- Hogar y Moda: ver la sección "Estado al 6 de noviembre" (acuerdo escrito,
  aprobación del hablador, PDF de imprenta por sede, crear la empresa real y sus
  82 sedes en producción, dudas de la hoja "Por aclarar").
- Inplux como segmento **Profesional** (el profe ya está).
- Crear la cuenta de Twilio y sus variables en Railway (guía arriba).
- Al crear los puntos del piloto: QR descargados del panel (`?s=q`) y chips
  grabados con el enlace del chip (`?s=n`).
- Segunda fase del vocabulario: el panel aún dice "sede(s)" (más de 150 textos).
- El resumen del panel todavía usa frases iguales para todos los segmentos.
- Valor y metas aún no salen en el informe mensual ni en el correo.
- Ideas validadas para después: competencia en Google Maps, acceso por tienda,
  atribución por vendedor, prueba de destinos, resumen semanal por WhatsApp,
  etiquetas en puntos, Google Business Profile, informes con NFC vs QR.
