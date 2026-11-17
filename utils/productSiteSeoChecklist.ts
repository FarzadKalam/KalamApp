export interface ProductSiteSeoInput {
  title?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  slug?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  focusKeyword?: string | null;
}

export interface ProductSiteSeoCheck {
  key: string;
  label: string;
  passed: boolean;
  hint: string;
}

const plainText = (value: unknown) => String(value ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

/** Transparent writing checklist only; this is not a Google, Yoast, or Rank Math score. */
export function getProductSiteSeoChecklist(input: ProductSiteSeoInput): ProductSiteSeoCheck[] {
  const title = plainText(input.title);
  const shortDescription = plainText(input.shortDescription);
  const description = plainText(input.description);
  const slug = plainText(input.slug);
  const seoTitle = plainText(input.seoTitle);
  const seoDescription = plainText(input.seoDescription);
  const imageUrl = plainText(input.imageUrl);
  const imageAlt = plainText(input.imageAlt);
  const focusKeyword = plainText(input.focusKeyword).toLocaleLowerCase();
  const pageText = `${title} ${shortDescription} ${description}`.toLocaleLowerCase();
  const titleLength = (seoTitle || title).length;
  const metaLength = seoDescription.length;

  return [
    { key: 'title', label: 'عنوان محتوای سایت', passed: title.length > 0, hint: 'برای محصول یک عنوان روشن بنویسید.' },
    { key: 'description', label: 'توضیحات محصول', passed: shortDescription.length > 0 || description.length > 0, hint: 'حداقل توضیح کوتاه یا کامل را وارد کنید.' },
    { key: 'seo-title', label: 'عنوان SEO', passed: titleLength >= 30 && titleLength <= 65, hint: 'عنوان SEO بهتر است حدود ۳۰ تا ۶۵ نویسه باشد.' },
    { key: 'meta-description', label: 'توضیح متا', passed: metaLength >= 70 && metaLength <= 170, hint: 'توضیح متا بهتر است حدود ۷۰ تا ۱۷۰ نویسه باشد.' },
    { key: 'slug', label: 'نشانی کوتاه (slug)', passed: /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), hint: 'از حروف لاتین کوچک، عدد و خط تیره استفاده کنید.' },
    { key: 'image', label: 'تصویر منتخب سایت', passed: imageUrl.length > 0, hint: 'تصویر سایت می‌تواند با تصویر اصلی CRM متفاوت باشد.' },
    { key: 'image-alt', label: 'متن جایگزین تصویر', passed: !imageUrl || imageAlt.length > 0, hint: 'برای دسترس‌پذیری و فهم تصویر، متن جایگزین بنویسید.' },
    { key: 'keyword', label: 'عبارت کلیدی در محتوا', passed: !focusKeyword || pageText.includes(focusKeyword), hint: 'اگر عبارت کلیدی تعیین شد، طبیعی در متن محصول هم به‌کار رود.' },
  ];
}
