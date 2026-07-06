// 校内网社交原型 - 前端逻辑
const API = '';
let currentUID = 1;
// 本地缓存 feed 数据，方便详情操作后同步更新卡片
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
  return res.json();
}

function escHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

// ===== 初始化 =====
async function init() {
  try {
    await loadUsers();
    await refresh();
  } catch (e) {
    console.error('init error:', e);
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
  loadFeed();
  loadClassmates();
  loadStats();
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
    console.error('loadFeed error:', e);
    list.innerHTML = '<p class="loading">加载失败，请刷新重试</p>';
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
    const res = await fetch(apiUrl('/api/likes/toggle'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ post_id: postID })
    });
    const data = await res.json();
    if (data.error) return;
    // 更新列表卡片上的点赞
    updateCardLike(postID, data.liked, data.like_count);
    // 如果详情弹窗打开且是同一动态，也更新
    updateDetailLike(postID, data.liked, data.like_count);
    // 同步 feedCache
    for (const item of feedCache) {
      if (item.post.id === postID) {
        item.is_liked = data.liked;
        item.like_count = data.like_count;
        break;
      }
    }
  } catch (e) {
    console.error('toggleLike error:', e);
  }
}

function updateCardLike(postID, liked, likeCount) {
  const el = document.getElementById('likeCount_' + postID);
  if (el) el.textContent = likeCount;
  const card = document.getElementById('feedCard_' + postID);
  if (card) {
    const btn = card.querySelector('.like-btn');
    if (btn) {
      btn.className = liked ? 'like-btn liked' : 'like-btn';
      btn.innerHTML = (liked ? '♥' : '♡') + ' <span id="likeCount_' + postID + '">' + likeCount + '</span>';
    }
  }
}

function updateDetailLike(postID, liked, likeCount) {
  const el = document.getElementById('detailLikeCount');
  if (!el) return;
  // 检查详情弹窗是否是同一个动态
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

  await fetch(apiUrl('/api/posts/create'), {
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
let currentDetailPostID = null;

async function openDetail(postID) {
  currentDetailPostID = postID;
  const data = await apiFetch('/api/posts/detail?id=' + postID);

  if (data.error) {
    const body = document.getElementById('detailBody');
    body.innerHTML = `
      <div class="detail-error">
        <p class="error-msg">${escHtml(data.error)}</p>
        <button class="feed-action-btn" onclick="closeDetail()">返回动态列表</button>
      </div>`;
    document.getElementById('detailModal').style.display = '';
    return;
  }

  renderDetail(data);
  document.getElementById('detailModal').style.display = '';
}

function renderDetail(data) {
  const p = data.post;
  const likeIcon = data.is_liked ? '♥' : '♡';
  const likeCls = data.is_liked ? 'like-btn liked' : 'like-btn';
  const body = document.getElementById('detailBody');
  body.innerHTML = `
    <input type="hidden" id="detailPostId" value="${p.id}">
    <div class="detail-author-row">
      <img class="detail-avatar" src="${data.author.avatar_url}" alt="${escHtml(data.author.name)}">
      <div>
        <span class="feed-author">${escHtml(data.author.name)}</span>
        <span class="feed-time">${formatTime(p.created_at)}</span>
        <span class="feed-visibility">${escHtml(data.visibility_label)}</span>
      </div>
    </div>
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
  await fetch(apiUrl('/api/comments/create?post_id=' + postID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content })
  });
  // 重新加载详情
  await openDetail(postID);
  // 更新列表卡片的评论数
  updateCardCommentCount(postID);
  loadStats();
}

async function submitReply(postID, parentID) {
  const input = document.getElementById('replyInput_' + parentID);
  const content = input.value.trim();
  if (!content) return;
  await fetch(apiUrl('/api/comments/create?post_id=' + postID), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, parent_id: parentID })
  });
  await openDetail(postID);
  updateCardCommentCount(postID);
  loadStats();
}

async function updateCardCommentCount(postID) {
  // 从详情API拿最新评论数更新列表卡片
  try {
    const data = await apiFetch('/api/posts/detail?id=' + postID);
    if (!data.error) {
      const el = document.getElementById('commentCount_' + postID);
      if (el) el.textContent = data.comment_count;
    }
  } catch (e) {}
}

function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
  currentDetailPostID = null;
  // 关闭详情时刷新列表（确保数字同步）
  loadFeed();
  loadStats();
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
        <img class="classmate-avatar" src="${c.user.avatar_url}" alt="${escHtml(c.user.name)}">
        <div class="classmate-info">
          <div class="classmate-name">${escHtml(c.user.name)}</div>
        </div>
        ${statusHtml}
      </div>`;
  }).join('');
}

async function addFriend(toID) {
  await fetch(apiUrl('/api/friends/send'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to_id: toID })
  });
  refresh();
}

async function acceptFriend(relationID, fromUserID) {
  await fetch(apiUrl('/api/friends/accept'), {
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

// 点击弹窗遮罩关闭详情
document.addEventListener('click', function(e) {
  if (e.target.id === 'detailModal') {
    closeDetail();
  }
});

// 启动
init();
