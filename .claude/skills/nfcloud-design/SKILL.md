---
name: nfcloud-design
description: Sistema de diseño UI/UX de NFCloud y reglas de "diseño que vende" para directivos. Úsala antes de crear o modificar cualquier interfaz del proyecto (public/index.html, public/app.js, public/styles.css, login, informe mensual en src/lib/report.ts) o cualquier gráfico, KPI o dashboard.
---

# Diseño NFCloud

Objetivo de marca: que se vea **caro, confiable y bien desarrollado** para
gerentes y directivos de cadenas. Premium = disciplina y restricción, no efectos
vistosos. El dato es la estrella. Referencias: Linear, Stripe, Vercel.

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

Neutros **cálidos** (stone/zinc), no slate azulado. Fondo oscuro = carbón cálido
(`--app-bg`), no azul noche. Tokens: `--app-bg`, `--card-bg`, `--card-border`,
`--input-bg`, `--input-border`, `--input-text`, `--hover`, `--muted`.

Tipografía: **Plus Jakarta Sans** (ya cargada, no cambiarla). Trabajar jerarquía:
títulos con peso (700-800), etiquetas secundarias tenues (`--muted`), números KPI
con el mayor peso visual.

**Prohibido:** glassmorphism, blur sobre contenido, vidrios translúcidos;
degradados vistosos/multicolor como decoración; barras de gráfico multicolor
arbitrarias (las series de un solo sentido van en **monocromo azul con
opacidades**, `accentA()` en `app.js`); animaciones que salten (microinteracciones
sobrias, ~150-180ms).

Gráficos (Chart.js, `public/app.js`): colores desde tokens vía `token()`,
`accent()`, `accentA(alpha)`; nunca hex. Barras/áreas de una serie en monocromo
azul. Dónut monocromo azul + neutro. Canales (WhatsApp, Instagram…) conservan su
color de marca de terceros porque son INFORMACIÓN, no decoración. Tooltips: fondo
carbón cálido, `usePointStyle`.

Componentes: **Cards** con bordes suaves + sombra en capas + aire (no borde duro).
**Botones**: primario `--accent`, destructivo `--danger`. **Iconos**: Lucide
(`public/icons.js`), no cambiar de set. Reutiliza patrones existentes (`.card`,
`.input`, `.btn-primary`, `.btn-ghost`, `toast()`, `confirmDialog()`,
`upsertChart`/`destroyChart`).

Accesibilidad: contraste legible de texto sobre superficies; `aria-label` en
botones de solo-ícono; foco visible por teclado (`:focus-visible` con `--accent`);
respetar `prefers-reduced-motion`.

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

## Patrones ya implementados (reutilizar)

- Resumen escrito arriba del dashboard: `.insight-card` + `renderInsight()`.
- KPI con contexto: `.kpi-grid`, `.kpi-card`, `.kpi-hero`, `.kpi-sub`,
  `.kpi-delta-up|down|flat` (color solo si |variación| ≥ 5 %).
- Datos técnicos plegados: `<details class="card tech-details">`.
- Barras de herramientas de tablas que se acomodan en móvil: `.table-toolbar`.
- Informe mensual (`src/lib/report.ts`): resumen escrito, variación vs mes
  anterior y layout de una columna en ≤ 640 px.

## Verificación visual

Revisa siempre a 375 px (móvil) y a escritorio: nada debe desbordar
(`document.documentElement.scrollWidth` igual al ancho de la ventana), los
nombres largos de sedes no deben romper tarjetas y los gráficos deben tener
`min-width: 0` en sus contenedores grid/flex.
