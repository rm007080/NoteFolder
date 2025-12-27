// NoteFolder - Content Script
// Step 2: フォルダアイコン注入（動的対応版）

console.log('NoteFolder Content Script loaded');

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

  return { valid: true, tag: trimmed };
}

/**
 * allTagsを正規化（重複排除、空文字除去、ソート）
 * @param {string[]} allTags
 * @returns {string[]}
 */
function normalizeAllTags(allTags) {
  return [...new Set(allTags)]
    .filter(tag => tag && tag.trim())
    .sort((a, b) => a.localeCompare(b, 'ja'));
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
function addTagToProject(projectId, newTag) {
  const validation = validateTagName(newTag);
  if (!validation.valid) {
    showToast(validation.error);
    return Promise.resolve(false);
  }

  const normalizedTag = validation.tag;

  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { [`project:${projectId}`]: null, allTags: [] },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error('Storage read error:', chrome.runtime.lastError.message);
          showToast('データの読み込みに失敗しました');
          resolve(false);
          return;
        }

        // プロジェクトデータを作成または更新
        const project = result[`project:${projectId}`] || {
          id: projectId,
          name: '',
          tags: [],
          updatedAt: Date.now()
        };

        // 重複チェック
        if (project.tags.includes(normalizedTag)) {
          showToast('このタグは既に追加されています');
          resolve(false);
          return;
        }

        // タグ追加
        project.tags.push(normalizedTag);
        project.updatedAt = Date.now();

        // allTags更新
        let allTags = [...result.allTags];
        if (!allTags.includes(normalizedTag)) {
          allTags.push(normalizedTag);
        }
        allTags = normalizeAllTags(allTags);

        // 保存
        chrome.storage.sync.set(
          { [`project:${projectId}`]: project, allTags: allTags },
          () => {
            if (chrome.runtime.lastError) {
              console.error('Storage write error:', chrome.runtime.lastError.message);
              showToast('タグの追加に失敗しました');
              resolve(false);
              return;
            }
            console.log('Tag added:', normalizedTag, 'to project:', projectId);
            resolve(true);
          }
        );
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
    chrome.storage.sync.get(
      { [`project:${projectId}`]: null },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error('Storage read error:', chrome.runtime.lastError.message);
          showToast('データの読み込みに失敗しました');
          resolve(false);
          return;
        }

        const project = result[`project:${projectId}`];
        if (!project) {
          resolve(false);
          return;
        }

        // タグを削除
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
            console.log('Tag removed:', tagToRemove, 'from project:', projectId);
            resolve(true);
          }
        );
      }
    );
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
 * @returns {HTMLElement}
 */
function createTagBadge(tagName, onRemove) {
  const badge = document.createElement('span');
  badge.className = 'nf-tag-badge';
  badge.textContent = tagName;

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
 * タグ入力ポップオーバーを表示
 * @param {HTMLElement} targetElement - フォルダアイコン要素
 * @param {string} projectId
 */
function showTagPopover(targetElement, projectId) {
  // 既存のポップオーバーを閉じる
  hideTagPopover();

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

  // データを読み込んでUIを更新
  const updateUI = () => {
    chrome.storage.sync.get(
      { [`project:${projectId}`]: null, allTags: [] },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error('Storage read error:', chrome.runtime.lastError.message);
          return;
        }

        const project = result[`project:${projectId}`];
        const projectTags = project ? project.tags : [];
        const allTags = result.allTags || [];

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
          console.log('updateSuggestions called:', inputValue, 'allTags:', allTags, 'projectTags:', projectTags);
          if (!inputValue.trim()) return;

          const filtered = allTags.filter(tag =>
            tag.toLowerCase().startsWith(inputValue.toLowerCase()) &&
            !projectTags.includes(tag)
          ).slice(0, 5);
          console.log('Filtered suggestions:', filtered);

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
      }
    );
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

  chrome.storage.sync.get(
    { [`project:${projectId}`]: null },
    (result) => {
      if (chrome.runtime.lastError) return;

      const project = result[`project:${projectId}`];
      const hasTags = project && project.tags && project.tags.length > 0;

      if (hasTags) {
        folderIcon.classList.add('has-tags');
      } else {
        folderIcon.classList.remove('has-tags');
      }
    }
  );
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
    console.warn('Project ID not found for emoji element:', emojiElement);
    return;
  }

  // すでに処理済みならスキップ
  if (processedProjects.has(projectId)) {
    return;
  }

  // すでにフォルダアイコンが注入済みならスキップ
  const parentElement = emojiElement.parentElement;
  if (!parentElement) {
    console.warn('Parent element not found for project:', projectId);
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

  console.log('Folder icon injected for project:', projectId);
  processedProjects.add(projectId);

  // クリックイベント（キャプチャフェーズで処理して確実にイベントを捕捉）
  const handleClick = (e) => {
    e.stopPropagation();
    e.stopImmediatePropagation();
    e.preventDefault();
    console.log('Folder icon clicked for project:', projectId);
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
  console.log(`Found ${emojiElements.length} project(s)`);

  emojiElements.forEach((emojiElement) => {
    injectFolderIcon(emojiElement);
  });
}

// ========================================
// フィルターUI
// ========================================

// 現在選択中のフィルタータグ
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
    console.log('Found toggle group for filter UI placement');
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
    console.log('Original card order saved:', originalCardOrder.length, 'cards');
  }
}

/**
 * プロジェクトをタグでフィルタリング
 * @param {string[]} tags - フィルターするタグ（空配列なら全表示）
 */
function filterProjectsByTags(tags) {
  console.log('Filtering by tags:', tags);

  // 元の順序を使用（未保存なら現在のカードを使用）
  const cards = originalCardOrder.length > 0
    ? originalCardOrder
    : Array.from(getProjectCards());

  if (cards.length === 0) return;

  if (tags.length === 0) {
    // フィルターなし: 全カード表示（project-button要素に適用）
    cards.forEach(card => {
      const gridItem = card.closest('project-button') || card;
      gridItem.style.display = '';
    });
    // 現在のソート設定を再適用
    sortProjects(currentSortType);
    return;
  }

  // ストレージAPIが利用不可の場合は早期リターン
  if (!isStorageAvailable()) {
    console.warn('chrome.storage.sync is not available');
    return;
  }

  // ストレージから全プロジェクトのタグを取得
  chrome.storage.sync.get(null, (items) => {
    if (chrome.runtime.lastError) {
      console.error('Storage read error:', chrome.runtime.lastError.message);
      return;
    }

    // プロジェクトIDとタグのマッピングを作成
    const projectTags = {};
    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith('project:')) {
        projectTags[value.id] = value.tags || [];
      }
    }

    console.log('Project tags map:', projectTags);

    // 各カードの表示/非表示を制御（project-button要素に適用）
    cards.forEach(card => {
      // グリッドアイテムであるproject-button要素を取得
      const gridItem = card.closest('project-button') || card;

      const emojiEl = card.querySelector(EMOJI_SELECTOR);
      if (!emojiEl) {
        gridItem.style.display = '';
        return;
      }

      const projectId = extractProjectIdFromEmoji(emojiEl);
      if (!projectId) {
        gridItem.style.display = '';
        return;
      }

      const cardTags = projectTags[projectId] || [];
      const hasMatchingTag = tags.some(tag => cardTags.includes(tag));

      // project-button要素に対してdisplay制御（グリッドの歯抜け防止）
      gridItem.style.display = hasMatchingTag ? '' : 'none';
    });

    // 現在のソート設定を再適用（orderプロパティで順序制御）
    sortProjects(currentSortType);

    console.log('Filtered by tags');
  });
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
  console.log('Sorting projects by:', sortType);
  currentSortType = sortType;

  // 元の順序を基準にする
  const allCards = originalCardOrder.length > 0
    ? originalCardOrder
    : Array.from(getProjectCards());

  if (allCards.length === 0) return;

  // デフォルト順の場合は元の順序（orderをリセット）
  if (sortType === 'default') {
    console.log('Default sort - restoring original order');
    allCards.forEach((card, index) => {
      // グリッドアイテムであるproject-button要素にorderを適用
      const gridItem = card.closest('project-button') || card;
      gridItem.style.order = index;
    });
    return;
  }

  // ストレージAPIが利用不可の場合は早期リターン
  if (!isStorageAvailable()) {
    console.warn('chrome.storage.sync is not available');
    return;
  }

  // ストレージからタグ情報を取得してソート
  chrome.storage.sync.get(null, (items) => {
    if (chrome.runtime.lastError) {
      console.error('Storage read error:', chrome.runtime.lastError.message);
      return;
    }

    // プロジェクトIDとタグのマッピング
    const projectTags = {};
    for (const [key, value] of Object.entries(items)) {
      if (key.startsWith('project:')) {
        projectTags[value.id] = value.tags || [];
      }
    }

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

    console.log('Projects sorted by order property');
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

  // ストレージAPIが利用不可の場合は早期リターン
  if (!isStorageAvailable()) {
    console.warn('chrome.storage.sync is not available');
    return;
  }

  // ストレージからタグを取得
  chrome.storage.sync.get({ allTags: [] }, (result) => {
    if (chrome.runtime.lastError) {
      console.error('Storage read error:', chrome.runtime.lastError.message);
      return;
    }

    const allTags = result.allTags || [];

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

    // タグリストを描画する関数
    const renderTagList = (filterText = '') => {
      tagListContainer.innerHTML = '';

      const filteredTags = allTags.filter(tag =>
        tag.toLowerCase().includes(filterText.toLowerCase())
      );

      if (filteredTags.length === 0) {
        const noTags = document.createElement('div');
        noTags.className = 'nf-dropdown-empty';
        noTags.textContent = filterText ? '一致するタグがありません' : 'タグがありません';
        tagListContainer.appendChild(noTags);
        return;
      }

      filteredTags.forEach(tag => {
        const item = document.createElement('div');
        item.className = 'nf-dropdown-item';
        item.setAttribute('data-tag', tag);
        item.setAttribute('tabindex', '-1');
        if (selectedFilterTags.includes(tag)) {
          item.classList.add('selected');
        }

        const checkbox = document.createElement('span');
        checkbox.className = 'nf-dropdown-checkbox';
        checkbox.textContent = selectedFilterTags.includes(tag) ? '✓' : '';

        const label = document.createElement('span');
        label.textContent = tag;

        item.appendChild(checkbox);
        item.appendChild(label);

        item.addEventListener('click', () => {
          toggleTagSelection(item, tag, checkbox);
        });

        tagListContainer.appendChild(item);
      });

      // タグ選択をトグルする関数
      function toggleTagSelection(item, tag, checkbox) {
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
  });
}

/**
 * フィルターUIを注入
 */
function injectFilterUI() {
  if (filterUIInjected) return;

  const targetElement = findFilterTargetElement();
  if (!targetElement) {
    console.log('Filter target element not found');
    return;
  }

  console.log('Injecting filter UI near:', targetElement);

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
  console.log('Filter UI injected');
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
          console.log('New project detected (direct):', node.id);
          injectFolderIcon(node);
        }

        // 追加されたノードの子孫に絵文字アイコンがある場合
        if (node.querySelectorAll) {
          const emojiElements = node.querySelectorAll(EMOJI_SELECTOR);
          if (emojiElements.length > 0) {
            console.log(`New project(s) detected (descendants): ${emojiElements.length}`);
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

  console.log('MutationObserver started');
  return observer;
}

// ========================================
// 初期化
// ========================================

/**
 * NoteFolder初期化
 */
function initNoteFolder() {
  console.log('NoteFolder initializing...');
  console.log('Current URL:', window.location.href);

  // NotebookLMのプロジェクト一覧ページかチェック
  if (!window.location.href.includes('notebooklm.google.com')) {
    console.log('Not on NotebookLM page, skipping initialization');
    return;
  }

  // 既存のプロジェクトにアイコンを注入（複数回試行）
  const tryInject = (attempt = 1, maxAttempts = 5) => {
    console.log(`Injection attempt ${attempt}/${maxAttempts}`);
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
}

// ページ読み込み完了時に初期化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNoteFolder);
} else {
  initNoteFolder();
}
