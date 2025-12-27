// NoteFolder - Popup Script (v4)
// 設定画面: 全タグ一覧表示など将来拡張用

document.addEventListener('DOMContentLoaded', () => {
  console.log('NoteFolder popup loaded');

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

  // 将来的な拡張: 全タグ一覧表示、タグ削除など
  displayAllTags();
});

/**
 * 全タグ一覧を表示（将来拡張用）
 */
function displayAllTags() {
  chrome.storage.sync.get({ allTags: [] }, (result) => {
    if (chrome.runtime.lastError) {
      console.error('Storage read error:', chrome.runtime.lastError.message);
      return;
    }

    const allTags = result.allTags || [];
    console.log('All tags:', allTags);

    // 将来的にここでタグ一覧UIを表示
    // 現在は開発情報として表示
    const projectIdElement = document.getElementById('project-id');
    if (projectIdElement && allTags.length > 0) {
      projectIdElement.innerHTML =
        'タグ管理はNotebookLMのプロジェクト一覧ページで行えます<br>' +
        '<small style="color: #80868b;">登録済みタグ: ' + allTags.length + '個</small>';
    }
  });
}
