// 校内网社交原型 - 前端逻辑
const API = '';
let currentUID = 1;
let feedCache = [];

// ===== 工具函数 =====
function uid() { return currentUID; }
function apiUrl(path) { return API + path + (path.includes('?') ? '&' : '?') + 'uid=' + uid(); }

function formatTime(t) {
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

async function apiFetch(path, opts) {
  let res;
  try {
    res = await fetch(apiUrl(path), opts);
  } catch (e) {
    throw new Error('网络请求失败，请检查服务是否启动');
  }
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error('服务器返回了非JSON数据 (HTTP ' + res.status + ')');
  }
  if (!res.ok) {
    throw new Error((data && data.error) ? data.error : '请求失败 (HTTP ' + res.status + ')');
  }
  return data;
}

function escHtml(s) {
  if (s == null) return '';
  const div = document.createElement('div');
  div.textContent = String(s);
  return div.innerHTML;
}

// 安全取值，防止缺字段导致整页崩溃
function safeStr(v, def) { return (v != null && v !== '') ? String(v) : (def || ''); }
function safeNum(v, def) { return (v != null && !isNaN(v)) ? Number(v) : (def || 0); }
function safeArr(v) { return Array.isArray(v) ? v : []; }

// 页面级错误提示
function showPageError(msg, retryFn) {
  let el = document.getElementById('pageError');
  if (!el) {
    el = document.createElement('div');
    el.id = 'pageError';
    el.className = 'page-error';
    const topBar = document.querySelector('.top-bar');
    if (topBar) topBar.after(el);
    else document.body.prepend(el);
  }
  let retryBtn = '';
  if (retryFn) {
    const fnName = '__retry_' + Date.now();
    window[fnName] = function() { el.style.display = 'none'; retryFn(); };
    retryBtn = ' <button class="btn-small btn-add" onclick="' + fnName + '()">重试</button>';
  }
  el.innerHTML = escHtml(msg) + retryBtn;
  el.style.display = '';
}

function hidePageError() {
  const el = document.getElementById('pageError');
  if (el) el.style.display = 'none';
}

// 全局重试：重新加载所有首页数据（列表+统计+好友区）
function retryAll() {
  hidePageError();
  init();
}

// ===== 初始化 =====
let _booted = false;
function boot() {
  // 注册事件监听只做一次，防止 retryAll 重复绑定
  if (!_booted) {
    _booted = true;
    const sel = document.getElementById('userSelect');
    if (sel) sel.addEventListener('change', onUserChange);
  }
  init();
  // 超时兜底：8秒后如果 feedList 仍在"加载中"，显示重试
  setTimeout(function() {
    const list = document.getElementById('feedList');
    if (list && list.querySelector('.loading')) {
      list.innerHTML = '<div class="load-error"><p>加载超时，服务器可能未启动</p><button class="btn-small btn-add" onclick="retryAll()">重试</button></div>';
    }
  }, 8000);
}

async function init() {
  hidePageError();
  const list = document.getElementById('feedList');
  if (list) list.innerHTML = '<p class="loading">加载中...</p>';

  // 加载用户选择器（失败不阻塞后续）
  try {
    await loadUsers();
  } catch (e) {
    console.error('loadUsers error:', e);
  }

  // 加载核心数据
  try {
    await refresh();
  } catch (e) {
    console.error('refresh error:', e);
    showPageError('数据加载失败：' + e.message, init);
  }

  // 确保 feedList 不卡在"加载中"
  if (list && list.querySelector('.loading')) {
    list.innerHTML = '<div class="load-error"><p>动态加载异常</p><button class="btn-small btn-add" onclick="retryAll()">重试</button></div>';
  }
}

async function loadUsers() {
  const users = await apiFetch('/api/users');
  if (!Array.isArray(users)) throw new Error('用户数据格式异常');
  const sel = document.getElementById('userSelect');
  if (!sel) return;
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
  // 关闭可能打开的详情弹窗
  document.getElementById('detailModal').style.display = 'none';
  currentDetailPostID = null;
  refresh();
}

// 统一刷新：列表 + 统计 + 好友区
async function refresh() {
  await Promise.allSettled([loadFeed(), loadClassmates(), loadStats()]);
}

// ===== 动态列表 =====
async function loadFeed() {
  const list = document.getElementById('feedList');
  if (!list) return;
  list.innerHTML = '<p class="loading">加载中...</p>';
  try {
    const items = await apiFetch('/api/feed');
    if (!Array.isArray(items)) {
      list.innerHTML = '<div class="load-error"><p>动态数据格式异常</p><button class="btn-small btn-add" onclick="retryAll()">重试</button></div>';
      feedCache = [];
      return;
    }
    if (items.length === 0) {
      list.innerHTML = '<div class="load-error"><p>暂无可见动态</p><button class="btn-small btn-add" onclick="retryAll()">刷新</button></div>';
      feedCache = [];
      return;
    }
    feedCache = items;
    // 逐条渲染，单条失败不影响其他
    const htmlParts = [];
    for (let i = 0; i < items.length; i++) {
      try {
        htmlParts.push(renderFeedCard(items[i], i));
      } catch (renderErr) {
        console.error('renderFeedCard error at index', i, renderErr);
        htmlParts.push('<div class="feed-card"><div class="feed-content" style="color:#999;">动态内容暂时无法显示</div></div>');
      }
    }
    list.innerHTML = htmlParts.join('');
    if (!list.querySelector('.feed-card')) {
      list.innerHTML = '<div class="load-error"><p>渲染动态失败</p><button class="btn-small btn-add" onclick="retryAll()">重试</button></div>';
    }
  } catch (e) {
    list.innerHTML = '<div class="load-error"><p>加载动态失败：' + escHtml(e.message) + '</p><button class="btn-small btn-add" onclick="retryAll()">重试</button></div>';
    feedCache = [];
  }
}

function renderFeedCard(item, index) {
  const p = item.post || {};
  const author = item.author || {};
  const pid = p.id || ('idx_' + index);
  const likeIcon = item.is_liked ? '♥' : '♡';
  const likeCls = item.is_liked ? 'like-btn liked' : 'like-btn';
  const likeCount = safeNum(item.like_count);
  const commentCount = safeNum(item.comment_count);
  const visLabel = safeStr(item.visibility_label, '未知');
  const photoUrl = safeStr(p.photo_url);
  const content = safeStr(p.content, '（内容不可用）');
  const authorName = safeStr(author.name, '未知用户');
  const authorAvatar = safeStr(author.avatar_url);
  const createdAt = safeStr(p.created_at);
  const visibility = safeStr(p.visibility, 'public');

  // 评论预览（最多显示2条顶级评论）
  const comments = safeArr(item.comments);
  let commentPreview = '';
  if (comments.length > 0) {
    const previewList = comments.slice(0, 2);
    commentPreview = '<div class="feed-comment-preview">' +
      previewList.map(function(c) {
        const ca = c.author || {};
        const cm = c.comment || {};
        const replyCount = safeArr(c.replies).length;
        return '<div class="feed-cp-item"><span class="feed-cp-author">' + escHtml(safeStr(ca.name, '未知')) + '</span>: ' + escHtml(safeStr(cm.content, '（评论不可用）')) +
          (replyCount > 0 ? ' <span class="feed-cp-replies">(' + replyCount + '条回复)</span>' : '') +
        '</div>';
      }).join('') +
      (comments.length > 2 ? '<div class="feed-cp-more">还有 ' + (comments.length - 2) + ' 条评论</div>' : '') +
    '</div>';
  }

  return '<div class="feed-card" id="feedCard_' + pid + '">' +
    '<div class="feed-header">' +
      '<img class="feed-avatar" src="' + authorAvatar + '" alt="' + escHtml(authorName) + '" onerror="this.style.display=\'none\'">' +
      '<div>' +
        '<span class="feed-author">' + escHtml(authorName) + '</span> ' +
        '<span class="feed-time">' + formatTime(createdAt) + '</span> ' +
        '<span class="feed-visibility">' + escHtml(visLabel) + '</span>' +
      '</div>' +
    '</div>' +
    '<div class="feed-content">' + escHtml(content) + '</div>' +
    (photoUrl ? '<img class="feed-photo" src="' + photoUrl + '" alt="照片" onclick="openDetail(' + pid + ')" onerror="this.style.display=\'none\'">' : '') +
    '<div class="feed-actions">' +
      '<button class="' + likeCls + '" onclick="toggleLike(' + pid + ')">' + likeIcon + ' <span id="likeCount_' + pid + '">' + likeCount + '</span></button>' +
      '<span class="feed-comment-count">\uD83D\uDCAC <span id="commentCount_' + pid + '">' + commentCount + '</span> 条评论</span>' +
      '<button class="feed-action-btn" onclick="openDetail(' + pid + ')">查看详情</button>' +
    '</div>' +
    commentPreview +
  '</div>';
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
      if (item.post && item.post.id === postID) {
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
      body: JSON.stringify({ content: content, photo_url: photo, visibility: visibility })
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
    renderDetail(data);
  } catch (e) {
    renderDetailError(e.message);
  }
  document.getElementById('detailModal').style.display = '';
}

function renderDetailError(msg) {
  document.getElementById('detailBody').innerHTML =
    '<div class="detail-error">' +
      '<p class="error-msg">' + escHtml(msg) + '</p>' +
      '<div class="detail-error-actions">' +
        '<button class="feed-action-btn" onclick="openDetail(' + currentDetailPostID + ')">重试</button> ' +
        '<button class="feed-action-btn" onclick="closeDetail()">返回动态列表</button>' +
      '</div>' +
    '</div>';
  document.getElementById('detailModal').style.display = '';
}

function renderDetail(data) {
  const p = (data && data.post) || {};
  const author = (data && data.author) || {};
  const likeIcon = data.is_liked ? '♥' : '♡';
  const likeCls = data.is_liked ? 'like-btn liked' : 'like-btn';
  const isOwner = p.author_id === currentUID;
  const visSelector = isOwner ?
    '<div class="detail-vis-row">' +
      '<span>可见范围：</span>' +
      '<select id="detailVisSelect" onchange="changeVisibility(' + (p.id || 0) + ')">' +
        '<option value="public"' + (p.visibility === 'public' ? ' selected' : '') + '>公开</option>' +
        '<option value="friends"' + (p.visibility === 'friends' ? ' selected' : '') + '>仅好友</option>' +
        '<option value="self"' + (p.visibility === 'self' ? ' selected' : '') + '>仅自己</option>' +
      '</select>' +
    '</div>' : '';

  const commentCount = safeNum(data.comment_count);
  const likeCount = safeNum(data.like_count);
  const comments = safeArr(data.comments);
  const photoUrl = safeStr(p.photo_url);
  const content = safeStr(p.content, '（内容不可用）');
  const authorName = safeStr(author.name, '未知用户');
  const authorAvatar = safeStr(author.avatar_url);
  const createdAt = safeStr(p.created_at);

  document.getElementById('detailBody').innerHTML =
    '<input type="hidden" id="detailPostId" value="' + (p.id || '') + '">' +
    '<div class="detail-author-row">' +
      '<img class="detail-avatar" src="' + authorAvatar + '" alt="' + escHtml(authorName) + '" onerror="this.style.display=\'none\'">' +
      '<div>' +
        '<span class="feed-author">' + escHtml(authorName) + '</span> ' +
        '<span class="feed-time">' + formatTime(createdAt) + '</span> ' +
        '<span class="feed-visibility">' + escHtml(safeStr(data.visibility_label)) + '</span>' +
      '</div>' +
    '</div>' +
    visSelector +
    '<div class="detail-content">' + escHtml(content) + '</div>' +
    (photoUrl ? '<img class="detail-photo" src="' + photoUrl + '" alt="照片" onerror="this.style.display=\'none\'">' : '') +
    '<div class="detail-actions">' +
      '<button id="detailLikeBtn" class="' + likeCls + '" onclick="toggleLike(' + (p.id || 0) + ')">' + likeIcon + ' <span id="detailLikeCount">' + likeCount + '</span> 赞</button>' +
      '<span class="detail-comment-info">\uD83D\uDCAC ' + commentCount + ' 条评论</span>' +
    '</div>' +
    '<div class="detail-section-title">评论 (' + comments.length + ')</div>' +
    '<div id="commentsContainer">' + renderComments(comments) + '</div>' +
    '<div class="comment-form">' +
      '<input type="text" id="newCommentInput" placeholder="写评论..." onkeydown="if(event.key===\'Enter\')submitComment(' + (p.id || 0) + ')">' +
      '<button onclick="submitComment(' + (p.id || 0) + ')">发表</button>' +
    '</div>';
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
      body: JSON.stringify({ post_id: postID, visibility: visibility })
    });
    const visLabel = { public: '公开', friends: '仅好友', self: '仅自己' }[visibility] || visibility;
    const labelEl = document.querySelector('.detail-author-row .feed-visibility');
    if (labelEl) labelEl.textContent = visLabel;
    // 刷新列表、统计和好友区（可见范围变化影响列表和可见动态数）
    refresh();
  } catch (e) {
    showPageError('修改可见范围失败：' + e.message);
    openDetail(postID);
  }
}

function renderComments(comments) {
  if (!comments || comments.length === 0) return '<p style="color:#999;font-size:13px;">暂无评论，来说点什么吧</p>';
  return comments.map(function(c, i) {
    try {
      return renderCommentItem(c);
    } catch (e) {
      console.error('renderCommentItem error', i, e);
      return '';
    }
  }).join('');
}

function renderCommentItem(c) {
  const ca = c.author || {};
  const cm = c.comment || {};
  const commentId = cm.id || 0;
  const postId = cm.post_id || 0;
  let html =
    '<div class="comment-item">' +
      '<div class="comment-header">' +
        '<img class="comment-avatar" src="' + safeStr(ca.avatar_url) + '" alt="' + escHtml(safeStr(ca.name, '未知')) + '" onerror="this.style.display=\'none\'">' +
        '<span class="comment-author">' + escHtml(safeStr(ca.name, '未知')) + '</span> ' +
        '<span class="comment-time">' + formatTime(cm.created_at) + '</span>' +
      '</div>' +
      '<div class="comment-body">' + escHtml(safeStr(cm.content, '（评论不可用）')) + '</div>' +
      '<button class="comment-reply-btn" onclick="showReplyForm(' + commentId + ')">回复</button>' +
      '<div id="replyForm_' + commentId + '" style="display:none;" class="reply-form">' +
        '<div class="comment-form">' +
          '<input type="text" id="replyInput_' + commentId + '" placeholder="回复 ' + escHtml(safeStr(ca.name, '未知')) + '..." onkeydown="if(event.key===\'Enter\')submitReply(' + postId + ', ' + commentId + ')">' +
          '<button onclick="submitReply(' + postId + ', ' + commentId + ')">回复</button>' +
        '</div>' +
      '</div>';
  const replies = safeArr(c.replies);
  if (replies.length > 0) {
    html += '<div class="replies-list">' + replies.map(function(r) {
      const ra = r.author || {};
      const rm = r.comment || {};
      return '<div class="reply-item">' +
        '<div class="comment-header">' +
          '<img class="comment-avatar" src="' + safeStr(ra.avatar_url) + '" alt="' + escHtml(safeStr(ra.name, '未知')) + '" onerror="this.style.display=\'none\'">' +
          '<span class="comment-author">' + escHtml(safeStr(ra.name, '未知')) + '</span> ' +
          '<span class="comment-time">' + formatTime(rm.created_at) + '</span>' +
        '</div>' +
        '<div class="comment-body">' + escHtml(safeStr(rm.content, '（回复不可用）')) + '</div>' +
      '</div>';
    }).join('') + '</div>';
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
  const content = input ? input.value.trim() : '';
  if (!content) return;
  try {
    await apiFetch('/api/comments/create?post_id=' + postID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content })
    });
    await openDetail(postID);
    refresh(); // 同步刷新列表和统计
  } catch (e) {
    showPageError('评论失败：' + e.message);
  }
}

async function submitReply(postID, parentID) {
  const input = document.getElementById('replyInput_' + parentID);
  const content = input ? input.value.trim() : '';
  if (!content) return;
  try {
    await apiFetch('/api/comments/create?post_id=' + postID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content, parent_id: parentID })
    });
    await openDetail(postID);
    refresh(); // 同步刷新列表和统计
  } catch (e) {
    showPageError('回复失败：' + e.message);
  }
}

function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
  currentDetailPostID = null;
  refresh(); // 关闭详情时同步刷新列表+统计+好友
}

// ===== 同学/好友（完整状态流转） =====
async function loadClassmates() {
  const container = document.getElementById('classmatesList');
  if (!container) return;
  try {
    const items = await apiFetch('/api/classmates');
    if (!Array.isArray(items) || items.length === 0) {
      container.innerHTML = '<p style="color:#999;font-size:13px;">暂无同学</p>';
      return;
    }
    container.innerHTML = items.map(function(c, i) {
      try {
        const u = c.user || {};
        const s = c.friend_status || 'none';
        const cid = u.id;
        const relId = c.relation_id || 0;
        let statusHtml = '';
        if (s === 'accepted') {
          statusHtml = '<span class="classmate-status">好友</span><button class="btn-small btn-unfriend" onclick="unfriend(' + cid + ')">解除</button>';
        } else if (s === 'pending') {
          statusHtml = '<span class="classmate-status">待确认</span><button class="btn-small btn-cancel" onclick="cancelFriend(' + cid + ')">取消</button>';
        } else if (s === 'pending_received') {
          statusHtml = '<span class="classmate-status">申请你</span><button class="btn-small btn-accept" onclick="acceptFriend(' + relId + ')">接受</button><button class="btn-small btn-reject" onclick="rejectFriend(' + relId + ')">拒绝</button>';
        } else {
          statusHtml = '<span class="classmate-status">陌生人</span><button class="btn-small btn-add" onclick="addFriend(' + cid + ')">添加</button>';
        }
        return '<div class="classmate-item">' +
          '<img class="classmate-avatar" src="' + safeStr(u.avatar_url) + '" alt="' + escHtml(safeStr(u.name)) + '" onerror="this.style.display=\'none\'">' +
          '<div class="classmate-info">' +
            '<div class="classmate-name">' + escHtml(safeStr(u.name, '未知')) + '</div>' +
          '</div>' +
          statusHtml +
        '</div>';
      } catch (e) {
        console.error('renderClassmate error', i, e);
        return '';
      }
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="load-error"><p>加载失败：' + escHtml(e.message) + '</p><button class="btn-small btn-add" onclick="retryAll()">重试</button></div>';
  }
}

async function addFriend(toID) {
  try {
    await apiFetch('/api/friends/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to_id: toID })
    });
    refresh(); // 刷新列表+统计+好友区
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
    if (!stats) return;
    const ids = {
      post_count: 'statPostCount',
      friend_count: 'statFriendCount',
      pending_count: 'statPendingCount',
      visible_post_count: 'statVisibleCount',
      my_posts_visible_count: 'statMyVisibleCount'
    };
    for (const [key, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el) el.textContent = stats[key] != null ? stats[key] : 0;
    }
  } catch (e) {
    console.error('loadStats error:', e);
    // 统计加载失败不阻塞，保留上次值或默认0
  }
}

// 点击遮罩关闭详情
document.addEventListener('click', function(e) {
  if (e.target.id === 'detailModal') closeDetail();
});

// 启动 —— 使用 DOMContentLoaded 确保DOM就绪
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
