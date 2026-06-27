import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, Loader2, Trash2 } from "lucide-react";
import { LazyWebPhoneField } from "@/components/LazyWebPhoneField";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { apiFetch } from "@/lib/api";
import { DeleteAccountDialog } from "@/components/account/DeleteAccountDialog";

type Gender = "female" | "male" | "unspecified";
const GENDER_VALUES: Gender[] = ["female", "male", "unspecified"];

type MeUser = {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  gender?: string | null;
  birthday?: string | null;
};

type MeResponse = { ok: boolean; user: MeUser | null };

function pad2(s: string): string {
  if (!s) return "";
  return s.length === 1 ? `0${s}` : s;
}

function isValidBirthday(y: string, m: string, d: string): boolean {
  if (!y && !m && !d) return true;
  if (!/^\d{4}$/.test(y) || !/^\d{1,2}$/.test(m) || !/^\d{1,2}$/.test(d)) return false;
  const yy = Number(y);
  const mm = Number(m);
  const dd = Number(d);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const date = new Date(Date.UTC(yy, mm - 1, dd));
  if (
    date.getUTCFullYear() !== yy ||
    date.getUTCMonth() + 1 !== mm ||
    date.getUTCDate() !== dd
  ) {
    return false;
  }
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (date.getTime() > today.getTime()) return false;
  if (yy < today.getUTCFullYear() - 130) return false;
  return true;
}

export default function PersonalInformation() {
  const { user: shimUser, isLoading, provider, updateUser } = useAuth();
  const [, setLocation] = useLocation();
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const isRTL = dir === "rtl";
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const [hydrating, setHydrating] = useState(true);
  const [hydrateFailed, setHydrateFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState<Gender>("unspecified");
  const [bDay, setBDay] = useState("");
  const [bMonth, setBMonth] = useState("");
  const [bYear, setBYear] = useState("");
  const [bdayError, setBdayError] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [phoneValid, setPhoneValid] = useState(false);
  const [phoneError, setPhoneError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !shimUser) {
      setLocation("/sign-in");
    }
  }, [isLoading, shimUser, setLocation]);

  useEffect(() => {
    if (!shimUser) return;
    let cancelled = false;
    setHydrating(true);
    setHydrateFailed(false);
    setFirstName(shimUser.firstName ?? "");
    setLastName(shimUser.lastName ?? "");
    setEmail(shimUser.email ?? "");
    setPhone(shimUser.phone ?? "");
    (async () => {
      try {
        const data = await apiFetch<MeResponse>("/auth/me");
        if (cancelled) return;
        const u = data?.user;
        if (!u) {
          setHydrateFailed(true);
          return;
        }
        setFirstName(u.firstName ?? "");
        setLastName(u.lastName ?? "");
        setEmail(u.email ?? "");
        const rawGender = u.gender;
        setGender(
          rawGender === "female" || rawGender === "male"
            ? rawGender
            : "unspecified",
        );
        const bd = typeof u.birthday === "string" ? u.birthday : "";
        setBYear(bd ? bd.slice(0, 4) : "");
        setBMonth(bd ? bd.slice(5, 7) : "");
        setBDay(bd ? bd.slice(8, 10) : "");
        setPhone(u.phone ?? "");
      } catch {
        if (!cancelled) setHydrateFailed(false);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shimUser?.id]);

  const onSavePersonal = async () => {
    setBdayError(null);
    if (!firstName.trim()) {
      toast({
        title: t("pi.error.title"),
        description: t("pi.error.nameRequired"),
        variant: "destructive",
      });
      return;
    }
    const provided = !!(bYear || bMonth || bDay);
    if (provided && !isValidBirthday(bYear, bMonth, bDay)) {
      setBdayError(t("pi.error.birthdayInvalid"));
      return;
    }
    const birthday = provided ? `${bYear}-${pad2(bMonth)}-${pad2(bDay)}` : null;
    setBusy(true);
    try {
      await apiFetch<MeResponse>("/auth/me", {
        method: "PUT",
        body: JSON.stringify({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          gender,
          birthday,
        }),
      });
      updateUser({ firstName: firstName.trim(), lastName: lastName.trim() });
      toast({
        title: t("pi.updated.title"),
        description: t("pi.updated.msg"),
      });
    } catch (err: any) {
      toast({
        title: t("pi.error.title"),
        description: err?.message ?? t("pi.error.generic"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const onSavePhone = async () => {
    setPhoneError(null);
    if (phone && !phoneValid) {
      setPhoneError(t("pi.phone.errorInvalid"));
      return;
    }
    setPhoneBusy(true);
    try {
      await apiFetch<MeResponse>("/auth/me", {
        method: "PUT",
        body: JSON.stringify({ phone: phone ?? "" }),
      });
      updateUser({ phone: phone ?? undefined });
      toast({
        title: t("pi.updated.title"),
        description: t("pi.phone.updatedMsg"),
      });
    } catch (err: any) {
      toast({
        title: t("pi.error.title"),
        description: err?.message ?? t("pi.error.generic"),
        variant: "destructive",
      });
    } finally {
      setPhoneBusy(false);
    }
  };

  const BackIcon = isRTL ? ChevronRight : ChevronLeft;
  const goBack = () => setLocation("/account");

  if (isLoading || !shimUser) {
    return (
      <div className="min-h-screen pt-32 text-center" data-testid="pi-loading">
        {t("account.loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 pb-24 bg-background" dir={dir}>
      <div className="container mx-auto px-4 max-w-3xl">
        <button
          type="button"
          onClick={goBack}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6"
          data-testid="pi-back"
        >
          <BackIcon className="w-4 h-4" />
          <span>{t("pi.back")}</span>
        </button>

        <h1 className="text-4xl font-serif mb-2">{t("pi.title")}</h1>
        <p className="text-sm text-muted-foreground mb-6">{t("pi.subtitle")}</p>

        {hydrating ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : null}

        {/* ── Personal information card ───────────────────────────── */}
        <section
          className="bg-card rounded-3xl p-6 border border-border/50 mb-6"
          data-testid="pi-personal-card"
        >
          <h2 className="text-xl font-serif mb-4">{t("pi.title")}</h2>

          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <Field label={t("pi.firstName")} required>
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={t("pi.firstNamePlaceholder")}
                data-testid="pi-first-name"
              />
            </Field>
            <Field label={t("pi.lastName")}>
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t("pi.lastNamePlaceholder")}
                data-testid="pi-last-name"
              />
            </Field>
          </div>

          <div className="mb-4">
            <Field label={t("pi.email")}>
              <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                {email || "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("pi.emailHelper")}
              </p>
            </Field>
          </div>

          <div className="mb-4">
            <Field label={t("pi.gender")}>
              <div className="grid grid-cols-3 gap-2">
                {GENDER_VALUES.map((g) => {
                  const active = gender === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setGender(g)}
                      className={`rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-background text-foreground border-border hover:bg-secondary/40"
                      }`}
                      data-testid={`pi-gender-${g}`}
                    >
                      {g === "female"
                        ? t("pi.gender.female")
                        : g === "male"
                          ? t("pi.gender.male")
                          : t("pi.gender.unspecified")}
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          <div className="mb-2">
            <Field label={t("pi.birthday")}>
              <div className="flex gap-2" dir="ltr">
                <Input
                  inputMode="numeric"
                  maxLength={2}
                  value={bDay}
                  onChange={(e) => setBDay(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("pi.birthday.dd")}
                  className="text-center flex-1"
                  data-testid="pi-bday-day"
                />
                <Input
                  inputMode="numeric"
                  maxLength={2}
                  value={bMonth}
                  onChange={(e) => setBMonth(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("pi.birthday.mm")}
                  className="text-center flex-1"
                  data-testid="pi-bday-month"
                />
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={bYear}
                  onChange={(e) => setBYear(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("pi.birthday.yyyy")}
                  className="text-center flex-1"
                  data-testid="pi-bday-year"
                />
              </div>
              {bdayError ? (
                <p className="text-sm text-destructive mt-2" data-testid="pi-bday-error">
                  {bdayError}
                </p>
              ) : null}
            </Field>
          </div>

          <div className="mt-6">
            <Button
              type="button"
              onClick={onSavePersonal}
              disabled={busy || hydrating || hydrateFailed}
              className="w-full sm:w-auto"
              data-testid="pi-save"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("pi.update")
              )}
            </Button>
          </div>
        </section>

        {/* ── Phone card ──────────────────────────────────────────── */}
        <section
          className="bg-card rounded-3xl p-6 border border-border/50 mb-6"
          data-testid="pi-phone-card"
        >
          <h2 className="text-xl font-serif mb-1">{t("pi.phone.title")}</h2>
          <p className="text-sm text-muted-foreground mb-4">
            {phone ? phone : t("pi.phone.notSet")}
          </p>

          <LazyWebPhoneField
            label=""
            defaultCountry="LB"
            value={phone}
            onChange={(v) => {
              setPhone(v);
              if (phoneError) setPhoneError(null);
            }}
            onValidityChange={setPhoneValid}
            showError={!!phoneError}
            errorMessage={phoneError}
            data-testid="pi-phone-input"
          />

          <div className="mt-5">
            <Button
              type="button"
              variant="outline"
              onClick={onSavePhone}
              disabled={phoneBusy || hydrating || hydrateFailed}
              data-testid="pi-phone-save"
            >
              {phoneBusy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("pi.phone.change")
              )}
            </Button>
          </div>
        </section>

        {/* ── Password card — only visible for email (password) sign-in ── */}
        {provider === "password" && (
          <PasswordCard t={t} email={email} />
        )}

        {/* ── Delete account ──────────────────────────────────────── */}
        <section
          className="bg-destructive/5 rounded-3xl p-6 border border-destructive/20 mt-2"
          data-testid="pi-delete-account-card"
        >
          <div className="flex items-start gap-4">
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0 mt-0.5">
              <Trash2 className="w-5 h-5 text-destructive" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-serif mb-1 text-destructive">
                {t("account.deleteAccount")}
              </h2>
              <p className="text-sm text-muted-foreground mb-5 leading-relaxed">
                {t("account.deleteAccount.desc")}
              </p>
              <Button
                type="button"
                variant="destructive"
                onClick={() => setDeleteDialogOpen(true)}
                data-testid="pi-delete-account-btn"
              >
                {t("account.deleteAccount")}
              </Button>
            </div>
          </div>
        </section>

        <DeleteAccountDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
        />
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5 inline-block">
        {label}
        {required ? <span className="text-primary"> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function PasswordCard({
  t,
  email,
}: {
  t: (k: string, p?: Record<string, string | number>) => string;
  email: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const onRequestReset = async () => {
    if (!email || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/auth/reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
      } | null;
      if (res.ok && data?.ok) {
        setSent(true);
        toast({
          title: t("pi.updated.title"),
          description: t("pi.password.resetSent"),
        });
      } else {
        toast({
          title: t("pi.error.title"),
          description: data?.message ?? t("pi.error.generic"),
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: t("pi.error.title"),
        description: err?.message ?? t("pi.error.generic"),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="bg-card rounded-3xl p-6 border border-border/50"
      data-testid="pi-password-card"
    >
      <h2 className="text-xl font-serif mb-1">{t("pi.password.title")}</h2>
      <p className="text-sm text-muted-foreground mb-5">
        {sent ? t("pi.password.resetSentDesc") : t("pi.password.help")}
      </p>

      {!sent && (
        <Button
          type="button"
          variant="outline"
          onClick={() => void onRequestReset()}
          disabled={busy || !email}
          data-testid="pi-password-change"
        >
          {busy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            t("pi.password.change")
          )}
        </Button>
      )}
    </section>
  );
}
