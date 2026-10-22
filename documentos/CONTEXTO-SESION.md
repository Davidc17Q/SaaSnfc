# Contexto para continuar en un chat nuevo

> Léelo al empezar. Las reglas permanentes del proyecto están en `CLAUDE.md` y
> el sistema de diseño en la skill `nfcloud-design`; aquí solo va el estado.

## Estado (22 de octubre de 2026)

- Producción: https://nfcloudco.com (Railway, rama `main`). El esquema de la
  base se aplica solo al arrancar; ya no hace falta `npm run migrate` en Railway.
- Hecho y publicado:
  - Panel orientado a directivos: resumen por gravedad desplegable, KPIs con
    variación, campañas (bandas + efecto + "Ver en la tendencia"), impacto en
    reputación de Google, leyenda de horas con íconos, vocabulario de cliente.
  - Informe mensual en 5 capítulos dinámicos (`src/lib/report.ts`,
    `report-story.ts`), correo rediseñado (`report-mail.ts`), enlace firmado sin
    sesión (`/informe/:token`), envío semanal = mes en curso.
  - Seguridad multiempresa: edición/borrado de sedes y puntos, y cambios
    masivos, limitados a la empresa del usuario.
  - Planes por empresa (`src/lib/plans.ts`): Prueba (30 días) → Pro o Básico.
    En Básico las tarjetas siguen funcionando; solo se bloquea el panel.
  - Demo realista de Hogar y Moda (27 sedes reales) en local y en producción
    (`npm run demo`; en producción con `scripts/demo-produccion.ps1`).
- Guía de emergencia sin servidor: `documentos/CONTINGENCIA-SERVIDOR.md`.

## Pendiente

- Reunión con el gerente de la cadena (primo): jueves de la semana próxima.
  Antes: refrescar la demo (`--continuar`, requiere activar un momento el TCP
  Proxy de Postgres en Railway), crear un usuario `company_admin` solo de
  Hogar y Moda para la demo, revisar Calificación (decimales con punto, textos
  cortados), cambiar el mensaje "¿Corriste el seed?", guion de la demo.
- Seguridad: eliminar el TCP Proxy de Postgres y rotar su contraseña (quedó
  visible en una terminal).
- Ideas validadas para después: ficha de sede, ranking completo en el panel,
  vocabulario por empresa / sede opcional, etiquetas en puntos, acceso por
  tienda, Google Business Profile para reseñas.

## Siguiente tarea: diseño de las tarjetas de Inplux

- Cliente: Inplux (empresa de IA). Contacto: Alejandro, representante legal.
- Pedido confirmado: 5 tarjetas NFC personalizadas, **impresión a doble cara**,
  $200.000 COP total, pago contra entrega, con 3 meses gratis de NFCloud.
- Contenido: marca Inplux + **correo de la gerencia** (el mismo en las 5);
  destino: la página web de Inplux; incluir **código QR** (la propuesta lo
  promete: "funciona con NFC o con el código QR").
- Archivos: `cotizaciones/inplux/` (logo de Inplux en blanco con acento
  turquesa `inplux-logo.png`, logos de NFCloud, la propuesta en HTML/PDF). El
  usuario tiene un .zip con más material de Inplux.
- `cotizaciones/*/` está fuera de git (datos de clientes).
