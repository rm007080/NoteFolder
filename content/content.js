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
// 定数
// ========================================

// プロジェクトの絵文字アイコンのセレクタ
const EMOJI_SELECTOR = '[id^="project-"][id$="-emoji"]';

// 処理済みプロジェクトを追跡するSet
const processedProjects = new Set();

// 階層タグの区切り文字
const HIERARCHY_SEPARATOR = '/';

// 現在のマイグレーションバージョン
const CURRENT_MIGRATION_VERSION = 2;

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
  return new Promise((resolve) => {
    const shardKey = `tagMeta:${getShardKey(tagName)}`;
    chrome.storage.sync.get({ [shardKey]: {} }, (result) => {
      if (chrome.runtime.lastError) {
        console.error('Storage read error:', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      const shard = result[shardKey] || {};
      shard[tagName] = data;
      chrome.storage.sync.set({ [shardKey]: shard }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage write error:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        // キャッシュも更新
        cache.tagMeta[tagName] = data;
        resolve(true);
      });
    });
  });
}

/**
 * tagMetaから特定のタグを削除
 * @param {string} tagName - 削除するタグ名
 * @returns {Promise<boolean>}
 */
async function removeTagMeta(tagName) {
  return new Promise((resolve) => {
    const shardKey = `tagMeta:${getShardKey(tagName)}`;
    chrome.storage.sync.get({ [shardKey]: {} }, (result) => {
      if (chrome.runtime.lastError) {
        console.error('Storage read error:', chrome.runtime.lastError.message);
        resolve(false);
        return;
      }
      const shard = result[shardKey] || {};
      delete shard[tagName];
      chrome.storage.sync.set({ [shardKey]: shard }, () => {
        if (chrome.runtime.lastError) {
          console.error('Storage write error:', chrome.runtime.lastError.message);
          resolve(false);
          return;
        }
        // キャッシュも更新
        delete cache.tagMeta[tagName];
        resolve(true);
      });
    });
  });
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

  // Step 1: allTags → tagMeta への移行
  if (items.allTags && !loadTagMetaFromItems(items)) {
    const tagMetaShards = {};
    for (const tag of items.allTags) {
      const shardKey = `tagMeta:${getShardKey(tag)}`;
      if (!tagMetaShards[shardKey]) {
        tagMetaShards[shardKey] = {};
      }
      tagMetaShards[shardKey][tag] = { color: null };
    }
    // シャード別に保存
    for (const [key, value] of Object.entries(tagMetaShards)) {
      await new Promise((resolve) => {
        chrome.storage.sync.set({ [key]: value }, () => {
          if (chrome.runtime.lastError) {
            console.error('Migration error:', chrome.runtime.lastError.message);
          }
          resolve();
        });
      });
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
    await new Promise((resolve) => {
      chrome.storage.sync.set(projectUpdates, () => {
        if (chrome.runtime.lastError) {
          console.error('Migration error:', chrome.runtime.lastError.message);
        }
        resolve();
      });
    });
  }

  // Step 3: マイグレーション完了フラグ
  await new Promise((resolve) => {
    chrome.storage.sync.set({ _migrationVersion: CURRENT_MIGRATION_VERSION }, () => {
      if (chrome.runtime.lastError) {
        console.error('Migration error:', chrome.runtime.lastError.message);
      }
      resolve();
    });
  });

  cache.migrationDone = true;

  // 更新後のデータを再読み込み
  return new Promise((resolve) => {
    chrome.storage.sync.get(null, (newItems) => {
      if (chrome.runtime.lastError) {
        console.error('Storage read error:', chrome.runtime.lastError.message);
        resolve(items);
        return;
      }
      resolve(newItems);
    });
  });
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

    chrome.storage.sync.get(null, async (items) => {
      if (chrome.runtime.lastError) {
        console.error('Cache init error:', chrome.runtime.lastError.message);
        cache.initialized = true;
        resolve();
        return;
      }

      // マイグレーションを実行
      items = await migrateDataIfNeeded(items);

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

    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key === 'allTags') {
        cache.allTags = newValue || [];
      } else if (key.startsWith('tagMeta:')) {
        // tagMetaシャードの更新
        if (newValue) {
          Object.assign(cache.tagMeta, newValue);
        }
      } else if (key.startsWith('project:')) {
        if (newValue) {
          cache.projects.set(newValue.id, newValue);
        } else {
          // プロジェクトが削除された場合
          const projectId = key.replace('project:', '');
          cache.projects.delete(projectId);
        }
      }
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

  const card = emojiEl.closest('mat-card.project-button-card');
  if (!card) return '';

  const titleEl = card.querySelector(
    '.project-button-title, .mdc-card__title, [data-testid="project-title"]'
  );
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
    chrome.storage.sync.set({ [`project:${projectId}`]: cachedProject }, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage write error:', chrome.runtime.lastError.message);
        return;
      }
      // キャッシュも更新
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
  return new Promise((resolve) => {
    chrome.storage.sync.set(
      { [`project:${projectId}`]: project, allTags: allTags },
      () => {
        if (chrome.runtime.lastError) {
          console.error('Storage write error:', chrome.runtime.lastError.message);
          showToast('タグの追加に失敗しました');
          resolve(false);
          return;
        }
        // SET成功後にキャッシュを更新
        updateCache(projectId, project, allTags);
        resolve(true);
      }
    );
  });
}

/**
 * プロジェクトからタグを削除
 * @param {string} projectId
 * @param {string} tagToRemove
 * @returns {Promise<boolean>}
 */
function removeTagFromProject(projectId, tagToRemove) {
  return new Promise((resolve) => {
    // キャッシュからプロジェクトを取得
    const cachedProject = getCachedProject(projectId);
    if (!cachedProject) {
      resolve(false);
      return;
    }

    // プロジェクトデータをコピーしてタグを削除
    const project = { ...cachedProject };
    project.tags = project.tags.filter(tag => tag !== tagToRemove);
    project.updatedAt = Date.now();

    // 保存
    chrome.storage.sync.set(
      { [`project:${projectId}`]: project },
      () => {
        if (chrome.runtime.lastError) {
          console.error('Storage write error:', chrome.runtime.lastError.message);
          showToast('タグの削除に失敗しました');
          resolve(false);
          return;
        }
        // SET成功後にキャッシュを更新
        updateCache(projectId, project, null);
        resolve(true);
      }
    );
  });
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

  // 子タグがある場合は確認
  if (!skipConfirm && childTags.length > 0) {
    const confirmed = confirm(
      `「${tagToRemove}」を削除すると、子タグ（${childTags.length}個）も削除されます。続行しますか？`
    );
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
  return new Promise((resolve) => {
    chrome.storage.sync.set(updateData, () => {
      if (chrome.runtime.lastError) {
        console.error('Storage write error:', chrome.runtime.lastError.message);
        showToast('タグの削除に失敗しました');
        resolve(false);
        return;
      }

      // キャッシュを更新
      cache.allTags = newAllTags;
      for (const [key, value] of Object.entries(updatedProjects)) {
        const projectId = key.replace('project:', '');
        cache.projects.set(projectId, value);
      }

      const message = childTags.length > 0
        ? `タグ「${tagToRemove}」と子タグ（${childTags.length}個）を削除しました`
        : `タグ「${tagToRemove}」を削除しました`;
      showToast(message);
      resolve(true);
    });
  });
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
  const { showColorPicker = false, onColorChange } = options;

  const badge = document.createElement('span');
  badge.className = 'nf-tag-badge';
  badge.setAttribute('data-tag', tagName);

  // タグの色を適用
  const color = getTagColor(tagName);
  if (color) {
    badge.style.backgroundColor = color;
    // コントラストに応じてテキスト色を調整
    badge.style.color = getContrastColor(color);
  }

  // タグ名テキスト
  const tagText = document.createElement('span');
  tagText.className = 'nf-tag-badge-text';
  tagText.textContent = tagName;
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

    // タグ一覧を更新
    tagsList.innerHTML = '';
    if (projectTags.length === 0) {
      const noTags = document.createElement('span');
      noTags.className = 'nf-no-tags';
      noTags.textContent = 'タグなし';
      tagsList.appendChild(noTags);
    } else {
      projectTags.forEach(tag => {
        const badge = createTagBadge(tag, async () => {
          const success = await removeTagFromProject(projectId, tag);
          if (success) {
            updateUI();
            updateFolderIconState(projectId);
          }
        }, {
          showColorPicker: true,
          onColorChange: () => updateUI()
        });
        tagsList.appendChild(badge);
      });
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
            updateFolderIconState(projectId);
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
        updateFolderIconState(projectId);
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
          updateFolderIconState(projectId);
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

  updateUI();
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
 * フォルダアイコンの状態を更新（タグ有無のインジケーター）
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

  // フォルダアイコンを作成
  const folderIcon = document.createElement('button');
  folderIcon.className = 'nf-folder-icon';
  folderIcon.textContent = '📁';
  folderIcon.setAttribute('data-project-id', projectId);
  folderIcon.setAttribute('aria-label', 'タグを管理');
  folderIcon.setAttribute('title', 'タグを管理');

  // 絵文字アイコンの次に挿入
  if (emojiElement.nextSibling) {
    parentElement.insertBefore(folderIcon, emojiElement.nextSibling);
  } else {
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
  // mat-button-toggle-group（タブバー）を検索
  const toggleGroup = document.querySelector('mat-button-toggle-group.project-section-toggle');
  if (toggleGroup) {
    return toggleGroup;
  }

  // フォールバック: テキストで検索
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
  return document.querySelectorAll('mat-card.project-button-card');
}

/**
 * 元のカード順序を保存
 */
function saveOriginalCardOrder() {
  const cards = Array.from(getProjectCards());
  if (cards.length > 0 && originalCardOrder.length === 0) {
    originalCardOrder = cards;
  }
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
      const gridItem = card.closest('project-button') || card;
      gridItem.style.display = '';
    });
    sortProjects(currentSortType);
    return;
  }

  cards.forEach(card => {
    const projectId = extractProjectIdFromCard(card);
    const project = getCachedProject(projectId);
    const gridItem = card.closest('project-button') || card;

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
  const titleEl = card.querySelector('.project-button-title, .mdc-card__title, [class*="title"]');
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

  // デフォルト順の場合は元の順序（orderをリセット）
  if (sortType === 'default') {
    allCards.forEach((card, index) => {
      // グリッドアイテムであるproject-button要素にorderを適用
      const gridItem = card.closest('project-button') || card;
      gridItem.style.order = index;
    });
    return;
  }

  // キャッシュからプロジェクトタグマップを取得
  const projectTags = getCachedAllProjectTags();

  // カードにソート用のデータを付与してソート
  const cardsWithData = allCards.map(card => {
    const nameVal = getProjectName(card);
    const emojiEl = card.querySelector(EMOJI_SELECTOR);
    const idVal = emojiEl ? extractProjectIdFromEmoji(emojiEl) : '';
    const tagsVal = projectTags[idVal] || [];
    return { card, name: nameVal, tags: tagsVal };
  });

  // ソート
  cardsWithData.sort((a, b) => {
    switch (sortType) {
      case 'name-asc':
        return a.name.localeCompare(b.name, 'ja');
      case 'name-desc':
        return b.name.localeCompare(a.name, 'ja');
      case 'tags-desc':
        return b.tags.length - a.tags.length;
      default:
        return 0;
    }
  });

  // CSS orderプロパティで順序を制御（project-button要素に適用）
  cardsWithData.forEach((item, index) => {
    const gridItem = item.card.closest('project-button') || item.card;
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
      // Shift+Tab: フィルターボタンへ移動、Tab: ソートボタンへ戻る
      closeDropdown();
      if (shiftKey) {
        document.querySelector('[data-nf-button="filter"]')?.focus();
      } else {
        document.querySelector('[data-nf-button="sort"]')?.focus();
      }
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
 * フィルターUIを更新（選択中タグの表示）
 */
function updateFilterUI() {
  const selectedContainer = document.querySelector('.nf-filter-selected');
  if (!selectedContainer) return;

  selectedContainer.innerHTML = '';

  if (selectedFilterTags.length === 0) {
    const placeholder = document.createElement('span');
    placeholder.className = 'nf-filter-placeholder';
    placeholder.textContent = 'タグを選択してフィルター';
    selectedContainer.appendChild(placeholder);
  } else {
    selectedFilterTags.forEach(tag => {
      const badge = document.createElement('span');
      badge.className = 'nf-filter-badge';
      badge.textContent = tag;

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
      updateFilterUI();
      filterProjectsByTags([]);
    });
    selectedContainer.appendChild(clearBtn);
  }
}

/**
 * タグ選択ドロップダウンを表示
 * @param {HTMLElement} button - ドロップダウンボタン
 */
function showTagDropdown(button) {
  // 既存のドロップダウンを削除
  const existing = document.querySelector('.nf-tag-dropdown');
  if (existing) {
    existing.remove();
    return;
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'nf-tag-dropdown';

  // キャッシュからタグを取得
  const allTags = getCachedAllTags();

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
  dropdown.appendChild(tagListContainer);

  // タグリストを描画する関数（階層表示対応）
  const renderTagList = (filterText = '') => {
    tagListContainer.innerHTML = '';

    let filteredTags = allTags;
    if (filterText) {
      // 検索時はフラット表示
      filteredTags = allTags.filter(tag =>
        tag.toLowerCase().includes(filterText.toLowerCase())
      );
    }

    if (filteredTags.length === 0) {
      const noTags = document.createElement('div');
      noTags.className = 'nf-dropdown-empty';
      noTags.textContent = filterText ? '一致するタグがありません' : 'タグがありません';
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
    const createTagItem = (tag, depth = 0) => {
      const item = document.createElement('div');
      item.className = 'nf-dropdown-item';
      item.setAttribute('data-tag', tag);
      item.setAttribute('tabindex', '-1');

      // 階層深度に応じたインデント
      if (depth > 0) {
        item.classList.add('nf-tag-tree-item');
        item.style.paddingLeft = `${16 + depth * 16}px`;
      }

      if (selectedFilterTags.includes(tag)) {
        item.classList.add('selected');
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

      // 子タグがあるかチェック
      const hasChildren = allTags.some(t =>
        t !== tag && t.startsWith(tag + HIERARCHY_SEPARATOR)
      );
      if (hasChildren) {
        item.classList.add('has-children');
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
          for (const [projectId] of cache.projects) {
            updateFolderIconState(projectId);
          }
        }
      });

      item.appendChild(colorIndicator);
      item.appendChild(checkbox);
      item.appendChild(label);
      item.appendChild(deleteBtn);

      item.addEventListener('click', (e) => {
        if (!e.target.classList.contains('nf-tag-delete-btn')) {
          toggleTagSelection(item, tag, checkbox);
        }
      });

      return item;
    };

    // 階層構造でレンダリング（検索時以外）
    if (!filterText) {
      // ルートタグ（親を持たないタグ）を取得
      const rootTags = filteredTags.filter(tag => !getParentTag(tag));

      const renderTagWithChildren = (tag, depth) => {
        tagListContainer.appendChild(createTagItem(tag, depth));

        // 直接の子タグを取得
        const directChildren = filteredTags.filter(t => {
          const parent = getParentTag(t);
          return parent === tag;
        });

        directChildren.forEach(childTag => {
          renderTagWithChildren(childTag, depth + 1);
        });
      };

      rootTags.forEach(tag => renderTagWithChildren(tag, 0));
    } else {
      // 検索時はフラット表示
      filteredTags.forEach(tag => {
        tagListContainer.appendChild(createTagItem(tag, 0));
      });
    }
  };

  // 初期描画
  renderTagList();

  // 検索入力イベント
  searchInput.addEventListener('input', () => {
    renderTagList(searchInput.value);
  });

  // キーボードナビゲーションをセットアップ
  const closeDropdown = () => dropdown.remove();
  setupKeyboardNavigation(
    tagListContainer,
    '.nf-dropdown-item',
    (item) => {
      // アイテムをクリックしたのと同じ動作
      item.click();
    },
    closeDropdown,
    searchInput,  // 検索入力欄でキーイベントを監視
    (shiftKey) => {
      // Tab: ソートボタンへ移動、Shift+Tab: フィルターボタンへ戻る
      closeDropdown();
      if (shiftKey) {
        document.querySelector('[data-nf-button="filter"]')?.focus();
      } else {
        document.querySelector('[data-nf-button="sort"]')?.focus();
      }
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
      dropdown.remove();
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
  if (filterUIInjected) return;

  const targetElement = findFilterTargetElement();
  if (!targetElement) {
    return;
  }

  // フィルターUIコンテナ（コンパクト版）
  const filterContainer = document.createElement('div');
  filterContainer.className = 'nf-filter-container';

  // タグフィルターボタン
  const filterButton = document.createElement('button');
  filterButton.className = 'nf-filter-button';
  filterButton.setAttribute('data-nf-button', 'filter');
  filterButton.innerHTML = '🏷️ タグ ▼';
  filterButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showTagDropdown(filterButton);
  });

  // ソートボタン
  const sortButton = document.createElement('button');
  sortButton.className = 'nf-sort-button';
  sortButton.setAttribute('data-nf-button', 'sort');
  sortButton.innerHTML = '📊 デフォルト ▼';
  sortButton.addEventListener('click', (e) => {
    e.stopPropagation();
    showSortDropdown(sortButton);
  });

  // 選択中タグ表示エリア
  const selectedContainer = document.createElement('div');
  selectedContainer.className = 'nf-filter-selected';

  filterContainer.appendChild(filterButton);
  filterContainer.appendChild(sortButton);
  filterContainer.appendChild(selectedContainer);

  // mat-button-toggle-groupの場合は直後に挿入
  if (targetElement.tagName.toLowerCase() === 'mat-button-toggle-group') {
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
  const toggleGroup = document.querySelector('mat-button-toggle-group.project-section-toggle');
  if (!toggleGroup) {
    // 見つからない場合は遅延して再試行
    setTimeout(setupSectionToggleListener, 1000);
    return;
  }

  // クリックイベントを監視（キャプチャフェーズで）
  toggleGroup.addEventListener('click', () => {
    // 少し遅延してからフォルダアイコンを再注入（DOMの更新を待つ）
    setTimeout(() => {
      injectAllFolderIcons();
      // フォルダアイコンの状態を更新
      for (const [projectId] of cache.projects) {
        updateFolderIconState(projectId);
      }
    }, 300);

    // さらに遅延して再度チェック（SPAの遅延読み込み対応）
    setTimeout(() => {
      injectAllFolderIcons();
      for (const [projectId] of cache.projects) {
        updateFolderIconState(projectId);
      }
    }, 800);
  }, { capture: true });
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
  });
}

// ページ読み込み完了時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNoteFolder);
} else {
  initNoteFolder();
}
