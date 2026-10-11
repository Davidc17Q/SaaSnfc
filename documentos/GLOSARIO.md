# Glosario técnico de NFCloud — explicado desde cero

Este documento explica, en lenguaje sencillo, los términos técnicos que aparecen en el
documento de arquitectura (`ARCHITECTURE.md` / el PDF). La idea es que puedas leer la
arquitectura y entender cada palabra. Cada término trae: **qué es**, **una analogía** y
**cómo se usa en NFCloud concretamente**.

> Consejo de lectura: no intentes memorizar. Lee la analogía, mira el ejemplo en NFCloud,
> y vuelve aquí cuando te topes con la palabra en el código.

---

## 1. Conceptos generales

### SaaS (Software as a Service)
**Qué es:** software que se usa por internet mediante una suscripción, sin instalar nada en
tu computador. El proveedor se encarga de los servidores, actualizaciones y respaldos.
**Analogía:** como Netflix. No compras ni instalas las películas; pagas y las ves por internet.
**En NFCloud:** tus clientes entran al panel desde el navegador y pagan por usarlo. No instalan
un programa.

### B2B (Business to Business)
**Qué es:** un negocio que le vende a otros negocios (no al consumidor final).
**Analogía:** un mayorista que le vende a tiendas, no a la persona de la calle.
**En NFCloud:** tus clientes son empresas (ej. "Hogar y Moda"), no personas individuales.

### Multi-tenant (multi-empresa / multi-inquilino)
**Qué es:** un mismo sistema que atiende a muchos clientes a la vez, pero manteniendo los
datos de cada uno separados y aislados.
**Analogía:** un edificio de apartamentos. Todos comparten la estructura (ascensor, tuberías),
pero cada familia tiene su apartamento con llave propia y no puede entrar al de otro.
**En NFCloud:** cada empresa (tenant) ve solo sus sedes, dispositivos y escaneos. Un
`company_admin` nunca puede ver datos de otra empresa.

### Frontend
**Qué es:** la parte del software que el usuario ve y toca: botones, gráficos, formularios.
Corre en el navegador.
**Analogía:** el salón de un restaurante: las mesas, el menú, lo que ve el cliente.
**En NFCloud:** todo lo que está en la carpeta `public/` (el dashboard, los gráficos, el login).

### Backend
**Qué es:** la parte que el usuario no ve: procesa datos, aplica reglas, habla con la base de
datos. Corre en un servidor.
**Analogía:** la cocina del restaurante: nadie la ve, pero ahí se prepara todo.
**En NFCloud:** la carpeta `src/` (el servidor que decide a dónde redirigir y guarda escaneos).

---

## 2. Herramientas de desarrollo

### Empaquetador (bundler)
**Qué es:** una herramienta que toma muchos archivos de código y los combina/optimiza en
pocos archivos listos para el navegador. Ejemplos: Webpack, Vite, esbuild.
**Analogía:** hacer una maleta. En vez de llevar 50 prendas sueltas, las empacas ordenadas
en una sola maleta para viajar más fácil.
**En NFCloud:** **NO se usa empaquetador.** El documento dice "Frontend sin build step": los
archivos JavaScript se sirven tal cual, sin empaquetar. Esto simplifica el despliegue.

### Build step (paso de construcción / compilación)
**Qué es:** un proceso que transforma tu código antes de publicarlo (lo compila, lo empaqueta,
lo minifica). Un proyecto "sin build step" se publica tal como se escribe.
**Analogía:** cocinar antes de servir. Un plato "sin cocción" (como una ensalada) se sirve
directo; otros requieren horno antes.
**En NFCloud:** el frontend no tiene build step (archivos directos), pero el backend sí: el
TypeScript se compila a JavaScript con `tsc` (ver más abajo).

### Framework
**Qué es:** un conjunto de herramientas y reglas que te dan una estructura base para construir
software más rápido. Ejemplos: React, Angular, Vue (frontend); Fastify, Express (backend).
**Analogía:** un kit prefabricado para armar un mueble: ya trae las piezas y las instrucciones,
no partes de cero cortando la madera.
**En NFCloud:** el frontend es "sin framework" (JavaScript puro, llamado "vanilla"). El backend
sí usa un framework: **Fastify**.

### Vanilla (JavaScript vanilla)
**Qué es:** JavaScript "puro", sin ninguna librería ni framework encima.
**Analogía:** helado de vainilla sin ningún topping: lo básico, sin añadidos.
**En NFCloud:** el `app.js` del dashboard está escrito en JavaScript vanilla.

### Librería (library)
**Qué es:** código ya hecho por otros que tú reutilizas para no reinventar la rueda.
**Analogía:** comprar los ladrillos ya fabricados en vez de hacerlos tú mismo.
**En NFCloud:** Chart.js (gráficos), qrcode-generator (códigos QR), Lucide (iconos).

---

## 3. Lenguajes y entornos

### Node.js
**Qué es:** un entorno que permite ejecutar JavaScript fuera del navegador, por ejemplo en un
servidor.
**Analogía:** normalmente el "idioma" JavaScript solo lo entendía el navegador; Node.js es como
darle a ese idioma la capacidad de hablarse también en la cocina (el servidor).
**En NFCloud:** el backend corre sobre Node.js.

### TypeScript
**Qué es:** JavaScript con "tipos" añadidos. Los tipos avisan de errores antes de ejecutar
(ej. "esto debía ser un número, no un texto"). Luego se compila a JavaScript normal.
**Analogía:** escribir con corrector ortográfico y gramatical activado: te marca errores
mientras escribes, en vez de descubrirlos cuando ya enviaste la carta.
**En NFCloud:** todo el backend (`src/`) está en TypeScript.

### tsc (TypeScript Compiler)
**Qué es:** el programa que convierte TypeScript en JavaScript ejecutable.
**Analogía:** un traductor que pasa tu texto del idioma "TypeScript" al idioma "JavaScript"
que la máquina entiende.
**En NFCloud:** `npm run build` ejecuta `tsc` y genera la carpeta `dist/` con el código traducido.

### Fastify
**Qué es:** un framework de backend para Node.js, enfocado en velocidad. Maneja las peticiones
web (quién pide qué y qué se responde).
**Analogía:** el jefe de meseros que recibe cada pedido, lo manda a la cocina correcta y trae
la respuesta.
**En NFCloud:** recibe cada visita (ej. `/r/<uuid>` o `/api/kpis`) y decide qué hacer.

---

## 4. Bases de datos y almacenamiento

### Base de datos
**Qué es:** un sistema para guardar información de forma organizada y poder consultarla.
**Analogía:** un archivador gigante con carpetas etiquetadas donde todo queda guardado y
se puede buscar.
**En NFCloud:** guarda empresas, sedes, dispositivos y escaneos.

### PostgreSQL (Postgres)
**Qué es:** una base de datos relacional (organiza los datos en tablas con filas y columnas, y
relaciones entre ellas). Es robusta y confiable.
**Analogía:** una hoja de cálculo muy potente y conectada: una tabla de "sedes" se relaciona
con otra de "dispositivos".
**En NFCloud:** es "la verdad" del sistema: el almacén definitivo de todos los datos.

### Redis
**Qué es:** un almacén de datos en memoria (RAM), ultrarrápido, usado como caché.
**Analogía:** una libreta de notas rápidas que tienes en el bolsillo para lo que consultas
muy seguido, en vez de ir al archivador grande cada vez.
**En NFCloud:** guarda temporalmente a dónde redirige cada tarjeta, para responder en
milisegundos. Si Redis no tiene el dato, se consulta a Postgres.

### Caché
**Qué es:** una copia temporal de datos que se consultan mucho, para no recalcularlos o
re-buscarlos cada vez.
**Analogía:** memorizar el teléfono de tu casa en vez de buscar la agenda cada vez.
**En NFCloud:** Redis cachea la info de cada dispositivo durante 1 hora.

### Pool (de conexiones)
**Qué es:** un conjunto de conexiones a la base de datos ya abiertas y reutilizables, para no
abrir una nueva cada vez (abrir conexiones es lento).
**Analogía:** tener varias cajas abiertas en un supermercado en vez de abrir y cerrar una caja
por cada cliente.
**En NFCloud:** `src/db/pool.ts` administra ese grupo de conexiones a Postgres.

### Esquema (schema)
**Qué es:** la definición de cómo está organizada la base de datos: qué tablas existen, qué
columnas tiene cada una y de qué tipo.
**Analogía:** el plano de un edificio: define cuántos pisos, cuántas habitaciones y de qué tipo.
**En NFCloud:** `src/db/schema.sql` define las tablas (companies, users, locations, etc.).

### Migración (migration)
**Qué es:** un cambio controlado en la estructura de la base de datos (crear tabla, añadir
columna). Se aplica de forma ordenada y repetible.
**Analogía:** una remodelación de la casa siguiendo un plano actualizado, sin tirar lo que ya
funciona.
**En NFCloud:** `npm run migrate` aplica el esquema. Es "idempotente" (ver abajo).

### Idempotente
**Qué es:** una operación que puedes ejecutar muchas veces y el resultado es el mismo que
ejecutarla una vez (no causa daño repetirla).
**Analogía:** el botón de "piso 3" en el ascensor: lo aprietes una o cinco veces, vas al piso 3.
**En NFCloud:** las migraciones usan `CREATE TABLE IF NOT EXISTS`, así que correrlas de nuevo
no rompe nada.

### SQL
**Qué es:** el lenguaje para consultar y modificar bases de datos relacionales.
**Analogía:** el idioma con el que le pides cosas al archivador: "tráeme todas las sedes de
Medellín".
**En NFCloud:** se usa en todas las consultas del backend (`SELECT ... FROM locations ...`).

### Índice (index)
**Qué es:** una estructura que acelera las búsquedas en una tabla, a costa de un poco más de
espacio.
**Analogía:** el índice alfabético al final de un libro: en vez de leer todo, vas directo a la
página.
**En NFCloud:** hay índices por `location_id`, `scanned_at`, etc., para que los reportes sean
rápidos.

---

## 5. Web, redirección y seguridad

### URL
**Qué es:** la dirección de un recurso en internet (ej. `https://midominio.com/r/123`).
**Analogía:** la dirección postal de una casa.
**En NFCloud:** la tarjeta NFC guarda una URL del servidor, no el destino final.

### UUID (identificador único universal)
**Qué es:** un código largo y único que identifica algo sin repetirse (ej.
`550e8400-e29b-41d4-a716-446655440000`).
**Analogía:** la cédula o número de identidad: único para cada persona.
**En NFCloud:** cada dispositivo NFC tiene un UUID; es lo que va grabado en la tarjeta.

### Redirección (redirect) y el código 302
**Qué es:** cuando un servidor responde "no estoy aquí, ve a esta otra dirección". El 302 es el
código que significa "redirección temporal".
**Analogía:** un cartel en una tienda cerrada que dice "nos mudamos, ve a la esquina".
**En NFCloud:** al escanear una tarjeta, el servidor responde 302 y manda al navegador al
destino real (WhatsApp, Instagram, etc.).

### HTTP / endpoint / ruta (route)
**Qué es:** HTTP es el protocolo de comunicación de la web. Un *endpoint* o *ruta* es una
dirección específica del servidor que hace algo (ej. `/api/kpis` devuelve las métricas).
**Analogía:** las distintas ventanillas de una oficina: una para pagos, otra para reclamos.
**En NFCloud:** `/r/:deviceId` redirige; `/api/locations` lista sedes; etc.

### API (Interfaz de Programación de Aplicaciones)
**Qué es:** el conjunto de endpoints que el frontend usa para pedirle datos o acciones al
backend.
**Analogía:** el menú de un restaurante: la lista de lo que puedes pedir y cómo pedirlo.
**En NFCloud:** `src/routes/api.ts` define toda la API del panel.

### Autenticación (auth)
**Qué es:** verificar quién eres (usuario y contraseña) para dejarte entrar.
**Analogía:** mostrar tu cédula en la entrada de un edificio.
**En NFCloud:** el login con usuario y contraseña.

### Autorización
**Qué es:** una vez identificado, decidir qué puedes hacer o ver.
**Analogía:** tu cédula te deja entrar al edificio (autenticación), pero tu tarjeta de acceso
solo abre tu piso (autorización).
**En NFCloud:** un `superadmin` ve todo; un `company_admin` solo su empresa.

### Cookie de sesión
**Qué es:** un pequeño dato que el navegador guarda tras iniciar sesión, para que el servidor
te reconozca en las siguientes peticiones sin pedirte la contraseña cada vez.
**Analogía:** la manilla que te ponen en un evento: te la ven y te dejan pasar sin volver a
revisar tu entrada.
**En NFCloud:** una cookie firmada guarda tu sesión (quién eres, tu rol, tu empresa).

### HMAC (firma)
**Qué es:** una técnica para firmar un dato con una clave secreta, de modo que si alguien lo
altera, la firma deja de coincidir y se detecta el fraude.
**Analogía:** un sello de cera en una carta antigua: si lo rompen, sabes que la abrieron.
**En NFCloud:** la cookie de sesión va firmada con HMAC para que nadie la falsifique.

### Hash de contraseña / scrypt
**Qué es:** transformar una contraseña en un código irreversible antes de guardarla, para que
ni el dueño del sistema vea la contraseña real. `scrypt` es un algoritmo para hacerlo de forma
segura. "Nunca se guarda en texto plano" significa que jamás se almacena tal cual la escribiste.
**Analogía:** triturar un documento: puedes verificar que un papel nuevo coincide con el
triturado, pero no puedes reconstruir el original desde los pedazos.
**En NFCloud:** las contraseñas se guardan con scrypt (`salt:hash`), nunca legibles.

### Salt
**Qué es:** un dato aleatorio que se añade a la contraseña antes de hacer el hash, para que dos
personas con la misma contraseña tengan hashes distintos.
**Analogía:** echarle una pizca distinta de sal a cada plato para que ningún par sea idéntico.
**En NFCloud:** cada contraseña hasheada incluye su salt.

### HTTPS
**Qué es:** la versión segura de HTTP: cifra la comunicación entre el navegador y el servidor.
**Analogía:** enviar una carta en un sobre sellado y blindado en vez de una postal que todos
pueden leer.
**En NFCloud:** se usa HTTPS en producción.

### Variables de entorno (.env)
**Qué es:** valores de configuración que viven fuera del código (claves, URLs de base de datos,
secretos). Así no quedan escritos en el código ni se suben a internet por error.
**Analogía:** las llaves de tu casa: no las dejas pegadas con cinta en la puerta; las guardas
aparte.
**En NFCloud:** el archivo `.env` guarda `DATABASE_URL`, `SESSION_SECRET`, etc. No se sube a Git.

---

## 6. Operación y despliegue

### Servidor
**Qué es:** un computador (normalmente en la nube) que está siempre encendido para atender
peticiones.
**Analogía:** la cocina de un restaurante que abre todos los días para atender pedidos.
**En NFCloud:** donde corre el backend de Node.js.

### Despliegue (deploy)
**Qué es:** poner tu aplicación en un servidor para que esté disponible en internet.
**Analogía:** inaugurar la tienda: pasar de tenerla armada en tu taller a abrirla al público.
**En NFCloud:** se despliega en Railway haciendo `git push`.

### Railway
**Qué es:** una plataforma en la nube que corre tu app, tu base de datos y tu Redis sin que tú
administres servidores manualmente.
**Analogía:** alquilar un local ya equipado con cocina, luz y agua, en vez de construirlo.
**En NFCloud:** aloja la app, Postgres y Redis en producción.

### Docker / Docker Compose
**Qué es:** Docker empaqueta un programa con todo lo que necesita para correr igual en
cualquier máquina. Docker Compose levanta varios de esos paquetes juntos con un comando.
**Analogía:** un contenedor de barco: lo que metes dentro viaja igual sin importar el barco.
**En NFCloud:** `docker-compose.yml` levanta Postgres y Redis en tu computador para desarrollo.

### Git / git push
**Qué es:** Git es el sistema que guarda el historial de cambios de tu código. `git push` sube
esos cambios al repositorio remoto.
**Analogía:** un "control de versiones" como el historial de Google Docs: puedes ver y volver a
cualquier versión anterior.
**En NFCloud:** cada cambio se guarda con Git; al hacer `git push`, Railway redespliega solo.

### Túnel (Cloudflare Tunnel / ngrok)
**Qué es:** una herramienta que expone temporalmente tu servidor local a internet, con una URL
pública, para hacer pruebas.
**Analogía:** tender un cable temporal desde tu casa hasta la calle para que alguien de afuera
pueda ver lo que tienes dentro, sin mudarte.
**En NFCloud:** sirve para probar los escaneos NFC reales contra tu máquina local.

---

## 7. Rendimiento y procesamiento asíncrono

### Latencia
**Qué es:** el tiempo que tarda una respuesta desde que la pides.
**Analogía:** cuánto se demora el mesero en traerte el agua desde que la pediste.
**En NFCloud:** la redirección busca latencia mínima (objetivo < 50 ms) usando Redis.

### Asíncrono / fire-and-forget
**Qué es:** hacer algo "en segundo plano" sin que el usuario tenga que esperar a que termine.
"Fire-and-forget" (dispara y olvida) es lanzar una tarea sin esperar su resultado.
**Analogía:** mandar la ropa a lavar y seguir con tu día; no te quedas parado frente a la
lavadora.
**En NFCloud:** primero redirige al usuario (rápido) y *después*, en segundo plano, registra el
escaneo. Así la persona no espera a que se guarde el dato.

### setImmediate
**Qué es:** una función de Node.js que programa una tarea para "justo después" de terminar lo
urgente.
**Analogía:** "esto lo hago apenas termine de atender al cliente que tengo enfrente".
**En NFCloud:** se usa para registrar el escaneo después de haber respondido la redirección.

### Anti-doble-conteo (deduplicación)
**Qué es:** evitar contar dos veces el mismo evento cuando ocurre repetido en poco tiempo.
**Analogía:** un torniquete que no te cuenta dos veces si pasas la tarjeta dos veces seguidas
por error.
**En NFCloud:** si el mismo dispositivo e IP escanean en menos de 30 segundos, el segundo no
se cuenta (para no inflar las métricas con recargas o pruebas).

### TTL (Time To Live / tiempo de vida)
**Qué es:** cuánto tiempo vive un dato antes de borrarse automáticamente.
**Analogía:** la fecha de vencimiento de un yogur: pasado ese tiempo, fuera.
**En NFCloud:** la caché de un dispositivo en Redis tiene un TTL de 3600 s (1 hora).

### Fallback (plan B)
**Qué es:** una alternativa a la que recurres si lo principal falla.
**Analogía:** si se va la luz, prendes velas.
**En NFCloud:** si Redis no responde, se consulta directamente a Postgres (el fallback).

---

## 8. Zona horaria y datos

### UTC
**Qué es:** la hora de referencia mundial, sin ajustes locales.
**Analogía:** el "meridiano cero" del tiempo: todos los relojes del mundo se miden respecto a él.
**En NFCloud:** los escaneos se guardan en UTC para que no haya ambigüedad.

### Zona horaria (timezone) / America/Bogota
**Qué es:** el ajuste horario de una región respecto a UTC.
**Analogía:** cada país pone su reloj a una hora distinta aunque el instante sea el mismo.
**En NFCloud:** los datos se guardan en UTC pero se *muestran* en hora de Bogotá
(`APP_TIMEZONE`), para que las métricas tengan sentido para el negocio local.

### timestamptz
**Qué es:** un tipo de dato de Postgres que guarda fecha y hora *con* zona horaria.
**Analogía:** una foto con la hora y el lugar marcados, no solo la hora suelta.
**En NFCloud:** la columna `scanned_at` usa `timestamptz`.

### JSON / JSONB
**Qué es:** JSON es un formato de texto para estructurar datos (listas, pares nombre-valor).
JSONB es la versión que Postgres guarda de forma optimizada.
**Analogía:** una ficha ordenada con campos: `{ nombre: "Ana", edad: 30 }`.
**En NFCloud:** la respuesta de la API viaja en JSON; el historial de cambios masivos se guarda
en una columna JSONB.

### Snapshot (instantánea)
**Qué es:** una copia del estado de algo en un momento dado, para poder volver a él.
**Analogía:** una foto antes de una remodelación, por si quieres dejar todo como estaba.
**En NFCloud:** antes de un cambio masivo de destinos, se guarda un snapshot para poder
revertirlo.

### Backfill
**Qué es:** rellenar datos que antes no existían, aplicándolos a registros ya guardados.
**Analogía:** una ley nueva que se aplica también a casos antiguos para ponerlos al día.
**En NFCloud:** al introducir el modelo multi-empresa, se hizo un backfill: se crearon empresas
a partir de las marcas existentes y se asignaron las sedes.

---

## 9. Términos que usamos al mejorar la interfaz

Estos no están en la arquitectura, pero los mencionamos al trabajar juntos.

### Accesibilidad (a11y)
**Qué es:** hacer que la aplicación sea usable por personas con discapacidad (visual, motriz).
"a11y" es una abreviatura: "a", luego 11 letras, luego "y".
**Analogía:** las rampas y el braille en un edificio: no todos las usan, pero quienes las
necesitan no quedan excluidos.
**En NFCloud:** añadimos `aria-label` (texto invisible que leen los lectores de pantalla) a los
botones de solo-icono.

### aria-label
**Qué es:** un atributo HTML con texto descriptivo para tecnologías de asistencia, que no se ve
en pantalla.
**Analogía:** una etiqueta en braille bajo un botón: invisible para la vista, útil al tacto.
**En NFCloud:** el botón del lápiz "dice" *Editar sede Hogar y Moda* a un lector de pantalla.

### Skeleton / loader (indicador de carga)
**Qué es:** una señal visual de que algo se está cargando (un brillo, un spinner).
**Analogía:** la rueda que gira mientras carga un video.
**En NFCloud:** un leve brillo recorre las tarjetas de gráficos mientras llegan los datos.

### Combobox
**Qué es:** un campo que combina un cuadro de texto (para buscar escribiendo) con una lista
desplegable de opciones.
**Analogía:** el buscador de Google que te va sugiriendo mientras escribes.
**En NFCloud:** el selector de sede al crear un dispositivo: escribes y filtra entre las 84 sedes.

### localStorage
**Qué es:** un espacio donde el navegador guarda datos pequeños de forma persistente (siguen
ahí aunque cierres la pestaña).
**Analogía:** un cajón de tu escritorio donde dejas notas que siguen ahí mañana.
**En NFCloud:** guarda tu preferencia de tema claro/oscuro.

---

*Documento de aprendizaje para el proyecto NFCloud. Si encuentras un término en el código o la
arquitectura que no esté aquí, pídelo y lo agregamos.*
