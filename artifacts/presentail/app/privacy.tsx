import { LegalPlaceholder } from "@/components/auth/LegalPlaceholder";
import { useT } from "@/hooks/useT";

export default function PrivacyScreen() {
  const t = useT();
  return <LegalPlaceholder title={t.privacyTitle} body={t.legalComingSoon} />;
}
