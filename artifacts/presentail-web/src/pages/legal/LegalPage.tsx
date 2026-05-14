import type { ReactNode } from "react";

export type LegalSection = {
  heading: string;
  body: (string | { subheading: string; body: (string | string[])[] })[];
};

type Props = {
  eyebrow: string;
  title: string;
  intro?: ReactNode;
  meta?: { label: string; value: string }[];
  sections: LegalSection[];
  testId: string;
  lang: string;
};

export function LegalPage({
  eyebrow,
  title,
  intro,
  meta,
  sections,
  testId,
  lang,
}: Props) {
  return (
    <div className="bg-background" data-testid={testId} lang={lang}>
      <section className="container mx-auto px-4 pt-16 pb-10 md:pt-24 md:pb-12 max-w-3xl">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-4">
          {eyebrow}
        </p>
        <h1 className="text-4xl md:text-5xl font-serif leading-tight mb-6">
          {title}
        </h1>
        {intro ? (
          <div className="text-base text-muted-foreground leading-relaxed space-y-4">
            {intro}
          </div>
        ) : null}
        {meta && meta.length > 0 ? (
          <dl className="mt-6 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2 max-w-md">
            {meta.map((m) => (
              <div key={m.label} className="flex gap-2">
                <dt className="font-medium text-foreground">{m.label}:</dt>
                <dd>{m.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </section>

      <section className="container mx-auto px-4 pb-20 md:pb-24 max-w-3xl">
        <article
          dir="ltr"
          lang="en"
          className="prose prose-neutral max-w-none text-foreground leading-relaxed text-[0.95rem]"
        >
          {sections.map((s, i) => (
            <section key={i} className="mb-10">
              <h2 className="text-xl md:text-2xl font-serif mt-0 mb-4">
                {s.heading}
              </h2>
              {s.body.map((b, j) => {
                if (typeof b === "string") {
                  return (
                    <p key={j} className="mb-4 text-muted-foreground">
                      {b}
                    </p>
                  );
                }
                return (
                  <div key={j} className="mb-5">
                    <h3 className="font-serif text-base mb-2">
                      {b.subheading}
                    </h3>
                    {b.body.map((p, k) =>
                      Array.isArray(p) ? (
                        <ul
                          key={k}
                          className="list-disc ms-6 mb-3 space-y-1 text-muted-foreground"
                        >
                          {p.map((li, m) => (
                            <li key={m}>{li}</li>
                          ))}
                        </ul>
                      ) : (
                        <p key={k} className="mb-3 text-muted-foreground">
                          {p}
                        </p>
                      ),
                    )}
                  </div>
                );
              })}
            </section>
          ))}
        </article>
      </section>
    </div>
  );
}
