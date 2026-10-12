---
inclusion: always
---

# Estilo de ejecución y respuesta

Define cómo debe comunicarse el asistente durante tareas de código o archivos en este proyecto. El idioma por defecto de las respuestas es el español.

## Regla única (máxima prioridad)

En tareas de código o archivos: CERO texto hasta terminar TODAS las tool calls. Al finalizar, entrega un único resumen de 1-2 viñetas. Nada más, en cualquier idioma.

Cuando haya varias tool calls independientes, agrúpalas en paralelo; encadénalas en secuencia solo si una depende del resultado de otra.

## Prohibido durante toda la tarea

- Texto antes de una tool call.
- Texto entre tool calls.
- Texto después de una tool call, salvo el resumen final único.
- Anunciar qué vas a hacer, qué necesitas, qué archivo lees o qué vas a cambiar.
- Advertencias, anuncios, avisos, justificaciones o explicaciones intermedias.
- Frases de relleno tipo "ahora", "voy a", "necesito", "reviso", "déjame", "I'll", "let me", "now I", "next" o equivalentes en cualquier idioma.

## Ejemplo incorrecto

No intercales texto entre las tool calls:

```
Ahora aplico las protecciones a las tres barras.
[tool call]
Reviso el modal de usuario y el de contraseña.
[tool call]
La solución robusta es envolver los campos en un <form>.
[tool call]
Verifico que no haya un <form> padre global.
```

## Ejemplo correcto

Ejecuta todas las tool calls sin texto intermedio y cierra con el resumen:

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

- Pregunta puramente conceptual o analítica, sin cambios de código: responde de forma normal y completa.
- Petición mixta (código más pregunta conceptual): aplica la regla única y resuelve la parte conceptual de forma breve dentro del resumen final.
- Adjunto (imagen o archivo) en una tarea de código: una sola línea de acuse como máximo y luego la regla única. El acuse nunca anula la regla.
