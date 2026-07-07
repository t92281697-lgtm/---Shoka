const BOOK_COLORS = {
  burgundy: 'linear-gradient(180deg,#6E2E2E,#4f2020)',
  green: 'linear-gradient(180deg,#2F4538,#1f2f26)',
  navy: 'linear-gradient(180deg,#1C2B3A,#131f2b)',
  brass: 'linear-gradient(180deg,#A8813F,#7c5e2b)',
  purple: 'linear-gradient(180deg,#7a5980,#563d5c)',
  blue: 'linear-gradient(180deg,#3a5a63,#294049)',
  brown: 'linear-gradient(180deg,#5c5648,#403c32)',
  black: 'linear-gradient(180deg,#2D2D2D,#111111)'
};

<div class="field">
<label>本の色</label>

<select id="fColor">
<option value="burgundy">ワインレッド</option>
<option value="green">深緑</option>
<option value="navy">ネイビー</option>
<option value="brass">真鍮</option>
<option value="purple">紫</option>
<option value="blue">ブルー</option>
<option value="brown">ブラウン</option>
<option value="black">ブラック</option>
</select>

</div>
 
let books = [];
let currentFilter = 'all';
let sortMode = 'manual';
let currentRating = 0;
let draggingId = null;
let resizeTimer = null;
 
const $ = (sel) => document.querySelector(sel);
const shelf = $('#shelf');
const list = $('#list');
const overlay = $('#overlay');
const toastEl = $('#toast');
 
function showToast(msg){
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(()=> toastEl.classList.remove('show'), 1800);
}
 
async function loadBooks(){
  try{
    const res = await window.storage.get('books', false);
    books = res ? JSON.parse(res.value) : [];
  }catch(e){
    books = [];
  }
  books.forEach((b,i)=>{ if(typeof b.order !== 'number') b.order = i*10; });
  render();
}
 
async function saveBooks(){
  try{
    await window.storage.set('books', JSON.stringify(books), false);
  }catch(e){
    showToast('保存に失敗しました');
  }
}
 
function uid(){ return 'b_' + Date.now() + '_' + Math.floor(Math.random()*1000); }
function escapeHtml(str){
  return (str||'').replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function spineWidth(b){ return Math.max(22, Math.min(46, 22 + (Number(b.totalPages)||150)/18)); }
function spineHeight(b){ return 100 + Math.min(60,(Number(b.totalPages)||150)/8); }
function getGroupKey(b){
  const s = (b.series||'').trim();
  if(s) return s;
  const a = (b.author||'').trim();
  return a || null;
}
 
function render(){
  renderStats();
  renderShelf();
  renderList();
}
 
function renderStats(){
  const completed = books.filter(b=>b.status==='completed');
  const thisYear = new Date().getFullYear();
  const pagesThisYear = completed
    .filter(b=> b.dateCompleted && new Date(b.dateCompleted).getFullYear()===thisYear)
    .reduce((s,b)=> s + (Number(b.totalPages)||0), 0);
  const reading = books.filter(b=>b.status==='reading').length;
 
  $('#statsRow').innerHTML = `
    <div class="stat"><div class="num">${books.length}</div><div class="label">蔵書</div></div>
    <div class="stat"><div class="num">${completed.length}</div><div class="label">読了</div></div>
    <div class="stat"><div class="num">${reading}</div><div class="label">読書中</div></div>
    <div class="stat"><div class="num">${pagesThisYear.toLocaleString()}</div><div class="label">${thisYear}年 読了ページ</div></div>
  `;
}
 
function sortedForDisplay(arr0){
  const arr = arr0.slice();
  if(sortMode==='manual'){
    arr.sort((a,b)=> (a.order||0)-(b.order||0));
  } else if(sortMode==='added'){
    arr.sort((a,b)=> new Date(a.dateAdded)-new Date(b.dateAdded));
  } else if(sortMode==='rating'){
    arr.sort((a,b)=> (b.rating||0)-(a.rating||0) || (a.order||0)-(b.order||0));
  } else if(sortMode==='group'){
    const groups = {};
    arr.forEach(b=>{
      const k = getGroupKey(b) || ('__single__'+b.id);
      (groups[k] = groups[k]||[]).push(b);
    });
    const keys = Object.keys(groups).sort((k1,k2)=>{
      const s1 = k1.startsWith('__single__'), s2 = k2.startsWith('__single__');
      if(s1 && s2) return 0;
      if(s1) return 1;
      if(s2) return -1;
      return k1.localeCompare(k2, 'ja');
    });
    const result = [];
    keys.forEach(k=>{
      const g = groups[k];
      g.sort((a,b)=>{
        const va = Number(a.volume)||0, vb = Number(b.volume)||0;
        if(va!==vb) return va-vb;
        return (a.order||0)-(b.order||0);
      });
      result.push(...g);
    });
    return result;
  }
  return arr;
}
 
function buildDisplayItems(sorted){
  const items = [];
  let lastKey = null;
  sorted.forEach((b,i)=>{
    const key = getGroupKey(b);
    if(sortMode==='group' && key && key!==lastKey && i>0){
      items.push({type:'divider', label:key});
    }
    items.push({type:'book', book:b, groupKey:key});
    if(key) lastKey = key;
  });
  return items;
}
 
function packRows(items, containerWidth){
  const gap = 2;
  const rows = [];
  let row = [], w = 0;
  items.forEach(item=>{
    const iw = item.type==='book' ? spineWidth(item.book) : 18;
    if(row.length>0 && w + iw + gap > containerWidth){
      rows.push(row); row = []; w = 0;
    }
    row.push(item); w += iw + gap;
  });
  if(row.length) rows.push(row);
  return rows;
}
 
function spineHtml(b){
  const width = spineWidth(b);
  const height = spineHeight(b);
  const bg = BOOK_COLORS[b.color] || BOOK_COLORS.burgundy;
  const wantClass = b.status==='want' ? 'want' : '';
  const badge = b.status==='reading' ? '<div class="badge"></div>' : '';
  const draggable = sortMode==='manual' ? 'true' : 'false';
  return `<div class="spine ${wantClass}" draggable="${draggable}" style="width:${width}px; height:${height}px; background:${bg};" data-id="${b.id}" title="${escapeHtml(b.title)}">
    ${badge}
    <div class="spine-title">${escapeHtml(b.title)}</div>
  </div>`;
}
 
function dividerHtml(label){
  return `<div class="group-divider" title="${escapeHtml(label)}"><span class="div-label">${escapeHtml(label)}</span></div>`;
}
 
function renderShelf(){
  if(books.length===0){
    shelf.innerHTML = '<div class="empty-shelf">まだ本がありません。「＋ 本を追加」から棚に並べてみましょう。</div>';
    return;
  }
  const sorted = sortedForDisplay(books);
  const items = buildDisplayItems(sorted);
  const containerWidth = (shelf.clientWidth || (window.innerWidth - 96)) - 28;
  const rows = packRows(items, containerWidth);
 
  shelf.innerHTML = rows.map(row=>{
    const maxH = Math.max(90, ...row.filter(i=>i.type==='book').map(i=>spineHeight(i.book)));
    const rowHtml = row.map(item=> item.type==='book' ? spineHtml(item.book) : dividerHtml(item.label)).join('');
    return `<div class="shelf-row" style="height:${maxH}px;">${rowHtml}</div><div class="plank"></div>`;
  }).join('');
 
  shelf.querySelectorAll('.spine').forEach(el=>{
    el.addEventListener('click', ()=> { if(!el.classList.contains('dragging')) openEdit(el.dataset.id); });
  });
}
 
function cardHtml(b, showMove, isFirst, isLast){
  const pct = b.totalPages>0 ? Math.min(100, Math.round((Number(b.currentPage||0)/Number(b.totalPages))*100)) : 0;
  const stars = b.rating ? '★'.repeat(b.rating) + '☆'.repeat(5-b.rating) : '';
  const bg = BOOK_COLORS[b.color] || BOOK_COLORS.burgundy;
  const statusLabel = {reading:'読書中', completed:'読了', want:'積読'};
  const seriesInfo = b.series ? `${escapeHtml(b.series)}${b.volume ? ' 第'+escapeHtml(String(b.volume))+'巻' : ''} ・ ` : '';
  const moveBtns = showMove ? `<div class="move-btns">
      <button data-move="up" data-id="${b.id}" ${isFirst?'disabled':''}>▲</button>
      <button data-move="down" data-id="${b.id}" ${isLast?'disabled':''}>▼</button>
    </div>` : '';
  return `<div class="card">
    ${moveBtns}
    <div class="swatch" style="background:${bg};"></div>
    <div class="card-body" data-id="${b.id}">
      <div class="card-title">${escapeHtml(b.title)}</div>
      <div class="card-meta">${seriesInfo}${escapeHtml(b.author||'著者不明')} ・ ${escapeHtml(b.genre)}${b.status==='reading' ? ` ・ ${b.currentPage||0}/${b.totalPages}p` : ''}</div>
      ${b.status==='reading' ? `<div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>` : ''}
    </div>
    ${stars ? `<div class="stars">${stars}</div>` : ''}
    <div class="status-chip ${b.status}">${statusLabel[b.status]}</div>
  </div>`;
}
 
function renderList(){
  const statusFiltered = currentFilter==='all' ? books : books.filter(b=>b.status===currentFilter);
  if(statusFiltered.length===0){
    list.innerHTML = '<div class="empty-shelf">該当する本がありません。</div>';
    return;
  }
  const sorted = sortedForDisplay(statusFiltered);
  const showMove = sortMode==='manual';
  let html = '';
  let lastKey = null;
  sorted.forEach((b,i)=>{
    const key = getGroupKey(b);
    if(sortMode==='group' && key && key!==lastKey){
      html += `<div class="group-header">${escapeHtml(key)}</div>`;
    }
    html += cardHtml(b, showMove, i===0, i===sorted.length-1);
    if(key) lastKey = key;
  });
  list.innerHTML = html;
 
  list.querySelectorAll('.card-body').forEach(el=>{
    el.addEventListener('click', ()=> openEdit(el.dataset.id));
  });
  list.querySelectorAll('[data-move]').forEach(el=>{
    el.addEventListener('click', (e)=>{
      e.stopPropagation();
      moveBook(el.dataset.id, el.dataset.move==='up' ? -1 : 1);
    });
  });
}
 
function moveBook(id, dir){
  const sorted = sortedForDisplay(books);
  const idx = sorted.findIndex(b=>b.id===id);
  const swapIdx = idx + dir;
  if(idx<0 || swapIdx<0 || swapIdx>=sorted.length) return;
  const tmp = sorted[idx].order;
  sorted[idx].order = sorted[swapIdx].order;
  sorted[swapIdx].order = tmp;
  saveBooks();
  render();
}
 
function reorderByDrag(dragId, dropId){
  const sorted = sortedForDisplay(books);
  const dragIdx = sorted.findIndex(b=>b.id===dragId);
  const dropIdx = sorted.findIndex(b=>b.id===dropId);
  if(dragIdx<0 || dropIdx<0 || dragIdx===dropIdx) return;
  const [moved] = sorted.splice(dragIdx,1);
  sorted.splice(dropIdx,0,moved);
  sorted.forEach((b,i)=> b.order = i*10);
  saveBooks();
  render();
}
 
// --- Drag and drop (event delegation on shelf) ---
shelf.addEventListener('dragstart', e=>{
  const el = e.target.closest('.spine');
  if(!el || el.getAttribute('draggable')!=='true') return;
  draggingId = el.dataset.id;
  el.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
});
shelf.addEventListener('dragend', e=>{
  const el = e.target.closest('.spine');
  if(el) el.classList.remove('dragging');
  shelf.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));
  draggingId = null;
});
shelf.addEventListener('dragover', e=>{
  const el = e.target.closest('.spine');
  if(!el || !draggingId || el.dataset.id===draggingId) return;
  e.preventDefault();
  shelf.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));
  el.classList.add('drag-over');
});
shelf.addEventListener('drop', e=>{
  e.preventDefault();
  const el = e.target.closest('.spine');
  shelf.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));
  if(!el || !draggingId || el.dataset.id===draggingId) return;
  reorderByDrag(draggingId, el.dataset.id);
});
 
window.addEventListener('resize', ()=>{
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(renderShelf, 150);
});
 
function renderStars(){
  const wrap = $('#starPicker');
  wrap.innerHTML = [1,2,3,4,5].map(i=>`<span class="${i<=currentRating?'on':''}" data-v="${i}">★</span>`).join('');
  wrap.querySelectorAll('span').forEach(s=>{
    s.addEventListener('click', ()=>{
      currentRating = Number(s.dataset.v);
      renderStars();
    });
  });
}
 
function openAdd(){
  $('#modalTitle').textContent = '本を追加';
  $('#editId').value = '';
  $('#fTitle').value = '';
  $('#fAuthor').value = '';
  $('#fSeries').value = '';
  $('#fVolume').value = '';
  $('#fGenre').value = '小説';
  $('#fColor').value = 'burgundy';
  $('#fStatus').value = 'want';
  $('#fTotal').value = '';
  $('#fCurrent').value = '';
  $('#fNotes').value = '';
  currentRating = 0;
  renderStars();
  $('#deleteBtn').style.display = 'none';
  overlay.classList.add('open');
  $('#fTitle').focus();
}
 
function openEdit(id){
  const b = books.find(x=>x.id===id);
  if(!b) return;
  $('#modalTitle').textContent = '本を編集';
  $('#editId').value = b.id;
  $('#fTitle').value = b.title;
  $('#fAuthor').value = b.author||'';
  $('#fSeries').value = b.series||'';
  $('#fVolume').value = b.volume||'';
  $('#fGenre').value = b.genre;
  $('#fColor').value = b.color || "burgundy";
  $('#fStatus').value = b.status;
  $('#fTotal').value = b.totalPages||'';
  $('#fCurrent').value = b.currentPage||'';
  $('#fNotes').value = b.notes||'';
  currentRating = b.rating||0;
  renderStars();
  $('#deleteBtn').style.display = 'block';
  overlay.classList.add('open');
}
 
function closeModal(){ overlay.classList.remove('open'); }
 
async function handleSave(){
  const title = $('#fTitle').value.trim();
  if(!title){ showToast('タイトルを入力してください'); return; }
  const id = $('#editId').value;
  const status = $('#fStatus').value;
  const existing = id ? books.find(b=>b.id===id) : null;
  const maxOrder = books.length ? Math.max(...books.map(b=>b.order||0)) : -10;
 
  const data = {
    id: id || uid(),
    title,
    author: $('#fAuthor').value.trim(),
    series: $('#fSeries').value.trim(),
    volume: $('#fVolume').value ? Number($('#fVolume').value) : null,
    genre: $('#fGenre').value,
    color: $('#fColor').value,
    status,
    totalPages: Number($('#fTotal').value)||0,
    currentPage: Number($('#fCurrent').value)||0,
    rating: currentRating,
    notes: $('#fNotes').value.trim(),
    order: existing ? existing.order : maxOrder + 10,
    dateAdded: existing ? existing.dateAdded : new Date().toISOString(),
    dateCompleted: status==='completed' ? (existing && existing.dateCompleted ? existing.dateCompleted : new Date().toISOString()) : null,
  };
 
  if(existing){
    Object.assign(existing, data);
  } else {
    books.push(data);
  }
  await saveBooks();
  render();
  closeModal();
  showToast('棚に並べました');
}
 
async function handleDelete(){
  const id = $('#editId').value;
  books = books.filter(b=>b.id!==id);
  await saveBooks();
  render();
  closeModal();
  showToast('削除しました');
}
 
$('#openAdd').addEventListener('click', openAdd);
$('#cancelBtn').addEventListener('click', closeModal);
$('#saveBtn').addEventListener('click', handleSave);
$('#deleteBtn').addEventListener('click', handleDelete);
overlay.addEventListener('click', (e)=>{ if(e.target===overlay) closeModal(); });
 
document.querySelectorAll('#filters .filter-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#filters .filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderList();
  });
});
 
document.querySelectorAll('#sortModes .filter-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('#sortModes .filter-btn').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    sortMode = btn.dataset.sort;
    render();
  });
});
 
loadBooks();