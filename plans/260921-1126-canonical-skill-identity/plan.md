# Plan — canonical skill identity + alias layer (issue #25) và CLI version drift (issue #24)

- Ngày: 2026-09-21
- Branch: `handle-opened-issues` (base `main` @ `d093fa6`)
- Recon evidence: `plans/reports/recon-260921-1037-issue-25-24-evidence.md`
- Phạm vi: chỉ #25 và #24 (code + data + migration). #21 và #23 chỉ nhận issue comment.

## 1. Vấn đề

Hai lỗi độc lập cùng nằm trong một lớp "identity" bị suy ra từ display name:

1. **Historical import corruption** — `scripts/fetch-skillsmp-all.mjs:194` và
   `scripts/fetch-skillsmp-skills.mjs:163` disambiguate slug bằng `skill.id.slice(-6)`.
   Khi `skill.id` là `.../SKILL.md`, `slice(-6)` = `ILL.md` → slug nhận hậu tố `ill-md`.
2. **Current identity collision** — `apps/web/app/lib/github/fetch-github-skill.ts:159` tạo
   slug `${owner}-${skillName}` trong khi `scan-github-repo.ts` chỉ truyền leaf folder name;
   `api.skill-register.ts` dedup theo `slug`, nên skill thứ hai cùng leaf name bị coi là
   "existing" và bị skip.

Đo trên dữ liệu committed: 5081 row, 49 slug trùng exact, 311 row mang `-ill-md`, và sau khi
strip hậu tố đó thì có **237 nhóm tên trùng với 548 row bị ảnh hưởng**. Toàn bộ 548 row đều có
`source_url` parse được `repo + path`.

Lỗi #24 tách biệt và nhỏ: `packages/cli/src/index.ts:15` hardcode `.version('0.1.2')` trong khi
`packages/cli/package.json` là `0.4.0`; binary đã build in `0.1.2`.

## 2. Quyết định thiết kế

### D1 — Canonical identity là `(source_repo, source_path)`

Thêm hai cột vào `skills`:

- `source_repo` TEXT — `owner/repo`, lowercase (ví dụ `ypyt1/all-skills`).
- `source_path` TEXT — path trong repo, `''` cho skill ở repo root.

Ràng buộc: partial unique index trên `(source_repo, source_path)` với
`WHERE source_repo IS NOT NULL`. Identity **không** dựa vào display name, nên hai skill cùng
leaf name ở hai path khác nhau là hai identity khác nhau (AC 3).

### D2 — Trích identity từ `source_url`

`https://github.com/{owner}/{repo}/tree/{branch}/{path}` → `{ owner, repo, path }`.
26/5081 row không có `source_url` parse được → fallback identity `nosrc:{author}/{name}` và
`source_repo = NULL` (không tham gia unique index).

### D3 — Canonical slug là hàm thuần của identity

```
identity = `${repo.toLowerCase()}/${path}`        (hoặc nosrc key ở D2)
base     = slugify(`${owner}-${leaf}`)            (leaf = segment cuối của path, hoặc repo khi path='')
slug     = taken.has(base) ? `${base}-${sha256(identity).slice(0,8)}` : base
           (nếu vẫn trùng thì nới hash lên 12/16/24)
```

`taken` do caller truyền vào, nên **cùng một hàm** dùng cho cả generator offline và runtime
registration. Deterministic và không phụ thuộc thứ tự arrival trong phạm vi một input set;
`hash8` ổn định theo identity nên re-register cùng source luôn cho cùng slug.

Mô phỏng trên `scripts/seed-data.json` hiện tại:

```text
input rows                  : 5081
distinct identities         : 5060
dropped duplicate rows      : 21   (cùng identity, xem D4)
kept rows                   : 5060
slugs changed by rule       : 824
new slugs containing ill-md : 0
remaining duplicate slugs   : 0
```

Ví dụ đúng ca của issue:

```text
ypyt1/all-skills/skills/_local/clawd-skills/ui-ux-pro-max  ypyt1-ui-ux-pro-max          -> ypyt1-ui-ux-pro-max
ypyt1/all-skills/skills/ui-ux-pro-max                      ypyt1-ui-ux-pro-max-ill-md   -> ypyt1-ui-ux-pro-max-719a8cd0
openai/codex/.../samples/skill-creator                     openai-skill-creator         -> openai-skill-creator
openai/skills/skills/.system/skill-creator                 openai-skill-creator-ill-md  -> openai-skill-creator-719a8cd0
```

Lưu ý cuối: hai identity khác nhau cùng base `openai-skill-creator` — identity nào tới trước
giữ base slug, identity còn lại nhận hash8. Slug là **routing key**, identity mới là nguồn sự
thật, và mọi slug cũ đều được alias (D5).

### D4 — Mỗi identity giữ đúng một row

21 row là bản trùng thật của cùng một identity (ví dụ `marketing-ideas` và
`coreyhaines31-marketing-ideas` cùng trỏ `coreyhaines31/marketingskills/skills/marketing-ideas`).
Giữ row theo thứ tự ưu tiên: row đang giữ base slug → content dài hơn → slug nhỏ hơn theo lexical.
Row bị bỏ **không bị xoá khỏi DB**, chỉ không còn xuất hiện trong seed JSON; slug của nó trở
thành alias trỏ tới row được giữ, nên URL cũ vẫn sống.

### D5 — Alias table là lớp redirect

```sql
CREATE TABLE skill_aliases (
  slug       TEXT PRIMARY KEY,
  skill_id   TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  reason     TEXT NOT NULL DEFAULT 'legacy',   -- 'legacy' | 'duplicate-source' | 'renamed'
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_skill_aliases_skill_id ON skill_aliases(skill_id);
```

Thứ tự resolve ở mọi read path: `skills.slug` → `skill_aliases.slug`. Một helper duy nhất
`resolveSkillBySlug(db, slug)` thay cho 9 chỗ đang `eq(skills.slug, slug)` trực tiếp
(`api.skill-detail.ts:53`, `api.skill-rate.ts:39`, `api.skill-review.ts:21,81`,
`api.skill-favorite.ts:28`, `api.skill-install.ts:56`, `api.skill-vote.ts:47`,
`api.usage-report.ts:75`, `lib/db/skill-detail-queries.ts:10`).

### D6 — Chia sẻ thuật toán giữa TS app và script Node

Tạo workspace package `packages/skill-identity` (plain ESM `.js` + `.d.ts`, zero dependency):
`parseSourceUrl`, `baseSlug`, `pickSlug`, `slugify`, `hash8`. Web app dùng qua dependency
`workspace:*`; `scripts/*.mjs` import trực tiếp bằng relative path. Một implementation duy nhất,
đúng DRY, loại bỏ hẳn lớp lỗi "hai bên lệch nhau".

Fallback nếu Vite/Workers build không resolve được workspace package: giữ implementation TS
trong `apps/web/app/lib/skills/identity.ts`, copy sang `.mjs`, và thêm test fixture chung assert
hai bên cho cùng output. Ghi rõ lý do trong PR nếu phải dùng fallback.

### D7 — Backfill

`scripts/backfill-skill-identities.mjs`, các mode:

- `--from-seed --write` — viết lại `scripts/seed-data.json` theo D1–D4, deterministic.
- `--sql` — sinh SQL remediation cho D1: `UPDATE skills SET slug, source_repo, source_path` +
  `INSERT INTO skill_aliases`, kèm file backup JSON của các row bị ảnh hưởng.
- `--apply-local` — chạy SQL đó lên local D1 để verify.

Production apply cần `wrangler` đã đăng nhập (hiện **chưa** — `wrangler whoami` báo
`You are not authenticated`), và repo không có deploy workflow chạy migration. Vì vậy PR sẽ
kèm đúng một command remediation cho operator; nếu sau merge command đó chưa chạy thì live
marketplace vẫn giữ dữ liệu cũ và đây là blocker được ghi nhận, không được tuyên bố là đã xong.

### D8 — #24 version đọc từ package.json

Bỏ `.version('0.1.2')`, lấy version từ `packages/cli/package.json` tại build time. Test regression
build binary rồi assert `--version === package.json.version`, không chỉ so một constant trong
source.

### D9 — CLI round-trip full source path

- `parseIdentifier` nhận ≥3 phần: `parts[0]=org`, `parts[1]=repo`, `parts[2..]` nối thành
  `skillPath`. Hiện 4+ phần rơi vào nhánh `slug` nên path bị mất hoàn toàn.
- Resolve theo identity trước: `GET /api/skills-resolve?repo=org/repo&path=<skillPath>` (route
  mới `api/skills-resolve.ts`), fallback slug `slugify(org + '-' + leaf)`, cuối cùng mới
  register với `skill_path` là **full path**.

## 3. Thay đổi dự kiến

Mới:

- `packages/skill-identity/{package.json,index.js,index.d.ts}`
- `apps/web/app/lib/db/skill-aliases.ts` — `resolveSkillBySlug` + alias lookup
- `apps/web/app/routes/api.skills-resolve.ts`
- `apps/web/drizzle/migrations/0009_*.sql` (qua `pnpm db:generate`)
- `scripts/backfill-skill-identities.mjs`
- `scripts/assert-seed-identity.mjs` — assert 0 trùng / 0 `-ill-md`, deterministic
- tests: `packages/skill-identity/index.test.ts`, `apps/web/app/lib/skills/identity.test.ts`
  (registration disambiguation), alias resolution test, `packages/cli/src/version.test.ts`,
  CLI identifier test cho path nhiều tầng

Sửa:

- `scripts/fetch-skillsmp-all.mjs`, `scripts/fetch-skillsmp-skills.mjs` — bỏ `slice(-6)`
- `scripts/seed-data.json` — regenerate
- `apps/web/app/lib/db/schema.ts` — 2 cột + bảng alias
- `apps/web/app/lib/github/fetch-github-skill.ts` — identity + slug theo D3
- `apps/web/app/routes/api.skill-register.ts` — lookup theo identity, không skip theo slug
- `apps/web/app/routes/api.admin.seed.ts` — conflict target theo identity
- 9 read path ở D5 — dùng `resolveSkillBySlug`
- `packages/cli/src/index.ts`, `packages/cli/src/commands/use.ts`
- `apps/web/app/routes.ts` — route mới

## 4. Phases và acceptance criteria

| Phase | Nội dung | AC |
| --- | --- | --- |
| A | `packages/skill-identity` + tests | hàm thuần, fixture cho ca `-ill-md`, identity không dựa display name |
| B | Schema + migration 0009 | `pnpm db:migrate` apply sạch local; có partial unique index và `skill_aliases` |
| C | Generator + regenerate seed | `scripts/seed-data.json` 0 slug trùng, 0 `-ill-md`; assert script deterministic (2 lần chạy cùng output) |
| D | Runtime registration + admin seed theo identity | test 2 skill cùng leaf name khác path đăng ký được cả hai |
| E | Alias resolution + CLI round-trip | alias test pass; `org/repo/a/b` giữ nguyên full path |
| F | #24 version | binary `--version` === `package.json.version` |

## 5. Verification

- `pnpm install && pnpm typecheck && pnpm test` → 0 failure (baseline 38 test phải còn pass).
- `node packages/cli/dist/index.js --version` === `packages/cli/package.json` version.
- `node scripts/assert-seed-identity.mjs` → duplicate 0, `-ill-md` 0; chạy lại cho cùng kết quả.
- `pnpm db:migrate` (local) sạch; test alias resolution chạy trên local D1.
- Đọc lại 4 issue + analysis, map từng root cause sang dòng code đã đổi hoặc ghi out-of-scope.
- Code review fresh context không còn finding blocking.
- Sau merge: CI `main` xanh; verify live search; nếu remediation chưa chạy được thì ghi blocker.

## 6. Rủi ro

| Rủi ro | Giảm thiểu |
| --- | --- |
| Đổi 824 slug ảnh hưởng URL/link ngoài | alias table + backfill giữ mọi slug cũ; `reason` ghi rõ nguồn |
| Vite/Workers không resolve workspace package | fallback D6, verify bằng `pnpm build` trước khi ship |
| Rename slug trên production cần quyền | PR kèm command remediation; nếu chưa chạy được → blocker, không tuyên bố xong |
| 21 row bị collapse mất dữ liệu | không xoá row trong DB, chỉ loại khỏi seed JSON + alias slug cũ |
| Hook workspace chặn command chứa `dist` | dùng biến shell trong script test/verify |

## 7. Ngoài phạm vi

Epic #21 (installer/packaging, manifest, R2 immutable artifact, tách metric install vs use),
publish 24 skill BulkPublish của #23, capability metadata model, các issue #26–#38. Các mục này
chỉ nhận comment điều chỉnh scope/acceptance criteria, không code.

## 8. Issue comment plan

- **#25**: xác nhận 2 root cause độc lập; nêu quy mô thật 237 nhóm / 548 row (lớn hơn "29 of 159");
  nêu canonical identity `repo + full path`, alias layer, và rằng #21 phụ thuộc trực tiếp vào việc này.
- **#24**: xác nhận bug + bằng chứng build; AC test phải build binary và assert với `package.json`;
  ghi thêm quan sát npm `latest` còn `0.3.0` trong khi `main` đã `0.4.0`.
- **#21**: giữ hướng issue nhưng nâng thành packaging/install epic; ghi rõ dependency vào #25 và
  artifact manifest/immutability là điều kiện tiên quyết.
- **#23**: sửa wording safety — annotation không đồng nghĩa server luôn bắt explicit confirmation;
  đề xuất capability metadata tách khỏi `risk_label`.
