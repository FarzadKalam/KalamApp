export interface PublicSolutionRelatedLink {
  label: string;
  to: string;
}

export interface PublicSolutionFaqItem {
  question: string;
  answer: string;
}

export interface PublicSolutionItem {
  path: string;
  file: string;
  category: string;
  navLabel: string;
  title: string;
  eyebrow: string;
  description: string;
  intro: string;
  benefits: string[];
  useCases: string[];
  screenshot: string;
  screenshotAlt: string;
  relatedLinks: PublicSolutionRelatedLink[];
  faq: PublicSolutionFaqItem[];
}

export const PUBLIC_SOLUTIONS_INDEX_SEO: {
  path: string;
  file: string;
  title: string;
  description: string;
  heading: string;
  body: string;
  image: string;
};

export const PUBLIC_SOLUTIONS: PublicSolutionItem[];
export const PUBLIC_SOLUTIONS_BY_PATH: Record<string, PublicSolutionItem>;
