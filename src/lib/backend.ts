export type BackendMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface BackendRequestOptions {
  method: BackendMethod;
  path: string;
  body?: any;
  headers?: Record<string, string>;
}

function normalizePath(path: string) {
  if (path.startsWith("/api")) return path;
  return path.startsWith("/") ? `/api${path}` : `/api/${path}`;
}

async function browserFetch(options: BackendRequestOptions) {
  const normalizedPath = normalizePath(options.path);
  const response = await fetch(`http://localhost:3000${normalizedPath}`, {
    method: options.method,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
    body: options.body != null ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Backend request failed: ${response.status}`);
  }
  return response.status === 204 ? null : response.json();
}

export async function backendRequest(options: BackendRequestOptions) {
  const normalizedPath = normalizePath(options.path);
  if (typeof window !== "undefined" && (window as any).electronAPI?.apiRequest) {
    const result = await (window as any).electronAPI.apiRequest({
      method: options.method,
      path: normalizedPath,
      body: options.body,
      headers: options.headers,
    });
    if (result && result.error) {
      throw new Error(result.error);
    }
    return result;
  }
  return browserFetch({ ...options, path: normalizedPath });
}

export async function backendGet(path: string) {
  return backendRequest({ method: "GET", path });
}

export async function backendPost(path: string, body: any) {
  return backendRequest({ method: "POST", path, body });
}

export async function backendPatch(path: string, body: any) {
  return backendRequest({ method: "PATCH", path, body });
}

export async function backendDelete(path: string) {
  return backendRequest({ method: "DELETE", path });
}
