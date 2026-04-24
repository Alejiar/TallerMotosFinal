# Solución: Código QR se queda cargando en WhatsApp

## Problema
El código QR de WhatsApp no se genera o se queda cargando infinitamente.

## Causas posibles
1. **Baileys es inestable** - La librería de reverse engineering puede fallar
2. **Timeout de conexión** - La conexión tarda más de 60 segundos
3. **API no configurada** - Falta configurar la API de WhatsApp

## Soluciones aplicadas

### 1. ✅ Timeout de seguridad
Se agregó un timeout de 60 segundos en `whatsapp-service.mjs`. Si el QR no se genera en ese tiempo, automáticamente se detiene el proceso y muestra un error.

**Código en whatsapp-service.mjs:**
```javascript
function setConnectionTimeout() {
  clearTimeout(connectionTimeout);
  connectionTimeout = setTimeout(() => {
    console.warn("[WA] Timeout: No se generó QR en 60 segundos");
    if (waStatus === "loading") {
      waStatus = "disconnected";
      qrDataUrl = null;
      // ... cleanup
    }
  }, 60000);
}
```

### 2. ✅ Mejor UI con feedback visual
Se mejoró `WhatsApp.tsx` para mostrar:
- Contador de tiempo durante la carga
- Mensaje de error claro si falla
- Botón para reintentar
- Estados más descriptivos

### 3. ✅ Better error handling
Todos los errores ahora se registran en logs y se devuelven mensajes claros al frontend.

---

## Si quieres usar una API externa (Recomendado)

### Opción A: Usar tu API de WhatsApp (Sisiema, Twilio, etc)

**Paso 1:** Obtén tus credenciales de API
- API Key
- API Endpoint (URL base)
- Phone Number (si es requerido)

**Paso 2:** Define variables de entorno en tu archivo `.env` o `.env.local`:
```bash
WA_PROVIDER=external
WA_API_TYPE=sisiema
WA_API_KEY=tu_api_key_aqui
WA_API_ENDPOINT=https://api.tuservicio.com/v1
WA_PHONE_NUMBER=+34612345678
```

**Paso 3:** Crea un nuevo archivo `whatsapp-external.mjs`:
```javascript
// Este archivo maneja APIs externas de WhatsApp
export async function initWhatsAppExternal() {
  const { externalApiConfig, validateExternalApiConfig } = await import("./whatsapp-config.mjs");
  
  validateExternalApiConfig();
  
  // TODO: Implementar según documentación de tu API
  // Ejemplo para Sisiema:
  /*
  const response = await fetch(`${externalApiConfig.apiEndpoint}/qr/generate`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${externalApiConfig.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      phone: externalApiConfig.phoneNumber
    })
  });
  
  const data = await response.json();
  return data.qrCode; // URL o data URL del QR
  */
}

export async function sendMessageExternal(phone, message) {
  // Implementar según tu API
  const { externalApiConfig } = await import("./whatsapp-config.mjs");
  
  // Ejemplo:
  /*
  await fetch(`${externalApiConfig.apiEndpoint}/messages/send`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${externalApiConfig.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: phone,
      message: message
    })
  });
  */
}
```

---

## Para depuración

### Ver logs del servidor
Ejecuta el backend con debug:
```bash
# En terminal
npm run dev
# O
node backend/server.mjs
```

### Logs esperados
```
[Server] Iniciando WhatsApp...
[WA] QR generado correctamente
[Server] Status: qr
```

### Si ves estos logs, significa que falla:
```
[WA] Timeout: No se generó QR en 60 segundos
[WA] Error en connect(): ...
```

---

## Próximos pasos

1. ✅ El timeout y UI mejorada ya están aplicados
2. ⏳ Si quieres usar una API externa:
   - Proporciona los detalles de la API
   - Documentación o ejemplos de endpoints
   - Credenciales de test
3. 📝 Yo integraré la API externa en `whatsapp-external.mjs`

---

## Archivos modificados
- `backend/whatsapp-service.mjs` - Timeout + mejor error handling
- `src/pages/WhatsApp.tsx` - UI mejorada + contador de tiempo
- `backend/server.mjs` - Logs mejorados
- `backend/whatsapp-config.mjs` - Nuevo archivo de configuración
