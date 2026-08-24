import { useState } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Database,
  LockKeyhole,
  Mail,
  MessageCircle,
  MessageSquareText,
  ShieldCheck,
} from "lucide-react";
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
    if (!email.trim() || !password.trim()) {
      toast.error("Email dan kata sandi wajib diisi");
      return;
    }

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-5 sm:px-6 lg:px-8">
      <div className="subtle-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" />

      <main className="relative grid w-full max-w-md overflow-hidden rounded-2xl border border-white/70 bg-white/75 shadow-[0_18px_70px_rgba(15,23,42,0.12)] backdrop-blur lg:min-h-[520px] lg:max-w-5xl lg:grid-cols-[0.96fr_0.9fr] xl:max-w-[1080px]">
        <section className="relative hidden overflow-hidden bg-sidebar-bg p-7 text-white lg:flex lg:flex-col lg:justify-between xl:p-8">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgba(22,163,127,0.2),transparent_32%),linear-gradient(0deg,rgba(255,255,255,0.04),transparent)]" />
          <div className="relative">
            <div className="mb-7 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-[0_14px_30px_rgba(16,185,129,0.24)]">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <div>
                <p className="text-base font-bold text-white">WA Bot</p>
                <p className="text-xs text-sidebar-fg">Marketing assistant</p>
              </div>
            </div>

            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-sidebar-fg">
              <CheckCircle2 className="h-3 w-3 text-primary" />
              Workspace aktif untuk tim marketing
            </div>
            <h1 className="max-w-sm text-3xl font-extrabold leading-tight tracking-tight text-white xl:text-[40px]">
              Kelola chat, customer, dan knowledge dalam satu ruang kerja.
            </h1>
            <p className="mt-4 max-w-sm text-sm leading-6 text-sidebar-fg">
              Masuk untuk memantau percakapan WhatsApp, data customer, knowledge base, dan status koneksi dari dashboard yang lebih terarah.
            </p>
          </div>

          <div className="relative rounded-xl border border-white/10 bg-white/[0.06] p-3.5 shadow-[0_14px_42px_rgba(0,0,0,0.22)]">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">Ringkasan hari ini</p>
                <p className="text-[11px] text-sidebar-fg">Pantau aktivitas utama</p>
              </div>
              <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[11px] font-semibold text-primary">Live</span>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
                <MessageSquareText className="mb-2 h-3.5 w-3.5 text-primary" />
                <p className="text-base font-bold text-white">Chat</p>
                <p className="text-[11px] text-sidebar-fg">Masuk</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
                <Database className="mb-2 h-3.5 w-3.5 text-primary" />
                <p className="text-base font-bold text-white">RAG</p>
                <p className="text-[11px] text-sidebar-fg">Siap</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] p-2.5">
                <ShieldCheck className="mb-2 h-3.5 w-3.5 text-primary" />
                <p className="text-base font-bold text-white">Aman</p>
                <p className="text-[11px] text-sidebar-fg">Auth</p>
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center bg-white p-5 sm:p-6 lg:p-8 xl:p-9">
          <div className="mx-auto w-full max-w-sm">
            <div className="mb-7">
              <div className="mb-6 flex items-center gap-3 lg:hidden">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20">
                  <Bot className="h-5 w-5 text-primary-foreground" />
                </div>
                <div>
                  <p className="text-base font-bold text-foreground">WA Bot</p>
                  <p className="text-xs text-muted-foreground">Marketing assistant</p>
                </div>
              </div>

              <div className="hidden h-11 w-11 items-center justify-center rounded-xl bg-primary shadow-lg shadow-primary/20 lg:flex">
                <Bot className="h-5 w-5 text-primary-foreground" />
              </div>
              <p className="mt-5 text-xs font-semibold uppercase tracking-[0.2em] text-primary">Selamat datang</p>
              <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">Masuk ke akun Anda</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Gunakan akun sales/admin untuk membuka dashboard WhatsApp Bot.
              </p>
            </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            <div>
              <label className="text-sm font-semibold text-card-foreground">Email</label>
              <div className="mt-2 flex min-h-11 items-center gap-3 rounded-xl border bg-background px-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nama@perusahaan.com"
                  className="h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-card-foreground">Kata Sandi</label>
              <div className="mt-2 flex min-h-11 items-center gap-3 rounded-xl border bg-background px-3.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Masukkan kata sandi"
                  className="h-11 w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/70"
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={loading}
              className="group flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:translate-y-[-1px] hover:shadow-primary/30 disabled:translate-y-0 disabled:opacity-60"
            >
              {loading ? "Masuk..." : "Masuk"}
              {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
            </button>
          </form>

            <div className="mt-6 rounded-xl border bg-muted/40 p-3.5">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <MessageCircle className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Dashboard operasional WhatsApp</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    Akses riwayat chat, data customer, dan knowledge base sesuai akun yang login.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
