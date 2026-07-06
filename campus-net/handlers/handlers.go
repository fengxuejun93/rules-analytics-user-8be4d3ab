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

// FeedItem 动态列表项
type FeedItem struct {
	Post            models.Post `json:"post"`
	Author          models.User `json:"author"`
	CommentCount    int         `json:"comment_count"`
	LikeCount       int         `json:"like_count"`
	IsLiked         bool        `json:"is_liked"`
	VisibilityLabel string      `json:"visibility_label"`
}

// GetFeed 获取可见动态列表
func (h *Handlers) GetFeed(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	posts := h.store.GetVisiblePosts(uid)
	items := make([]FeedItem, 0, len(posts))
	for _, p := range posts {
		author := h.store.GetUser(p.AuthorID)
		if author == nil {
			continue
		}
		items = append(items, FeedItem{
			Post:            p,
			Author:          *author,
			CommentCount:    h.store.CountCommentsByPost(p.ID),
			LikeCount:       h.store.CountLikesByPost(p.ID),
			IsLiked:         h.store.IsLikedByUser(uid, p.ID),
			VisibilityLabel: visibilityLabel(p.Visibility),
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
}

// CommentItem 评论项（含回复树）
type CommentItem struct {
	Comment models.Comment `json:"comment"`
	Author  models.User    `json:"author"`
	Replies []CommentItem  `json:"replies"`
}

// GetPostDetail 获取动态详情
func (h *Handlers) GetPostDetail(w http.ResponseWriter, r *http.Request) {
	postID, err := strconv.Atoi(r.URL.Query().Get("id"))
	if err != nil {
		writeError(w, "invalid post id", 400)
		return
	}

	uid := h.getCurrentUser(r)
	post := h.store.GetPost(postID)
	if post == nil {
		writeError(w, "动态不存在", 404)
		return
	}

	// 可见性检查
	if !isViewable(*post, uid, h.store) {
		writeError(w, "你没有权限查看此动态", 403)
		return
	}

	author := h.store.GetUser(post.AuthorID)
	comments := h.store.GetCommentsByPost(postID)
	commentItems := buildCommentTree(comments, h.store)

	writeJSON(w, PostDetail{
		Post:            *post,
		Author:          *author,
		Comments:        commentItems,
		LikeCount:       h.store.CountLikesByPost(postID),
		IsLiked:         h.store.IsLikedByUser(uid, postID),
		CommentCount:    h.store.CountCommentsByPost(postID),
		VisibilityLabel: visibilityLabel(post.Visibility),
	})
}

func isViewable(p models.Post, uid int, s *store.Store) bool {
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

func buildCommentTree(comments []models.Comment, s *store.Store) []CommentItem {
	topLevel := []CommentItem{}
	repliesMap := map[int][]CommentItem{}

	for _, c := range comments {
		author := s.GetUser(c.AuthorID)
		if author == nil {
			continue
		}
		item := CommentItem{
			Comment: c,
			Author:  *author,
			Replies: []CommentItem{},
		}
		if c.ParentID == nil {
			topLevel = append(topLevel, item)
		} else {
			repliesMap[*c.ParentID] = append(repliesMap[*c.ParentID], item)
		}
	}

	for i := range topLevel {
		topLevel[i].Replies = repliesMap[topLevel[i].Comment.ID]
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

// CreatePost 创建新动态
func (h *Handlers) CreatePost(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
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

// CreateComment 创建评论或回复
func (h *Handlers) CreateComment(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
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

// ToggleLike 切换点赞状态
func (h *Handlers) ToggleLike(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
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
	users := h.store.GetAllUsers()
	items := make([]FriendItem, 0)
	for _, u := range users {
		if u.ID == uid {
			continue
		}
		status := h.store.GetFriendStatus(uid, u.ID)
		var relID int
		pendings := h.store.GetPendingReceived(uid)
		for _, pr := range pendings {
			if pr.FromID == u.ID {
				relID = pr.ID
				break
			}
		}
		items = append(items, FriendItem{
			User:         u,
			FriendStatus: status,
			RelationID:   relID,
		})
	}
	writeJSON(w, items)
}

// SendFriendRequest 发送好友申请
func (h *Handlers) SendFriendRequest(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	var req struct {
		ToID int `json:"to_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, "invalid request", 400)
		return
	}
	rel := h.store.SendFriendRequest(uid, req.ToID)
	writeJSON(w, rel)
}

// AcceptFriendRequest 接受好友申请
func (h *Handlers) AcceptFriendRequest(w http.ResponseWriter, r *http.Request) {
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

// ===== 统计 =====

// GetStats 获取统计信息
func (h *Handlers) GetStats(w http.ResponseWriter, r *http.Request) {
	uid := h.getCurrentUser(r)
	writeJSON(w, models.Stats{
		PostCount:        h.store.CountAllPosts(),
		FriendCount:      h.store.CountFriends(uid),
		PendingCount:     h.store.CountPending(uid),
		VisiblePostCount: h.store.CountVisiblePosts(uid),
	})
}

// RegisterRoutes 注册路由
func (h *Handlers) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/users", h.GetUsers)
	mux.HandleFunc("/api/feed", h.GetFeed)
	mux.HandleFunc("/api/posts/detail", h.GetPostDetail)
	mux.HandleFunc("/api/posts/create", h.CreatePost)
	mux.HandleFunc("/api/comments/create", h.CreateComment)
	mux.HandleFunc("/api/likes/toggle", h.ToggleLike)
	mux.HandleFunc("/api/classmates", h.GetClassmates)
	mux.HandleFunc("/api/friends/send", h.SendFriendRequest)
	mux.HandleFunc("/api/friends/accept", h.AcceptFriendRequest)
	mux.HandleFunc("/api/stats", h.GetStats)
}
