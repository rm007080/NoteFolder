# NoteFolder開発 - 詳細な引き継ぎプロンプト

## プロジェクト概要

NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）を開発中。外部サーバー不要、chrome.storage.syncでデータ管理。

**プロジェクトパス**: `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder`

---

## 現在の進捗状況

### 開発フェーズ: 完了 → 公開準備中

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
| Step 11 | タグ削除機能（allTagsから完全削除） | ✅ 完了 |
| Step 12 | フォルダアイコン消失問題の修正 | ✅ 完了 |
| Step 13 | セキュリティレビュー + P2改善 | ✅ 完了 |
| Step 14 | 公開準備（README、note記事下書き） | ✅ 完了 |

---

## ✅ 直前に完了した作業（2025-12-28）

### 1. タグ削除機能

allTagsに登録されたタグを完全削除できる機能を追加。

| 項目 | 内容 |
|------|------|
| 場所 | フィルタードロップダウン（🏷️ タグ ▼）内 |
| UI | タグにマウスホバーで×ボタンが表示 |
| 動作 | クリック→確認ダイアログ→OK→削除 |
| 影響範囲 | allTags + 全プロジェクトからタグを削除 |

#### 追加関数

| 関数 | 行番号（目安） | 内容 |
|------|---------------|------|
| `removeTagFromAllProjects()` | ~455 | allTagsと全プロジェクトからタグを一括削除 |

### 2. フォルダアイコン消失問題の修正

「おすすめのノートブック」等から「全て」に戻った際にフォルダアイコンが消える問題を修正。

| 項目 | 内容 |
|------|------|
| 原因 | `processedProjects`にIDが残っているがDOMが再構築されていた |
| 修正1 | `injectFolderIcon()`でDOM存在チェックを追加 |
| 修正2 | `setupSectionToggleListener()`でセクション切り替え時に再注入 |

#### 追加関数

| 関数 | 行番号（目安） | 内容 |
|------|---------------|------|
| `setupSectionToggleListener()` | ~1455 | mat-button-toggle-groupのクリックを監視し、フォルダアイコンを再注入 |

### 3. セキュリティレビュー実施

Codex MCPによるセキュリティレビューを実施。

#### 結果サマリー

| 評価 | 件数 | 内容 |
|------|------|------|
| P0（重大） | 0件 | なし |
| P1（高） | 0件 | なし |
| P2（中） | 1件 | popup.jsのinnerHTML使用 → **修正済み** |

#### 確認項目

| # | 確認項目 | 結果 |
|---|----------|------|
| 1 | 外部通信 | なし（chrome.storage.syncのみ） |
| 2 | 動的コード実行 | eval(), new Function()なし |
| 3 | XSS脆弱性 | textContent使用、適切なサニタイズ |
| 4 | 権限の妥当性 | storage + notebooklm.google.comのみ |
| 5 | データ漏洩 | 外部送信なし |
| 6 | 第三者スクリプト | 外部スクリプト読み込みなし |
| 7 | クリックジャッキング | 不正UIなし |
| 8 | CSP違反 | 違反なし |

### 4. P2セキュリティ改善

`popup/popup.js`の49-51行目を修正。

**Before（innerHTML使用）**:
```javascript
projectIdElement.innerHTML =
  'タグ管理はNotebookLMのプロジェクト一覧ページで行えます<br>' +
  '<small style="color: #80868b;">登録済みタグ: ' + allTags.length + '個</small>';
```

**After（DOM操作使用）**:
```javascript
projectIdElement.textContent = '';
projectIdElement.appendChild(document.createTextNode('タグ管理は...'));
projectIdElement.appendChild(document.createElement('br'));
const small = document.createElement('small');
small.style.color = '#80868b';
small.textContent = '登録済みタグ: ' + allTags.length + '個';
projectIdElement.appendChild(small);
```

### 5. 公開準備ファイル作成

| ファイル | 操作 | 内容 |
|----------|------|------|
| `.gitignore` | 更新 | CLAUDE.md, TAKEOVER.md, .claude/を除外に追加 |
| `README.md` | 全面書き換え | インストール方法、使い方、注意事項を追加 |
| `note記事下書き.md` | 新規作成 | note投稿用の記事下書き |

---

## ファイル構成

```
NoteFolder/
├── manifest.json              # Content Script設定済み
├── content/
│   ├── content.js             # メインロジック（約1550行）
│   └── content.css            # スタイル（約520行）
├── popup/
│   ├── popup.html             # 設定画面
│   ├── popup.css
│   └── popup.js               # P2改善済み
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── README.md                  # 公開用（充実版）
├── LICENSE                    # MITライセンス
├── note記事下書き.md           # note投稿用下書き
├── 要件定義..md               # 開発ドキュメント（公開）
├── 実装計画.md                # 開発ドキュメント（公開）
├── アーキテクチャ.md          # 開発ドキュメント（公開）
├── 参照ルール.md              # 開発ドキュメント（公開）
├── TAKEOVER.md                # この引き継ぎドキュメント（非公開）
└── CLAUDE.md                  # プロジェクト指示書（非公開）
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
| `updateCache()` | ~137 | キャッシュ更新 |
| `setupStorageListener()` | ~149 | onChangedリスナー登録 |
| `setupKeyboardNavigation()` | ~241 | キーボードナビゲーション共通ロジック |
| `addTagToProject()` | ~354 | タグ追加（キャッシュ対応） |
| `removeTagFromProject()` | ~418 | プロジェクトからタグ削除 |
| `removeTagFromAllProjects()` | ~455 | allTagsからタグ完全削除 |
| `showTagPopover()` | ~560 | ポップオーバー表示 |
| `updateFolderIconState()` | ~825 | フォルダアイコン状態更新 |
| `injectFolderIcon()` | ~848 | フォルダアイコン注入（DOM存在チェック付き） |
| `filterProjectsByTags()` | ~990 | フィルタリング処理 |
| `sortProjects()` | ~1055 | ソート処理 |
| `showTagDropdown()` | ~1260 | タグ選択ドロップダウン（削除ボタン付き） |
| `setupSectionToggleListener()` | ~1520 | セクション切り替え監視 |
| `initNoteFolder()` | ~1555 | 初期化 |

---

## 公開準備 - 残りのユーザー作業

### 1. スクリーンショットの撮影

`screenshots/`フォルダを作成し、以下を撮影:

| ファイル名 | 内容 |
|------------|------|
| `main.png` | メイン画面（📁アイコンが表示された状態） |
| `add-tag.png` | タグ追加ポップオーバー |
| `filter.png` | フィルター使用時 |
| `extensions-page.png` | chrome://extensions画面 |
| `loaded.png` | 拡張機能読み込み完了画面 |

### 2. 配布用ZIPファイルの作成

**含めるファイル**:
```
NoteFolder-v1.0.0/
├── manifest.json
├── content/
├── popup/
├── icons/
├── README.md
└── LICENSE
```

**除外**: 開発ドキュメント、`.git/`、`CLAUDE.md`、`TAKEOVER.md`、`note記事下書き.md`

### 3. Git操作

```bash
# mainブランチにマージ
git checkout main
git merge develop_2_cache

# タグを作成（公開版の目印）
git tag v1.0.0

# プッシュ
git push origin main
git push origin v1.0.0
```

### 4. GitHub Releases作成

1. GitHubリポジトリの「Releases」→「Create a new release」
2. タグ: `v1.0.0`を選択
3. タイトル: `v1.0.0 - 初回リリース`
4. 説明を記入
5. 配布用ZIPファイルをアップロード
6. 「Publish release」

### 5. note記事の投稿

`note記事下書き.md`の内容をnoteに投稿し、スクリーンショットを追加。

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
6. タグドロップダウン内の×ボタン → タグ完全削除
7. 「おすすめのノートブック」→「全て」で📁アイコンが再表示されること

---

## 注意事項

### chrome.storage.sync エラー対策

拡張機能のコンテキストが無効になると`chrome.storage.sync`がundefinedになる。対策として`isStorageAvailable()`関数を追加済み。

### 禁止操作（CLAUDE.mdより）

- `git push`, `git commit` は実行しない
- `.env*`, 秘密鍵ファイルは読み書きしない

---

**最終更新**: 2025-12-28
**実装担当**: Claude Opus 4.5 / Claude Sonnet 4
**進捗**: 開発完了、公開準備完了（ユーザー作業待ち）
