# NoteFolder ポップオーバーD&D機能修正 実装計画 v6

## 対象ファイル
- `/mnt/c/Users/littl/app-dev/06_NoteFolder/NoteFolder/content/content.js`

---

## 問題概要

`nf-tag-dropdown`ではD&Dが正常に動作するが、`nf-popover`では親タグ→親タグ、子タグ→親タグの両方のD&Dが動作しない。

---

## 原因分析

### ドロップダウン（動作する）
- **ドラッグ状態管理**: `dropdown.setAttribute('data-dragging-tag', tag)` でグローバル属性として保存
- **dragover判定**: `dropdown.getAttribute('data-dragging-tag')` でドラッグ中のタグを取得し、自分自身・子孫へのドロップを防止

### ポップオーバー（動作しない）
- **ドラッグ状態管理**: `draggedParent` ローカル変数（updateUI関数スコープ内）
- **dragover判定**: `e.dataTransfer.types.includes('application/x-nf-tag')` でMIMEタイプの存在のみチェック

### 問題点
1. ポップオーバーのdragoverでは**自分自身へのドロップ防止チェックがない**
2. `draggedParent`変数は順番変更用ドロップゾーンでのみ使用され、親タグバッジへのdragoverでは参照できない
3. MIMEタイプの存在チェックだけでは、どのタグからドラッグされたか判定できない

---

## Codexレビュー指摘事項

| 重要度 | 問題 | 対処 |
|--------|------|------|
| P1 | `effectAllowed='move'`に対して`dropEffect='link'`を使用 → 一部ブラウザでdrop不可 | `dropEffect='move'`に統一 |
| P2 | `dragend`未発火時に`data-dragging-tag`が残る | `drop`でも属性クリア追加 |
| P2 | ドロップダウン↔ポップオーバー間D&D非対応 | 今回対象外 |

---

## 修正内容

### 修正1: 親タグバッジのdragstartに属性設定を追加（1955-1962行付近）

```javascript
badge.addEventListener('dragstart', (e) => {
  draggedParent = parentName;
  badge.classList.add('nf-dragging');
  parentSection.classList.add('nf-dragging-active');
  e.dataTransfer.setData('text/plain', parentName);
  e.dataTransfer.setData('application/x-nf-tag', parentName);
  e.dataTransfer.effectAllowed = 'move';
  // ポップオーバー要素に属性を設定（ドロップダウンと同じパターン）
  popover.setAttribute('data-dragging-tag', parentName);
});
```

### 修正2: 親タグバッジのdragendで属性をクリア（1964-1972行付近）

```javascript
badge.addEventListener('dragend', () => {
  badge.classList.remove('nf-dragging');
  parentSection.classList.remove('nf-dragging-active');
  draggedParent = null;
  popover.removeAttribute('data-dragging-tag');  // 追加
  // 全てのドロップターゲットスタイルをクリア
  parentSection.querySelectorAll('.nf-drop-active, .nf-parent-drop-target').forEach(el => {
    el.classList.remove('nf-drop-active', 'nf-parent-drop-target');
  });
});
```

### 修正3: 親タグバッジのdragoverに自己・子孫チェックを追加（1975-1983行付近）

```javascript
badge.addEventListener('dragover', (e) => {
  e.preventDefault();
  const draggingTag = popover.getAttribute('data-dragging-tag');
  // 自分自身や自分の子孫にはドロップ不可
  if (draggingTag &&
      parentName !== draggingTag &&
      !parentName.startsWith(draggingTag + HIERARCHY_SEPARATOR)) {
    e.dataTransfer.dropEffect = 'move';  // linkからmoveに変更（effectAllowedと整合）
    badge.classList.add('nf-parent-drop-target');
  }
});
```

### 修正4: 親タグバッジのdropで属性クリアを追加（1989-2011行付近）

dropイベントの最初で `popover.removeAttribute('data-dragging-tag')` を追加（dragend未発火時の安全策）

### 修正5: 子タグバッジのdragstartに属性設定を追加（2055-2064行付近）

```javascript
badge.addEventListener('dragstart', (e) => {
  badge.classList.add('nf-dragging');
  e.dataTransfer.setData('text/plain', tag);
  e.dataTransfer.setData('application/x-nf-tag', tag);
  e.dataTransfer.effectAllowed = 'move';
  // ポップオーバー要素に属性を設定
  popover.setAttribute('data-dragging-tag', tag);
});
```

### 修正6: 子タグバッジのdragendで属性をクリア（2066-2071行付近）

```javascript
badge.addEventListener('dragend', () => {
  badge.classList.remove('nf-dragging');
  popover.removeAttribute('data-dragging-tag');  // 追加
  document.querySelectorAll('.nf-parent-drop-target').forEach(el => {
    el.classList.remove('nf-parent-drop-target');
  });
});
```

---

## 期待される動作

- 親タグを別の親タグにD&D → 親子関係が作成される（同名タグは自動統合）
- 子タグを親タグにD&D → 親子関係が変更される（同名タグは自動統合）
- 自分自身や自分の子孫へのD&D → ドロップターゲットにならない

---

## テスト項目

- [ ] nf-popover内で「歩行」を「健康」にD&D（親→親）
- [ ] nf-popover内で「健康/運動」を「趣味」にD&D（子→親）
- [ ] 自分自身へのD&Dがドロップターゲットにならないことを確認
- [ ] 自分の子孫へのD&Dがドロップターゲットにならないことを確認
- [ ] ポップオーバーを閉じた後に`data-dragging-tag`が残らないことを確認

---

**最終更新**: 2025-12-31
**ステータス**: 実装準備完了
