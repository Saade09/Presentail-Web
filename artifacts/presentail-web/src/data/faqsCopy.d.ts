type FaqItem = { q: string; a: string };
type FaqGroup = { title: string; items: FaqItem[] };
type FaqLangData = {
  eyebrow: string;
  title: string;
  intro: string;
  groups: FaqGroup[];
};

export declare const FAQ_COPY: Record<string, FaqLangData>;
