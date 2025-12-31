# NoteFolder開発 - 詳細な引き継ぎプロンプト

## プロジェクト概要

NotebookLMのプロジェクト一覧ページでタグ管理を行うChrome拡張機能（Manifest V3）。外部サーバー不要、chrome.storage.syncでデータ管理。

**プロジェクトパス**: `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder`

---

## 現在の状況

### ステータス: 機能更新実装完了・動作確認待ち

2つの機能更新を実装完了。`chrome://extensions`で拡張機能を更新してテストが必要。

---

## 今回実装した機能（2025-12-31）

### 機能1: タグポップオーバーのD&D動作改善

**変更前**: タグをドラッグして別のタグに重ねると順番が変わる

**変更後**:
- **タグ同士を重ねる** → 親子関係にする（移動元が移動先の子タグになる、全プロジェクトに影響）
- **タグ間の縦棒インジケーター** → その位置に挿入して順番変更（このプロジェクトのみ）

#### 修正ファイル・箇所

| ファイル | 行番号 | 内容 |
|----------|--------|------|
| content/content.css | 977-1015 | ドロップゾーン・親子関係ターゲットのCSS |
| content/content.js | 1116-1186 | `reorderProjectTagsAtIndex()` 新関数追加 |
| content/content.js | 1781-1906 | `showTagPopover()`内のD&D処理全面書き換え |

#### 新規CSS クラス
- `.nf-tag-drop-zone` - タグ間の縦棒ドロップゾーン（順番変更用）
- `.nf-tag-drop-zone.nf-drop-active` - ドラッグホバー時の青色表示
- `.nf-popover-parent-tags.nf-dragging-active` - ドラッグ中の親セクション
- `.nf-tag-badge.nf-parent-drop-target` - 親子関係ドロップ時の緑枠表示
- `.nf-tag-badge.nf-dragging` - ドラッグ中のバッジ（半透明）

#### 新規関数
```javascript
// content/content.js:1116-1186
async function reorderProjectTagsAtIndex(projectId, draggedParent, targetIndex)
// 指定インデックスの位置にタグを移動（このプロジェクトのみ）
```

### 機能2: タグドロップダウンにソート窓を統合

**変更前**: フィルターUIに「タグ▼」「ソート▼」ボタンが別々に存在

**変更後**:
- タグドロップダウン内にツールバー形式で配置
- 1行に「📊 ソート選択 | 📂 タグなし | 📁 ルートへ」
- 外部のソートボタンは削除

#### 修正ファイル・箇所

| ファイル | 行番号 | 内容 |
|----------|--------|------|
| content/content.css | 1017-1126 | ツールバー・インラインソートのCSS |
| content/content.js | 2909-3063 | `showTagDropdown()`内のfixedOptionsContainer書き換え |
| content/content.js | 3477-3484 | `injectFilterUI()`からソートボタン削除 |
| content/content.js | 2674-2678, 3360-3364 | キーボードナビゲーション更新 |

#### 新規CSSクラス
- `.nf-dropdown-toolbar` - ドロップダウン内ツールバー
- `.nf-toolbar-separator` - セパレーター（|）
- `.nf-inline-sort-selector` - ソートセレクターコンテナ
- `.nf-inline-sort-btn` - ソートボタン
- `.nf-inline-sort-menu` - ソートメニュー
- `.nf-inline-sort-option` - ソートオプション項目
- `.nf-toolbar-untagged` - コンパクト版タグなしオプション
- `.nf-toolbar-root` - コンパクト版ルート移動

---

## 仕様詳細

### D&D操作の影響範囲

| 操作 | 影響範囲 | 使用関数 |
|------|----------|----------|
| タグ同士を重ねる（親子関係） | 全プロジェクト | `moveTagToParent()` |
| タグ間にドロップ（順番変更） | このプロジェクトのみ | `reorderProjectTagsAtIndex()` |

### 検索時の動作
- ソートUIは検索時に非表示（`nf-dropdown-fixed-options`が非表示になるため）
- これはユーザー確認済みで許容

---

## 注意事項

### 重要: 拡張機能の更新方法

**「削除→再読み込み」ではなく「更新」ボタンを使用すること**

- 拡張機能を「削除」するとchrome.storageのデータも削除される（Chromeの仕様）
- `chrome://extensions` で「更新」ボタン（↻）をクリックすればデータは保持される

### 禁止操作（CLAUDE.mdより）
- `git push`, `git commit` は実行しない
- `.env*`, 秘密鍵ファイルは読み書きしない

### 実装上の注意
- **XSS対策**: ユーザー入力は必ず`textContent`で表示
- **lastErrorチェック**: 全storage操作で`chrome.runtime.lastError`を確認
- **stopPropagation**: ドロップイベントは`e.stopPropagation()`で伝播防止

---

## ファイル構成

```
NoteFolder/
├── manifest.json              # Content Script設定済み
├── content/
│   ├── content.js             # メインロジック（約3500行）
│   └── content.css            # スタイル（約1130行）
├── popup/
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── 実装計画_UI改善v4.md       # 前回の詳細実装計画
├── TAKEOVER.md                # この引き継ぎドキュメント
└── CLAUDE.md                  # プロジェクト指示書
```

---

## 主要関数リファレンス

### 新規追加（今回）
| 関数名 | 行番号 | 用途 |
|--------|--------|------|
| `reorderProjectTagsAtIndex()` | 1116-1186 | 指定位置にタグを移動（順番変更） |

### 既存（参照用）
| 関数名 | 行番号 | 用途 |
|--------|--------|------|
| `moveTagToParent()` | 1279-1328 | タグの親子関係変更（全プロジェクト） |
| `reorderProjectTags()` | 1055-1114 | タグ順番変更（別タグの位置へ移動） |
| `showTagPopover()` | 1692-1970付近 | タグポップオーバー表示 |
| `showTagDropdown()` | 2774-3400付近 | タグドロップダウン表示 |
| `injectFilterUI()` | 3420-3500付近 | フィルターUI注入 |
| `getExpandedTags()` | 195-210 | 展開中タグ配列を取得 |
| `saveExpandedTags()` | 217-230 | 展開中タグ配列を保存 |

---

## テスト項目

### 機能1: D&D動作
- [ ] タグAをタグBの上にドロップ → タグAがタグB/Aになる（全プロジェクト）
- [ ] タグAをタグB-C間の縦棒にドロップ → タグAがB-C間に移動（このプロジェクトのみ）
- [ ] ドラッグ中に縦棒が青く表示される
- [ ] ドラッグ中にターゲットバッジが緑枠で表示される

### 機能2: ソート統合
- [ ] タグドロップダウン内にソート・タグなし・ルートへが1行表示
- [ ] ソートをクリック→メニュー展開→選択でソート変更
- [ ] タグなしをクリック→フィルター適用
- [ ] ルートへにドラッグ→子タグがルートに移動
- [ ] 外部のソートボタンが削除されている

---

## 参照ドキュメント

| ファイル | 内容 |
|----------|------|
| `CLAUDE.md` | プロジェクト指示書、禁止操作 |
| `実装計画_UI改善v4.md` | 前回実装した機能の詳細計画 |
| `/home/littl/.claude/plans/harmonic-dreaming-eagle.md` | 今回の実装計画 |

---

**最終更新**: 2025-12-31
**ステータス**: 機能更新実装完了・動作確認待ち
