// 校内网社交原型 - 前端逻辑
const API = '';
let currentUID = 1;
let feedCache = [];

// ===== 工具函数 =====
function uid() { return currentUID; }
function apiUrl(path) { return API + path + (path.includes('?') ? '&' : '?') + 'uid=' + uid(); }

function formatTime(t) {
  const d = new Date(t);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function apiFetch(path, opts) {
  const res = await fetch(apiUrl(path), opts);
  const data = await res.json();
  if (!res.ok && data.error) {
    throw new Error(data.error);
  }
  return data;
}

function escHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

// 页面级错误提示
function showPageError(msg, retryFn) {
  let el = document.getElementById('pageError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pageError';
    el.className = 'page-error';
    document.querySelector('.top-bar').after(el);
  }
  el.innerHTML = escHtml(msg) + (retryFn ? ' <button class="btn-small btn-add" onclick="this.parentElement.style.display=\'none\';(' + retryFn.toString() + ')()">重试</button>' : '');
  el.style.display = '';
}

function hidePageError() {
  const el = document.getElementById('pageError');
  if (el) el.style.display = 'none';
}

// ===== 初始化 =====
async function init() {
  hidePageError();
  try {
    await loadUsers();
    await refresh();
  } catch (e) {
    console.error('init error:', e);
    showPageError('页面初始化失败：' + e.message, init);
  }
  document.getElementById('userSelect').addEventListener('change', onUserChange);
}

async function loadUsers() {
  const users = await apiFetch('/api/users');
  const sel = document.getElementById('userSelect');
  sel.innerHTML = '';
  users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    if (u.id === currentUID) opt.selected = true;
    sel.appendChild(opt);
  });
}

function onUserChange(e) {
  currentUID = parseInt(e.target.value);
  feedCache = [];
  refresh();
}

async function refresh() {
  Promise.all([loadFeed(), loadClassmates(), loadStats()]).catch(e => {
    console.error('refresh error:', e);
    showPageError('数据刷新失败：' + e.message, refresh);
  });
}

// ===== 动态列表 =====
async function loadFeed() {
  const list = document.getElementById('feedList');
  list.innerHTML = '<p class="loading">加载中...</p>';
  try {
    const items = await apiFetch('/api/feed');
    if (!items || items.length === 0) {
      list.innerHTML = '<p class="loading">暂无可见动态</p>';
      feedCache = [];
      return;
    }
    feedCache = items;
    list.innerHTML = items.map(renderFeedCard).join('');
  } catch (e) {
    list.innerHTML = '<div class="load-error"><p>加载动态失败：' + escHtml(e.message) + '</p><button class="btn-small btn-add" onclick="loadFeed()">重试</button></div>';
    feedCache = [];
  }
}

function renderFeedCard(item) {
  const p = item.post;
  const likeIcon = item.is_liked ? '♥' : '♡';
  const likeCls = item.is_liked ? 'like-btn liked' : 'like-btn';
  return `
    <div class="feed-card" id="feedCard_${p.id}">
      <div class="feed-header">
        <img class="feed-avatar" src="${item.author.avatar_url}" alt="${escHtml(item.author.name)}">
        <div>
          <span class="feed-author">${escHtml(item.author.name)}</span>
          <span class="feed-time">${formatTime(p.created_at)}</span>
          <span class="feed-visibility">${escHtml(item.visibility_label)}</span>
        </div>
      </div>
      <div class="feed-content">${escHtml(p.content)}</div>
      <img class="feed-photo" src="${p.photo_url}" alt="照片" onclick="openDetail(${p.id})">
      <div class="feed-actions">
        <button class="${likeCls}" onclick="toggleLike(${p.id})">${likeIcon} <span id="likeCount_${p.id}">${item.like_count}</span></button>
        <span class="feed-comment-count">💬 <span id="commentCount_${p.id}">${item.comment_count}</span> 条评论</span>
        <button class="feed-action-btn" onclick="openDetail(${p.id})">查看详情</button>
      </div>
    </div>`;
}

// ===== 点赞 =====
async function toggleLike(postID) {
  try {
    const data = await apiFetch('/api/likes/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postID })
    });
    updateCardLike(postID, data.liked, data.like_count);
    updateDetailLike(postID, data.liked, data.like_count);
    for (const item of feedCache) {
      if (item.post.id === postID) {
        item.is_liked = data.liked;
        item.like_count = data.like_count;
        break;
      }
    }
  } catch (e) {
    showPageError('点赞失败：' + e.message);
  }
}

function updateCardLike(postID, liked, likeCount) {
  const card = document.getElementById('feedCard_' + postID);
  if (!card) return;
  const btn = card.querySelector('.like-btn');
  if (btn) {
    btn.className = liked ? 'like-btn liked' : 'like-btn';
    btn.innerHTML = (liked ? '♥' : '♡') + ' <span id="likeCount_' + postID + '">' + likeCount + '</span>';
  }
}

function updateDetailLike(postID, liked, likeCount) {
  const el = document.getElementById('detailLikeCount');
  if (!el) return;
  const detailPostId = document.getElementById('detailPostId');
  if (!detailPostId || parseInt(detailPostId.value) !== postID) return;
  el.textContent = likeCount;
  const btn = document.getElementById('detailLikeBtn');
  if (btn) {
    btn.className = liked ? 'like-btn liked' : 'like-btn';
    btn.innerHTML = (liked ? '♥' : '♡') + ' <span id="detailLikeCount">' + likeCount + '</span> 赞';
  }
}

// ===== 发布动态 =====
async function createPost() {
  const content = document.getElementById('publishContent').value.trim();
  if (!content) { alert('请输入内容'); return; }
  const photo = document.getElementById('publishPhoto').value.trim();
  const visibility = document.getElementById('publishVisibility').value;
  try {
    await apiFetch('/api/posts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, photo_url: photo, visibility })
    });
    document.getElementById('publishContent').value = '';
    document.getElementById('publishPhoto').value = '';
    document.getElementById('publishVisibility').value = 'public';
    refresh();
  } catch (e) {
    showPageError('发布失败：' + e.message);
  }
}

// ===== 动态详情 =====
let currentDetailPostID = null;

async function openDetail(postID) {
  currentDetailPostID = postID;
  try {
    const data = await apiFetch('/api/posts/detail?id=' + postID);
    if (data.error) {
      renderDetailError(data.error);
      return;
    }
    renderDetail(data);
  } catch (e) {
    renderDetailError(e.message);
  }
  document.getElementById('detailModal').style.display = '';
}

function renderDetailError(msg) {
  document.getElementById('detailBody').innerHTML = `
    <div class="detail-error">
      <p class="error-msg">${escHtml(msg)}</p>
      <button class="feed-action-btn" onclick="closeDetail()">返回动态列表</button>
    </div>`;
  document.getElementById('detailModal').style.display = '';
}

function renderDetail(data) {
  const p = data.post;
  const likeIcon = data.is_liked ? '♥' : '♡';
  const likeCls = data.is_liked ? 'like-btn liked' : 'like-btn';
  const isOwner = p.author_id === currentUID;
  // 可见性选择器（仅作者可见）
  const visSelector = isOwner ? `
    <div class="detail-vis-row">
      <span>可见范围：</span>
      <select id="detailVisSelect" onchange="changeVisibility(${p.id})">
        <option value="public" ${p.visibility === 'public' ? 'selected' : ''}>公开</option>
        <option value="friends" ${p.visibility === 'friends' ? 'selected' : ''}>仅好友</option>
        <option value="self" ${p.visibility === 'self' ? 'selected' : ''}>仅自己</option>
      </select>
    </div>` : '';

  document.getElementById('detailBody').innerHTML = `
    <input type="hidden" id="detailPostId" value="${p.id}">
    <div class="detail-author-row">
      <img class="detail-avatar" src="${data.author.avatar_url}" alt="${escHtml(data.author.name)}">
      <div>
        <span class="feed-author">${escHtml(data.author.name)}</span>
        <span class="feed-time">${formatTime(p.created_at)}</span>
        <span class="feed-visibility">${escHtml(data.visibility_label)}</span>
      </div>
    </div>
    ${visSelector}
    <div class="detail-content">${escHtml(p.content)}</div>
    <img class="detail-photo" src="${p.photo_url}" alt="照片">
    <div class="detail-actions">
      <button id="detailLikeBtn" class="${likeCls}" onclick="toggleLike(${p.id})">${likeIcon} <span id="detailLikeCount">${data.like_count}</span> 赞</button>
      <span class="detail-comment-info">💬 ${data.comment_count} 条评论</span>
    </div>
    <div class="detail-section-title">评论 (${data.comments.length})</div>
    <div id="commentsContainer">${renderComments(data.comments)}</div>
    <div class="comment-form">
      <input type="text" id="newCommentInput" placeholder="写评论..." onkeydown="if(event.key==='Enter')submitComment(${p.id})">
      <button onclick="submitComment(${p.id})">发表</button>
    </div>`;
}

// ===== 修改可见范围 =====
async function changeVisibility(postID) {
  const sel = document.getElementById('detailVisSelect');
  if (!sel) return;
  const visibility = sel.value;
  try {
    await apiFetch('/api/posts/visibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postID, visibility })
    });
    // 更新详情里的可见范围标签
    const visLabel = { public: '公开', friends: '仅好友', self: '仅自己' }[visibility] || visibility;
    const labelEl = document.querySelector('.detail-author-row .feed-visibility');
    if (labelEl) labelEl.textContent = visLabel;
    // 刷新列表和统计（可见范围变化可能影响列表和可见动态数）
    loadFeed();
    loadStats();
  } catch (e) {
    showPageError('修改可见范围失败：' + e.message);
    // 回退选择器
    openDetail(postID);
  }
}

function renderComments(comments) {
  if (!comments || comments.length === 0) return '<p style="color:#999;font-size:13px;">暂无评论，来说点什么吧</p>';
  return comments.map(c => renderCommentItem(c)).join('');
}

function renderCommentItem(c) {
  let html = `
    <div class="comment-item">
      <div class="comment-header">
        <img class="comment-avatar" src="${c.author.avatar_url}" alt="${escHtml(c.author.name)}">
        <span class="comment-author">${escHtml(c.author.name)}</span>
        <span class="comment-time">${formatTime(c.comment.created_at)}</span>
      </div>
      <div class="comment-body">${escHtml(c.comment.content)}</div>
      <button class="comment-reply-btn" onclick="showReplyForm(${c.comment.id})">回复</button>
      <div id="replyForm_${c.comment.id}" style="display:none;" class="reply-form">
        <div class="comment-form">
          <input type="text" id="replyInput_${c.comment.id}" placeholder="回复 ${escHtml(c.author.name)}..." onkeydown="if(event.key==='Enter')submitReply(${c.comment.post_id}, ${c.comment.id})">
          <button onclick="submitReply(${c.comment.post_id}, ${c.comment.id})">回复</button>
        </div>
      </div>`;
  if (c.replies && c.replies.length > 0) {
    html += '<div class="replies-list">' + c.replies.map(r => `
      <div class="reply-item">
        <div class="comment-header">
          <img class="comment-avatar" src="${r.author.avatar_url}" alt="${escHtml(r.author.name)}">
          <span class="comment-author">${escHtml(r.author.name)}</span>
          <span class="comment-time">${formatTime(r.comment.created_at)}</span>
        </div>
        <div class="comment-body">${escHtml(r.comment.content)}</div>
      </div>`).join('') + '</div>';
  }
  html += '</div>';
  return html;
}

function showReplyForm(commentID) {
  const form = document.getElementById('replyForm_' + commentID);
  if (!form) return;
  form.style.display = form.style.display === 'none' ? '' : 'none';
  if (form.style.display !== 'none') {
    const input = document.getElementById('replyInput_' + commentID);
    if (input) input.focus();
  }
}

async function submitComment(postID) {
  const input = document.getElementById('newCommentInput');
  const content = input.value.trim();
  if (!content) return;
  try {
    await apiFetch('/api/comments/create?post_id=' + postID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    await openDetail(postID);
    updateCardCommentCount(postID);
    loadStats();
  } catch (e) {
    showPageError('评论失败：' + e.message);
  }
}

async function submitReply(postID, parentID) {
  const input = document.getElementById('replyInput_' + parentID);
  const content = input.value.trim();
  if (!content) return;
  try {
    await apiFetch('/api/comments/create?post_id=' + postID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, parent_id: parentID })
    });
    await openDetail(postID);
    updateCardCommentCount(postID);
    loadStats();
  } catch (e) {
    showPageError('回复失败：' + e.message);
  }
}

async function updateCardCommentCount(postID) {
  try {
    const data = await apiFetch('/api/posts/detail?id=' + postID);
    if (!data.error) {
      const el = document.getElementById('commentCount_' + postID);
      if (el) el.textContent = data.comment_count;
    }
  } catch (e) { /* ignore */ }
}

function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
  currentDetailPostID = null;
  loadFeed();
  loadStats();
}

// ===== 同学/好友（完整状态流转） =====
async function loadClassmates() {
  try {
    const items = await apiFetch('/api/classmates');
    const container = document.getElementById('classmatesList');
    if (!items || items.length === 0) {
      container.innerHTML = '<p style="color:#999;font-size:13px;">暂无同学</p>';
      return;
    }
    container.innerHTML = items.map(c => {
      const s = c.friend_status;
      const uid = c.user.id;
      const relId = c.relation_id;
      let statusHtml = '';
      if (s === 'accepted') {
        // 已是好友 → 可解除
        statusHtml = `<span class="classmate-status">好友</span><button class="btn-small btn-unfriend" onclick="unfriend(${uid})">解除</button>`;
      } else if (s === 'pending') {
        // 已发出待确认 → 可取消
        statusHtml = `<span class="classmate-status">待确认</span><button class="btn-small btn-cancel" onclick="cancelFriend(${uid})">取消</button>`;
      } else if (s === 'pending_received') {
        // 收到申请 → 可接受/拒绝
        statusHtml = `<span class="classmate-status">申请你</span><button class="btn-small btn-accept" onclick="acceptFriend(${relId})">接受</button><button class="btn-small btn-reject" onclick="rejectFriend(${relId})">拒绝</button>`;
      } else {
        // 陌生人 → 可添加
        statusHtml = `<span class="classmate-status">陌生人</span><button class="btn-small btn-add" onclick="addFriend(${uid})">添加</button>`;
      }
      return `
        <div class="classmate-item">
          <img class="classmate-avatar" src="${c.user.avatar_url}" alt="${escHtml(c.user.name)}">
          <div class="classmate-info">
            <div class="classmate-name">${escHtml(c.user.name)}</div>
          </div>
          ${statusHtml}
        </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('classmatesList').innerHTML = '<p style="color:#e74c3c;font-size:13px;">加载失败</p>';
  }
}

async function addFriend(toID) {
  try {
    await apiFetch('/api/friends/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_id: toID })
    });
    refresh();
  } catch (e) {
    showPageError('发送申请失败：' + e.message);
  }
}

async function cancelFriend(toID) {
  try {
    await apiFetch('/api/friends/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_id: toID })
    });
    refresh();
  } catch (e) {
    showPageError('取消申请失败：' + e.message);
  }
}

async function acceptFriend(relationID) {
  try {
    await apiFetch('/api/friends/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relation_id: relationID })
    });
    refresh();
  } catch (e) {
    showPageError('接受申请失败：' + e.message);
  }
}

async function rejectFriend(relationID) {
  try {
    await apiFetch('/api/friends/reject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relation_id: relationID })
    });
    refresh();
  } catch (e) {
    showPageError('拒绝申请失败：' + e.message);
  }
}

async function unfriend(friendID) {
  if (!confirm('确定解除好友关系？')) return;
  try {
    await apiFetch('/api/friends/unfriend', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friend_id: friendID })
    });
    refresh();
  } catch (e) {
    showPageError('解除好友失败：' + e.message);
  }
}

// ===== 统计 =====
async function loadStats() {
  try {
    const stats = await apiFetch('/api/stats');
    document.getElementById('statPostCount').textContent = stats.post_count;
    document.getElementById('statFriendCount').textContent = stats.friend_count;
    document.getElementById('statPendingCount').textContent = stats.pending_count;
    document.getElementById('statVisibleCount').textContent = stats.visible_post_count;
  } catch (e) {
    // 统计区保持上次数据即可，不打断用户
    console.error('loadStats error:', e);
  }
}

// 点击遮罩关闭详情
document.addEventListener('click', function(e) {
  if (e.target.id === 'detailModal') closeDetail();
});

// 启动
init();
