import { useState, useEffect, useCallback } from "react";
import type { User } from "@/types";

function readUserIdFromToken(token: string) {
  try {
    const payload = JSON.parse(atob(token.split(".")[1] || ""));
    return payload?.kode_sales || payload?.salesId || payload?.userId
      ? String(payload.kode_sales || payload.salesId || payload.userId)
      : null;
  } catch {
    return null;
  }
}

function readTokenPayload(token: string) {
  try {
    return JSON.parse(atob(token.split(".")[1] || ""));
  } catch {
    return {};
  }
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("wa_token");
    const email = localStorage.getItem("wa_email");
    const namaSales = localStorage.getItem("wa_nama_sales") || undefined;
    const kodeSales = localStorage.getItem("wa_kode_sales") || undefined;
    const payload = token ? readTokenPayload(token) : {};
    const id = localStorage.getItem("wa_user_id") || (token ? readUserIdFromToken(token) : null);
    if (token && email && id) {
      localStorage.setItem("wa_user_id", id);
      setUser({
        id,
        email,
        nama_sales: namaSales || payload?.nama_sales || email,
        kode_sales: kodeSales || payload?.kode_sales || payload?.salesId || id,
        token,
      });
    }
    setLoading(false);
  }, []);

  const saveUser = useCallback((u: User) => {
    localStorage.setItem("wa_token", u.token);
    localStorage.setItem("wa_email", u.email);
    localStorage.setItem("wa_user_id", u.id);
    localStorage.setItem("wa_nama_sales", u.nama_sales || u.email);
    localStorage.setItem("wa_kode_sales", u.kode_sales || u.id);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("wa_token");
    localStorage.removeItem("wa_email");
    localStorage.removeItem("wa_user_id");
    localStorage.removeItem("wa_nama_sales");
    localStorage.removeItem("wa_kode_sales");
    setUser(null);
  }, []);

  return { user, loading, saveUser, logout };
}
