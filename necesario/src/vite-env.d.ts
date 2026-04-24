/// <reference types="vite/client" />

declare global {
  interface ElectronAPI {
    apiRequest: (options: {
      method: "GET" | "POST" | "PATCH" | "DELETE";
      path: string;
      body?: any;
      headers?: Record<string, string>;
    }) => Promise<any>;
  }

  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
