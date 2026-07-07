package handlers

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"campus-net/models"
	"campus-net/store"
)

// Handlers HTTP处理器集合
type Handlers struct {
	store *store.Store
}

// New 创建处理器
func New(s *store.Store) *Handlers {
	return &Handlers{store: s}
}

// getCurrentUser 从query参数获取当前用户ID（模拟登录）
func (h *Handlers) getCurrentUser(r *http.Request) int {
	q := r.URL.Query().Get("uid")
	if q == "" {
		return 1
	}
	id, err := strconv.Atoi(q)
	if err != nil {
		return 1
	}
	return id
}

// getCurrentRole 从query参数获取当前角色
func (h *Handlers) getCurrentRole(r *http.Request) models.Role {
	q := r.URL.Query().Get("role")
	role := models.Role(q)
	switch role {
	case models.RoleStudent, models.RoleAuthor, models.RoleAdmin:
		return role
	default:
		return models.RoleStudent
	}
}

func writeJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	json.NewEncoder(w).Encode(data)
}

func writeError(w http.ResponseWriter, msg string, code int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}

// ===== 用户列表 =====

// GetUsers 获取所有用户（供前端选择身份）
func (h *Handlers) GetUsers(w http.ResponseWriter, r *http.Request) {
	users := h.store.GetAllUsers()
	writeJSON(w, users)
}

// ===== 动态 Feed =====

// FeedItem 动态列表项（含评论/回复完整结构 + 权限标记）
type FeedItem struct {
	Post            models.Post   `json:"post"`
	Author          models.User   `json:"author"`
	Comments        []CommentItem `json:"comments"`
	CommentCount    int           `json:"comment_count"`
	LikeCount       int           `json:"like_count"`
	IsLiked         bool          `json:"is_liked"`
	VisibilityLabel string        `json:"visibility_label"`
	// 权限标记
	CanEditVisibility bool `json:"can_edit_visibility"` // 作者角色+本人动态
	CanDelete         bool `json:"can_delete"`          // 作者角色+本人动态
	CanHide           bool `json:"can_hide"`            // 管理员
	CanRestore        bool `json:"can_restore"`         // 管理员+已隐藏
}

// GetFeed 获取可见动态列表
func (h *Handlers) GetFeed(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)
	posts := h.store.GetVisiblePosts(uid, role)
	items := make([]FeedItem, 0, len(posts))
	for _, p := range posts {
		author := h.store.GetUser(p.AuthorID)
		if author == nil {
			continue
		}
		comments := h.store.GetCommentsByPost(p.ID, role)
		commentItems := buildCommentTree(comments, h.store, uid, role)
		items = append(items, FeedItem{
			Post:              p,
			Author:            *author,
			Comments:          commentItems,
			CommentCount:      h.store.CountCommentsByPost(p.ID, role),
			LikeCount:         h.store.CountLikesByPost(p.ID),
			IsLiked:           h.store.IsLikedByUser(uid, p.ID),
			VisibilityLabel:   visibilityLabel(p.Visibility),
			CanEditVisibility: role == models.RoleAuthor && p.AuthorID == uid,
			CanDelete:         role == models.RoleAuthor && p.AuthorID == uid,
			CanHide:           role == models.RoleAdmin && !p.Hidden,
			CanRestore:        role == models.RoleAdmin && p.Hidden,
		})
	}
	writeJSON(w, items)
}

func visibilityLabel(v models.Visibility) string {
	switch v {
	case models.VisibilityPublic:
		return "公开"
	case models.VisibilityFriends:
		return "仅好友"
	case models.VisibilitySelfOnly:
		return "仅自己"
	default:
		return string(v)
	}
}

// ===== 动态详情 =====

// PostDetail 动态详情
type PostDetail struct {
	Post            models.Post   `json:"post"`
	Author          models.User   `json:"author"`
	Comments        []CommentItem `json:"comments"`
	LikeCount       int           `json:"like_count"`
	IsLiked         bool          `json:"is_liked"`
	CommentCount    int           `json:"comment_count"`
	VisibilityLabel string        `json:"visibility_label"`
	// 权限标记
	CanEditVisibility bool `json:"can_edit_visibility"`
	CanDelete         bool `json:"can_delete"`
	CanHide           bool `json:"can_hide"`
	CanRestore        bool `json:"can_restore"`
	CanComment        bool `json:"can_comment"` // 学生和作者可以评论
}

// CommentItem 评论项（含回复树 + 权限标记）
type CommentItem struct {
	Comment  models.Comment `json:"comment"`
	Author   models.User    `json:"author"`
	Replies  []CommentItem  `json:"replies"`
	CanDelete  bool `json:"can_delete"`  // 作者角色+本人评论
	CanHide    bool `json:"can_hide"`    // 管理员
	CanRestore bool `json:"can_restore"` // 管理员+已隐藏
}

// GetPostDetail 获取动态详情
func (h *Handlers) GetPostDetail(w http.ResponseWriter, r *http.Request) {
	postID, err := strconv.Atoi(r.URL.Query().Get("id"))
	if err != nil {
		writeError(w, "invalid post id", 400)
		return
	}

	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)
	post := h.store.GetPost(postID)
	if post == nil {
		writeError(w, "动态不存在", 404)
		return
	}

	// 被隐藏的动态只有管理员可见
	if post.Hidden && role != models.RoleAdmin {
		writeError(w, "该动态已被管理员隐藏", 403)
		return
	}

	// 可见性检查
	if !isViewable(*post, uid, role, h.store) {
		writeError(w, "你没有权限查看此动态", 403)
		return
	}

	author := h.store.GetUser(post.AuthorID)
	comments := h.store.GetCommentsByPost(postID, role)
	commentItems := buildCommentTree(comments, h.store, uid, role)

	writeJSON(w, PostDetail{
		Post:              *post,
		Author:            *author,
		Comments:          commentItems,
		LikeCount:         h.store.CountLikesByPost(postID),
		IsLiked:           h.store.IsLikedByUser(uid, postID),
		CommentCount:      h.store.CountCommentsByPost(postID, role),
		VisibilityLabel:   visibilityLabel(post.Visibility),
		CanEditVisibility: role == models.RoleAuthor && post.AuthorID == uid,
		CanDelete:         role == models.RoleAuthor && post.AuthorID == uid,
		CanHide:           role == models.RoleAdmin && !post.Hidden,
		CanRestore:        role == models.RoleAdmin && post.Hidden,
		CanComment:        role == models.RoleStudent || role == models.RoleAuthor,
	})
}

func isViewable(p models.Post, uid int, role models.Role, s *store.Store) bool {
	// 管理员可看到所有动态（用于审核管理）
	if role == models.RoleAdmin {
		return true
	}
	switch p.Visibility {
	case models.VisibilityPublic:
		return true
	case models.VisibilityFriends:
		return p.AuthorID == uid || s.AreFriends(p.AuthorID, uid)
	case models.VisibilitySelfOnly:
		return p.AuthorID == uid
	}
	return false
}

func buildCommentTree(comments []models.Comment, s *store.Store, uid int, role models.Role) []CommentItem {
	topLevel := []CommentItem{}
	repliesMap := map[int][]CommentItem{}

	for _, c := range comments {
		author := s.GetUser(c.AuthorID)
		if author == nil {
			continue
		}
		item := CommentItem{
			Comment:    c,
			Author:     *author,
			Replies:    []CommentItem{},
			CanDelete:  role == models.RoleAuthor && c.AuthorID == uid,
			CanHide:    role == models.RoleAdmin && !c.Hidden,
			CanRestore: role == models.RoleAdmin && c.Hidden,
		}
		if c.ParentID == nil {
			topLevel = append(topLevel, item)
		} else {
			repliesMap[*c.ParentID] = append(repliesMap[*c.ParentID], item)
		}
	}

	for i := range topLevel {
		if replies, ok := repliesMap[topLevel[i].Comment.ID]; ok {
			topLevel[i].Replies = replies
		}
	}
	return topLevel
}

// ===== 发布动态 =====

// CreatePostRequest 创建动态请求
type CreatePostRequest struct {
	Content    string `json:"content"`
	PhotoURL   string `json:"photo_url"`
	Visibility string `json:"visibility"`
}

// CreatePost 创建新动态（学生和作者角色可发布）
func (h *Handlers) CreatePost(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)

	if role != models.RoleStudent && role != models.RoleAuthor {
		writeError(w, "当前角色无权发布动态", 403)
		return
	}

	var req CreatePostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}

	vis := models.Visibility(req.Visibility)
	if vis != models.VisibilityPublic && vis != models.VisibilityFriends && vis != models.VisibilitySelfOnly {
		vis = models.VisibilityPublic
	}

	if req.PhotoURL == "" {
		req.PhotoURL = "https://picsum.photos/seed/new" + strconv.Itoa(int(time.Now().Unix())) + "/600/400"
	}

	post := h.store.CreatePost(uid, req.Content, req.PhotoURL, vis)
	writeJSON(w, post)
}

// ===== 评论 =====

// CreateCommentRequest 创建评论请求
type CreateCommentRequest struct {
	Content  string `json:"content"`
	ParentID *int   `json:"parent_id"`
}

// CreateComment 创建评论或回复（学生和作者角色可评论）
func (h *Handlers) CreateComment(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)

	if role != models.RoleStudent && role != models.RoleAuthor {
		writeError(w, "当前角色无权评论", 403)
		return
	}

	postID, err := strconv.Atoi(r.URL.Query().Get("post_id"))
	if err != nil {
		writeError(w, "invalid post id", 400)
		return
	}

	var req CreateCommentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}

	comment := h.store.CreateComment(postID, uid, req.Content, req.ParentID)
	writeJSON(w, comment)
}

// ===== 点赞 =====

// ToggleLike 切换点赞状态（学生和作者角色可点赞）
func (h *Handlers) ToggleLike(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)

	if role != models.RoleStudent && role != models.RoleAuthor {
		writeError(w, "当前角色无权点赞", 403)
		return
	}

	var req struct {
		PostID int `json:"post_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	liked, likeCount := h.store.ToggleLike(uid, req.PostID)
	writeJSON(w, map[string]interface{}{
		"liked":      liked,
		"like_count": likeCount,
	})
}

// ===== 好友 =====

// FriendItem 好友列表项
type FriendItem struct {
	User         models.User          `json:"user"`
	FriendStatus models.FriendStatus `json:"friend_status"`
	RelationID   int                  `json:"relation_id,omitempty"`
}

// GetClassmates 获取同学列表（含好友状态）
func (h *Handlers) GetClassmates(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)
	users := h.store.GetAllUsers()
	items := make([]FriendItem, 0)
	pendings := h.store.GetPendingReceived(uid)
	sentPendings := h.store.GetPendingSent(uid)

	for _, u := range users {
		if u.ID == uid {
			continue
		}
		status := h.store.GetFriendStatus(uid, u.ID)
		var relID int
		// 收到的申请
		for _, pr := range pendings {
			if pr.FromID == u.ID {
				relID = pr.ID
				break
			}
		}
		// 发出的申请（用于取消）
		if relID == 0 {
			for _, sp := range sentPendings {
				if sp.ToID == u.ID {
					relID = sp.ID
					break
				}
			}
		}
		items = append(items, FriendItem{
			User:         u,
			FriendStatus: status,
			RelationID:   relID,
		})
	}

	// 附带当前角色信息，方便前端判断好友操作权限
	type ClassmatesResponse struct {
		Items    []FriendItem  `json:"items"`
		Role     models.Role   `json:"role"`
		CanAdd   bool          `json:"can_add"` // 学生和作者可以加好友
	}
	writeJSON(w, ClassmatesResponse{
		Items:  items,
		Role:   role,
		CanAdd: role == models.RoleStudent || role == models.RoleAuthor,
	})
}

// SendFriendRequest 发送好友申请（学生和作者角色）
func (h *Handlers) SendFriendRequest(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)

	if role != models.RoleStudent && role != models.RoleAuthor {
		writeError(w, "当前角色无权添加好友", 403)
		return
	}

	var req struct {
		ToID int `json:"to_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	rel, err := h.store.SendFriendRequest(uid, req.ToID)
	if err != nil {
		writeError(w, err.Error(), 400)
		return
	}
	writeJSON(w, rel)
}

// AcceptFriendRequest 接受好友申请（学生和作者角色）
func (h *Handlers) AcceptFriendRequest(w http.ResponseWriter, r *http.Request) {
	role := h.getCurrentRole(r)

	if role != models.RoleStudent && role != models.RoleAuthor {
		writeError(w, "当前角色无权处理好友申请", 403)
		return
	}

	var req struct {
		RelationID int `json:"relation_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.AcceptFriendRequest(req.RelationID)
	writeJSON(w, map[string]bool{"success": ok})
}

// CancelFriendRequest 取消已发送的好友申请（学生和作者角色）
func (h *Handlers) CancelFriendRequest(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)

	if role != models.RoleStudent && role != models.RoleAuthor {
		writeError(w, "当前角色无权操作好友申请", 403)
		return
	}

	var req struct {
		ToID int `json:"to_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.CancelFriendRequest(uid, req.ToID)
	writeJSON(w, map[string]bool{"success": ok})
}

// RejectFriendRequest 拒绝收到的好友申请（学生和作者角色）
func (h *Handlers) RejectFriendRequest(w http.ResponseWriter, r *http.Request) {
	role := h.getCurrentRole(r)

	if role != models.RoleStudent && role != models.RoleAuthor {
		writeError(w, "当前角色无权操作好友申请", 403)
		return
	}

	var req struct {
		RelationID int `json:"relation_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.RejectFriendRequest(req.RelationID)
	writeJSON(w, map[string]bool{"success": ok})
}

// Unfriend 解除好友关系（学生和作者角色）
func (h *Handlers) Unfriend(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)

	if role != models.RoleStudent && role != models.RoleAuthor {
		writeError(w, "当前角色无权解除好友", 403)
		return
	}

	var req struct {
		FriendID int `json:"friend_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.Unfriend(uid, req.FriendID)
	writeJSON(w, map[string]bool{"success": ok})
}

// UpdatePostVisibility 修改动态可见范围（仅作者角色+本人动态）
func (h *Handlers) UpdatePostVisibility(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)

	if role != models.RoleAuthor {
		writeError(w, "仅动态作者角色可修改可见范围", 403)
		return
	}

	var req struct {
		PostID     int    `json:"post_id"`
		Visibility string `json:"visibility"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	vis := models.Visibility(req.Visibility)
	if vis != models.VisibilityPublic && vis != models.VisibilityFriends && vis != models.VisibilitySelfOnly {
		writeError(w, "invalid visibility", 400)
		return
	}
	ok := h.store.UpdatePostVisibility(req.PostID, uid, vis)
	if !ok {
		writeError(w, "无法修改，仅作者可修改本人动态的可见范围", 403)
		return
	}
	writeJSON(w, map[string]bool{"success": true})
}

// ===== 管理员操作：隐藏/恢复/删除 =====

// HidePost 隐藏动态（仅管理员）
func (h *Handlers) HidePost(w http.ResponseWriter, r *http.Request) {
	role := h.getCurrentRole(r)
	if role != models.RoleAdmin {
		writeError(w, "仅管理员可隐藏动态", 403)
		return
	}
	var req struct {
		PostID int `json:"post_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.HidePost(req.PostID)
	if !ok {
		writeError(w, "动态不存在", 404)
		return
	}
	writeJSON(w, map[string]bool{"success": true})
}

// RestorePost 恢复动态（仅管理员）
func (h *Handlers) RestorePost(w http.ResponseWriter, r *http.Request) {
	role := h.getCurrentRole(r)
	if role != models.RoleAdmin {
		writeError(w, "仅管理员可恢复动态", 403)
		return
	}
	var req struct {
		PostID int `json:"post_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.RestorePost(req.PostID)
	if !ok {
		writeError(w, "动态不存在", 404)
		return
	}
	writeJSON(w, map[string]bool{"success": true})
}

// DeletePost 删除动态（仅作者角色+本人动态）
func (h *Handlers) DeletePost(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)

	if role != models.RoleAuthor {
		writeError(w, "仅动态作者角色可删除动态", 403)
		return
	}

	var req struct {
		PostID int `json:"post_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.DeletePost(req.PostID, uid)
	if !ok {
		writeError(w, "无法删除，仅可删除本人动态", 403)
		return
	}
	writeJSON(w, map[string]bool{"success": true})
}

// HideComment 隐藏评论（仅管理员）
func (h *Handlers) HideComment(w http.ResponseWriter, r *http.Request) {
	role := h.getCurrentRole(r)
	if role != models.RoleAdmin {
		writeError(w, "仅管理员可隐藏评论", 403)
		return
	}
	var req struct {
		CommentID int `json:"comment_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.HideComment(req.CommentID)
	if !ok {
		writeError(w, "评论不存在", 404)
		return
	}
	writeJSON(w, map[string]bool{"success": true})
}

// RestoreComment 恢复评论（仅管理员）
func (h *Handlers) RestoreComment(w http.ResponseWriter, r *http.Request) {
	role := h.getCurrentRole(r)
	if role != models.RoleAdmin {
		writeError(w, "仅管理员可恢复评论", 403)
		return
	}
	var req struct {
		CommentID int `json:"comment_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.RestoreComment(req.CommentID)
	if !ok {
		writeError(w, "评论不存在", 404)
		return
	}
	writeJSON(w, map[string]bool{"success": true})
}

// DeleteComment 删除评论（仅作者角色+本人评论）
func (h *Handlers) DeleteComment(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)

	if role != models.RoleAuthor {
		writeError(w, "仅动态作者角色可删除评论", 403)
		return
	}

	var req struct {
		CommentID int `json:"comment_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	ok := h.store.DeleteComment(req.CommentID, uid)
	if !ok {
		writeError(w, "无法删除，仅可删除本人评论", 403)
		return
	}
	writeJSON(w, map[string]bool{"success": true})
}

// ===== 当前用户信息 =====

// GetCurrentUser 获取当前用户信息（含角色）
func (h *Handlers) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)
	user := h.store.GetUser(uid)

	roleLabel := ""
	switch role {
	case models.RoleStudent:
		roleLabel = "普通学生"
	case models.RoleAuthor:
		roleLabel = "动态作者"
	case models.RoleAdmin:
		roleLabel = "管理员"
	}

	type MeResponse struct {
		UID       int          `json:"uid"`
		Name      string       `json:"name"`
		AvatarURL string       `json:"avatar_url"`
		Role      models.Role  `json:"role"`
		RoleLabel string       `json:"role_label"`
		Valid     bool         `json:"valid"`
	}

	if user == nil {
		writeJSON(w, MeResponse{UID: uid, Role: role, RoleLabel: roleLabel, Valid: false})
		return
	}
	writeJSON(w, MeResponse{
		UID:       uid,
		Name:      user.Name,
		AvatarURL: user.AvatarURL,
		Role:      role,
		RoleLabel: roleLabel,
		Valid:     true,
	})
}

// ===== 统计 =====

// GetStats 获取统计信息
func (h *Handlers) GetStats(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	role := h.getCurrentRole(r)
	writeJSON(w, models.Stats{
		PostCount:           h.store.CountAllPosts(),
		FriendCount:         h.store.CountFriends(uid),
		PendingCount:        h.store.CountPending(uid),
		VisiblePostCount:    h.store.CountVisiblePosts(uid, role),
		MyPostsVisibleCount: h.store.CountMyPostsVisibleToOthers(uid),
		CommentCount:        h.store.CountAllComments(role),
	})
}

// RegisterRoutes 注册路由
func (h *Handlers) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/me", h.GetCurrentUser)
	mux.HandleFunc("/api/users", h.GetUsers)
	mux.HandleFunc("/api/feed", h.GetFeed)
	mux.HandleFunc("/api/posts/detail", h.GetPostDetail)
	mux.HandleFunc("/api/posts/create", h.CreatePost)
	mux.HandleFunc("/api/posts/visibility", h.UpdatePostVisibility)
	mux.HandleFunc("/api/posts/delete", h.DeletePost)
	mux.HandleFunc("/api/posts/hide", h.HidePost)
	mux.HandleFunc("/api/posts/restore", h.RestorePost)
	mux.HandleFunc("/api/comments/create", h.CreateComment)
	mux.HandleFunc("/api/comments/delete", h.DeleteComment)
	mux.HandleFunc("/api/comments/hide", h.HideComment)
	mux.HandleFunc("/api/comments/restore", h.RestoreComment)
	mux.HandleFunc("/api/likes/toggle", h.ToggleLike)
	mux.HandleFunc("/api/classmates", h.GetClassmates)
	mux.HandleFunc("/api/friends/send", h.SendFriendRequest)
	mux.HandleFunc("/api/friends/accept", h.AcceptFriendRequest)
	mux.HandleFunc("/api/friends/cancel", h.CancelFriendRequest)
	mux.HandleFunc("/api/friends/reject", h.RejectFriendRequest)
	mux.HandleFunc("/api/friends/unfriend", h.Unfriend)
	mux.HandleFunc("/api/stats", h.GetStats)
}
