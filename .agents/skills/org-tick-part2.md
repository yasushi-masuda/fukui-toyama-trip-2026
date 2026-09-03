---
name: org-tick-part2
description: "/org-tick の後半手順（Step 8 以降）。org-tick から必ず参照される"
---

# /org-tick（後半）

> [org-tick.md](org-tick.md) の続き。前半を読まずにここから実行してはいけない。

---

### 8. タスク委任 + リアルタイム進捗更新

依存が解けた queued タスクを検出し、`runtime.max_parallel_tasks` 件まで自動的に委任する。

> **重要（リモート可視性ルール）: タスクの状態が変わるたびに即座に WBS + 台帳を更新して git push する。**
> Tick の最後にまとめて更新するのではなく、**各タスクの完了・開始・課題発生のタイミングで随時更新する。**
> 詳細は `.agents/rules/remote-visibility.md` を参照。

#### 8.0 リアルタイム更新ルール（全ステップに適用）

以下のイベントが発生したら、**その場で即座に** WBS + 台帳を更新し git push する:

| イベント | 更新対象 | push |
|---------|---------|------|
| タスク開始（queued → running） | WBS: 状態を `🔄 作業中` に、TASKS.yaml: status を `running` に | ✅ |
| タスク完了（running → done） | WBS: 状態 `✅ 完了` + 検証結果 + 備考 + 完了日、TASKS.yaml: status を `done` に | ✅ |
| 課題発生 | ISSUES.md に起票、DASHBOARD.md Blockers 欄を更新 | ✅ |
| 課題解決 | ISSUES.md を RESOLVED に更新、DASHBOARD.md Blockers 欄から削除 | ✅ |
| ブロッカー発生（running → blocked） | TASKS.yaml + DASHBOARD.md + ISSUES.md | ✅ |

```bash
# イベント発生のたびに実行
git add .ai/ outputs/
git commit -m "progress: [イベント概要]"
git push
```

コミットメッセージの例:
- `progress: T-IL-010 開始（Application ID URI 設定）`
- `progress: T-IL-010 完了（Portal で URI 確認済み）`
- `progress: ISS-001 起票（access_as_user スコープ追加でエラー）`
- `progress: ISS-001 解決（スコープ名のタイプミスを修正）`

#### 8.1 実行可能タスクの検出

```python
# 疑似コード
executable = []
for task in tasks:
    if task.status == "queued":
        if all(get_task(dep).status == "done" for dep in task.deps):
            executable.append(task)

# 現在 running のタスク数を考慮
slots = max_parallel_tasks - count(running_tasks)
to_run = executable[:slots]
```

#### 8.2 owner_role による自動分岐

**Codex タスク（`codex-implementer` / `codex-reviewer`）：**

複数タスクがあれば **並列実行** を自動で準備：

1. 各タスクの Worktree を作成
   ```bash
   git worktree add .worktrees/<TASK_ID> -b task/<TASK_ID>-<slug>
   ```

2. Work Order を生成（`.ai/CODEX/ORDERS/<TASK_ID>.md`）

3. 実行方法を決定：
   - **`codex.auto_exec: true`** → バックグラウンドで自動実行
   - **`codex.auto_exec: false`（デフォルト）** → Ownerに実行コマンドを提示

**Claude subagent タスク：**
- Task ツールで該当エージェントを起動
- 診断結果に基づいて自動選択（5.1 参照）

#### 8.3 Codex 実行の案内（auto_exec: false の場合）

Ownerに以下を表示：

```markdown
## Codex タスク実行

以下のタスクが実行可能です：

| ID | Title | Worktree |
|----|-------|----------|
| T-003 | ユーザー認証モジュール | .worktrees/T-003 |
| T-004 | 商品カタログAPI | .worktrees/T-004 |

**実行コマンド：**
```bash
# 並列実行（推奨）
./.agents/scripts/run-parallel.sh T-003 T-004

# または個別実行
cd .worktrees/T-003 && codex exec "AGENTS.md を読み、../.ai/CODEX/ORDERS/T-003.md に従って実行"
```

実行後、再度 `/org-tick` で結果を回収します。
```

### 9. レビュー処理（ポリシーベース）

`CONTROL.yaml` の `owner_review_policy` に従ってレビューを実行する。

#### 9.1 レビュートリガー判定

```python
# 疑似コード
def should_trigger_review(control, completed_task):
    policy = control.owner_review_policy

    # オーバーライド条件（常にトリガー）
    if policy.on_stage_transition and stage_changed:
        return True, "stage_transition"
    if policy.always_before_merge_to_main and is_merge_to_main:
        return True, "merge_to_main"
    if policy.always_before_release and is_release:
        return True, "release"

    # OWNER_COMMENTS.md に「レビューして」等の要求があればトリガー
    if owner_requested_review():
        return True, "owner_request"

    # モードによる判定（デフォルトは every_n_tasks）
    mode = policy.get("mode", "every_n_tasks")

    if mode == "every_tick":
        return True, "every_tick"

    elif mode == "every_n_tasks":
        tasks_done = policy.tasks_since_last_review + 1
        if tasks_done >= policy.every_n_tasks:
            # カウンターリセット
            update_counter(0)
            return True, "every_n_tasks"
        else:
            # カウンター更新、レビュースキップ
            update_counter(tasks_done)
            return False, None

    elif mode == "batch":
        # 全タスク完了時のみレビュー
        if all_tasks_completed():
            return True, "batch_complete"
        return False, None

    elif mode == "manual":
        # 手動要求がないのでスキップ
        return False, None

    return True, "default"  # フォールバック
```

#### 9.2 レビュー実行（トリガー時）

レビューをトリガーする場合：
- 完了タスクを `review` ステータスに移動
- Review Packet が `.ai/REVIEW/PACKETS/<TASK_ID>.md` にあることを確認
- `org-reviewer` + `org-security-reviewer` を並列で起動
- `tasks_since_last_review` カウンターをリセット

#### 9.3 レビュースキップ（非トリガー時）

レビューをスキップする場合：
- 完了タスクを `pending_review` ステータスに保持（batch/manual モード）
- または直接 `done` に移動（信頼度が高い場合）
- RUN_LOG に記録: `"レビュースキップ (mode: <mode>, counter: <n>/<total>)"`
- `tasks_since_last_review` カウンターを +1

#### 9.4 手動レビュー要求

OWNER_COMMENTS.md に以下のようなキーワードがあれば、モードに関係なくレビューをトリガー：
- 「レビューして」「レビュー依頼」「確認して」「review」

トリガー後はカウンターをリセット。

#### 9.5 バッチレビュー（mode=batch の場合）

全タスク完了時にまとめてレビュー：
- `pending_review` ステータスのタスクを全て `review` に移動
- 各タスクの Review Packet を確認
- `org-reviewer` + `org-security-reviewer` を実行

### 9A. OIP-AUTO PR 検出と Eval ベース判定

Intelligence Worker が作成した OIP-AUTO PR を検出し、OS Evals で安全性を検証する。

#### 9A.1 OIP PR の検出

```bash
# oip-auto/ ブランチの PR を検出
gh pr list --label "oip-auto" --state open --json number,title,headRefName,files 2>/dev/null || true
```

PR がない場合はこのステップをスキップ。

#### 9A.2 Level 判定

各 PR の OIP レベルを判定する。**Level は Intelligence Worker が OIP 生成時に決定し、PR description の HTML コメントに埋め込む。**

| Level | 条件 | 処理 |
|-------|------|------|
| **Level 0** | 情報記録のみ（.ai/INTELLIGENCE/ 内のみ変更） | 自動マージ（Eval 不要） |
| **Level 1** | Userland 軽微変更（Kernel ファイル未変更） | Eval 実行 → pass なら自動マージ |
| **Level 2** | Userland 重要変更 | Owner 承認待ち |
| **Level 3** | Kernel ファイル変更あり | Owner 明示的承認必須 |

PR description のメタデータ形式:
```
<!-- oip-level: 1 -->
```

```python
# 疑似コード
def determine_oip_level(pr):
    """
    PR description から Level を取得。
    Intelligence Worker が OIP-AUTO 生成時に Claude Sonnet で判定済み。
    Kernel 境界チェックは Eval で二重検証する。
    """
    # PR description から Level を読み取り
    level = parse_html_comment(pr.body, "oip-level")  # <!-- oip-level: N -->

    if level is not None:
        level = int(level)
    else:
        # metadata がない場合はフォールバック（安全側に倒す）
        kernel_files = read_kernel_files_list()
        if any(f in kernel_files for f in pr.changed_files):
            level = 3
        elif all(f.startswith(".ai/INTELLIGENCE/") for f in pr.changed_files):
            level = 0
        else:
            level = 2  # 不明な場合は Owner 承認必須

    # Kernel 境界の二重検証（Level 0-1 でも Kernel ファイルがあれば Level 3 に昇格）
    if level <= 1:
        kernel_files = read_kernel_files_list()
        if any(f in kernel_files for f in pr.changed_files):
            level = 3

    return level
```

#### 9A.3 Eval 実行（Level 1 の場合）

```bash
# PR の変更ファイル一覧を取得
FILES=$(gh pr view <PR_NUMBER> --json files -q '.files[].path')

# OS Evals 実行
.agents/evals/run-all.sh --changed-files $FILES --json
```

#### 9A.4 判定結果の処理

| Eval 結果 | Level | 処理 |
|-----------|-------|------|
| **pass** | 0 | 自動マージ |
| **pass** | 1 | 自動マージ + DECISIONS.md に記録 |
| **fail** | 1 | Owner に通知（OWNER_INBOX.md に追加） |
| - | 2 | Owner 承認待ち（OWNER_INBOX.md に追加） |
| - | 3 | Owner 明示的承認必須（OWNER_INBOX.md + 影響分析添付） |

自動マージ時:
```bash
gh pr merge <PR_NUMBER> --merge --delete-branch
```

DECISIONS.md に記録:
```markdown
## OIP-AUTO-XXX: [タイトル] (YYYY-MM-DD)
- Level: 1 (自動承認)
- Eval 結果: pass (5/5)
- 変更ファイル: [リスト]
- トリガー: [Intelligence レポートのトピック]
```

### 10. 統合処理
レビュー承認済みタスクがあれば：
- org-integrator に統合を委任
- main反映は Owner Reviewポリシーに従う
- 統合完了後、worktree を削除

### 11. Worktree クリーンアップ
`done` になったタスクの worktree を削除：
```bash
git worktree remove .worktrees/<TASK_ID> --force
git branch -d task/<TASK_ID>-<slug>
```

### 12. 台帳更新（org-scribe）
- `RUN_LOG.md`: 実行ログを追記
- `STATUS.md`: タスク集計・ブロッカーを更新（Manager/エージェント向け）
- `DASHBOARD.md`: Owner 向け状況を更新（Stage / Next Action / Progress）
- RUNTIME.yaml の tick_count を+1（tasks_since_last_review / tasks_since_last_eval も更新）
- 学習抽出の提案（セッション終了時）

### 12A. （廃止 — Step 8A に移動済み）

### 13. オートコンティニュー判定

Tick 完了後、以下の **全条件** を満たす場合は **Owner に返さず即座に次の Tick（Step 1 に戻る）を開始する**。
1回の `/org-tick` 呼び出しで複数 Tick を連続実行することで、Owner が毎回手動で tick を打つ手間をなくす。

```python
# 疑似コード
def should_auto_continue():
    """
    全条件を満たせば True → Step 1 に戻って次の Tick を即実行
    1つでも False → Owner に結果を返して停止
    """

    # 1. Owner の判断待ちではない
    if control.awaiting_owner:
        return False

    # 2. レビューポリシーが「今すぐ Owner に見せる」を要求していない
    #    - batch / manual: 基本的に止まらない
    #    - every_n_tasks: カウンターが閾値未満なら止まらない
    #    - every_tick: 常に止まる
    policy = control.owner_review_policy
    if policy.mode == "every_tick":
        return False
    if policy.mode == "every_n_tasks" and policy.tasks_since_last_review >= policy.every_n_tasks:
        return False
    # batch / manual / every_n_tasks(未到達) → 続行可能

    # 3. OWNER_INBOX.md に未回答の質問がない
    if has_pending_owner_questions():
        return False

    # 4. 実行可能なタスクがまだある（queued かつ deps 充足）
    if not has_executable_tasks():
        return False

    # 5. セッション終了提案が出ていない（Step 5 で suggest=True だった場合は停止）
    if session_end_suggested:
        return False

    return True
```

#### オートコンティニュー中の Owner 通知

ループ中は各 Tick の要約を簡潔にバッファし、最終停止時にまとめて報告する：

```markdown
## Tick #N-#M 連続実行結果

| Tick | 実行内容 | 結果 |
|------|----------|------|
| #N   | T-003 実装委任 | ✅ |
| #N+1 | T-004 実装委任 | ✅ |
| #M   | レビュー閾値到達 → 停止 | ⏸ |

📌 次はこちら: ...
```

#### 安全制限

- **1回の呼び出しで最大 10 Tick** まで（無限ループ防止）
- コンテキスト使用率 80% 以上で強制停止
- エラー発生時は即停止して報告

---

## 利用可能なエージェント一覧

| エージェント | 役割 | 自動起動条件 |
|--------------|------|--------------|
| `org-planner` | 要件分析、タスク分解 | 要件不明確時 |
| `org-architect` | システム設計、Contract定義 | 設計判断必要時 |
| `org-build-fixer` | ビルドエラー修正 | ビルドエラー検出時 |
| `org-refactor-cleaner` | 死コード削除、重複排除 | 死コード検出時 |
| `org-tdd-coach` | TDDガイド、カバレッジ監視 | カバレッジ不足時 |
| `org-reviewer` | 設計・品質レビュー | レビュー待ちタスクあり |
| `org-security-reviewer` | セキュリティレビュー | レビュー時 or アラート時 |
| `org-e2e-runner` | E2Eテスト実行 | E2Eテスト対象あり |
| `org-doc-updater` | ドキュメント自動更新 | ドキュメント乖離検出時 |
| `org-scribe` | 台帳記録 | 毎Tick |
| `org-integrator` | main統合 | 承認済みタスクあり |
| `org-os-maintainer` | OrgOS改善提案 | 定期的 |

---

## Work Order テンプレート

```markdown
# Work Order: <TASK_ID>

## Task
- ID: <TASK_ID>
- Title: <タスクタイトル>
- Role: implementer | reviewer

## 関連要件 (SSOT 引用、必須)

> **Manager は Work Order 起票前に要件定義書・概要設計書・テスト範囲定義を Read し、
> 該当する FR/OW/IC/E2E 番号を以下に必ず引用すること。**
> 判断前 SSOT Read Iron Law ([.agents/rules/project-flow.md](../rules/project-flow.md) §判断前の SSOT Read 必須ルール)。

- 関連 FR-XX: <要件定義書からの引用、例: FR-24「議事録 + 発言録の 2 本並列生成」>
- 関連 OW-XX: <要件定義書からの引用、例: OW-06「OBO Delegated で押下者本人の OneDrive 保存」>
- 関連設計節: <概要設計書 §X.X / 詳細設計書 §X.X>
- 関連テスト観点: <テスト範囲定義 §X / 分岐マトリクス行、関連する IC-XX / E2E-XX>
- 対応する Phase 1 受入項目: <単体カバレッジ / 結合 IC-XX / E2E-XX / 発言録版 のいずれか>

## Allowed Paths
<allowed_paths から展開>

## Acceptance Criteria
<acceptance から展開>

## Dependencies
<完了した依存タスクを列挙>

## Instructions
<追加の指示>

## Reference
- AGENTS.md（必読）
- .ai/PROJECT.md
- .ai/GIT_WORKFLOW.md
- .agents/rules/knowledge/*（該当するもの）
- .agents/rules/*（該当するもの）
- outputs/実装フェーズ/10_要件定義/要件定義書_招待レス方式.md（Phase 1/Phase 2 完了基準 SSOT）
- outputs/実装フェーズ/40_テスト/01_BDX環境_トヨタ模擬テスト/テスト範囲定義_v2.md（受入基準 SSOT）
```

---

## 原則

- **OrgOSが自動判断** - ユーザーは `/org-tick` を実行するだけ。エージェント選択も並列実行もOrgOSが行う
- **状況診断ベース** - 現在の状況を分析し、必要なエージェントを自動選択
- ブラックボックス化を避けるため、必ず差分要約と意図を台帳に残す
- 不確実性/判断はDECISIONSへ（B2はOwnerへ）
- **Codexは共有台帳を編集しない** - Managerだけが更新する
- Codex結果の回収は毎Tick冒頭で行う
