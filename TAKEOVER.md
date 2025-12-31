# NoteFolder開発 - 詳細な引き継ぎプロンプト

## プロジェクト概要

NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）。外部サーバー不要、chrome.storage.syncでデータ管理。

**プロジェクトパス**: `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder`

---

## 現在の状況

### ステータス: ポップオーバーD&D修正の実装待ち

前回セッションで以下を完了：
- Phase 1: フィルター無効化修正 ✅
- Phase 2: D&D機能追加（親タグ/子タグ） ✅
- Phase 3: タグ統合機能（mergeTagsInAllProjects） ✅

**しかし**、ポップオーバー（`nf-popover`）内でのD&Dが動作しない問題が判明。

---

## 次に実装すべき内容

### 問題: ポップオーバー内D&Dが動作しない

**原因**:
- ドロップダウンは`data-dragging-tag`属性でドラッグ状態管理
- ポップオーバーは`application/x-nf-tag` MIMEタイプの存在チェックのみ
- 自分自身・子孫へのドロップ防止チェックがdragoverにない

### 実装計画ファイル
`実装計画_popover_DnD修正_v6.md` を参照

### 修正箇所（6箇所）

**対象ファイル**: `content/content.js`

| # | 対象 | 行番号 | 修正内容 |
|---|------|--------|----------|
| 1 | 親タグ dragstart | 1955-1962 | `popover.setAttribute('data-dragging-tag', parentName)` 追加 |
| 2 | 親タグ dragend | 1964-1972 | `popover.removeAttribute('data-dragging-tag')` 追加 |
| 3 | 親タグ dragover | 1975-1983 | `data-dragging-tag`で自己・子孫チェック、`dropEffect='move'`に変更 |
| 4 | 親タグ drop | 1989-2011 | `popover.removeAttribute('data-dragging-tag')` 追加 |
| 5 | 子タグ dragstart | 2055-2064 | `popover.setAttribute('data-dragging-tag', tag)` 追加 |
| 6 | 子タグ dragend | 2066-2071 | `popover.removeAttribute('data-dragging-tag')` 追加 |

### 具体的な修正コード

#### 修正1: 親タグ dragstart（1955行付近）
```javascript
// 既存コードの最後に追加
popover.setAttribute('data-dragging-tag', parentName);
```

#### 修正2: 親タグ dragend（1964行付近）
```javascript
// draggedParent = null; の後に追加
popover.removeAttribute('data-dragging-tag');
```

#### 修正3: 親タグ dragover（1975行付近）
```javascript
// 全体を置換
badge.addEventListener('dragover', (e) => {
  e.preventDefault();
  const draggingTag = popover.getAttribute('data-dragging-tag');
  if (draggingTag &&
      parentName !== draggingTag &&
      !parentName.startsWith(draggingTag + HIERARCHY_SEPARATOR)) {
    e.dataTransfer.dropEffect = 'move';
    badge.classList.add('nf-parent-drop-target');
  }
});
```

#### 修正4: 親タグ drop（1989行付近）
```javascript
// badge.classList.remove('nf-parent-drop-target'); の後に追加
popover.removeAttribute('data-dragging-tag');
```

#### 修正5: 子タグ dragstart（2055行付近）
```javascript
// 既存コードの最後に追加
popover.setAttribute('data-dragging-tag', tag);
```

#### 修正6: 子タグ dragend（2066行付近）
```javascript
// badge.classList.remove('nf-dragging'); の後に追加
popover.removeAttribute('data-dragging-tag');
```

---

## Codexレビュー指摘（対応済み）

| 重要度 | 問題 | 対処 |
|--------|------|------|
| P1 | `dropEffect='link'`が`effectAllowed='move'`と不整合 | `dropEffect='move'`に統一 |
| P2 | `dragend`未発火時に属性が残る | `drop`でも属性クリア追加 |

---

## 完了済みの実装

### Phase 1: フィルター無効化修正
- `saveOriginalCardOrder(force)`に強制更新オプション追加
- `setupSectionToggleListener()`にdataset重複防止、applyFilters()追加
- `setupSPANavigationListener()`にMutationObserver追加

### Phase 2: D&D機能追加
- 親タグdragstartに統一MIME追加
- 親タグdragover/dropに循環参照チェック追加
- 子タグにD&D属性・イベント追加

### Phase 3: タグ統合機能
- `mergeTagsInAllProjects(sourceTag, targetTag)`関数を新規作成（1273-1367行）
- `moveTagToParent()`の重複チェックを自動統合に修正（1409-1416行）

---

## テスト項目

### ポップオーバーD&D修正後
- [ ] nf-popover内で「歩行」を「健康」にD&D（親→親）
- [ ] nf-popover内で「健康/運動」を「趣味」にD&D（子→親）
- [ ] 自分自身へのD&Dがドロップターゲットにならない
- [ ] 自分の子孫へのD&Dがドロップターゲットにならない
- [ ] 同名タグへのD&Dで自動統合される

---

## 重要な行番号リファレンス

| 機能 | 行番号 |
|------|--------|
| mergeTagsInAllProjects | 1273-1367 |
| moveTagToParent | 1375-1427 |
| ポップオーバー親タグセクション | 1886-2019 |
| ポップオーバー子タグセクション | 2021-1974 |
| setupSectionToggleListener | 3537-3576 |
| setupSPANavigationListener | 3591-3657 |

---

## 参照ドキュメント

| ファイル | 内容 |
|----------|------|
| `CLAUDE.md` | プロジェクト指示書、禁止操作 |
| `実装計画_popover_DnD修正_v6.md` | 今回の修正計画（詳細） |
| `実装計画_バグ修正_v5.md` | 前回の修正計画（完了） |

---

## 注意事項

### 禁止操作
- `git push`, `git commit` は実行しない
- `.env*`, 秘密鍵ファイルは読み書きしない

### 実装上の注意
- XSS対策: `textContent`使用（`innerHTML`禁止）
- lastErrorチェック: 全storage操作で確認
- `isStorageAvailable()`チェック: 拡張機能更新後のエラー防止

---

**最終更新**: 2025-12-31
**ステータス**: ポップオーバーD&D修正の実装待ち
