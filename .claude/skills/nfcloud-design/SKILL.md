---
name: nfcloud-design
description: Sistema de diseño UI/UX de NFCloud y reglas de "diseño que vende" para directivos. Úsala antes de crear o modificar cualquier interfaz del proyecto (public/index.html, public/app.js, public/styles.css, login, informe mensual en src/lib/report.ts) o cualquier gráfico, KPI o dashboard.
---

# Diseño NFCloud

Objetivo de marca: que se vea **caro, confiable y bien desarrollado** para
gerentes y directivos de cadenas. Premium = disciplina y restricción, no efectos
vistosos. El dato es la estrella. Referencias: Linear, Stripe, Vercel.

**Esta skill manda sobre cualquier otra en lo visual.** Las demás aportan oficio:
`impeccable` (auditar, pulir, jerarquía, estados, copy; el panel es modo *Operate*:
precisión y restricción, no expresión) y las de Emil Kowalski (`emil-design-eng`,
`animate`, `review-animations`, `remove-animations`, `break-ui`, `mobile-native`).
Si una regla suya choca con una de aquí, gana esta y se dice en el resumen.

Para gráficos, carga también la skill `dataviz` (marcas, color, tooltips,
anti-patrones) y aplica sus reglas con los tokens de este proyecto.

## Sistema visual

Todo el color vive en variables CSS en `public/styles.css` (`:root` y `.dark`).
**Nunca uses hex sueltos en componentes nuevos; usa los tokens.**

Dos sistemas de color SEPARADOS:
1. **Marca (azul)** — identidad, navegación, acciones primarias, estado activo.
   Tokens: `--accent`, `--accent-hover`, `--accent-strong`, `--accent-soft`,
   `--accent-ring`, `--accent-contrast`. El azul **NUNCA** comunica el estado de
   un dato.
2. **Semántico (verde/ámbar/rojo APAGADOS, no neón)** — estado de los datos.
   `--ok`/`--ok-soft` (bien/alza), `--warn`/`--warn-soft` (alerta),
   `--danger`/`--danger-soft` (grave/baja), `--neutral-state`/`-soft`. El color de
   estado **NUNCA** se usa como decoración. Lo grave puede destacar; lo "bien"
   casi silencioso. El color aparece donde hay que **actuar**.

Excepción: **degradado con grano** (grainy gradient, estilo ElevenLabs), permitido
solo en el **login** y en la **landing**, nunca en el panel ni en el informe. Reglas:
manchas de luz difusa de casi negro (`#050608`) a azul de marca (`#0e2f9e` →
`#2a63f0`), sin otros tonos; encima, ruido fino (SVG `feTurbulence` en un
`::after`, `mix-blend-mode: soft-light`, opacidad ≈ 0,5) para dar textura y evitar
bandas. Implementación de referencia: `.login-split > .login-hero` en
`public/styles.css`. En el login lo acompañan solo las ondas NFC del logo; el
formulario va sobre `--login-surface` (hueso en claro, carbón en oscuro).

Neutros **cálidos** (stone/zinc), no slate azulado. Fondo oscuro = carbón cálido
(`--app-bg`), no azul noche. Tokens: `--app-bg`, `--card-bg`, `--card-border`,
`--input-bg`, `--input-border`, `--input-text`, `--hover`, `--muted`.

Tipografía: **Plus Jakarta Sans** (ya cargada, no cambiarla). Trabajar jerarquía:
títulos con peso (700-800), etiquetas secundarias tenues (`--muted`), números KPI
con el mayor peso visual.

**Prohibido:** glassmorphism, blur sobre contenido, vidrios translúcidos;
degradados vistosos/multicolor como decoración; barras de gráfico multicolor
arbitrarias (las series de un solo sentido van en **monocromo azul con
opacidades**, `accentA()` en `app.js`); texto con degradado; sombras de color o
halos; `will-change` permanente.

Gráficos (Chart.js, `public/app.js`): colores desde tokens vía `token()`,
`accent()`, `accentA(alpha)`; nunca hex. Barras/áreas de una serie en monocromo
azul. Dónut monocromo azul + neutro. Canales (WhatsApp, Instagram…) conservan su
color de marca de terceros porque son INFORMACIÓN, no decoración. Tooltips: fondo
carbón cálido, `usePointStyle`. La base común (fuente, `es-CO`, animación de 240 ms)
está en `Chart.defaults`; no la repitas por gráfico. Líneas con
`cubicInterpolationMode: 'monotone'`: una curva no puede inventar picos que el dato
no tiene. Sin rejilla vertical; radio de barra 4. Una segunda serie de comparación
es neutra, nunca verde (verde significa "bien").

Componentes: **Cards** con borde suave + `--shadow-card` + aire. Nada de tarjetas
dentro de tarjetas: las filas internas se separan con espacio. **Botones**: relleno
`--accent-fill` y destructivo `--danger-fill` (nunca `--accent`/`--danger`, que en
oscuro no dan contraste con texto blanco). Menús y modales: `--shadow-pop`.
**Iconos**: Lucide (`public/icons.js`), no cambiar de set. Reutiliza patrones
existentes (`.card`, `.input`, `.btn-primary`, `.btn-ghost`, `toast()`,
`confirmDialog()`, `upsertChart`/`destroyChart`). Todo modal `.fixed.inset-0.z-50`
recibe rol, foco, Esc y trampa de Tab desde `setupModals()`; necesita un botón
`close*` o `cancel*`.

Movimiento (tokens `--ease-out`, `--dur-press` 120 ms, `--dur-ui` 160 ms,
`--dur-overlay` 200 ms):
- Antes de animar: ¿con qué frecuencia se ve? Navegación, filtros y lo que se usa
  decenas de veces al día no se anima, solo cambia de color. Modales, menús y avisos
  sí, con entrada corta.
- Presionar responde: `scale(0.97)` en `:active`. Entradas con `@starting-style`,
  desde `opacity: 0` y a lo sumo `scale(0.98)`; nunca desde `scale(0)` ni `ease-in`.
- Propiedades exactas en `transition` (nunca `all`); solo `transform` y `opacity`
  para moverse. Las tarjetas no se elevan al pasar el cursor.
- Con `prefers-reduced-motion`, se quita el desplazamiento y queda el fundido.

Acabado (lo que el navegador trae por defecto también es diseño): controles con
`font: inherit`, `select.input` con flecha propia, `color-scheme` por tema, barras de
desplazamiento y `::selection` con tokens, `:focus-visible` uniforme, `tabular-nums`
en columnas. En táctil (`pointer: coarse`): objetivos de 44 px, campos de 16 px para
que iOS no haga zoom y sin hover pegado. Altura con `dvh`, no solo `vh`.

Accesibilidad: texto ≥ 4,5:1 sobre su superficie (también en claro con `--muted`);
`aria-label` en botones de solo-ícono; cada campo con su `label for`;
`role="status"`/`alert` en avisos y errores.

## Diseño que vende (directivos de cadenas)

El sistema visual de arriba da la estética. Esta sección da lo que **vende**: un
directivo decide en 5-10 segundos si el producto le sirve. Cada pantalla responde,
en este orden: **¿cómo vamos? → ¿qué cambió? → ¿qué hago?**

1. **Respuesta primero (pirámide invertida)**: arriba 3-5 KPIs ejecutivos, luego
   tendencias, al final tablas y detalle. Sobre el pliegue, máximo ~6-8 elementos.
2. **Ningún KPI sin contexto**: valor + variación vs periodo anterior (▲/▼ con
   `--ok`/`--danger`, solo si el cambio importa) + periodo explícito ("últimos 30
   días"). Un número sin comparación no va en una tarjeta KPI.
3. **Lenguaje de negocio, no técnico**: "Reseñas generadas", "Contactos por
   WhatsApp", "Sede con peor calificación" por encima de "escaneos" o "iOS vs
   Android". Los datos técnicos (SO, IDs de dispositivo) van en vistas
   secundarias, no en la vista principal ni en la ejecutiva.
4. **Insight escrito**: cada vista principal abre con 1-2 frases generadas desde
   los datos ("La sede Norte cayó 32% esta semana; es la única en alerta."). Si no
   hay nada relevante, se dice ("Todas las sedes dentro de lo normal.").
5. **Cada alerta con su acción**: ver la sede, cambiar el destino, descargar el
   informe. Nada de alertas que solo informan.
6. **Comparar sedes es el valor central** para cadenas: ranking ordenable, mejor
   y peor sede siempre visibles.
7. **El informe es el producto**: muchos directivos no entran al panel. El PDF o
   correo mensual sigue la misma jerarquía: una primera página de resumen con
   KPIs, variaciones e insights; el detalle va después.
8. **Confianza**: "Actualizado hace X min", cifras idénticas entre vistas e
   informe, nada de datos de prueba visibles ("Test 1", "asdf"). La demo usa
   nombres y volúmenes realistas.
9. **Estados vacíos y de carga cuidados**: skeletons al cargar; si no hay datos,
   explicar por qué y cuál es el siguiente paso. Nunca un "—" o un gráfico vacío
   sin explicación.
10. **Formato de números `es-CO`**: separador de miles, 0-1 decimales en %,
    abreviar grandes cifras (12,4 mil). `tabular-nums` solo en columnas de
    tablas y ejes; los KPIs grandes usan cifras proporcionales.
11. **Móvil**: la vista ejecutiva y el informe deben leerse bien a 375 px; los
    directivos revisan desde el celular.

## Que no parezca hecho por IA

- Sin adornos de plantilla: nada de halos/glow en puntos de leyenda, íconos
  dentro de cuadritos de color, franjas de color en un borde de tarjetas o filas
  (la gravedad de una alerta la dice su insignia), trofeos dorados, rótulos sobre
  los títulos ni emojis en la interfaz.
- Nada técnico a la vista del cliente: "Sistema en línea", no "DB OK · Redis OK".
- Decimales siempre en es-CO (`fmtDec()`): "4,24", nunca "4.24".
- Íconos solo donde ayudan a actuar (navegación, botones, estados). Los títulos
  de sección van sin ícono.
- Etiquetas en tipo oración ("Sedes con actividad"), no en MAYÚSCULAS con
  espaciado. Las mayúsculas quedan solo para insignias cortas de estado.
- Vocabulario del cliente, no de software: "Resumen", "Comparar sedes",
  "Puntos NFC", "interacciones", "reseñas", "tiendas". Evitar "Dashboard",
  "Gap", "Panel de Control", "dispositivos", "escaneos" en textos visibles.
- "Campaña" significa campaña comercial (bandas en la tendencia). El cambio de
  destino de varios puntos a la vez es "cambio masivo", nunca "campaña".
- Textos concretos y útiles: un estado vacío dice qué hacer a continuación.
- Datos de demo realistas: nombres reales o creíbles de tiendas, volúmenes
  coherentes, nunca "Test", "asdf" ni listas obviamente generadas.

## Patrones ya implementados (reutilizar)

- Resumen por gravedad arriba del dashboard: `.insight-card` + `buildInsights()`
  / `renderInsight()`. Primera línea = la más grave; el resto se despliega.
  Fondo solo en crítico (`--danger-soft`) y advertencia (`--warn-soft`); bueno
  y neutro, solo un punto de color. Cada línea grave lleva su acción.
- Protecciones de datos: si ≥ 50 % de las sedes están en alerta, un solo
  mensaje general; el efecto de una campaña no se afirma con < 3 días o poca
  base (`src/lib/campaign-effect.ts`).
- KPI con contexto: `.kpi-grid`, `.kpi-card`, `.kpi-hero`, `.kpi-sub`,
  `.kpi-delta-up|down|flat` (color solo si |variación| ≥ 5 %).
- Datos técnicos plegados: `<details class="card tech-details">`.
- Barras de herramientas de tablas que se acomodan en móvil: `.table-toolbar`.
- Informe mensual (`src/lib/report.ts` + `report-story.ts`): historia en
  capítulos (Resumen, Tiendas, Campañas, Clientes, Qué hacer) que se ocultan o
  adaptan si no hay datos; titular y recomendaciones generados por reglas
  (`reportRecommendations`); mes en curso comparado con los mismos días del
  mes anterior; una sola sede → ranking de puntos NFC.

## Verificación visual

Revisa siempre a 375 px (móvil) y a escritorio: nada debe desbordar
(`document.documentElement.scrollWidth` igual al ancho de la ventana), los
nombres largos de sedes no deben romper tarjetas y los gráficos deben tener
`min-width: 0` en sus contenedores grid/flex.
