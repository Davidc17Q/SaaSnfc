# Avisos por WhatsApp (y SMS de respaldo) con Twilio

El código ya está listo (`src/lib/messaging.ts`). Solo falta crear la cuenta de
Twilio y poner 5 variables en Railway. Mientras no estén, los avisos siguen
saliendo por correo como hoy.

> Los precios y nombres de menú de Twilio cambian; si algo no coincide, busca
> el mismo nombre en la consola. Precios vigentes: twilio.com/pricing.

## Qué vas a necesitar

- Una tarjeta de crédito o débito internacional (Twilio cobra en dólares).
- Una cuenta de **Meta Business** (business.facebook.com). Si ya tienes página
  de Facebook de NFCloud, ya la tienes o la creas en 5 minutos.
- Un número de teléfono para WhatsApp que **no** esté usando la app de
  WhatsApp. Lo más fácil: comprar uno en Twilio (≈ 1,15 USD/mes, de EE. UU.).

## Costo aproximado

| Concepto | Precio aprox. |
|---|---|
| Número de Twilio (sirve para WhatsApp y SMS) | ≈ 1,15 USD/mes |
| Mensaje de WhatsApp (plantilla de "utilidad") a Colombia | ≈ 0,005 USD de Twilio + tarifa de Meta (muy baja en Colombia) |
| SMS a Colombia (solo si falla WhatsApp) | ≈ 0,05–0,10 USD |
| Recarga mínima para salir de la prueba | 20 USD (es saldo, no se pierde) |

Con 30 sedes y un par de avisos por semana, el gasto mensual es de centavos.

## Paso a paso

### 1. Crear la cuenta
1. Entra a **twilio.com/try-twilio**, regístrate y verifica tu correo y tu celular.
2. En la consola, **Admin → Account billing → Upgrade**: agrega la tarjeta y
   recarga 20 USD. Sin esto la cuenta queda en prueba y solo envía a números
   verificados, con el texto "Sent from your Twilio trial account".
3. En la página principal de la consola copia **Account SID** y **Auth Token**
   (el token es una contraseña: no lo pegues en chats ni en el código).

### 2. Probar en 5 minutos con el Sandbox (opcional pero recomendado)
1. **Messaging → Try it out → Send a WhatsApp message**.
2. Desde tu WhatsApp, envía el mensaje `join <palabra>` que te muestra al
   número **+1 415 523 8886**.
3. En Railway pon `TWILIO_WHATSAPP_FROM=+14155238886` (más el SID y el token)
   y prueba el aviso (paso 6). En el sandbox llega como texto libre a quien
   se unió, mientras su sesión siga abierta.

### 3. Número propio para WhatsApp
1. **Phone Numbers → Manage → Buy a number**: elige uno de EE. UU. que tenga
   **SMS** marcado. Te sirve para WhatsApp y para el SMS de respaldo.
2. **Messaging → Senders → WhatsApp senders → Create new sender**: elige ese
   número, conecta tu cuenta de Meta Business cuando te lo pida y pon como
   nombre visible **NFCloud**. Meta lo aprueba en minutos u horas (a veces días).

### 4. Plantilla del aviso (obligatoria para escribir primero)
WhatsApp no deja que una empresa escriba primero con texto libre: hace falta
una plantilla aprobada.

1. **Messaging → Content Template Builder → Create new**.
2. Nombre: `aviso_nfcloud` · Idioma: **Spanish** · Tipo: **Text**.
3. Texto (copia tal cual; las variables no pueden ir al inicio ni al final):

   ```
   Hola, este es un aviso de NFCloud para {{1}}: {{2}} Puedes revisarlo en el panel: {{3}} Gracias.
   ```

4. Valores de ejemplo que pide Meta: `{{1}}` = `Hogar y Moda`,
   `{{2}}` = `La sede Carepa lleva más de 2 días sin interacciones.`,
   `{{3}}` = `https://nfcloudco.com/`.
5. **Submit for WhatsApp approval** con categoría **Utility**.
6. Cuando diga *Approved*, copia su **Content SID** (empieza por `HX`).

### 5. SMS de respaldo
1. **Messaging → Settings → Geo permissions**: marca **Colombia** (y cualquier
   otro país donde tengas clientes). Sin esto los SMS se bloquean.
2. El número del paso 3 ya sirve para SMS.

### 6. Variables en Railway
En el servicio de NFCloud → **Variables**, agrega:

| Variable | Valor |
|---|---|
| `TWILIO_ACCOUNT_SID` | el Account SID (AC…) |
| `TWILIO_AUTH_TOKEN` | el Auth Token |
| `TWILIO_WHATSAPP_FROM` | el número del paso 3, ej. `+15551234567` |
| `TWILIO_WA_CONTENT_SID` | el Content SID de la plantilla (HX…) |
| `TWILIO_SMS_FROM` | el mismo número del paso 3 |

Railway redespliega solo. Desde ese momento:

### 7. Probar
1. Panel → **Informes → Avisos de sede sin actividad**.
2. Escribe el celular (ej. `300 123 4567`; si es de otro país, con `+`) y
   **Activar aviso**.
3. **Probar**: llega por WhatsApp; si WhatsApp falla, llega por SMS.

## Cómo funciona por dentro

- El worker horario revisa las sedes sin actividad (solo de 7 a. m. a 8 p. m.,
  hora de Colombia) y avisa una vez por episodio, igual que el correo.
- Cada aviso puede tener correo, celular o ambos.
- Orden de envío por celular: WhatsApp con la plantilla → si falla, SMS.
- Las empresas en plan Básico no reciben avisos (igual que antes).
