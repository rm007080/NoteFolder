● NoteFolder開発 - 詳細な引き継ぎプロンプト

  プロジェクト概要

  NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）を開発中。外部サーバー不要、chrome.storage.syncでデータ管理。

  プロジェクトパス: /mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder

  重要な仕様変更（v4）

  - v3以前: 個別プロジェクトページ(/notebook/{id})で動作、ポップアップ方式
  - v4（現在）: プロジェクト一覧ページ(https://notebooklm.google.com/)で動作、Content Script方式に変更
  - 理由: ユーザー要件により、一覧ページの各プロジェクト横にフォルダアイコンを配置し、タグでフィルタリング可能にする

  現在の進捗状況

  ✅ 完了した作業

  Step 1: Content Script設定（完了）

  - manifest.json更新: Content Script設定追加、不要なtabs・activeTab権限削除
  - content/content.js作成: 基本構造
  - content/content.css作成: スタイルファイル
  - popup.js/html簡略化: URL解析エラー対応、設定画面用に変更

  Step 2: フォルダアイコン注入（実装完了・テスト待ち）

  - DOM構造確認: 絵文字要素 <div id="project-{uuid}-emoji">📘</div> を特定
  - MutationObserver実装: 動的に追加されるプロジェクトに対応
  - 複数回試行ロジック: ページ読み込み時に要素が見つからない場合、最大5回再試行
  - 重複注入防止: processedProjects Setで管理

  現在の状態: 実装完了、ユーザーのテスト結果待ち

  🚧 未完了のタスク

  - Step 2テスト: フォルダアイコンが正しく表示されるか確認
  - Step 3: タグ入力ポップオーバー実装
  - Step 4: タグ保存・読込（chrome.storage.sync）
  - Step 5: フィルターUI実装
  - Step 6: ソート機能実装
  - Step 7: MutationObserver（✅すでに実装済み）
  - Step 8: スタイリング + UX改善

  技術的な重要事項

  DOM構造（NotebookLM）

  <div class="project-button-box">
    <div class="project-button-box-icon"
         id="project-955c465a-0662-41c0-ac1a-48e1c71d1837-emoji">📘</div>
    <!-- ここにフォルダアイコンを注入 -->
  </div>

  セレクタ: [id^="project-"][id$="-emoji"]
  プロジェクトID抽出: id.match(/^project-(.+)-emoji$/)[1]

  データ構造（chrome.storage.sync）

  {
    "project:{uuid}": {
      "id": "uuid",
      "name": "プロジェクト名",
      "tags": ["AI", "学習"],
      "updatedAt": 1703123456789
    },
    "allTags": ["AI", "リサーチ", "仕事", "学習"]  // ソート済み
  }

  重要な実装詳細

  1. MutationObserver (content/content.js:137):
    - 動的に追加されるプロジェクトを検出
    - 絵文字要素が追加されたら即座にフォルダアイコン注入
  2. 処理済み追跡 (content/content.js:14):
  const processedProjects = new Set();
    - 重複注入防止
  3. 複数回試行 (content/content.js:190):
    - 初回500ms後に開始、見つからなければ1秒間隔で最大5回
  4. XSS対策:
    - textContent使用必須、innerHTML禁止
  5. エラーハンドリング:
    - 全storage操作でchrome.runtime.lastErrorチェック

  ファイル構成

  NoteFolder/
  ├── manifest.json              # Content Script設定済み
  ├── content/
  │   ├── content.js             # MutationObserver実装済み
  │   └── content.css            # フォルダアイコンスタイル
  ├── popup/
  │   ├── popup.html             # 簡略化済み（設定画面）
  │   ├── popup.css
  │   └── popup.js               # URL解析削除済み
  ├── icons/
  │   ├── icon16.png
  │   ├── icon48.png
  │   └── icon128.png
  ├── 要件定義..md
  ├── 実装計画.md                # v4版に更新済み
  ├── アーキテクチャ.md
  ├── 参照ルール.md
  └── CLAUDE.md                  # プロジェクト指示書

  既知の問題と対処済み事項

  解決済み

  1. popup.jsのURL解析エラー:
    - 原因: tabs権限削除によりtabs[0].urlがundefined
    - 対処: popup.jsを簡略化、設定画面用に変更
  2. プロジェクト検出失敗:
    - 原因: ページ読み込み1秒後にはDOM未構築
    - 対処: MutationObserver + 複数回試行実装
  3. 拡張機能キャッシュエラー:
    - 対処方法: chrome://extensionsで削除→再読み込み

  テスト方法

  拡張機能の更新

  1. chrome://extensions
  2. NoteFolderの「更新」ボタン
  3. NotebookLMページをリロード

  動作確認

  1. https://notebooklm.google.com/ を開く
  2. F12 → Console
  3. 以下のログを確認:
     - "NoteFolder Content Script loaded"
     - "Injection attempt 1/5"
     - "Found X project(s)"
     - "Folder icon injected for project: {uuid}"
     - "MutationObserver started"
  4. 各プロジェクトの絵文字(📘)右隣に📁が表示されるか確認
  5. 📁をクリック → プロジェクトが開かないことを確認

  Console確認コマンド

  // プロジェクト数確認
  document.querySelectorAll('[id^="project-"][id$="-emoji"]').length

  // フォルダアイコン数確認
  document.querySelectorAll('.nf-folder-icon').length

  // ストレージ確認
  chrome.storage.sync.get(null, console.log)

  次のステップ（Step 3以降）

  Step 3: タグ入力ポップオーバー

  実装計画.md §4.3参照:
  - フォルダアイコンクリックでポップオーバー表示
  - 現在のタグ一覧（削除可能）
  - タグ入力欄 + 候補表示
  - chrome.storage.syncから既存タグ読み込み

  参考コード: 実装計画.md:396-411（UIワイヤーフレーム）

  Step 4: タグ保存・読込

  実装計画.md §4.4参照:
  - 正しいAPIシグネチャ使用（実装計画.md:505-517）
  - allTags正規化（実装計画.md:522-527）
  - エラーハンドリング（実装計画.md:479-497）

  Step 5-8: フィルター・ソート・スタイリング

  実装計画.md §4.5-4.6、§5.3参照

  重要なドキュメント

  1. 実装計画.md: v4版、全実装詳細
  2. CLAUDE.md: Context7自動利用ルール、禁止操作
  3. 要件定義..md: MVPスコープ、成功条件
  4. 参照ルール.md: 禁止操作の完全リスト

  Codex MCPの活用

  - エラー分析時にmcp__codex__codexを使用
  - 現在のコードベースを理解した上で提案を受けられる

  引き継ぎ時の最初のアクション

  1. ユーザーに現在の状況を確認:
     「Step 2のテスト結果を教えてください。フォルダアイコンは表示されましたか？」

  2. テスト完了している場合:
     「Step 3（タグ入力ポップオーバー実装）に進みますか？」

  3. テスト未完了の場合:
     テスト手順を案内し、結果に応じてデバッグ

  ---
  最終更新: 2025-12-27
  実装担当: Claude Sonnet 4.5
  進捗: Step 2実装完了・テスト待ち（全8ステップ中）