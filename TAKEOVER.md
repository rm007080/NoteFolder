# NoteFolder開発 - 詳細な引き継ぎプロンプト

## プロジェクト概要

NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）を開発中。外部サーバー不要、chrome.storage.syncでデータ管理。

**プロジェクトパス**: `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder`

---

## 現在の進捗状況

### 開発フェーズ: 機能拡張中（Phase 0, 1 完了 → Phase 2から再開）

| Phase | 内容 | 状態 |
|-------|------|------|
| MVP | 基本機能（タグ追加/削除/フィルター/ソート） | ✅ 完了 |
| Phase 0 | 基盤整備（マイグレーション、tagMeta、構造化フィルター） | ✅ 完了 |
| Phase 1 | タグ機能（階層化、色分け） | ✅ 完了 |
| Phase 2 | UI機能（タグ常時表示、検索、ピン留め） | 🔄 次に実装 |
| Phase 3 | 統計機能（タグ使用統計） | ⏳ 未着手 |

---

## ✅ 完了した機能拡張（2025-12-30）

### Phase 0: 基盤整備

| 機能 | 実装内容 |
|------|----------|
| マイグレーション戦略 | `migrateDataIfNeeded()`, `_migrationVersion: 2` |
| 階層区切り文字 | `HIERARCHY_SEPARATOR = '/'` |
| プロジェクト名キャプチャ | `getProjectNameFromDOM()`, `syncProjectNameIfChanged()` |
| tagMetaシャーディング | `getShardKey()`, `saveTagMeta()`, `removeTagMeta()` |
| 構造化フィルター | `FilterType`, `currentFilters`, `applyFilters()` |
| キャッシュ拡張 | `cache.tagMeta`, `cache.migrationDone` |

### Phase 1: タグ機能

| 機能 | 実装内容 |
|------|----------|
| タグ階層化 | `/`区切り、ツリービュー表示、親タグ自動作成 |
| タグ色分け | 8色パレット、色継承、カラーピッカーUI |

---

## 🔄 次に実装する機能（Phase 2: UI機能）

| # | 機能 | 概要 | 実装箇所 |
|---|------|------|----------|
| 4 | タグ常時表示 | プロジェクト名横にバッジ表示（最大3個） | `injectFolderIcon()` 拡張 |
| 5 | プロジェクト名検索 | 名前でリアルタイム検索 | `injectFilterUI()` に検索入力欄追加 |
| 6 | タグなしプロジェクト表示 | 未分類プロジェクトをフィルター | `showTagDropdown()` に「タグなし」オプション |
| 7 | お気に入り/ピン留め | ★で上部固定 | `injectFolderIcon()` に★追加、`sortProjects()` 拡張 |

### Phase 2 実装開始コマンド
```
機能拡張実装計画_v3.mdを読み込み、Phase 2（UI機能）の実装を開始してください。
機能4（タグ常時表示）から順番に実装してください。
```

---

## 新データ構造（Phase 0で拡張済み）

```javascript
{
  // プロジェクトデータ（拡張版）
  "project:{uuid}": {
    "id": "uuid",
    "name": "プロジェクト名",           // DOMから取得して保存
    "tags": ["AI/機械学習", "学習"],    // 階層化対応（/区切り）
    "pinned": false,                     // 機能7: ピン留め
    "updatedAt": 1703123456789
  },

  // タグメタデータ（シャード分割）
  "tagMeta:A": {
    "AI": { "color": null },
    "AI/機械学習": { "color": "#34a853" }
  },
  "tagMeta:学": {
    "学習": { "color": "#4285f4" }
  },

  // マイグレーションバージョン
  "_migrationVersion": 2,

  // 後方互換性（廃止予定だが残存）
  "allTags": ["AI", "AI/機械学習", "学習"]
}
```

---

## ファイル構成

```
NoteFolder/
├── manifest.json              # Content Script設定済み
├── content/
│   ├── content.js             # メインロジック（2356行）
│   └── content.css            # スタイル（644行）
├── popup/
│   ├── popup.html             # 設定画面
│   ├── popup.css
│   └── popup.js               # P2改善済み
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── README.md                  # 公開用
├── LICENSE                    # MITライセンス
├── 機能拡張実装計画_v3.md      # 詳細な実装仕様
├── TAKEOVER.md                # この引き継ぎドキュメント（非公開）
└── CLAUDE.md                  # プロジェクト指示書（非公開）
```

---

## 主要関数（Phase 0, 1で追加）

### 階層タグ関数

| 関数 | 役割 |
|------|------|
| `parseHierarchicalTag(tag)` | タグをパーツ配列に分割 |
| `getParentTag(tag)` | 親タグを取得 |
| `getChildTags(parentTag, allTags)` | 子タグを取得 |
| `getTagDepth(tag)` | タグの深度を取得 |
| `ensureParentTagExists(tag)` | 親タグ自動作成 |

### tagMetaシャーディング

| 関数 | 役割 |
|------|------|
| `getShardKey(tagName)` | タグ名からシャードキーを取得 |
| `loadTagMetaFromItems(items)` | ストレージからtagMetaを読み込み |
| `saveTagMeta(tagName, data)` | tagMetaを保存 |
| `removeTagMeta(tagName)` | tagMetaから削除 |

### タグ色管理

| 関数 | 役割 |
|------|------|
| `getTagColor(tagName)` | タグ色取得（親からの継承あり） |
| `setTagColor(tagName, color)` | タグ色設定 |
| `hasCustomColor(tagName)` | カスタム色設定の有無 |
| `showColorPickerPopover()` | カラーピッカーUI表示 |
| `getContrastColor(hexColor)` | コントラスト計算 |

### 構造化フィルター

| 関数 | 役割 |
|------|------|
| `applyFilters()` | 構造化フィルターを適用 |
| `addFilter(type, value)` | フィルター追加 |
| `removeFilter(type, value)` | フィルター削除 |
| `clearAllFilters()` | 全フィルタークリア |
| `extractProjectIdFromCard(card)` | カードからプロジェクトID抽出 |

### FilterType定義

```javascript
const FilterType = {
  TAG: 'tag',           // 特定タグでフィルター
  TAG_PARENT: 'tagParent',  // 親タグでフィルター（子を含む）
  UNTAGGED: 'untagged', // タグなしプロジェクト
  TEXT: 'text',         // テキスト検索
  PINNED: 'pinned'      // ピン留めのみ
};
```

### プロジェクト名キャプチャ

| 関数 | 役割 |
|------|------|
| `getProjectNameFromDOM(projectId)` | DOMからプロジェクト名を取得 |
| `syncProjectNameIfChanged(projectId)` | プロジェクト名の変更を同期 |

---

## Phase 2 実装ガイド

### 機能4: タグ常時表示

```javascript
// injectFolderIcon()内でバッジコンテナ追加
function createInlineBadges(projectId, max = 3) {
  const project = getCachedProject(projectId);
  if (!project?.tags?.length) return null;

  const container = document.createElement('div');
  container.className = 'nf-inline-badges';

  project.tags.slice(0, max).forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'nf-inline-badge';
    badge.textContent = tag;
    const color = getTagColor(tag);
    if (color) {
      badge.style.backgroundColor = color;
      badge.style.color = getContrastColor(color);
    }
    container.appendChild(badge);
  });

  return container;
}
```

### 機能5: プロジェクト名検索

```javascript
// injectFilterUI()に検索入力欄追加
const searchInput = document.createElement('input');
searchInput.className = 'nf-search-input';
searchInput.placeholder = '🔍 プロジェクト名で検索...';
searchInput.addEventListener('input', debounce(() => {
  const value = searchInput.value.trim();
  currentFilters = currentFilters.filter(f => f.type !== FilterType.TEXT);
  if (value) {
    addFilter(FilterType.TEXT, value);
  }
  applyFilters();
}, 300));
```

### 機能6: タグなしプロジェクト表示

```javascript
// showTagDropdown()に「タグなし」オプション追加
const untaggedItem = document.createElement('div');
untaggedItem.className = 'nf-dropdown-item nf-untagged-option';
untaggedItem.textContent = '📂 タグなし';
untaggedItem.addEventListener('click', () => {
  addFilter(FilterType.UNTAGGED, true);
  applyFilters();
});
tagListContainer.insertBefore(untaggedItem, tagListContainer.firstChild);
```

### 機能7: お気に入り/ピン留め

```javascript
// injectFolderIcon()に★アイコン追加
const pinIcon = document.createElement('button');
pinIcon.className = 'nf-pin-icon';
pinIcon.textContent = project?.pinned ? '★' : '☆';
pinIcon.addEventListener('click', async (e) => {
  e.stopPropagation();
  await togglePinProject(projectId);
});

// sortProjects()でピン留め優先
cardsWithData.sort((a, b) => {
  // ピン留めを優先
  if (a.pinned && !b.pinned) return -1;
  if (!a.pinned && b.pinned) return 1;
  // その後は通常のソート
  // ...
});
```

---

## テスト方法

### 拡張機能の更新

1. `chrome://extensions`
2. NoteFolderの「更新」ボタン
3. NotebookLMページをリロード

### 動作確認

1. https://notebooklm.google.com/ を開く
2. F12 → Console でエラーがないことを確認
3. フォルダアイコン(📁)をクリック → ポップオーバー表示
4. タグを追加 → 🎨ボタンで色変更
5. 階層タグを追加（例: `AI/機械学習`）
6. フィルタードロップダウン → ツリービュー表示確認

---

## 注意事項

### 禁止操作（CLAUDE.mdより）

- `git push`, `git commit` は実行しない
- `.env*`, 秘密鍵ファイルは読み書きしない

### 参照ドキュメント

- `機能拡張実装計画_v3.md` - 詳細な実装仕様
- `CLAUDE.md` - 開発ガイド・禁止操作

---

**最終更新**: 2025-12-30
**実装担当**: Claude Opus 4.5
**進捗**: Phase 0, 1 完了 → Phase 2 実装待ち
