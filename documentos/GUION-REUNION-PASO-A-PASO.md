# Guion paso a paso — reunión con el gerente de Hogar y Moda

Lo que llevas: **hablador carta**, **hablador media carta**, **3 tarjetas NFC**
(WhatsApp, Google, Instagram), **tu PC** y la **cotización impresa** (2 copias).

Lee este guion completo una vez en la noche y otra vez en la mañana. No tienes
que decirlo palabra por palabra: las frases entre comillas son una guía.

---

## Antes de llegar (en la mañana, en casa)

1. **Prueba cada muestra con tu celular**: las 3 tarjetas y los 4 puntos de los
   dos habladores. Cada una debe abrir su destino (WhatsApp, Google, Instagram,
   crédito).
2. **Comprueba que esos toques aparecen en el panel** de Hogar y Moda (Resumen →
   la interacción entra en pocos segundos). Si no aparecen, esos puntos están en
   otra empresa del panel: muévelos o crea los puntos en Hogar y Moda y regraba
   los chips con el enlace que termina en `?s=n`.
3. **No regeneres la demo completa** (`scripts\demo-produccion.ps1` sin opciones):
   borra y vuelve a crear los puntos de Hogar y Moda, y tus muestras dejarían de
   funcionar. Si quieres datos hasta hoy, usa
   `powershell -File scripts\demo-produccion.ps1 -Continuar`, que solo agrega
   interacciones y no toca los puntos.
4. En el PC: entra al panel **con el usuario de Hogar y Moda** (no como
   superadmin), recarga con **Ctrl + Shift + R** y deja abiertas estas pestañas,
   en este orden:
   1. Panel → Resumen.
   2. Google Maps: "Hogar y Moda Junín".
   3. Google Maps: "Flamingo Itagüí".
   4. Google Maps: Lalico (tu caso real).
5. PC y celular **cargados**. Datos del celular listos para compartir internet.
6. Ropa: camisa lisa, pantalón chino o de tela, zapatos limpios.

---

## Paso 1 · Saludo y para qué vienes (2 minutos)

Siéntate, saca solo la libreta. **Las muestras y el PC todavía no.**

> "Gracias por sacar el espacio. Te traigo algo que ya está funcionando en
> negocios reales, y quiero ver contigo si le sirve a Hogar y Moda en dos cosas
> que se pueden medir: las reseñas de Google de cada tienda y los clientes que
> llegan por WhatsApp. Pero antes de mostrarte nada, quiero entender cómo lo
> manejan ustedes."

## Paso 2 · Preguntas (5–8 minutos) — él habla, tú anotas

Haz estas preguntas y **anota sus respuestas con sus palabras**:

1. "¿Cómo les llegan hoy los clientes de crédito? ¿Tienda, WhatsApp, promotores?"
2. "¿Tienen un WhatsApp de la empresa o uno por tienda? ¿Hay un canal de
   promociones?"
3. "¿Revisan las reseñas de Google de cada tienda? ¿Alguna les preocupa?"
4. "Si mañana quieren lanzar una promoción en todas las tiendas, ¿cómo lo
   hacen y cuánto se demora?"
5. "¿Cómo saben hoy qué tienda está funcionando mejor y cuál se está quedando?"
6. "Si probáramos algo, ¿quién se encargaría de su lado? ¿Quién más participa en
   una decisión así?"

## Paso 3 · El momento de las tarjetas (3 minutos)

Saca **la tarjeta de Google** y pásasela:

> "Acerca tu celular a esta tarjeta."

Se le abre Google. Luego pásale **la de WhatsApp** y después **la de Instagram**:

> "Así de simple para tu cliente: no descarga nada, no abre la cámara. Y si su
> celular no tiene NFC, escanea el código QR."

Ahora abre el PC en el **Resumen** y gíralo hacia él:

> "Y esos toques que acabas de hacer ya quedaron registrados: qué tienda, qué
> punto, a qué hora. Imagina esto con miles de clientes en todas tus tiendas."

(Si el toque tarda unos segundos en aparecer, sigue hablando y vuelve a mostrarlo
después: el panel se actualiza solo.)

## Paso 4 · Los habladores (3 minutos)

Pon **los dos habladores** sobre la mesa, uno al lado del otro.

> "Esto es lo que iría en cada tienda. El grande va en la **caja**, donde el
> cliente espera mientras le facturan o le estudian el crédito: ahí le pedimos la
> reseña, puede pagar su cuota por WhatsApp sin hacer fila y unirse a las
> promociones. El pequeño va en la **entrada**: '¿Quieres tu crédito? Escríbenos'."

Invítalo a tocar los puntos de los habladores.

> "Cada punto es independiente: sé cuánta gente pidió crédito, cuánta dejó reseña
> y cuánta entró a promociones, tienda por tienda."

## Paso 5 · El diagnóstico con Google (4 minutos)

Ve a las pestañas de Google Maps.

> "Revisé sus fichas de Google frente a la competencia. Hogar y Moda tiene en
> promedio 3,75 estrellas y unas 16 reseñas por tienda. Flamingo tiene 4,3 y más
> de mil reseñas por tienda: 17 veces más reseñas con la cuarta parte de las
> tiendas."

Muestra **Junín: 2,7 con 41 reseñas**.

> "No es que la atención sea mala: están a medio punto. El problema es que el
> cliente contento no deja reseña y el molesto sí. Eso es lo que se cambia, y es
> lo más rápido y barato de mover."

Muestra **Lalico**:

> "Esta licorería pasó de 5 a 29 reseñas en dos semanas, con la misma tarjeta, sin
> cambiar nada de su operación. En una tienda tuya, con mucho más tráfico, el
> efecto es mayor."

Y el hallazgo de las fichas (detalle en la sección "El problema de las fichas de
Google", al final):

> "Además, solo en Medellín encontré 32 fichas de Hogar y Moda, varias duplicadas
> o sin nombre de barrio, y la Dirección General aparece como si fuera una
> tienda. No revisé el resto del país, pero es probable que haya tiendas sin
> ficha. Una tienda sin ficha propia no puede recibir reseñas. Las tiendas del
> piloto se las dejo organizadas como parte del servicio."

## Paso 6 · El recorrido por el panel (8–10 minutos)

**Primero, dilo claro:**

> "Lo que vas a ver tiene tus 27 tiendas reales, pero los números son
> **simulados**, para que veas cómo se vería. Con el piloto, serían los tuyos."

En cada parada usa la misma estructura, para sonar ordenado:

**"Mira esto"** (lo que se ve) → **"Esto significa…"** (qué pasa) →
**"NFCloud te permite…"** (qué puede hacer él) → **"Para ti, eso es…"** (por
qué le importa).

### Parada 1 · Tarjeta + Resumen

Le das la tarjeta, la toca y giras el PC.

> "Mira: lo que acabas de hacer ya aparece aquí. Esto significa que cada vez que
> un cliente toca un hablador, sabemos en qué tienda, en qué punto y a qué hora.
> NFCloud te permite ver todas tus tiendas en una sola pantalla. Para ti, eso es
> saber cómo va la cadena sin llamar a cada tienda."

### Parada 2 · La frase de arriba y "Desde que empezaste"

> "Arriba siempre te dice en una frase lo más importante del día. Y aquí, lo
> acumulado: cuántos clientes abrieron la reseña y cuántos escribieron por
> WhatsApp. Para ti, eso es ver el resultado en 10 segundos."

### Parada 3 · Alertas

> "Si vamos a 'Requieren atención', mira: Turbo lleva 3 días sin que nadie use
> sus puntos. Esto significa que se cayó el hablador o nadie lo está ofreciendo.
> NFCloud te avisa solo, aquí y en tu correo. Para ti, eso es enterarte el mismo
> día, sin visitar la tienda."

### Parada 4 · Ficha de una tienda (clic en Manrique en el gráfico)

> "Si entramos a una tienda, mira cómo va Manrique: su puesto entre todas, si
> subió o bajó, cuántas reseñas y cuántos WhatsApp generó, y cada punto del
> hablador por separado. NFCloud te permite comparar tiendas y ver cuál copiar y
> cuál corregir. Para ti, eso es decidir dónde poner la atención con números."

**Quédate un momento aquí: es lo que más impresiona.**

### Parada 5 · Cambio masivo (Puntos NFC → Cambio masivo)

> "Ahora imagina que llega Black Friday. Desde aquí, en un clic, todos los
> habladores de todas las tiendas llevan a la promoción. NFCloud te permite
> cambiar el destino sin reimprimir nada. Para ti, eso es ahorrar impresión y
> lanzar campañas el mismo día."

Muéstralo, no lo apliques.

### Parada 6 · Mapa de calor

> "Aquí ves cuándo interactúan más tus clientes: el sábado de 5 a 7. Para ti,
> eso es saber cuándo tener al asesor de crédito disponible."

### Parada 7 · Cómo llegan los clientes

> "Y esto te dice cuántos tocaron el chip y cuántos escanearon el QR, para saber
> qué funciona mejor en cada tienda."

### Parada 8 · Informe mensual (Informes → Generar informe)

> "Por último: no tienes que entrar al panel. Esto te llega cada mes al correo:
> qué pasó, qué tienda atender y qué hacer. Para ti, eso es tener un informe de
> gerencia sin que nadie lo arme."

**Frases para pasar de una parada a otra:** "Ahora, si vamos a…", "Y aquí viene lo
interesante…", "Esto es lo que más le sirve a un gerente…".

**Al terminar el recorrido, antes de hablar de precio, pregúntale:**

> "¿Qué de esto te serviría más en Hogar y Moda?"

Su respuesta te dice qué destacar cuando muestres la cotización.

No abras nada que no hayas ensayado.

## Paso 7 · Cuando pregunte "¿cuánto cuesta?" (5 minutos)

Entrégale **la cotización impresa** y léela con él, sin afán:

> "Funciona por tienda. Cada tienda lleva un kit: los dos habladores, el diseño
> con su marca, la configuración y la instalación con capacitación al personal.
> Eso es un pago único de **$249.900 por tienda**. Y la plataforma, con el panel,
> las alertas y el informe, son **$34.900 por tienda al mes**. El primer mes no
> se cobra."

Luego, **de palabra (no está en la cotización)**:

> "Mi sugerencia es empezar con unas **6 a 8 tiendas**, incluida Junín, durante
> 90 días. Pero tú decides cuántas."

Si quiere la cuenta de una vez:

| Tiendas | Pago inicial | Mensualidad desde el mes 2 |
|---|---|---|
| 6 | $1.499.400 | $209.400 |
| 8 | $1.999.200 | $279.200 |
| 10 | $2.499.000 | $349.000 |

Y la garantía:

> "Si al día 60 las tiendas del piloto no suman en promedio 5 reseñas nuevas por
> tienda, no te cobro las mensualidades. El riesgo lo asumo yo."

**Después de decir el precio, cállate.** Deja que él hable primero.

### Si pide rebaja (cede en este orden y siempre a cambio de algo)

1. "El primer mes ya va sin costo."
2. "Si nos comprometemos a 12 meses después del piloto, te dejo el kit en
   $229.900 por tienda."
3. "Si pagas los meses 2 y 3 por adelantado, te descuento 10 % de la plataforma."

**Nunca menos de $199.900 por kit ni de $29.900 al mes.** Si insiste:
"Déjame revisarlo y hoy mismo te confirmo por escrito."

### Si pregunta por las tarjetas

> "Son opcionales, para los asesores o promotores: $40.000 cada una, o 10 por
> $350.000. Así sabes cuántos contactos trae cada asesor."

(Es el mismo precio que le diste a Río Vivo por 10 tarjetas: no hay
contradicción.)

## Paso 8 · El cierre (3 minutos)

> "Entonces te propongo: elegimos las tiendas, me das una persona de contacto y
> en 8 días hábiles está instalado. Medimos cómo está cada tienda en Google el día
> uno y a los 90 días te muestro el antes y el después. ¿Con qué tiendas
> empezarías?"

Termina con esa **pregunta de elección**, no con "¿te interesa?".

**Si dice que sí:** anota las tiendas, el nombre y el WhatsApp de la persona de
contacto, y acuerda la fecha. Dile que hoy le envías la cotización por correo.

**Si dice "lo pienso" o "lo hablo con alguien":**

> "Claro. ¿Qué necesitarías ver para decidir? ¿Y con quién lo hablarías? Si
> quieres, lo presento yo mismo; ¿qué día les sirve la próxima semana?"

Sal **con una fecha**, aunque no sea un sí.

## Paso 9 · Al salir

- Deja la cotización impresa. Las muestras **se las puedes dejar** si él quiere
  mostrárselas a alguien (es la mejor publicidad), o llévatelas si las necesitas.
- **El mismo día**, por WhatsApp o correo: gracias, un resumen corto de lo que
  hablaron (con sus palabras: "me dijiste que Junín te preocupa"), la cotización
  en PDF y el próximo paso con fecha.

---

## El problema de las fichas de Google

**Lo que sabemos:** buscando en el área metropolitana de Medellín aparecen **32
fichas** de Hogar y Moda, pero la cadena tiene **alrededor de 84 tiendas**. Además:

- Varias fichas se llaman solo "HOGAR Y MODA", sin barrio: el cliente no sabe a
  cuál tienda corresponde.
- Hay fichas duplicadas para la misma dirección.
- La Dirección General aparece como si fuera una tienda, con 3,1 estrellas.

**Lo que no sabemos todavía:** cuántas fichas hay en el resto del país (Urabá,
Oriente, Santander, Caldas…). Por eso **no digas "solo tienen 32 de 84"**: di
"solo en Medellín encontré 32". Para saber el número real, usa el prompt de
`documentos/PROMPT-FICHAS-GOOGLE.md` en otro chat.

**Por qué es un problema:** una tienda **sin ficha propia no puede recibir
reseñas**, y una ficha duplicada reparte las reseñas entre dos. El punto
"Califícanos en Google" del hablador necesita que cada tienda tenga una ficha
propia, verificada y con su enlace de reseña. Ordenar las fichas no es un extra:
**es requisito para que el piloto funcione.**

**Cómo se cobra:**

- **En el piloto: incluido.** Son pocas tiendas y sin eso no funciona.
- **Para el resto de la cadena, aparte** ("puesta a punto de fichas de Google"):
  - **$70.000 por ficha** si hay que crearla o reclamarla y verificarla.
  - **$40.000 por ficha** si ya existe y solo hay que ordenarla: nombre estándar
    ("Hogar y Moda – Junín"), horarios, fotos, categoría y enlace de reseña.
  - Unir duplicados se cotiza según el caso.
- **No va en la cotización de mañana**: se habla cuando hablen de toda la cadena.

**Condición que debes avisar:** la verificación la hace Google con el dueño de la
ficha (código por correo postal, llamada o video). Necesitas que alguien de Hogar
y Moda colabore, y puede tardar desde unos días hasta un par de semanas.

---

## Respuestas rápidas a las preguntas más probables

- **"¿Esto no lo hace un QR normal?"** "Un QR normal no se puede cambiar sin
  reimprimir ni mide nada. Este cambia en un clic en todas las tiendas y te dice
  qué tienda funciona."
- **"Los empleados no lo van a ofrecer."** "Por eso el panel muestra tienda por
  tienda: si una no lo usa, se ve el mismo día y te llega una alerta."
- **"¿Las reseñas son reales?"** "Sí, de clientes reales. No compramos ni
  filtramos reseñas: Google lo prohíbe y eso protege tu ficha."
- **"¿Qué pasa si dejamos de pagar?"** "Los habladores siguen llevando a su
  destino; solo dejas de ver el panel. Nunca quedan rotos en la tienda."
- **"¿Qué datos guardan de los clientes?"** "Ninguno personal: no pedimos nombre,
  cédula ni teléfono. Solo la tienda, el punto y la hora."
- **"¿Cuánto se demora?"** "8 días hábiles desde que apruebas. Tu equipo no hace
  nada técnico."
- **"Hagámoslo gratis, somos familia."** "Justamente porque somos familia quiero
  que salga bien: un piloto pagado nos compromete a los dos a medirlo en serio. Y
  si no funciona, no pagas las mensualidades."

## Lo que NO debes hacer

- No prometer un número exacto de reseñas.
- No hacer pasar los datos de la demo por reales.
- No inventar descuentos en el momento.
- No ofrecer como listo lo que falta (los avisos por WhatsApp todavía no están
  activos).
- No llenar el silencio después del precio.

**La frase para memorizar:** "Kit de $249.900 por tienda, $34.900 al mes, primer
mes sin costo y con garantía. Te sugiero empezar con 6 a 8 tiendas."
