import { useCatalogMetadata } from "@/lib/queries";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/contexts/LocaleContext";
import {
  Baby,
  Briefcase,
  BriefcaseBusiness,
  Cake,
  Church,
  Diamond,
  Flower,
  Flower2,
  Gem,
  Gift,
  GraduationCap,
  HandHeart,
  Heart,
  HeartHandshake,
  HeartPulse,
  House,
  MoonStar,
  PartyPopper,
  Plane,
  School,
  Smile,
  SmilePlus,
  Sparkles,
  Star,
  Stethoscope,
  Trophy,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

const ICON_MAP: Record<string, LucideIcon> = {
  "airplane": Plane,
  "account-heart": HandHeart,
  "baby": Baby,
  "baby-carriage": Baby,
  "book-heart": Gift,
  "briefcase": Briefcase,
  "briefcase-account": BriefcaseBusiness,
  "briefcase-business": BriefcaseBusiness,
  "cake": Cake,
  "cards-heart": HandHeart,
  "church": Church,
  "diamond": Diamond,
  "emoticon-happy": SmilePlus,
  "flower": Flower,
  "flower-2": Flower2,
  "gem": Gem,
  "gift": Gift,
  "graduation-cap": GraduationCap,
  "hand-heart": HandHeart,
  "heart": Heart,
  "heart-circle": HeartHandshake,
  "heart-handshake": HeartHandshake,
  "heart-pulse": HeartPulse,
  "home": House,
  "house": House,
  "moon-star": MoonStar,
  "party-popper": PartyPopper,
  "plane": Plane,
  "ring": Gem,
  "school": School,
  "smile": Smile,
  "smile-plus": SmilePlus,
  "sparkles": Sparkles,
  "star": Star,
  "star-crescent": MoonStar,
  "stethoscope": Stethoscope,
  "trophy": Trophy,
  "user": User,
  "users": Users,
};

function getIcon(iconName: string): LucideIcon {
  if (!iconName) return Gift;
  const key = iconName.toLowerCase();
  if (ICON_MAP[key]) return ICON_MAP[key];
  const pascalCase = key
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
  return (ICON_MAP[pascalCase.charAt(0).toLowerCase() + pascalCase.slice(1)] as LucideIcon | undefined) ?? Gift;
}

export default function AllOccasions() {
  const { t } = useLocale();
  const { data, isLoading } = useCatalogMetadata();
  const occasions = data?.occasions ?? [];

  return (
    <div className="min-h-screen pt-12 pb-24">
      <div className="container mx-auto max-w-content px-page">
        <div className="mb-12 pb-8">
          <h1 className="text-4xl md:text-5xl font-serif mb-4" data-testid="text-occasions-title">
            {t("occasions.title")}
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl">
            {t("occasions.subtitle")}
          </p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {Array(10).fill(0).map((_, i) => (
              <Skeleton key={i} className="aspect-square rounded-2xl" />
            ))}
          </div>
        ) : occasions.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            {t("allOccasions.empty")}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
            {occasions.map((occasion, i) => {
              const Icon = getIcon(occasion.icon);
              return (
                <motion.div
                  key={occasion.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: Math.min(i * 0.03, 0.3) }}
                >
                  <Link
                    href={`/occasion/${occasion.id}`}
                    className="group flex flex-col items-center justify-center text-center gap-3 py-7 md:py-9 px-4 rounded-2xl bg-card border border-border/60 hover:border-gold hover:shadow-md transition-all"
                    data-testid={`link-occasion-${occasion.id}`}
                  >
                    <span className="w-12 h-12 md:w-14 md:h-14 rounded-full bg-secondary flex items-center justify-center text-primary group-hover:bg-gold group-hover:text-white transition-colors">
                      <Icon className="w-5 h-5 md:w-6 md:h-6" />
                    </span>
                    <span className="font-serif text-base md:text-lg text-primary leading-snug">
                      {occasion.name}
                    </span>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
