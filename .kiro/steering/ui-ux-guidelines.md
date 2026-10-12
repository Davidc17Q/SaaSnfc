---
inclusion: always
---

# Sistema de diseño NFCloud (UI/UX)

Guía visual de la plataforma. Objetivo de marca: que se vea **caro, confiable y
bien desarrollado** para gerentes y directivos de cadenas. Premium = disciplina
y restricción, NO efectos vistosos.

## Principio rector

El dato es la estrella. Si un efecto, color o adorno llama la atención sobre sí
mismo en vez de sobre la información, se elimina. Referencias: Linear, Stripe,
Vercel (superficies sólidas, mucho aire, una sola jerarquía clara).

## Color: dos sistemas SEPARADOS

Todo el color vive en variables CSS en `public/styles.css` (`:root` y `.dark`).
Nunca usar hex sueltos en componentes nuevos; usar los tokens.

1. **Marca (azul)** — identidad, navegación, acciones primarias, estado activo.
   - `--accent`, `--accent-hover`, `--accent-strong`, `--accent-soft`, `--accent-ring`, `--accent-contrast`.
   - El azul **NUNCA** comunica el estado de un dato.
2. **Semántico (verde/ámbar/rojo, APAGADOS, no neón)** — estado de los datos.
   - Bien/activo/alza: `--ok` / `--ok-soft`.
   - Alerta/bajo flujo: `--warn` / `--warn-soft`.
   - Grave/inactivo/baja: `--danger` / `--danger-soft`.
   - Neutro/sin datos: `--neutral-state` / `--neutral-state-soft`.
   - El color de estado **NUNCA** se usa como decoración.
   - Jerarquía: lo grave puede destacar más; lo "bien" debe ser casi silencioso.
     El color aparece donde hay que **actuar**.

## Neutros CÁLIDOS, no fríos

Las superficies usan grises cálidos (stone/zinc), no slate azulado. El fondo
oscuro es un **carbón cálido** (`--app-bg` oscuro), no azul noche. Esto da el
aire "hecho a mano" sin perder seriedad. Tokens: `--app-bg`, `--card-bg`,
`--card-border`, `--input-bg`, `--input-border`, `--input-text`, `--hover`, `--muted`.

## Tipografía

Plus Jakarta Sans (ya cargada). No cambiarla. Trabajar la **jerarquía**: títulos
con peso (700-800), etiquetas secundarias tenues (`--muted`), para que el ojo
vaya al dato clave. Números de KPI con el mayor peso visual.

## Prohibido

- Glassmorphism, blur sobre contenido, vidrios translúcidos (pierden contraste,
  se ven de plantilla).
- Degradados vistosos o multicolor como decoración.
- Barras de gráfico multicolor arbitrarias. Las series de un solo sentido van en
  **monocromo azul con opacidades** (`accentA()` en `app.js`).
- Animaciones que salten. Las microinteracciones son sobrias (hover que eleva
  levemente, transiciones ~150-180ms).

## Gráficos (Chart.js, `public/app.js`)

- Colores desde tokens vía `token()`, `accent()`, `accentA(alpha)`. No hex.
- Barras/áreas de una serie: monocromo azul.
- **Gráfico de horas**: barras azules monocromo + bandas de fondo sutiles por
  turno (mañana/tarde/noche) vía `shiftBandsPlugin` y tokens `--shift-*`. La
  diferenciación de turno va en el FONDO, nunca en el color de las barras.
- Dónut de SO: escala monocroma azul + neutro (no multicolor).
- Canales (WhatsApp, Instagram, etc.): se conservan sus colores de marca de
  terceros porque son INFORMACIÓN (reconocimiento del destino), no decoración.
- Tooltips: fondo carbón cálido, marcador de punto redondo (`usePointStyle`).

## Componentes

- **Cards**: bordes suaves + sombra en capas (no borde duro protagonista) + aire.
- **Alertas**: panel integrado (sin borde grueso de plantilla); cada fila lleva
  un acento de estado sutil en su borde izquierdo (`.lvl-grave`/`.lvl-alerta`).
- **Botones**: primario = `--accent`; destructivo = `--danger`.
- **Iconos**: Lucide (líneas finas, `public/icons.js`). No cambiar de set.

## Accesibilidad

Mantener contraste legible de texto sobre superficies (los estados apagados
siguen siendo legibles). `aria-label` en botones de solo-ícono, foco visible por
teclado (`:focus-visible` con `--accent`). Respetar `prefers-reduced-motion`.
