# 发布治理清单（批三 1/2 草案）

> **状态：未启用发布。** 本文件是「启用发布」的人工执行清单：技术草案
> （`.github/workflows/publish.yml`）已就位，等用户拍板发布目标与分支策略后
> 逐项执行即可。**本卡不做**：不建 `main` 分支、不配置 CI secrets、不实际
> 发布、不改 `ci.yml`、不引入版本自动化工具、不改插件源码。

## 一、现状核验（2026-11-04）

| 项               | 现状                                                                       | 出处                                     |
| ---------------- | -------------------------------------------------------------------------- | ---------------------------------------- |
| 分支             | 只有 `dev`，**无 `main`**                                                  | `git branch -a`                          |
| CI               | 单 `gate` job，`push` 触发分支写 `[main, dev]` → `main` 不存在，那条是摆设 | `.github/workflows/ci.yml:3-7`           |
| publish workflow | 本卡新增**草案** `.github/workflows/publish.yml`（tag `v*` 触发；未启用）  | —                                        |
| 包名 / 版本      | `@zhidal/dsh-victauri@0.1.0`                                               | `package.json:2-4`                       |
| 发布权限         | `publishConfig.access: public`（npmjs 公共 scope）                         | `package.json:19-21`                     |
| 包内容白名单     | `files: ["dist", "cordis.patch.yml", "README.md"]`                         | `package.json:9-13`                      |
| 构建             | `prepare` & `prepack` = `npm run build`（esbuild → `dist/index.js`）       | `package.json:31-34`                     |
| `dist/` 状态     | 在 `.gitignore`（不进 git），发布靠 `prepack` 在打包/发布时构建            | `.gitignore:2`                           |
| 自动激活         | `cordis.patch.yml` 声明 `dsh.bundle.patch`，随包分发                       | `package.json:26-30`、`cordis.patch.yml` |
| 包名占用         | `npm view @zhidal/dsh-victauri` → **E404**（该包名尚未在 npmjs 发布）      | 实测 2026-11-04                          |
| 类型声明         | `"types": "src/index.ts"`，但 `src/` **不在** `files` 白名单 → 见第 1 步   | `package.json:8-13`                      |

`npm pack --dry-run` 实测包内容（6 个文件 / 334.1 kB 压缩 / 1.3 MB 解压）：

```
LICENSE              1.1kB
README.md           10.0kB
cordis.patch.yml     170B
dist/index.js      414.9kB
dist/index.js.map  911.8kB
package.json         2.0kB
```

## 二、待用户拍板的决策项（本卡不代决策）

### 决策 1：发布目标

| 选项                          | 说明                                                                     | 需要改的地方                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| **A. npmjs 公共（草案默认）** | `@zhidal/dsh-victauri` 公开可安装，`publishConfig.access: public` 已就位 | workflow 的 `registry-url` 保持 npmjs；需 npm 上已存在 `@zhidal` scope 且账号有发布权                      |
| B. 私有 registry              | npmjs 付费私有 / Verdaccio / 公司 Artifactory                            | 改 workflow `registry-url`；`publishConfig.access` 改 `restricted`；`NPM_TOKEN` 换成私有 registry 的 token |
| C. 不发 npm，只走 git 安装    | 保持 `github:lzhida/dsh-victauri` 安装方式                               | 不启用 publish workflow，本卡草案归档为备选                                                                |

**草案默认 A。** 若选 B，改动点见第 4 步「若选决策 1 的 B」。

### 决策 2：`main` 分支策略

| 选项                                                            | 说明                                                                 | 评价                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **A. `main` + `dev` 双轨（推荐）**                              | `main` = 可发布稳定线，`dev` = 开发线；PR `dev → main`，合并后打 tag | 与 `ci.yml` 现有 `branches: [main, dev]` 一致，发布线与开发线分离 |
| B. 只用 `dev`，tag 直接从 `dev` 打                              | 省一次合并                                                           | `dev` 未受保护、发布线与开发线混同，回滚困难                      |
| C. `main` 只作发布分支（`dev → main` fast-forward，无 PR 审查） | 轻量                                                                 | 无人工闸门，误合并直接进发布线                                    |

推荐 **A**，配套规则：`main` 设为 protected branch（禁止直推、要求 PR、要求 CI 绿）、
合并用 squash、**版本 tag 只从 `main` 打**。

### 决策 3：发版触发方式

草案已同时实现两种（推荐都留）：

- **tag `v*` 推送** → 全门禁 + 正式发布（发布主路径）；
- **手动 `workflow_dispatch`** → 默认 `dry_run=true`（只跑门禁与打包校验，不发布），
  确认无误后手动跑一次 `dry_run=false`；
- 版本号策略：**手工 bump**（本卡不引入 changesets / semantic-release 等自动化工具）。

## 三、启用步骤（逐项打勾）

### 第 1 步：修发布阻塞项（`npm pack --dry-run` 实测发现）

1. **`types` 指向包内不存在的文件（阻塞级）**：`package.json` 的
   `"types": "src/index.ts"`，而 `files` 白名单只有 `dist / cordis.patch.yml /
README.md` → 发布的包里**没有 `src/`**，TypeScript 消费者拿到坏路径。三选一：
   - **建议**：build 产出声明文件（esbuild 加 `--dts`，或 `tsc --emitDeclarationOnly`），
     并把 `"types"` 改指 `dist/index.d.ts`（包体可控、类型可用）；
   - 或把 `src` 加进 `files`（包体变大，与现状一致，改动最小）；
   - 或删掉 `types` 字段（消费者回落到 JS 推断）。
2. **sourcemap 随包发布**：`dist/index.js.map` 911.8 kB（解压后 1.3 MB）。如需瘦身，
   把 `dist/*.map` 移出 `files`，或在发布前删掉 map。
3. ✅ `README.md`（10.0 kB）、`LICENSE`（npm 自动收录）、`cordis.patch.yml`（170B，
   **自动激活关键文件，不可漏**）均在包内。

### 第 2 步：建 `main` 分支（若决策 2 选 A/C）

```bash
git switch -c main dev        # 从 dev 起主干
git push -u origin main
# GitHub：Settings → Branches → Protect main
#   ✅ Require a pull request before merging（禁止直推）
#   ✅ Require status checks to pass（要求 CI 绿）
```

### 第 3 步：仓库设置 secrets 与 environment（**不在本卡做**）

1. npm 上确认 `@zhidal` scope 存在且账号有发布权限；创建 **Automation token**
   （classic token，勾 `read/write` + 发布范围）。**不要**用账号密码。
2. GitHub 仓库 → Settings → Secrets and variables → Actions → New repository secret：
   - Name：`NPM_TOKEN`
   - Secret：上一步的 token
     （**只写进 GitHub secret，不要写进仓库任何文件**）。
3. Settings → Environments → New environment：名称 `npm-publish`
   （与 workflow 的 `environment:` 对齐）；可加 Deployment protection rule
   （required reviewers），把「谁能发版」变成仓库级策略。

### 第 4 步：启用 workflow

草案文件已就位（`.github/workflows/publish.yml`）。启用方式二选一：

- 直接合并（tag 推送即发布）；
- 先把 `name: Publish` 改为 `Publish (draft)`、或临时只留 `workflow_dispatch` 触发，
  等首次手动 `dry_run=true` 走通后再放开 tag 触发。

**若决策 1 选 B（私有 registry）**，改三处：

1. `actions/setup-node` 的 `registry-url:` 换成私有 registry 地址；
2. `package.json` 的 `publishConfig.access` 改 `restricted`；
3. `NPM_TOKEN` 换成私有 registry 的 token。

### 第 5 步：首次发布（手动步骤）

```bash
# 1) 版本号 bump（手工）
#    编辑 package.json version（例如 0.1.0 → 0.1.1）；如有 README 工具口径一并同步
# 2) 本地全门禁 + 打包核对
pnpm install --frozen-lockfile
pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
npm pack --dry-run          # 核对 Tarball Contents、文件名与版本
# 3) 提交版本号（走 PR → main）
git checkout main && git pull
git merge --no-ff dev       # 或按决策 2 的 PR 流程
# 4) 打 tag（tag 与 package.json 版本必须一致，workflow 会再校验一次）
git tag -a v0.1.1 -m "release: v0.1.1"
git push origin main --tags
# 5) 盯 CI：Publish workflow 变绿 → npmjs 上可见新版本
npm view @zhidal/dsh-victauri versions
```

### 第 6 步：发布后验证

- `npm view @zhidal/dsh-victauri@0.1.1 dist.tarball` 可取到 tarball；
- 装到干净环境验证：`pnpm dsh plugin --profile test add @zhidal/dsh-victauri`，
  确认插件自动激活（`cordis.patch.yml` 生效）；
- 工具面口径核对：安装后 `victauri_tools_list` 应看到 **38** 个工具
  （与仓库 README / `docs/TOOLS.md` / 契约测试同源）。

## 四、回滚与撤回

- npm **不允许**删除已发布版本（72h 内可 unpublish，但会破坏依赖方）。正确做法：
  `npm deprecate @zhidal/dsh-victauri@0.1.1 "有缺陷，请升级到 0.1.2"` + 补发补丁版本。
- workflow 误触发（tag 打错）：立刻 `npm deprecate` + 删 tag
  （`git push --delete origin v0.1.1`）+ 重打正确 tag。
- 发布后才发现本该被门禁拦住的问题：修代码 → 补发 patch 版本。

## 五、遗留观察项

- **本地校验 workflow 语法**：仓库带 `.yamllint.yaml`（规则放宽理由写在文件内
  注释里），命令 `python -m yamllint .github/workflows/` → exit 0；
  语义断言（tag 触发 `v*`、五道门禁齐备、`NPM_TOKEN` 仅为
  `${{ secrets.NPM_TOKEN }}` 占位且无硬编码）由 PyYAML 脚本逐项断言通过。
- `ci.yml` 的 `branches: [main, dev]`：`main` 建立前只 `dev` 生效；建立后 `main`
  自动纳入 CI，**无需改 `ci.yml`**。
- `esbuild` 放在 `dependencies`（`README.md:30`）是刻意的（git 安装时 pnpm 不装
  devDependencies），不要为了「瘦身」挪进 `devDependencies`。
- `prepare` 在本仓 `npm install` 时也会触发 build；CI 里 `pnpm install` 已隐式构建
  一次，workflow 里显式 `pnpm build` 只为让构建失败更早暴露。
- 审计矩阵「待裁决项 ②（发布治理：发布目标与 main 分支策略）」即由本卡承接：
  技术草案 = 本文件 + `publish.yml`，**最终拍板权在用户**。
