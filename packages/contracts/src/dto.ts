/**
 * Public catalog DTO versus protected payload DTO.
 *
 * `skills.content` is the SKILL.md payload. Public catalog DTOs deliberately do
 * NOT carry it, so a projection that forgets authorization simply cannot leak.
 * Reading the payload requires an explicit access decision from the resolver.
 */

import type { PayloadDenialReasonValue } from "./payload-access";

export interface PublicReferenceDto {
  id: string;
  title: string;
  filename: string;
  url: string | null;
  type: string | null;
}

export interface PublicScriptDto {
  name: string;
  description?: string;
  language?: string;
  url?: string;
}

/** Catalog metadata safe to serve on every public surface. */
export interface PublicCatalogListingDto {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  version: string | null;
  sourceUrl: string | null;
  isPaid: boolean;
  priceCents: number;
  riskLabel: string;
  installCount: number;
  avgRating: number;
  ratingCount: number;
  favoriteCount: number;
  netVotes: number;
  updatedAt: string | null;
}

/** Detail metadata. Still carries no payload. */
export interface PublicSkillDetailDto extends PublicCatalogListingDto {
  installCommand: string | null;
  references: PublicReferenceDto[];
  scripts: PublicScriptDto[];
  reviews: PublicReviewDto[];
}

export interface PublicReviewDto {
  id: string;
  userId: string;
  content: string;
  isAgent: boolean;
  createdAt: string | null;
}

export type { PayloadDenialReasonValue as PayloadDenialReason };

/** Shape of the payload when access is granted. */
export interface ProtectedSkillPayloadDto {
  content: string;
}
