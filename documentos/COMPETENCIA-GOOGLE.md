# Competencia en Google (Places API)

"Tú frente a tu competencia": cada sede se enlaza con su ficha de Google y con
hasta 3 competidores; NFCloud mide una vez por semana su calificación y su
número de reseñas. Código: `src/lib/places.ts`, `src/routes/competition.ts`.

Sin la variable `GOOGLE_PLACES_API_KEY` la función no aparece en el panel.

## Riesgo (decidir con el cliente después de la demo)

Las condiciones de Google Maps Platform solo permiten guardar indefinidamente
el `place_id`. NFCloud guarda una medición semanal (calificación y número de
reseñas) para mostrar la evolución, lo que en sentido estricto no está
permitido. Está implementado como demo. Si se decide quitarlo, basta con
borrar la variable de entorno (la sección desaparece) y, si se quiere, vaciar
`place_snapshots` y `location_competitors`.

Alternativa oficial para la reputación **propia**: Google Business Profile API
(requiere solicitar acceso a Google y que el cliente conecte su cuenta).

## Crear la API key (≈ 10 minutos)

1. **console.cloud.google.com** → crear proyecto **NFCloud**.
2. **Facturación** → vincular una cuenta con tarjeta (no cobra dentro del uso
   gratis).
3. **APIs y servicios → Biblioteca** → activar **Places API (New)**.
4. **Credenciales → Crear credencial → Clave de API** → **Restringir clave** →
   *Restricciones de API*: solo **Places API (New)**.
5. **Facturación → Presupuestos y alertas** → presupuesto de 5 USD con alerta.
   Opcional: en **Places API (New) → Cuotas**, limitar las llamadas por día
   (por ejemplo 300).
6. Railway → Variables → `GOOGLE_PLACES_API_KEY` = la clave. En local, la
   misma línea en `.env`.

## Uso

1. Ficha de la sede → **Tú frente a tu competencia → Conectar con Google**:
   el buscador ya trae el nombre y la ciudad de la sede; elige la ficha
   correcta.
2. **Agregar competidor** (hasta 3): busca por nombre y barrio.
3. **Actualizar ahora** mide en el momento (además de la medición semanal).
4. **Comparar sedes → Frente a la competencia en Google**: cada sede contra su
   mejor competidor; primero las que van detrás.

Las **reseñas ganadas** se calculan contra una medición anterior: aparecen
desde la segunda medición (una semana después) y a los 30 días muestran el
mes completo. Al enlazar la ficha propia, la "Reputación en Google" de la sede
también se llena sola (sin pisar lo registrado a mano ese día).

## Costo

Place Details con calificación y reseñas es nivel Enterprise: 1.000 llamadas
gratis al mes y ≈ 20 USD por cada 1.000 después. Con 3 competidores y medición
semanal son ≈ 17 llamadas por sede al mes: gratis hasta ≈ 58 sedes. Cada
búsqueda en el buscador también cuenta (nivel de Text Search con
calificación); para configurar un piloto son pocas decenas.
