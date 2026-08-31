import type { BlocksContent } from "@strapi/blocks-react-renderer";

/**
 * Frontend Strapi types.
 *
 * We do NOT import the backend's generated types (backend/types/generated) here —
 * they depend on @strapi/strapi, which doesn't belong in the frontend. Instead,
 * hand-type the SHAPES the frontend actually consumes. Strapi 5 responses are
 * flattened (no `attributes` wrapper; entries carry `id` + `documentId`).
 *
 * When you model content in Strapi, add an interface here per content type and
 * pass it to strapiFetch<T>(). Example below.
 */

/** Common fields every Strapi 5 entry carries. */
export interface StrapiEntry {
  id: number;
  documentId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  locale?: string;
}

/** A Strapi media/upload object (flattened v5 shape, trimmed to common fields). */
export interface StrapiMedia extends StrapiEntry {
  url: string;
  alternativeText: string | null;
  width: number | null;
  height: number | null;
  mime: string;
  formats?: Record<string, { url: string; width: number; height: number }> | null;
}

/** The shared.seo component (non-repeatable) embedded in page content types. */
export interface Seo {
  metaTitle: string;
  metaDescription: string;
  ogImage?: StrapiMedia | null;
  canonicalURL?: string | null;
  preventIndexing?: boolean;
}

/** A Hero section block (sections.hero in Strapi). Heading + optional subheading,
 *  image, and a rich-text `content` body (Strapi Blocks editor). */
export interface HeroBlock {
  __component: "sections.hero";
  id: number;
  heading: string;
  subheading?: string | null;
  image?: StrapiMedia | null;
  content?: BlocksContent | null;
}

/** A single product entry (api::product.product). */
export interface ProductItem extends StrapiEntry {
  title: string;
  description?: string | null;
  images?: StrapiMedia[] | null;
}

/** A single repeatable product pick (shared.product-pick). Allows duplicates. */
export interface ProductPick {
  id: number;
  product?: ProductItem | null;
}

/** Product Hero block — infinite draggable fisheye grid of products (sections.product-hero). */
export interface ProductHeroBlock {
  __component: "sections.product-hero";
  id: number;
  heading?: string | null;
  picks?: ProductPick[] | null;
}

/** Union of all dynamic-zone block types. Add new blocks here as you build them. */
export type PageBlock = HeroBlock | ProductHeroBlock;

/** Page collection type: slug, localized SEO, and a dynamic zone of blocks. */
export interface Page extends StrapiEntry {
  title: string;
  slug: string;
  seo?: Seo | null;
  blocks?: PageBlock[];
}

/** Global single type: site-wide defaults used as SEO fallbacks. */
export interface Global extends StrapiEntry {
  siteName?: string | null;
  defaultMetaDescription?: string | null;
  defaultOgImage?: StrapiMedia | null;
}
