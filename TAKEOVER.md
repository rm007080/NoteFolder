# NoteFolder開発 - 詳細な引き継ぎプロンプト

## プロジェクト概要

NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）を開発中。外部サーバー不要、chrome.storage.syncでデータ管理。

**プロジェクトパス**: `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder`

---

## 現在の状況

### ステータス: 2つの改善機能 - 実装待ち

`実装計画_UI改善v4.md`に基づく2つの改善を実装予定。計画はレビュー済み、重大な問題なし。

---

## 実装予定の機能

### 要件1: フィルターUIの配置変更
**目的**: 現在のUIが詰まって見切れる問題を解決

**現在**: `mat-button-toggle-group`の直後に配置
**変更後**: `project-actions-container`と`all-projects-container`の間に移動

**修正箇所**:
1. `findFilterTargetElement()` (content.js:2171-2187) - `all-projects-container`を優先検索
2. `injectFilterUI()` (content.js:3209-3215) - 直前に挿入するロジック追加
3. CSS (content.css:300-306) - `display: flex`, `margin: 8px 0`

### 要件2: タグドロップダウンの階層表示
**目的**: 親タグの左に展開/折りたたみボタン（▶/▼）を追加

**ユーザー選択**:
- 展開状態: storageに保存（次回も保持）
- 検索時: 全展開でフラット表示

**修正箇所**:
1. **ストレージ関数追加** (content.js:185以降)
   - `getExpandedTags()` - 展開中タグ配列を取得
   - `saveExpandedTags(tags)` - 展開中タグ配列を保存
   - `toggleTagExpansion(tagName, currentExpanded)` - 状態トグル

2. **CSS追加** (content.css:756以降)
   - `.nf-tag-expand-btn` - 展開ボタン（16x16px、▶表示）
   - `.nf-tag-expand-btn.expanded` - 90度回転（下向き）
   - `.nf-tag-expand-spacer` - 子タグなし用スペーサー
   - `.has-children::after { content: '' }` - ラベル後の矢印削除

3. **showTagDropdown()修正** (content.js:2632)
   - 関数開始時に `let expandedTags = await getExpandedTags()` 追加

4. **createTagItem()修正** (content.js:2870-3018)
   - 引数追加: `createTagItem(tag, depth, isSearchMode)`
   - 親タグ: 展開ボタン追加（colorIndicatorの前）
   - 子タグなし: スペーサー追加
   - 検索モード: 展開ボタン/スペーサーなし
   - 要素順序: `[展開ボタン/スペーサー] → colorIndicator → checkbox → label → count → deleteBtn`

5. **renderTagList()修正** (content.js:3020-3045)
   - `expandedTags.includes(tag)`で子タグ表示を制御
   - 検索時は`isSearchMode=true`でフラット表示

---

## 実装順序（推奨）

### Phase 1: タグ階層表示（要件2）
```
1. ストレージ関数追加 (content.js:185以降)
2. CSS追加 (content.css:756以降)
3. showTagDropdown()修正 (content.js:2632)
4. createTagItem()修正 (content.js:2870)
5. renderTagList()修正 (content.js:3020)
```

### Phase 2: フィルターUI配置（要件1）
```
6. findFilterTargetElement()修正 (content.js:2171)
7. injectFilterUI()修正 (content.js:3209)
8. CSS調整 (content.css:300)
```

### Phase 3: テスト
```
- 展開/折りたたみ動作
- 展開状態の保存・復元
- 検索時のフラット表示
- フィルターUI位置確認
- 既存機能（D&D、削除、選択）の動作確認
```

---

## 重要な技術詳細

### showTagDropdownは既にasync
```javascript
async function showTagDropdown(button) {  // 行2632
```

### createTagItemは内部関数
`showTagDropdown()`内で定義されているため、`expandedTags`変数にクロージャでアクセス可能

### 現在の要素追加順序（行2946-2950）
```javascript
item.appendChild(colorIndicator);
item.appendChild(checkbox);
item.appendChild(label);
item.appendChild(countSpan);
item.appendChild(deleteBtn);
```
→ 先頭に展開ボタン/スペーサーを追加

### 展開ボタンのイベント分離
```javascript
expandBtn.addEventListener('click', async (e) => {
  e.stopPropagation();  // タグ選択と分離
  expandedTags = await toggleTagExpansion(tag, expandedTags);
  renderTagList(searchInput.value);
});
```

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
├── 実装計画_UI改善v4.md       # 詳細実装計画（今回作成）
├── 実装計画_タグ表示改善.md   # 前回の実装計画（完了）
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
- **stopPropagation**: 展開ボタンクリックはタグ選択と分離

---

## 参照ドキュメント

| ファイル | 内容 |
|----------|------|
| `実装計画_UI改善v4.md` | 詳細実装計画（コード例含む） |
| `CLAUDE.md` | プロジェクト指示書、禁止操作 |

---

**最終更新**: 2025-12-31
**ステータス**: 計画完了・実装待ち
