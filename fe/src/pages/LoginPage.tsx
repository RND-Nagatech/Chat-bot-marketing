import { useState } from "react";
import { Bot, MessageSquareText, ShieldCheck, Zap } from "lucide-react";
import { login } from "@/services/api";
import { toast } from "sonner";

interface Props {
  onLogin: (user: { id: string; email: string; token: string }) => void;
}

export default function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const user = await login(email, password);
      onLogin(user);
      toast.success("Selamat datang kembali!");
    } catch {
      toast.error("Email atau kata sandi tidak valid");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8 sm:px-6">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 top-0 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute -bottom-20 right-0 h-72 w-72 rounded-full bg-emerald-300/20 blur-3xl" />
      </div>

      <div className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl border bg-card/90 shadow-2xl backdrop-blur md:grid-cols-2">
        <section className="hidden border-r bg-muted/30 p-10 md:flex md:flex-col md:justify-between">
          <div>
            <div className="mb-6 inline-flex items-center gap-3 rounded-full border bg-background px-4 py-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold text-foreground">Manajer Bot WA</span>
            </div>
            <h1 className="max-w-sm text-4xl font-bold leading-tight text-foreground">
              Kelola percakapan WhatsApp dalam satu tempat.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
              Dashboard modern untuk memantau chat, aturan balasan otomatis, dan status bot secara real-time.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-card-foreground">
              <MessageSquareText className="h-4 w-4 text-primary" /> Riwayat chat terpusat
            </div>
            <div className="flex items-center gap-3 text-sm text-card-foreground">
              <Zap className="h-4 w-4 text-primary" /> Aturan balas otomatis fleksibel
            </div>
            <div className="flex items-center gap-3 text-sm text-card-foreground">
              <ShieldCheck className="h-4 w-4 text-primary" /> Akses aman dengan autentikasi
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-10">
          <div className="mb-8 text-center md:text-left">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary md:mx-0">
              <Bot className="h-7 w-7 text-primary-foreground" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Masuk ke akun Anda</h2>
            <p className="mt-1 text-sm text-muted-foreground">Lanjutkan untuk mengelola chatbot WhatsApp.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium text-card-foreground">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="nama@perusahaan.com"
                className="mt-1 w-full rounded-xl border bg-background px-3.5 py-3 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-card-foreground">Kata Sandi</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Masukkan kata sandi"
                className="mt-1 w-full rounded-xl border bg-background px-3.5 py-3 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-primary-foreground transition-all hover:translate-y-[-1px] hover:opacity-95 disabled:opacity-50"
            >
              {loading ? "Masuk..." : "Masuk"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
