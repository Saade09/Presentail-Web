import { useState, useRef } from "react";
import { useLocale } from "@/contexts/LocaleContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COUNTRY_DIAL_CODES } from "@/data/countryCodes";

const CATEGORIES = [
  { key: "Chocolates", labelKey: "partner.form.cat.chocolates" },
  { key: "Home Accessories", labelKey: "partner.form.cat.homeAccessories" },
  { key: "Candles", labelKey: "partner.form.cat.candles" },
  { key: "Cakes", labelKey: "partner.form.cat.cakes" },
  { key: "Bakery", labelKey: "partner.form.cat.bakery" },
  { key: "Sweets", labelKey: "partner.form.cat.sweets" },
  { key: "Perfumes", labelKey: "partner.form.cat.perfumes" },
  { key: "Beauty", labelKey: "partner.form.cat.beauty" },
  { key: "Fashion", labelKey: "partner.form.cat.fashion" },
] as const;

type FormErrors = Record<string, string>;

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-destructive text-xs mt-1">{msg}</p>;
}

function FileInput({
  id,
  accept,
  onChange,
  error,
  hint,
  label,
  required,
}: {
  id: string;
  accept: string;
  onChange: (file: File | null) => void;
  error?: string;
  hint?: string;
  label: string;
  required?: boolean;
}) {
  const { t } = useLocale();
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}
        {required && <span className="text-destructive ms-0.5">*</span>}
      </Label>
      <div
        className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
          error ? "border-destructive" : "border-input"
        }`}
      >
        <label
          htmlFor={id}
          className="cursor-pointer rounded bg-muted px-3 py-1 text-xs font-medium hover:bg-muted/80 transition-colors shrink-0"
        >
          {t("partner.form.chooseFile")}
        </label>
        <span className="text-muted-foreground truncate text-xs">
          {fileName ?? t("partner.form.noFileChosen")}
        </span>
        <input
          id={id}
          type="file"
          accept={accept}
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFileName(f?.name ?? null);
            onChange(f);
          }}
        />
      </div>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <FieldError msg={error} />
    </div>
  );
}

export default function PartnerForm() {
  const { t } = useLocale();

  const [country, setCountry] = useState("");
  const [city, setCity] = useState("");
  const [brandName, setBrandName] = useState("");
  const [brandProfile, setBrandProfile] = useState<File | null>(null);
  const [website, setWebsite] = useState("");
  const [categories, setCategories] = useState<string[]>([]);
  const [otherCategory, setOtherCategory] = useState("");
  const [socialMedia, setSocialMedia] = useState("");
  const [productList, setProductList] = useState<File | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [email, setEmail] = useState("");
  const [dialCode, setDialCode] = useState("+961");
  const [phone, setPhone] = useState("");

  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  function toggleCategory(cat: string) {
    setCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat],
    );
  }

  function validate(): FormErrors {
    const errs: FormErrors = {};
    const req = t("partner.form.error.required");

    if (!country) errs.country = req;
    if (!city.trim()) errs.city = req;
    if (!brandName.trim()) errs.brandName = req;
    if (!brandProfile) errs.brandProfile = t("partner.form.error.fileRequired");
    if (!website.trim()) {
      errs.website = req;
    } else {
      try {
        new URL(website.trim());
      } catch {
        errs.website = t("partner.form.error.invalidUrl");
      }
    }
    if (categories.length === 0) errs.categories = t("partner.form.error.categoryRequired");
    if (!productList) errs.productList = t("partner.form.error.fileRequired");
    if (!firstName.trim()) errs.firstName = req;
    if (!lastName.trim()) errs.lastName = req;
    if (!contactRole.trim()) errs.contactRole = req;
    if (!email.trim()) {
      errs.email = req;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errs.email = t("partner.form.error.invalidEmail");
    }
    if (!phone.trim()) errs.phone = req;

    return errs;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const fd = new FormData();
      fd.append("country", country);
      fd.append("city", city.trim());
      fd.append("brandName", brandName.trim());
      fd.append("website", website.trim());
      categories.forEach((c) => fd.append("categories", c));
      if (otherCategory.trim()) fd.append("otherCategory", otherCategory.trim());
      if (socialMedia.trim()) fd.append("socialMedia", socialMedia.trim());
      fd.append("contactFirstName", firstName.trim());
      fd.append("contactLastName", lastName.trim());
      fd.append("contactRole", contactRole.trim());
      fd.append("email", email.trim());
      fd.append("dialCode", dialCode);
      fd.append("phone", phone.trim());
      fd.append("brandProfile", brandProfile!);
      fd.append("productList", productList!);

      const resp = await fetch("/api/partner-application", { method: "POST", body: fd });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error((data as { message?: string }).message ?? "Unknown error"); // i18n-ignore
      }
      setSubmitted(true);
    } catch (err) {
      setSubmitError(
        err instanceof Error && err.message
          ? err.message
          : t("partner.form.error.submit"), // i18n-ignore
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="rounded-lg bg-primary text-primary-foreground p-8 md:p-12 text-center">
        <div className="text-4xl mb-4">✓</div>
        <h2 className="text-2xl md:text-3xl font-serif mb-3">
          {t("partner.form.success.title")}
        </h2>
        <p className="opacity-90 max-w-xl mx-auto">{t("partner.form.success.body")}</p>
      </div>
    );
  }

  const inputCls = (field: string) =>
    errors[field] ? "border-destructive focus-visible:ring-destructive" : "";

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      noValidate
      className="space-y-8"
    >
      <div>
        <h2 className="text-2xl md:text-3xl font-serif mb-2">
          {t("partner.form.heading")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("partner.form.subheading")}</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="partner-country">
            {t("partner.form.country")}
            <span className="text-destructive ms-0.5">*</span>
          </Label>
          <Select value={country} onValueChange={setCountry}>
            <SelectTrigger
              id="partner-country"
              className={inputCls("country")}
            >
              <SelectValue placeholder={t("partner.form.selectCountry")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Lebanon">{t("partner.form.country.lb")}</SelectItem>
              <SelectItem value="UAE">{t("partner.form.country.ae")}</SelectItem>
              <SelectItem value="Cyprus">{t("partner.form.country.cy")}</SelectItem>
            </SelectContent>
          </Select>
          <FieldError msg={errors.country} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="partner-city">
            {t("partner.form.city")}
            <span className="text-destructive ms-0.5">*</span>
          </Label>
          <Input
            id="partner-city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("partner.form.cityPh")}
            className={inputCls("city")}
          />
          <FieldError msg={errors.city} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="partner-brand-name">
            {t("partner.form.brandName")}
            <span className="text-destructive ms-0.5">*</span>
          </Label>
          <Input
            id="partner-brand-name"
            value={brandName}
            onChange={(e) => setBrandName(e.target.value)}
            placeholder={t("partner.form.brandNamePh")}
            className={inputCls("brandName")}
          />
          <FieldError msg={errors.brandName} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="partner-website">
            {t("partner.form.website")}
            <span className="text-destructive ms-0.5">*</span>
          </Label>
          <Input
            id="partner-website"
            type="url"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder={t("partner.form.websitePh")}
            className={inputCls("website")}
          />
          <FieldError msg={errors.website} />
        </div>
      </div>

      <FileInput
        id="partner-brand-profile"
        label={t("partner.form.brandProfile")}
        accept=".pdf,.jpg,.jpeg,.png,.webp,.gif,image/*,application/pdf"
        onChange={setBrandProfile}
        error={errors.brandProfile}
        hint={t("partner.form.brandProfileHint")}
        required
      />

      <div className="space-y-3">
        <div>
          <p className="text-sm font-medium leading-none">
            {t("partner.form.categories")}
            <span className="text-destructive ms-0.5">*</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t("partner.form.categoriesHint")}
          </p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {CATEGORIES.map(({ key, labelKey }) => (
            <label
              key={key}
              className="flex items-center gap-2 cursor-pointer select-none"
            >
              <Checkbox
                checked={categories.includes(key)}
                onCheckedChange={() => toggleCategory(key)}
              />
              <span className="text-sm">{t(labelKey)}</span>
            </label>
          ))}
        </div>
        <FieldError msg={errors.categories} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="partner-other-category">{t("partner.form.otherCategory")}</Label>
        <Input
          id="partner-other-category"
          value={otherCategory}
          onChange={(e) => setOtherCategory(e.target.value)}
          placeholder={t("partner.form.otherCategoryPh")}
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="partner-social">{t("partner.form.socialMedia")}</Label>
        <Input
          id="partner-social"
          value={socialMedia}
          onChange={(e) => setSocialMedia(e.target.value)}
          placeholder={t("partner.form.socialMediaPh")}
        />
      </div>

      <FileInput
        id="partner-product-list"
        label={t("partner.form.productList")}
        accept=".pdf,.xls,.xlsx,.doc,.docx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={setProductList}
        error={errors.productList}
        hint={t("partner.form.productListHint")}
        required
      />

      <div className="border-t border-border pt-6 space-y-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="partner-first-name">
              {t("partner.form.firstName")}
              <span className="text-destructive ms-0.5">*</span>
            </Label>
            <Input
              id="partner-first-name"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t("partner.form.firstNamePh")}
              className={inputCls("firstName")}
            />
            <FieldError msg={errors.firstName} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="partner-last-name">
              {t("partner.form.lastName")}
              <span className="text-destructive ms-0.5">*</span>
            </Label>
            <Input
              id="partner-last-name"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t("partner.form.lastNamePh")}
              className={inputCls("lastName")}
            />
            <FieldError msg={errors.lastName} />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="partner-role">
            {t("partner.form.contactRole")}
            <span className="text-destructive ms-0.5">*</span>
          </Label>
          <Input
            id="partner-role"
            value={contactRole}
            onChange={(e) => setContactRole(e.target.value)}
            placeholder={t("partner.form.contactRolePh")}
            className={inputCls("contactRole")}
          />
          <FieldError msg={errors.contactRole} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="partner-email">
            {t("partner.form.email")}
            <span className="text-destructive ms-0.5">*</span>
          </Label>
          <Input
            id="partner-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={t("partner.form.emailPh")}
            className={inputCls("email")}
          />
          <FieldError msg={errors.email} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="partner-phone">
            {t("partner.form.phone")}
            <span className="text-destructive ms-0.5">*</span>
          </Label>
          <div className="flex gap-2">
            <Select value={dialCode} onValueChange={setDialCode}>
              <SelectTrigger className="w-[140px] shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                {COUNTRY_DIAL_CODES.map((c) => (
                  <SelectItem key={`${c.code}-${c.dial}`} value={c.dial}>
                    {c.flag} {c.dial}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex-1">
              <Input
                id="partner-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={t("partner.form.phonePh")}
                className={inputCls("phone")}
              />
            </div>
          </div>
          <FieldError msg={errors.phone} />
        </div>
      </div>

      {submitError && (
        <p className="text-destructive text-sm rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3">
          {submitError}
        </p>
      )}

      <Button type="submit" disabled={submitting} size="lg" className="w-full md:w-auto">
        {submitting ? t("partner.form.submitting") : t("partner.form.submit")}
      </Button>
    </form>
  );
}
