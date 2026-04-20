"use client";
import { useState, useCallback } from "react";
import { apiFetch } from "@/lib/api";

export function useAuth() {
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== "undefined" ? localStorage.getItem("pulp_token") : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAuthenticated = !!token;

  const login = useCallback(async (password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.detail || "Login failed");
      }
      const data = await res.json();
      localStorage.setItem("pulp_token", data.token);
      setToken(data.token);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Login failed";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("pulp_token");
    setToken(null);
  }, []);

  return { isAuthenticated, login, logout, loading, error };
}
