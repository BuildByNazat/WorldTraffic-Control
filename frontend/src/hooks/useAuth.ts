import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../config";

const AUTH_TOKEN_STORAGE_KEY = "wtc_auth_token";

export interface AuthUser {
  id: number;
  email: string;
  created_at: string;
}

interface AuthResponse {
  authenticated: boolean;
  user: AuthUser | null;
  token: string | null;
}

function getStoredToken(): string | null {
  return window.localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
}

function setStoredToken(token: string | null) {
  if (token) {
    window.localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, token);
    return;
  }
  window.localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
}

async function authRequest(
  path: string,
  init: RequestInit = {},
  token?: string | null
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSession() {
      if (!token) {
        setUser(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const response = await authRequest("/api/auth/me", { method: "GET" }, token);
        if (!response.ok) {
          throw new Error("Session expired. Please sign in again.");
        }
        const payload = (await response.json()) as AuthResponse;
        if (!payload.authenticated || !payload.user) {
          throw new Error("Session expired. Please sign in again.");
        }
        if (!cancelled) {
          setUser(payload.user);
        }
      } catch (nextError) {
        if (!cancelled) {
          setStoredToken(null);
          setToken(null);
          setUser(null);
          setError(nextError instanceof Error ? nextError.message : "Unable to restore account session.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const submitCredentials = useCallback(
    async (path: "/api/auth/signup" | "/api/auth/signin", email: string, password: string) => {
      setSubmitting(true);
      setError(null);
      try {
        const response = await authRequest(path, {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        const payload = (await response.json()) as AuthResponse | { detail?: string };
        if (!response.ok) {
          throw new Error(
            typeof payload === "object" && payload && "detail" in payload && payload.detail
              ? payload.detail
              : "Authentication request failed."
          );
        }
        setStoredToken((payload as AuthResponse).token);
        setToken((payload as AuthResponse).token);
        setUser((payload as AuthResponse).user);
        return true;
      } catch (nextError) {
        setError(nextError instanceof Error ? nextError.message : "Authentication request failed.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    []
  );

  const signUp = useCallback(
    (email: string, password: string) =>
      submitCredentials("/api/auth/signup", email, password),
    [submitCredentials]
  );

  const signIn = useCallback(
    (email: string, password: string) =>
      submitCredentials("/api/auth/signin", email, password),
    [submitCredentials]
  );

  const signOut = useCallback(async () => {
    const activeToken = token;
    setSubmitting(true);
    setError(null);
    try {
      if (activeToken) {
        await authRequest("/api/auth/signout", { method: "POST" }, activeToken);
      }
    } finally {
      setStoredToken(null);
      setToken(null);
      setUser(null);
      setError(null);
      setSubmitting(false);
    }
  }, [token]);

  return {
    token,
    user,
    isAuthenticated: Boolean(user),
    loading,
    submitting,
    error,
    signUp,
    signIn,
    signOut,
    clearError: () => setError(null),
  };
}
