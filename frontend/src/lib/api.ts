export const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8001";

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = typeof window !== "undefined" ? localStorage.getItem("pulp_token") : null;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string> || {}),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });

  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("pulp_token");
    window.location.href = "/sign-in";
    throw new Error("Unauthorized");
  }

  return res;
}
