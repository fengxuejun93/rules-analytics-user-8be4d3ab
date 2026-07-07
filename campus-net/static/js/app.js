// 校内网社交原型 - 前端逻辑（含角色权限）
const API = '';
let currentUID = 1;
let currentRole = 'student';
let feedCache = [];
let _refreshLock = false;

function uid() { return currentUID; }
function role() { return currentRole; }
function apiUrl(path) {
  return API + path + (path.includes('?') ? '&' : '?') + 'uid=' + uid() + '&role=' + role();
}

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
  try { res = await fetch(apiUrl(path), opts); }
  catch (e) { throw new Error('网络请求失败，请检查服务是否启动'); }
  let data;
  try { data = await res.json(); }
  catch (e) { throw new Error('服务器返回了非JSON数据 (HTTP ' + res.status + ')'); }
  if (!res.ok) { throw new Error((data && data.error) ? data.error : '请求失败 (HTTP ' + res.status + ')'); }
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

const ROLE_LABELS = { student: '普通学生', author: '动态作者', admin: '管理员' };

const Permissions = {
  canAddFriend:      () => role() === 'student' || role() === 'author',
  canComment:        () => role() === 'student' || role() === 'author',
  canLike:           () => role() === 'student' || role() === 'author',
  canPublish:        () => role() === 'student' || role() === 'author',
  canManageFriends:  () => role() === 'student' || role() === 'author',
  canEditVisibility: (postAuthorId) => role() === 'author' && postAuthorId === uid(),
  canDeletePost:     (postAuthorId) => role() === 'author' && postAuthorId === uid(),
  canDeleteComment:  (commentAuthorId) => role() === 'author' && commentAuthorId === uid(),
  canHidePost:       () => role() === 'admin',
  canRestorePost:    (isHidden) => role() === 'admin' && isHidden,
  canHideComment:    () => role() === 'admin',
  canRestoreComment: (isHidden) => role() === 'admin' && isHidden,
  canViewHidden:     () => role() === 'admin',
  check: function(action, context) {
    switch (action) {
      case 'addFriend':      return this.canAddFriend();
      case 'comment':        return this.canComment();
      case 'like':           return this.canLike();
      case 'publish':        return this.canPublish();
      case 'editVisibility': return this.canEditVisibility(context && context.authorId);
      case 'deletePost':     return this.canDeletePost(context && context.authorId);
      case 'deleteComment':  return this.canDeleteComment(context && context.authorId);
      case 'hidePost':       return this.canHidePost();
      case 'restorePost':    return this.canRestorePost(context && context.hidden);
      case 'hideComment':    return this.canHideComment();
      case 'restoreComment': return this.canRestoreComment(context && context.hidden);
      default:               return false;
    }
  }
};

let _pageErrorTimer = null;
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
  if (_pageErrorTimer) clearTimeout(_pageErrorTimer);
  _pageErrorTimer = setTimeout(function() { el.style.display = 'none'; }, 5000);
  if (retryFn) {
    const btn = el.querySelector('.page-retry-btn');
    if (btn) btn.onclick = function() { el.style.display = 'none'; retryFn(); };
  }
}

function hidePageError() {
  const el = document.getElementById('pageError');
  if (el) el.style.display = 'none';
  if (_pageErrorTimer) { clearTimeout(_pageErrorTimer); _pageErrorTimer = null; }
}

function showLoadError(container, msg, retryFn) {
  const retryId = 'retryBtn_' + Math.random().toString(36).slice(2, 8);
  container.innerHTML = '<div class="load-error"><p>' + escHtml(msg) + '</p>' +
    '<button class="btn-small btn-add" id="' + retryId + '">重试</button></div>';
  const btn = document.getElementById(retryId);
  if (btn && retryFn) btn.addEventListener('click', retryFn);
}

function showPermissionDenied(msg) {
  showPageError(msg || '当前角色无权执行此操作');
}

let currentUserInfo = null;

async function loadCurrentUser() {
  try {
    const me = await apiFetch('/api/me');
    if (me && me.valid) { currentUserInfo = me; renderCurrentUser(me); }
    else { currentUserInfo = null; renderCurrentUserMissing(); }
  } catch (e) { currentUserInfo = null; renderCurrentUserMissing(); }
}

function renderCurrentUser(me) {
  const nameEl = document.getElementById('cuName');
  const roleEl = document.getElementById('cuRole');
  const avatarEl = document.getElementById('cuAvatar');
  if (nameEl) nameEl.textContent = me.name || '未知用户';
  if (roleEl) roleEl.textContent = me.role_label || ROLE_LABELS[me.role] || me.role;
  if (avatarEl) { avatarEl.src = me.avatar_url || ''; avatarEl.style.display = ''; }
  const panel = document.getElementById('currentUserPanel');
  if (panel) panel.classList.remove('cu-missing');
}

function renderCurrentUserMissing() {
  const nameEl = document.getElementById('cuName');
  const roleEl = document.getElementById('cuRole');
  const avatarEl = document.getElementById('cuAvatar');
  if (nameEl) nameEl.textContent = '身份缺失';
  if (roleEl) roleEl.textContent = '请选择身份';
  if (avatarEl) avatarEl.style.display = 'none';
  const panel = document.getElementById('currentUserPanel');
  if (panel) panel.classList.add('cu-missing');
}

async function showIdentityPrompt() {
  const modal = document.getElementById('identityModal');
  if (!modal) return;
  const userSel = document.getElementById('identityUserSelect');
  if (userSel) {
    try {
      const users = await apiFetch('/api/users');
      if (Array.isArray(users)) {
        userSel.innerHTML = '';
        users.forEach(function(u) {
          const opt = document.createElement('option');
          opt.value = u.id;
          opt.textContent = u.name;
          if (u.id === currentUID) opt.selected = true;
          userSel.appendChild(opt);
        });
      }
    } catch (e) { /* ignore */ }
  }
  const roleSel = document.getElementById('identityRoleSelect');
  if (roleSel) roleSel.value = currentRole;
  modal.style.display = '';
}

function hideIdentityPrompt() {
  const modal = document.getElementById('identityModal');
  if (modal) modal.style.display = 'none';
}

async function onIdentityConfirm() {
  const userSel = document.getElementById('identityUserSelect');
  const roleSel = document.getElementById('identityRoleSelect');
  if (userSel) currentUID = parseInt(userSel.value) || 1;
  if (roleSel) currentRole = roleSel.value || 'student';
  const mainUserSel = document.getElementById('userSelect');
  if (mainUserSel) mainUserSel.value = currentUID;
  const mainRoleSel = document.getElementById('roleSelect');
  if (mainRoleSel) mainRoleSel.value = currentRole;
  hideIdentityPrompt();
  feedCache = [];
  document.getElementById('detailModal').style.display = 'none';
  currentDetailPostID = null;
  updatePublishPanel();
  init();
}

let _booted = false;
function boot() {
  if (!_booted) {
    _booted = true;
    const sel = document.getElementById('userSelect');
    if (sel) sel.addEventListener('change', onUserChange);
    const roleSel = document.getElementById('roleSelect');
    if (roleSel) roleSel.addEventListener('change', onRoleChange);
    const pubBtn = document.getElementById('publishBtn');
    if (pubBtn) pubBtn.addEventListener('click', createPost);
    const closeBtn = document.getElementById('modalCloseBtn');
    if (closeBtn) closeBtn.addEventListener('click', closeDetail);
    const feedList = document.getElementById('feedList');
    if (feedList) feedList.addEventListener('click', handleFeedClick);
    const classmatesList = document.getElementById('classmatesList');
    if (classmatesList) classmatesList.addEventListener('click', handleClassmatesClick);
    const detailBody = document.getElementById('detailBody');
    if (detailBody) {
      detailBody.addEventListener('click', handleDetailClick);
      detailBody.addEventListener('keydown', handleDetailKeydown);
      detailBody.addEventListener('change', handleDetailChange);
    }
    const identityBtn = document.getElementById('identityConfirmBtn');
    if (identityBtn) identityBtn.addEventListener('click', onIdentityConfirm);
    document.addEventListener('click', function(e) {
      if (e.target.id === 'identityModal') hideIdentityPrompt();
    });
    const cuPanel = document.getElementById('currentUserPanel');
    if (cuPanel) cuPanel.addEventListener('click', function() { showIdentityPrompt(); });
  }
  init();
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
  setStatsLoading();
  try { await loadUsers(); } catch (e) { console.error('loadUsers error:', e); }
  try { await loadCurrentUser(); } catch (e) { console.error('loadCurrentUser error:', e); }
  if (!currentUID || currentUID < 1 || !currentUserInfo || !currentUserInfo.valid) {
    renderCurrentUserMissing();
    setStatsPlaceholder();
    showIdentityPrompt();
    return;
  }
  try { await refresh(); } catch (e) { console.error('refresh error:', e); showPageError('数据加载失败：' + e.message, init); }
  if (list && list.querySelector('.loading')) showLoadError(list, '动态加载异常，请重试', retryAll);
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
  if (!users.some(function(u) { return u.id === currentUID; })) currentUserInfo = null;
}

async function onUserChange(e) {
  currentUID = parseInt(e.target.value);
  feedCache = [];
  document.getElementById('detailModal').style.display = 'none';
  currentDetailPostID = null;
  await loadCurrentUser();
  if (!currentUserInfo || !currentUserInfo.valid) { renderCurrentUserMissing(); setStatsPlaceholder(); showIdentityPrompt(); return; }
  refresh();
}

async function onRoleChange(e) {
  currentRole = e.target.value;
  feedCache = [];
  document.getElementById('detailModal').style.display = 'none';
  currentDetailPostID = null;
  updatePublishPanel();
  await loadCurrentUser();
  if (!currentUserInfo || !currentUserInfo.valid) { renderCurrentUserMissing(); setStatsPlaceholder(); showIdentityPrompt(); return; }
  refresh();
}

function updatePublishPanel() {
  const panel = document.querySelector('.publish-panel');
  if (!panel) return;
  panel.style.display = (role() === 'admin') ? 'none' : '';
}

async function refresh() {
  if (_refreshLock) return;
  _refreshLock = true;
  try { await Promise.allSettled([loadFeed(), loadClassmates(), loadStats()]); }
  finally { _refreshLock = false; }
}

function setStatsLoading() {
  ['statPostCount','statFriendCount','statPendingCount','statVisibleCount','statCommentCount','statMyVisibleCount'].forEach(function(id) {
    const el = document.getElementById(id); if (el) el.textContent = '--';
  });
}
function setStatsError() { setStatsLoading(); }
function setStatsPlaceholder() {
  ['statPostCount','statFriendCount','statPendingCount','statVisibleCount','statCommentCount','statMyVisibleCount'].forEach(function(id) {
    const el = document.getElementById(id); if (el) el.textContent = '-';
  });
}
function retryAll() { hidePageError(); init(); }

async function loadFeed() {
  const list = document.getElementById('feedList');
  if (!list) return;
  list.innerHTML = '<p class="loading">加载中...</p>';
  try {
    const items = await apiFetch('/api/feed');
    if (!Array.isArray(items)) { showLoadError(list, '动态数据格式异常，请重试', retryAll); feedCache = []; return; }
    if (items.length === 0) {
      feedCache = [];
      const eid = 'emptyFeed_' + Math.random().toString(36).slice(2,8);
      list.innerHTML = '<div class="empty-feed"><p>暂无可见动态</p><p class="empty-hint">发布一条新动态，或切换其他身份/角色查看</p>' +
        (Permissions.canPublish() ? '<button class="btn-small btn-add" id="'+eid+'">去发布</button>' : '') + '</div>';
      const goPub = document.getElementById(eid);
      if (goPub) goPub.addEventListener('click', function() { document.getElementById('publishContent').focus(); });
      return;
    }
    feedCache = items;
    const htmlParts = [];
    for (let i = 0; i < items.length; i++) {
      try { htmlParts.push(renderFeedCard(items[i], i)); }
      catch (err) { console.error('renderFeedCard error', i, err); htmlParts.push('<div class="feed-card feed-card-incomplete"><div class="feed-content" style="color:#999;">动态内容暂时无法显示</div></div>'); }
    }
    list.innerHTML = htmlParts.join('');
    if (!list.querySelector('.feed-card')) showLoadError(list, '渲染动态失败，请重试', retryAll);
  } catch (e) { showLoadError(list, '加载动态失败：' + e.message, retryAll); feedCache = []; }
}

function renderFeedCard(item, index) {
  if (!item) return '<div class="feed-card feed-card-incomplete"><div class="feed-content" style="color:#999;">动态数据不完整</div></div>';
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
  const isHidden = !!p.hidden;
  const hasMissing = !item.post || !item.author || !p.id;

  let actionBtns = '';
  if (Permissions.canLike()) {
    actionBtns += '<button class="'+likeCls+'" data-action="toggleLike" data-post-id="'+pid+'">'+likeIcon+' <span id="likeCount_'+pid+'">'+likeCount+'</span></button>';
  } else {
    actionBtns += '<span class="feed-action-disabled">'+likeIcon+' '+likeCount+'</span>';
  }
  actionBtns += '<span class="feed-comment-count">\uD83D\uDCAC <span id="commentCount_'+pid+'">'+commentCount+'</span> 条评论</span>';
  actionBtns += '<button class="feed-action-btn" data-action="openDetail" data-post-id="'+pid+'">查看详情</button>';
  if (item.can_hide) actionBtns += ' <button class="btn-small btn-admin-hide" data-action="hidePost" data-post-id="'+pid+'">隐藏</button>';
  if (item.can_restore) actionBtns += ' <button class="btn-small btn-admin-restore" data-action="restorePost" data-post-id="'+pid+'">恢复</button>';
  if (item.can_delete) actionBtns += ' <button class="btn-small btn-author-delete" data-action="deletePost" data-post-id="'+pid+'" data-author-id="'+(p.author_id||0)+'">删除</button>';

  const comments = safeArr(item.comments);
  let commentPreview = '';
  if (comments.length > 0) {
    commentPreview = '<div class="feed-comment-preview">' +
      comments.slice(0,2).map(function(c) {
        try {
          const ca = c.author || {};
          const cm = c.comment || {};
          const replyCount = safeArr(c.replies).length;
          return '<div class="feed-cp-item"><span class="feed-cp-author">'+escHtml(safeStr(ca.name,'未知'))+'</span>: '+escHtml(safeStr(cm.content,'（评论不可用）'))+(replyCount>0?' <span class="feed-cp-replies">('+replyCount+'条回复)</span>':'')+'</div>';
        } catch (e) { return '<div class="feed-cp-item" style="color:#999;">评论数据不完整</div>'; }
      }).join('') +
      (comments.length > 2 ? '<div class="feed-cp-more">还有 '+(comments.length-2)+' 条评论</div>' : '') +
    '</div>';
  }

  return '<div class="feed-card'+(hasMissing?' feed-card-incomplete':'')+(isHidden?' feed-card-hidden':'')+'" id="feedCard_'+pid+'">' +
    '<div class="feed-header"><img class="feed-avatar" src="'+authorAvatar+'" alt="'+escHtml(authorName)+'" onerror="this.style.display=\'none\'"><div>' +
    '<span class="feed-author">'+escHtml(authorName)+'</span> <span class="feed-time">'+formatTime(createdAt)+'</span> <span class="feed-visibility">'+escHtml(visLabel)+'</span>' +
    (isHidden?' <span class="feed-hidden-tag">已隐藏</span>':'')+(hasMissing?' <span class="feed-incomplete-tag">数据不完整</span>':'') +
    '</div></div>' +
    '<div class="feed-content">'+escHtml(content)+'</div>' +
    (photoUrl?'<img class="feed-photo" src="'+photoUrl+'" alt="照片" data-action="openDetail" data-post-id="'+pid+'" onerror="this.style.display=\'none\'">':'') +
    '<div class="feed-actions">'+actionBtns+'</div>' +
    commentPreview +
  '</div>';
}

function handleFeedClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const postId = parseInt(target.dataset.postId) || 0;
  const authorId = parseInt(target.dataset.authorId) || 0;
  if (action==='toggleLike' && postId) toggleLike(postId);
  if (action==='openDetail' && postId) openDetail(postId);
  if (action==='hidePost' && postId) hidePost(postId);
  if (action==='restorePost' && postId) restorePost(postId);
  if (action==='deletePost' && postId) deletePost(postId, authorId);
}

async function toggleLike(postID) {
  if (!Permissions.check('like')) { showPermissionDenied('当前角色（'+ROLE_LABELS[role()]+'）无权点赞'); return; }
  try {
    const data = await apiFetch('/api/likes/toggle', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({post_id:postID}) });
    updateCardLike(postID, data.liked, data.like_count);
    updateDetailLike(postID, data.liked, data.like_count);
    for (const item of feedCache) { if (item.post && item.post.id===postID) { item.is_liked=data.liked; item.like_count=data.like_count; break; } }
  } catch (e) { showPageError('点赞失败：'+e.message); }
}

function updateCardLike(postID, liked, likeCount) {
  const card = document.getElementById('feedCard_'+postID);
  if (!card) return;
  const btn = card.querySelector('.like-btn');
  if (btn) { btn.className=liked?'like-btn liked':'like-btn'; btn.innerHTML=(liked?'♥':'♡')+' <span id="likeCount_'+postID+'">'+likeCount+'</span>'; }
}

function updateDetailLike(postID, liked, likeCount) {
  const el = document.getElementById('detailPostId');
  if (!el || parseInt(el.value)!==postID) return;
  const btn = document.getElementById('detailLikeBtn');
  if (btn) { btn.className=liked?'like-btn liked':'like-btn'; btn.innerHTML=(liked?'♥':'♡')+' <span id="detailLikeCount">'+likeCount+'</span> 赞'; }
}

async function createPost() {
  if (!Permissions.check('publish')) { showPermissionDenied('当前角色（'+ROLE_LABELS[role()]+'）无权发布动态'); return; }
  const contentEl = document.getElementById('publishContent');
  const content = contentEl ? contentEl.value.trim() : '';
  if (!content) { alert('请输入内容'); return; }
  const photoEl = document.getElementById('publishPhoto');
  const photo = photoEl ? photoEl.value.trim() : '';
  const visEl = document.getElementById('publishVisibility');
  const visibility = visEl ? visEl.value : 'public';
  try {
    await apiFetch('/api/posts/create', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({content:content,photo_url:photo,visibility:visibility}) });
    if (contentEl) contentEl.value = '';
    if (photoEl) photoEl.value = '';
    if (visEl) visEl.value = 'public';
    refresh();
  } catch (e) { showPageError('发布失败：'+e.message); }
}

async function hidePost(postID) {
  if (!Permissions.check('hidePost')) { showPermissionDenied('仅管理员可隐藏动态'); return; }
  try { await apiFetch('/api/posts/hide', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({post_id:postID}) }); refresh(); if (currentDetailPostID===postID) openDetail(postID); }
  catch (e) { showPageError('隐藏失败：'+e.message); }
}

async function restorePost(postID) {
  if (!Permissions.check('restorePost',{hidden:true})) { showPermissionDenied('仅管理员可恢复动态'); return; }
  try { await apiFetch('/api/posts/restore', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({post_id:postID}) }); refresh(); if (currentDetailPostID===postID) openDetail(postID); }
  catch (e) { showPageError('恢复失败：'+e.message); }
}

async function deletePost(postID, postAuthorId) {
  var aid = postAuthorId||0;
  if (!aid) { for (const item of feedCache) { if (item.post && item.post.id===postID) { aid=item.post.author_id; break; } } }
  if (!Permissions.check('deletePost',{authorId:aid})) { showPermissionDenied('仅动态作者角色可删除自己的动态'); return; }
  if (!confirm('确定删除这条动态？删除后不可恢复。')) return;
  try {
    await apiFetch('/api/posts/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({post_id:postID}) });
    if (currentDetailPostID===postID) { document.getElementById('detailModal').style.display='none'; currentDetailPostID=null; }
    refresh();
  } catch (e) { showPageError('删除失败：'+e.message); }
}

async function hideComment(commentID) {
  if (!Permissions.check('hideComment')) { showPermissionDenied('仅管理员可隐藏评论'); return; }
  try { await apiFetch('/api/comments/hide', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({comment_id:commentID}) }); if (currentDetailPostID) openDetail(currentDetailPostID); refresh(); }
  catch (e) { showPageError('隐藏评论失败：'+e.message); }
}

async function restoreComment(commentID) {
  if (!Permissions.check('restoreComment',{hidden:true})) { showPermissionDenied('仅管理员可恢复评论'); return; }
  try { await apiFetch('/api/comments/restore', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({comment_id:commentID}) }); if (currentDetailPostID) openDetail(currentDetailPostID); refresh(); }
  catch (e) { showPageError('恢复评论失败：'+e.message); }
}

let _detailCommentMap = {};
function findCommentAuthorId(id) { return _detailCommentMap[id]!=null ? _detailCommentMap[id] : null; }
function cacheCommentAuthors(comments) {
  if (!comments) return;
  comments.forEach(function(c) {
    if (c.comment && c.comment.id) _detailCommentMap[c.comment.id] = c.comment.author_id;
    if (c.replies && c.replies.length>0) cacheCommentAuthors(c.replies);
  });
}

async function deleteComment(commentID, commentAuthorId) {
  var aid = commentAuthorId||0;
  if (!aid) aid = findCommentAuthorId(commentID)||0;
  if (!Permissions.check('deleteComment',{authorId:aid})) { showPermissionDenied('仅动态作者角色可删除自己的评论'); return; }
  if (!confirm('确定删除这条评论？')) return;
  try { await apiFetch('/api/comments/delete', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({comment_id:commentID}) }); if (currentDetailPostID) openDetail(currentDetailPostID); refresh(); }
  catch (e) { showPageError('删除评论失败：'+e.message); }
}

let currentDetailPostID = null;

async function openDetail(postID) {
  currentDetailPostID = postID;
  _detailCommentMap = {};
  document.getElementById('detailBody').innerHTML = '<p class="loading">加载详情中...</p>';
  document.getElementById('detailModal').style.display = '';
  try {
    const data = await apiFetch('/api/posts/detail?id='+postID);
    cacheCommentAuthors(data && data.comments);
    renderDetail(data);
  } catch (e) { renderDetailError(e.message); }
}

function renderDetailError(msg) {
  document.getElementById('detailBody').innerHTML = '<div class="detail-error"><p class="error-msg">'+escHtml(msg)+'</p><div class="detail-error-actions"><button class="feed-action-btn" data-action="retryDetail">重试</button> <button class="feed-action-btn" data-action="closeDetail">返回动态列表</button></div></div>';
}

function renderDetail(data) {
  if (!data) { renderDetailError('动态数据为空'); return; }
  const p = data.post||{};
  const author = data.author||{};
  const likeIcon = data.is_liked?'♥':'♡';
  const likeCls = data.is_liked?'like-btn liked':'like-btn';
  const isHidden = !!p.hidden;

  const visSelector = data.can_edit_visibility ?
    '<div class="detail-vis-row"><span>可见范围：</span><select id="detailVisSelect" data-action="changeVisibility" data-post-id="'+(p.id||0)+'" data-author-id="'+(p.author_id||0)+'"><option value="public"'+(p.visibility==='public'?' selected':'')+'>公开</option><option value="friends"'+(p.visibility==='friends'?' selected':'')+'>仅好友</option><option value="self"'+(p.visibility==='self'?' selected':'')+'>仅自己</option></select></div>' : '';

  const commentCount = safeNum(data.comment_count);
  const likeCount = safeNum(data.like_count);
  const comments = safeArr(data.comments);
  const photoUrl = safeStr(p.photo_url);
  const content = safeStr(p.content,'（内容不可用）');
  const authorName = safeStr(author.name,'未知用户');
  const authorAvatar = safeStr(author.avatar_url);
  const createdAt = safeStr(p.created_at);
  const postId = p.id||0;

  let detailActions = '';
  if (Permissions.canLike()) {
    detailActions += '<button id="detailLikeBtn" class="'+likeCls+'" data-action="toggleLike" data-post-id="'+postId+'">'+likeIcon+' <span id="detailLikeCount">'+likeCount+'</span> 赞</button>';
  } else {
    detailActions += '<span class="feed-action-disabled">'+likeIcon+' '+likeCount+' 赞（'+escHtml(ROLE_LABELS[role()])+'不可点赞）</span>';
  }
  detailActions += '<span class="detail-comment-info">\uD83D\uDCAC '+commentCount+' 条评论</span>';
  if (data.can_hide) detailActions += ' <button class="btn-small btn-admin-hide" data-action="hidePost" data-post-id="'+postId+'">隐藏动态</button>';
  if (data.can_restore) detailActions += ' <button class="btn-small btn-admin-restore" data-action="restorePost" data-post-id="'+postId+'">恢复动态</button>';
  if (!data.can_hide && !data.can_restore && role()!=='admin') {
    detailActions += ' <button class="btn-small btn-disabled-action" data-action="tryHidePost" data-post-id="'+postId+'">隐藏</button>';
  }
  if (data.can_delete) {
    detailActions += ' <button class="btn-small btn-author-delete" data-action="deletePost" data-post-id="'+postId+'" data-author-id="'+(p.author_id||0)+'">删除动态</button>';
  } else if (role()!=='admin' && !(role()==='author' && p.author_id===uid())) {
    detailActions += ' <button class="btn-small btn-disabled-action" data-action="tryDeletePost" data-post-id="'+postId+'">删除</button>';
  }

  let commentForm = '';
  if (data.can_comment) {
    commentForm = '<div class="comment-form"><input type="text" id="newCommentInput" placeholder="写评论..." data-action="submitComment" data-post-id="'+postId+'"><button data-action="submitComment" data-post-id="'+postId+'">发表</button></div>';
  } else {
    commentForm = '<div class="comment-form-disabled">当前角色（'+escHtml(ROLE_LABELS[role()])+'）无权评论</div>';
  }

  document.getElementById('detailBody').innerHTML =
    '<input type="hidden" id="detailPostId" value="'+postId+'">' +
    '<div class="detail-author-row"><img class="detail-avatar" src="'+authorAvatar+'" alt="'+escHtml(authorName)+'" onerror="this.style.display=\'none\'"><div><span class="feed-author">'+escHtml(authorName)+'</span> <span class="feed-time">'+formatTime(createdAt)+'</span> <span class="feed-visibility">'+escHtml(safeStr(data.visibility_label))+'</span>'+(isHidden?' <span class="feed-hidden-tag">已隐藏</span>':'')+'</div></div>' +
    visSelector +
    '<div class="detail-content">'+escHtml(content)+'</div>' +
    (photoUrl?'<img class="detail-photo" src="'+photoUrl+'" alt="照片" onerror="this.style.display=\'none\'">':'') +
    '<div class="detail-actions">'+detailActions+'</div>' +
    '<div class="detail-section-title">评论 ('+commentCount+')</div>' +
    '<div id="commentsContainer">'+renderComments(comments)+'</div>' +
    commentForm;
}

function handleDetailClick(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const postId = parseInt(target.dataset.postId) || currentDetailPostID || 0;
  const commentId = parseInt(target.dataset.commentId) || 0;
  const authorId = parseInt(target.dataset.authorId) || 0;
  const commentAuthorId = parseInt(target.dataset.commentAuthorId) || 0;
  if (action==='toggleLike'&&postId) toggleLike(postId);
  if (action==='openDetail'&&postId) openDetail(postId);
  if (action==='closeDetail') closeDetail();
  if (action==='retryDetail'&&currentDetailPostID) openDetail(currentDetailPostID);
  if (action==='submitComment'&&postId) submitComment(postId);
  if (action==='submitReply'&&postId&&commentId) submitReply(postId,commentId);
  if (action==='showReplyForm'&&commentId) showReplyForm(commentId);
  if (action==='hidePost'&&postId) hidePost(postId);
  if (action==='restorePost'&&postId) restorePost(postId);
  if (action==='deletePost'&&postId) deletePost(postId,authorId);
  if (action==='hideComment'&&commentId) hideComment(commentId);
  if (action==='restoreComment'&&commentId) restoreComment(commentId);
  if (action==='deleteComment'&&commentId) deleteComment(commentId,commentAuthorId);
  if (action==='tryHidePost') showPermissionDenied('当前角色（'+ROLE_LABELS[role()]+'）无权隐藏动态，仅管理员可操作');
  if (action==='tryDeletePost') showPermissionDenied('当前角色（'+ROLE_LABELS[role()]+'）无权删除此动态，仅动态作者可删除自己的动态');
  if (action==='tryHideComment') showPermissionDenied('当前角色（'+ROLE_LABELS[role()]+'）无权隐藏评论，仅管理员可操作');
  if (action==='tryDeleteComment') showPermissionDenied('当前角色（'+ROLE_LABELS[role()]+'）无权删除此评论，仅评论作者可删除自己的评论');
}

function handleDetailKeydown(e) {
  if (e.key!=='Enter') return;
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const postId = parseInt(target.dataset.postId) || currentDetailPostID;
  const commentId = parseInt(target.dataset.commentId) || 0;
  if (action==='submitComment'&&postId) submitComment(postId);
  if (action==='submitReply'&&postId&&commentId) submitReply(postId,commentId);
}

function handleDetailChange(e) {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const postId = parseInt(target.dataset.postId);
  const authorId = parseInt(target.dataset.authorId) || 0;
  if (action==='changeVisibility'&&postId) changeVisibility(postId,authorId);
}

async function changeVisibility(postID, postAuthorId) {
  if (!Permissions.check('editVisibility',{authorId:postAuthorId})) { showPermissionDenied('仅动态作者可修改本人动态的可见范围'); return; }
  const sel = document.getElementById('detailVisSelect');
  if (!sel) return;
  const visibility = sel.value;
  try {
    await apiFetch('/api/posts/visibility', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({post_id:postID,visibility:visibility}) });
    const visLabel = {public:'公开',friends:'仅好友',self:'仅自己'}[visibility]||visibility;
    const labelEl = document.querySelector('.detail-author-row .feed-visibility');
    if (labelEl) labelEl.textContent = visLabel;
    refresh();
  } catch (e) { showPageError('修改可见范围失败：'+e.message); openDetail(postID); }
}

function renderComments(comments) {
  if (!comments||comments.length===0) return '<p style="color:#999;font-size:13px;">暂无评论，来说点什么吧</p>';
  return comments.map(function(c,i) {
    try { return renderCommentItem(c); }
    catch (e) { console.error('renderCommentItem error',i,e); return '<div class="comment-item" style="color:#999;">评论数据不完整</div>'; }
  }).join('');
}

function renderCommentItem(c) {
  const ca = c.author||{};
  const cm = c.comment||{};
  const commentId = cm.id||0;
  const postId = cm.post_id||0;
  const isHidden = !!cm.hidden;

  if (isHidden && !Permissions.canViewHidden()) return '';

  let commentActions = '';
  if (Permissions.canComment() && commentId) commentActions += '<button class="comment-reply-btn" data-action="showReplyForm" data-comment-id="'+commentId+'">回复</button>';
  if (c.can_delete) {
    commentActions += ' <button class="btn-small btn-author-delete" data-action="deleteComment" data-comment-id="'+commentId+'" data-comment-author-id="'+(cm.author_id||0)+'">删除</button>';
  } else if (role()!=='admin') {
    commentActions += ' <button class="btn-small btn-disabled-action" data-action="tryDeleteComment" data-comment-id="'+commentId+'" data-comment-author-id="'+(cm.author_id||0)+'">删除</button>';
  }
  if (c.can_hide) {
    commentActions += ' <button class="btn-small btn-admin-hide" data-action="hideComment" data-comment-id="'+commentId+'">隐藏</button>';
  } else if (c.can_restore) {
    commentActions += ' <button class="btn-small btn-admin-restore" data-action="restoreComment" data-comment-id="'+commentId+'">恢复</button>';
  } else if (role()!=='admin') {
    commentActions += ' <button class="btn-small btn-disabled-action" data-action="tryHideComment" data-comment-id="'+commentId+'">隐藏</button>';
  }

  const authorName = safeStr(ca.name,'未知用户');
  const authorAvatar = safeStr(ca.avatar_url);
  const commentContent = safeStr(cm.content,'（评论不可用）');
  const commentTime = safeStr(cm.created_at);

  let html = '<div class="comment-item'+(isHidden?' comment-item-hidden':'')+'">' +
    '<div class="comment-header"><img class="comment-avatar" src="'+authorAvatar+'" alt="" onerror="this.style.display=\'none\'"><span class="comment-author">'+escHtml(authorName)+'</span> <span class="comment-time">'+formatTime(commentTime)+'</span>'+(isHidden?' <span class="comment-hidden-tag">已隐藏</span>':'')+'</div>' +
    '<div class="comment-body">'+escHtml(commentContent)+'</div>' +
    commentActions;

  if (Permissions.canComment() && commentId) {
    html += '<div id="replyForm_'+commentId+'" style="display:none;" class="reply-form"><div class="comment-form"><input type="text" id="replyInput_'+commentId+'" placeholder="回复 '+escHtml(authorName)+'..." data-action="submitReply" data-post-id="'+postId+'" data-comment-id="'+commentId+'"><button data-action="submitReply" data-post-id="'+postId+'" data-comment-id="'+commentId+'">回复</button></div></div>';
  }

  const replies = safeArr(c.replies);
  if (replies.length>0) {
    html += '<div class="replies-list">' + replies.map(function(r) {
      try {
        const ra = r.author||{};
        const rm = r.comment||{};
        const rIsHidden = !!rm.hidden;
        const rCommentId = rm.id||0;
        let replyActions = '';
        if (r.can_delete) {
          replyActions += ' <button class="btn-small btn-author-delete" data-action="deleteComment" data-comment-id="'+rCommentId+'" data-comment-author-id="'+(rm.author_id||0)+'">删除</button>';
        } else if (role()!=='admin') {
          replyActions += ' <button class="btn-small btn-disabled-action" data-action="tryDeleteComment" data-comment-id="'+rCommentId+'" data-comment-author-id="'+(rm.author_id||0)+'">删除</button>';
        }
        if (r.can_hide) {
          replyActions += ' <button class="btn-small btn-admin-hide" data-action="hideComment" data-comment-id="'+rCommentId+'">隐藏</button>';
        } else if (r.can_restore) {
          replyActions += ' <button class="btn-small btn-admin-restore" data-action="restoreComment" data-comment-id="'+rCommentId+'">恢复</button>';
        } else if (role()!=='admin') {
          replyActions += ' <button class="btn-small btn-disabled-action" data-action="tryHideComment" data-comment-id="'+rCommentId+'">隐藏</button>';
        }
        return '<div class="reply-item'+(rIsHidden?' comment-item-hidden':'')+'">' +
          '<div class="comment-header"><img class="comment-avatar" src="'+safeStr(ra.avatar_url)+'" alt="" onerror="this.style.display=\'none\'"><span class="comment-author">'+escHtml(safeStr(ra.name,'未知'))+'</span> <span class="comment-time">'+formatTime(rm.created_at)+'</span>'+(rIsHidden?' <span class="comment-hidden-tag">已隐藏</span>':'')+'</div>' +
          '<div class="comment-body">'+escHtml(safeStr(rm.content,'（回复不可用）'))+'</div>' +
          replyActions +
        '</div>';
      } catch (e) { return '<div class="reply-item" style="color:#999;">回复数据不完整</div>'; }
    }).join('') + '</div>';
  }
  html += '</div>';
  return html;
}

function showReplyForm(commentID) {
  const form = document.getElementById('replyForm_'+commentID);
  if (!form) return;
  form.style.display = form.style.display==='none' ? '' : 'none';
  if (form.style.display!=='none') { const input = document.getElementById('replyInput_'+commentID); if (input) input.focus(); }
}

async function submitComment(postID) {
  if (!Permissions.check('comment')) { showPermissionDenied('当前角色（'+ROLE_LABELS[role()]+'）无权评论'); return; }
  const input = document.getElementById('newCommentInput');
  const content = input ? input.value.trim() : '';
  if (!content) return;
  try {
    await apiFetch('/api/comments/create?post_id='+postID, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({content:content}) });
    await openDetail(postID);
    refresh();
  } catch (e) { showPageError('评论失败：'+e.message); }
}

async function submitReply(postID, parentID) {
  if (!Permissions.check('comment')) { showPermissionDenied('当前角色（'+ROLE_LABELS[role()]+'）无权回复'); return; }
  const input = document.getElementById('replyInput_'+parentID);
  const content = input ? input.value.trim() : '';
  if (!content) return;
  try {
    await apiFetch('/api/comments/create?post_id='+postID, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({content:content,parent_id:parentID}) });
    await openDetail(postID);
    refresh();
  } catch (e) { showPageError('回复失败：'+e.message); }
}

function closeDetail() {
  document.getElementById('detailModal').style.display = 'none';
  currentDetailPostID = null;
  refresh();
}

async function loadClassmates() {
  const container = document.getElementById('classmatesList');
  if (!container) return;
  try {
    const resp = await apiFetch('/api/classmates');
    let items, canAdd;
    if (resp && resp.items) { items = resp.items; canAdd = resp.can_add; }
    else if (Array.isArray(resp)) { items = resp; canAdd = Permissions.canAddFriend(); }
    else { container.innerHTML = '<p style="color:#999;font-size:13px;">暂无同学</p>'; return; }
    if (!items || items.length === 0) { container.innerHTML = '<p style="color:#999;font-size:13px;">暂无同学</p>'; return; }
    container.innerHTML = items.map(function(c) {
      try {
        const u = c.user || {};
        const s = c.friend_status || 'none';
        const cid = u.id;
        const relId = c.relation_id || 0;
        let statusHtml = '';
        if (s === 'accepted') {
          statusHtml = '<span class="classmate-status">好友</span>' + (canAdd ? '<button class="btn-small btn-unfriend" data-action="unfriend" data-user-id="' + cid + '">解除</button>' : '');
        } else if (s === 'pending') {
          statusHtml = '<span class="classmate-status">待确认</span>' + (canAdd ? '<button class="btn-small btn-cancel" data-action="cancelFriend" data-user-id="' + cid + '">取消</button>' : '');
        } else if (s === 'pending_received') {
          statusHtml = '<span class="classmate-status">申请你</span>' + (canAdd ? '<button class="btn-small btn-accept" data-action="acceptFriend" data-relation-id="' + relId + '">接受</button><button class="btn-small btn-reject" data-action="rejectFriend" data-relation-id="' + relId + '">拒绝</button>' : '');
        } else {
          statusHtml = '<span class="classmate-status">陌生人</span>' + (canAdd ? '<button class="btn-small btn-add" data-action="addFriend" data-user-id="' + cid + '">添加</button>' : '<span class="classmate-status" style="color:#bbb;">管理员不可加好友</span>');
        }
        return '<div class="classmate-item"><img class="classmate-avatar" src="' + safeStr(u.avatar_url) + '" alt="' + escHtml(safeStr(u.name)) + '" onerror="this.style.display=\'none\'"><div class="classmate-info"><div class="classmate-name">' + escHtml(safeStr(u.name, '未知')) + '</div></div>' + statusHtml + '</div>';
      } catch (e) { console.error('renderClassmate error', e); return ''; }
    }).join('');
  } catch (e) { showLoadError(container, '加载好友失败：' + e.message, retryAll); }
}

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
  if (!Permissions.check('addFriend')) { showPermissionDenied('当前角色（' + ROLE_LABELS[role()] + '）无权添加好友'); return; }
  try { await apiFetch('/api/friends/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to_id: toID }) }); refresh(); }
  catch (e) { showPageError('发送申请失败：' + e.message); }
}

async function cancelFriend(toID) {
  try { await apiFetch('/api/friends/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to_id: toID }) }); refresh(); }
  catch (e) { showPageError('取消申请失败：' + e.message); }
}

async function acceptFriend(relationID) {
  try { await apiFetch('/api/friends/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ relation_id: relationID }) }); refresh(); }
  catch (e) { showPageError('接受申请失败：' + e.message); }
}

async function rejectFriend(relationID) {
  try { await apiFetch('/api/friends/reject', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ relation_id: relationID }) }); refresh(); }
  catch (e) { showPageError('拒绝申请失败：' + e.message); }
}

async function unfriend(friendID) {
  if (!confirm('确定解除好友关系？')) return;
  try { await apiFetch('/api/friends/unfriend', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ friend_id: friendID }) }); refresh(); }
  catch (e) { showPageError('解除好友失败：' + e.message); }
}

// ===== 统计 =====
async function loadStats() {
  try {
    const stats = await apiFetch('/api/stats');
    if (!stats) { setStatsError(); return; }
    const ids = { post_count: 'statPostCount', friend_count: 'statFriendCount', pending_count: 'statPendingCount', visible_post_count: 'statVisibleCount', comment_count: 'statCommentCount', my_posts_visible_count: 'statMyVisibleCount' };
    for (const [key, id] of Object.entries(ids)) { const el = document.getElementById(id); if (el) el.textContent = stats[key] != null ? stats[key] : 0; }
  } catch (e) { console.error('loadStats error:', e); setStatsError(); }
}

// 点击遮罩关闭详情
document.addEventListener('click', function(e) { if (e.target.id === 'detailModal') closeDetail(); });

// 启动
if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', boot); }
else { boot(); }