# NoteFolder実装計画 - フィルターUI配置変更 & タグ階層表示

**作成日**: 2025-12-31
**ステータス**: 承認済み・実装待ち

---

## 概要

2つの改善を実装：
1. **フィルターUIの配置変更**: `project-actions-container`と`all-projects-container`の間に移動
2. **タグドロップダウンの階層表示**: 展開/折りたたみ機能を追加

## レビュー結果: 重大な問題なし

- `showTagDropdown()`は既に`async`（行2632）
- `createTagItem()`は内部関数でクロージャアクセス可能
- 既存のD&D、削除、選択機能への影響なし

---

## 修正対象ファイル

| ファイル | 役割 | 行数 |
|----------|------|------|
| `content/content.js` | メインロジック | 約3200行 |
| `content/content.css` | スタイル | 約900行 |

---

## 要件1: フィルターUIの配置変更

### 背景
現在のフィルターUI（検索、タグフィルター、ソート）は`mat-button-toggle-group`の直後に配置されており、UIが詰まって見切れる問題がある。

### 変更内容

#### 1.1 `findFilterTargetElement()` 修正
**ファイル**: `content/content.js`
**行番号**: 2171-2187

```javascript
function findFilterTargetElement() {
  // 新: all-projects-containerを優先検索
  const allProjectsContainer = document.querySelector('.all-projects-container');
  if (allProjectsContainer) return allProjectsContainer;

  // フォールバック: project-actions-container
  const projectActionsContainer = document.querySelector('.project-actions-container');
  if (projectActionsContainer) return projectActionsContainer;

  // フォールバック: テキスト検索（既存ロジック維持）
  const headers = document.querySelectorAll('h2, h3, div');
  for (const el of headers) {
    if (el.textContent.includes('最近のノートブック') ||
        el.textContent.includes('Recent notebooks')) {
      return el;
    }
  }
  return null;
}
```

#### 1.2 `injectFilterUI()` 挿入ロジック修正
**ファイル**: `content/content.js`
**行番号**: 3209-3215

```javascript
// all-projects-containerの場合は直前に挿入
if (targetElement.classList.contains('all-projects-container')) {
  targetElement.parentNode.insertBefore(filterContainer, targetElement);
} else if (targetElement.tagName.toLowerCase() === 'mat-button-toggle-group') {
  targetElement.parentNode.insertBefore(filterContainer, targetElement.nextSibling);
} else {
  targetElement.parentNode.insertBefore(filterContainer, targetElement.nextSibling);
}
```

#### 1.3 CSS調整
**ファイル**: `content/content.css`
**行番号**: 300-306

```css
.nf-filter-container {
  display: flex;              /* inline-flex から変更 */
  align-items: center;
  gap: 8px;
  padding: 8px 16px;          /* 追加 */
  margin: 8px 0;              /* margin-left から変更 */
}
```

---

## 要件2: タグドロップダウンの階層表示

### 背景
現在すべてのタグがインデント付きで表示されている。親タグの左に展開/折りたたみボタンを追加し、デフォルトは折りたたみ状態にする。

### ユーザー選択
- **展開状態の保持**: storageに保存（次回も保持）
- **検索時の挙動**: 全展開でフラット表示

### 変更内容

#### 2.1 ストレージ関数追加
**ファイル**: `content/content.js`
**挿入位置**: 行185の後（`saveDropdownHeight()`の後）

```javascript
// ========================================
// タグ展開状態管理
// ========================================

/**
 * 展開されているタグの一覧を取得
 * @returns {Promise<string[]>} 展開されているタグ名の配列
 */
async function getExpandedTags() {
  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      resolve([]);
      return;
    }
    chrome.storage.sync.get({ expandedTags: [] }, (result) => {
      if (chrome.runtime.lastError) {
        console.error('Storage read error:', chrome.runtime.lastError.message);
        resolve([]);
        return;
      }
      resolve(result.expandedTags);
    });
  });
}

/**
 * 展開されているタグの一覧を保存
 * @param {string[]} tags - 展開されているタグ名の配列
 * @returns {Promise<boolean>}
 */
async function saveExpandedTags(tags) {
  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      resolve(false);
      return;
    }
    chrome.storage.sync.set({ expandedTags: tags }, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage write error:', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

/**
 * タグの展開状態をトグル
 * @param {string} tagName - タグ名
 * @param {string[]} currentExpanded - 現在の展開タグ配列
 * @returns {Promise<string[]>} 更新後の展開タグ配列
 */
async function toggleTagExpansion(tagName, currentExpanded) {
  let newExpanded;
  if (currentExpanded.includes(tagName)) {
    newExpanded = currentExpanded.filter(t => t !== tagName);
  } else {
    newExpanded = [...currentExpanded, tagName];
  }
  await saveExpandedTags(newExpanded);
  return newExpanded;
}
```

**データ構造**:
```javascript
{
  expandedTags: ["AI", "仕事", "プログラミング"]  // 展開中の親タグ名の配列
}
```

#### 2.2 CSS追加
**ファイル**: `content/content.css`
**挿入位置**: 行756以降

```css
/* ========================================
   タグ展開/折りたたみボタン
   ======================================== */

/* 展開ボタン */
.nf-tag-expand-btn {
  width: 16px;
  height: 16px;
  padding: 0;
  margin-right: 4px;
  background: transparent;
  border: none;
  color: #888;
  font-size: 10px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 0.15s ease, color 0.15s;
}

.nf-tag-expand-btn:hover {
  color: #e0e0e0;
}

/* 展開状態の矢印（下向き = 90度回転） */
.nf-tag-expand-btn.expanded {
  transform: rotate(90deg);
}

/* 子タグがない場合のスペーサー（列揃え用） */
.nf-tag-expand-spacer {
  width: 16px;
  height: 16px;
  margin-right: 4px;
  flex-shrink: 0;
}

/* ラベル後の矢印削除（展開ボタンに置き換え） */
.nf-dropdown-item.has-children .nf-dropdown-item-label::after {
  content: '';  /* ' ▸' を削除 */
}
```

#### 2.3 `showTagDropdown()` 修正
**ファイル**: `content/content.js`
**行番号**: 2632付近

関数開始時に展開状態を取得：

```javascript
async function showTagDropdown(button) {
  // 既存のドロップダウンを削除
  const existing = document.querySelector('.nf-tag-dropdown');
  if (existing) {
    existing.remove();
    return;
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'nf-tag-dropdown';
  dropdown.style.display = 'flex';
  dropdown.style.flexDirection = 'column';

  // キャッシュからタグを取得
  const allTags = getCachedAllTags();

  // 【追加】展開状態を取得
  let expandedTags = await getExpandedTags();

  // ... 以下既存コード
```

#### 2.4 `createTagItem()` 修正
**ファイル**: `content/content.js`
**行番号**: 2870-3018

引数に`isSearchMode`を追加し、展開ボタンを追加：

```javascript
// タグアイテムを作成する関数（修正版）
const createTagItem = (tag, depth = 0, isSearchMode = false) => {
  const item = document.createElement('div');
  item.className = 'nf-dropdown-item';
  item.setAttribute('data-tag', tag);
  item.setAttribute('tabindex', '-1');
  item.setAttribute('draggable', 'true');

  // 階層深度に応じたインデント
  if (depth > 0) {
    item.classList.add('nf-tag-tree-item');
    item.style.paddingLeft = `${16 + depth * 20}px`;  // 少し増加
  }

  if (selectedFilterTags.includes(tag)) {
    item.classList.add('selected');
  }

  // 子タグがあるかチェック
  const hasChildren = currentTags.some(t =>
    t !== tag && t.startsWith(tag + HIERARCHY_SEPARATOR)
  );
  if (hasChildren) {
    item.classList.add('has-children');
  }

  // 【追加】展開/折りたたみボタン（親タグのみ、検索モードでは非表示）
  if (hasChildren && !isSearchMode) {
    const expandBtn = document.createElement('button');
    expandBtn.className = 'nf-tag-expand-btn';
    const isExpanded = expandedTags.includes(tag);
    if (isExpanded) {
      expandBtn.classList.add('expanded');
    }
    expandBtn.textContent = '▶';
    expandBtn.setAttribute('title', isExpanded ? '折りたたむ' : '展開する');

    expandBtn.addEventListener('click', async (e) => {
      e.stopPropagation();  // タグ選択と分離
      expandedTags = await toggleTagExpansion(tag, expandedTags);
      renderTagList(searchInput.value);
    });

    item.appendChild(expandBtn);
  } else if (!isSearchMode) {
    // 子タグがない場合はスペーサー（列揃え）
    const spacer = document.createElement('span');
    spacer.className = 'nf-tag-expand-spacer';
    item.appendChild(spacer);
  }

  // 色インジケーター（既存）
  const colorIndicator = document.createElement('span');
  colorIndicator.className = 'nf-tag-color-indicator';
  // ... 以下既存コード

  // 要素追加順序:
  // [展開ボタン/スペーサー] → colorIndicator → checkbox → label → count → deleteBtn
  item.appendChild(colorIndicator);
  item.appendChild(checkbox);
  item.appendChild(label);
  item.appendChild(countSpan);
  item.appendChild(deleteBtn);

  // ... 既存のイベントハンドラ
  return item;
};
```

#### 2.5 `renderTagList()` 修正
**ファイル**: `content/content.js`
**行番号**: 3020-3045

折りたたみ状態に応じて子タグの表示を制御：

```javascript
// 階層構造でレンダリング（検索時以外）
if (!filterText) {
  // ルートタグ（親を持たないタグ）を取得
  const rootTags = filteredTags.filter(tag => !getParentTag(tag));

  const renderTagWithChildren = (tag, depth) => {
    const item = createTagItem(tag, depth, false);  // isSearchMode = false
    tagListContainer.appendChild(item);

    // 直接の子タグを取得
    const directChildren = filteredTags.filter(t => {
      const parent = getParentTag(t);
      return parent === tag;
    });

    // 【変更】展開状態に応じて子タグを表示
    const isExpanded = expandedTags.includes(tag);
    if (isExpanded) {
      directChildren.forEach(childTag => {
        renderTagWithChildren(childTag, depth + 1);
      });
    }
    // 展開されていない場合は子タグをレンダリングしない
  };

  rootTags.forEach(tag => renderTagWithChildren(tag, 0));
} else {
  // 検索時はフラット表示（全展開）
  filteredTags.forEach(tag => {
    tagListContainer.appendChild(createTagItem(tag, 0, true));  // isSearchMode = true
  });
}
```

---

## 実装順序

### Phase 1: タグ階層表示（要件2）

| # | タスク | ファイル | 行番号 |
|---|--------|----------|--------|
| 1 | ストレージ関数追加 | content.js | 185以降 |
| 2 | CSS追加 | content.css | 756以降 |
| 3 | `showTagDropdown()`修正 | content.js | 2632 |
| 4 | `createTagItem()`修正 | content.js | 2870-3018 |
| 5 | `renderTagList()`修正 | content.js | 3020-3045 |

### Phase 2: フィルターUI配置（要件1）

| # | タスク | ファイル | 行番号 |
|---|--------|----------|--------|
| 6 | `findFilterTargetElement()`修正 | content.js | 2171-2187 |
| 7 | `injectFilterUI()`修正 | content.js | 3209-3215 |
| 8 | CSS調整 | content.css | 300-306 |

### Phase 3: テスト

- [ ] 展開/折りたたみ動作
- [ ] 展開状態の保存・復元
- [ ] 検索時のフラット表示
- [ ] フィルターUI位置確認
- [ ] 既存機能（D&D、削除、選択）の動作確認
- [ ] SPAナビゲーション時の動作確認

---

## 注意事項

### セキュリティ
- ユーザー入力は必ず`textContent`で表示（XSS対策）
- `chrome.runtime.lastError`を全storage操作で確認

### 既存機能との互換性
- 展開ボタンのクリックイベントは`stopPropagation()`でタグ選択と分離
- 検索モードでは展開ボタン非表示、フラット表示
- D&D機能は影響なし（既存のdragstart/dragend/drop処理を維持）

### ストレージ容量
- 展開タグ配列は約2KB以下（100KB制限に対して十分余裕）

---

## 動作フロー

### 展開/折りたたみ

```
1. ドロップダウン表示
   └── getExpandedTags() で保存済みの展開状態を取得

2. デフォルト表示
   └── 空配列（全折りたたみ）→ 親タグのみ表示

3. 展開ボタンクリック
   └── toggleTagExpansion() で状態を更新
   └── saveExpandedTags() でストレージに保存
   └── renderTagList() で再描画

4. 検索入力
   └── フラット表示（全展開、展開ボタン非表示）

5. ドロップダウン閉じる
   └── 展開状態はストレージに保存済み → 次回も保持
```

---

**最終更新**: 2025-12-31
**レビュー**: Codex MCP による技術レビュー完了
