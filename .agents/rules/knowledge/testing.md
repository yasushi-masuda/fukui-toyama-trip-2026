# テストルール

> テスト品質基準と TDD ワークフローのルール

---

## Iron Law

> テストの鉄則。例外なし。

1. **テストなしの本番コードは禁止** - 「後でテスト書く」は許されない
2. **カバレッジ 80% 未満はマージ不可** - 例外なし

---

## カバレッジ要件

| メトリクス | 最低基準 | 目標 |
|------------|----------|------|
| Statements | 80% | 90% |
| Branches | 80% | 85% |
| Functions | 80% | 90% |
| Lines | 80% | 90% |

**80% を下回るとマージ不可**

---

## 必須テストの種類

### Unit Tests

- すべての関数・メソッドに対してテストを書く
- 外部依存はモック化する
- エッジケース・境界値を必ずカバー

```typescript
describe('calculateDiscount', () => {
  // 正常系
  it('10%割引を正しく計算する', () => { ... });

  // 境界値
  it('割引率0%で元の価格を返す', () => { ... });
  it('割引率100%で0を返す', () => { ... });

  // 異常系
  it('負の割引率でエラーを投げる', () => { ... });
  it('100%超の割引率でエラーを投げる', () => { ... });
});
```

### Integration Tests

- API エンドポイントの動作確認
- データベース操作のテスト
- 外部サービス連携のテスト

```typescript
describe('POST /api/users', () => {
  it('有効なデータでユーザーを作成する', async () => {
    const response = await request(app)
      .post('/api/users')
      .send({ name: 'Test', email: 'test@example.com' })
      .expect(201);

    expect(response.body.data.id).toBeDefined();
  });

  it('重複メールで409エラーを返す', async () => { ... });
  it('無効なデータで400エラーを返す', async () => { ... });
});
```

### E2E Tests

- クリティカルなユーザーフローのテスト
- Playwright を使用
- 最低限以下をカバー:
  - 認証フロー（登録・ログイン・ログアウト）
  - 主要な業務フロー
  - 決済フロー（該当する場合）

```typescript
test('ユーザー登録からダッシュボード表示まで', async ({ page }) => {
  await page.goto('/register');
  await page.fill('[name="email"]', 'new@example.com');
  await page.fill('[name="password"]', 'SecurePass123');
  await page.click('button[type="submit"]');

  await expect(page).toHaveURL('/dashboard');
  await expect(page.locator('h1')).toContainText('Welcome');
});
```

---

## Playwright E2E パターン

> Anthropic webapp-testing スキルに基づく実践的なパターン

### Reconnaissance-Then-Action パターン

テストを書く前に、まず対象ページの DOM 構造を調査する。

```typescript
// Step 1: DOM の調査（Reconnaissance）
test('ページ構造の確認', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // セレクタを確認
  const buttons = await page.locator('button').all();
  for (const btn of buttons) {
    console.log(await btn.textContent(), await btn.getAttribute('data-testid'));
  }
});

// Step 2: 調査結果に基づいてテストを書く（Action）
test('ダッシュボードでデータが表示される', async ({ page }) => {
  await page.goto('/dashboard');
  await page.waitForLoadState('networkidle');

  // 調査で見つけたセレクタを使用
  await expect(page.getByTestId('user-table')).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(10);
});
```

### セレクタ戦略（優先度順）

| 優先度 | セレクタ | 例 | 理由 |
|--------|---------|-----|------|
| 1 | `getByRole` | `getByRole('button', { name: '送信' })` | アクセシビリティ準拠 |
| 2 | `getByTestId` | `getByTestId('submit-btn')` | 実装から独立 |
| 3 | `getByText` | `getByText('ログイン')` | ユーザー視点 |
| 4 | `locator` | `locator('.submit-button')` | 最終手段 |

### ネットワーク待機

```typescript
// ❌ 悪い例: 固定時間の待機
await page.waitForTimeout(3000);

// ✅ 良い例: networkidle を待機
await page.waitForLoadState('networkidle');

// ✅ 良い例: 特定のレスポンスを待機
const responsePromise = page.waitForResponse('**/api/users');
await page.click('button[type="submit"]');
const response = await responsePromise;
expect(response.status()).toBe(200);
```

### Flaky テスト対策

```typescript
// ✅ リトライ可能なアサーション（自動待機付き）
await expect(page.getByText('保存しました')).toBeVisible({ timeout: 10000 });

// ✅ 要素の状態を待ってからアクション
await page.getByRole('button', { name: '送信' }).waitFor({ state: 'visible' });
await page.getByRole('button', { name: '送信' }).click();

// ✅ テスト間の独立性（各テストでクリーンな状態）
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});
```

---

## TDD ワークフロー

### 新機能開発時は必ず TDD

```
1. 🔴 テストを書く（失敗することを確認）
2. 🟢 最小限のコードでテストを通す
3. 🔵 リファクタリング（テストは通ったまま）
4. → 1 に戻る
```

### TDD チェックリスト

- [ ] 実装前にテストを書いた
- [ ] テストが失敗することを確認した
- [ ] 最小限のコードでテストを通した
- [ ] リファクタリング後もテストが通る
- [ ] カバレッジ 80% 以上

---

## テストの書き方

### AAA パターン

```typescript
it('ユーザー名を更新する', async () => {
  // Arrange: 準備
  const user = await createTestUser({ name: 'Old Name' });

  // Act: 実行
  const updated = await userService.updateName(user.id, 'New Name');

  // Assert: 検証
  expect(updated.name).toBe('New Name');
});
```

### 説明的なテスト名

```typescript
// ✅ 良い例
it('無効なメールアドレスでValidationErrorを返す', () => { ... });
it('管理者権限がない場合403エラーを返す', () => { ... });

// ❌ 悪い例
it('エラーになる', () => { ... });
it('test case 1', () => { ... });
```

### 独立したテスト

```typescript
// ✅ 各テストは独立
beforeEach(async () => {
  await db.reset();  // テスト間でDBをリセット
});

// ❌ テスト間で状態を共有しない
let sharedUser;  // グローバル状態 = テストの順序依存
```

---

## テスト失敗時の対応

### デバッグ手順

1. **エラーメッセージを読む** - 何が期待と違うか確認
2. **テストの独立性を確認** - 他のテストの影響がないか
3. **モックを確認** - モックが正しく設定されているか
4. **実装を修正** - テストではなく実装を直す

### テストを修正してよいケース

- テストの期待値が間違っている場合
- 仕様変更が正式に承認された場合
- テストが不安定（flaky）な場合

### テストを修正してはいけないケース

- テストを通すためだけに期待値を変える
- 実装の都合でテストを緩める
- カバレッジを上げるために空のテストを追加

---

## CI/CD 統合

### pre-commit

```bash
# 変更されたファイルに関連するテストのみ実行
npm test -- --onlyChanged
```

### Pull Request

```bash
# 全テスト実行 + カバレッジレポート
npm test -- --coverage --coverageReporters=text-summary
```

### マージ条件

- [ ] 全テストが通っている
- [ ] カバレッジ 80% 以上
- [ ] 新規コードにテストがある
- [ ] E2E テストが通っている

---

## OrgOS での適用

### TASKS.yaml での指定

```yaml
- id: T-003
  title: 認証機能の実装
  workflow: tdd           # TDD 強制
  coverage_target: 80%    # カバレッジ目標
```

### Work Order への記載

```markdown
## 技術要件

- ワークフロー: TDD
- カバレッジ目標: 80%
- 必須テスト: Unit + Integration

## 成果物

- [ ] 実装コード
- [ ] Unit テスト
- [ ] Integration テスト
- [ ] カバレッジレポート
```

---

## 品質担保 6 レイヤー構成（恒常ルール、2026-04-22 Tick #104 確定）

**本番出荷の前提となる品質担保レイヤーを以下の 6 層で構成する。**

### レイヤー全量

| # | レイヤー名 | 目的 | 実施方法 | 実施タイミング |
|---|---|---|---|---|
| 1 | **単体テスト** | 関数単位のロジック検証 | pytest (Python) / Jest (JS) などの自動テスト | コード修正時に常時実行 |
| 2 | **結合テスト** | Activity 間連携、Azurite 実動作、依存サービスのスタブ実動作 | pytest + Azurite + responses モック等 | コード修正時 + CI |
| 3 | **自動 E2E テスト** | コードレベルの通し試験 (正常系中心) | pytest + 統合モック | CI + デプロイ前 |
| 4 | **分岐テストマトリクス** | **分岐網羅 + 境界値** を前提条件 1〜6 の組み合わせで網羅 (プロセステスト形式) | プロセステスト仕様書 (Markdown)、人手実行 + OK/NG 記入 | 設計書改訂時に更新、実機テスト時に実行 |
| 5 | **NW 疎通検証** | インフラ層の疎通 (VNet / AppGW / PE / DNS / NSG 等) | az cli + curl / nslookup 証跡 | インフラ変更時 + 本番移行時 |
| 6 | **実機 E2E 手順書** | 実機環境での通しシナリオ疎通 (Teams 会議〜議事録投稿等) | 手順書に沿って実機操作、スクリーンショット証跡 | デプロイ後 + 本番切替前 |

### レイヤーの棲み分け

```
レイヤー 1-3 (自動テスト)     → コードレベルの検証、CI で自動化
レイヤー 4 (分岐マトリクス)    → 分岐網羅の計画書 + 実行記録
レイヤー 5 (NW 疎通)           → インフラ層の検証
レイヤー 6 (実機 E2E)          → 全体通しの最終確認
```

### 本番出荷の前提条件（恒常ルール）

- **全 6 レイヤーを満たすこと**（いずれか 1 つでも未実施/不合格はブロッカー）
- レイヤー 1-3 のカバレッジは **80% 以上**（単体・結合・E2E 合算）
- レイヤー 4 は上流文書 (概要設計書 / 詳細設計書) の最新バージョンに追従していること
- レイヤー 5-6 は対象環境 (BDX / TMC 等) ごとに個別実施

---

## 分岐テストマトリクス（プロセステスト形式）

**レイヤー 4 の具体的フォーマット。**

### フォーマット

```markdown
| # | プロセス | 機能 | 前提条件 1 | 前提条件 2 | 前提条件 3 | 前提条件 4 | 前提条件 5 | 前提条件 6 | 想定結果 | テスト方法 | 結果 (OK/NG) | 担当 | 確認 | レビュー 1 | レビュー 2 | レビュー 3 | エビデンス |
|---|---------|------|----------|----------|----------|----------|----------|----------|--------|----------|------------|------|------|-----------|-----------|-----------|----------|
| A-1-1 | Orch A | check_organizer_filter_activity | transcriptCreated 受信 | 主催者 UserList 登録済 | — | — | — | — | shouldSendCard=True / Bot インストール → カード投稿 | pytest + Azurite | | 湯田 | | | | | |
| A-1-2 | Orch A | check_organizer_filter_activity | transcriptCreated 受信 | 主催者 UserList 未登録 | — | — | — | — | shouldSendCard=False / 通知なし | pytest + Azurite | | 湯田 | | | | | |
```

### 各列の意味

| 列 | 内容 |
|---|---|
| # | テスト ID (プロセス-機能-連番) |
| プロセス | 対象プロセス名 (例: Orch A / Orch B) |
| 機能 | 対象 Activity 名 (例: check_organizer_filter_activity) |
| 前提条件 1〜6 | Given の複数条件 (分岐網羅 + 境界値) |
| 想定結果 | Then (期待される出力・副作用) |
| テスト方法 | pytest / 実機 Teams / az cli など |
| 結果 (OK/NG) | 実施時に記入 |
| 担当 | テスト実施者 |
| 確認 | 実施者の 1 次確認 |
| レビュー 1〜3 | 多段レビュー (設計者 / Manager / Owner) |
| エビデンス | 証跡ファイルへのリンク |

### 作成時のルール

1. **分岐網羅**: すべての条件分岐 (if / elif / else) に対して、True/False の両方のケースを列挙
2. **境界値**: 「0 件 / 1 件 / 複数件 (2 件) / 上限値」のような境界で独立したケースを作成
3. **エラーケース**: リトライ / タイムアウト / 権限エラー / 外部サービス障害などを別ケースで明記
4. **想定結果は具体的に**: 「成功する」ではなく「shouldSendCard=True / Orch A が次の Activity へ進む」と状態変化を明記
5. **既存ロジック流用の場合**: 想定結果欄に「既存 Durable Functions 踏襲のためテスト不要」と明記し、結果欄は空欄

### 改訂トリガー

- 上流文書 (概要設計書 / 詳細設計書) が改訂されたら即追従
- 新しい要件 (R-XX / OW-XX) 追加時は該当分岐を追加
- 実装コードと 1:1 対応を維持 (マトリクスを SSOT とする)

### NG パターン

```
❌ 機能単位でしか書いていない (プロセス全体の連鎖が見えない)
❌ 前提条件が 1 つだけ (分岐網羅になっていない)
❌ 境界値 (0 件 / 1 件 / 複数件) の区別がない
❌ 想定結果が「動く」「エラーにならない」など曖昧
❌ エラーケースが書かれていない
```

---

## 参考資料

- [.agents/rules/knowledge/tdd-workflow.md](.agents/rules/knowledge/tdd-workflow.md)
- [.agents/rules/project-flow.md](../rules/project-flow.md) - 設計書改訂フロー順 (詳細設計 → テスト仕様書 → 実装)
- [.agents/rules/design-documentation.md](../rules/design-documentation.md) - 上流文書追従ルール
- [.ai/DECISIONS.md](../../.ai/DECISIONS.md) PLAN-UPDATE-IL-031 — 6 レイヤー構成明文化の経緯
- [Jest Documentation](https://jestjs.io/)
- [Vitest Documentation](https://vitest.dev/)
- [Playwright Documentation](https://playwright.dev/)
