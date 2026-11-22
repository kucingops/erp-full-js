"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthUser, TokenResponse } from "./types";

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  setSession: (session: TokenResponse) => void;
  clear: () => void;
}

/**
 * Sesi login disimpan di localStorage (zustand persist).
 * Trade-off: simpel untuk SPA dashboard; versi lebih aman = refresh token di httpOnly cookie.
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      hydrated: false,
      setSession: ({ accessToken, refreshToken, user }) =>
        set({ accessToken, refreshToken, user }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: "erp-auth",
      partialize: ({ accessToken, refreshToken, user }) => ({
        accessToken,
        refreshToken,
        user,
      }),
    },
  ),
);

// Tandai `hydrated` setelah zustand selesai baca localStorage.
// Catatan: jangan pakai `onRehydrateStorage: () => () => useAuthStore.setState(...)`:
// localStorage itu sinkron, jadi callback-nya jalan *di dalam* create() saat
// `useAuthStore` belum ter-assign (TDZ) → error tertelan dan hydrated tetap false
// (AuthGuard nyangkut di skeleton). `persist` tidak ada saat SSR, makanya pakai `?.`.
useAuthStore.persist?.onFinishHydration(() => useAuthStore.setState({ hydrated: true }));
if (useAuthStore.persist?.hasHydrated()) useAuthStore.setState({ hydrated: true });
