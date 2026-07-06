// 校内网社交原型 - 前端逻辑
const API = '';
let currentUID = 1;

// ===== 工具函数 =====
function uid() { return currentUID; }
function api(path) { return API + path + (path.includes('?') ? '&' : '?') + 'uid=' + uid(); }

function formatTime(t) {
  const d = new Date(t);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  return d.getMonth() + 1 + '月' + d.getDate() + '日 ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function apiFetch(path, opts) {
  const res = await fetch(api(path), opts);
  return res.json();
}

// ===== 初始化 =====
async function init() {
  await loadUsers();
  await refresh();
  document.getElementById('userSelect').addEventListener('change', onUserChange);
}

async function loadUsers() {
  const data = await apiFetch('/api/classmates');
  // 自己不在classmates里，先获取feed拿到当前用户信息（通过默认uid=1）
  const sel = document.getElementById('userSelect');
  // 手动构造用户列表（从API我们能看到5个用户，自己 + 4个同学）
  // 用classmates列表来反推所有用户
  const knownUsers = [
    { id: 1, name: '张三' },
    { id: 2, name: '李四' },
    { id: 3, name: '王五' },
    { id: 4, name: '赵六' },
    { id: 5, name: '钱七' }
  ];
  sel.innerHTML = '';
  knownUsers.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    if (u.id === currentUID) opt.selected = true;
    sel.appendChild(opt);
  });
}

function onUserChange(e) {
  currentUID = parseInt(e.target.value);
  refresh();
}

async function refresh() {
  loadFeed();
  loadClassmates();
  loadStats();
}

// ===== 动态列表 =====
async function loadFeed() {
  const list = document.getElementById('feedList');
  list.innerHTML = '<p class="loading">加载中...</p>';
  const items = await apiFetch('/api/feed');
  if (!items || items.length === 0) {
    list.innerHTML = '<p class="loading">暂无可见动态</p>';
    return;
  }
  list.innerHTML = items.map(renderFeedCard).join('');
}

function renderFeedCard(item) {
  const p = item.post;
  return `
    <div class="feed-card">
      <div class="feed-header">
        <img class="feed-avatar" src="${item.author.avatar_url}" alt="${item.author.name}">
        <div>
          <span class="feed-author">${item.author.name}</span>
          <span class="feed-time">${formatTime(p.created_at)}</span>
          <span class="feed-visibility">${item.visibility_label}</span>
        </div>
      </div>
      <div class="feed-content">${escHtml(p.content)}</div>
      <img class="feed-photo" src="${p.photo_url}" alt="照片" onclick="openDetail(${p.id})">
      <div class="feed-actions">
        <span class="feed-comment-count">${item.comment_count} 条评论</span>
        <button class="feed-action-btn" onclick="openDetail(${p.id})">查看详情</button>
        <button class="feed-action-btn" onclick="openDetail(${p.id})">评论/回复</button>
      </div>
    </div>`;
}

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ===== 发布动态 =====
async function createPost() {
  const content = document.getElementById('publishContent').value.trim();
  if (!content) { alert('请输入内容'); return; }
  const photo = document.getElementById('publishPhoto').value.trim();
  const visibility = document.getElementById('publishVisibility').value;

  await fetch(api('/api/posts/create'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, photo_url: photo, visibility })
  });

  document.getElementById('publishContent').value = '';
  document.getElementById('publishPhoto').value = '';
  document.getElementById('publishVisibility').value = 'public';
  refresh();
}

// ===== 动态详情 =====
async function openDetail(postID) {
  const data = await apiFetch('/api/posts/detail&id=' + postID);
  if (data.error) { alert(data.error); return; }

  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <div class="detail-author-row">
      <img class="detail-avatar" src="${data.author.avatar_url}" alt="${data.author.name}">
      <div>
        <span class="feed-author">${data.author.name}</span>
        <span class="feed-time">${formatTime(data.post.created_at)}</span>
        <span class="feed-visibility">${data.visibility_label}</span>
      </div>
    </div>
    <div class="detail-content">${escHtml(data.post.content)}</div>
    <img class="detail-photo" src="${data.post.photo_url}" alt="照片">
    <div class="detail-section-title">评论 (${data.comments.length})</div>
    <div id="commentsContainer">${renderComments(data.comments)}</div>
    <div class="comment-form">
      <input type="text" id="newCommentInput" placeholder="写评论...">
      <button onclick="submitComment(${postID})">发表</button>
    </div>`;

  document.getElementById('detailModal').style.display = '';
}

function renderComments(comments) {
  if (!comments || comments.length === 0) return '<p style="color:#999;font-size:13px;">暂无评论</p>';
  return comments.map(c => renderCommentItem(c)).join('');
}

function renderCommentItem(c) {
  let html = `
    <div class="comment-item">
      <div class="comment-header">
        <img class="comment-avatar" src="${c.author.avatar_url}" alt="${c.author.name}">
        <span class="comment-author">${c.author.name}</span>
        <span class="comment-time">${formatTime(c.comment.created_at)}</span>
      </div>
      <div class="comment-body">${escHtml(c.comment.content)}</div>
      <button class="comment-reply-btn" onclick="showReplyForm(this, ${c.comment.id})">回复</button>
      <div id="replyForm_${c.comment.id}" style="display:none;" class="reply-form">
        <div class="comment-form">
          <input type="text" id="replyInput_${c.comment.id}" placeholder="回复 ${c.author.name}...">
          <button onclick="submitReply(${c.comment.post_id}, ${c.comment.id})">回复</button>
        </div>
      </div>`;
  if (c.replies && c.replies.length > 0) {
    html += c.replies.map(r => `
      <div class="reply-item">
        <div class="comment-header">
          <img class="comment-avatar" src="${r.author.avatar_url}" alt="${r.author.name}">
          <span class="comment-author">${r.author.name}</span>
          <span class="comment-time">${formatTime(r.comment.created_at)}</span>
        </div>
        <div class="comment-body">${escHtml(r.comment.content)}</div>
      </div>`).join('');
  }
  html += '</div>';
  return html;
}

function showReplyForm(btn, commentID) {
  const form = document.getElementById('replyForm_' + commentID);
  form.style.display = form.style.display === 'none' ? '' : 'none';
}

async function submitComment(postID) {
  const input = document.getElementById('newCommentInput');
  const content = input.value.trim();
  if (!content) return;
  await fetch(api('/api/comments/create&post_id=' + postID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  openDetail(postID);
}

async function submitReply(postID, parentID) {
  const input = document.getElementById('replyInput_' + parentID);
  const content = input.value.trim();
  if (!content) return;
  await fetch(api('/api/comments/create&post_id=' + postID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, parent_id: parentID })
  });
  openDetail(postID);
}

function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
  refresh();
}

// ===== 同学/好友 =====
async function loadClassmates() {
  const items = await apiFetch('/api/classmates');
  const container = document.getElementById('classmatesList');
  if (!items || items.length === 0) {
    container.innerHTML = '<p style="color:#999;font-size:13px;">暂无同学</p>';
    return;
  }
  container.innerHTML = items.map(c => {
    let statusHtml = '';
    const s = c.friend_status;
    if (s === 'accepted') {
      statusHtml = `<span class="classmate-status">已是好友</span><button class="btn-small btn-friend" disabled>好友</button>`;
    } else if (s === 'pending') {
      statusHtml = `<span class="classmate-status">已申请</span><button class="btn-small btn-pending" disabled>待确认</button>`;
    } else if (s === 'pending_received') {
      statusHtml = `<span class="classmate-status">申请你</span><button class="btn-small btn-accept" onclick="acceptFriend(${c.relation_id}, ${c.user.id})">接受</button>`;
    } else {
      statusHtml = `<span class="classmate-status">可添加</span><button class="btn-small btn-add" onclick="addFriend(${c.user.id})">添加</button>`;
    }
    return `
      <div class="classmate-item">
        <img class="classmate-avatar" src="${c.user.avatar_url}" alt="${c.user.name}">
        <div class="classmate-info">
          <div class="classmate-name">${c.user.name}</div>
        </div>
        ${statusHtml}
      </div>`;
  }).join('');
}

async function addFriend(toID) {
  await fetch(api('/api/friends/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_id: toID })
  });
  refresh();
}

async function acceptFriend(relationID, fromUserID) {
  await fetch(api('/api/friends/accept'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ relation_id: relationID })
  });
  refresh();
}

// ===== 统计 =====
async function loadStats() {
  const stats = await apiFetch('/api/stats');
  document.getElementById('statPostCount').textContent = stats.post_count;
  document.getElementById('statFriendCount').textContent = stats.friend_count;
  document.getElementById('statPendingCount').textContent = stats.pending_count;
  document.getElementById('statVisibleCount').textContent = stats.visible_post_count;
}

// 启动
init();
