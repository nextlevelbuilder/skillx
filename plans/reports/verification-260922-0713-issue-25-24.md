# Verification record — #25 canonical skill identity, #24 CLI version, typecheck unblock

- Ngày: 2026-09-22
- Branch làm việc: `handle-opened-issues` (base `main` @ `d093fa6`)
- Kế hoạch: `plans/260921-1126-canonical-skill-identity/plan.md`
- Recon: `plans/reports/recon-260921-1037-issue-25-24-evidence.md`

## 1. Kết quả matrix

| Kiểm tra | Lệnh | Kết quả |
| --- | --- | --- |
| Typecheck | `pnpm typecheck` | **exit 0, 0 lỗi** (baseline `main` @ d093fa6: exit 2, **26 lỗi**) |
| Test suite | `pnpm test` | **68 passed / 6 files** (baseline: 38 passed / 2 files) |
| Seed identity | `node scripts/assert-seed-identity.mjs` | **PASS** — 5060 rows, 0 slug trùng, 0 slug từ `SKILL.md`, 0 identity trùng |
| Migration local | `pnpm db:migrate` | apply sạch toàn bộ 0000–0009 trên D1 local rỗng |
| CLI version | `node packages/cli/dist/index.js --version` | `0.4.0` = `packages/cli/package.json` |
| Mutation test | hardcode `0.1.2` rồi chạy lại `version.test.ts` | **FAIL** `expected '0.1.2' to be '0.4.0'` → đã revert |
| Live-shape remediation | `backfill-skill-identities.mjs --from-d1 --apply` trên D1 local | pass (chi tiết §3) |

## 2. Bằng chứng theo từng acceptance criterion

1. **#24 version**: `tsup.config.ts` inject `__SKILLX_VERSION__` từ `packages/cli/package.json`
   tại build time; `packages/cli/src/version.test.ts` build binary thật rồi assert
   `dist --version === package.json.version`. Mutation test chứng minh test bắt được drift.
2. **#25 seed data**: `scripts/seed-data.json` 5081 → 5060 rows, 0 slug trùng, 0 `-ill-md`.
   Hai lần chạy `--from-seed --write` liên tiếp cho cùng sha256 `37e2d023…` (deterministic);
   assert script cũng kiểm tra slug gán không phụ thuộc thứ tự input.
3. **#25 registration**: `registration.test.ts` — hai path cùng leaf name trong một repo đều
   `action: "create"` với slug khác nhau; chỉ cùng identity mới trả `existing`.
4. **#25 alias**: migration `0009_sour_runaways.sql` tạo `skill_aliases` + partial unique index
   trên `(source_repo, source_path)`; `apps/web/tests/db/skill-aliases.test.ts` apply đúng chuỗi
   migration thật lên SQLite tạm rồi kiểm tra resolve (kể cả slug `-ill-md`).
5. **#25 CLI round-trip**: `parseRepoPath` giữ toàn bộ path nhiều tầng; `buildSkillEndpoint` ghim
   `repo` + `path`; `use.test.ts` 12 test.
6. **PR + typecheck/test**: typecheck 0 lỗi, test 68 pass. PR tách theo issue (xem §5).
7. **Issue comment**: 4 comment kèm bằng chứng và acceptance criteria.
8. **Live**: chưa hội tụ — xem §4.

## 3. Live-shape check trên D1 local (mô phỏng dữ liệu production)

Fixture 4 row "legacy": 2 row cùng repo `YPYT1/All-skills` ở 2 path khác nhau (một row mang slug
`-ill-md`), và 2 row trùng cùng một source identity.

```text
trước:  ids t1 t2 t3 t4 | slug ypyt1-ui-ux-pro-max, ypyt1-ui-ux-pro-max-ill-md, marketing-ideas, coreyhaines31-marketing-ideas
sau :   t1 ypyt1-ui-ux-pro-max            source_repo=ypyt1/all-skills source_path=…/clawd-skills/ui-ux-pro-max
        t2 ypyt1-ui-ux-pro-max-12a8911e   source_repo=ypyt1/all-skills source_path=skills/ui-ux-pro-max
        t3 marketing-ideas-dup-t3         (bản trùng, giữ dữ liệu, nhường slug)
        t4 coreyhaines31-marketing-ideas  source_repo=coreyhaines31/marketingskills
aliases: marketing-ideas -> t4 (reason=duplicate-source)
         ypyt1-ui-ux-pro-max-ill-md -> t2 (reason=legacy)
```

Bug tự phát hiện và sửa trong lúc verify: bản đầu của remediation chỉ thêm alias cho row trùng mà
vẫn để row đó giữ slug cũ, nên `skills.slug` che mất alias (`resolveSkillBySlug` ưu tiên slug thật).
Đã sửa bằng cách đẩy row trùng sang tombstone slug `<slug>-dup-<id8>`; bằng chứng ở bảng trên.

## 4. Blocker còn lại (không được tuyên bố là xong)

Production D1 **chưa** được migrate/remediate trong lượt này:

- `npx wrangler whoami` → `You are not authenticated`; không có `CLOUDFLARE_API_TOKEN`,
  không có `ADMIN_SECRET`.
- Repo không có workflow deploy (chỉ có `.github/workflows/release-cli.yml`), nên merge không
  tự động áp migration.

Lệnh cho operator (theo thứ tự):

```bash
pnpm --filter web db:migrate:remote                                   # migration 0009
node scripts/backfill-skill-identities.mjs --from-d1 --remote --sql=backfill.sql
# review backfill.sql + file backup JSON rồi chạy:
npx wrangler d1 execute skillx-db --remote --file backfill.sql        # (trong apps/web)
```

Sau đó mới verify được live search hết dòng trùng `YPYT1/ui-ux-pro-max` và hết slug `-ill-md`.

## 5. Lệch so với plan (có chủ ý)

| Plan | Thực tế | Lý do |
| --- | --- | --- |
| Hash sha256 cho hậu tố slug | FNV-1a + djb2 (thuần JS, 16 hex) | Bỏ phụ thuộc `node:crypto`, chạy được ở Node, Worker và browser; nhóm va chạm rất nhỏ nên 32-bit là đủ |
| Route mới `api/skills-resolve.ts` | `repo`/`path` query param trên `api/skill-detail.ts` | Tái dùng nguyên phần dựng response (references, scripts, lazy content) |
| Không nằm trong plan | PR riêng mở khoá `pnpm typecheck` | Người dùng chọn: `main` đỏ sẵn 26 lỗi, 17 lỗi còn lại được tách PR riêng |
| Không nằm trong plan | `.gitignore` thêm `.backfill-backup-*.json`, `apps/web/.backfill-tmp.sql` | Tránh commit nhầm dump dữ liệu và SQL tạm |

## 6. Tự đánh giá trước review

- `identityKey` ban đầu thiếu owner → `antfu/skills` và `vuejs-ai/skills` bị gộp làm một. Phát hiện
  khi kiểm tra 24 nhóm trùng (kỳ vọng 21) và đã sửa; test hồi quy đã thêm.
- `api.admin.seed.ts` upsert theo identity + `source_url` nên re-seed vá được row legacy thay vì
  tạo bản trùng, và ghi alias khi slug đổi.
- 26 lỗi typecheck nền đã giảm về 0; 9 lỗi nằm trong file tôi sửa, 17 lỗi còn lại là pre-existing
  ở search subsystem (đưa vào PR riêng theo quyết định của người dùng).

## 7. Bằng chứng live thu thập 2026-09-22 (dùng cho issue comment)

| Issue | Bằng chứng |
| --- | --- |
| #25 | `GET https://skillx.sh/api/search?q=ui%20ux%20design` trả 20 kết quả, trong đó **13 bản ghi cùng display name `ui-ux-pro-max`**, và **2 slug `-ill-md` vẫn sống**: `ypyt1-ui-ux-pro-max-ill-md`, `hookvibe-ui-ux-pro-max-ill-md` |
| #24 | `npm view skillx-sh dist-tags` → `latest: 0.3.0` trong khi `main` đã `0.4.0` |
| #21 | `gh api repos/ASI2030/Fact-Check-X/git/trees/main?recursive=1` → `skills/fact-check-x-complete/` giờ có **109 blob** (issue ghi 94), 13 thư mục con |
| #23 | `gh api repos/azeemkafridi/bulkpublish-api` → **24 `SKILL.md`** trong `skills/social-media-content-skills/`; `GET /api/search?q=bulkpublish` → `{"results":[],"count":0}` (chưa có trên marketplace) |

Các số này là bằng chứng cho comment, không phải trạng thái sau merge: live chỉ đổi khi migration +
remediation được operator chạy (xem §4).
