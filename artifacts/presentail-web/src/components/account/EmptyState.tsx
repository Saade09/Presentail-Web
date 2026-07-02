import { type LucideIcon } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
}

export function EmptyState({ icon: Icon, title, description, cta }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center bg-muted/20 rounded-2xl border border-dashed border-border/60">
      {/* contrast-ok: decorative illustration icon in empty-state, not informational text */}
      {Icon && <Icon className="w-11 h-11 text-muted-foreground/35 mb-5" strokeWidth={1.25} />}
      <h3 className="font-serif text-xl text-foreground mb-2">{title}</h3>
      {description && (
        <p className="text-muted-foreground text-sm max-w-xs leading-relaxed mb-6">{description}</p>
      )}
      {cta && (
        <Button asChild variant="outline" className="rounded-full">
          <Link href={cta.href}>{cta.label}</Link>
        </Button>
      )}
    </div>
  );
}
