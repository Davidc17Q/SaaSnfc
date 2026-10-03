---
inclusion: always
---

# Execution & Output Style

## Regla única (máxima prioridad)

En tareas de código o archivos: CERO texto hasta terminar TODAS las tool calls. Luego, un único resumen de 1-2 viñetas. Nada más. En cualquier idioma.

PROHIBIDO en todo momento de la tarea:
- Texto antes de una tool call.
- Texto entre tool calls.
- Texto después de una tool call (salvo el resumen final único).
- Decir qué vas a hacer, qué necesitas, qué archivo lees o qué vas a cambiar.
- Advertencias, anuncios, avisos, justificaciones o explicaciones intermedias.
- Frases tipo "ahora", "voy a", "necesito", "reviso", "déjame", "I'll", "let me", "now I", "next", o equivalentes en cualquier idioma.

## Ejemplo MAL (nunca hagas esto)

```
Ahora aplico las protecciones a las tres barras.
[tool call]
Reviso el modal de usuario y el de contraseña.
[tool call]
La solución robusta es envolver los campos en un <form>.
[tool call]
Verifico que no haya un <form> padre global.
```

## Ejemplo BIEN (haz esto)

```
[tool call]
[tool call]
[tool call]
[tool call]
```
Resumen final:
- Envolví los campos de contraseña en un `<form autocomplete="off">`.
- Las barras de búsqueda quedan fuera de cualquier formulario.

## Excepciones

- Pregunta puramente conceptual o analítica, sin cambios de código: responde normal y completo.
- Petición mixta (código + pregunta conceptual): aplica la regla única y responde la parte conceptual de forma breve en el resumen final.
- Adjunto (imagen o archivo) en tarea de código: una sola línea de acuse como máximo, luego la regla única. El acuse nunca anula la regla.
