"use client";

import { useAuthStore } from "./auth-store";
import type { TokenResponse } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Query;
  /** default true: kirim Authorization header */
  auth?: boolean;
}

function buildUrl(path: string, query?: Query) {
  const url = new URL(API_URL + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  }
  return url.toString();
}

// Single-flight: kalau beberapa request 401 bareng, refresh cukup sekali.
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  const { refreshToken, setSession, clear } = useAuthStore.getState();
  if (!refreshToken) return false;
  refreshing ??= fetch(buildUrl("/auth/refresh"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  })
    .then(async (res) => {
      if (!res.ok) {
        clear();
        return false;
      }
      setSession((await res.json()) as TokenResponse);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/**
 * Wrapper fetch ke backend. Semua pemanggilan API lewat sini.
 * - otomatis pasang Bearer token
 * - kalau 401, coba refresh token sekali lalu ulangi request
 * - error dilempar sebagai ApiError dengan pesan dari backend
 */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, opts);
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => undefined);
  if (!res.ok) throw toApiError(res, data);
  return data as T;
}

/**
 * Sama seperti api(), tapi hasilnya Blob (untuk download file, misal export laporan).
 * Error tetap dilempar sebagai ApiError dengan pesan dari backend.
 */
export async function apiBlob(path: string, opts: RequestOptions = {}): Promise<Blob> {
  const res = await send(path, opts);
  if (!res.ok) throw toApiError(res, await res.json().catch(() => undefined));
  return res.blob();
}

function toApiError(res: Response, data: unknown) {
  const msg = (data as { message?: string | string[] } | undefined)?.message;
  return new ApiError(
    res.status,
    Array.isArray(msg) ? msg.join(", ") : (msg ?? res.statusText),
    data,
  );
}

/** Kirim request dengan Bearer token; kalau 401, refresh sekali lalu ulangi. */
async function send(path: string, opts: RequestOptions): Promise<Response> {
  const { method = "GET", body, query, auth = true } = opts;

  const doFetch = () => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const token = useAuthStore.getState().accessToken;
    if (auth && token) headers.Authorization = `Bearer ${token}`;
    return fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let res = await doFetch();
  if (res.status === 401 && auth && (await refreshSession())) {
    res = await doFetch();
  }
  return res;
}
