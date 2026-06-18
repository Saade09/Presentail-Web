import { Link } from "wouter";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Skeleton } from "@/components/ui/skeleton";
import { useLocale } from "@/contexts/LocaleContext";

export type Crumb = { label: string; href?: string } | { skeleton: true; href?: never };

interface PageBreadcrumbProps {
  crumbs: Crumb[];
}

export function PageBreadcrumb({ crumbs }: PageBreadcrumbProps) {
  const { dir } = useLocale();
  if (crumbs.length === 0) return null;

  const separator = dir === "rtl" ? "‹" : "›";

  return (
    <div className="px-4 py-1">
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.map((crumb, i) => {
            const isLast = i === crumbs.length - 1;
            if ("skeleton" in crumb) {
              return (
                <BreadcrumbItem key={i}>
                  <Skeleton className="h-3 w-20 rounded" />
                </BreadcrumbItem>
              );
            }
            return (
              <BreadcrumbItem key={i}>
                {isLast ? (
                  <BreadcrumbPage className="text-xs font-normal">
                    {crumb.label}
                  </BreadcrumbPage>
                ) : (
                  <>
                    <BreadcrumbLink asChild className="text-xs">
                      <Link href={crumb.href ?? "/"}>{crumb.label}</Link>
                    </BreadcrumbLink>
                    <BreadcrumbSeparator className="text-xs">{separator}</BreadcrumbSeparator>
                  </>
                )}
              </BreadcrumbItem>
            );
          })}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
