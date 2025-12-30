// NoteFolder - Popup Script (v5)
// 設定画面: タグ使用統計表示

document.addEventListener('DOMContentLoaded', () => {

  // プロジェクト情報エリアにメッセージ表示
  const projectIdElement = document.getElementById('project-id');
  if (projectIdElement) {
    projectIdElement.textContent = 'タグ管理はNotebookLMのプロジェクト一覧ページで行えます';
    projectIdElement.style.color = '#5f6368';
  }

  // 入力エリアを非表示（v4ではContent Scriptで実装）
  const tagInputSection = document.querySelector('.tag-input');
  if (tagInputSection) {
    tagInputSection.style.display = 'none';
  }

  const currentTagsSection = document.querySelector('.current-tags');
  if (currentTagsSection) {
    currentTagsSection.style.display = 'none';
  }

  const filteredProjectsSection = document.querySelector('.filtered-projects');
  if (filteredProjectsSection) {
    filteredProjectsSection.style.display = 'none';
  }

  // タグ統計を表示
  displayTagStatistics();
});

/**
 * タグメタデータをシャードから読み込む
 * @param {Object} items - chrome.storage.sync.get(null) の結果
 * @returns {Object} - タグ名をキー、メタデータを値とするオブジェクト
 */
function loadTagMetaFromItems(items) {
  const tagMeta = {};
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith('tagMeta:') && typeof value === 'object') {
      Object.assign(tagMeta, value);
    }
  }
  return tagMeta;
}

/**
 * タグ使用統計を計算
 * @param {Object} items - chrome.storage.sync.get(null) の結果
 * @returns {Array} - [{tag, count, color}] の配列（使用回数順）
 */
function calculateTagStatistics(items) {
  const stats = {};
  const tagMeta = loadTagMetaFromItems(items);

  // 全プロジェクトからタグ使用回数を集計
  for (const [key, value] of Object.entries(items)) {
    if (key.startsWith('project:') && value && Array.isArray(value.tags)) {
      for (const tag of value.tags) {
        stats[tag] = (stats[tag] || 0) + 1;
      }
    }
  }

  // タグメタデータにあるが使用回数0のタグも含める
  for (const tagName of Object.keys(tagMeta)) {
    if (!(tagName in stats)) {
      stats[tagName] = 0;
    }
  }

  // 使用回数順にソート、同数の場合はタグ名でソート
  return Object.entries(stats)
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0], 'ja');
    })
    .map(([tag, count]) => ({
      tag,
      count,
      color: getTagColorFromMeta(tag, tagMeta)
    }));
}

/**
 * タグの色を取得（親タグからの継承あり）
 * @param {string} tagName - タグ名
 * @param {Object} tagMeta - タグメタデータ
 * @returns {string|null} - 色コード（#RRGGBB）またはnull
 */
function getTagColorFromMeta(tagName, tagMeta) {
  // 自身の色があれば返す
  if (tagMeta[tagName] && tagMeta[tagName].color) {
    return tagMeta[tagName].color;
  }

  // 親タグから色を継承
  const parts = tagName.split('/');
  for (let i = parts.length - 1; i > 0; i--) {
    const parentTag = parts.slice(0, i).join('/');
    if (tagMeta[parentTag] && tagMeta[parentTag].color) {
      return tagMeta[parentTag].color;
    }
  }

  return null;
}

/**
 * コントラスト色を計算（白または黒）
 * @param {string} hexColor - 背景色（#RRGGBB）
 * @returns {string} - '#ffffff' または '#000000'
 */
function getContrastColor(hexColor) {
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#000000' : '#ffffff';
}

/**
 * タグの階層深度を取得
 * @param {string} tagName - タグ名
 * @returns {number} - 深度（0が最上位）
 */
function getTagDepth(tagName) {
  return (tagName.match(/\//g) || []).length;
}

/**
 * タグ使用統計を表示
 */
function displayTagStatistics() {
  const loadingEl = document.getElementById('stats-loading');
  const emptyEl = document.getElementById('stats-empty');
  const tableEl = document.getElementById('stats-table');
  const tbodyEl = document.getElementById('stats-tbody');
  const projectIdEl = document.getElementById('project-id');

  chrome.storage.sync.get(null, (items) => {
    if (chrome.runtime.lastError) {
      console.error('Storage read error:', chrome.runtime.lastError.message);
      if (loadingEl) loadingEl.textContent = 'データの読み込みに失敗しました';
      return;
    }

    const statistics = calculateTagStatistics(items);

    // ローディング非表示
    if (loadingEl) loadingEl.style.display = 'none';

    if (statistics.length === 0) {
      // タグなし
      if (emptyEl) emptyEl.style.display = 'block';
      if (tableEl) tableEl.style.display = 'none';
    } else {
      // 統計テーブル表示
      if (emptyEl) emptyEl.style.display = 'none';
      if (tableEl) tableEl.style.display = 'table';

      // テーブルボディをクリア
      if (tbodyEl) {
        tbodyEl.textContent = '';

        // 統計行を生成
        for (const stat of statistics) {
          const row = document.createElement('tr');
          row.className = 'stats-row';

          // タグ名セル
          const tagCell = document.createElement('td');
          tagCell.className = 'stats-td-tag';

          // タグバッジ
          const badge = document.createElement('span');
          badge.className = 'stats-tag-badge';
          badge.textContent = stat.tag;

          // 階層インデント
          const depth = getTagDepth(stat.tag);
          if (depth > 0) {
            badge.style.marginLeft = (depth * 12) + 'px';
          }

          // 色適用
          if (stat.color) {
            badge.style.backgroundColor = stat.color;
            badge.style.color = getContrastColor(stat.color);
          }

          tagCell.appendChild(badge);
          row.appendChild(tagCell);

          // 使用数セル
          const countCell = document.createElement('td');
          countCell.className = 'stats-td-count';
          countCell.textContent = stat.count;
          row.appendChild(countCell);

          tbodyEl.appendChild(row);
        }
      }
    }

    // プロジェクト情報エリアにサマリー表示
    if (projectIdEl) {
      projectIdEl.textContent = '';
      projectIdEl.appendChild(document.createTextNode('タグ管理はNotebookLMのプロジェクト一覧ページで行えます'));
      projectIdEl.appendChild(document.createElement('br'));
      const small = document.createElement('small');
      small.style.color = '#80868b';

      // プロジェクト数を計算
      const projectCount = Object.keys(items).filter(k => k.startsWith('project:')).length;
      small.textContent = '登録済みタグ: ' + statistics.length + '個 / プロジェクト: ' + projectCount + '件';
      projectIdEl.appendChild(small);
    }
  });
}
