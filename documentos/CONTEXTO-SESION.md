# Contexto para continuar en un chat nuevo

> Léelo al empezar. Las reglas permanentes del proyecto están en `CLAUDE.md` y
> el sistema de diseño en la skill `nfcloud-design`; aquí solo va el estado.

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
- **Pendiente de elegir:** qué prepara Claude primero — el acuerdo escrito,
  la plantilla de Excel para mercadeo, el cronograma por lotes o un generador
  masivo de habladores (PDF de imprenta por sede, con sus QR, desde el Excel).

## Pendiente

- Reunión con el gerente de Hogar y Moda (primo): antes, refrescar la demo
  de producción (`--continuar`) para que no salgan alertas de días sin
  interacciones, crear un usuario `company_admin` de Hogar y Moda y repasar
  el guion (`documentos/PREPARACION-REUNIONES.md`, ya con la competencia real).
  Configurar en la demo valores por destino y una meta para lucir las nuevas
  secciones.
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
