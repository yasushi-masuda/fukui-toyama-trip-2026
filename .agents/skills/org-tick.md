---
name: org-tick
description: "OrgOSの進行を1Tick進める（台帳更新→タスク分配→レビュー→次の手）"
---


OrgOS ManagerとしてTickを1回実行する。

## 手順

### 0. 【最初にやる】どのテーマかを Owner に聞く

**2026年7-8月は3テーマを並行推進している。テーマが決まらないと、どの資料を見て何を進めるかが決まらない。**

1. `.ai/TASKS.yaml` の **`themes:`** を読む（3テーマの goal / outputs / approach / constraints が入っている）
2. **Owner に、今回どのテーマを進めるかを聞く**。`$ARGUMENTS` にテーマ名（例: `招待レス` / `Function移行` / `1号機切替`）が渡っていれば聞かずにそれを採用する

```
今日はどのテーマを進めますか？

  1. 招待レス（Exchange問題対応｜招待レス）      … 8/7 リリースの本体
  2. Function移行（LA→Func移行 Main/Sub）        … 招待レスと同時リリース
  3. 1号機切替（Exchange問題対応｜1号機切替）    … 独立・8/5-6 本切替
  4. 共通／横断（作業計画・WBS・段取りの見直し）
```

3. **テーマが決まったら、そのテーマの中はどんどん推進してよい**。都度確認を挟まない。判断の拠り所は次の順:

| 見るもの | 何が書いてあるか |
|---|---|
| `.ai/TASKS.yaml` の該当 `themes[]` | goal（何を達成するか）／outputs（何を作るか）／approach（どう進めるか）／constraints（守る制約） |
| そのテーマの `folder` 直下の `README.md` | 成果物の一覧と現在地 |
| `.ai/TASKS.yaml` の `tasks[]`（`task_prefix` で絞る） | 個別タスクの状態・依存・受入条件 |
| `plan.wbs_excel`（シート `WBS_20260721作成`） | 予定日・工数・担当・ステータス |
| `plan.context_md` | 完了要件・判断の背景・認識合わせの記録 |

4. **テーマをまたぐ判断（優先順位の変更・日程の入れ替え・スコープの出し入れ）だけは Owner に確認する。**
5. 応答の冒頭に **📂 [テーマ名]** バッジを付ける（`.agents/rules/project-context-badge.md`）。**別テーマのファイルには触らない。**

> ⚠ 3テーマは**同じ WBS（`plan.wbs_excel`）を共有**している。日程を動かすと他テーマの負荷に響くため、
> 予定日の変更は必ず `plan.scheduler`（`sched.py`）で全体を再計算してから書き戻す。

### 1. 状態集約
`.ai/CONTROL.yaml` / `.ai/TASKS.yaml` / `.ai/OWNER_COMMENTS.md` / `.ai/OWNER_INBOX.md` / `.ai/STATUS.md` / `.ai/DASHBOARD.md` を読み、状態を集約

### 2. Ownerコメント処理 + 新規依頼のタスク化

#### 2.1 Ownerコメント反映
Ownerコメントがあれば、DECISIONS/TASKS/PROJECT/CONTROLへ反映し、処理済みをOWNER_COMMENTSに明記

#### 2.2 新規依頼のタスク化（割り込みタスク受付）

Owner からの新しい依頼（コメント or 直接のチャットメッセージ）を検出した場合、**実行前に必ず TASKS.yaml に登録する**。

```python
# 疑似コード
def process_new_requests(requests):
    """
    全ての新規依頼を TASKS.yaml に登録してからでないと実行しない。
    ad-hoc 実行（TASKS.yaml を経由せず直接作業すること）は禁止。
    """
    for request in requests:
        # 1. タスク規模を判定
        size = assess_task_size(request)  # small / medium / large

        # 2. 進行中タスクとの関係を確認
        running_tasks = get_tasks_by_status("running")
        conflict = check_allowed_paths_conflict(request, running_tasks)

        # 3. TASKS.yaml に登録
        new_task = {
            "id": generate_next_id(),
            "title": summarize_request(request),
            "status": "queued",
            "deps": conflict.blocking_tasks if conflict else [],
            "owner_role": determine_role(request),
            "allowed_paths": determine_paths(request),
        }
        add_to_tasks_yaml(new_task)

        # 4. 小タスク + 独立 → 同一 Tick の Step 8 で実行される
        #    中〜大タスク → DECISIONS.md に PLAN-UPDATE 記録
        if size in ["medium", "large"]:
            record_plan_update(new_task)
```

### 3. Owner待ちチェック
awaiting_owner=true なら、進行を止め、DASHBOARDを更新して終了

### 4. Codex結果の回収
`.ai/CODEX/RESULTS/` に新しい結果ファイルがあれば：
- 結果を読み取り、タスクステータスを更新
- `completed` → review へ移動（implementer）、または done へ移動（reviewer approved）
- `blocked` / `failed` → blocked へ移動し、理由を記録
- `changes_requested` → running へ戻し、修正タスクとして再委任
- 完了したタスクの worktree をクリーンアップ対象としてマーク

### 5. セッション管理チェック

コンテキスト使用率と作業の論理的区切りをチェックし、セッション終了を提案すべきか判断する。

#### 5.1 セッション終了提案の判定

```python
# 疑似コード
def should_suggest_session_end(context):
    """
    セッション終了を提案すべきか判定

    Returns:
        {
            "suggest": bool,
            "priority": "P0" | "P1" | "P2",
            "reason": str,
            "force": bool  # True なら選択肢を出さず強制終了
        }
    """

    # P0: 必ず提案（論理的な区切り）
    if context.stage_transitioned:
        return {
            "suggest": True,
            "priority": "P0",
            "reason": f"ゲート通過（{context.prev_stage} → {context.current_stage}）",
            "force": False
        }

    if context.feature_completed and context.review_passed:
        return {
            "suggest": True,
            "priority": "P0",
            "reason": "機能実装・レビュー完了",
            "force": False
        }

    if context.integration_completed:
        return {
            "suggest": True,
            "priority": "P0",
            "reason": "統合完了（ブランチマージ済み）",
            "force": False
        }

    # P1: 推奨（タスクグループ完了）
    if context.task_group_completed:
        return {
            "suggest": True,
            "priority": "P1",
            "reason": f"{context.completed_task_count} 個のタスクグループが完了",
            "force": False
        }

    if context.major_decision_made:
        return {
            "suggest": True,
            "priority": "P1",
            "reason": "大きな設計判断が完了",
            "force": False
        }

    if context.awaiting_owner:
        return {
            "suggest": True,
            "priority": "P1",
            "reason": "Owner の判断待ち",
            "force": False
        }

    # P2: コンテキスト依存
    usage = context.context_usage_percent

    if usage >= 95:
        return {
            "suggest": True,
            "priority": "P2",
            "reason": f"コンテキスト使用率 {usage}% - 自動圧縮を回避",
            "force": True  # 強制終了
        }

    if usage >= 90 and context.has_logical_breakpoint:
        return {
            "suggest": True,
            "priority": "P2",
            "reason": f"コンテキスト使用率 {usage}% - 区切りが良いタイミング",
            "force": False
        }

    if usage >= 80:
        # 警告のみ、提案はしない
        context.log_warning(f"🟡 コンテキスト使用率 {usage}% - 次の区切りで終了推奨")
        # 台帳更新を強化
        context.prioritize_ledger_updates = True
        return {"suggest": False}

    return {"suggest": False}
```

#### 5.2 セッション終了の提案方法

**論理的区切りの場合（P0, P1）:**

```markdown
✅ [完了した作業] が完了しました

📊 セッション状態:
   - コンテキスト使用率: XX%
   - 完了タスク数: N 個
   - 現在のステージ: [STAGE]

📌 次のセッション推奨

**理由**: [ゲート通過した / 機能実装が完了した / など]

このセッションを終了して、次の作業を新しいセッションで開始することを推奨します。

**メリット**:
- ✅ コンテキストが fresh になり、判断精度が上がる
- ✅ 台帳が整理され、全体像が明確になる
- ✅ 次の作業に集中できる

**次のセッションでやること**:
- [具体的な次のタスク]

---

**[A] 新しいセッションを開始（推奨）**
   → 台帳を更新して終了します
   → 次のチャットで `/org-tick` を実行してください

**[B] このセッションを継続**
   → このまま次のタスクに進みます

どちらにしますか？
```

**コンテキスト95%超の場合（P2, 強制終了）:**

```markdown
⚠️ コンテキスト使用率: 95%

自動圧縮を回避するため、このセッションを終了します。

実行中:
1. ✅ DECISIONS.md に今セッションの判断を記録
2. ✅ TASKS.yaml を最新状態に更新
3. ✅ DASHBOARD.md に次のアクションを記載

📌 次のセッションを開始してください

新しいチャットで以下を入力:
→ /org-tick

**次のセッションでやること**:
- [具体的な次のタスク]

台帳から自動的に継続します。
```

---

### 6. 計画整合性チェック（Plan Sync）

実態と計画の乖離を検出し、必要に応じて計画を更新する。

#### 6.1 チェック項目

| チェック | 検出内容 | 対応 |
|----------|----------|------|
| **スコープ変更** | 新しい要件、取り下げられた要件 | PROJECT.md + TASKS.yaml を更新 |
| **タスク追加** | 実装中に判明した追加作業 | TASKS.yaml に新タスク追加 |
| **依存関係変更** | 前提が変わった、順序変更が必要 | TASKS.yaml の deps を修正 |
| **見積もり乖離** | 想定より大きい/小さいタスク | タスク分割 or 統合 |
| **リスク顕在化** | RISKS.md のリスクが発生 | 対応タスクを追加 |
| **ブロッカー発生** | 外部依存、Owner 作業待ち | status: blocked に変更 |

#### 6.2 計画更新のトリガー

以下の条件で計画を更新する：

```python
# 疑似コード
def check_plan_sync():
    updates_needed = []

    # 新しい課題が発生した
    if new_issues_detected():
        for issue in new_issues:
            updates_needed.append({
                "type": "add_task",
                "task": create_fix_task(issue)
            })

    # 完了タスクから追加作業が判明
    for task in completed_tasks:
        if task.discovered_work:
            updates_needed.append({
                "type": "add_task",
                "task": create_followup_task(task.discovered_work)
            })

    # リスクが顕在化
    for risk in active_risks:
        if risk.materialized:
            updates_needed.append({
                "type": "add_task",
                "task": create_mitigation_task(risk)
            })
            updates_needed.append({
                "type": "update_risk",
                "risk": risk,
                "status": "materialized"
            })

    # スコープ変更（OWNER_COMMENTS から検出）
    if scope_changes_requested():
        updates_needed.append({
            "type": "update_project",
            "changes": parse_scope_changes()
        })

    return updates_needed
```

#### 6.3 計画更新の実行

更新が必要な場合：

1. **TASKS.yaml を更新**
   - 新タスク追加（適切な deps を設定）
   - 既存タスクの status/blocker を更新
   - 不要になったタスクを削除または archived に

2. **PROJECT.md を更新**（スコープ変更時）
   - ゴール/成果物の変更を反映
   - 変更理由を DECISIONS.md に記録

3. **DASHBOARD.md に反映**
   - 計画変更を Owner に通知
   - 影響範囲を説明

#### 6.4 計画更新の記録

```markdown
## DECISIONS.md に追記
- **PLAN-UPDATE-001**: TASKS.yaml を更新
  - 追加: T-FIX-001 (Client Secret 更新)
  - 変更: T-004 の deps に T-FIX-001 を追加
  - 理由: ISSUE-005 対応のため
```

---

### 7. 状況診断とエージェント自動選択

状況を分析し、必要なエージェントを自動的に選択・実行する。

#### 7.1 診断チェック

以下の順序で状況をチェックし、該当するエージェントを起動:

| 優先度 | 状況 | 起動エージェント | 説明 |
|--------|------|------------------|------|
| **P0** | ビルドエラーがある | `org-build-fixer` | エラー修正が最優先 |
| **P0** | セキュリティアラートあり | `org-security-reviewer` | 脆弱性対応 |
| **P1** | 要件が不明確 | `org-planner` | タスク詳細化 |
| **P1** | 設計判断が必要 | `org-architect` | アーキテクチャ決定 |
| **P2** | 実装完了タスクあり（レビュー待ち） | `org-reviewer` + `org-security-reviewer` | 並列レビュー |
| **P2** | テストカバレッジ不足 | `org-tdd-coach` | テスト追加ガイド |
| **P2** | E2Eテスト対象あり | `org-e2e-runner` | E2Eテスト実行 |
| **P3** | 死コード検出 | `org-refactor-cleaner` | クリーンアップ |
| **P3** | ドキュメント乖離 | `org-doc-updater` | ドキュメント更新 |
| **P4** | レビュー承認済みタスクあり | `org-integrator` | main統合 |
| **常時** | Tick終了時 | `org-scribe` | 台帳記録 |

#### 7.2 診断の実行方法

```python
# 疑似コード
def diagnose_and_select_agents():
    agents_to_run = []

    # P0: 緊急対応
    if check_build_errors():
        agents_to_run.append("org-build-fixer")
        return agents_to_run  # ビルドエラーは最優先で修正

    if check_security_alerts():
        agents_to_run.append("org-security-reviewer")

    # P1: 計画フェーズ
    if stage in ["KICKOFF", "REQUIREMENTS", "DESIGN"]:
        if has_unclear_requirements():
            agents_to_run.append("org-planner")
        if needs_architecture_decision():
            agents_to_run.append("org-architect")

    # P2: 実装フェーズ
    if stage == "IMPLEMENTATION":
        if has_completed_tasks_awaiting_review():
            agents_to_run.extend(["org-reviewer", "org-security-reviewer"])
        if coverage_below_threshold():
            agents_to_run.append("org-tdd-coach")
        if has_e2e_test_targets():
            agents_to_run.append("org-e2e-runner")

    # P3: メンテナンス
    if detect_dead_code():
        agents_to_run.append("org-refactor-cleaner")
    if detect_doc_drift():
        agents_to_run.append("org-doc-updater")

    # P4: 統合
    if has_approved_tasks():
        agents_to_run.append("org-integrator")

    # 常時
    agents_to_run.append("org-scribe")

    return agents_to_run
```

#### 7.3 ビルドエラー検出

```bash
# TypeScript プロジェクト
npx tsc --noEmit 2>&1 | head -20

# Next.js
npm run build 2>&1 | head -20

# エラーがあれば org-build-fixer を起動
```

#### 7.4 カバレッジ検出

```bash
# カバレッジレポートを確認
npm test -- --coverage --coverageReporters=json-summary 2>/dev/null

# 80% 未満なら org-tdd-coach を起動
```


---

> **この手順には続きがあります。必ず [org-tick-part2.md](org-tick-part2.md) を読んでから実行すること。**
