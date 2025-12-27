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
| Step 9 | デバッグログ削除 | ✅ 完了 |
| Step 10 | キャッシュ化（パフォーマンス改善） | ✅ 完了 |

---

## ✅ 直前に完了した機能（2025-12-28）

### 1. デバッグログ削除

`console.log`と`console.warn`をすべて削除。`console.error`のみ残存（エラーハンドリング用）。

| ファイル | 削除数 | 残存（error） |
|----------|--------|---------------|
| content/content.js | 27箇所 | 6箇所 |
| popup/popup.js | 2箇所 | 1箇所 |

### 2. chrome.storage.syncのキャッシュ化

ストレージアクセスを大幅削減し、UI表示速度を向上。

#### キャッシュ構造

```javascript
const cache = {
  allTags: [],
  projects: new Map(),  // projectId -> projectData
  initialized: false
};
let cacheReadyPromise = null;
```

#### 新規追加関数（content.js:28-169）

| 関数 | 内容 |
|------|------|
| `initCache()` | 初期化時に全データをキャッシュに読み込み |
| `ensureCacheReady()` | キャッシュ初期化完了を待機 |
| `getCachedAllTags()` | allTagsをキャッシュから取得 |
| `getCachedProject(projectId)` | 個別プロジェクトをキャッシュから取得 |
| `getCachedAllProjectTags()` | 全プロジェクトのタグマップを取得 |
| `updateCache(projectId, projectData, newAllTags)` | 書き込み成功後にキャッシュを更新 |
| `setupStorageListener()` | 他タブからの変更を検知して同期 |

#### 変更された関数

| 関数 | 変更内容 |
|------|---------|
| `addTagToProject()` | キャッシュから読み込み、SET成功後に更新 |
| `removeTagFromProject()` | キャッシュから読み込み、SET成功後に更新 |
| `showTagPopover()` | updateUI()がキャッシュからUI構築（非同期削除） |
| `filterProjectsByTags()` | getCachedAllProjectTags()でタグマップ取得 |
| `sortProjects()` | getCachedAllProjectTags()でタグマップ取得 |
| `showTagDropdown()` | getCachedAllTags()でタグ取得（非同期削除） |
| `updateFolderIconState()` | getCachedProject()で同期取得 |
| `initNoteFolder()` | initCache().then()でキャッシュ初期化後にUI注入 |

#### 効果

- ストレージ読み込み: 初期化時の1回のみ
- UI表示: 即時（非同期待ち不要）
- 他タブ同期: `chrome.storage.onChanged`で自動更新

---

## ファイル構成

```
NoteFolder/
├── manifest.json              # Content Script設定済み
├── content/
│   ├── content.js             # メインロジック（約1490行）
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

### content.js の主要関数（行番号は目安）

| 関数 | 行番号 | 役割 |
|------|--------|------|
| `initCache()` | ~47 | キャッシュ初期化（全データ読み込み） |
| `ensureCacheReady()` | ~92 | キャッシュ初期化待機 |
| `getCachedAllTags()` | ~106 | キャッシュからallTags取得 |
| `getCachedProject()` | ~115 | キャッシュから個別プロジェクト取得 |
| `getCachedAllProjectTags()` | ~123 | 全プロジェクトのタグマップ取得 |
| `updateCache()` | ~137 | キャッシュ更新 |
| `setupStorageListener()` | ~149 | onChangedリスナー登録 |
| `setupKeyboardNavigation()` | ~234 | キーボードナビゲーション共通ロジック |
| `addTagToProject()` | ~354 | タグ追加（キャッシュ対応） |
| `removeTagFromProject()` | ~418 | タグ削除（キャッシュ対応） |
| `showTagPopover()` | ~495 | ポップオーバー表示 |
| `updateFolderIconState()` | ~760 | フォルダアイコン状態更新 |
| `filterProjectsByTags()` | ~922 | フィルタリング処理 |
| `sortProjects()` | ~991 | ソート処理 |
| `showTagDropdown()` | ~1189 | タグ選択ドロップダウン |
| `initNoteFolder()` | ~1450 | 初期化（キャッシュ初期化後にUI注入） |

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
2. F12 → Console でエラーがないことを確認
3. フォルダアイコン(📁)をクリック → ポップオーバー表示
4. タグを追加/削除
5. フィルターボタンでタグ選択 → プロジェクトがフィルタリング
6. ソートボタンでソート選択 → プロジェクトが並び替え

### キャッシュ動作確認

1. 初回読み込み時にキャッシュが初期化されること
2. タグ追加/削除後にUIが即座に更新されること
3. 別タブでタグを変更した場合に同期されること

---

## 将来のタスク

### リリース前（必須）
- [x] デバッグログ削除（console.log等の除去） ✅ 2025-12-28完了
- [x] パフォーマンス改善（chrome.storage.syncのキャッシュ化） ✅ 2025-12-28完了

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

### キャッシュの注意点

- キャッシュは`initNoteFolder()`で`initCache()`を呼び出して初期化
- 書き込み成功後のみ`updateCache()`でキャッシュを更新（失敗時は更新しない）
- 他タブからの変更は`chrome.storage.onChanged`で検知してキャッシュを自動更新

### 禁止操作（CLAUDE.mdより）

- `git push`, `git commit` は実行しない
- `.env*`, 秘密鍵ファイルは読み書きしない

---

**最終更新**: 2025-12-28
**実装担当**: Claude Opus 4.5
**進捗**: リリース前必須タスク完了（デバッグログ削除 + キャッシュ化）
