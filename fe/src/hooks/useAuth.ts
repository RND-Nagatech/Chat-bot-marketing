import { useState, useEffect, useCallback } from "react";
import type { User } from "@/types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("wa_token");
    const email = localStorage.getItem("wa_email");
    if (token && email) {
      setUser({ id: "1", email, token });
    }
    setLoading(false);
  }, []);

  const saveUser = useCallback((u: User) => {
    localStorage.setItem("wa_token", u.token);
    localStorage.setItem("wa_email", u.email);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("wa_token");
    localStorage.removeItem("wa_email");
    setUser(null);
  }, []);

  return { user, loading, saveUser, logout };
}
