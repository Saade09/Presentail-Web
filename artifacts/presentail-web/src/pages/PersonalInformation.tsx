import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useUser } from "@clerk/react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { useLocale } from "@/contexts/LocaleContext";
import { apiFetch } from "@/lib/api";
import {
  COUNTRY_DIAL_CODES,
  splitPhone,
  type CountryDialCode,
} from "@/data/countryCodes";

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
  birthdayShareMonthDay?: boolean;
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
  const { user: shimUser, isLoading } = useAuth();
  const { user: clerkUser } = useUser();
  const [, setLocation] = useLocation();
  const { t, dir } = useLocale();
  const { toast } = useToast();
  const isRTL = dir === "rtl";

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
  const [shareBirthday, setShareBirthday] = useState(true);
  const [bdayError, setBdayError] = useState<string | null>(null);

  const [phoneCountry, setPhoneCountry] = useState<CountryDialCode>(
    COUNTRY_DIAL_CODES[0],
  );
  const [phoneLocal, setPhoneLocal] = useState("");

  // Redirect to sign-in if signed out (CustomerOnly upstream gates this too,
  // but the inner shim hook briefly reports null while Clerk hydrates).
  useEffect(() => {
    if (!isLoading && !shimUser) {
      setLocation("/sign-in");
    }
  }, [isLoading, shimUser, setLocation]);

  // Pull the canonical profile from /auth/me on mount. If the call fails
  // we fall back to whatever the auth shim already knows (so the form
  // doesn't render empty and silently overwrite real data on save).
  useEffect(() => {
    if (!shimUser) return;
    let cancelled = false;
    setHydrating(true);
    setHydrateFailed(false);
    // Seed from the auth shim first so the form is never blank.
    setFirstName(shimUser.firstName ?? "");
    setLastName(shimUser.lastName ?? "");
    setEmail(shimUser.email ?? "");
    const seedSplit = splitPhone(shimUser.phone ?? "");
    setPhoneCountry(seedSplit.country);
    setPhoneLocal(seedSplit.local);
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
        setShareBirthday(
          typeof u.birthdayShareMonthDay === "boolean"
            ? u.birthdayShareMonthDay
            : true,
        );
        const split = splitPhone(u.phone ?? "");
        setPhoneCountry(split.country);
        setPhoneLocal(split.local);
      } catch {
        if (!cancelled) setHydrateFailed(true);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [shimUser]);

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
          birthdayShareMonthDay: shareBirthday,
        }),
      });
      // Best-effort sync of Clerk's first/last name so the navbar greeting
      // and Clerk-rendered surfaces stay consistent.
      try {
        await clerkUser?.update({
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
      } catch {
        // non-fatal — the API call already succeeded.
      }
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
    // Normalise to strict E.164: dial code + digits-only national number,
    // no spaces or punctuation. Empty national number clears the field.
    const digits = phoneLocal.replace(/\D/g, "");
    const phoneValue = digits ? `${phoneCountry.dial}${digits}` : "";
    setPhoneBusy(true);
    try {
      await apiFetch<MeResponse>("/auth/me", {
        method: "PUT",
        body: JSON.stringify({ phone: phoneValue }),
      });
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
    <div className="min-h-screen pt-24 pb-24 bg-background" dir={dir}>
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
        <p className="text-sm text-muted-foreground mb-10">{t("pi.subtitle")}</p>

        {hydrating ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : null}

        {/* ── Personal information card ───────────────────────────── */}
        <section
          className="bg-secondary/30 rounded-3xl p-8 border border-border/50 mb-6"
          data-testid="pi-personal-card"
        >
          <h2 className="text-xl font-serif mb-6">{t("pi.title")}</h2>

          <div className="grid sm:grid-cols-2 gap-4 mb-5">
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

          <div className="mb-5">
            <Field label={t("pi.email")}>
              <div className="rounded-md border border-input bg-muted/40 px-3 py-2 text-sm">
                {email || "—"}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {t("pi.emailHelper")}
              </p>
            </Field>
          </div>

          <div className="mb-5">
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
                  className="text-center"
                  data-testid="pi-bday-day"
                />
                <Input
                  inputMode="numeric"
                  maxLength={2}
                  value={bMonth}
                  onChange={(e) => setBMonth(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("pi.birthday.mm")}
                  className="text-center"
                  data-testid="pi-bday-month"
                />
                <Input
                  inputMode="numeric"
                  maxLength={4}
                  value={bYear}
                  onChange={(e) => setBYear(e.target.value.replace(/\D/g, ""))}
                  placeholder={t("pi.birthday.yyyy")}
                  className="text-center flex-[1.4]"
                  data-testid="pi-bday-year"
                />
              </div>
              {bdayError ? (
                <p className="text-sm text-destructive mt-2" data-testid="pi-bday-error">
                  {bdayError}
                </p>
              ) : null}

              <div className="flex items-center gap-3 mt-4">
                <Switch
                  checked={shareBirthday}
                  onCheckedChange={setShareBirthday}
                  id="pi-share-birthday"
                  data-testid="pi-share-birthday"
                />
                <Label htmlFor="pi-share-birthday" className="cursor-pointer text-sm">
                  {t("pi.birthday.sharingOn")}
                </Label>
              </div>
              <details className="mt-2">
                <summary className="text-xs text-primary underline cursor-pointer">
                  {t("pi.birthday.howItWorks")}
                </summary>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  {t("pi.birthday.howItWorksBody")}
                </p>
              </details>
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
          className="bg-secondary/30 rounded-3xl p-8 border border-border/50 mb-6"
          data-testid="pi-phone-card"
        >
          <h2 className="text-xl font-serif mb-1">{t("pi.phone.title")}</h2>
          <p className="text-sm text-muted-foreground mb-5">
            {phoneLocal
              ? `${phoneCountry.dial} ${phoneLocal}`
              : t("pi.phone.notSet")}
          </p>

          <div className="grid grid-cols-[140px_1fr] gap-2" dir="ltr">
            <Select
              value={phoneCountry.code}
              onValueChange={(v) => {
                const next = COUNTRY_DIAL_CODES.find((c) => c.code === v);
                if (next) setPhoneCountry(next);
              }}
            >
              <SelectTrigger data-testid="pi-phone-country">
                <SelectValue>
                  <span className="inline-flex items-center gap-1.5">
                    <span>{phoneCountry.flag}</span>
                    <span className="text-sm">{phoneCountry.dial}</span>
                  </span>
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {COUNTRY_DIAL_CODES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="inline-flex items-center gap-2">
                      <span>{c.flag}</span>
                      <span className="text-sm">{c.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {c.dial}
                      </span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              inputMode="tel"
              value={phoneLocal}
              onChange={(e) => setPhoneLocal(e.target.value)}
              placeholder={t("pi.phone.placeholder")}
              data-testid="pi-phone-input"
            />
          </div>

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

        {/* ── Password card ───────────────────────────────────────── */}
        <PasswordCard t={t} />
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
}: {
  t: (k: string, p?: Record<string, string | number>) => string;
}) {
  const { user: clerkUser } = useUser();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);

  // `passwordEnabled` is false for shoppers who signed in via email-code
  // or social login and never set a password. Clerk allows
  // `updatePassword` without `currentPassword` in that case.
  const passwordEnabled = clerkUser?.passwordEnabled ?? false;

  const reset = () => {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  const onSubmit = async () => {
    if (!clerkUser) return;
    if (newPassword.length < 8) {
      toast({
        title: t("pi.error.title"),
        description: t("pi.password.tooShort"),
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: t("pi.error.title"),
        description: t("pi.password.mismatch"),
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      await clerkUser.updatePassword({
        newPassword,
        ...(passwordEnabled ? { currentPassword } : {}),
        signOutOfOtherSessions: true,
      });
      toast({
        title: t("pi.updated.title"),
        description: t("pi.password.updatedMsg"),
      });
      reset();
      setOpen(false);
    } catch (err: any) {
      const msg =
        err?.errors?.[0]?.longMessage ??
        err?.errors?.[0]?.message ??
        err?.message ??
        t("pi.error.generic");
      toast({
        title: t("pi.error.title"),
        description: msg,
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="bg-secondary/30 rounded-3xl p-8 border border-border/50"
      data-testid="pi-password-card"
    >
      <h2 className="text-xl font-serif mb-1">{t("pi.password.title")}</h2>
      <p className="text-sm text-muted-foreground mb-5">
        {t("pi.password.help")}
      </p>

      {!open ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setOpen(true)}
          data-testid="pi-password-change"
          disabled={!clerkUser}
        >
          {t("pi.password.change")}
        </Button>
      ) : (
        <div className="space-y-4">
          {passwordEnabled ? (
            <Field label={t("pi.password.current")}>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                data-testid="pi-password-current"
              />
            </Field>
          ) : null}
          <Field label={t("pi.password.new")}>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              data-testid="pi-password-new"
            />
          </Field>
          <Field label={t("pi.password.confirm")}>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              data-testid="pi-password-confirm"
            />
          </Field>
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              onClick={onSubmit}
              disabled={busy}
              data-testid="pi-password-save"
            >
              {busy ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("pi.update")
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                reset();
                setOpen(false);
              }}
              disabled={busy}
            >
              {t("pi.cancel")}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
