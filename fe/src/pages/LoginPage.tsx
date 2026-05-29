import { useState } from "react";
import { Bot, MessageSquareText, ShieldCheck, Sparkles, Zap } from "lucide-react";
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-transparent px-4 py-8 sm:px-6">
      <div className="subtle-grid pointer-events-none absolute inset-x-0 top-0 h-96" />

      <div className="surface-panel relative grid w-full max-w-5xl overflow-hidden rounded-lg md:grid-cols-[1.08fr_0.92fr]">
        <section className="hidden border-r bg-slate-950 p-10 text-white md:flex md:flex-col md:justify-between">
          <div>
            <div className="mb-8 inline-flex items-center gap-3 rounded-lg border border-white/10 bg-white/10 px-4 py-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/25">
                <Bot className="h-4 w-4 text-primary-foreground" />
              </div>
              <span className="text-sm font-semibold text-white">Manajer Bot WA</span>
            </div>
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-xs font-semibold text-white/70">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Marketing knowledge workspace
            </div>
            <h1 className="max-w-sm text-4xl font-extrabold leading-tight tracking-tight text-white">
              Kelola percakapan WhatsApp dalam satu tempat.
            </h1>
            <p className="mt-5 max-w-md text-sm leading-6 text-white/70">
              Pantau chat, knowledge RAG, aturan jawaban cepat, dan koneksi WhatsApp dengan tampilan operasional yang lebih rapi.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-3 text-sm text-white/85">
              <MessageSquareText className="h-4 w-4 text-primary" /> Riwayat chat hybrid
            </div>
            <div className="flex items-center gap-3 text-sm text-white/85">
              <Zap className="h-4 w-4 text-primary" /> Knowledge dan Rules terpadu
            </div>
            <div className="flex items-center gap-3 text-sm text-white/85">
              <ShieldCheck className="h-4 w-4 text-primary" /> Akses aman dengan autentikasi
            </div>
          </div>
        </section>

        <section className="p-6 sm:p-10">
          <div className="mb-8 text-center md:text-left">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-primary shadow-lg shadow-primary/20 md:mx-0">
              <Bot className="h-7 w-7 text-primary-foreground" />
            </div>
            <h2 className="text-3xl font-extrabold tracking-tight text-foreground">Masuk ke akun Anda</h2>
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
                className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
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
                className="mt-1 min-h-11 w-full rounded-lg border bg-background px-3.5 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="min-h-11 w-full rounded-lg bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] hover:opacity-95 disabled:opacity-50"
            >
              {loading ? "Masuk..." : "Masuk"}
            </button>
          </form>
        </section>
      </div>
    </div>
  );
}
