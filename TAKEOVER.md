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
| Step 4 | タグ保存・読込（chrome.storage.sync） | ✅ 完了 |
| Step 5 | フィルターUI実装 | ✅ 完了 |
| Step 5+ | タグ検索機能（ドロップダウン内） | ✅ 完了 |
| Step 6 | ソート機能実装 | ✅ 完了 |
| Step 7 | MutationObserver | ✅ 完了 |
| Step 8 | スタイリング + UX改善 | ✅ 完了 |

---

## ✅ 直前に完了した機能（2025-12-28）

### キーボードナビゲーション機能

すべてのドロップダウン/ポップオーバーにキーボード操作を追加しました。

#### 実装した機能

| 対象 | キー操作 |
|------|----------|
| **タグ選択ドロップダウン** | ↑↓: アイテム移動、Enter: 選択、Esc: 閉じる、Tab: ソートボタンへ、Shift+Tab: フィルターボタンへ |
| **ソートドロップダウン** | ↑↓: アイテム移動、Enter: 選択、Esc: 閉じる、Shift+Tab: フィルターボタンへ |
| **タグ入力ポップオーバー** | ↑↓: 候補移動、Enter: 候補選択/タグ追加、Tab: 候補を入力欄に反映、Esc: 閉じる |

#### 変更ファイル

| ファイル | 変更内容 |
|---------|----------|
| `content/content.js` | `setupKeyboardNavigation`ヘルパー関数追加、各ドロップダウンへの適用 |
| `content/content.css` | `.nf-keyboard-focus`ハイライトスタイル追加 |

#### 主な変更点

1. **`setupKeyboardNavigation`関数** (content.js:91-167)
   - 共通のキーボードナビゲーションロジック
   - `onTab`コールバックでTab/Shift+Tab時の動作をカスタマイズ可能

2. **ボタンの識別用属性** (content.js:1313, 1323)
   - `data-nf-button="filter"` / `data-nf-button="sort"`
   - Tab移動先の特定に使用

3. **フィルタードロップダウンの自動フォーカス** (content.js:1281)
   - ドロップダウン表示時に検索入力欄へ自動フォーカス
   - クリック直後から矢印キーで操作可能

---

## ファイル構成

```
NoteFolder/
├── manifest.json              # Content Script設定済み
├── content/
│   ├── content.js             # メインロジック（約1400行）
│   └── content.css            # スタイル（約480行）
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
├── TAKEOVER.md                # この引き継ぎドキュメント
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

### content.js の主要関数

| 関数 | 行番号 | 役割 |
|------|--------|------|
| `setupKeyboardNavigation()` | ~91 | キーボードナビゲーション共通ロジック |
| `isStorageAvailable()` | ~14 | chrome.storage.sync利用可能チェック |
| `showToast()` | ~65 | トースト通知表示 |
| `validateTagName()` | ~172 | タグ名バリデーション |
| `addTagToProject()` | ~207 | タグ追加 |
| `removeTagFromProject()` | ~278 | タグ削除 |
| `showTagPopover()` | ~364 | ポップオーバー表示（候補ナビゲーション対応） |
| `injectFolderIcon()` | ~610 | フォルダアイコン注入 |
| `getProjectCards()` | ~730 | プロジェクトカード取得 |
| `saveOriginalCardOrder()` | ~738 | 元のカード順序保存 |
| `filterProjectsByTags()` | ~750 | フィルタリング処理 |
| `sortProjects()` | ~850 | ソート処理 |
| `showSortDropdown()` | ~990 | ソートドロップダウン（キーボード対応） |
| `showTagDropdown()` | ~1120 | タグ選択ドロップダウン（キーボード対応） |
| `injectFilterUI()` | ~1300 | フィルターUI注入 |
| `initNoteFolder()` | ~1380 | 初期化 |

### DOM構造（NotebookLM）

```
div.project-buttons-flow      ← グリッドコンテナ
  └── project-button          ← グリッドアイテム（フィルター/ソートはここに適用）
        └── mat-card.project-button-card
              └── [id^="project-"][id$="-emoji"]  ← プロジェクトID抽出元
```

### グリッドアイテム取得パターン

```javascript
// mat-cardからproject-button要素を取得
const gridItem = card.closest('project-button') || card;

// display制御
gridItem.style.display = visible ? '' : 'none';

// order制御
gridItem.style.order = index;
```

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

### キーボードナビゲーションのテスト

| テスト | 操作 | 期待結果 |
|--------|------|----------|
| フィルタードロップダウン | クリック → ↓キー | タグがハイライト |
| Tab移動 | フィルタードロップダウン → Tab | ソートボタンにフォーカス |
| Shift+Tab移動 | ソートドロップダウン → Shift+Tab | フィルターボタンにフォーカス |
| タグ候補選択 | ポップオーバー入力 → ↓キー → Enter | 候補がタグとして追加 |

---

## 将来のタスク

### リリース前（必須）
- [ ] デバッグログ削除（console.log等の除去）
- [ ] パフォーマンス改善（chrome.storage.syncのキャッシュ化）

### 追加機能（オプション）
- [ ] ポップアップ画面での全タグ管理
- [ ] MutationObserver拡張（SPA遷移時の状態再適用）
- [ ] タグ付きプロジェクトのインジケーター表示強化

---

## 注意事項

### chrome.storage.sync エラー対策

拡張機能のコンテキストが無効になると`chrome.storage.sync`がundefinedになる。対策として`isStorageAvailable()`関数を追加済み。エラーが発生したら：
1. 拡張機能を一度削除
2. 再度読み込み
3. NotebookLMページをリロード

### 禁止操作（CLAUDE.mdより）

- `git push`, `git commit` は実行しない
- `.env*`, 秘密鍵ファイルは読み書きしない

---

**最終更新**: 2025-12-28
**実装担当**: Claude Opus 4.5
**進捗**: Step 8完了（キーボードナビゲーション実装済み）
