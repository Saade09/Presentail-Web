import { useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { useLocationSelection, countrySlugToCode } from "@/contexts/LocationContext";
import Home from "@/pages/Home";

export default function CountryHome() {
  const [, params] = useRoute<{ slug: string }>("/:slug");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const code = countrySlugToCode(slug);
  const { countryCode, countries, isLoadingCountries, setLocation } =
    useLocationSelection();

  useEffect(() => {
    if (!code) {
      navigate("/", { replace: true });
      return;
    }
    if (countryCode === code) return;
    if (isLoadingCountries) return;
    const country = countries.find((c) => c.code === code);
    if (!country || country.cities.length === 0) {
      navigate("/", { replace: true });
      return;
    }
    setLocation(code, country.cities[0].id);
  }, [code, countryCode, countries, isLoadingCountries, navigate, setLocation]);

  if (!code || countryCode !== code) {
    return <div className="min-h-[60vh]" data-testid="country-home-loading" />;
  }
  return <Home />;
}
