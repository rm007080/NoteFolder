# NoteFolder開発 - 詳細な引き継ぎプロンプト

## プロジェクト概要

NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）を開発中。外部サーバー不要、chrome.storage.syncでデータ管理。

**プロジェクトパス**: `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder`

---

## 現在の進捗状況

### 完了したステップ

| Step | 内容 | 状態 |
|------|------|------|
| Step 1 | manifest.json更新（Content Script設定） | ✅ 完了 |
| Step 2 | フォルダアイコン注入 + クリックイベント | ✅ 完了 |
| Step 3 | タグ入力ポップオーバー | ✅ 完了 |
| Step 4 | タグ保存・読込（chrome.storage.sync） | ✅ 完了（Step 3に含む） |
| Step 5 | フィルターUI実装 | ✅ 完了 |
| Step 5+ | タグ検索機能（ドロップダウン内） | ✅ 完了 |
| Step 6 | ソート機能実装 | ✅ 基本実装完了 |
| Step 7 | MutationObserver | ✅ 完了（Step 2に含む） |
| Step 8 | スタイリング + UX改善 | 🚧 未着手 |

---

## 🔴 次に対応すべき重要な問題

### 問題の概要

フィルター/ソート後のプロジェクトカード表示に問題がある:

1. **フィルター後の歯抜け状態**: タグでフィルタリングすると、非表示カードの場所が空きスペースとして残り、カードが歯抜け状態になる
2. **ソート後のレイアウト崩れ**: ソート後にカードが一列に並んでしまう
3. **デフォルト復元不可**: 「デフォルト」ソートを選択しても元の順序に戻らない

### 問題の原因

現在の実装:
- フィルタリング: `card.style.display = 'none'` で非表示
- ソート: `parent.appendChild(card)` でDOM並び替え

NotebookLMのCSS Gridレイアウトでは、`display: none`にしたカードの「位置」が空きスペースとして残る。

### 修正方針

```javascript
// 修正のポイント:
// 1. 初期化時に元のカード順序を記録
// 2. フィルター/ソート時は該当カードをDOMに順番に再配置（appendChild）
// 3. 非表示カードは display:none ではなく、DOMから一時的に除外するか、
//    表示カードだけを順番にappendChildして自然に左詰めにする
// 4. デフォルト選択時は記録した元の順序で再配置
```

### 修正すべき関数

1. **`filterProjectsByTags()`** (content.js:644-697)
   - 現在: `card.style.display = hasMatchingTag ? '' : 'none'`
   - 修正後: 表示するカードだけを`parent.appendChild(card)`で再配置

2. **`sortProjects()`** (content.js:718-783)
   - 現在: ソート後にappendChildしているが、非表示カードも含めている
   - 修正後: 表示中のカードだけをソート・再配置

3. **新規: 元の順序を記録する仕組み**
   - 初期化時に`originalCardOrder`配列に保存
   - 「デフォルト」選択時にこの順序で復元

### 参考: 修正イメージ

```javascript
// グローバル変数として追加
let originalCardOrder = [];

// 初期化時に元の順序を記録
function saveOriginalCardOrder() {
  originalCardOrder = Array.from(getProjectCards());
}

// フィルター処理の修正版
function filterProjectsByTags(tags) {
  const cards = originalCardOrder.length > 0
    ? originalCardOrder
    : Array.from(getProjectCards());

  if (cards.length === 0) return;
  const parent = cards[0].parentElement;

  // 全カードを一度非表示
  cards.forEach(card => card.style.display = 'none');

  if (tags.length === 0) {
    // フィルターなし: 元の順序で全表示
    cards.forEach(card => {
      card.style.display = '';
      parent.appendChild(card);
    });
    return;
  }

  // フィルター適用: 該当カードだけを順番に再配置
  // ... ストレージからタグ情報取得後 ...
  cards.forEach(card => {
    const hasMatchingTag = /* タグチェック */;
    if (hasMatchingTag) {
      card.style.display = '';
      parent.appendChild(card);
    }
  });
}
```

---

## 実装済み機能の詳細

### フォルダアイコン（Step 2）

- **セレクタ**: `[id^="project-"][id$="-emoji"]`
- **プロジェクトID抽出**: `id.match(/^project-(.+)-emoji$/)[1]`
- **クリックイベント**: キャプチャフェーズで処理（`{ capture: true }`）
- **イベント伝播停止**: `stopPropagation()` + `stopImmediatePropagation()`

### タグ入力ポップオーバー（Step 3）

- **showTagPopover()**: フォルダアイコンクリックで表示
- **タグ追加**: `addTagToProject(projectId, tag)`
- **タグ削除**: `removeTagFromProject(projectId, tag)`
- **タグ候補**: 入力に応じて前方一致でフィルタリング
- **XSS対策**: `textContent`使用、`innerHTML`禁止

### フィルターUI（Step 5）

- **配置場所**: `mat-button-toggle-group.project-section-toggle` の直後
- **タグ選択**: ドロップダウン + 検索機能付き
- **選択中タグ表示**: バッジ形式、個別削除・一括クリア可能

### ソート機能（Step 6）

- **ソートオプション**:
  - デフォルト（元の順序）← 現在動作しない
  - 名前順 (A→Z)
  - 名前順 (Z→A)
  - タグ数 (多→少)

---

## ファイル構成

```
NoteFolder/
├── manifest.json              # Content Script設定済み
├── content/
│   ├── content.js             # メインロジック（約1100行）
│   └── content.css            # スタイル（約460行）
├── popup/
│   ├── popup.html             # 設定画面（簡略化済み）
│   ├── popup.css
│   └── popup.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── 要件定義..md
├── 実装計画.md                # v4版
├── アーキテクチャ.md
├── 参照ルール.md
└── CLAUDE.md                  # プロジェクト指示書
```

---

## データ構造（chrome.storage.sync）

```javascript
{
  "project:{uuid}": {
    "id": "uuid",
    "name": "プロジェクト名",
    "tags": ["AI", "学習"],
    "updatedAt": 1703123456789
  },
  "allTags": ["AI", "リサーチ", "仕事", "学習"]  // ソート済み
}
```

---

## 重要な実装詳細

### content.js の主要関数（行番号は概算）

| 関数 | 行番号 | 役割 |
|------|--------|------|
| `showToast()` | ~51 | トースト通知表示 |
| `validateTagName()` | ~82 | タグ名バリデーション |
| `addTagToProject()` | ~117 | タグ追加 |
| `removeTagFromProject()` | ~188 | タグ削除 |
| `showTagPopover()` | ~274 | ポップオーバー表示 |
| `injectFolderIcon()` | ~510 | フォルダアイコン注入 |
| `filterProjectsByTags()` | ~644 | フィルタリング処理 ← **要修正** |
| `sortProjects()` | ~718 | ソート処理 ← **要修正** |
| `showTagDropdown()` | ~790 | タグ選択ドロップダウン |
| `showSortDropdown()` | ~853 | ソートドロップダウン |
| `injectFilterUI()` | ~920 | フィルターUI注入 |
| `initNoteFolder()` | ~980 | 初期化 |

---

## テスト方法

### 拡張機能の更新

1. `chrome://extensions`
2. NoteFolderの「更新」ボタン
3. NotebookLMページをリロード

### 動作確認

1. https://notebooklm.google.com/ を開く
2. F12 → Console でログを確認
3. フォルダアイコン(📁)をクリック → ポップオーバー表示
4. タグを追加/削除
5. フィルターボタンでタグ選択 → プロジェクトがフィルタリング
6. ソートボタンでソート選択 → プロジェクトが並び替え

---

## 引き継ぎ時の最初のアクション

1. **このファイルを読んで状況を把握**

2. **次のタスクを確認**:
   - フィルター/ソート後のレイアウト問題を修正
   - 修正対象: `filterProjectsByTags()`, `sortProjects()`
   - 元の順序を記録する仕組みを追加

3. **修正手順**:
   1. `originalCardOrder`変数を追加
   2. `initNoteFolder()`で`saveOriginalCardOrder()`を呼び出し
   3. `filterProjectsByTags()`を修正（表示カードのみappendChild）
   4. `sortProjects()`を修正（表示カードのみソート・再配置）
   5. 「デフォルト」ソートで元の順序を復元

4. **テスト**:
   - タグフィルター後、カードが左詰めで表示されるか
   - ソート後、カードが左詰めで表示されるか
   - 「デフォルト」で元の順序に戻るか

---

## 将来のタスク（Step 8以降）

- [ ] キーボードナビゲーション（ドロップダウン内でTab/矢印キー移動）
- [ ] タグ付きプロジェクトのインジケーター表示（フォルダアイコンにドット）
- [ ] ポップアップ画面での全タグ管理
- [ ] デバッグログの削除（本番リリース前）

---

**最終更新**: 2025-12-27
**実装担当**: Claude Opus 4.5
**進捗**: Step 6完了・レイアウト問題の修正待ち（全8ステップ中）
