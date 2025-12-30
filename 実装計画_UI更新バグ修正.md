# NoteFolder UI更新バグ修正 実装計画

## 修正対象ファイル
- `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder/content/content.js`

---

## 修正対象バグ

### バグ1&2: タグ操作後のUI即時更新問題
**現象**: ドラッグ&ドロップ、削除、カラー変更後、ブラウザ更新なしでは見た目が変わらない

**原因**: `onColorChange` コールバック（行1492）が `updateUI()` のみ呼び出し。インラインバッジ（プロジェクトカード上）が更新されない。

### バグ3: SPAナビゲーション後のUI消失
**現象**: プロジェクトを開いて戻ると、フィルターUI（検索、タグ、ソート）が消える

**原因**:
- `filterUIInjected` フラグがリセットされない
- `originalCardOrder` が古いDOMノード参照を保持
- `popstate` イベント監視がない

---

## 実装手順

### Phase 1: ユーティリティ関数追加

#### 1-1. `updateAllInlineBadges()` 関数追加
**挿入位置**: 行1715の後（`updateInlineBadges` 関数の後）

```javascript
/**
 * 表示中の全プロジェクトのインラインバッジを更新
 * パフォーマンス: cache.projects全体ではなく、DOM上に存在するもののみ対象
 */
function updateAllInlineBadges() {
  const visibleIcons = document.querySelectorAll('.nf-folder-icon[data-project-id]');
  visibleIcons.forEach(icon => {
    const projectId = icon.getAttribute('data-project-id');
    if (projectId) {
      updateInlineBadges(projectId);
    }
  });
}
```

#### 1-2. `resetUIState()` 関数追加
**挿入位置**: 行1918の後（`saveOriginalCardOrder` 関数の後）

```javascript
/**
 * ナビゲーション時にUI状態をリセット
 */
function resetUIState() {
  originalCardOrder = [];
  filterUIInjected = false;
  currentFilters = [];
  selectedFilterTags = [];
  currentSortType = 'default';
}
```

---

### Phase 2: カラー変更時のUI更新修正

#### 2-1. `onColorChange` コールバック修正
**修正位置**: 行1492

**修正前**:
```javascript
onColorChange: () => updateUI()
```

**修正後**:
```javascript
onColorChange: () => {
  updateUI();
  updateAllInlineBadges();
}
```

---

### Phase 3: フィルターUI注入関数の強化

#### 3-1. `injectFilterUI()` にDOM存在確認追加
**修正位置**: 行2752-2758

**修正前**:
```javascript
function injectFilterUI() {
  if (filterUIInjected) return;

  const targetElement = findFilterTargetElement();
```

**修正後**:
```javascript
function injectFilterUI() {
  const existingFilterUI = document.querySelector('.nf-filter-container');
  if (filterUIInjected && existingFilterUI) return;
  if (!existingFilterUI) {
    filterUIInjected = false;
  }

  const targetElement = findFilterTargetElement();
```

---

### Phase 4: SPAナビゲーション監視機能追加

#### 4-1. `isProjectListPage()` 関数追加
**挿入位置**: 行2906の後（`setupSectionToggleListener` 関数の後）

```javascript
/**
 * 現在のページがプロジェクト一覧ページかどうかを判定
 */
function isProjectListPage() {
  const url = window.location.href;
  return url.includes('notebooklm.google.com') &&
         !url.includes('/notebook/') &&
         !url.includes('/project/');
}
```

#### 4-2. `setupSPANavigationListener()` 関数追加
**挿入位置**: `isProjectListPage()` の後

```javascript
/**
 * SPAナビゲーションを監視
 */
function setupSPANavigationListener() {
  // history.pushState/replaceStateをフック
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function(...args) {
    originalPushState.apply(this, args);
    handleNavigationChange();
  };

  history.replaceState = function(...args) {
    originalReplaceState.apply(this, args);
    handleNavigationChange();
  };

  // popstateイベント（ブラウザの戻る/進む）
  window.addEventListener('popstate', handleNavigationChange);

  function handleNavigationChange() {
    // リトライロジック（最大5回、300ms間隔）
    const tryReinject = (attempt = 1, maxAttempts = 5) => {
      // 一覧ページでない場合は終了
      if (!isProjectListPage()) return;

      const existingFilterUI = document.querySelector('.nf-filter-container');
      const targetElement = findFilterTargetElement();

      if (!existingFilterUI && targetElement) {
        // ターゲット要素が存在 → UI注入実行
        resetUIState();
        injectAllFolderIcons();
        injectFilterUI();
        saveOriginalCardOrder();
        setupSectionToggleListener(); // セクションタブリスナーも再設定
        for (const [projectId] of cache.projects) {
          updateFolderIconState(projectId);
        }
      } else if (!existingFilterUI && !targetElement && attempt < maxAttempts) {
        // ターゲット要素がまだない → リトライ
        setTimeout(() => tryReinject(attempt + 1, maxAttempts), 300);
      }
    };

    // 初回は300ms後に開始
    setTimeout(() => tryReinject(), 300);
  }
}
```

---

### Phase 5: 初期化関数での呼び出し追加

#### 5-1. `initNoteFolder()` で `setupSPANavigationListener()` 呼び出し追加
**修正位置**: 行2946の後（`setupSectionToggleListener()` の後）

```javascript
setupSPANavigationListener();
```

---

## 修正箇所サマリー

| Phase | 内容 | 行番号 | 種別 |
|-------|------|--------|------|
| Phase 1-1 | `updateAllInlineBadges()` 追加 | 1715後 | 新規 |
| Phase 1-2 | `resetUIState()` 追加 | 1918後 | 新規 |
| Phase 2-1 | `onColorChange` コールバック修正 | 1492 | 修正 |
| Phase 3-1 | `injectFilterUI()` DOM存在確認追加 | 2752-2758 | 修正 |
| Phase 4-1 | `isProjectListPage()` 追加 | 2906後 | 新規 |
| Phase 4-2 | `setupSPANavigationListener()` 追加 | 2906後 | 新規 |
| Phase 5-1 | `initNoteFolder()` 呼び出し追加 | 2946後 | 修正 |

---

## Codexレビュー指摘事項への対応

| 重要度 | 指摘 | 対応 |
|--------|------|------|
| P1 | `setupSectionToggleListener()`再呼び出し漏れ | Phase 4-2で再呼び出しを追加 |
| P1 | 300ms単一setTimeoutの不確実性 | リトライロジック追加（最大5回） |
| P2 | `updateAllInlineBadges()`のパフォーマンス | DOM上の表示要素のみ対象に変更 |
| - | `processedProjects`リセット不要 | 既存コードで自動対応済み |

---

## テスト確認項目

1. タグカラー変更 → インラインバッジの色が即座に変わる
2. タグをドラッグ&ドロップで親タグに移動 → タグ名が即座に変わる
3. ×ボタンでタグ削除 → バッジが即座に消える
4. 「ルートに移動」で子タグ解除 → タグ名が即座に変わる
5. プロジェクトを開いて戻る → フィルターUIが表示されている
6. セクション切り替え（すべて/マイノートブック等）→ フィルターUIが維持される

---

**作成日**: 2025-12-31
**レビュー**: Codex MCP（2回）
