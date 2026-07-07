// 校内网社交原型 - 前端逻辑（事件委托版，全异常状态覆盖）
const API = '';
let currentUID = 1;
let feedCache = [];
let _refreshLock = false;  // 防并发刷新锁

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

function safeStr(v, def) { return (v != null && v !== '') ? String(v) : (def || ''); }
function safeNum(v, def) { return (v != null && !isNaN(v)) ? Number(v) : (def || 0); }
function safeArr(v) { return Array.isArray(v) ? v : []; }

// ===== 页面级错误提示 =====
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
  el.innerHTML = '<span class="page-error-msg">' + escHtml(msg) + '</span>' +
    (retryFn ? '<button class="btn-small btn-add page-retry-btn">重试</button>' : '');
  el.style.display = '';
  if (retryFn) {
    const btn = el.querySelector('.page-retry-btn');
    if (btn) btn.onclick = function() { el.style.display = 'none'; retryFn(); };
  }
}

function hidePageError() {
  const el = document.getElementById('pageError');
  if (el) el.style.display = 'none';
}

// ===== 通用加载错误/空状态渲染（稳定事件绑定，不拼接行内代码） =====
function showLoadError(container, msg, retryFn) {
  const retryId = 'retryBtn_' + Math.random().toString(36).slice(2, 8);
  container.innerHTML = '<div class="load-error"><p>' + escHtml(msg) + '</p>' +
    '<button class="btn-small btn-add" id="' + retryId + '">重试</button></div>';
  const btn = document.getElementById(retryId);
  if (btn && retryFn) btn.addEventListener('click', retryFn);
}

// ===== 初始化 =====
let _booted = false;
function boot() {
  if (!_booted) {
    _booted = true;
    // 静态按钮绑定（只绑一次）
    const sel = document.getElementById('userSelect');
    if (sel) sel.addEventListener('change', onUserChange);
    const pubBtn = document.getElementById('publishBtn');
    if (pubBtn) pubBtn.addEventListener('click', createPost);
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeDetail);
    // 事件委托：动态列表
    const feedList = document.getElementById('feedList');
    if (feedList) feedList.addEventListener('click', handleFeedClick);
    // 事件委托：同学/好友区
    const classmatesList = document.getElementById('classmatesList');
    if (classmatesList) classmatesList.addEventListener('click', handleClassmatesClick);
    // 事件委托：详情弹窗（click + keydown + change）
    const detailBody = document.getElementById('detailBody');
    if (detailBody) {
      detailBody.addEventListener('click', handleDetailClick);
      detailBody.addEventListener('keydown', handleDetailKeydown);
      detailBody.addEventListener('change', handleDetailChange);
    }
  }
  init();
  // 超时兜底：8秒后如果 feedList 仍在"加载中"，显示重试
  setTimeout(function() {
    const list = document.getElementById('feedList');
    if (list && list.querySelector('.loading')) {
      showLoadError(list, '加载超时，服务器可能未启动', retryAll);
    }
  }, 8000);
}

async function init() {
  hidePageError();
  const list = document.getElementById('feedList');
  if (list) list.innerHTML = '<p class="loading">加载中...</p>';
  // 统计先显示"--"表示加载中（不是0）
  setStatsLoading();

  // 加载用户选择器（失败不阻塞后续）
  try {
    await loadUsers();
  } catch (e) {
    console.error('loadUsers error:', e);
    // 用户列表加载失败仍可继续，用默认uid
  }

  // 加载核心数据
  try {
    await refresh();
  } catch (e) {
    console.error('refresh error:', e);
    showPageError('数据加载失败：' + e.message, init);
  }

  // 兜底：无论如何 feedList 不能停在"加载中"
  if (list && list.querySelector('.loading')) {
    showLoadError(list, '动态加载异常，请重试', retryAll);
  }
}

async function loadUsers() {
  const users = await apiFetch('/api/users');
  if (!Array.isArray(users)) throw new Error('用户数据格式异常');
  const sel = document.getElementById('userSelect');
  if (!sel) return;
  sel.innerHTML = '';
  users.forEach(function(u) {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = u.name;
    if (u.id === currentUID) opt.selected = true;
    sel.appendChild(opt);
  });
  // 检查当前uid是否在列表中
  if (!users.some(function(u) { return u.id === currentUID; })) {
    showPageError('当前身份 (uid=' + currentUID + ') 不在用户列表中');
  }
}

function onUserChange(e) {
  currentUID = parseInt(e.target.value);
  feedCache = [];
  document.getElementById('detailModal').style.display = 'none';
  currentDetailPostID = null;
  refresh();
}

// ===== 统一刷新：列表 + 统计 + 好友区（加锁防并发） =====
async function refresh() {
  if (_refreshLock) return;
  _refreshLock = true;
  try {
    await Promise.allSettled([loadFeed(), loadClassmates(), loadStats()]);
  } finally {
    _refreshLock = false;
  }
}

// ===== 统计加载中/失败状态 =====
function setStatsLoading() {
  const ids = ['statPostCount', 'statFriendCount', 'statPendingCount', 'statVisibleCount', 'statCommentCount', 'statMyVisibleCount'];
  ids.forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.textContent = '--';
  });
}

function setStatsError() {
  const ids = ['statPostCount', 'statFriendCount', 'statPendingCount', 'statVisibleCount', 'statCommentCount', 'statMyVisibleCount'];
  ids.forEach(function(id) {
    const el = document.getElementById(id);
    if (el && el.textContent === '--') el.textContent = '--';
  });
}

function retryAll() {
  hidePageError();
  init();
}

// ===== 动态列表 =====
async function loadFeed() {
  const list = document.getElementById('feedList');
  if (!list) return;
  list.innerHTML = '<p class="loading">加载中...</p>';
  try {
    const items = await apiFetch('/api/feed');
    if (!Array.isArray(items)) {
      showLoadError(list, '动态数据格式异常，请重试', retryAll);
      feedCache = [];
      return;
    }
    if (items.length === 0) {
      // 空动态：显示空状态 + 发布引导
      feedCache = [];
      const emptyId = 'emptyFeedPublish_' + Math.random().toString(36).slice(2, 8);
      list.innerHTML = '<div class="empty-feed">' +
        '<p>暂无可见动态</p>' +
        '<p class="empty-hint">发布一条新动态，或切换其他身份查看</p>' +
        '<button class="btn-small btn-add" id="' + emptyId + '">去发布</button>' +
      '</div>';
      const goPub = document.getElementById(emptyId);
      if (goPub) goPub.addEventListener('click', function() {
        document.getElementById('publishContent').focus();
      });
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
        htmlParts.push('<div class="feed-card feed-card-incomplete"><div class="feed-content" style="color:#999;">动态内容暂时无法显示</div></div>');
      }
    }
    list.innerHTML = htmlParts.join('');
    // 终极兜底：如果渲染后仍然没有卡片
    if (!list.querySelector('.feed-card')) {
      showLoadError(list, '渲染动态失败，请重试', retryAll);
    }
  } catch (e) {
    showLoadError(list, '加载动态失败：' + e.message, retryAll);
    feedCache = [];
  }
}

function renderFeedCard(item, index) {
  // item 整体为null/undefined
  if (!item) {
    return '<div class="feed-card feed-card-incomplete"><div class="feed-content" style="color:#999;">动态数据不完整</div></div>';
  }
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

  // 是否缺少关键字段（用于显示数据不完整标记）
  const hasMissing = !item.post || !item.author || !p.id;

  // 评论预览（最多显示2条顶级评论）
  const comments = safeArr(item.comments);
  let commentPreview = '';
  if (comments.length > 0) {
    const previewList = comments.slice(0, 2);
    commentPreview = '<div class="feed-comment-preview">' +
      previewList.map(function(c) {
        try {
          const ca = c.author || {};
          const cm = c.comment || {};
          const replyCount = safeArr(c.replies).length;
          return '<div class="feed-cp-item"><span class="feed-cp-author">' + escHtml(safeStr(ca.name, '未知')) + '</span>: ' + escHtml(safeStr(cm.content, '（评论不可用）')) +
            (replyCount > 0 ? ' <span class="feed-cp-replies">(' + replyCount + '条回复)</span>' : '') +
          '</div>';
        } catch (e) {
          return '<div class="feed-cp-item" style="color:#999;">评论数据不完整</div>';
        }
      }).join('') +
      (comments.length > 2 ? '<div class="feed-cp-more">还有 ' + (comments.length - 2) + ' 条评论</div>' : '') +
    '</div>';
  }

  return '<div class="feed-card' + (hasMissing ? ' feed-card-incomplete' : '') + '" id="feedCard_' + pid + '">' +
    '<div class="feed-header">' +
      '<img class="feed-avatar" src="' + authorAvatar + '" alt="' + escHtml(authorName) + '" onerror="this.style.display=\'none\'">' +
      '<div>' +
        '<span class="feed-author">' + escHtml(authorName) + '</span> ' +
        '<span class="feed-time">' + formatTime(createdAt) + '</span> ' +
        '<span class="feed-visibility">' + escHtml(visLabel) + '</span>' +
        (hasMissing ? ' <span class="feed-incomplete-tag">数据不完整</span>' : '') +
      '</div>' +
    '</div>' +
    '<div class="feed-content">' + escHtml(content) + '</div>' +
    (photoUrl ? '<img class="feed-photo" src="' + photoUrl + '" alt="照片" data-action="openDetail" data-post-id="' + pid + '" onerror="this.style.display=\'none\'">' : '') +
    '<div class="feed-actions">' +
      '<button class="' + likeCls + '" data-action="toggleLike" data-post-id="' + pid + '">' + likeIcon + ' <span id="likeCount_' + pid + '">' + likeCount + '</span></button>' +
      '<span class="feed-comment-count">\uD83D\uDCAC <span id="commentCount_' + pid + '">' + commentCount + '</span> 条评论</span>' +
      '<button class="feed-action-btn" data-action="openDetail" data-post-id="' + pid + '">查看详情</button>' +
    '</div>' +
    commentPreview +
  '</div>';
}

// 事件委托：动态列表点击
function handleFeedClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const postId = parseInt(target.dataset.postId);
  if (action === 'toggleLike' && postId) toggleLike(postId);
  if (action === 'openDetail' && postId) openDetail(postId);
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
    // 更新缓存
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
  const detailPostId = document.getElementById('detailPostId');
  if (!detailPostId || parseInt(detailPostId.value) !== postID) return;
  const btn = document.getElementById('detailLikeBtn');
  if (btn) {
    btn.className = liked ? 'like-btn liked' : 'like-btn';
    btn.innerHTML = (liked ? '♥' : '♡') + ' <span id="detailLikeCount">' + likeCount + '</span> 赞';
  }
}

// ===== 发布动态 =====
async function createPost() {
  const contentEl = document.getElementById('publishContent');
  const content = contentEl ? contentEl.value.trim() : '';
  if (!content) { alert('请输入内容'); return; }
  const photoEl = document.getElementById('publishPhoto');
  const photo = photoEl ? photoEl.value.trim() : '';
  const visEl = document.getElementById('publishVisibility');
  const visibility = visEl ? visEl.value : 'public';
  try {
    await apiFetch('/api/posts/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: content, photo_url: photo, visibility: visibility })
    });
    if (contentEl) contentEl.value = '';
    if (photoEl) photoEl.value = '';
    if (visEl) visEl.value = 'public';
    refresh();
  } catch (e) {
    showPageError('发布失败：' + e.message);
  }
}

// ===== 动态详情 =====
let currentDetailPostID = null;

async function openDetail(postID) {
  currentDetailPostID = postID;
  // 先显示加载中
  document.getElementById('detailBody').innerHTML = '<p class="loading">加载详情中...</p>';
  document.getElementById('detailModal').style.display = '';
  try {
    const data = await apiFetch('/api/posts/detail?id=' + postID);
    renderDetail(data);
  } catch (e) {
    renderDetailError(e.message);
  }
}

function renderDetailError(msg) {
  document.getElementById('detailBody').innerHTML =
    '<div class="detail-error">' +
      '<p class="error-msg">' + escHtml(msg) + '</p>' +
      '<div class="detail-error-actions">' +
        '<button class="feed-action-btn" data-action="retryDetail">重试</button> ' +
        '<button class="feed-action-btn" data-action="closeDetail">返回动态列表</button>' +
      '</div>' +
    '</div>';
}

function renderDetail(data) {
  // 数据不完整兜底
  if (!data) {
    renderDetailError('动态数据为空');
    return;
  }
  const p = data.post || {};
  const author = data.author || {};
  const likeIcon = data.is_liked ? '♥' : '♡';
  const likeCls = data.is_liked ? 'like-btn liked' : 'like-btn';
  const isOwner = p.author_id === currentUID;
  const visSelector = isOwner ?
    '<div class="detail-vis-row">' +
      '<span>可见范围：</span>' +
      '<select id="detailVisSelect" data-action="changeVisibility" data-post-id="' + (p.id || 0) + '">' +
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
  const postId = p.id || 0;

  document.getElementById('detailBody').innerHTML =
    '<input type="hidden" id="detailPostId" value="' + postId + '">' +
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
      '<button id="detailLikeBtn" class="' + likeCls + '" data-action="toggleLike" data-post-id="' + postId + '">' + likeIcon + ' <span id="detailLikeCount">' + likeCount + '</span> 赞</button>' +
      '<span class="detail-comment-info">\uD83D\uDCAC ' + commentCount + ' 条评论</span>' +
    '</div>' +
    '<div class="detail-section-title">评论 (' + comments.length + ')</div>' +
    '<div id="commentsContainer">' + renderComments(comments) + '</div>' +
    '<div class="comment-form">' +
      '<input type="text" id="newCommentInput" placeholder="写评论..." data-action="submitComment" data-post-id="' + postId + '">' +
      '<button data-action="submitComment" data-post-id="' + postId + '">发表</button>' +
    '</div>';
}

// 事件委托：详情弹窗点击
function handleDetailClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const postId = parseInt(target.dataset.postId) || currentDetailPostID;
  const commentId = parseInt(target.dataset.commentId) || 0;

  if (action === 'toggleLike' && postId) toggleLike(postId);
  if (action === 'openDetail' && postId) openDetail(postId);
  if (action === 'closeDetail') closeDetail();
  if (action === 'retryDetail' && currentDetailPostID) openDetail(currentDetailPostID);
  if (action === 'submitComment' && postId) submitComment(postId);
  if (action === 'submitReply' && postId && commentId) submitReply(postId, commentId);
  if (action === 'showReplyForm' && commentId) showReplyForm(commentId);
}

// 事件委托：详情弹窗键盘（Enter提交）
function handleDetailKeydown(e) {
  if (e.key !== 'Enter') return;
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const postId = parseInt(target.dataset.postId) || currentDetailPostID;
  const commentId = parseInt(target.dataset.commentId) || 0;

  if (action === 'submitComment' && postId) submitComment(postId);
  if (action === 'submitReply' && postId && commentId) submitReply(postId, commentId);
}

// 事件委托：详情弹窗 change（可见范围选择器）
function handleDetailChange(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const postId = parseInt(target.dataset.postId);
  if (action === 'changeVisibility' && postId) changeVisibility(postId);
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
    refresh(); // 可见范围变化影响列表和可见动态数
  } catch (e) {
    showPageError('修改可见范围失败：' + e.message);
    openDetail(postID);
  }
}

// ===== 评论渲染 =====
function renderComments(comments) {
  if (!comments || comments.length === 0) {
    return '<p style="color:#999;font-size:13px;">暂无评论，来说点什么吧</p>';
  }
  return comments.map(function(c, i) {
    try {
      return renderCommentItem(c);
    } catch (e) {
      console.error('renderCommentItem error', i, e);
      return '<div class="comment-item" style="color:#999;">评论数据不完整</div>';
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
      (commentId ? '<button class="comment-reply-btn" data-action="showReplyForm" data-comment-id="' + commentId + '">回复</button>' : '') +
      (commentId ? '<div id="replyForm_' + commentId + '" style="display:none;" class="reply-form"><div class="comment-form">' +
        '<input type="text" id="replyInput_' + commentId + '" placeholder="回复 ' + escHtml(safeStr(ca.name, '未知')) + '..." data-action="submitReply" data-post-id="' + postId + '" data-comment-id="' + commentId + '">' +
        '<button data-action="submitReply" data-post-id="' + postId + '" data-comment-id="' + commentId + '">回复</button>' +
      '</div></div>' : '');

  const replies = safeArr(c.replies);
  if (replies.length > 0) {
    html += '<div class="replies-list">' + replies.map(function(r) {
      try {
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
      } catch (e) {
        return '<div class="reply-item" style="color:#999;">回复数据不完整</div>';
      }
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
          statusHtml = '<span class="classmate-status">好友</span><button class="btn-small btn-unfriend" data-action="unfriend" data-user-id="' + cid + '">解除</button>';
        } else if (s === 'pending') {
          statusHtml = '<span class="classmate-status">待确认</span><button class="btn-small btn-cancel" data-action="cancelFriend" data-user-id="' + cid + '">取消</button>';
        } else if (s === 'pending_received') {
          statusHtml = '<span class="classmate-status">申请你</span><button class="btn-small btn-accept" data-action="acceptFriend" data-relation-id="' + relId + '">接受</button><button class="btn-small btn-reject" data-action="rejectFriend" data-relation-id="' + relId + '">拒绝</button>';
        } else {
          statusHtml = '<span class="classmate-status">陌生人</span><button class="btn-small btn-add" data-action="addFriend" data-user-id="' + cid + '">添加</button>';
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
    showLoadError(container, '加载好友失败：' + e.message, retryAll);
  }
}

// 事件委托：同学/好友区点击
function handleClassmatesClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const userId = parseInt(target.dataset.userId) || 0;
  const relationId = parseInt(target.dataset.relationId) || 0;

  if (action === 'addFriend' && userId) addFriend(userId);
  if (action === 'cancelFriend' && userId) cancelFriend(userId);
  if (action === 'acceptFriend' && relationId) acceptFriend(relationId);
  if (action === 'rejectFriend' && relationId) rejectFriend(relationId);
  if (action === 'unfriend' && userId) unfriend(userId);
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
    if (!stats) {
      setStatsError();
      return;
    }
    const ids = {
      post_count: 'statPostCount',
      friend_count: 'statFriendCount',
      pending_count: 'statPendingCount',
      visible_post_count: 'statVisibleCount',
      comment_count: 'statCommentCount',
      my_posts_visible_count: 'statMyVisibleCount'
    };
    for (const [key, id] of Object.entries(ids)) {
      const el = document.getElementById(id);
      if (el) el.textContent = stats[key] != null ? stats[key] : 0;
    }
  } catch (e) {
    console.error('loadStats error:', e);
    // 统计加载失败：保持"--"并显示重试
    setStatsError();
    showPageError('统计加载失败，部分数据可能不准确', retryAll);
  }
}

// 点击遮罩关闭详情
document.addEventListener('click', function(e) {
  if (e.target.id === 'detailModal') closeDetail();
});

// 启动
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
