# NoteFolder開発 - 詳細な引き継ぎプロンプト

## プロジェクト概要

NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）。外部サーバー不要、chrome.storage.syncでデータ管理。

**プロジェクトパス**: `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder`

---

## 現在の状況

### ステータス: 3つのバグ修正実装待ち

実装計画は完成・承認済み。以下の3つのバグを修正する必要がある。

---

## 修正すべきバグ

### バグ1: タグポップオーバーでの親子関係D&Dが動作しない

**問題**: `div.nf-popover`内で子タグを親タグにドラッグしても何も起きない

**原因**: 子タグセクション（`nf-popover-child-tags`、1908-1946行付近）にD&D処理が未実装

**修正内容**:
1. 親タグのdragstartに統一MIME追加（1851-1857行）
   ```javascript
   e.dataTransfer.setData('application/x-nf-tag', parentName);
   ```

2. 親タグのdragover/dropを修正（1869-1898行）- `dataTransfer.types.includes('application/x-nf-tag')`で判定

3. 子タグバッジにD&D属性とイベント追加（1921-1943行付近）
   ```javascript
   badge.setAttribute('draggable', 'true');
   badge.setAttribute('data-full-tag', tag);
   // dragstart/dragendイベント追加
   ```

---

### バグ2: セクション切り替え後にタグフィルターが効かない

**問題**: `#mat-button-toggle-2-button`等を選択後、`#mat-button-toggle-0-button`に戻るとフィルターが効かない

**原因**: `setupSectionToggleListener()`がリスナーを重複登録、`originalCardOrder`が古いDOM参照を保持

**修正内容**:
1. setupSectionToggleListener修正（3536-3564行）
   ```javascript
   if (toggleGroup.dataset.nfListenerAttached) return;
   toggleGroup.dataset.nfListenerAttached = 'true';
   // click内でoriginalCardOrder = []、saveOriginalCardOrder(true)、applyFilters()を追加
   ```

2. saveOriginalCardOrder修正（2394-2402行）
   ```javascript
   function saveOriginalCardOrder(force = false) {
     if (cards.length > 0 && (force || originalCardOrder.length === 0)) {
   ```

3. setupSPANavigationListener内でMutationObserver追加（toggleGroup差し替え検知）

---

### バグ3: 同名タグを同じ親の子タグとして統合できない

**問題**: 「歩行」を「健康」にD&Dすると「同名のタグが既に存在します」エラー（既に「健康/歩行」がある場合）

**ユーザー仕様**:
- 同名タグは**自動統合**（確認ダイアログなし）
- 色情報: **欠損補完**（targetが無色の場合のみsourceの色を引き継ぐ）
- フィルター: **targetに置換して維持**

**修正内容**:
1. `mergeTagsInAllProjects(sourceTag, targetTag)`関数を新規作成（1278行付近）
   - 子孫リストを先にスナップショット化
   - 全プロジェクトでsourceTagをtargetTagに置換（Set化で重複除去）
   - tagMeta欠損補完
   - フィルター状態を更新
   - キャッシュ正規化

2. moveTagToParent重複チェック修正（1313-1317行）
   ```javascript
   if (allTags.includes(newTagName) && newTagName !== sourceTag) {
     const success = await mergeTagsInAllProjects(sourceTag, newTagName);
     if (success) showToast(`「${sourceBaseName}」を「${newTagName}」に統合しました`);
     return success;
   }
   ```

---

## 実装順序

1. **Phase 1**: バグ2（フィルター機能修正）- 基盤機能
2. **Phase 2**: バグ1（D&D機能追加）
3. **Phase 3**: バグ3（タグ統合機能）

---

## 重要な行番号リファレンス

| 機能 | 行番号 |
|------|--------|
| 子タグセクション | 1908-1946 |
| 親タグD&D処理 | 1851-1898 |
| moveTagToParent | 1279-1328 |
| renameTagInAllProjects | 1336-1376 |
| removeTagMeta | 320-343 |
| saveOriginalCardOrder | 2394-2402 |
| applyFilters | 2429-2481 |
| setupSectionToggleListener | 3536-3564 |
| setupSPANavigationListener | 3579-3612 |

---

## 参照ドキュメント

| ファイル | 内容 |
|----------|------|
| `CLAUDE.md` | プロジェクト指示書、禁止操作 |
| `実装計画_バグ修正_v5.md` | 詳細実装計画（Phase形式） |

---

## 注意事項

### Codexレビュー指摘（対応必須）
- tagMeta上書き問題 → 欠損補完ロジック
- sync書込制限 → 一括保存
- 子孫取りこぼし → スナップショット化
- toggleGroup差し替え → MutationObserver
- ドラッグ種別明示 → 統一MIME `application/x-nf-tag`
- フィルター状態 → targetに置換

### 禁止操作
- `git push`, `git commit` は実行しない
- `.env*`, 秘密鍵ファイルは読み書きしない

### 実装上の注意
- XSS対策: `textContent`使用（`innerHTML`禁止）
- lastErrorチェック: 全storage操作で確認
- stopPropagation: ドロップイベントは伝播防止

---

**最終更新**: 2025-12-31
**ステータス**: 実装計画承認済み・実装待ち
