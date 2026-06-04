import { useEffect, useState } from "react";
import { CalendarDays, Pencil, Plus, Trash2, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { EmptyState } from "./EmptyState";
import { OCCASION_OPTIONS } from "@/data/occasions";

function displayOccasionLabel(slug: string): string {
  return OCCASION_OPTIONS.find((o) => o.value === slug)?.label ?? slug;
}

type Occasion = {
  id: number;
  personName: string | null;
  label: string;
  month: number;
  day: number;
  note: string | null;
  createdAt: string;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function daysInMonth(month: number) {
  return new Date(2000, month, 0).getDate();
}

function formatOccasionDate(month: number, day: number) {
  return `${MONTHS[month - 1]} ${day}`;
}

function OccasionForm({
  initial,
  onSave,
  onCancel,
  t,
}: {
  initial?: Partial<Occasion>;
  onSave: (data: { personName: string | null; label: string; month: number; day: number; note: string | null }) => Promise<void>;
  onCancel: () => void;
  t: (k: string) => string;
}) {
  const [personName, setPersonName] = useState(initial?.personName ?? "");

  const resolveInitialLabel = () => {
    if (!initial?.label) return "";
    if (OCCASION_OPTIONS.some((o) => o.value === initial.label)) return initial.label;
    const byLabel = OCCASION_OPTIONS.find((o) => o.label === initial.label);
    if (byLabel) return byLabel.value;
    return "";
  };

  const [label, setLabel] = useState(resolveInitialLabel);
  const [month, setMonth] = useState(String(initial?.month ?? ""));
  const [day, setDay] = useState(String(initial?.day ?? ""));
  const [note, setNote] = useState(initial?.note ?? "");
  const [busy, setBusy] = useState(false);

  const monthNum = Number(month);
  const maxDays = monthNum >= 1 && monthNum <= 12 ? daysInMonth(monthNum) : 31;

  const handleSubmit = async () => {
    if (!personName.trim() || !label.trim()) return;
    const m = parseInt(month, 10);
    const d = parseInt(day, 10);
    if (isNaN(m) || m < 1 || m > 12 || isNaN(d) || d < 1 || d > maxDays) return;
    setBusy(true);
    try {
      await onSave({
        personName: personName.trim(),
        label,
        month: m,
        day: d,
        note: note.trim() || null,
      });
    } finally {
      setBusy(false);
    }
  };

  const valid =
    personName.trim().length > 0 &&
    label.trim().length > 0 &&
    parseInt(month, 10) >= 1 &&
    parseInt(month, 10) <= 12 &&
    parseInt(day, 10) >= 1 &&
    parseInt(day, 10) <= maxDays;

  return (
    <div className="space-y-4 py-2">
      <div>
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          {t("account.occasions.personField")} <span className="text-destructive">*</span>
        </Label>
        <Input
          value={personName}
          onChange={(e) => setPersonName(e.target.value)}
          placeholder={t("account.occasions.personPlaceholder")}
          data-testid="occasion-person-name"
        />
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          {t("account.occasions.occasionType")} <span className="text-destructive">*</span>
        </Label>
        <Select value={label} onValueChange={setLabel}>
          <SelectTrigger data-testid="occasion-label">
            <SelectValue placeholder={t("account.occasions.occasionTypePlaceholder")} />
          </SelectTrigger>
          <SelectContent>
            {OCCASION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            {t("account.occasions.month")} <span className="text-destructive">*</span>
          </Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger data-testid="occasion-month">
              <SelectValue placeholder={t("account.occasions.monthPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
            {t("account.occasions.day")} <span className="text-destructive">*</span>
          </Label>
          <Select value={day} onValueChange={setDay} disabled={!monthNum}>
            <SelectTrigger data-testid="occasion-day">
              <SelectValue placeholder={t("account.occasions.dayPlaceholder")} />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: maxDays }, (_, i) => i + 1).map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5 block">
          {t("account.occasions.note")}
        </Label>
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t("account.occasions.notePlaceholder")}
          data-testid="occasion-note"
        />
      </div>

      <DialogFooter className="gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} className="rounded-full">
          {t("pi.cancel")}
        </Button>
        <Button onClick={handleSubmit} disabled={busy || !valid} className="rounded-full" data-testid="occasion-save">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : t("account.occasions.save")}
        </Button>
      </DialogFooter>
    </div>
  );
}

export function OccasionsPanel({ t }: { t: (k: string) => string }) {
  const [occasions, setOccasions] = useState<Occasion[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Occasion | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Occasion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { toast } = useToast();

  const load = () => {
    setLoading(true);
    apiFetch<{ ok: boolean; occasions: Occasion[] }>("/me/occasions")
      .then((r) => setOccasions(r.occasions ?? []))
      .catch(() => setOccasions([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async (data: { personName: string | null; label: string; month: number; day: number; note: string | null }) => {
    const r = await apiFetch<{ ok: boolean; occasion: Occasion }>("/me/occasions", {
      method: "POST",
      body: JSON.stringify(data),
    });
    setOccasions((prev) => [...prev, r.occasion].sort((a, b) => a.month - b.month || a.day - b.day));
    setAddOpen(false);
    toast({ title: t("account.occasions.saved") });
  };

  const handleUpdate = async (data: { personName: string | null; label: string; month: number; day: number; note: string | null }) => {
    if (!editTarget) return;
    const r = await apiFetch<{ ok: boolean; occasion: Occasion }>(`/me/occasions/${editTarget.id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
    setOccasions((prev) =>
      prev.map((o) => (o.id === editTarget.id ? r.occasion : o)).sort((a, b) => a.month - b.month || a.day - b.day),
    );
    setEditTarget(null);
    toast({ title: t("account.occasions.updated") });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiFetch(`/me/occasions/${deleteTarget.id}`, { method: "DELETE" });
      setOccasions((prev) => prev.filter((o) => o.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast({ title: t("account.occasions.deleted") });
    } catch {
      toast({ title: t("account.occasions.deleteError"), variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <div className="bg-card rounded-2xl border border-border/60 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-5 border-b border-border/50">
          <h2 className="text-xl font-serif">{t("account.occasions")}</h2>
          <Button
            size="sm"
            variant="outline"
            className="rounded-full gap-1.5 h-8"
            onClick={() => setAddOpen(true)}
            data-testid="add-occasion"
          >
            <Plus className="w-3.5 h-3.5" />
            {t("account.occasions.add")}
          </Button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="rounded-xl border border-border/60 p-4 animate-pulse">
                  <div className="h-4 bg-secondary rounded w-32 mb-2" />
                  <div className="h-3 bg-secondary rounded w-20" />
                </div>
              ))}
            </div>
          ) : occasions.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title={t("account.occasions.empty")}
              description={t("account.occasions.emptyDesc")}
            />
          ) : (
            <ul className="space-y-3" data-testid="occasions-list">
              {occasions.map((occ) => (
                <li
                  key={occ.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card p-4"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <CalendarDays className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">
                        {occ.personName ? `${occ.personName} — ` : ""}{displayOccasionLabel(occ.label)}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {formatOccasionDate(occ.month, occ.day)}
                      </div>
                      {occ.note && (
                        <div className="text-xs text-muted-foreground/70 mt-1 italic truncate">
                          {occ.note}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setEditTarget(occ)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-secondary/60 transition-colors"
                      aria-label={t("account.occasions.edit")}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(occ)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      aria-label={t("account.occasions.delete")}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Add dialog */}
      <Dialog open={addOpen} onOpenChange={(o) => !o && setAddOpen(false)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{t("account.occasions.addTitle")}</DialogTitle>
          </DialogHeader>
          <OccasionForm onSave={handleCreate} onCancel={() => setAddOpen(false)} t={t} />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent className="max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{t("account.occasions.editTitle")}</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <OccasionForm
              initial={editTarget}
              onSave={handleUpdate}
              onCancel={() => setEditTarget(null)}
              t={t}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl">{t("account.occasions.deleteTitle")}</DialogTitle>
            <DialogDescription>
              {deleteTarget
                ? `"${deleteTarget.personName ? `${deleteTarget.personName} — ` : ""}${deleteTarget.label}" ${t("account.occasions.deleteDesc")}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDeleteTarget(null)} className="rounded-full">
              {t("pi.cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="rounded-full">
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : t("account.occasions.deleteConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
