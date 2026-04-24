// Configuración para proveedores de WhatsApp alternativos
// Este archivo permite cambiar entre diferentes APIs de WhatsApp

export const WA_PROVIDERS = {
  BAILEYS: "baileys", // Usa Baileys (reverse engineering)
  EXTERNAL_API: "external", // API externa (sisiema, Twilio, etc)
};

// Proveedor activo (cambia aquí para usar una API diferente)
export let activeProvider = process.env.WA_PROVIDER || WA_PROVIDERS.BAILEYS;

// Configuración de API externa
export const externalApiConfig = {
  type: process.env.WA_API_TYPE || "sisiema", // sisiema, twilio, etc
  apiKey: process.env.WA_API_KEY || null,
  apiSecret: process.env.WA_API_SECRET || null,
  apiEndpoint: process.env.WA_API_ENDPOINT || null,
  phoneNumber: process.env.WA_PHONE_NUMBER || null,
};

export function setProvider(provider) {
  if (!Object.values(WA_PROVIDERS).includes(provider)) {
    throw new Error(`Proveedor inválido. Usa: ${Object.values(WA_PROVIDERS).join(", ")}`);
  }
  activeProvider = provider;
  console.log(`[WA Config] Proveedor cambiado a: ${provider}`);
}

export function validateExternalApiConfig() {
  if (!externalApiConfig.apiKey) {
    throw new Error("API Key no configurada. Define WA_API_KEY");
  }
  if (!externalApiConfig.apiEndpoint) {
    throw new Error("API Endpoint no configurado. Define WA_API_ENDPOINT");
  }
  return true;
}

export function getActiveProvider() {
  return activeProvider;
}
