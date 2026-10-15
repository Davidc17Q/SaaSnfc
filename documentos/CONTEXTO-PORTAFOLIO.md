# Portafolio de David Quintero — contexto y objetivo

Documento de traspaso para continuar el portafolio en otra conversación.

> Archivo del portafolio: `portafolio/index.html` (HTML autocontenido, una sola página).
> Imágenes (mockups) en la misma carpeta `portafolio/`.

---

## 1. Objetivo del portafolio

Pieza de **marketing/presentación** para que David ofrezca NFCloud a la industria
(negocios, cadenas) y a contactos como el profesor-asesor. No es un dashboard: aquí el
objetivo es **atraer y causar impresión**, mostrar que es un producto real con
resultados, y abrir conversaciones comerciales.

**Meta concreta:** que un gerente, dueño de negocio o aliado abra el enlace, entienda en
30 segundos qué es NFCloud, vea casos reales con resultados, y tenga a un clic el
contacto (WhatsApp/correo).

---

## 2. Cómo se presenta David (decisión tomada)

- Encabezado: **"David Quintero Gallego — Fundador de NFCloud"**.
- Eyebrow: "Reputación y presencia digital para negocios físicos".
- Se posiciona como **fundador/emprendedor con producto**, NO como "estudiante que hace
  tarjetas" (suena a proyecto de clase). Lo de EAFIT no es el título protagonista.
- Contacto: WhatsApp +57 300 724 0273 · davidquinterogallego1@gmail.com

---

## 3. Qué contiene el portafolio (secciones)

1. **Hero** con fondo degradado azul de marca (glow centrado, llamativo a propósito),
   logo grande arriba a la izquierda, nombre + "Fundador de NFCloud", lead explicando
   NFCloud, botones (WhatsApp / ver casos).
2. **Métricas destacadas:** Lalico 5→29 reseñas, 4 negocios con reseñas activas,
   139 vistas en Google (Celumóvil), plataforma 24/7.
3. **Qué hago:** 3 pasos (toque/escaneo → destino editable → todo medido).
4. **Casos reales:** RioVivo (spa), Hogar y Moda (cadena), Algoritmos Deshumanizantes
   (libro del profe), tarjeta profesional. Cada uno con imagen clicable.
5. **Banner NFC:** destaca el hablador de mostrador de RioVivo (varias acciones en una
   pieza) con imagen grande y descripción.
6. **Galería "Diseños":** 6 mockups, todos ampliables al clic.
7. **Contacto:** WhatsApp y correo.
8. **Lightbox:** todas las imágenes se abren en grande (clic), se cierran con X, clic
   fuera o Escape.

---

## 4. Imágenes (en `portafolio/`)

- `riovivo-tarjeta.png` — tarjeta NFC de RioVivo (horizontal).
- `hogarymoda-set.png` — set de tarjetas Hogar y Moda.
- `profe-libro.png` — tarjeta del libro "Algoritmos Deshumanizantes".
- `mockup-6.jpg` — banner/hablador vertical de RioVivo (usado en sección Banner NFC).
- `mockup-4.jpg` — tarjeta negra del profe (fondo neutro).
- `mockup-1.jpg` — tarjeta negra del profe (fondo oficina).
- `mockup-2.jpg`, `mockup-3.jpg`, `mockup-5.jpg` — tarjetas Hogar y Moda (Google/otras).
- El logo del hero sale de `../public/logo-icono.png` (funciona abriéndolo dentro del
  proyecto; si se mueve el portafolio a otro lado, copiar ese logo a `portafolio/`).

Nota: los mockups fueron hechos por David con IA (diseños propios sobre fondos
elegantes). Son de alta calidad y lucen profesionales.

---

## 5. Sistema de diseño aplicado

Sigue el steering de UI/UX de NFCloud (`.kiro/steering` / regla `ui-ux-guidelines`),
con una excepción consciente: el portafolio es marketing, así que **sí** usa un
degradado de marca llamativo en el hero (en la plataforma eso estaría prohibido). Reglas
respetadas:
- Azul de marca como acento; neutros cálidos; tipografía **Plus Jakarta Sans**.
- Degradado SOLO con el azul propio (no multicolor chillón).
- Microinteracciones sobrias (hover que eleva, transiciones ~150-180ms).
- Accesible: `aria-label`, foco, respeta `prefers-reduced-motion`.
- Premium por restricción, estética tipo Linear/Stripe/Tapni (referencia que pidió David
  fue Tapni para el hero).

---

## 6. Pendiente / próximos pasos

- **Añadir sección de precios y planes** (lo dejó para después). Debe seguir el mismo
  estilo. Los planes del modelo de negocio están en `documentos/CONTEXTO-PROYECTO.md`
  sección 7 (Punto $39.900, Sedes $34.900/sede, Red $19.900/sede, Institución
  $49.900/punto) + hardware (pago único).
- Opcional: desplegar el portafolio (podría servirse desde el propio NFCloud, o como
  página aparte) y ponerle su propia tarjeta NFC (meta-demostración: su tarjeta de
  presentación es su propio producto).
- Opcional: exportar a PDF (abrir en navegador → imprimir → guardar como PDF) para
  adjuntar en correos formales.

---

## 7. Cómo verlo / editarlo

- Abrir `portafolio/index.html` en el navegador (doble clic).
- Es un solo archivo HTML con CSS y JS embebidos; se edita directo ahí.
- Para compartir como enlace, hay que alojarlo (o enviarlo como archivo/PDF).

---

*Documento de traspaso del portafolio. Para el contexto completo del producto NFCloud,
ver `documentos/CONTEXTO-PROYECTO.md`.*
