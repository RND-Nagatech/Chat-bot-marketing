import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    const token = localStorage.getItem("wa_token");
    navigate(token ? "/dashboard" : "/login", { replace: true });
  }, [navigate]);
  return null;
}
