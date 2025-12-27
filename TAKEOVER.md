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
| Step 8 | スタイリング + UX改善 | 🚧 一部完了 |

---

## 🔴 直前に実施した修正（要テスト）

### 問題の概要

フィルター/ソート後のプロジェクトカード表示に問題があった：

1. **フィルター後の歯抜け状態**: タグでフィルタリングすると、非表示カードの場所が空きスペースとして残る
2. **ソートが機能しない**: CSS orderプロパティが効かない

### 原因分析（Phase 1で判明）

NotebookLMのDOM構造を調査した結果：

```
div.project-buttons-flow  ← グリッドコンテナ（CSS Grid）
  └── project-button      ← グリッドアイテム（これを操作すべき）
        └── mat-card.project-button-card  ← 従来操作していた要素
```

- **mat-grid-tileは存在しない**（Codexの分析は誤りだった）
- `mat-card`に`display: none`や`order`を設定しても、親の`project-button`がグリッドアイテムなので効果がなかった

### 実施した修正（Phase 2 & 3）

| 対象 | 変更前 | 変更後 |
|------|--------|--------|
| フィルター | `card.style.display = 'none'` | `card.closest('project-button').style.display = 'none'` |
| ソート | `card.style.order = index` | `card.closest('project-button').style.order = index` |

**修正箇所**:
- `filterProjectsByTags()` (content.js:674-741)
- `sortProjects()` (content.js:774-857)

---

## 🟡 次に確認すべきこと

### 1. 修正のテスト（未実施）

以下の動作確認が必要：

| テスト | 期待結果 |
|--------|----------|
| タグフィルター | カードがグリッド表示のまま、歯抜けなしで表示 |
| ソート（名前順 A→Z） | カードの順序が変わる |
| ソート（デフォルト） | 元の順序に戻る |
| フィルター解除（クリア） | 全カードが表示される |

### 2. CSS orderがCSS Gridで効くか確認

- CSS Gridで`order`プロパティが効くのは`grid-auto-flow`（自動配置）の場合のみ
- NotebookLMが明示的にグリッド位置を指定している場合、`order`は効かない
- 効かない場合は`appendChild`方式に切り替える必要がある

### 3. Phase 4: MutationObserver拡張（保留中）

NotebookLMのSPAでDOMが再生成された場合、`originalCardOrder`が無効になる可能性がある。必要に応じて：
- 新しいタイル検知時に`originalCardOrder`を再取得
- フィルター/ソートの状態を再適用

---

## ファイル構成

```
NoteFolder/
├── manifest.json              # Content Script設定済み
├── content/
│   ├── content.js             # メインロジック（約1200行）
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
| `isStorageAvailable()` | ~14 | chrome.storage.sync利用可能チェック |
| `showToast()` | ~65 | トースト通知表示 |
| `validateTagName()` | ~96 | タグ名バリデーション |
| `addTagToProject()` | ~131 | タグ追加 |
| `removeTagFromProject()` | ~202 | タグ削除 |
| `showTagPopover()` | ~288 | ポップオーバー表示 |
| `injectFolderIcon()` | ~534 | フォルダアイコン注入 |
| `getProjectCards()` | ~654 | プロジェクトカード取得 |
| `saveOriginalCardOrder()` | ~662 | 元のカード順序保存 |
| `filterProjectsByTags()` | ~674 | フィルタリング処理 ← **修正済み** |
| `sortProjects()` | ~774 | ソート処理 ← **修正済み** |
| `showTagDropdown()` | ~971 | タグ選択ドロップダウン |
| `showSortDropdown()` | ~869 | ソートドロップダウン |
| `injectFilterUI()` | ~1102 | フィルターUI注入 |
| `initNoteFolder()` | ~1193 | 初期化 |

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

---

## 引き継ぎ時の最初のアクション

1. **このファイルを読んで状況を把握**

2. **修正のテストを実施**:
   - 拡張機能を更新してNotebookLMをリロード
   - フィルター/ソートの動作確認
   - 歯抜け問題が解消されているか確認
   - ソートが機能するか確認

3. **テスト結果に応じた対応**:
   - **成功**: Phase 4（MutationObserver拡張）を検討
   - **orderが効かない場合**: `appendChild`方式に切り替え
   - **その他の問題**: 原因調査

4. **ソートがorderで効かない場合の修正方針**:
   ```javascript
   // sortProjects内で、orderではなくappendChildを使用
   const parent = gridItem.parentElement;
   cardsWithData.forEach((item) => {
     const gridItem = item.card.closest('project-button') || item.card;
     parent.appendChild(gridItem);
   });
   ```

---

## 将来のタスク（Step 8以降）

- [ ] キーボードナビゲーション（ドロップダウン内でTab/矢印キー移動）
- [ ] タグ付きプロジェクトのインジケーター表示（フォルダアイコンにドット）
- [ ] ポップアップ画面での全タグ管理
- [ ] デバッグログの削除（本番リリース前）
- [ ] パフォーマンス改善（chrome.storage.syncのキャッシュ化）

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

**最終更新**: 2025-12-27
**実装担当**: Claude Opus 4.5
**進捗**: Phase 1-3完了・テスト待ち
