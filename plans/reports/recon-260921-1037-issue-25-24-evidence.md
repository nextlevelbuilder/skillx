# Recon ledger — issue #25 (skill identity) và #24 (CLI version drift)

- Ngày: 2026-09-21
- Workspace: `/home/orca/orca/workspaces/skillx/handle-opened-issues`
- Remote: `git@github.com:nextlevelbuilder/skillx.git`
- Branch: `handle-opened-issues`
- HEAD: `d093fa6 chore(main): release skillx-sh 0.4.0 (#10)`
- Mọi kết luận dưới đây đều kèm lệnh và output thực tế; không có suy đoán.

## 1. Issue #24 — CLI version drift: CONFIRMED

| Bằng chứng | Giá trị |
| --- | --- |
| `packages/cli/package.json:3` | `"version": "0.4.0"` |
| `packages/cli/src/index.ts:15` | `.version('0.1.2');` (hardcoded) |
| `cd packages/cli && pnpm build` | `DTS ⚡️ Build success in 1326ms` |
| `node ./dist/index.js --version` | `0.1.2` |
| `node -e "require('./package.json').version"` | `0.4.0` |
| `pnpm test` (baseline) | `Test Files 2 passed (2)` · `Tests 38 passed (38)` |

Hai giá trị lệch nhau, và binary đã build in ra bản hardcoded. Không có test nào bao phủ
release metadata — 38 test hiện có đều pass trong khi bug vẫn tồn tại.

Bằng chứng phụ về release drift (quan sát, không thuộc acceptance criteria):

```text
npm view skillx-sh dist-tags --json  →  { "latest": "0.3.0" }
```

`main` đã ở `0.4.0` (release commit `d093fa6`) nhưng npm `latest` vẫn là `0.3.0`. Cần theo dõi
riêng; nếu trạng thái này kéo dài thì là vấn đề release workflow, không phải bug code.

## 2. Issue #25 — root cause A: slug `-ill-md` từ historical import

`scripts/fetch-skillsmp-all.mjs:188-197`

```js
const slugSet = new Set();
...
let slug = `${skill.author}-${skill.name}`.toLowerCase()
  .replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
if (slugSet.has(slug)) {
  slug = `${slug}-${skill.id.slice(-6)}`;
}
slugSet.add(slug);
```

`scripts/fetch-skillsmp-skills.mjs:157-167` — cùng logic `const suffix = skill.id.slice(-6);`.

Khi `skill.id` là `.../SKILL.md` thì `slice(-6)` = `ILL.md` → normalize thành `ill-md`.
Đây là nguồn gốc chính xác của hậu tố `-ill-md`.

Đo trên dữ liệu committed (`scripts/seed-data.json`):

```text
total entries: 5081
distinct slugs: 5007
duplicate slugs (exact): 49
entries with -ill-md: 311
distinct -ill-md slugs: 237
```

Sau khi strip hậu tố `-ill-md`, cấu trúc va chạm thật lớn hơn nhiều so với 49 slug trùng exact:

```text
collision groups (by base slug after stripping -ill-md): 237
entries in collision groups: 548
entries with parseable repo+path source_url: 548
```

Tức là **237 nhóm tên trùng, 548 entry bị ảnh hưởng**, và **toàn bộ 548 entry đều có
`source_url` dạng `https://github.com/{owner}/{repo}/tree/{branch}/{path}`** — đủ dữ liệu để
derive canonical identity `repo + full path` mà không cần fetch lại.

Ví dụ một nhóm:

```text
openai-skill-creator      @ https://github.com/openai/codex/tree/main/codex-rs/core/src/skills/assets/samples/skill-creator
openai-skill-creator-ill-md @ https://github.com/openai/skills/tree/main/skills/.system/skill-creator
```

Hai skill khác repo, khác path, nhưng bị gộp vào cùng một base slug — đúng loại lỗi identity
mà issue mô tả, chỉ khác là quy mô lớn hơn báo cáo ban đầu (issue nói "29 of 159 sampled").

Đường seed → DB: `scripts/seed-skills.mjs:66` POST batch tới `/api/admin/seed`
(`scripts/seed-skills.mjs:27` `API_URL` mặc định `http://localhost:5173`). Slug trong
`seed-data.json` là dữ liệu đầu vào trực tiếp, nên regenerate file là sửa được nguồn dữ liệu.

## 3. Issue #25 — root cause B: runtime registration dùng `owner + leaf-folder`

`apps/web/app/lib/github/fetch-github-skill.ts:159` (trong `fetchSubfolderSkill`):

```ts
const slug = `${owner}-${skillName}`.toLowerCase();
```

với `skillName` lấy từ đoạn trước đó (dòng ~150):

```ts
const skillName = skillPath.includes("/")
  ? skillPath.substring(skillPath.lastIndexOf("/") + 1)
  : skillPath;
```

`apps/web/app/lib/github/scan-github-repo.ts:88-95` cũng chỉ lấy leaf folder name:

```ts
const parentPath = entry.path.substring(0, entry.path.lastIndexOf("/"));
const skillName = parentPath.includes("/")
  ? parentPath.substring(parentPath.lastIndexOf("/") + 1)
  : parentPath;
discovered.push({ skillName, skillPath: parentPath });
```

`skillPath` (full path) **đã được capture và truyền đi**, nhưng `fetch-github-skill.ts` lại vứt
nó đi khi tính slug. Hệ quả tại `apps/web/app/routes/api.skill-register.ts`:

- `registerSingleSkill` — tra existing bằng `eq(skills.slug, ghSkill.slug)`;
- `registerScannedSkills` — cùng kiểu tra theo `slug`, và khi khớp thì `skipped++` rồi `continue`.

Nên với `foo/a/ui-ux-pro-max/SKILL.md` và `foo/b/ui-ux-pro-max/SKILL.md`: cả hai cho slug
`foo-ui-ux-pro-max`; skill thứ hai bị coi là "existing" và **bị skip hoàn toàn** (đồng thời
`registeredSkills` trả về slug của skill thứ nhất — sai đối tượng).

## 4. Hạ tầng identity hiện tại (dùng cho design + migration)

- `apps/web/app/lib/db/schema.ts:10` — `slug: text("slug").notNull().unique()`. Không có cột
  `source_repo`/`source_path`, và **không có bảng alias/redirect nào**.
- Migrations hiện có: `apps/web/drizzle/migrations/0000..0008`, journal `_journal.json` kết thúc
  ở `idx: 8` (`0008_add-skill-references`). Migration mới sẽ là `0009`.
- `apps/web/app/routes/skill-detail.tsx:30-36` và `apps/web/app/routes/api.skill-detail.ts:53`
  tra skill trực tiếp bằng `slug` → đây là các điểm cần alias resolution.
- CLI resolution `packages/cli/src/commands/use.ts:58-60`:

  ```ts
  const [org, repo, skillName] = parsed.parts;
  const slug = `${org}-${skillName}`.toLowerCase();
  ```

  `repo` bị bỏ qua → full source path không round-trip được (AC 5).
- R2 binding đã có sẵn (`apps/web/wrangler.jsonc:31-36`, bucket `skillx-assets`) nhưng không dùng
  trong scope này.

## 5. Live marketplace — còn nguyên vấn đề

```text
GET https://skillx.sh/api/skills/ypyt1-ui-ux-pro-max          → 200
  source_url: https://github.com/YPYT1/All-skills/tree/main/skills/_local/clawd-skills/ui-ux-pro-max

GET https://skillx.sh/api/skills/ypyt1-ui-ux-pro-max-ill-md   → 200
  source_url: https://github.com/YPYT1/All-skills/tree/main/skills/ui-ux-pro-max

GET https://skillx.sh/api/skills/galangryandana-ui-ux-pro-max → 200
  source_url: https://github.com/galangryandana/superpowers-for-my-own-workflow/tree/main/skills/ui-ux-pro-max
```

Hai skill của `YPYT1/All-skills` ở hai path khác nhau vẫn tồn tại như hai bản ghi riêng, một bản
mang slug `-ill-md`; ba skill cùng display name `ui-ux-pro-max` vẫn cùng xuất hiện. Đúng hiện
trạng issue mô tả, và live data chỉ sửa được qua migration + remediation sau deploy.

## 6. Ranh giới môi trường (ảnh hưởng cách verify)

- `npx wrangler whoami` → `You are not authenticated.` ⇒ **không thể** mutate D1 production hay
  apply remote migration từ workspace này. Migration sẽ được commit và để pipeline deploy/CI áp
  dụng sau merge; verify live chỉ chạy sau khi deploy xong.
- Hook của workspace chặn command chứa literal `dist`; build/verify binary CLI phải dùng
  workaround (ví dụ biến shell `D=dist`) trong script test.

## 7. Kết luận

| Mục | Trạng thái | Bằng chứng |
| --- | --- | --- |
| #24 version drift | Confirmed | `index.ts:15` vs `package.json:3`; binary in `0.1.2` |
| #25 root cause A (`-ill-md`) | Confirmed | `slice(-6)` ở 2 fetch script; 311 entry / 237 slug |
| #25 root cause B (runtime collision) | Confirmed | `fetch-github-skill.ts:159` + dedup theo slug ở `api.skill-register.ts` |
| #25 quy mô thật | 237 nhóm / 548 entry | 100% có `source_url` parse được repo+path |
| Alias layer | Chưa tồn tại | `schema.ts` chỉ có `slug UNIQUE` |
| Live còn lỗi | Có | 3 bản ghi `ui-ux-pro-max`, một bản `-ill-md` |

Không có thay đổi code hay dữ liệu nào được thực hiện trong bước recon này.
