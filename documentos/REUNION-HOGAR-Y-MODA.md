# Reunión con el gerente de Hogar y Moda — jueves en la mañana

Plan completo para llegar preparado. **No es para entregar**: es tu guion. Léelo
completo una vez hoy, ensaya la demo dos veces mañana y repasa la sección 1 el
jueves temprano.

---

## 0. La meta de la reunión (una sola)

**Salir con un "sí" al piloto de 6 sedes**, con tres cosas concretas:

1. Las **6 sedes** elegidas (al menos una de las de peor calificación, como Junín).
2. **Una persona responsable** del lado de Hogar y Moda (con nombre y WhatsApp).
3. **Una fecha** de instalación.

Si no se puede cerrar ahí, la meta mínima es **una segunda reunión con fecha**
con quien decide (si es empresa familiar, puede ser el papá o un socio).

Todo lo que hagas en la reunión empuja hacia esas tres cosas. Si una parte de la
demo no ayuda a eso, se salta.

---

## 1. Checklist antes del jueves

### Martes / miércoles (hoy y mañana)

- ☐ **Publicar el arreglo del resumen** (commit `7c9cf64`). Sin él, el resumen de
      producción dice "4 sedes con menos interacciones" con datos falsos y
      "Destino principal: Sin datos". Es lo primero que vería el gerente.
- ☐ **Crear el usuario del gerente en producción**: Empresas y usuarios →
      Nuevo usuario, rol administrador de empresa, empresa **Hogar y Moda**.
      Así en la demo solo se ve su empresa (nada de Lalico, el profe ni
      "Todas las empresas"). Pruébalo en el portátil **y** en el celular.
- ☐ **Grabar una tarjeta NFC de demostración** (el momento más fuerte de la
      reunión, ver sección 3.3):
      1. En producción, entra como el usuario de Hogar y Moda → Puntos NFC →
         sede **Manrique** (o La Playa) → punto Caja principal → ícono QR.
      2. Copia el **"Enlace para grabar en el chip NFC"** (termina en `?s=n`).
      3. Grábalo en una tarjeta con la app gratuita **NFC Tools** (Android o
         iPhone): Escribir → Añadir registro → URL. Pruébala con tu celular.
      4. Ten también ese QR en el celular o impreso.
- ☐ **Decidir el "valor por destino"** (Informes → Valor y metas). La tarjeta
      "Valor estimado generado" muestra millones de pesos según lo que se
      configure. Dos opciones:
      - **Recomendado:** dejarlo vacío y configurarlo **en vivo con él**
        (sección 3.6): "¿Cuánto vale para ti un chat de crédito?". Así el número
        es suyo, no tuyo.
      - Si lo dejas configurado, usa valores **conservadores** (por ejemplo
        WhatsApp $8.000, reseña $2.000) y sé capaz de explicarlos.
- ☐ Ensayar la demo completa **dos veces en voz alta** con cronómetro
      (sección 3). La segunda, sin mirar este papel.
- ☐ Imprimir **2 copias** de la propuesta (`cotizaciones/hogar-y-moda/
      Propuesta-NFCloud-Hogar-y-Moda.pdf`) y tenerla también en el celular.
- ☐ Imprimir el **hablador** en tamaño carta (`cotizaciones/hogar-y-moda/
      hablador/Hablador-carta-IMPRENTA.pdf`). Si alcanzas, en un acrílico; si
      no, la lámina de presentación en el celular/tablet.

### Jueves temprano (antes de salir)

- ☐ **Refrescar la demo de producción** para que los datos lleguen hasta hoy:
      Railway → Postgres → activar un momento el TCP Proxy → en PowerShell,
      desde la carpeta del proyecto: `powershell -File scripts\demo-produccion.ps1`
      y pega `DATABASE_PUBLIC_URL` cuando lo pida. Al terminar, **desactiva el
      TCP Proxy otra vez**.
      - Esto regenera los 120 días con las alertas a propósito: Turbo sin
        actividad, Copacabana y El Peñol con caídas. Son tu historia.
      - **Ojo:** regenerar crea puntos nuevos, así que la tarjeta NFC grabada
        el martes dejaría de apuntar a un punto válido. Haz el refresco **antes**
        de grabar la tarjeta, o vuelve a copiar el enlace y regrábala después.
- ☐ Abrir el panel con el usuario de Hogar y Moda, **recargar con
      Ctrl + Shift + R**, revisar el resumen, una ficha de sede y el informe.
- ☐ Probar la tarjeta NFC: tócala y confirma que la interacción aparece en el
      panel (se refresca solo cada ~8 segundos).
- ☐ Portátil y celular **cargados**; datos móviles listos para compartir
      internet si el Wi-Fi de la oficina falla.
- ☐ Pestañas abiertas en orden: (1) panel en el Resumen, (2) Google Maps con
      "Hogar y Moda Junín", (3) Google Maps con "Flamingo Itagüí", (4) la ficha
      de Lalico en Google (tu caso real 5 → 29), (5) el informe mensual.
- ☐ **Plan B sin internet:** el PDF de la propuesta y capturas del panel en el
      celular (resumen, una ficha, el informe). Tómalas el miércoles.

### Qué llevar

Portátil y cargador · celular con datos · tarjeta NFC de demo · 2 propuestas
impresas · hablador impreso (o lámina en el celular) · libreta y esfero para
anotar lo que él diga (anotar sus palabras genera confianza).

---

## 2. Lo que tienes que saber de memoria

**Hogar y Moda en Google Maps (área metropolitana, revisión del 23 de octubre):**

| Cadena | Sedes en Google | Calificación | Reseñas por sede |
|---|---|---|---|
| Flamingo | 8 | 4,30 | 1.132 |
| Alkomprar | 7 | 4,35 | 1.130 |
| Jamar (referencia) | 3 | 4,16 | 680 |
| Electrobello | 4 | 4,30 | 84 |
| **Hogar y Moda** | **32 fichas** | **3,75** | **16** |

- Flamingo tiene **17 veces más reseñas con la cuarta parte de las sedes**.
- **19 de las 32 fichas** de Hogar y Moda están por debajo de 4,0. En Flamingo,
  ninguna.
- **Junín Principal: 2,7 con 41 reseñas.**
- Fichas desordenadas: varias se llaman solo "HOGAR Y MODA", sin barrio, y la
  Dirección General aparece como si fuera una tienda (3,1).
- La calidad no está lejos (medio punto); **el frente a mover es el volumen**.

**Tu evidencia propia:** Lalico pasó de 5 a 29 reseñas en dos semanas,
manteniendo 5 estrellas, sin cambiar su operación.

**Evidencia externa (por si pregunta "¿y eso en plata?"):** Harvard (Michael
Luca) midió que una estrella más se asocia con 5 % a 9 % más de ingresos, y que
el efecto es mayor en marcas regionales que en las muy conocidas. Es un orden de
magnitud, no una promesa (detalle en `documentos/RESPALDO-EVIDENCIA.md`).

**La empresa:** Hogar y Moda S.A.S., desde 1995 (empezó con venta por catálogo
y puerta a puerta), ~80 sedes, ventas reportadas de más de 100.000 millones al
año. Venden a crédito: **el crédito es su motor**, no solo la reseña.

---

## 3. La reunión, minuto a minuto (45 minutos)

> Regla de oro: **él habla más que tú en los primeros 10 minutos.** Si escuchas
> bien, el resto de la reunión se vende sola.

### 3.1 Apertura (0–3 min)

> "Gracias por el espacio. Te traigo algo que ya funciona en negocios reales y
> que creo que le puede servir a Hogar y Moda en dos cosas que se pueden medir:
> reputación en Google y clientes que llegan por WhatsApp. Antes de mostrarte
> nada, quiero entender cómo lo ven ustedes."

Es familia: **más profesional, no menos.** Trátalo como a un cliente grande.

### 3.2 Preguntas para él (3–10 min)

Hazlas y **anota sus respuestas con sus palabras**. Las usarás en el cierre.

1. "¿Cómo les llegan hoy los clientes de crédito? ¿Por la tienda, por WhatsApp,
   por los promotores?"
2. "¿Tienen un WhatsApp de la empresa o cada sede tiene el suyo? ¿Hay un canal
   de promociones?"
3. "¿Revisan las reseñas de Google de cada sede? ¿Hay alguna que les preocupe?"
4. "Si mañana quisieran lanzar una promoción en todas las sedes, ¿cómo lo hacen
   hoy y cuánto se demora?"
5. "¿Cómo saben hoy qué sede está funcionando mejor y cuál se está quedando?"
6. "Si hiciéramos un piloto, ¿quién sería la persona encargada de su lado? ¿Y
   quién más participa en una decisión así?"

La respuesta a la 6 te dice **quién decide**. Si no es él, la meta pasa a ser la
segunda reunión con esa persona.

### 3.3 El momento de impacto (10–13 min)

Antes de cualquier gráfico, saca la tarjeta NFC:

> "Toca esta tarjeta con tu celular."

Se le abre la reseña de Google (o el destino que hayas puesto). Gira el portátil:

> "Eso que acabas de hacer ya quedó registrado. Esa es la sede, ese es el punto,
> esa es la hora. Así se ve cuando lo hacen cientos de clientes en tus 27 sedes."

Si el panel no la muestra al instante, no pasa nada: se actualiza cada pocos
segundos. Sigue hablando y vuelve a mirarlo después.

### 3.4 El diagnóstico (13–18 min)

> "Revisé sus fichas de Google frente a la competencia." (tabla de la sección 2)

- Muestra **Junín en Google Maps** en su propio celular o en el tuyo: 2,7.
- Muestra **Flamingo Itagüí**: 3.146 reseñas.
- La frase clave:
  > "No es que la atención sea mala: están a medio punto de Flamingo. La
  > diferencia es que el cliente contento de Hogar y Moda no deja reseña y el
  > molesto sí. Eso es lo que se cambia, y es lo más rápido y barato de mover."

### 3.5 La demo (18–30 min)

**Antes de empezar, dilo una vez y claro:**

> "Los números que vas a ver son **simulados** sobre tus 27 sedes reales, para
> que veas cómo se vería. Lo real es lo que te mostré de Google y lo de Lalico.
> Con el piloto, estos números serán los tuyos."

Decirlo protege tu credibilidad: si él ve "Turbo sin actividad" y llama a Turbo,
no puede pensar que lo engañaste.

Orden de la demo (cada paso responde una pregunta de él):

1. **Resumen** → "¿Cómo vamos?": la frase de arriba, "Desde que empezaste" y las
   cuatro tarjetas. No leas los números: di qué significan.
2. **Alertas** → "¿Qué tengo que atender?": «Turbo lleva 3 días sin
   interacciones». "Esto te lo dice el sistema solo; también te puede llegar al
   correo."
3. **Ficha de sede** (clic en Ver sede de Turbo, y luego **Manrique** desde el
   gráfico) → "Mira cómo va Manrique": posición en la cadena, si subió o bajó,
   reseñas, WhatsApp, sus puntos NFC uno por uno. **Este es el "wow"**: quédate
   aquí.
4. **Cambio masivo** (Puntos NFC → Cambio masivo) → "Llega Black Friday: en un
   clic, los habladores de todas las sedes llevan a la promoción, sin reimprimir
   nada." Muéstralo sin aplicarlo (o aplícalo y deshazlo desde el historial).
5. **Mapa de calor** → "Sábado de 5 a 7 es tu momento más fuerte: ahí debe estar
   el asesor de crédito."
6. **Informe mensual** (Informes → Generar informe) → "Esto te llega cada mes.
   No tienes que entrar al panel: qué pasó, qué sede atender y qué hacer."

**Qué NO mostrar:** Empresas y usuarios, el selector de empresas, las otras
empresas, el detalle técnico de sistemas operativos. Tampoco abras un módulo que
no hayas ensayado.

### 3.6 El valor (30–33 min) — opcional pero poderoso

En Informes → Valor y metas, pregúntale:

> "¿Cuánto vale para Hogar y Moda un cliente que escribe por WhatsApp
> preguntando por crédito? No la venta: solo el contacto."

Escribe **su** número (por ejemplo $10.000) y vuelve al Resumen: la tarjeta
"Valor estimado generado" ahora está en sus términos. Remata:

> "Con tu propio número, esto es lo que el piloto tendría que demostrar."

Si dice un número muy alto, no lo corrijas: anótalo.

### 3.7 La propuesta (33–40 min)

Entrega la propuesta impresa y ve directo a la página del piloto:

- **Kit por sede:** hablador carta en caja (reseña + asesor de crédito/cuota +
  promociones) y media carta en la entrada (crédito por WhatsApp).
- **Piloto:** 6 sedes, 90 días. Implementación **$249.900 por sede** (en vez de
  $279.800), plataforma **$34.900 por sede al mes**, **primer mes sin costo**.
  **Total del piloto: $1.918.200.**
- **Garantía:** si al día 60 las sedes del piloto no subieron sus reseñas en
  Google, las mensualidades del piloto no se cobran.
- **Después del piloto** (solo para que sepa que el camino existe):
  Opción A $199.900 por sede + $19.900 al mes; Opción B $44.900 por sede al mes
  todo incluido, sin inversión inicial.

**Cómo decir el precio:** léelo de la hoja, con voz normal, y **quédate
callado**. El silencio no es un "no". El primero que habla después del precio
suele ceder; que no seas tú.

### 3.8 El cierre (40–45 min)

> "Te propongo esto: elegimos juntos las 6 sedes, incluida Junín. Me das una
> persona de contacto y en 8 días hábiles está instalado. A los 90 días te
> entrego el antes y el después de cada sede con tus propios números. Si no
> funciona, no seguimos. ¿Qué sedes pondrías?"

Termina con una **pregunta de elección** ("¿qué sedes?"), no con una de sí/no
("¿te interesa?").

Si dice que lo tiene que pensar o consultar:

> "Claro. ¿Qué necesitarías ver para decidir? ¿Y con quién lo hablarías? Si
> quieres, lo presento yo mismo en una próxima reunión; ¿el martes te sirve?"

Sal con **fecha**, aunque no sea un sí.

---

## 4. Objeciones: respuestas listas

**"Es caro."**
> "Son $34.900 al mes por sede: menos de lo que vale una venta pequeña a
> crédito. Si una sola sede consigue un cliente más al mes, ya se pagó. Y en el
> piloto, si no suben las reseñas, no pagas las mensualidades."
No bajes el precio por pedirlo. Si hay que ceder, **cambia algo a cambio**:
más sedes, contrato más largo o permiso para usar el caso como referencia.

**"Ya tenemos códigos QR."**
> "Un QR normal lleva siempre al mismo sitio y no mide nada. Este se puede
> cambiar sin reimprimir, te dice qué sede y qué punto funciona, y te avisa si
> una sede deja de usarlo. Además funciona tocando, sin abrir la cámara."

**"Los empleados no lo van a ofrecer."**
> "Por eso el panel muestra sede por sede: si una no lo usa, se ve el mismo día
> y llega una alerta. Y el hablador hace la mitad del trabajo: está en la caja,
> donde el cliente espera mientras le facturan o le estudian el crédito."

**"El cliente no sabe qué es NFC."**
> "No tiene que saberlo: acerca el celular o escanea el QR, las dos opciones
> están en el hablador. Y medimos cuántos usan cada una."

**"¿Las reseñas son reales? ¿Esto no es comprar reseñas?"**
> "Son reales, de clientes reales. Solo hacemos fácil que dejen la suya. No
> compramos, no inventamos y no filtramos: Google lo prohíbe y protege tu
> ficha."

**"¿Y si llegan reseñas malas?"**
> "Pueden llegar, y eso también es información. Pero los datos muestran que el
> cliente contento es mayoría: el problema hoy es que no habla. Además, con la
> encuesta interna te enteras de un problema antes de que llegue a Google."

**"¿Qué pasa si dejamos de pagar o si tú desapareces?"**
> "Las tarjetas y habladores siguen llevando a su destino; solo se deja de ver el
> panel. Nunca quedan rotos en la tienda. Y si el servidor fallara, tengo un plan
> de contingencia para que los puntos sigan funcionando."

**"¿Qué datos guardan de nuestros clientes?" (Habeas Data, Ley 1581)**
> "Ninguno personal: no pedimos nombre, cédula ni teléfono. Solo registramos la
> interacción (sede, punto, hora, tipo de celular). La encuesta es anónima."

**"¿Por qué no lo hacemos nosotros mismos?"**
> "Pueden imprimir un QR, sí. Lo que no tienen es la medición sede por sede, el
> cambio de destino en un clic, las alertas y el informe mensual con qué hacer.
> Eso es lo que construí y lo que te ahorro."

**"¿Cuánto se demora la instalación?"**
> "8 días hábiles desde que apruebas: diseño, configuración por sede e
> instalación. Tu equipo no tiene que hacer nada técnico."

**"¿Se conecta con nuestro WhatsApp de crédito?"**
> "Sí: el punto lleva al WhatsApp que ustedes usen, de la empresa o de cada
> sede, con un mensaje que dice de qué sede viene el cliente."

**"Déjame hablarlo con mi papá / con los socios."**
> "Perfecto. ¿Quieres que te deje la propuesta y lo presentamos juntos? Así
> respondo yo las preguntas técnicas. ¿Qué día les queda bien?"

**"Hagámoslo gratis primero, somos familia."**
> "Precisamente porque somos familia quiero que salga bien: un piloto pagado nos
> compromete a los dos a medirlo en serio. Por eso puse la garantía: si no
> funciona, no pagas las mensualidades."

**"¿Y esto lo tiene otra empresa?"**
> "Hay herramientas de QR y de reseñas por separado. Lo que hago distinto es
> juntarlo en tu tienda física, medir cada sede y decirte qué hacer con eso."

---

## 5. Lo que NO debes hacer

- **No prometas un número exacto de reseñas** ("van a llegar 500"). Promete
  medir y mostrar el antes y el después.
- **No hables de tecnología** (servidores, Redis, código). Habla de clientes,
  sedes y ventas.
- **No critiques a su equipo** ni la atención de una sede: el problema es el
  volumen de reseñas, no la gente.
- **No hagas pasar los datos de la demo por reales.**
- **No improvises descuentos.** Si te piden rebaja, "lo reviso y te confirmo
  hoy mismo por escrito".
- **No ofrezcas funciones que aún no están listas** como si lo estuvieran: los
  avisos por WhatsApp todavía necesitan la cuenta de Twilio. Di "en camino".
- **No llenes los silencios** después del precio.

---

## 6. Después de la reunión

- **El mismo día**, por WhatsApp o correo: un resumen corto con lo que
  acordaron, sus palabras ("me dijiste que Junín te preocupa…"), la propuesta en
  PDF y el próximo paso con fecha.
- Si dijo que sí: crear sus 6 sedes y puntos en el panel, programar el informe
  semanal a su correo, activar el aviso de sede sin actividad, diseñar los
  habladores con los QR reales (descargados del panel, `?s=q`) y grabar los
  chips con su enlace (`?s=n`).
- Si quedó una segunda reunión: prepara la presentación para quien decide con
  sus respuestas a las preguntas de la sección 3.2.
- Anota qué preguntas te hizo que no tenías preparadas: son oro para la próxima.

---

## 7. Mentalidad

- Llegas desde la **fuerza**: producto funcionando, clientes reales, un caso
  medido y un diagnóstico de su propia empresa que nadie más le ha traído.
- Él no te está haciendo un favor: tú le estás mostrando una oportunidad que su
  competencia ya está aprovechando.
- Si algo falla en la demo, sonríe y di "por eso existe el piloto". Nadie compra
  por una demo perfecta; compran por confianza.
- Respira antes del precio. Dilo y calla.
