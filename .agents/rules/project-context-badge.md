# プロジェクトコンテキストバッジ運用ルール

> このリポジトリには複数プロジェクトが併存する。応答冒頭にバッジを必須化し、混線を防ぐ。

---

## 背景

このリポジトリ (`InvitationLess-Architecture`) には、以下の複数プロジェクトが物理的に併存している:

> 🆕 **2026-07-21 更新**: 2026年7-8月取組みは **3テーマの並行推進**になった。テーマ定義の正は `.ai/TASKS.yaml` の `themes:`。
>
> | バッジ | テーマ（WBSテーマ名） | 物理場所 | 識別子 |
> |---|---|---|---|
> | 📂 **[招待レス]** | `Exchange問題対応｜招待レス` | `outputs/2026年7-8月取組み/招待レス/` | `T-TL-*` |
> | 📂 **[Function移行]** | `LA→Func移行（Main/Sub）` | `outputs/2026年7-8月取組み/Function移行/` | `T-FM-*` |
> | 📂 **[1号機切替]** | `Exchange問題対応｜1号機切替` | `outputs/2026年7-8月取組み/1号機切替/` | `T-U1-*` |
> | 📂 **[共通]** | 作業計画・WBS・OrgOS 運用 | `outputs/2026年7-8月取組み/00_共通/` ／ `.ai/` ／ `.agents/` | `T-OPS-*` |
>
> **`/org-tick` は Step 0 でどのテーマかを Owner に確認する。** テーマが決まったら、そのテーマの中は都度確認せず推進してよい。
> **テーマをまたぐ判断（優先順位・日程・スコープの出し入れ）だけは Owner に確認する。**

以下は 2026年6月以前からの併存プロジェクト（`outputs/実装フェーズ/` 配下）。参照元として残置している。

| バッジ | プロジェクト | 物理場所 | 識別子プレフィックス |
|---|---|---|---|
| 📂 **[招待レス方式]** | Exchange 問題解決の招待不要アーキテクチャ（Owner 主導） | `outputs/実装フェーズ/30_開発/invitationless-functions/` | `T-IL-*` / `PLAN-UPDATE-IL-*` |
| 📂 **[サブフロー (DF2)]** | TMC AutoGIJIROKU の Logic Apps → Durable Functions 移行（磯貝さんリーダー / 横谷さん + Codex 実装） | `outputs/実装フェーズ/30_開発/durable-functions-v2/` | `T-DF2-*` / `F1-F13` / `SEC-1-6` |
| 📂 **[共通]** | OrgOS 運用 / 環境整備 / 並行プロジェクト分離など | `.ai/` / `.agents/` / `AGENTS.md` 等 | `T-OPS-*` / `T-COMMON-*` |
| 📂 **[現行 TMC 凍結]** | クライアント運用中の現行 Durable Functions パッケージ | `outputs/実装フェーズ/durable-functions-package/` | 触らない（NFR-03 で凍結） |

並列で進行することがあるため、応答ごとに **どのプロジェクトの話か** を必ず示す。

---

## Iron Law

> 例外なし。

1. **Manager の応答冒頭** にバッジを必須付与する: `📂 [招待レス方式]` / `📂 [サブフロー (DF2)]` / `📂 [共通]`
2. **複数プロジェクトに跨る応答** では、セクションごとにバッジを切り替える（例: 招待レスの話 → 共通の話 → 再び招待レス）
3. **どっちか判断できない依頼** を受けたら、最初に Owner に「これは [招待レス] / [DF2] のどちらの話ですか？」と確認してから着手する（推測で進めない）
4. **TASKS.yaml への新規タスク起票** 時は、対応するプレフィックス（`T-IL-*` / `T-DF2-*` / `T-OPS-*`）を必ず使う
5. **`.ai/DASHBOARD.md` 冒頭の「🎯 現在のフォーカス」** が示すプロジェクト以外のファイルは、必要が生じるまで読まない（読むなら「念のため DF2 側を確認します」と先に宣言）

---

## バッジの判定基準

| 依頼内容のキーワード | バッジ判定 |
|---|---|
| `invitationless-functions` / 招待レス / Adaptive Card / Stage 1 フィルタ / Orch A / Orch B（押下後） / FR-15〜FR-25 / R-05〜R-12 / ExecutionLog | 📂 [招待レス方式] |
| `durable-functions-v2` / DF2 / Logic Apps 移行 / LA → DF / F1〜F13 / SEC-1〜SEC-6 / `MeetingExecutionLog_DF` / `FunctionExecutionLog_DF` / 横谷 / Codex | 📂 [サブフロー (DF2)] |
| OrgOS フロー / セッション運用 / AGENTS.md / `.agents/rules/` / `.ai/CONTROL.yaml` / 並行プロジェクト分離 / バッジ運用 | 📂 [共通] |
| `durable-functions-package/` 既存読込み（参照のみ） | 📂 [現行 TMC 凍結]（読み取り専用、新規書込み禁止） |

---

## 運用例

### ✅ OK 例

```
📂 [招待レス方式]

要件定義書 §3.6.5 の R-11 改訂を確認しました。Orch A 14 列構造のうち...

---

📂 [共通]

ついでに `.ai/TASKS.yaml` の構造整理が必要そうです。中期施策 B-1 として...
```

### ❌ NG 例

```
要件定義書を確認しました。R-11 改訂は...
```
→ どのプロジェクトの話か不明。バッジなしは禁止。

```
📂 [招待レス方式]

要件定義書を確認しました。ついでに DF2 の `MeetingExecutionLog_DF` も見たところ...
```
→ 文脈が DF2 に切り替わった時点でバッジ切り替えが必要。

---

## Owner 側の運用協力（推奨、強制ではない）

Owner がセッション開始時や話題切替時に、以下のように先頭で明示すると Manager の取り違えがゼロになる:

- 「📂 招待レス で、ログ機能の要件を変更したい」
- 「DF2 の話だけど、BDX デプロイの段取りを教えて」
- 「OrgOS 共通の話で、TASKS.yaml の整理をしたい」

ただし強制ではなく、明示がなければ Manager がバッジ判定基準（上表）に従って判断し、迷う場合は確認する。

---

## 参考資料

- [.agents/rules/project-flow.md](project-flow.md) — OrgOS フロー優先
- [.ai/DASHBOARD.md](../../.ai/DASHBOARD.md) — 📂 並行プロジェクト一覧 + 🎯 現在のフォーカス
- [.ai/DECISIONS.md](../../.ai/DECISIONS.md) `PLAN-UPDATE-IL-111` — 本ルール制定の経緯
