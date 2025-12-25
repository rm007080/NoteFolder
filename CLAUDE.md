# NoteFolder - Chrome拡張開発ガイド

NotebookLMのプロジェクトをタグで管理し、内容の記憶から再発見しやすくするChrome拡張機能（Manifest V3）。手動タグ付与、タグ候補表示、同一タグのプロジェクト一覧表示がMVPのコア機能。外部サーバー不要、chrome.storage.syncでデータ管理。

---

## ディレクトリマップ

```
NoteFolder/
├── manifest.json              # Manifest V3定義
├── popup/
│   ├── popup.html             # ポップアップUI
│   ├── popup.css              # スタイル
│   └── popup.js               # UIロジック + chrome.storage.sync操作
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── 要件定義.md                # 詳細要件、MVPスコープ、成功条件
├── 実装計画.md                # 技術仕様、データ構造、実装ステップ
└── 参照ルール.md              # 禁止操作の完全リスト
```

---

## 技術スタック

- **Chrome Extension Manifest V3**: 拡張基盤
- **chrome.storage.sync**: タグデータ保存・同期（100KB制限）
- **Vanilla JS + HTML/CSS**: 依存ライブラリなし

---

## 開発ワークフロー

1. **探索**: 既存ファイル（要件定義.md、実装計画.md）を読み込み、仕様を理解
2. **計画**: 実装計画.mdのステップに従い、必要なファイルを特定
3. **実装**: manifest.json → popup.html → popup.js の順で段階的に構築
4. **検証**: chrome://extensions でリロード → ポップアップを検証

---

## よく使うコマンド

```bash
# Chrome拡張のデバッグ
# 1. chrome://extensions → デベロッパーモードON
# 2. 「パッケージ化されていない拡張機能を読み込む」→ NoteFolder選択
# 3. コード変更後: 「更新」ボタンをクリック
# 4. ポップアップのデバッグ: 拡張アイコンを右クリック → 「ポップアップを検証」
```

---

## CRITICAL - 禁止操作

**以下の操作は絶対に実行しない**:

### Bash
- `sudo`, `rm`, `rm -rf`
- `git push`, `git commit`, `git reset`, `git rebase`
- `curl`, `wget`, `nc`
- `npm uninstall`, `npm remove`
- `psql`, `mysql`, `mongod`

### ファイル操作
- Read/Write: `.env*`, `id_rsa`, `id_ed25519`, `**/*token*`, `**/*key*`, `**/secrets/**`
- MCP: `mcp__supabase__execute_sql`

---

## MUST - 必須ルール

**WindowsパスをUbuntuマウントパスに変換**:
```
C:\Users\user1\Pictures\test.jpg → /mnt/c/Users/user1/Pictures/test.jpg
```

---

## 参照ドキュメント

- **要件定義.md**: MVPスコープ、利用シーン、成功条件
- **実装計画.md**: データ構造、処理フロー、実装ステップ
- **参照ルール.md**: 禁止操作の完全リスト
