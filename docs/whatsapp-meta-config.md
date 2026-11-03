# Verificación de WhatsApp — configuración en Meta

Módulo 1.6. La verificación está implementada y probada; lo que falta es que
Meta acepte el webhook. Sin esto, el flujo corre contra el simulador.

## Antes de empezar

El número de la plataforma **no puede estar en uso en la app de WhatsApp
común**. Un número con sesión abierta en un teléfono no puede recibir la
dedicación que exige la Cloud API. Se necesita un número con SIM que no tenga
WhatsApp instalado.

Es gratis para pruebas, pero tiene límites: el número de prueba solo puede
hablar con destinatarios que hayan dado su consentimiento, y los mensajes salen
etiquetados como no leídos. Para producción hay que completar el "Business
Verification" de Meta, que pide documentación de la empresa y tarda días.

## Pasos

### 1. Crear la app

1. [developers.facebook.com](https://developers.facebook.com) → **Apps** →
   **Create App**.
2. Tipo de app: **Business**.
3. Agregar el producto **WhatsApp**.

### 2. Configurar el número

En el panel de WhatsApp → **Getting Started**:

1. **Phone number ID** → va en `WHATSAPP_PLATFORM_PHONE_ID`.
2. El número con formato internacional sin signos → `WHATSAPP_PLATFORM_NUMBER`.
3. **Temporary access token** sirve 24 h y alcanza para desarrollo. Para
   producción, token permanente: un usuario del *Business Manager* con la
   casilla "System User" marcada, en **WhatsApp → Business Accounts → tu cuenta
   → Users → Add user**.

> El token permanente empieza con `EAA`. Ese prefijo es lo que usa
> `src/lib/whatsapp/index.ts` para decidir entre el proveedor real y el mock:
> sin `EAA` **siempre** usa el mock, aunque las variables estén llenas.

### 3. Suscribir el webhook

1. En **Configuration → Webhooks**, editar.
2. **Callback URL**: `https://TU-DOMINIO/api/webhooks/whatsapp`.
   - Tiene que ser HTTPS. Meta no acepta localhost.
   - Para probar sin deploy, usar un túnel (ngrok / Cloudflare Tunnel) y poner
     la URL pública del túnel.
3. **Verify token**: un string inventado por nosotros, el mismo en Meta y en
   `WHATSAPP_VERIFY_TOKEN`. Meta manda un GET de comprobación al guardar la
   URL; si el token no coincide, devuelve 403.
4. Suscribirse al campo **`messages`**. Es el único que hace falta para la
   verificación.

El mismo `WHATSAPP_VERIFY_TOKEN` es la única defensa de la URL: cualquiera que
lo conozca puede leer el `challenge`, y con eso apuntar su webhook a nuestra
ruta. Es como un password, no como un identificador.

### 4. App Secret

**Settings → Basic → App Secret → Show**. Va en `WHATSAPP_APP_SECRET`.

Es lo que valida `X-Hub-Signature-256`. **Sin este valor la ruta rechaza todos
los POST con 401.** Si está vacío en producción, la verificación no funciona y
el error es silencioso del lado del profesional: pide código, lo manda y no pasa
nada.

### 5. Permisos de la app

Con el token permanente hace falta `whatsapp_business_messaging`. Agregarlo en
**App Review → Permissions and Features**. En una app en modo desarrollo ya
está incluido; en producción hay que pedirlo explícitamente.

## Probar sin número real

En desarrollo el flujo se prueba entero contra el simulador, que corre el mismo
servicio que el webhook:

```bash
npm run dev
```

1. Entrar a `/panel/whatsapp` y generar un código.
2. En otra terminal:

```bash
curl -X POST http://localhost:3000/api/dev/whatsapp-simulate \
  -H 'Content-Type: application/json' \
  -d '{"from":"5493814123456","text":"Código: ABC123"}'
```

El código va en el `text` y el `from` es el número que se cargó en el panel.
La pantalla se actualiza sola en 3 segundos.

`/api/dev/whatsapp-simulate` devuelve 404 en producción.

## Checklist

- [ ] Número dedicado, sin WhatsApp en el teléfono
- [ ] `WHATSAPP_PLATFORM_NUMBER` con E.164 sin signos
- [ ] `WHATSAPP_PLATFORM_PHONE_ID`
- [ ] `WHATSAPP_ACCESS_TOKEN` con prefijo `EAA` (permanente)
- [ ] `WHATSAPP_APP_SECRET` (imprescindible para validar la firma)
- [ ] `WHATSAPP_VERIFY_TOKEN` inventado y no vacío
- [ ] Callback URL HTTPS apuntando a `/api/webhooks/whatsapp`
- [ ] Suscrito al campo `messages`
- [ ] Permiso `whatsapp_business_messaging`
- [ ] `PHONE_HASH_PEPPER` generado y guardado (no cambiar después)
- [ ] Probado con `curl` contra el simulador