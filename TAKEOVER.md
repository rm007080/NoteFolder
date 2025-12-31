# NoteFolder開発 - 詳細な引き継ぎプロンプト

## プロジェクト概要

NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）を開発中。外部サーバー不要、chrome.storage.syncでデータ管理。

**プロジェクトパス**: `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder`

---

## 現在の状況

### ステータス: タグ表示改善 - 実装待ち

前回のUI即時更新バグ修正が完了し、新機能の実装計画が確定済み。

---

## 次に実装する機能（5件）

詳細は `実装計画_タグ表示改善.md` を参照。

| # | 要件 | 概要 |
|---|------|------|
| 1 | 親タグのみ表示 | カードに子タグから導出した親タグ名を表示 |
| 2 | ポップオーバー改善 | 上段:親タグ（D&D可）、下段:子タグ |
| 3 | 高さ拡大 | デフォルト350px |
| 4 | リサイズ機能 | 下辺ドラッグで100-600px可変、サイズ保存 |
| 5 | 固定表示 | 「ルートに移動」「タグなし」をスクロール外に |

### 実装順序
1. 要件3+4: 高さ+リサイズ（CSS修正 + JS追加）
2. 要件5: 固定表示（構造変更 + キーボード対応）
3. 要件1: 親タグ抽出（createInlineBadges修正）
4. 要件2: ポップオーバー改善（親子分離 + D&D）

### 対象ファイルと行番号
- `content/content.js`:
  - `createInlineBadges`: 行1692-1725（要件1）
  - `showTagPopover`: 行1388-1658（要件2）
  - `showTagDropdown`: 行2390-2815（要件3,4,5）
- `content/content.css`:
  - `.nf-dropdown-list`: 行369-372（要件3,4）

### 新規追加する関数
- `getDropdownHeight()`: storage読込
- `saveDropdownHeight(height)`: storage保存
- `reorderProjectTags(projectId, fromIndex, toIndex)`: タグ並び替え

### Codexレビュー結果
- **P0問題: なし**
- 実装可能: はい

---

## 完了済みの修正

### 第3回修正（2025-12-31）- タグ選択メニュー即時更新

**問題**: タグ選択メニュー（ドロップダウン）でタグ削除/移動後、UIが即座に更新されなかった

**解決策**: `renderTagList`関数内で毎回`getCachedAllTags()`を呼び出すように変更

### 第2回修正 - イベントベースUI同期機構

```javascript
const uiUpdateCallbacks = {
  popover: null,
  dropdown: null
};

function triggerUIRefresh() {
  if (uiUpdateCallbacks.popover) uiUpdateCallbacks.popover();
  if (uiUpdateCallbacks.dropdown) uiUpdateCallbacks.dropdown();
}
```

### 第1回修正 - 完了済み
- タグカラー変更後のUI更新
- SPAナビゲーション後のUI再注入
- セクション切り替え後のUI維持

---

## ファイル構成

```
NoteFolder/
├── manifest.json              # Content Script設定済み
├── content/
│   ├── content.js             # メインロジック（約3080行）
│   └── content.css            # スタイル
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/
├── 実装計画_タグ表示改善.md   # ★次に実装する計画
├── 実装計画_UI更新バグ修正.md  # 第1回修正の計画
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

---

## 技術詳細

### 親タグ抽出ロジック
```javascript
const parentTagNames = [...new Set(
  project.tags.map(tag => tag.split(HIERARCHY_SEPARATOR)[0])
)];
```

### UI更新の仕組み
```
タグ操作（削除/移動/並び替え）
  ↓
データ更新（chrome.storage.sync）
  ↓
triggerUIRefresh() 呼び出し
  ↓
uiUpdateCallbacks.popover() / dropdown()
  ↓
UI即座更新
```

---

**最終更新**: 2025-12-31
**ステータス**: タグ表示改善 実装待ち
