# NoteFolder開発 - 詳細な引き継ぎプロンプト

## プロジェクト概要

NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）を開発中。外部サーバー不要、chrome.storage.syncでデータ管理。

**プロジェクトパス**: `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder`

---

## 現在の状況

### ステータス: タグ表示改善 - 実装完了・テスト待ち

`実装計画_タグ表示改善.md`に基づく5つの要件をすべて実装完了。

---

## 実装完了した機能（2025-12-31）

### 要件3+4: 高さ拡大 + リサイズ機能
- **content.css**: `.nf-dropdown-list`の`max-height: 200px`を削除
- **content.css**: リサイズハンドル用CSS `.nf-dropdown-resize-handle` 追加
- **content.js**: 定数追加
  - `DEFAULT_DROPDOWN_HEIGHT = 350`
  - `MIN_DROPDOWN_HEIGHT = 100`
  - `MAX_DROPDOWN_HEIGHT = 600`
- **content.js**: 新規関数追加
  - `getDropdownHeight()` - storageから高さ読込
  - `saveDropdownHeight(height)` - storageに高さ保存
- **content.js**: `showTagDropdown`をasync化、リサイズ処理実装

### 要件5: 固定表示
- **content.css**: `.nf-dropdown-fixed-options` 追加
- **content.css**: `.nf-root-drop-zone:focus`, `.nf-untagged-option:focus` フォーカススタイル追加
- **content.js**: 「ルートに移動」「タグなし」を`fixedOptionsContainer`に分離
- **content.js**: `setupKeyboardNavigation`のセレクタを`.nf-dropdown-item, .nf-root-drop-zone`に拡張

### 要件1: 親タグのみ表示
- **content.js**: `createInlineBadges`を修正
  - 子タグから親タグ名を導出（`tag.split('/')[0]`）
  - 重複除去（Set使用）
  - `+N`カウンターも親タグ数基準に計算
  - ツールチップに該当する子タグを表示

### 要件2: ポップオーバー改善
- **content.css**: 親子タグ分離用CSS追加
  - `.nf-popover-parent-tags`
  - `.nf-popover-child-tags`
  - `.nf-popover-section-label`
  - D&D用CSS（`.nf-tag-badge[draggable]`, `.nf-dragging`, `.nf-drop-target-badge`）
- **content.css**: `.nf-popover-tags > .nf-tags-list { display: block; }` 追加（縦方向レイアウト）
- **content.js**: `reorderProjectTags(projectId, draggedParent, targetParent)` 関数追加
- **content.js**: `createTagBadge`に`displayName`, `tooltipText`オプション追加
- **content.js**: `showTagPopover`の`updateUI`を修正
  - 上段: 親タグ（D&D可能）
  - 下段: 子タグ（末尾部分のみ表示）

---

## 修正したファイルと行番号

### content/content.css
- 行150-160: `.nf-tags-list`とポップオーバー用縦方向レイアウト
- 行162-195: 親子タグ分離表示CSS
- 行375-413: リサイズハンドル、固定オプションCSS

### content/content.js
- 行34-37: ドロップダウン高さ定数
- 行138-185: `getDropdownHeight()`, `saveDropdownHeight()` 関数
- 行984-1050: `reorderProjectTags()` 関数
- 行1340-1364: `createTagBadge`に`displayName`, `tooltipText`対応
- 行1624-1757: `showTagPopover`の`updateUI`（親子分離+D&D）
- 行1746-1793: `createInlineBadges`（親タグ導出ロジック）
- 行2444-2520: `showTagDropdown`（async化、リサイズ処理）
- 行2522-2619: 固定オプションコンテナ
- 行2870-2898: クリーンアップ、キーボードナビゲーション拡張

---

## テスト確認項目

- [ ] 子タグ`AI/機械学習`から親`AI`が導出されカードに表示
- [ ] ポップオーバーで親タグ（上段）と子タグ（下段）が分離表示
- [ ] 親タグをD&Dで並び替え可能
- [ ] 並び順がカード表示に即座に反映
- [ ] タグ選択窓が広くなっている（デフォルト350px）
- [ ] 下辺ドラッグでリサイズ可能（100-600px）
- [ ] リサイズサイズが次回も保持される
- [ ] 「ルートに移動」「タグなし」がスクロールしても固定表示
- [ ] キーボードで固定オプションにもフォーカス可能

---

## ファイル構成

```
NoteFolder/
├── manifest.json              # Content Script設定済み
├── content/
│   ├── content.js             # メインロジック（約3200行）
│   └── content.css            # スタイル（約900行）
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/
├── 実装計画_タグ表示改善.md   # 実装計画（完了）
├── TAKEOVER.md                # この引き継ぎドキュメント
└── CLAUDE.md                  # プロジェクト指示書
```

---

## 注意事項

### 禁止操作（CLAUDE.mdより）
- `git push`, `git commit` は実行しない
- `.env*`, 秘密鍵ファイルは読み書きしない

### 実装上の注意
- **XSS対策**: ユーザー入力は必ず`textContent`で表示
- **lastErrorチェック**: 全storage操作で`chrome.runtime.lastError`を確認
- **flex: 1は使用しない**: リサイズ機能と競合するため
- **heightはJSで直接設定**: `tagListContainer.style.height`

---

## 技術詳細

### 親タグ抽出ロジック
```javascript
const parentTagNames = [...new Set(
  project.tags.map(tag => tag.split(HIERARCHY_SEPARATOR)[0])
)];
```

### リサイズ処理
```javascript
const savedHeight = await getDropdownHeight();
tagListContainer.style.height = `${savedHeight}px`;
// mousedown/mousemove/mouseupでリサイズ
// mouseupで saveDropdownHeight() 呼び出し
```

### 親タグ並び替え
```javascript
await reorderProjectTags(projectId, draggedParent, targetParent);
// 内部でupdateInlineBadges(projectId)を呼び出し
```

---

**最終更新**: 2025-12-31
**ステータス**: 実装完了・テスト待ち
