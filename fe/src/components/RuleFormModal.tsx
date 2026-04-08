import { useState, useEffect } from "react";
import { X } from "lucide-react";
import type { Rule } from "@/types";

interface Props {
  open: boolean;
  rule?: Rule | null;
  onClose: () => void;
  onSave: (data: Omit<Rule, "id" | "created_at">) => void;
  loading?: boolean;
}

export function RuleFormModal({ open, rule, onClose, onSave, loading }: Props) {
  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] = useState<"contains" | "exact">("contains");
  const [response, setResponse] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (rule) {
      setKeyword(rule.keyword);
      setMatchType(rule.match_type);
      setResponse(rule.response);
      setIsActive(rule.is_active);
    } else {
      setKeyword(""); setMatchType("contains"); setResponse(""); setIsActive(true);
    }
  }, [rule, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-card-foreground">{rule ? "Edit Aturan" : "Tambah Aturan"}</h2>
          <button onClick={onClose} className="rounded-lg p-1 hover:bg-muted transition-colors">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({ keyword, match_type: matchType, response, is_active: isActive });
          }}
          className="space-y-4"
        >
          <div>
            <label className="text-sm font-medium text-card-foreground">Kata Kunci</label>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              required
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="cth. halo"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-card-foreground">Tipe Kecocokan</label>
            <select
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as "contains" | "exact")}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="contains">Mengandung</option>
              <option value="exact">Persis</option>
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-card-foreground">Respons</label>
            <textarea
              value={response}
              onChange={(e) => setResponse(e.target.value)}
              required
              rows={3}
              className="mt-1 w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Pesan respons bot..."
            />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="rounded accent-primary" />
            <span className="text-sm text-card-foreground">Aktif</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
              Batal
            </button>
            <button type="submit" disabled={loading} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50">
              {loading ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
