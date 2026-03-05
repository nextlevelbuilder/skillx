# Phase 5: Kits (Collections)

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 5h
- **Depends on:** Phase 1

Free feature for organizing skills into named collections. Authors create kits, users save them.

## Requirements

### Functional
- Authors create/edit/delete kits (name, description, public/private)
- Add/remove skills to kits
- Public kits visible in search and browsable
- Users can save kits (bookmark)
- Kit detail page shows member skills

### Non-functional
- Slug auto-generated from name
- Max 50 skills per kit
- Kit appears in search results alongside skills

## Architecture

Simple CRUD. Kits table + junction tables (from Phase 1 schema).

```
/kits/:slug → Kit detail page (loader fetches kit + skills)
/api/kits → GET (list), POST (create)
/api/kits/:slug → GET (detail), PUT (update), DELETE
/api/kits/:slug/skills → POST (add skill), DELETE (remove skill)
/api/kits/:slug/save → POST (toggle save)
```

## Related Code Files

| File | Action |
|------|--------|
| `apps/web/app/lib/kits/kit-queries.ts` | CREATE — CRUD queries |
| `apps/web/app/routes/api.kits.ts` | CREATE — list + create |
| `apps/web/app/routes/api.kit-detail.ts` | CREATE — get/update/delete |
| `apps/web/app/routes/api.kit-skills.ts` | CREATE — add/remove skills |
| `apps/web/app/routes/api.kit-save.ts` | CREATE — toggle save |
| `apps/web/app/routes/kit-detail.tsx` | CREATE — kit page |
| `apps/web/app/components/kit-card.tsx` | CREATE — card for search/browse |
| `apps/web/app/routes/routes.ts` | MODIFY — add kit routes |

## Implementation Steps

1. Create `kit-queries.ts`:
   - `createKit(db, { name, description, authorUserId, isPublic })` — generate slug, insert
   - `getKit(db, slug)` — fetch kit + skills + author info
   - `updateKit(db, kitId, updates)`
   - `deleteKit(db, kitId)` — cascade deletes kit_skills, user_kits
   - `addSkillToKit(db, kitId, skillId)` — enforce max 50
   - `removeSkillFromKit(db, kitId, skillId)`
   - `toggleSaveKit(db, userId, kitId)`
   - `listPublicKits(db, { limit, offset })`
   - `listUserKits(db, userId)` — kits created by or saved by user

2. Create `api.kits.ts`:
   - GET: list public kits (paginated)
   - POST: require auth, create kit

3. Create `api.kit-detail.ts`:
   - GET: public kit detail with skills
   - PUT: require auth + ownership, update kit
   - DELETE: require auth + ownership

4. Create `api.kit-skills.ts`:
   - POST: require auth + kit ownership, add skill
   - DELETE: require auth + kit ownership, remove skill

5. Create `api.kit-save.ts`:
   - POST: require auth, toggle save/unsave

6. Create `kit-detail.tsx`:
   - Loader: fetch kit + skills
   - Component: kit header (name, description, author, save button) + skill grid
   - Dark theme consistent with existing pages

7. Create `kit-card.tsx`:
   - Compact card showing kit name, skill count, author

8. Update `routes.ts`:
   - Add `/kits/:slug` route

## Todo List

- [ ] Create kit-queries.ts
- [ ] Create api.kits.ts
- [ ] Create api.kit-detail.ts
- [ ] Create api.kit-skills.ts
- [ ] Create api.kit-save.ts
- [ ] Create kit-detail.tsx
- [ ] Create kit-card.tsx
- [ ] Update routes.ts
- [ ] Typecheck

## Success Criteria

- Can create kit, add skills, view kit page
- Other users can save kits
- Private kits hidden from public listing
- Max 50 skills enforced

## Risk Assessment

- **Slug collisions**: Use `name + random suffix` if slug exists
- **Orphan kits**: If author deletes account, kits remain. Add cleanup job later.

## Security Considerations

- Only kit author can modify kit
- Private kits only visible to author
- Validate skill IDs exist before adding to kit
