// NoteFolder - Content Script
// Step 2: フォルダアイコン注入（動的対応版）

// ========================================
// Chrome API存在確認
// ========================================

/**
 * chrome.storage.syncが利用可能かチェック
 * @returns {boolean}
 */
function isStorageAvailable() {
  return typeof chrome !== 'undefined' &&
         chrome.storage &&
         chrome.storage.sync;
}

// ========================================
// Storage helpers
// ========================================

/**
 * chrome.storage.sync.get を Promise 化
 * @param {Object|null} defaults - 取得キー or null（全件）
 * @returns {Promise<{ok: boolean, data: Object}>}
 */
function storageGet(defaults) {
  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      resolve({ ok: false, data: defaults === null ? {} : (defaults || {}) });
      return;
    }

    const getArg = defaults === null ? null : defaults;
    chrome.storage.sync.get(getArg, (result) => {
      if (chrome.runtime.lastError) {
        console.error('Storage read error:', chrome.runtime.lastError.message);
        resolve({ ok: false, data: defaults === null ? {} : (defaults || {}) });
        return;
      }
      resolve({ ok: true, data: result });
    });
  });
}

/**
 * chrome.storage.sync.set を Promise 化
 * @param {Object} data
 * @returns {Promise<boolean>}
 */
function storageSet(data) {
  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      console.warn('Storage not available - extension may need reload');
      resolve(false);
      return;
    }
    chrome.storage.sync.set(data, () => {
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
 * chrome.storage.sync.remove を Promise 化
 * @param {string|string[]} keys
 * @returns {Promise<boolean>}
 */
function storageRemove(keys) {
  return new Promise((resolve) => {
    if (!isStorageAvailable()) {
      console.warn('Storage not available - extension may need reload');
      resolve(false);
      return;
    }
    chrome.storage.sync.remove(keys, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage remove error:', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      resolve(true);
    });
  });
}

// ========================================
// 定数
// ========================================

// NotebookLM DOM セレクタ
const NOTEBOOKLM_SELECTORS = {
  projectEmoji: '[id^="project-"][id$="-emoji"]',
  projectCard: 'mat-card.project-button-card',
  projectCardContainer: 'project-button',
  projectTitle: '.project-button-title, .mdc-card__title, [data-testid="project-title"]',
  projectTitleFallback: '.project-button-title, .mdc-card__title, [data-testid="project-title"], [class*="title"]',
  allProjectsContainer: '.all-projects-container',
  projectActionsContainer: '.project-actions-container',
  projectSectionToggle: 'mat-button-toggle-group.project-section-toggle'
};

// プロジェクトの絵文字アイコンのセレクタ（互換用）
const EMOJI_SELECTOR = NOTEBOOKLM_SELECTORS.projectEmoji;

// 処理済みプロジェクトを追跡するSet
const processedProjects = new Set();

// 階層タグの区切り文字
const HIERARCHY_SEPARATOR = '/';

// 現在のマイグレーションバージョン
const CURRENT_MIGRATION_VERSION = 3;

// ドロップダウンのデフォルト高さ（px）
const DEFAULT_DROPDOWN_HEIGHT = 350;
const MIN_DROPDOWN_HEIGHT = 100;
const MAX_DROPDOWN_HEIGHT = 600;

// タグカラーパレット（Google Material準拠）
const TAG_COLOR_PALETTE = [
  { value: null, label: 'なし' },
  { value: '#4285f4', label: '青' },
  { value: '#34a853', label: '緑' },
  { value: '#fbbc04', label: '黄' },
  { value: '#ea4335', label: '赤' },
  { value: '#9c27b0', label: '紫' },
  { value: '#00bcd4', label: '水色' },
  { value: '#ff9800', label: 'オレンジ' },
  { value: '#795548', label: '茶' }
];

// ========================================
// キャッシュ
// ========================================

// キャッシュ変数
const cache = {
  allTags: [],           // 後方互換性のため残す（tagMetaから導出）
  tagMeta: {},           // タグメタデータ（色など）
  projects: new Map(),   // projectId -> projectData
  initialized: false,
  migrationDone: false
};

// 初期化待機用Promise
let cacheReadyPromise = null;
let cacheReadyResolve = null;

// ========================================
// UI更新コールバック
// ========================================

/**
 * UIコンポーネントの更新コールバックを格納
 */
const uiUpdateCallbacks = {
  popover: null,    // showTagPopover内のupdateUI
  dropdown: null    // showTagDropdown内のrenderTagList
};

/**
 * 全てのアクティブなUIコンポーネントを更新
 */
function triggerUIRefresh() {
  if (uiUpdateCallbacks.popover) {
    uiUpdateCallbacks.popover();
  }
  if (uiUpdateCallbacks.dropdown) {
    uiUpdateCallbacks.dropdown();
  }
}

// ========================================
// 階層タグ関数
// ========================================

/**
 * 階層タグをパースして配列で返す
 * @param {string} tag - タグ名（例: "AI/機械学習/深層学習"）
 * @returns {string[]} パーツの配列
 */
function parseHierarchicalTag(tag) {
  return tag.split(HIERARCHY_SEPARATOR);
}

/**
 * 親タグを取得
 * @param {string} tag - タグ名
 * @returns {string|null} 親タグ（ルートの場合はnull）
 */
function getParentTag(tag) {
  const parts = tag.split(HIERARCHY_SEPARATOR);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(HIERARCHY_SEPARATOR);
}

/**
 * 子タグを取得
 * @param {string} parentTag - 親タグ名
 * @param {string[]} allTags - 全タグリスト
 * @returns {string[]} 子タグの配列
 */
function getChildTags(parentTag, allTags) {
  return allTags.filter(tag =>
    tag.startsWith(parentTag + HIERARCHY_SEPARATOR)
  );
}

/**
 * タグの深度を取得
 * @param {string} tag - タグ名
 * @returns {number} 深度（ルートは0）
 */
function getTagDepth(tag) {
  return tag.split(HIERARCHY_SEPARATOR).length - 1;
}

// ========================================
// ドロップダウン高さ管理
// ========================================

/**
 * ドロップダウンの高さを取得
 * @returns {Promise<number>} 高さ（px）
 */
async function getDropdownHeight() {
  if (!isStorageAvailable()) {
    return DEFAULT_DROPDOWN_HEIGHT;
  }
  const { ok, data } = await storageGet({ dropdownHeight: DEFAULT_DROPDOWN_HEIGHT });
  return ok ? data.dropdownHeight : DEFAULT_DROPDOWN_HEIGHT;
}

/**
 * ドロップダウンの高さを保存
 * @param {number} height - 高さ（px）
 * @returns {Promise<boolean>}
 */
async function saveDropdownHeight(height) {
  if (!isStorageAvailable()) {
    return false;
  }
  const clampedHeight = Math.max(MIN_DROPDOWN_HEIGHT, Math.min(MAX_DROPDOWN_HEIGHT, height));
  return storageSet({ dropdownHeight: clampedHeight });
}

// ========================================
// タグ展開状態管理
// ========================================

/**
 * 展開されているタグの一覧を取得
 * @returns {Promise<string[]>} 展開されているタグ名の配列
 */
async function getExpandedTags() {
  if (!isStorageAvailable()) {
    return [];
  }
  const { ok, data } = await storageGet({ expandedTags: [] });
  return ok ? data.expandedTags : [];
}

/**
 * 展開されているタグの一覧を保存
 * @param {string[]} tags - 展開されているタグ名の配列
 * @returns {Promise<boolean>}
 */
async function saveExpandedTags(tags) {
  if (!isStorageAvailable()) {
    return false;
  }
  return storageSet({ expandedTags: tags });
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

// ========================================
// tagMetaシャーディング
// ========================================

/**
 * タグ名からシャードキーを取得
 * @param {string} tagName - タグ名
 * @returns {string} シャードキー
 */
function getShardKey(tagName) {
  const firstChar = tagName.charAt(0).toUpperCase();
  if (/[A-Z]/.test(firstChar)) return firstChar;
  if (/[あ-ん]/.test(firstChar)) return 'あ';
  if (/[ア-ン]/.test(firstChar)) return 'ア';
  if (/[\u4e00-\u9fff]/.test(firstChar)) return firstChar;  // 漢字
  return '_';
}

/**
 * ストレージから全tagMetaを読み込む
 * @param {Object} items - chrome.storage.sync.get(null)の結果
 * @returns {Object} 統合されたtagMeta
 */
function loadTagMetaFromItems(items) {
  const tagMeta = {};
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith('tagMeta:')) {
      Object.assign(tagMeta, value);
    }
  }
  return tagMeta;
}

/**
 * tagMetaを保存（シャード分割）
 * @param {string} tagName - タグ名
 * @param {Object} data - タグメタデータ
 * @returns {Promise<boolean>}
 */
async function saveTagMeta(tagName, data) {
  if (!isStorageAvailable()) {
    console.warn('Storage not available - extension may need reload');
    return false;
  }
  const shardKey = `tagMeta:${getShardKey(tagName)}`;
  const { ok, data: result } = await storageGet({ [shardKey]: {} });
  if (!ok) {
    return false;
  }
  const shard = result[shardKey] || {};
  shard[tagName] = data;
  const saved = await storageSet({ [shardKey]: shard });
  if (!saved) {
    return false;
  }
  cache.tagMeta[tagName] = data;
  return true;
}

/**
 * tagMetaから特定のタグを削除
 * @param {string} tagName - 削除するタグ名
 * @returns {Promise<boolean>}
 */
async function removeTagMeta(tagName) {
  const shardKey = `tagMeta:${getShardKey(tagName)}`;
  const { ok, data: result } = await storageGet({ [shardKey]: {} });
  if (!ok) {
    return false;
  }
  const shard = result[shardKey] || {};
  delete shard[tagName];
  const saved = await storageSet({ [shardKey]: shard });
  if (!saved) {
    return false;
  }
  delete cache.tagMeta[tagName];
  return true;
}

// ========================================
// タグ色管理
// ========================================

/**
 * タグの色を取得（親からの継承あり）
 * @param {string} tagName - タグ名
 * @returns {string|null} 色コード（未設定の場合はnull）
 */
function getTagColor(tagName) {
  // 自身の色があればそれを返す
  const meta = cache.tagMeta[tagName];
  if (meta?.color) {
    return meta.color;
  }

  // 親タグの色を継承
  const parentTag = getParentTag(tagName);
  if (parentTag) {
    return getTagColor(parentTag);
  }

  return null;
}

/**
 * タグの色を設定
 * @param {string} tagName - タグ名
 * @param {string|null} color - 色コード（nullで解除）
 * @returns {Promise<boolean>}
 */
async function setTagColor(tagName, color) {
  const currentMeta = cache.tagMeta[tagName] || {};
  const newMeta = { ...currentMeta, color: color };
  return saveTagMeta(tagName, newMeta);
}

/**
 * タグの色がカスタム設定されているか（継承ではなく）
 * @param {string} tagName - タグ名
 * @returns {boolean}
 */
function hasCustomColor(tagName) {
  const meta = cache.tagMeta[tagName];
  return meta?.color != null;
}

// ========================================
// マイグレーション
// ========================================

/**
 * 必要に応じてデータをマイグレーション
 * @param {Object} items - chrome.storage.sync.get(null)の結果
 * @returns {Promise<Object>} マイグレーション後のitems
 */
async function migrateDataIfNeeded(items) {
  const currentVersion = items._migrationVersion || 0;

  // マイグレーション済み
  if (currentVersion >= CURRENT_MIGRATION_VERSION) {
    cache.migrationDone = true;
    return items;
  }

  // Step 1: allTags → tagMeta への移行（既存タグも含めて確認）
  const existingTagMeta = loadTagMetaFromItems(items);
  if (items.allTags && items.allTags.length > 0) {
    const tagMetaShards = {};
    let hasNewTags = false;

    for (const tag of items.allTags) {
      // tagMetaに存在しないタグのみ追加
      if (!existingTagMeta[tag]) {
        const shardKey = `tagMeta:${getShardKey(tag)}`;
        if (!tagMetaShards[shardKey]) {
          // 既存のシャードデータを読み込む
          tagMetaShards[shardKey] = items[shardKey] || {};
        }
        tagMetaShards[shardKey][tag] = { color: null };
        hasNewTags = true;
      }
    }

    // 新しいタグがある場合のみ保存
    if (hasNewTags) {
      for (const [key, value] of Object.entries(tagMetaShards)) {
        await storageSet({ [key]: value });
      }
    }
  }

  // Step 2: project.pinned のデフォルト値設定
  const projectUpdates = {};
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith('project:') && value.pinned === undefined) {
      value.pinned = false;
      projectUpdates[key] = value;
    }
  }
  if (Object.keys(projectUpdates).length > 0) {
    await storageSet(projectUpdates);
  }

  // Step 3: マイグレーション完了フラグ
  await storageSet({ _migrationVersion: CURRENT_MIGRATION_VERSION });

  cache.migrationDone = true;

  // 更新後のデータを再読み込み
  const { ok, data } = await storageGet(null);
  return ok ? data : items;
}

// ========================================
// タグ名取得（互換性レイヤー）
// ========================================

/**
 * 全タグ名を取得（tagMetaから導出、allTagsはフォールバック）
 * @returns {string[]}
 */
function getAllTagNames() {
  const tagMetaKeys = Object.keys(cache.tagMeta);
  if (tagMetaKeys.length > 0) {
    return tagMetaKeys.sort((a, b) => a.localeCompare(b, 'ja'));
  }
  return cache.allTags || [];
}

/**
 * キャッシュを初期化（ストレージから全データ読み込み）
 * @returns {Promise<void>}
 */
function initCache() {
  if (cacheReadyPromise) {
    return cacheReadyPromise;
  }

  cacheReadyPromise = new Promise(async (resolve) => {
    cacheReadyResolve = resolve;

    if (!isStorageAvailable()) {
      cache.initialized = true;
      resolve();
      return;
    }

    const { ok, data } = await storageGet(null);
    if (!ok) {
      cache.initialized = true;
      resolve();
      return;
    }

    // マイグレーションを実行
    const items = await migrateDataIfNeeded(data);

    // allTagsをキャッシュ（後方互換性）
    cache.allTags = items.allTags || [];

    // tagMetaをキャッシュ
    cache.tagMeta = loadTagMetaFromItems(items);

    // プロジェクトデータをキャッシュ
    cache.projects.clear();
    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith('project:')) {
        cache.projects.set(value.id, value);
      }
    }

    cache.initialized = true;
    resolve();
  });

  return cacheReadyPromise;
}

/**
 * キャッシュ初期化完了を待機
 * @returns {Promise<void>}
 */
function ensureCacheReady() {
  if (cache.initialized) {
    return Promise.resolve();
  }
  if (cacheReadyPromise) {
    return cacheReadyPromise;
  }
  return initCache();
}

/**
 * ストレージから最新データを読み込み、キャッシュを更新
 * @returns {Promise<boolean>}
 */
async function refreshCacheFromStorage() {
  if (!isStorageAvailable()) {
    return false;
  }

  const { ok, data } = await storageGet(null);
  if (!ok) {
    console.error('Cache refresh error: storage get failed');
    return false;
  }

  // 必要であればマイグレーションを実行
  const items = await migrateDataIfNeeded(data);

  // allTagsをキャッシュ（後方互換性）
  cache.allTags = items.allTags || [];

  // tagMetaをキャッシュ
  cache.tagMeta = loadTagMetaFromItems(items);

  // プロジェクトデータをキャッシュ
  cache.projects.clear();
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith('project:')) {
      cache.projects.set(value.id, value);
    }
  }

  cache.initialized = true;
  return true;
}

/**
 * ストレージを同期してUIを更新
 * @returns {Promise<boolean>}
 */
async function syncCacheAndRefreshUI() {
  await ensureCacheReady();
  const refreshed = await refreshCacheFromStorage();
  if (!refreshed) {
    return false;
  }

  if (isProjectListPage()) {
    // 選択中フィルターをクリーンアップ
    const availableTags = new Set(getAllTagNames());
    const cleaned = selectedFilterTags.filter(tag => availableTags.has(tag));
    if (cleaned.length !== selectedFilterTags.length) {
      selectedFilterTags = cleaned;
    }

    applyFilters();
    updateFilterUI();
    refreshVisibleProjectUI();
  }

  triggerUIRefresh();
  return true;
}

/**
 * キャッシュからallTagsを取得（互換性のため残す - getAllTagNamesを推奨）
 * @returns {string[]}
 */
function getCachedAllTags() {
  return getAllTagNames();
}

/**
 * キャッシュから個別プロジェクトを取得
 * @param {string} projectId
 * @returns {Object|null}
 */
function getCachedProject(projectId) {
  return cache.projects.get(projectId) || null;
}

/**
 * キャッシュから全プロジェクトのタグマップを取得
 * @returns {Object} projectId -> tags[]
 */
function getCachedAllProjectTags() {
  const result = {};
  for (const [id, project] of cache.projects) {
    result[id] = project.tags || [];
  }
  return result;
}

/**
 * キャッシュを更新（書き込み成功後に呼び出す）
 * @param {string} projectId
 * @param {Object} projectData
 * @param {string[]} [newAllTags]
 */
function updateCache(projectId, projectData, newAllTags = null) {
  if (projectData) {
    cache.projects.set(projectId, projectData);
  }
  if (newAllTags !== null) {
    cache.allTags = newAllTags;
  }
}

/**
 * ストレージ変更リスナーをセットアップ（他タブ同期用）
 */
function setupStorageListener() {
  if (!isStorageAvailable()) return;

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'sync') return;

    let tagsChanged = false;
    let projectsChanged = false;

    for (const [key, { newValue, oldValue }] of Object.entries(changes)) {
      if (key === 'allTags') {
        cache.allTags = newValue || [];
        tagsChanged = true;
      } else if (key.startsWith('tagMeta:')) {
        // tagMetaシャードの更新（古いキーを削除してから置き換え）
        if (oldValue && typeof oldValue === 'object') {
          for (const tagName of Object.keys(oldValue)) {
            delete cache.tagMeta[tagName];
          }
        } else {
          const shardKey = key.slice('tagMeta:'.length);
          for (const tagName of Object.keys(cache.tagMeta)) {
            if (getShardKey(tagName) === shardKey) {
              delete cache.tagMeta[tagName];
            }
          }
        }
        if (newValue && typeof newValue === 'object') {
          Object.assign(cache.tagMeta, newValue);
        }
        tagsChanged = true;
      } else if (key.startsWith('project:')) {
        if (newValue) {
          cache.projects.set(newValue.id, newValue);
        } else {
          // プロジェクトが削除された場合
          const projectId = key.replace('project:', '');
          cache.projects.delete(projectId);
        }
        projectsChanged = true;
      }
    }

    // タグ削除時に選択中フィルターをクリーンアップ
    let filtersReapplied = false;
    if (tagsChanged) {
      const availableTags = new Set(getAllTagNames());
      const cleaned = selectedFilterTags.filter(tag => availableTags.has(tag));
      if (cleaned.length !== selectedFilterTags.length) {
        selectedFilterTags = cleaned;
        filterProjectsByTags(selectedFilterTags);
        filtersReapplied = true;
      }
    }

    if (!filtersReapplied && (tagsChanged || projectsChanged)) {
      applyFilters();
    }

    if (tagsChanged || projectsChanged) {
      updateFilterUI();
      triggerUIRefresh();
    }

    if (projectsChanged) {
      refreshVisibleProjectUI();
    }
  });
}

// ========================================
// プロジェクト名キャプチャ
// ========================================

/**
 * DOMからプロジェクト名を取得
 * @param {string} projectId - プロジェクトID
 * @returns {string} プロジェクト名（取得できない場合は空文字）
 */
function getProjectNameFromDOM(projectId) {
  const emojiEl = document.getElementById(`project-${projectId}-emoji`);
  if (!emojiEl) return '';

  const card = emojiEl.closest(NOTEBOOKLM_SELECTORS.projectCard);
  if (!card) return '';

  const titleEl = card.querySelector(NOTEBOOKLM_SELECTORS.projectTitle);
  return titleEl?.textContent?.trim() || '';
}

/**
 * プロジェクト名が変更されていたら同期
 * @param {string} projectId - プロジェクトID
 */
function syncProjectNameIfChanged(projectId) {
  const currentName = getProjectNameFromDOM(projectId);
  const cachedProject = getCachedProject(projectId);

  if (cachedProject && cachedProject.name !== currentName && currentName) {
    cachedProject.name = currentName;
    storageSet({ [`project:${projectId}`]: cachedProject }).then((ok) => {
      if (!ok) {
        return;
      }
      cache.projects.set(projectId, cachedProject);
    });
  }
}

// ========================================
// ユーティリティ関数
// ========================================

/**
 * 要素からプロジェクトIDを抽出する
 * @param {Element} element - プロジェクト要素（またはその親要素）
 * @returns {string|null} プロジェクトID（取得できない場合はnull）
 */
function extractProjectIdFromElement(element) {
  // id="project-{uuid}-emoji" の要素を検索
  const emojiElement = element.querySelector(EMOJI_SELECTOR);
  if (!emojiElement) return null;

  const id = emojiElement.id;
  // "project-{uuid}-emoji" から {uuid} を抽出
  const match = id.match(/^project-(.+)-emoji$/);
  return match ? match[1] : null;
}

/**
 * 絵文字要素から直接プロジェクトIDを抽出する
 * @param {Element} emojiElement - 絵文字アイコン要素
 * @returns {string|null} プロジェクトID
 */
function extractProjectIdFromEmoji(emojiElement) {
  const id = emojiElement.id;
  const match = id.match(/^project-(.+)-emoji$/);
  return match ? match[1] : null;
}

/**
 * トースト通知を表示する
 * @param {string} message - 表示するメッセージ
 */
function showToast(message) {
  // 既存のトーストを削除
  const existingToast = document.querySelector('.nf-toast');
  if (existingToast) {
    existingToast.remove();
  }

  const toast = document.createElement('div');
  toast.className = 'nf-toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  // アニメーション用に少し遅延
  setTimeout(() => toast.classList.add('nf-toast-show'), 10);

  // 3秒後に消す
  setTimeout(() => {
    toast.classList.remove('nf-toast-show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ========================================
// キーボードナビゲーション
// ========================================

/**
 * ドロップダウンのキーボードナビゲーションをセットアップ
 * @param {HTMLElement} container - ドロップダウンコンテナ
 * @param {string} itemSelector - アイテムのCSSセレクタ
 * @param {function} onSelect - アイテム選択時のコールバック (item) => void
 * @param {function} onClose - 閉じる時のコールバック
 * @param {HTMLElement} [focusTarget] - キーイベントを監視する要素（省略時はcontainer）
 * @param {function} [onTab] - Tabキー押下時のコールバック (shiftKey: boolean) => void
 */
function setupKeyboardNavigation(container, itemSelector, onSelect, onClose, focusTarget = null, onTab = null) {
  let currentIndex = -1;
  const eventTarget = focusTarget || container;

  const getItems = () => Array.from(container.querySelectorAll(itemSelector));

  const updateHighlight = (newIndex) => {
    const items = getItems();
    if (items.length === 0) return;

    // 前のハイライトを削除
    items.forEach(item => item.classList.remove('nf-keyboard-focus'));

    // インデックスを範囲内に収める
    if (newIndex < 0) newIndex = items.length - 1;
    if (newIndex >= items.length) newIndex = 0;

    currentIndex = newIndex;
    items[currentIndex].classList.add('nf-keyboard-focus');

    // スクロールして表示
    items[currentIndex].scrollIntoView({ block: 'nearest' });
  };

  const handleKeyDown = (e) => {
    const items = getItems();

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        updateHighlight(currentIndex + 1);
        break;

      case 'ArrowUp':
        e.preventDefault();
        updateHighlight(currentIndex - 1);
        break;

      case 'Enter':
        e.preventDefault();
        if (currentIndex >= 0 && currentIndex < items.length) {
          onSelect(items[currentIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        onClose();
        break;

      case 'Tab':
        e.preventDefault();
        if (onTab) {
          onTab(e.shiftKey);
        } else {
          onClose();
        }
        break;
    }
  };

  eventTarget.addEventListener('keydown', handleKeyDown);

  // クリーンアップ用に関数を返す
  return () => {
    eventTarget.removeEventListener('keydown', handleKeyDown);
  };
}

// ========================================
// デバウンス
// ========================================

/**
 * デバウンス関数
 * @param {Function} func - 実行する関数
 * @param {number} wait - 待機時間（ミリ秒）
 * @returns {Function}
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ========================================
// バリデーション・ユーティリティ
// ========================================

/**
 * タグ名のバリデーション
 * @param {string} tag - タグ名
 * @returns {{valid: boolean, tag?: string, error?: string}}
 */
function validateTagName(tag) {
  if (!tag || !tag.trim()) {
    return { valid: false, error: 'タグ名を入力してください' };
  }

  const trimmed = tag.trim();

  if (trimmed.length > 50) {
    return { valid: false, error: 'タグ名は50文字以内にしてください' };
  }

  // 階層タグのバリデーション
  if (trimmed.includes(HIERARCHY_SEPARATOR)) {
    const parts = trimmed.split(HIERARCHY_SEPARATOR);
    // 空のパーツがないかチェック
    if (parts.some(p => !p.trim())) {
      return { valid: false, error: '階層区切り(/)の前後に空白は使えません' };
    }
  }

  return { valid: true, tag: trimmed };
}

/**
 * allTagsを正規化（重複排除、空文字除去、階層順ソート）
 * @param {string[]} allTags
 * @returns {string[]}
 */
function normalizeAllTags(allTags) {
  return [...new Set(allTags)]
    .filter(tag => tag && tag.trim())
    .sort((a, b) => {
      // 階層タグを考慮したソート
      // 親タグが先に来るように
      const partsA = a.split(HIERARCHY_SEPARATOR);
      const partsB = b.split(HIERARCHY_SEPARATOR);

      // 共通の深さまで比較
      const minLen = Math.min(partsA.length, partsB.length);
      for (let i = 0; i < minLen; i++) {
        const cmp = partsA[i].localeCompare(partsB[i], 'ja');
        if (cmp !== 0) return cmp;
      }
      // 深さが浅い方（親）を先に
      return partsA.length - partsB.length;
    });
}

/**
 * 親タグが存在しない場合は自動作成
 * @param {string} tag - タグ名
 * @returns {Promise<void>}
 */
async function ensureParentTagExists(tag) {
  const parentTag = getParentTag(tag);
  if (!parentTag) return;

  // 親タグがキャッシュに存在しない場合は作成
  if (!cache.tagMeta[parentTag]) {
    await saveTagMeta(parentTag, { color: null });
    // 後方互換性のためallTagsにも追加
    if (!cache.allTags.includes(parentTag)) {
      cache.allTags = normalizeAllTags([...cache.allTags, parentTag]);
    }
  }

  // 再帰的に親の親も確認
  await ensureParentTagExists(parentTag);
}

// ========================================
// ストレージ操作
// ========================================

/**
 * プロジェクトにタグを追加
 * @param {string} projectId
 * @param {string} newTag
 * @returns {Promise<boolean>}
 */
async function addTagToProject(projectId, newTag) {
  const validation = validateTagName(newTag);
  if (!validation.valid) {
    showToast(validation.error);
    return false;
  }

  const normalizedTag = validation.tag;

  // キャッシュからデータを取得
  const cachedProject = getCachedProject(projectId);
  const cachedAllTags = getCachedAllTags();

  // プロジェクト名をDOMから取得
  const projectName = getProjectNameFromDOM(projectId);

  // プロジェクトデータを作成または更新
  const project = cachedProject ? { ...cachedProject } : {
    id: projectId,
    name: projectName,
    tags: [],
    pinned: false,
    updatedAt: Date.now()
  };

  // プロジェクト名を更新（空でない場合）
  if (projectName && project.name !== projectName) {
    project.name = projectName;
  }

  // 重複チェック
  if (project.tags.includes(normalizedTag)) {
    showToast('このタグは既に追加されています');
    return false;
  }

  // 親タグが存在しない場合は自動作成
  await ensureParentTagExists(normalizedTag);

  // タグ追加
  project.tags = [...project.tags, normalizedTag];
  project.updatedAt = Date.now();

  // tagMetaに新しいタグを追加（存在しない場合）
  if (!cache.tagMeta[normalizedTag]) {
    await saveTagMeta(normalizedTag, { color: null });
  }

  // allTags更新（後方互換性）
  let allTags = [...cachedAllTags];
  if (!allTags.includes(normalizedTag)) {
    allTags.push(normalizedTag);
  }
  allTags = normalizeAllTags(allTags);

  // 保存
  const saved = await storageSet({ [`project:${projectId}`]: project, allTags: allTags });
  if (!saved) {
    showToast('タグの追加に失敗しました');
    return false;
  }
  updateCache(projectId, project, allTags);
  return true;
}

/**
 * プロジェクトからタグを削除
 * @param {string} projectId
 * @param {string} tagToRemove
 * @returns {Promise<boolean>}
 */
async function removeTagFromProject(projectId, tagToRemove) {
  const cachedProject = getCachedProject(projectId);
  if (!cachedProject) {
    return false;
  }

  const project = { ...cachedProject };
  project.tags = project.tags.filter(tag => tag !== tagToRemove);
  project.updatedAt = Date.now();

  const saved = await storageSet({ [`project:${projectId}`]: project });
  if (!saved) {
    showToast('タグの削除に失敗しました');
    return false;
  }

  updateCache(projectId, project, null);
  return true;
}

/**
 * プロジェクトの親タグ順序を並び替え
 * @param {string} projectId - プロジェクトID
 * @param {string} draggedParent - ドラッグされた親タグ名
 * @param {string} targetParent - ドロップ先の親タグ名
 * @returns {Promise<boolean>}
 */
async function reorderProjectTags(projectId, draggedParent, targetParent) {
  const cachedProject = getCachedProject(projectId);
  if (!cachedProject?.tags?.length) return false;

  const tags = [...cachedProject.tags];

  // 親タグ名のリストを導出（順序保持）
  const parentOrder = [];
  const parentGroups = new Map();

  tags.forEach(tag => {
    const parent = tag.split(HIERARCHY_SEPARATOR)[0];
    if (!parentGroups.has(parent)) {
      parentOrder.push(parent);
      parentGroups.set(parent, []);
    }
    parentGroups.get(parent).push(tag);
  });

  // 親タグの順序を変更
  const draggedIndex = parentOrder.indexOf(draggedParent);
  const targetIndex = parentOrder.indexOf(targetParent);

  if (draggedIndex === -1 || targetIndex === -1 || draggedIndex === targetIndex) {
    return false;
  }

  // 配列から削除して新しい位置に挿入
  parentOrder.splice(draggedIndex, 1);
  parentOrder.splice(targetIndex, 0, draggedParent);

  // 新しい順序でタグ配列を再構築
  const newTags = [];
  parentOrder.forEach(parent => {
    newTags.push(...parentGroups.get(parent));
  });

  // プロジェクトデータを更新
  const project = { ...cachedProject };
  project.tags = newTags;
  project.updatedAt = Date.now();

  const saved = await storageSet({ [`project:${projectId}`]: project });
  if (!saved) {
    return false;
  }
  updateCache(projectId, project, null);
  refreshProjectUI(projectId);
  return true;
}

/**
 * 指定インデックスの位置にタグを移動（順番変更）
 * ポップオーバーでのドラッグ&ドロップ用（このプロジェクトのみに影響）
 * @param {string} projectId - プロジェクトID
 * @param {string} draggedParent - ドラッグされた親タグ名
 * @param {number} targetIndex - 挿入先インデックス
 * @returns {Promise<boolean>}
 */
async function reorderProjectTagsAtIndex(projectId, draggedParent, targetIndex) {
  const cachedProject = getCachedProject(projectId);
  if (!cachedProject?.tags?.length) return false;

  const tags = [...cachedProject.tags];

  // 親タグ名のリストを導出（順序保持）
  const parentOrder = [];
  const parentGroups = new Map();

  tags.forEach(tag => {
    const parent = tag.split(HIERARCHY_SEPARATOR)[0];
    if (!parentGroups.has(parent)) {
      parentOrder.push(parent);
      parentGroups.set(parent, []);
    }
    parentGroups.get(parent).push(tag);
  });

  const draggedIndex = parentOrder.indexOf(draggedParent);
  if (draggedIndex === -1) return false;

  // 同じ位置への移動は無視
  if (draggedIndex === targetIndex || draggedIndex === targetIndex - 1) {
    return false;
  }

  // 元の位置から削除
  parentOrder.splice(draggedIndex, 1);

  // 新しい位置に挿入（削除後のインデックス調整）
  const adjustedIndex = draggedIndex < targetIndex ? targetIndex - 1 : targetIndex;
  parentOrder.splice(adjustedIndex, 0, draggedParent);

  // 新しい順序でタグ配列を再構築
  const newTags = [];
  parentOrder.forEach(parent => {
    newTags.push(...parentGroups.get(parent));
  });

  // プロジェクトデータを更新
  const project = { ...cachedProject };
  project.tags = newTags;
  project.updatedAt = Date.now();

  const saved = await storageSet({ [`project:${projectId}`]: project });
  if (!saved) {
    return false;
  }
  updateCache(projectId, project, null);
  refreshProjectUI(projectId);
  return true;
}

/**
 * allTagsからタグを完全削除（全プロジェクトからも削除）
 * @param {string} tagToRemove - 削除するタグ
 * @param {boolean} skipConfirm - 確認ダイアログをスキップするかどうか
 * @returns {Promise<boolean>}
 */
async function removeTagFromAllProjects(tagToRemove, skipConfirm = false) {
  // キャッシュから現在のデータを取得
  const cachedAllTags = getCachedAllTags();

  // タグが存在しない場合
  if (!cachedAllTags.includes(tagToRemove) && !cache.tagMeta[tagToRemove]) {
    showToast('タグが見つかりません');
    return false;
  }

  // 子タグを取得
  const childTags = getChildTags(tagToRemove, cachedAllTags);

  // 削除確認ダイアログ（常に表示）
  if (!skipConfirm) {
    const message = childTags.length > 0
      ? `「${tagToRemove}」を削除すると、子タグ（${childTags.length}個）も削除されます。続行しますか？`
      : `タグ「${tagToRemove}」を削除しますか？`;
    const confirmed = confirm(message);
    if (!confirmed) return false;
  }

  // 削除対象のタグリスト（親 + 子）
  const tagsToRemove = [tagToRemove, ...childTags];

  // allTagsから削除
  const newAllTags = cachedAllTags.filter(tag => !tagsToRemove.includes(tag));

  // 全プロジェクトからこれらのタグを削除
  const updatedProjects = {};

  for (const [projectId, projectData] of cache.projects) {
    if (projectData.tags && projectData.tags.some(t => tagsToRemove.includes(t))) {
      const updatedProject = {
        ...projectData,
        tags: projectData.tags.filter(tag => !tagsToRemove.includes(tag)),
        updatedAt: Date.now()
      };
      updatedProjects[`project:${projectId}`] = updatedProject;
    }
  }

  // tagMetaから削除
  for (const tag of tagsToRemove) {
    await removeTagMeta(tag);
  }

  // 更新データを作成
  const updateData = {
    allTags: newAllTags,
    ...updatedProjects
  };

  // 保存
  const saved = await storageSet(updateData);
  if (!saved) {
    showToast('タグの削除に失敗しました');
    return false;
  }

  cache.allTags = newAllTags;
  for (const [key, value] of Object.entries(updatedProjects)) {
    const projectId = key.replace('project:', '');
    cache.projects.set(projectId, value);
  }

  const message = childTags.length > 0
    ? `タグ「${tagToRemove}」と子タグ（${childTags.length}個）を削除しました`
    : `タグ「${tagToRemove}」を削除しました`;
  showToast(message);
  return true;
}

/**
 * タグ配列内のタグを置換（重複はそのまま）
 * @param {string[]} tags
 * @param {string} oldTag
 * @param {string} newTag
 * @returns {string[]|null} 変更がない場合はnull
 */
function replaceTagInTags(tags, oldTag, newTag) {
  if (!tags.includes(oldTag)) return null;
  return tags.map(tag => (tag === oldTag ? newTag : tag));
}

/**
 * タグ配列内でsourceTagをtargetTagに統合（重複排除）
 * @param {string[]} tags
 * @param {string} sourceTag
 * @param {string} targetTag
 * @returns {string[]|null} 変更がない場合はnull
 */
function mergeTagInTags(tags, sourceTag, targetTag) {
  if (!tags.includes(sourceTag)) return null;
  let updatedTags = [...tags];
  const sourceIndex = updatedTags.indexOf(sourceTag);

  if (updatedTags.includes(targetTag)) {
    updatedTags.splice(sourceIndex, 1);
  } else {
    updatedTags[sourceIndex] = targetTag;
  }

  return [...new Set(updatedTags)];
}

/**
 * 全プロジェクトに対してタグ配列を更新し、更新マップを返す
 * @param {function(string[], string, Object): (string[]|null)} updateTagsFn
 * @returns {Object} storage用の更新マップ
 */
function updateProjectsByTags(updateTagsFn) {
  const projectUpdates = {};

  for (const [projectId, project] of cache.projects) {
    if (!project.tags || project.tags.length === 0) {
      continue;
    }

    const updatedTags = updateTagsFn(project.tags, projectId, project);
    if (!updatedTags) {
      continue;
    }

    const updatedProject = { ...project, tags: updatedTags, updatedAt: Date.now() };
    cache.projects.set(projectId, updatedProject);
    projectUpdates[`project:${projectId}`] = updatedProject;
  }

  return projectUpdates;
}

/**
 * タグを統合する（sourceTagの紐付けをtargetTagに移動し、sourceTagを削除）
 * @param {string} sourceTag - 統合元タグ（削除される）
 * @param {string} targetTag - 統合先タグ（残る）
 * @returns {Promise<boolean>}
 */
async function mergeTagsInAllProjects(sourceTag, targetTag) {
  if (sourceTag === targetTag) return false;

  // 0. 子孫リストを先にスナップショット化（メタ削除前に取得）
  const allTags = getAllTagNames();
  const childTags = allTags.filter(t => t.startsWith(sourceTag + HIERARCHY_SEPARATOR));

  // 1. 全プロジェクトでsourceTagをtargetTagに統合
  const projectUpdates = updateProjectsByTags((tags) =>
    mergeTagInTags(tags, sourceTag, targetTag)
  );

  // 2. tagMeta欠損補完（targetが無色の場合のみsourceの色を引き継ぐ）
  const sourceMeta = cache.tagMeta[sourceTag];
  const targetMeta = cache.tagMeta[targetTag];
  if (sourceMeta && sourceMeta.color && (!targetMeta || !targetMeta.color)) {
    await saveTagMeta(targetTag, { color: sourceMeta.color });
  }

  // 3. sourceTagのメタデータを削除
  await removeTagMeta(sourceTag);

  // 4. sourceTagの子タグも再帰的に処理（スナップショットを使用）
  for (const childTag of childTags) {
    const suffix = childTag.substring(sourceTag.length);
    const newChildTag = targetTag + suffix;

    if (allTags.includes(newChildTag)) {
      // 同名の子タグが存在する場合は統合
      await mergeTagsInAllProjects(childTag, newChildTag);
    } else {
      // 存在しない場合はリネーム
      await renameTagInAllProjects(childTag, newChildTag);
    }
  }

  // 5. ストレージに一括保存（クォータ対策）
  if (Object.keys(projectUpdates).length > 0) {
    await storageSet(projectUpdates);
  }

  // 6. フィルター状態を更新（sourceをtargetに置換）
  if (selectedFilterTags.includes(sourceTag)) {
    const idx = selectedFilterTags.indexOf(sourceTag);
    if (!selectedFilterTags.includes(targetTag)) {
      selectedFilterTags[idx] = targetTag;
    } else {
      selectedFilterTags.splice(idx, 1);
    }
  }

  // 8. キャッシュの正規化
  cache.allTags = normalizeAllTags(getAllTagNames());

  return true;
}

/**
 * タグを別のタグの子として移動（子タグも一緒に移動）
 * @param {string} sourceTag - 移動するタグ
 * @param {string} targetParent - 移動先の親タグ（nullでルートへ）
 * @returns {Promise<boolean>}
 */
async function moveTagToParent(sourceTag, targetParent) {
  const allTags = getAllTagNames();

  // 自分自身への移動は無効
  if (sourceTag === targetParent) {
    return false;
  }

  // 自分の子孫への移動は無効（循環参照防止）
  if (targetParent && targetParent.startsWith(sourceTag + HIERARCHY_SEPARATOR)) {
    showToast('子タグの中には移動できません');
    return false;
  }

  // 移動するタグ（自身と全ての子孫）を収集
  const tagsToMove = allTags.filter(t =>
    t === sourceTag || t.startsWith(sourceTag + HIERARCHY_SEPARATOR)
  );

  // ソースタグのベース名を取得
  const sourceBaseName = sourceTag.includes(HIERARCHY_SEPARATOR)
    ? sourceTag.split(HIERARCHY_SEPARATOR).pop()
    : sourceTag;

  // 新しいタグ名を生成
  const newTagName = targetParent
    ? `${targetParent}${HIERARCHY_SEPARATOR}${sourceBaseName}`
    : sourceBaseName;

  // 移動不要な場合（既に同じ位置）
  if (sourceTag === newTagName) {
    return false;
  }

  // 重複チェック（同名タグが存在する場合は自動統合）
  if (allTags.includes(newTagName) && newTagName !== sourceTag) {
    const success = await mergeTagsInAllProjects(sourceTag, newTagName);
    if (success) {
      showToast(`「${sourceBaseName}」を「${newTagName}」に統合しました`);
    }
    return success;
  }

  // 各タグを新しい名前にリネーム
  for (const oldTag of tagsToMove) {
    const suffix = oldTag.substring(sourceTag.length); // 例: "/test" or ""
    const newTag = newTagName + suffix;
    await renameTagInAllProjects(oldTag, newTag);
  }

  showToast(`「${sourceBaseName}」を移動しました`);
  return true;
}

/**
 * 全プロジェクトでタグ名をリネーム
 * @param {string} oldTag - 元のタグ名
 * @param {string} newTag - 新しいタグ名
 * @returns {Promise<void>}
 */
async function renameTagInAllProjects(oldTag, newTag) {
  // 同じ名前なら何もしない
  if (oldTag === newTag) return;

  // 1. tagMetaの更新
  const oldMeta = cache.tagMeta[oldTag] || { color: null };
  await saveTagMeta(newTag, oldMeta);
  await removeTagMeta(oldTag);

  // 2. 全プロジェクトのタグ配列を更新
  const projectUpdates = updateProjectsByTags((tags) =>
    replaceTagInTags(tags, oldTag, newTag)
  );

  // 3. allTags配列を更新
  if (cache.allTags) {
    cache.allTags = cache.allTags.map(t => t === oldTag ? newTag : t);
  }

  // 4. ストレージに保存
  const updateData = {
    ...projectUpdates
  };
  if (cache.allTags) {
    updateData.allTags = cache.allTags;
  }

  await storageSet(updateData);
}

// ========================================
// ピン留め機能
// ========================================

/**
 * プロジェクトのピン留め状態をトグル
 * @param {string} projectId - プロジェクトID
 * @returns {Promise<boolean>} 成功したかどうか
 */
async function togglePinProject(projectId) {
  const project = getCachedProject(projectId);

  // プロジェクトデータを作成または更新
  const projectData = project ? { ...project } : {
    id: projectId,
    name: getProjectNameFromDOM(projectId),
    tags: [],
    pinned: false,
    updatedAt: Date.now()
  };

  // ピン留め状態をトグル
  projectData.pinned = !projectData.pinned;
  projectData.updatedAt = Date.now();

  const saved = await storageSet({ [`project:${projectId}`]: projectData });
  if (!saved) {
    showToast('ピン留めの変更に失敗しました');
    return false;
  }

  cache.projects.set(projectId, projectData);
  updatePinIconState(projectId);
  sortProjects(currentSortType);

  const message = projectData.pinned ? 'ピン留めしました' : 'ピン留めを解除しました';
  showToast(message);
  return true;
}

/**
 * ピンアイコンの状態を更新
 * @param {string} projectId - プロジェクトID
 */
function updatePinIconState(projectId) {
  const pinIcon = document.querySelector(`.nf-pin-icon[data-project-id="${projectId}"]`);
  if (!pinIcon) return;

  const project = getCachedProject(projectId);
  const isPinned = project?.pinned === true;

  if (isPinned) {
    pinIcon.classList.add('pinned');
    pinIcon.textContent = '★';
    pinIcon.setAttribute('title', 'ピン留め解除');
  } else {
    pinIcon.classList.remove('pinned');
    pinIcon.textContent = '☆';
    pinIcon.setAttribute('title', 'ピン留め');
  }
}

// ========================================
// ポップオーバー
// ========================================

// 現在表示中のポップオーバー
let currentPopover = null;

/**
 * ポップオーバーを非表示にする
 */
function hideTagPopover() {
  if (currentPopover) {
    currentPopover.remove();
    currentPopover = null;
  }
  // コールバックを解除
  uiUpdateCallbacks.popover = null;
}

/**
 * タグバッジを作成
 * @param {string} tagName
 * @param {function} onRemove - 削除時のコールバック
 * @param {Object} [options] - オプション
 * @param {boolean} [options.showColorPicker=false] - カラーピッカーを表示するか
 * @param {function} [options.onColorChange] - 色変更時のコールバック
 * @returns {HTMLElement}
 */
function createTagBadge(tagName, onRemove, options = {}) {
  const { showColorPicker = false, onColorChange, displayName, tooltipText } = options;

  const badge = document.createElement('span');
  badge.className = 'nf-tag-badge';
  badge.setAttribute('data-tag', tagName);

  // ツールチップを設定
  if (tooltipText) {
    badge.setAttribute('title', tooltipText);
  }

  // タグの色を適用
  const color = getTagColor(tagName);
  if (color) {
    badge.style.backgroundColor = color;
    // コントラストに応じてテキスト色を調整
    badge.style.color = getContrastColor(color);
  }

  // タグ名テキスト（displayNameがあればそれを表示）
  const tagText = document.createElement('span');
  tagText.className = 'nf-tag-badge-text';
  tagText.textContent = displayName || tagName;
  badge.appendChild(tagText);

  // カラーピッカーボタン（オプション）
  if (showColorPicker) {
    const colorBtn = document.createElement('button');
    colorBtn.className = 'nf-tag-color-btn';
    colorBtn.textContent = '🎨';
    colorBtn.setAttribute('title', '色を変更');
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showColorPickerPopover(tagName, colorBtn, onColorChange);
    });
    badge.appendChild(colorBtn);
  }

  // 削除ボタン
  const removeBtn = document.createElement('button');
  removeBtn.className = 'nf-tag-badge-remove';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    onRemove();
  });

  badge.appendChild(removeBtn);
  return badge;
}

/**
 * 背景色に対するコントラストの良いテキスト色を返す
 * @param {string} hexColor - 16進数カラーコード
 * @returns {string} '#fff' または '#000'
 */
function getContrastColor(hexColor) {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  // 輝度を計算
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000' : '#fff';
}

/**
 * カラーピッカーポップオーバーを表示
 * @param {string} tagName - タグ名
 * @param {HTMLElement} anchorElement - アンカー要素
 * @param {function} [onColorChange] - 色変更時のコールバック
 */
function showColorPickerPopover(tagName, anchorElement, onColorChange) {
  // 既存のカラーピッカーを削除
  const existing = document.querySelector('.nf-color-picker');
  if (existing) {
    existing.remove();
  }

  const picker = document.createElement('div');
  picker.className = 'nf-color-picker';

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'nf-color-picker-header';
  header.textContent = 'タグの色を選択';
  picker.appendChild(header);

  // カラースウォッチコンテナ
  const swatchContainer = document.createElement('div');
  swatchContainer.className = 'nf-color-swatches';

  const currentColor = getTagColor(tagName);

  TAG_COLOR_PALETTE.forEach(({ value, label }) => {
    const swatch = document.createElement('button');
    swatch.className = 'nf-color-swatch';
    swatch.setAttribute('title', label);
    swatch.setAttribute('data-color', value || '');

    if (value) {
      swatch.style.backgroundColor = value;
    } else {
      // 「なし」の場合
      swatch.classList.add('nf-color-swatch-none');
      swatch.textContent = '✕';
    }

    // 現在の色にチェックマーク
    if (value === currentColor || (value === null && currentColor === null)) {
      swatch.classList.add('selected');
    }

    swatch.addEventListener('click', async () => {
      const success = await setTagColor(tagName, value);
      if (success) {
        picker.remove();
        if (onColorChange) {
          onColorChange();
        }
        showToast(value ? `タグ「${tagName}」の色を変更しました` : `タグ「${tagName}」の色を解除しました`);
      }
    });

    swatchContainer.appendChild(swatch);
  });

  picker.appendChild(swatchContainer);

  // 継承情報
  const parentTag = getParentTag(tagName);
  if (parentTag && !hasCustomColor(tagName)) {
    const inheritInfo = document.createElement('div');
    inheritInfo.className = 'nf-color-inherit-info';
    inheritInfo.textContent = `親タグ「${parentTag}」から色を継承`;
    picker.appendChild(inheritInfo);
  }

  // 位置を計算
  document.body.appendChild(picker);
  const rect = anchorElement.getBoundingClientRect();
  const pickerRect = picker.getBoundingClientRect();

  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 4;

  // 画面端をはみ出さないように調整
  if (left + pickerRect.width > window.innerWidth) {
    left = window.innerWidth - pickerRect.width - 8;
  }
  if (top + pickerRect.height > window.innerHeight + window.scrollY) {
    top = rect.top + window.scrollY - pickerRect.height - 4;
  }

  picker.style.left = `${Math.max(8, left)}px`;
  picker.style.top = `${Math.max(8, top)}px`;

  // 外側クリックで閉じる
  const handleClickOutside = (e) => {
    if (!picker.contains(e.target) && !anchorElement.contains(e.target)) {
      picker.remove();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 0);
}

/**
 * タグ入力ポップオーバーを表示
 * @param {HTMLElement} targetElement - フォルダアイコン要素
 * @param {string} projectId
 */
function showTagPopover(targetElement, projectId) {
  // 既存のポップオーバーを閉じる
  hideTagPopover();

  // プロジェクト名が変更されていたら同期
  syncProjectNameIfChanged(projectId);

  // ポップオーバーを作成
  const popover = document.createElement('div');
  popover.className = 'nf-popover';
  currentPopover = popover;

  // ヘッダー
  const header = document.createElement('div');
  header.className = 'nf-popover-header';

  const title = document.createElement('span');
  title.className = 'nf-popover-title';
  title.textContent = 'タグを管理';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'nf-popover-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', hideTagPopover);

  header.appendChild(title);
  header.appendChild(closeBtn);
  popover.appendChild(header);

  // タグ一覧コンテナ
  const tagsContainer = document.createElement('div');
  tagsContainer.className = 'nf-popover-tags';

  const tagsLabel = document.createElement('div');
  tagsLabel.className = 'nf-popover-label';
  tagsLabel.textContent = '現在のタグ:';
  tagsContainer.appendChild(tagsLabel);

  const tagsList = document.createElement('div');
  tagsList.className = 'nf-tags-list';
  tagsContainer.appendChild(tagsList);

  popover.appendChild(tagsContainer);

  // 入力エリア
  const inputContainer = document.createElement('div');
  inputContainer.className = 'nf-popover-input-container';

  const inputLabel = document.createElement('div');
  inputLabel.className = 'nf-popover-label';
  inputLabel.textContent = 'タグを追加:';
  inputContainer.appendChild(inputLabel);

  const inputRow = document.createElement('div');
  inputRow.className = 'nf-input-row';

  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'nf-tag-input';
  input.placeholder = '新しいタグを入力...';
  input.maxLength = 50;

  const addBtn = document.createElement('button');
  addBtn.className = 'nf-add-btn';
  addBtn.textContent = '追加';

  inputRow.appendChild(input);
  inputRow.appendChild(addBtn);
  inputContainer.appendChild(inputRow);

  // 候補リスト
  const suggestionsList = document.createElement('div');
  suggestionsList.className = 'nf-suggestions';
  inputContainer.appendChild(suggestionsList);

  popover.appendChild(inputContainer);

  // ポップオーバー内のクリックイベントの伝播を止める
  popover.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  popover.addEventListener('mousedown', (e) => {
    e.stopPropagation();
  });

  // ポップオーバーを配置
  document.body.appendChild(popover);

  // 位置を計算
  const rect = targetElement.getBoundingClientRect();
  const popoverRect = popover.getBoundingClientRect();

  let left = rect.left + window.scrollX;
  let top = rect.bottom + window.scrollY + 8;

  // 画面右端をはみ出す場合は左に寄せる
  if (left + popoverRect.width > window.innerWidth) {
    left = window.innerWidth - popoverRect.width - 16;
  }

  // 画面下端をはみ出す場合は上に表示
  if (top + popoverRect.height > window.innerHeight + window.scrollY) {
    top = rect.top + window.scrollY - popoverRect.height - 8;
  }

  popover.style.left = `${Math.max(8, left)}px`;
  popover.style.top = `${Math.max(8, top)}px`;

  // データを読み込んでUIを更新（キャッシュから取得）
  const updateUI = () => {
    const project = getCachedProject(projectId);
    const projectTags = project ? project.tags : [];
    const allTags = getCachedAllTags();

    // タグ一覧を更新（親子タグ分離表示）
    tagsList.innerHTML = '';
    if (projectTags.length === 0) {
      const noTags = document.createElement('span');
      noTags.className = 'nf-no-tags';
      noTags.textContent = 'タグなし';
      tagsList.appendChild(noTags);
    } else {
      // 親タグ名を導出（カードと同じロジック）
      const parentTagNames = [...new Set(
        projectTags.map(tag => tag.split(HIERARCHY_SEPARATOR)[0])
      )];

      // 子タグ（/を含むタグ）を抽出
      const childTags = projectTags.filter(tag => tag.includes(HIERARCHY_SEPARATOR));

      // 上段: 親タグ一覧（ドラッグ&ドロップ可能）
      if (parentTagNames.length > 0) {
        const parentSection = document.createElement('div');
        parentSection.className = 'nf-popover-parent-tags nf-tags-list';
        parentSection.style.display = 'flex';
        parentSection.style.flexWrap = 'wrap';
        parentSection.style.alignItems = 'center';
        parentSection.style.gap = '4px';

        let draggedParent = null;

        // ドロップゾーンを作成するヘルパー関数（順番変更用）
        const createDropZone = (insertIndex) => {
          const dropZone = document.createElement('div');
          dropZone.className = 'nf-tag-drop-zone';
          dropZone.setAttribute('data-insert-index', insertIndex.toString());

          dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (draggedParent) {
              e.dataTransfer.dropEffect = 'move';
              dropZone.classList.add('nf-drop-active');
            }
          });

          dropZone.addEventListener('dragleave', () => {
            dropZone.classList.remove('nf-drop-active');
          });

          dropZone.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropZone.classList.remove('nf-drop-active');
            const dragged = e.dataTransfer.getData('text/plain');
            if (dragged) {
              // 順番変更: insertIndexの位置に挿入
              const success = await reorderProjectTagsAtIndex(projectId, dragged, insertIndex);
              if (success) {
                updateUI();
              }
            }
          });

          return dropZone;
        };

        // 最初のドロップゾーン（先頭への挿入用）
        parentSection.appendChild(createDropZone(0));

        parentTagNames.forEach((parentName, index) => {
          const badge = createTagBadge(parentName, async () => {
            // 親タグ削除時は、その親に属するすべてのタグを削除
            const tagsToRemove = projectTags.filter(t => t.split(HIERARCHY_SEPARATOR)[0] === parentName);
            for (const tag of tagsToRemove) {
              await removeTagFromProject(projectId, tag);
            }
            updateUI();
            refreshProjectUI(projectId);
          }, {
            showColorPicker: true,
            onColorChange: () => {
              updateUI();
              updateAllInlineBadges();
            }
          });

          // D&D属性を設定
          badge.setAttribute('draggable', 'true');
          badge.setAttribute('data-parent-tag', parentName);

          badge.addEventListener('dragstart', (e) => {
            draggedParent = parentName;
            badge.classList.add('nf-dragging');
            parentSection.classList.add('nf-dragging-active');
            e.dataTransfer.setData('text/plain', parentName);
            e.dataTransfer.setData('application/x-nf-tag', parentName);  // 統一MIME追加
            e.dataTransfer.effectAllowed = 'move';
            // ポップオーバー要素に属性を設定（ドロップダウンと同じパターン）
            popover.setAttribute('data-dragging-tag', parentName);
          });

          badge.addEventListener('dragend', () => {
            badge.classList.remove('nf-dragging');
            parentSection.classList.remove('nf-dragging-active');
            draggedParent = null;
            popover.removeAttribute('data-dragging-tag');
            // 全てのドロップターゲットスタイルをクリア
            parentSection.querySelectorAll('.nf-drop-active, .nf-parent-drop-target').forEach(el => {
              el.classList.remove('nf-drop-active', 'nf-parent-drop-target');
            });
          });

          // バッジ上へのドロップ = 親子関係を設定（全プロジェクトに影響）
          badge.addEventListener('dragover', (e) => {
            e.preventDefault();
            const draggingTag = popover.getAttribute('data-dragging-tag');
            // 自分自身や自分の子孫にはドロップ不可
            if (draggingTag &&
                parentName !== draggingTag &&
                !parentName.startsWith(draggingTag + HIERARCHY_SEPARATOR)) {
              e.dataTransfer.dropEffect = 'move';  // effectAllowedと整合
              badge.classList.add('nf-parent-drop-target');
            }
          });

          badge.addEventListener('dragleave', () => {
            badge.classList.remove('nf-parent-drop-target');
          });

          badge.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            badge.classList.remove('nf-parent-drop-target');
            popover.removeAttribute('data-dragging-tag');  // dragend未発火時の安全策

            const dragged = e.dataTransfer.getData('text/plain');
            if (dragged && dragged !== parentName) {
              // 循環参照防止: 自分の子孫には移動できない
              if (parentName.startsWith(dragged + HIERARCHY_SEPARATOR)) {
                showToast('子タグの中には移動できません');
                return;
              }
              // 親子関係を設定: draggedをparentNameの子にする（全プロジェクトに影響）
              const success = await moveTagToParent(dragged, parentName);
              if (success) {
                updateUI();
                refreshVisibleProjectUI();
              }
            }
          });

          parentSection.appendChild(badge);
          // 各バッジの後にドロップゾーンを追加
          parentSection.appendChild(createDropZone(index + 1));
        });

        tagsList.appendChild(parentSection);
      }

      // 下段: 子タグ一覧（末尾部分のみ表示）
      if (childTags.length > 0) {
        const childSection = document.createElement('div');
        childSection.className = 'nf-popover-child-tags';

        const childLabel = document.createElement('div');
        childLabel.className = 'nf-popover-section-label';
        childLabel.textContent = '子タグ:';
        childSection.appendChild(childLabel);

        const childList = document.createElement('div');
        childList.className = 'nf-tags-list';

        childTags.forEach(tag => {
          // 末尾部分のみ表示
          const parts = tag.split(HIERARCHY_SEPARATOR);
          const displayName = parts[parts.length - 1];

          const badge = createTagBadge(tag, async () => {
            const success = await removeTagFromProject(projectId, tag);
            if (success) {
              updateUI();
              refreshProjectUI(projectId);
            }
          }, {
            showColorPicker: true,
            onColorChange: () => {
              updateUI();
              updateAllInlineBadges();
            },
            displayName: displayName,
            tooltipText: tag
          });

          // 子タグにもD&D属性とイベントを追加
          badge.setAttribute('draggable', 'true');
          badge.setAttribute('data-full-tag', tag);

          badge.addEventListener('dragstart', (e) => {
            badge.classList.add('nf-dragging');
            e.dataTransfer.setData('text/plain', tag);  // フルパス
            e.dataTransfer.setData('application/x-nf-tag', tag);  // 統一MIME
            e.dataTransfer.effectAllowed = 'move';
            // ポップオーバー要素に属性を設定
            popover.setAttribute('data-dragging-tag', tag);
          });

          badge.addEventListener('dragend', () => {
            badge.classList.remove('nf-dragging');
            popover.removeAttribute('data-dragging-tag');
            document.querySelectorAll('.nf-parent-drop-target').forEach(el => {
              el.classList.remove('nf-parent-drop-target');
            });
          });

          childList.appendChild(badge);
        });

        childSection.appendChild(childList);
        tagsList.appendChild(childSection);
      }
    }

    // 候補のキーボードナビゲーション用インデックス
    let suggestionIndex = -1;

    // 候補のハイライトを更新
    const updateSuggestionHighlight = () => {
      const items = suggestionsList.querySelectorAll('.nf-suggestion-item');
      items.forEach((item, i) => {
        if (i === suggestionIndex) {
          item.classList.add('nf-keyboard-focus');
          item.scrollIntoView({ block: 'nearest' });
        } else {
          item.classList.remove('nf-keyboard-focus');
        }
      });
    };

    // 候補更新関数
    const updateSuggestions = (inputValue) => {
      suggestionsList.innerHTML = '';
      suggestionIndex = -1;  // インデックスをリセット
      if (!inputValue.trim()) return;

      const filtered = allTags.filter(tag =>
        tag.toLowerCase().startsWith(inputValue.toLowerCase()) &&
        !projectTags.includes(tag)
      ).slice(0, 5);

      filtered.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'nf-suggestion-item';
        item.setAttribute('data-tag', tag);
        item.textContent = tag;
        item.addEventListener('click', async () => {
          const success = await addTagToProject(projectId, tag);
          if (success) {
            input.value = '';
            suggestionsList.innerHTML = '';
            suggestionIndex = -1;
            updateUI();
            refreshProjectUI(projectId);
          }
        });
        suggestionsList.appendChild(item);
      });
    };

    // 入力イベント
    input.oninput = () => updateSuggestions(input.value);

    // タグ追加処理
    const handleAddTag = async () => {
      const value = input.value.trim();
      if (!value) return;

      const success = await addTagToProject(projectId, value);
      if (success) {
        input.value = '';
        suggestionsList.innerHTML = '';
        suggestionIndex = -1;
        updateUI();
        refreshProjectUI(projectId);
      }
    };

    // 候補選択処理
    const selectSuggestion = async () => {
      const items = suggestionsList.querySelectorAll('.nf-suggestion-item');
      if (suggestionIndex >= 0 && suggestionIndex < items.length) {
        const tag = items[suggestionIndex].getAttribute('data-tag');
        const success = await addTagToProject(projectId, tag);
        if (success) {
          input.value = '';
          suggestionsList.innerHTML = '';
          suggestionIndex = -1;
          updateUI();
          refreshProjectUI(projectId);
        }
        return true;
      }
      return false;
    };

    addBtn.onclick = handleAddTag;
    input.onkeydown = async (e) => {
      const items = suggestionsList.querySelectorAll('.nf-suggestion-item');
      const hasItems = items.length > 0;

      if (e.key === 'ArrowDown' && hasItems) {
        e.preventDefault();
        suggestionIndex = suggestionIndex < items.length - 1 ? suggestionIndex + 1 : 0;
        updateSuggestionHighlight();
      } else if (e.key === 'ArrowUp' && hasItems) {
        e.preventDefault();
        suggestionIndex = suggestionIndex > 0 ? suggestionIndex - 1 : items.length - 1;
        updateSuggestionHighlight();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        // 候補が選択されていればそれを選択、そうでなければ入力値を追加
        const selected = await selectSuggestion();
        if (!selected) {
          handleAddTag();
        }
      } else if (e.key === 'Escape') {
        hideTagPopover();
      } else if (e.key === 'Tab' && hasItems && suggestionIndex >= 0) {
        // Tabで候補を入力欄に反映
        e.preventDefault();
        const tag = items[suggestionIndex].getAttribute('data-tag');
        input.value = tag;
        suggestionsList.innerHTML = '';
        suggestionIndex = -1;
      }
    };
  };

  const refreshAndUpdate = async () => {
    await syncCacheAndRefreshUI();
    updateUI();
  };
  refreshAndUpdate();
  // グローバルUI更新コールバックを登録
  uiUpdateCallbacks.popover = updateUI;
  input.focus();

  // 外側クリックで閉じる
  const handleClickOutside = (e) => {
    if (!popover.contains(e.target) && !targetElement.contains(e.target)) {
      hideTagPopover();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 0);
}

/**
 * プロジェクトのUI更新入口
 * @param {string} projectId
 */
function refreshProjectUI(projectId) {
  updateFolderIconState(projectId);
}

/**
 * フォルダアイコンの状態を更新（タグ有無のインジケーター + インラインバッジ）
 * @param {string} projectId
 */
function updateFolderIconState(projectId) {
  const folderIcon = document.querySelector(`.nf-folder-icon[data-project-id="${projectId}"]`);
  if (!folderIcon) return;

  // キャッシュからプロジェクトを取得
  const project = getCachedProject(projectId);
  const hasTags = project && project.tags && project.tags.length > 0;

  if (hasTags) {
    folderIcon.classList.add('has-tags');
  } else {
    folderIcon.classList.remove('has-tags');
  }

  // インラインバッジを更新
  updateInlineBadges(projectId);
}

/**
 * 表示中プロジェクトのUIをまとめて更新
 */
function refreshVisibleProjectUI() {
  const visibleIcons = document.querySelectorAll('.nf-folder-icon[data-project-id]');
  visibleIcons.forEach(icon => {
    const projectId = icon.getAttribute('data-project-id');
    if (projectId) {
      refreshProjectUI(projectId);
    }
  });
}

// ========================================
// インラインバッジ（タグ常時表示）
// ========================================

/**
 * プロジェクトのインラインバッジを作成（最大3個）
 * @param {string} projectId - プロジェクトID
 * @param {number} max - 最大表示数
 * @returns {HTMLElement|null}
 */
function createInlineBadges(projectId, max = 3) {
  const project = getCachedProject(projectId);
  if (!project?.tags?.length) return null;

  const container = document.createElement('div');
  container.className = 'nf-inline-badges';
  container.setAttribute('data-project-id', projectId);

  // 全タグから親タグ名を抽出（重複除去）
  const parentTagNames = [...new Set(
    project.tags.map(tag => {
      const parts = tag.split(HIERARCHY_SEPARATOR);
      return parts[0]; // 最上位の親タグ名
    })
  )];

  // 親タグ名を基準にバッジ表示
  parentTagNames.slice(0, max).forEach(tagName => {
    const badge = document.createElement('span');
    badge.className = 'nf-inline-badge';
    badge.textContent = tagName;

    // このタグ名に該当する子タグをツールチップに表示
    const childTags = project.tags.filter(t => t.split(HIERARCHY_SEPARATOR)[0] === tagName);
    badge.setAttribute('title', childTags.join(', '));

    const color = getTagColor(tagName);
    if (color) {
      badge.style.backgroundColor = color;
      badge.style.color = getContrastColor(color);
    }
    container.appendChild(badge);
  });

  // 親タグが3個以上ある場合は「+N」を表示
  if (parentTagNames.length > max) {
    const more = document.createElement('span');
    more.className = 'nf-inline-badge nf-inline-badge-more';
    more.textContent = `+${parentTagNames.length - max}`;
    container.appendChild(more);
  }

  return container;
}

/**
 * プロジェクトのインラインバッジを更新
 * @param {string} projectId - プロジェクトID
 */
function updateInlineBadges(projectId) {
  // 既存のバッジコンテナを削除
  const existingBadges = document.querySelector(`.nf-inline-badges[data-project-id="${projectId}"]`);
  if (existingBadges) {
    existingBadges.remove();
  }

  // 新しいバッジを作成
  const newBadges = createInlineBadges(projectId);
  if (!newBadges) return;

  // フォルダアイコンの後ろに挿入
  const folderIcon = document.querySelector(`.nf-folder-icon[data-project-id="${projectId}"]`);
  if (folderIcon && folderIcon.parentElement) {
    folderIcon.parentElement.insertBefore(newBadges, folderIcon.nextSibling);
  }
}

/**
 * 表示中の全プロジェクトのインラインバッジを更新
 * フォルダアイコン状態も同期
 */
function updateAllInlineBadges() {
  refreshVisibleProjectUI();
}

// ========================================
// フォルダアイコン注入
// ========================================

/**
 * プロジェクト要素にフォルダアイコンを注入する
 * @param {Element} emojiElement - 絵文字アイコン要素
 */
function injectFolderIcon(emojiElement) {
  // プロジェクトIDを抽出
  const projectId = extractProjectIdFromEmoji(emojiElement);
  if (!projectId) {
    return;
  }

  // すでに処理済みの場合、DOMに実際にアイコンが存在するか確認
  if (processedProjects.has(projectId)) {
    // DOMに実際にフォルダアイコンが存在するか確認
    const existingIcon = document.querySelector(
      `.nf-folder-icon[data-project-id="${projectId}"]`
    );
    if (existingIcon) {
      return; // 実際に存在する場合のみスキップ
    }
    // DOMに存在しない場合は再注入するためSetから削除
    processedProjects.delete(projectId);
  }

  // すでにフォルダアイコンが注入済みならスキップ
  const parentElement = emojiElement.parentElement;
  if (!parentElement) {
    return;
  }

  if (parentElement.querySelector('.nf-folder-icon')) {
    processedProjects.add(projectId);
    return;
  }

  // ピン留めアイコンを作成
  const project = getCachedProject(projectId);
  const isPinned = project?.pinned === true;

  const pinIcon = document.createElement('button');
  pinIcon.className = 'nf-pin-icon';
  if (isPinned) {
    pinIcon.classList.add('pinned');
    pinIcon.textContent = '★';
    pinIcon.setAttribute('title', 'ピン留め解除');
  } else {
    pinIcon.textContent = '☆';
    pinIcon.setAttribute('title', 'ピン留め');
  }
  pinIcon.setAttribute('data-project-id', projectId);
  pinIcon.setAttribute('aria-label', 'ピン留め');

  // ピンアイコンのクリックイベント
  pinIcon.addEventListener('click', (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    togglePinProject(projectId);
  }, { capture: true });
  pinIcon.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, { capture: true });
  pinIcon.addEventListener('mouseup', (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, { capture: true });

  // フォルダアイコンを作成
  const folderIcon = document.createElement('button');
  folderIcon.className = 'nf-folder-icon';
  folderIcon.textContent = '📁';
  folderIcon.setAttribute('data-project-id', projectId);
  folderIcon.setAttribute('aria-label', 'タグを管理');
  folderIcon.setAttribute('title', 'タグを管理');

  // 絵文字アイコンの次にピンアイコン、フォルダアイコンの順に挿入
  if (emojiElement.nextSibling) {
    parentElement.insertBefore(pinIcon, emojiElement.nextSibling);
    parentElement.insertBefore(folderIcon, pinIcon.nextSibling);
  } else {
    parentElement.appendChild(pinIcon);
    parentElement.appendChild(folderIcon);
  }

  processedProjects.add(projectId);

  // クリックイベント（キャプチャフェーズで処理して確実にイベントを捕捉）
  const handleClick = (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    showTagPopover(folderIcon, projectId);
  };

  // 複数のイベントタイプでキャッチして確実に動作させる
  folderIcon.addEventListener('click', handleClick, { capture: true });
  folderIcon.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, { capture: true });
  folderIcon.addEventListener('mouseup', (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
  }, { capture: true });

  // インラインバッジを注入
  const badges = createInlineBadges(projectId);
  if (badges && folderIcon.nextSibling) {
    parentElement.insertBefore(badges, folderIcon.nextSibling);
  } else if (badges) {
    parentElement.appendChild(badges);
  }

  // フォルダアイコンの状態を更新
  refreshProjectUI(projectId);
}

/**
 * ページ内の全プロジェクトにフォルダアイコンを注入する
 */
function injectAllFolderIcons() {
  // プロジェクトの絵文字アイコンを持つ要素を全て検索
  const emojiElements = document.querySelectorAll(EMOJI_SELECTOR);

  emojiElements.forEach((emojiElement) => {
    injectFolderIcon(emojiElement);
  });
}

// ========================================
// フィルターUI
// ========================================

// フィルタータイプ定義
const FilterType = {
  TAG: 'tag',           // 特定タグでフィルター
  TAG_PARENT: 'tagParent',  // 親タグでフィルター（子を含む）
  UNTAGGED: 'untagged', // タグなしプロジェクト
  TEXT: 'text',         // テキスト検索
  PINNED: 'pinned'      // ピン留めのみ
};

// 現在適用中のフィルター配列
let currentFilters = [];

// 現在選択中のフィルタータグ（後方互換性）
let selectedFilterTags = [];

// 現在のソート設定
let currentSortType = 'default';

// フィルターUIが注入済みかどうか
let filterUIInjected = false;

// 元のカード順序を保持
let originalCardOrder = [];

/**
 * フィルターUIの配置先要素を検出する
 * @returns {HTMLElement|null}
 */
function findFilterTargetElement() {
  // 新: all-projects-containerを優先検索
  const allProjectsContainer = document.querySelector(NOTEBOOKLM_SELECTORS.allProjectsContainer);
  if (allProjectsContainer) return allProjectsContainer;

  // フォールバック: project-actions-container
  const projectActionsContainer = document.querySelector(NOTEBOOKLM_SELECTORS.projectActionsContainer);
  if (projectActionsContainer) return projectActionsContainer;

  // フォールバック: mat-button-toggle-group（タブバー）
  const toggleGroup = document.querySelector(NOTEBOOKLM_SELECTORS.projectSectionToggle);
  if (toggleGroup) return toggleGroup;

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

/**
 * プロジェクトカード要素を取得
 * @returns {NodeList}
 */
function getProjectCards() {
  // mat-cardクラスを持つプロジェクトカードを検索
  return document.querySelectorAll(NOTEBOOKLM_SELECTORS.projectCard);
}

/**
 * 元のカード順序を保存
 * @param {boolean} force - trueの場合、既存の配列があっても強制更新
 */
function saveOriginalCardOrder(force = false) {
  const cards = Array.from(getProjectCards());
  if (cards.length > 0 && (force || originalCardOrder.length === 0)) {
    originalCardOrder = cards;
  }
}

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

/**
 * カードからプロジェクトIDを抽出
 * @param {HTMLElement} card - プロジェクトカード要素
 * @returns {string|null} プロジェクトID
 */
function extractProjectIdFromCard(card) {
  const emojiEl = card.querySelector(EMOJI_SELECTOR);
  if (!emojiEl) return null;
  return extractProjectIdFromEmoji(emojiEl);
}

/**
 * 構造化フィルターを適用
 */
function applyFilters() {
  const cards = originalCardOrder.length > 0
    ? originalCardOrder
    : Array.from(getProjectCards());

  if (cards.length === 0) return;

  // フィルターが空なら全表示
  if (currentFilters.length === 0) {
    cards.forEach(card => {
      const gridItem = card.closest(NOTEBOOKLM_SELECTORS.projectCardContainer) || card;
      gridItem.style.display = '';
    });
    sortProjects(currentSortType);
    return;
  }

  cards.forEach(card => {
    const projectId = extractProjectIdFromCard(card);
    const project = getCachedProject(projectId);
    const gridItem = card.closest(NOTEBOOKLM_SELECTORS.projectCardContainer) || card;

    // 全てのフィルター条件を満たすかチェック
    const visible = currentFilters.every(filter => {
      switch (filter.type) {
        case FilterType.TAG:
          return project?.tags?.includes(filter.value);

        case FilterType.TAG_PARENT:
          // 親タグ選択時は子タグも含める
          return project?.tags?.some(t =>
            t === filter.value || t.startsWith(filter.value + HIERARCHY_SEPARATOR)
          );

        case FilterType.UNTAGGED:
          return !project?.tags?.length;

        case FilterType.TEXT:
          return project?.name?.toLowerCase().includes(filter.value.toLowerCase());

        case FilterType.PINNED:
          return project?.pinned === true;

        default:
          return true;
      }
    });

    gridItem.style.display = visible ? '' : 'none';
  });

  sortProjects(currentSortType);
}

/**
 * フィルターを追加
 * @param {string} type - フィルタータイプ
 * @param {*} value - フィルター値
 */
function addFilter(type, value) {
  // 同じフィルターが既にあるかチェック
  const exists = currentFilters.some(f => f.type === type && f.value === value);
  if (!exists) {
    currentFilters.push({ type, value });
  }
}

/**
 * フィルターを削除
 * @param {string} type - フィルタータイプ
 * @param {*} value - フィルター値
 */
function removeFilter(type, value) {
  currentFilters = currentFilters.filter(f => !(f.type === type && f.value === value));
}

/**
 * 全フィルターをクリア
 */
function clearAllFilters() {
  currentFilters = [];
  selectedFilterTags = [];  // 後方互換性
}

/**
 * プロジェクトをタグでフィルタリング（後方互換性のためのラッパー）
 * @param {string[]} tags - フィルターするタグ（空配列なら全表示）
 */
function filterProjectsByTags(tags) {
  // 既存のタグフィルターをクリア
  currentFilters = currentFilters.filter(f => f.type !== FilterType.TAG);

  // 新しいタグフィルターを追加
  for (const tag of tags) {
    addFilter(FilterType.TAG, tag);
  }

  // 構造化フィルターを適用
  applyFilters();
}

/**
 * プロジェクトカードからプロジェクト名を取得
 * @param {HTMLElement} card
 * @returns {string}
 */
function getProjectName(card) {
  // プロジェクト名を含む要素を探す
  const titleEl = card.querySelector(NOTEBOOKLM_SELECTORS.projectTitleFallback);
  if (titleEl) {
    return titleEl.textContent.trim();
  }
  // フォールバック: カード内のテキストを取得
  return card.textContent.trim().slice(0, 50);
}

/**
 * プロジェクトをソート
 * @param {string} sortType - ソートタイプ ('default', 'name-asc', 'name-desc', 'tags-desc')
 */
function sortProjects(sortType) {
  currentSortType = sortType;

  // 元の順序を基準にする
  const allCards = originalCardOrder.length > 0
    ? originalCardOrder
    : Array.from(getProjectCards());

  if (allCards.length === 0) return;

  // カードにソート用のデータを付与
  const cardsWithData = allCards.map(card => {
    const emojiEl = card.querySelector(EMOJI_SELECTOR);
    const idVal = emojiEl ? extractProjectIdFromEmoji(emojiEl) : '';
    const project = getCachedProject(idVal);
    const nameVal = getProjectName(card);
    const tagsVal = project?.tags || [];
    const pinnedVal = project?.pinned === true;
    return { card, id: idVal, name: nameVal, tags: tagsVal, pinned: pinnedVal };
  });

  // ソート（ピン留めを常に優先）
  cardsWithData.sort((a, b) => {
    // ピン留めを最優先
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    // ピン留め同士 or 非ピン留め同士の場合、sortTypeに応じてソート
    switch (sortType) {
      case 'name-asc':
        return a.name.localeCompare(b.name, 'ja');
      case 'name-desc':
        return b.name.localeCompare(a.name, 'ja');
      case 'tags-desc':
        return b.tags.length - a.tags.length;
      default:
        // デフォルト順は元の順序を維持（インデックスで比較）
        return 0;
    }
  });

  // CSS orderプロパティで順序を制御（project-button要素に適用）
  cardsWithData.forEach((item, index) => {
    const gridItem = item.card.closest(NOTEBOOKLM_SELECTORS.projectCardContainer) || item.card;
    gridItem.style.order = index;
  });
}

/**
 * ソートドロップダウンを表示
 * @param {HTMLElement} button
 */
function showSortDropdown(button) {
  // 既存のドロップダウンを削除
  const existing = document.querySelector('.nf-sort-dropdown');
  if (existing) {
    existing.remove();
    return;
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'nf-sort-dropdown';

  const sortOptions = [
    { value: 'default', label: 'デフォルト' },
    { value: 'name-asc', label: '名前順 (A→Z)' },
    { value: 'name-desc', label: '名前順 (Z→A)' },
    { value: 'tags-desc', label: 'タグ数 (多→少)' }
  ];

  sortOptions.forEach(option => {
    const item = document.createElement('div');
    item.className = 'nf-sort-item';
    item.setAttribute('data-value', option.value);
    item.setAttribute('data-label', option.label);
    item.setAttribute('tabindex', '-1');
    if (currentSortType === option.value) {
      item.classList.add('selected');
    }

    const radio = document.createElement('span');
    radio.className = 'nf-sort-radio';
    radio.textContent = currentSortType === option.value ? '●' : '○';

    const label = document.createElement('span');
    label.textContent = option.label;

    item.appendChild(radio);
    item.appendChild(label);

    item.addEventListener('click', () => {
      sortProjects(option.value);
      // ボタンのテキストを更新
      button.textContent = `📊 ${option.label} ▼`;
      dropdown.remove();
    });

    dropdown.appendChild(item);
  });

  // ドロップダウンをフォーカス可能に
  dropdown.setAttribute('tabindex', '-1');

  // 位置を計算
  const rect = button.getBoundingClientRect();
  dropdown.style.position = 'fixed';
  dropdown.style.top = `${rect.bottom + 4}px`;
  dropdown.style.left = `${rect.left}px`;

  document.body.appendChild(dropdown);

  // フォーカスをドロップダウンに設定
  dropdown.focus();

  // キーボードナビゲーションをセットアップ
  const closeDropdown = () => dropdown.remove();
  setupKeyboardNavigation(
    dropdown,
    '.nf-sort-item',
    (item) => {
      // アイテムをクリックしたのと同じ動作
      item.click();
    },
    closeDropdown,
    null,  // focusTarget（ドロップダウン自体を使用）
    (shiftKey) => {
      // Tab/Shift+Tab: フィルターボタンへ戻る（ソートボタンは削除済み）
      closeDropdown();
      document.querySelector('[data-nf-button="filter"]')?.focus();
    }
  );

  // 外側クリックで閉じる
  const handleClickOutside = (e) => {
    if (!dropdown.contains(e.target) && !button.contains(e.target)) {
      dropdown.remove();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 0);
}

/**
 * フィルターUIを更新（選択中フィルターの表示）
 */
function updateFilterUI() {
  const selectedContainer = document.querySelector('.nf-filter-selected');
  if (!selectedContainer) return;

  selectedContainer.innerHTML = '';

  // アクティブなフィルターがあるかチェック
  const hasActiveFilters = currentFilters.length > 0 || selectedFilterTags.length > 0;

  if (!hasActiveFilters) {
    const placeholder = document.createElement('span');
    placeholder.className = 'nf-filter-placeholder';
    placeholder.textContent = 'フィルターを選択';
    selectedContainer.appendChild(placeholder);
    return;
  }

  // 検索フィルターを表示
  const textFilter = currentFilters.find(f => f.type === FilterType.TEXT);
  if (textFilter) {
    const badge = document.createElement('span');
    badge.className = 'nf-filter-badge nf-filter-badge-text';
    badge.textContent = `🔍 "${textFilter.value}"`;

    const removeBtn = document.createElement('button');
    removeBtn.className = 'nf-filter-badge-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFilter(FilterType.TEXT, textFilter.value);
      const searchInput = document.querySelector('.nf-search-input');
      if (searchInput) searchInput.value = '';
      applyFilters();
      updateFilterUI();
    });

    badge.appendChild(removeBtn);
    selectedContainer.appendChild(badge);
  }

  // 「タグなし」フィルターを表示
  const untaggedFilter = currentFilters.find(f => f.type === FilterType.UNTAGGED);
  if (untaggedFilter) {
    const badge = document.createElement('span');
    badge.className = 'nf-filter-badge nf-filter-badge-untagged';
    badge.textContent = '📂 タグなし';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'nf-filter-badge-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFilter(FilterType.UNTAGGED, true);
      applyFilters();
      updateFilterUI();
    });

    badge.appendChild(removeBtn);
    selectedContainer.appendChild(badge);
  }

  // ピン留めフィルターを表示
  const pinnedFilter = currentFilters.find(f => f.type === FilterType.PINNED);
  if (pinnedFilter) {
    const badge = document.createElement('span');
    badge.className = 'nf-filter-badge nf-filter-badge-pinned';
    badge.textContent = '★ ピン留め';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'nf-filter-badge-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFilter(FilterType.PINNED, true);
      applyFilters();
      updateFilterUI();
    });

    badge.appendChild(removeBtn);
    selectedContainer.appendChild(badge);
  }

  // タグフィルターを表示
  selectedFilterTags.forEach(tag => {
    const badge = document.createElement('span');
    badge.className = 'nf-filter-badge';
    badge.textContent = tag;

    // タグの色を適用
    const color = getTagColor(tag);
    if (color) {
      badge.style.backgroundColor = color;
      badge.style.color = getContrastColor(color);
    }

    const removeBtn = document.createElement('button');
    removeBtn.className = 'nf-filter-badge-remove';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedFilterTags = selectedFilterTags.filter(t => t !== tag);
      updateFilterUI();
      filterProjectsByTags(selectedFilterTags);
    });

    badge.appendChild(removeBtn);
    selectedContainer.appendChild(badge);
  });

  // クリアボタン
  const clearBtn = document.createElement('button');
  clearBtn.className = 'nf-filter-clear';
  clearBtn.textContent = 'クリア';
  clearBtn.addEventListener('click', () => {
    selectedFilterTags = [];
    clearAllFilters();
    const searchInput = document.querySelector('.nf-search-input');
    if (searchInput) searchInput.value = '';
    applyFilters();
    updateFilterUI();
  });
  selectedContainer.appendChild(clearBtn);
}

/**
 * タグ選択ドロップダウンを表示
 * @param {HTMLElement} button - ドロップダウンボタン
 */
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

  await syncCacheAndRefreshUI();

  // キャッシュからタグを取得
  const allTags = getCachedAllTags();

  // 展開状態を取得
  let expandedTags = await getExpandedTags();

  // 検索入力欄を追加
  const searchContainer = document.createElement('div');
  searchContainer.className = 'nf-dropdown-search';

  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'nf-dropdown-search-input';
  searchInput.placeholder = '🔍 タグを検索...';

  searchContainer.appendChild(searchInput);
  dropdown.appendChild(searchContainer);

  // タグリストコンテナ
  const tagListContainer = document.createElement('div');
  tagListContainer.className = 'nf-dropdown-list';

  // 高さを設定（storageから取得）
  const savedHeight = await getDropdownHeight();
  tagListContainer.style.height = `${savedHeight}px`;

  dropdown.appendChild(tagListContainer);

  // リサイズハンドル
  const resizeHandle = document.createElement('div');
  resizeHandle.className = 'nf-dropdown-resize-handle';
  dropdown.appendChild(resizeHandle);

  // リサイズ処理
  let isResizing = false;
  let startY = 0;
  let startHeight = 0;

  const handleMouseMove = (e) => {
    if (!isResizing) return;
    const deltaY = e.clientY - startY;
    const newHeight = Math.max(MIN_DROPDOWN_HEIGHT, Math.min(MAX_DROPDOWN_HEIGHT, startHeight + deltaY));
    tagListContainer.style.height = `${newHeight}px`;
  };

  const handleMouseUp = async () => {
    if (!isResizing) return;
    isResizing = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    // 高さを保存
    const currentHeight = parseInt(tagListContainer.style.height, 10);
    await saveDropdownHeight(currentHeight);
  };

  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    startY = e.clientY;
    startHeight = parseInt(tagListContainer.style.height, 10) || savedHeight;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  });

  // 固定オプションコンテナ（ツールバー形式）
  const fixedOptionsContainer = document.createElement('div');
  fixedOptionsContainer.className = 'nf-dropdown-fixed-options';

  const toolbar = document.createElement('div');
  toolbar.className = 'nf-dropdown-toolbar';

  // --- インラインソートセレクター ---
  const sortSelector = document.createElement('div');
  sortSelector.className = 'nf-inline-sort-selector';

  const sortBtn = document.createElement('button');
  sortBtn.className = 'nf-inline-sort-btn';
  const sortOptions = [
    { value: 'default', label: 'デフォルト' },
    { value: 'name-asc', label: '名前順 (A→Z)' },
    { value: 'name-desc', label: '名前順 (Z→A)' },
    { value: 'tags-desc', label: 'タグ数 (多→少)' }
  ];
  const currentSortOption = sortOptions.find(o => o.value === currentSortType) || sortOptions[0];
  sortBtn.textContent = `📊 ${currentSortOption.label} ▼`;

  const sortMenu = document.createElement('div');
  sortMenu.className = 'nf-inline-sort-menu';
  sortMenu.style.display = 'none';

  sortOptions.forEach(option => {
    const item = document.createElement('div');
    item.className = 'nf-inline-sort-option';
    if (currentSortType === option.value) {
      item.classList.add('selected');
    }

    const radio = document.createElement('span');
    radio.className = 'nf-inline-sort-radio';
    radio.textContent = currentSortType === option.value ? '●' : '○';

    const label = document.createElement('span');
    label.textContent = option.label;

    item.appendChild(radio);
    item.appendChild(label);

    item.addEventListener('click', (e) => {
      e.stopPropagation();
      sortProjects(option.value);
      sortBtn.textContent = `📊 ${option.label} ▼`;
      sortMenu.style.display = 'none';
      sortBtn.classList.remove('active');
      // 選択状態を更新
      sortMenu.querySelectorAll('.nf-inline-sort-option').forEach(opt => {
        opt.classList.remove('selected');
        opt.querySelector('.nf-inline-sort-radio').textContent = '○';
      });
      item.classList.add('selected');
      radio.textContent = '●';
    });

    sortMenu.appendChild(item);
  });

  sortBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isVisible = sortMenu.style.display !== 'none';
    sortMenu.style.display = isVisible ? 'none' : 'block';
    sortBtn.classList.toggle('active', !isVisible);
  });

  sortSelector.appendChild(sortBtn);
  sortSelector.appendChild(sortMenu);
  toolbar.appendChild(sortSelector);

  // --- セパレーター1 ---
  const separator1 = document.createElement('span');
  separator1.className = 'nf-toolbar-separator';
  separator1.textContent = '|';
  toolbar.appendChild(separator1);

  // --- 「タグなし」オプション（コンパクト版） ---
  const untaggedItem = document.createElement('div');
  untaggedItem.className = 'nf-toolbar-untagged';
  untaggedItem.setAttribute('tabindex', '-1');
  untaggedItem.textContent = '📂 タグなし';

  const updateUntaggedUI = () => {
    const isUntaggedActive = currentFilters.some(f => f.type === FilterType.UNTAGGED);
    untaggedItem.classList.toggle('selected', isUntaggedActive);
  };
  updateUntaggedUI();

  untaggedItem.addEventListener('click', (e) => {
    e.stopPropagation();
    const isUntaggedActive = currentFilters.some(f => f.type === FilterType.UNTAGGED);
    if (isUntaggedActive) {
      removeFilter(FilterType.UNTAGGED, true);
    } else {
      currentFilters = currentFilters.filter(f => f.type !== FilterType.TAG);
      selectedFilterTags = [];
      addFilter(FilterType.UNTAGGED, true);
    }
    applyFilters();
    updateFilterUI();
    updateUntaggedUI();
    renderTagList(searchInput.value);
  });

  toolbar.appendChild(untaggedItem);

  // --- セパレーター2 ---
  const separator2 = document.createElement('span');
  separator2.className = 'nf-toolbar-separator';
  separator2.textContent = '|';
  toolbar.appendChild(separator2);

  // --- ルートへ移動ドロップゾーン（コンパクト版） ---
  const rootDropZone = document.createElement('div');
  rootDropZone.className = 'nf-toolbar-root';
  rootDropZone.textContent = '📁 ルートへ';
  rootDropZone.setAttribute('tabindex', '-1');

  rootDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    const draggingTag = dropdown.getAttribute('data-dragging-tag');
    if (draggingTag && draggingTag.includes(HIERARCHY_SEPARATOR)) {
      e.dataTransfer.dropEffect = 'move';
      rootDropZone.classList.add('nf-drop-target');
    }
  });

  rootDropZone.addEventListener('dragleave', () => {
    rootDropZone.classList.remove('nf-drop-target');
  });

  rootDropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    rootDropZone.classList.remove('nf-drop-target');
    const draggingTag = e.dataTransfer.getData('text/plain');
    if (draggingTag && draggingTag.includes(HIERARCHY_SEPARATOR)) {
      const success = await moveTagToParent(draggingTag, null);
      if (success) {
        renderTagList(searchInput.value);
        refreshVisibleProjectUI();
        triggerUIRefresh();
      }
    }
  });

  toolbar.appendChild(rootDropZone);

  fixedOptionsContainer.appendChild(toolbar);

  // 固定オプションコンテナをsearchContainerの後に挿入
  dropdown.insertBefore(fixedOptionsContainer, tagListContainer);

  // タグリストを描画する関数（階層表示対応）
  const renderTagList = (filterText = '') => {
    tagListContainer.innerHTML = '';

    // 毎回最新のタグリストをキャッシュから取得
    const currentTags = getCachedAllTags();

    // タグ使用統計を計算
    const usageCounts = {};
    for (const [id, project] of cache.projects) {
      if (project.tags) {
        for (const tag of project.tags) {
          usageCounts[tag] = (usageCounts[tag] || 0) + 1;
        }
      }
    }

    let filteredTags = currentTags;
    if (filterText) {
      // 検索時はフラット表示
      filteredTags = currentTags.filter(tag =>
        tag.toLowerCase().includes(filterText.toLowerCase())
      );
    }

    // 固定オプションの表示/非表示（検索時は非表示）
    if (filterText) {
      fixedOptionsContainer.style.display = 'none';
    } else {
      fixedOptionsContainer.style.display = '';
      // 「タグなし」の選択状態を更新
      updateUntaggedUI();
    }

    if (filteredTags.length === 0 && !filterText) {
      // 固定オプションのみ表示（タグがない場合）
      return;
    } else if (filteredTags.length === 0) {
      const noTags = document.createElement('div');
      noTags.className = 'nf-dropdown-empty';
      noTags.textContent = '一致するタグがありません';
      tagListContainer.appendChild(noTags);
      return;
    }

    // タグ選択をトグルする関数
    const toggleTagSelection = (item, tag, checkbox) => {
      if (selectedFilterTags.includes(tag)) {
        selectedFilterTags = selectedFilterTags.filter(t => t !== tag);
        item.classList.remove('selected');
        checkbox.textContent = '';
      } else {
        selectedFilterTags.push(tag);
        item.classList.add('selected');
        checkbox.textContent = '✓';
      }
      updateFilterUI();
      filterProjectsByTags(selectedFilterTags);
    };

    // タグアイテムを作成する関数
    const createTagItem = (tag, depth = 0, isSearchMode = false) => {
      const item = document.createElement('div');
      item.className = 'nf-dropdown-item';
      item.setAttribute('data-tag', tag);
      item.setAttribute('tabindex', '-1');
      item.setAttribute('draggable', 'true');

      // 階層深度に応じたインデント（展開ボタン用に少し増加）
      if (depth > 0) {
        item.classList.add('nf-tag-tree-item');
        item.style.paddingLeft = `${16 + depth * 20}px`;
      }

      if (selectedFilterTags.includes(tag)) {
        item.classList.add('selected');
      }

      // 子タグがあるかチェック（先に判定）
      const hasChildren = currentTags.some(t =>
        t !== tag && t.startsWith(tag + HIERARCHY_SEPARATOR)
      );
      if (hasChildren) {
        item.classList.add('has-children');
      }

      // 展開/折りたたみボタン（親タグのみ、検索モードでは非表示）
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

      // 色インジケーター
      const colorIndicator = document.createElement('span');
      colorIndicator.className = 'nf-tag-color-indicator';
      const tagColor = getTagColor(tag);
      if (tagColor) {
        colorIndicator.style.backgroundColor = tagColor;
      } else {
        colorIndicator.classList.add('no-color');
      }

      const checkbox = document.createElement('span');
      checkbox.className = 'nf-dropdown-checkbox';
      checkbox.textContent = selectedFilterTags.includes(tag) ? '✓' : '';

      const label = document.createElement('span');
      label.className = 'nf-dropdown-item-label';
      // 階層タグの場合は最後の部分のみ表示（検索時以外）
      if (!filterText && depth > 0) {
        const parts = tag.split(HIERARCHY_SEPARATOR);
        label.textContent = parts[parts.length - 1];
      } else {
        label.textContent = tag;
      }

      // 削除ボタン
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'nf-tag-delete-btn';
      deleteBtn.textContent = '×';
      deleteBtn.setAttribute('title', hasChildren ? 'タグと子タグを削除' : 'タグを削除');
      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const success = await removeTagFromAllProjects(tag);
        if (success) {
          selectedFilterTags = selectedFilterTags.filter(t => t !== tag && !t.startsWith(tag + HIERARCHY_SEPARATOR));
          updateFilterUI();
          filterProjectsByTags(selectedFilterTags);
          renderTagList(searchInput.value);
          refreshVisibleProjectUI();
          // ポップオーバーも更新
          triggerUIRefresh();
        }
      });

      // 使用統計カウント
      const countSpan = document.createElement('span');
      countSpan.className = 'nf-tag-count';
      const count = usageCounts[tag] || 0;
      countSpan.textContent = `(${count})`;

      item.appendChild(colorIndicator);
      item.appendChild(checkbox);
      item.appendChild(label);
      item.appendChild(countSpan);
      item.appendChild(deleteBtn);

      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('nf-tag-delete-btn')) {
          toggleTagSelection(item, tag, checkbox);
        }
      });

      // ドラッグ&ドロップイベント
      let draggedTag = null;

      item.addEventListener('dragstart', (e) => {
        draggedTag = tag;
        e.dataTransfer.setData('text/plain', tag);
        e.dataTransfer.effectAllowed = 'move';
        item.classList.add('nf-dragging');
        // ドラッグ中に他のアイテムにスタイルを適用するためのグローバル変数
        dropdown.setAttribute('data-dragging-tag', tag);
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('nf-dragging');
        dropdown.removeAttribute('data-dragging-tag');
        // 全てのドロップターゲットスタイルを削除
        dropdown.querySelectorAll('.nf-drop-target').forEach(el => {
          el.classList.remove('nf-drop-target');
        });
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        const draggingTag = dropdown.getAttribute('data-dragging-tag');
        // 自分自身や自分の子孫にはドロップ不可
        if (draggingTag &&
            tag !== draggingTag &&
            !tag.startsWith(draggingTag + HIERARCHY_SEPARATOR)) {
          e.dataTransfer.dropEffect = 'move';
          item.classList.add('nf-drop-target');
        }
      });

      item.addEventListener('dragleave', (e) => {
        // 子要素への移動でイベントが発火するのを防ぐ
        if (!item.contains(e.relatedTarget)) {
          item.classList.remove('nf-drop-target');
        }
      });

      item.addEventListener('drop', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        item.classList.remove('nf-drop-target');
        const draggingTag = e.dataTransfer.getData('text/plain');
        if (draggingTag && draggingTag !== tag) {
          const success = await moveTagToParent(draggingTag, tag);
          if (success) {
            renderTagList(searchInput.value);
            refreshVisibleProjectUI();
            // ポップオーバーも更新
            triggerUIRefresh();
          }
        }
      });

      return item;
    };

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

        // 展開状態に応じて子タグを表示
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
      // 検索時はフラット表示（全展開、展開ボタン非表示）
      filteredTags.forEach(tag => {
        tagListContainer.appendChild(createTagItem(tag, 0, true));  // isSearchMode = true
      });
    }
  };

  // 初期描画
  renderTagList();
  // グローバルUI更新コールバックを登録
  uiUpdateCallbacks.dropdown = () => renderTagList(searchInput.value);

  // 検索入力イベント
  searchInput.addEventListener('input', () => {
    renderTagList(searchInput.value);
  });

  // キーボードナビゲーションをセットアップ
  const closeDropdown = () => {
    // リサイズ関連のイベントリスナーをクリーンアップ
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    dropdown.remove();
    uiUpdateCallbacks.dropdown = null;
  };
  setupKeyboardNavigation(
    dropdown,
    '.nf-dropdown-item, .nf-root-drop-zone',
    (item) => {
      // アイテムをクリックしたのと同じ動作
      item.click();
    },
    closeDropdown,
    searchInput,  // 検索入力欄でキーイベントを監視
    (shiftKey) => {
      // Tab/Shift+Tab: フィルターボタンへ戻る（ソートボタンは削除済み）
      closeDropdown();
      document.querySelector('[data-nf-button="filter"]')?.focus();
    }
  );

  // 位置を計算
  const rect = button.getBoundingClientRect();
  dropdown.style.position = 'fixed';

  // 下方向のスペースを確認
  const spaceBelow = window.innerHeight - rect.bottom;
  const dropdownHeight = Math.min(240, allTags.length * 40 + 20); // 推定高さ

  if (spaceBelow < dropdownHeight && rect.top > dropdownHeight) {
    // 上に表示
    dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    dropdown.style.top = 'auto';
  } else {
    // 下に表示
    dropdown.style.top = `${rect.bottom + 4}px`;
    dropdown.style.bottom = 'auto';
  }

  dropdown.style.left = `${rect.left}px`;

  // 右端をはみ出さないように調整
  document.body.appendChild(dropdown);
  const dropdownRect = dropdown.getBoundingClientRect();
  if (dropdownRect.right > window.innerWidth) {
    dropdown.style.left = `${window.innerWidth - dropdownRect.width - 8}px`;
  }

  // 検索入力欄にフォーカスを設定（キーボードナビゲーションを即座に有効化）
  searchInput.focus();

  // 外側クリックで閉じる
  const handleClickOutside = (e) => {
    if (!dropdown.contains(e.target) && !button.contains(e.target)) {
      closeDropdown();
      document.removeEventListener('click', handleClickOutside);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', handleClickOutside);
  }, 0);
}

/**
 * フィルターUIを注入
 */
function injectFilterUI() {
  const existingFilterUI = document.querySelector('.nf-filter-container');
  if (filterUIInjected && existingFilterUI) return;
  if (!existingFilterUI) {
    filterUIInjected = false;
  }

  const targetElement = findFilterTargetElement();
  if (!targetElement) {
    return;
  }

  // フィルターUIコンテナ（コンパクト版）
  const filterContainer = document.createElement('div');
  filterContainer.className = 'nf-filter-container';

  // プロジェクト名検索入力欄
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.className = 'nf-search-input';
  searchInput.placeholder = '🔍 検索...';
  searchInput.setAttribute('data-nf-input', 'search');

  // デバウンス付き検索処理
  const handleSearch = debounce(() => {
    const value = searchInput.value.trim();
    // 既存のテキストフィルターを削除
    currentFilters = currentFilters.filter(f => f.type !== FilterType.TEXT);
    if (value) {
      addFilter(FilterType.TEXT, value);
    }
    applyFilters();
    updateFilterUI();
  }, 300);

  searchInput.addEventListener('input', handleSearch);

  // Escapeキーで検索をクリア
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      searchInput.value = '';
      currentFilters = currentFilters.filter(f => f.type !== FilterType.TEXT);
      applyFilters();
      updateFilterUI();
    }
  });

  // タグフィルターボタン
  const filterButton = document.createElement('button');
  filterButton.className = 'nf-filter-button';
  filterButton.setAttribute('data-nf-button', 'filter');
  filterButton.innerHTML = '🏷️ タグ ▼';
  filterButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showTagDropdown(filterButton);
  });

  // 選択中タグ表示エリア
  const selectedContainer = document.createElement('div');
  selectedContainer.className = 'nf-filter-selected';

  filterContainer.appendChild(searchInput);
  filterContainer.appendChild(filterButton);
  // ソートボタンはタグドロップダウン内に統合したため削除
  filterContainer.appendChild(selectedContainer);

  // 挿入位置の決定
  if (targetElement.matches(NOTEBOOKLM_SELECTORS.allProjectsContainer)) {
    // all-projects-containerの場合は直前に挿入
    targetElement.parentNode.insertBefore(filterContainer, targetElement);
  } else if (targetElement.matches(NOTEBOOKLM_SELECTORS.projectSectionToggle)) {
    // mat-button-toggle-groupの場合は直後に挿入
    targetElement.parentNode.insertBefore(filterContainer, targetElement.nextSibling);
  } else {
    // フォールバック: ヘッダーの後に挿入
    targetElement.parentNode.insertBefore(filterContainer, targetElement.nextSibling);
  }

  filterUIInjected = true;
}

// ========================================
// MutationObserver（動的コンテンツ対応）
// ========================================

/**
 * DOM変更を監視し、新しいプロジェクトが追加されたらアイコンを注入する
 */
function observeProjectList() {
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (node.nodeType !== Node.ELEMENT_NODE) return;

        // 追加されたノード自体が絵文字アイコンの場合
        if (node.id && node.id.match(/^project-.+-emoji$/)) {
          injectFolderIcon(node);
        }

        // 追加されたノードの子孫に絵文字アイコンがある場合
        if (node.querySelectorAll) {
          const emojiElements = node.querySelectorAll(EMOJI_SELECTOR);
          if (emojiElements.length > 0) {
            emojiElements.forEach((emojiElement) => {
              injectFolderIcon(emojiElement);
            });
          }
        }
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return observer;
}

/**
 * セクション切り替えボタン（全て/マイノートブック等）の監視をセットアップ
 * 画面切り替え時にフォルダアイコンを再注入する
 */
function setupSectionToggleListener() {
  // mat-button-toggle-groupを監視
  const toggleGroup = document.querySelector(NOTEBOOKLM_SELECTORS.projectSectionToggle);
  if (!toggleGroup) {
    // 見つからない場合は遅延して再試行
    setTimeout(setupSectionToggleListener, 1000);
    return;
  }

  // 要素単位でリスナー設定済みかチェック（重複防止）
  if (toggleGroup.dataset.nfListenerAttached) return;
  toggleGroup.dataset.nfListenerAttached = 'true';

  // クリックイベントを監視（キャプチャフェーズで）
  toggleGroup.addEventListener('click', () => {
    // DOM参照をリセット（古いカード参照を破棄）
    originalCardOrder = [];

    // 少し遅延してからフォルダアイコンを再注入（DOMの更新を待つ）
    setTimeout(() => {
      saveOriginalCardOrder(true);  // 強制更新
      injectAllFolderIcons();
      refreshVisibleProjectUI();
      applyFilters();  // フィルター再適用
    }, 300);

    // さらに遅延して再度チェック（SPAの遅延読み込み対応）
    setTimeout(() => {
      saveOriginalCardOrder(true);  // 強制更新
      injectAllFolderIcons();
      refreshVisibleProjectUI();
      applyFilters();  // フィルター再適用
    }, 800);
  }, { capture: true });
}

/**
 * 現在のページがプロジェクト一覧ページかどうかを判定
 */
function isProjectListPage() {
  const url = window.location.href;
  return url.includes('notebooklm.google.com') &&
         !url.includes('/notebook/') &&
         !url.includes('/project/');
}

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
        refreshVisibleProjectUI();
      } else if (!existingFilterUI && !targetElement && attempt < maxAttempts) {
        // ターゲット要素がまだない → リトライ
        setTimeout(() => tryReinject(attempt + 1, maxAttempts), 300);
      }
    };

    // 初回は300ms後に開始
    setTimeout(() => tryReinject(), 300);
  }

  // toggleGroup差し替え検知用のMutationObserver
  // SPAでDOMが再生成された場合にリスナーを再設定する
  const toggleGroupObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        // toggleGroupが再生成された場合、リスナーを再設定
        const newToggleGroup = document.querySelector(NOTEBOOKLM_SELECTORS.projectSectionToggle);
        if (newToggleGroup && !newToggleGroup.dataset.nfListenerAttached) {
          setupSectionToggleListener();
        }
      }
    }
  });

  // body全体を監視（subtreeで子孫の変更も検知）
  toggleGroupObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}

/**
 * タブ復帰時にストレージ同期を行う
 */
function setupFocusSync() {
  const handleFocus = () => {
    syncCacheAndRefreshUI();
  };

  window.addEventListener('focus', handleFocus);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      syncCacheAndRefreshUI();
    }
  });
}

// ========================================
// 初期化
// ========================================

/**
 * NoteFolder初期化
 */
function initNoteFolder() {
  // NotebookLMのプロジェクト一覧ページかチェック
  if (!window.location.href.includes('notebooklm.google.com')) {
    return;
  }

  // キャッシュを初期化してからUIを注入
  initCache().then(() => {
    // ストレージ変更リスナーをセットアップ（他タブ同期用）
    setupStorageListener();

    // 既存のプロジェクトにアイコンを注入（複数回試行）
    const tryInject = (attempt = 1, maxAttempts = 5) => {
      injectAllFolderIcons();
      injectFilterUI();
      // 元のカード順序を保存（初回のみ）
      saveOriginalCardOrder();

      // プロジェクトが見つからず、まだ試行回数が残っている場合は再試行
      if (processedProjects.size === 0 && attempt < maxAttempts) {
        setTimeout(() => tryInject(attempt + 1, maxAttempts), 1000);
      }
    };

    // 初回注入を試行
    setTimeout(() => tryInject(), 500);

    // MutationObserverで動的に追加されるプロジェクトを監視
    observeProjectList();

    // セクション切り替えボタンの監視をセットアップ
    setupSectionToggleListener();

    // SPAナビゲーション監視をセットアップ
    setupSPANavigationListener();

    // タブ復帰時の同期をセットアップ
    setupFocusSync();
  });
}

// ページ読み込み完了時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNoteFolder);
} else {
  initNoteFolder();
}
