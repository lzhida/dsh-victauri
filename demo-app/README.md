# demo-app — dsh-victauri e2e demo Tauri 应用

最小 vanilla Tauri 2 应用，用于 dsh-victauri 插件的端到端活体验证。**不进 CI**（仅本地验证）。

## 接入要点（官方 [getting-started](https://4da-systems.github.io/Victauri/getting-started.html) 0.10 optional 模式）

- `victauri-plugin` / `victauri-core` 以 **optional 依赖**挂在 `victauri` Cargo feature 后（`src-tauri/Cargo.toml`）；不带 feature 的构建零 victauri 代码。
- `victauri:default` capability **运行时授权**（`main.rs` 的 `with_victauri` + `add_capability`），不落 `capabilities/*.json`——capability 文件会让 feature-off 构建因权限指向未编译插件而失败。
- 示例命令 `greet` 带 `#[inspectable]`（`cfg_attr` 形式）+ `register_commands!` 注册 schema，供 `victauri_get_registry` / `victauri_detect_ghost_commands` / `victauri_invoke_command` 验证。
- 前端 `dist/index.html`（纯静态，无构建步骤）含可交互元素（输入框 / Greet 按钮 / 计数器），供 `dom_snapshot` / `interact` / `eval_js` 验证。

## 启动 / 停止

```sh
cd demo-app/src-tauri

# 起（debug 构建 + victauri feature；release 构建的 victauri 是 no-op，必须 --features）
cargo run --features victauri

# 停：Ctrl+C 或直接关窗口
```

首次运行会拉取 tauri 2 + victauri-plugin 0.10 依赖并编译（数分钟）。app 启动后 victauri 服务监听 `127.0.0.1:7373`（被占自动顺延至 7383），discovery 写入 `%TEMP%\victauri\<pid>\{metadata.json, port, token}`。

## e2e 用法（dsh 侧）

app 运行中时，dsh 会话里的 `victauri_*` 工具自动发现并连接该实例：

1. `victauri_app_info` / `victauri_get_plugin_info` — 连接与版本确认（identifier `com.lzhida.dsh-victauri-demo`）；
2. `victauri_dom_snapshot` / `victauri_interact` / `victauri_eval_js` — 前端交互元素操作；
3. `victauri_invoke_command(greet)` / `victauri_get_registry` / `victauri_detect_ghost_commands` — inspectable 命令注册与调用；
4. `victauri_screenshot` — 截图落盘。

多 app 并存时用插件配置 `appIdentifier: 'com.lzhida.dsh-victauri-demo'` 收敛目标。

## 编译检查（不启动 app）

```sh
cd demo-app/src-tauri
cargo check --features victauri   # victauri feature 构建检查
cargo check                       # feature-off 构建检查（发布形态）
```

## 构建产物

`src-tauri/target/` 与 `dist/` 之外的临时产物均已 gitignore（见仓库根 `.gitignore`），不提交。
