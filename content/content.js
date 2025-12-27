// NoteFolder - Content Script
// Step 2: フォルダアイコン注入（動的対応版）

console.log('NoteFolder Content Script loaded');

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
 * トースト通知を表示する（簡易版）
 * @param {string} message - 表示するメッセージ
 */
function showToast(message) {
  // TODO: Step 3以降で実装
  console.log('Toast:', message);
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

  // クリックイベント
  folderIcon.addEventListener('click', (e) => {
    e.stopPropagation();  // プロジェクトを開かないようにする
    e.preventDefault();
    console.log('Folder icon clicked for project:', projectId);
    showToast(`プロジェクト ${projectId} のタグを管理`);
    // TODO: Step 3でポップオーバー表示を実装
  });
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
