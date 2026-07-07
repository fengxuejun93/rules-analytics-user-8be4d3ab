package store

import (
	"fmt"
	"sort"
	"sync"
	"time"

	"campus-net/models"
)

// Store 内存数据存储
type Store struct {
	mu              sync.RWMutex
	users           []models.User
	posts           []models.Post
	comments        []models.Comment
	friendRelations []models.FriendRelation
	likes           []models.Like
	nextUserID      int
	nextPostID      int
	nextCommentID   int
	nextFriendID    int
	nextLikeID      int
}

// NewStore 创建存储并初始化种子数据
func NewStore() *Store {
	s := &Store{
		nextUserID:    1,
		nextPostID:    1,
		nextCommentID: 1,
		nextFriendID:  1,
		nextLikeID:    1,
	}
	s.seed()
	return s
}

func (s *Store) seed() {
	// 种子用户
	users := []models.User{
		{ID: 1, Name: "张三", AvatarURL: "https://i.pravatar.cc/80?img=1"},
		{ID: 2, Name: "李四", AvatarURL: "https://i.pravatar.cc/80?img=2"},
		{ID: 3, Name: "王五", AvatarURL: "https://i.pravatar.cc/80?img=3"},
		{ID: 4, Name: "赵六", AvatarURL: "https://i.pravatar.cc/80?img=4"},
		{ID: 5, Name: "钱七", AvatarURL: "https://i.pravatar.cc/80?img=5"},
	}
	s.users = users
	s.nextUserID = 6

	// 种子好友关系：1和2已是好友，3向1发了待确认申请
	relations := []models.FriendRelation{
		{ID: 1, FromID: 1, ToID: 2, Status: models.FriendStatusAccepted},
		{ID: 2, FromID: 2, ToID: 1, Status: models.FriendStatusAccepted},
		{ID: 3, FromID: 3, ToID: 1, Status: models.FriendStatusPending},
	}
	s.friendRelations = relations
	s.nextFriendID = 4

	// 种子动态
	now := time.Now()
	posts := []models.Post{
		{ID: 1, AuthorID: 1, Content: "今天天气真好，校园里的银杏树黄了！", PhotoURL: "https://picsum.photos/seed/p1/600/400", Visibility: models.VisibilityPublic, CreatedAt: now.Add(-2 * time.Hour)},
		{ID: 2, AuthorID: 2, Content: "图书馆占座成功，期末冲刺开始！", PhotoURL: "https://picsum.photos/seed/p2/600/400", Visibility: models.VisibilityFriends, CreatedAt: now.Add(-1 * time.Hour)},
		{ID: 3, AuthorID: 3, Content: "偷偷发一条仅自己可见的心情", PhotoURL: "https://picsum.photos/seed/p3/600/400", Visibility: models.VisibilitySelfOnly, CreatedAt: now.Add(-30 * time.Minute)},
		{ID: 4, AuthorID: 4, Content: "食堂新出的红烧肉不错！", PhotoURL: "https://picsum.photos/seed/p4/600/400", Visibility: models.VisibilityPublic, CreatedAt: now.Add(-15 * time.Minute)},
		{ID: 5, AuthorID: 5, Content: "社团招新啦，快来报名！", PhotoURL: "https://picsum.photos/seed/p5/600/400", Visibility: models.VisibilityPublic, CreatedAt: now.Add(-10 * time.Minute)},
		{ID: 6, AuthorID: 1, Content: "周末和同学去了趟郊外，风景很赞", PhotoURL: "https://picsum.photos/seed/p6/600/400", Visibility: models.VisibilityFriends, CreatedAt: now.Add(-5 * time.Minute)},
	}
	s.posts = posts
	s.nextPostID = 7

	// 种子评论
	comments := []models.Comment{
		{ID: 1, PostID: 1, AuthorID: 2, Content: "确实很美！", ParentID: nil, CreatedAt: now.Add(-90 * time.Minute)},
		{ID: 2, PostID: 1, AuthorID: 1, Content: "谢谢～", ParentID: intPtr(1), CreatedAt: now.Add(-80 * time.Minute)},
		{ID: 3, PostID: 2, AuthorID: 1, Content: "加油！", ParentID: nil, CreatedAt: now.Add(-45 * time.Minute)},
		{ID: 4, PostID: 4, AuthorID: 3, Content: "我也觉得好吃！", ParentID: nil, CreatedAt: now.Add(-12 * time.Minute)},
		{ID: 5, PostID: 4, AuthorID: 1, Content: "下次一起去", ParentID: intPtr(4), CreatedAt: now.Add(-10 * time.Minute)},
		{ID: 6, PostID: 5, AuthorID: 1, Content: "什么社团？", ParentID: nil, CreatedAt: now.Add(-8 * time.Minute)},
		{ID: 7, PostID: 5, AuthorID: 5, Content: "摄影社和书法社！", ParentID: intPtr(6), CreatedAt: now.Add(-6 * time.Minute)},
	}
	s.comments = comments
	s.nextCommentID = 8

	// 种子点赞
	likes := []models.Like{
		{ID: 1, UserID: 1, PostID: 2, CreatedAt: now.Add(-50 * time.Minute)},
		{ID: 2, UserID: 2, PostID: 1, CreatedAt: now.Add(-85 * time.Minute)},
		{ID: 3, UserID: 1, PostID: 4, CreatedAt: now.Add(-10 * time.Minute)},
		{ID: 4, UserID: 3, PostID: 1, CreatedAt: now.Add(-70 * time.Minute)},
		{ID: 5, UserID: 4, PostID: 5, CreatedAt: now.Add(-7 * time.Minute)},
	}
	s.likes = likes
	s.nextLikeID = 6
}

func intPtr(i int) *int { return &i }

// ===== 用户 =====

func (s *Store) GetUser(id int) *models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.users {
		if s.users[i].ID == id {
			return &s.users[i]
		}
	}
	return nil
}

func (s *Store) GetAllUsers() []models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	cp := make([]models.User, len(s.users))
	copy(cp, s.users)
	return cp
}

// ===== 动态 =====

func (s *Store) GetVisiblePosts(viewerID int) []models.Post {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.Post
	for _, p := range s.posts {
		if s.isPostVisible(p, viewerID) {
			result = append(result, p)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})
	return result
}

func (s *Store) isPostVisible(p models.Post, viewerID int) bool {
	switch p.Visibility {
	case models.VisibilityPublic:
		return true
	case models.VisibilityFriends:
		return p.AuthorID == viewerID || s.AreFriends(p.AuthorID, viewerID)
	case models.VisibilitySelfOnly:
		return p.AuthorID == viewerID
	}
	return false
}

func (s *Store) AreFriends(uid1, uid2 int) bool {
	for _, r := range s.friendRelations {
		if r.FromID == uid1 && r.ToID == uid2 && r.Status == models.FriendStatusAccepted {
			return true
		}
	}
	return false
}

func (s *Store) GetPost(id int) *models.Post {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.posts {
		if s.posts[i].ID == id {
			return &s.posts[i]
		}
	}
	return nil
}

func (s *Store) CreatePost(authorID int, content, photoURL string, visibility models.Visibility) models.Post {
	s.mu.Lock()
	defer s.mu.Unlock()
	p := models.Post{
		ID:         s.nextPostID,
		AuthorID:   authorID,
		Content:    content,
		PhotoURL:   photoURL,
		Visibility: visibility,
		CreatedAt:  time.Now(),
	}
	s.nextPostID++
	s.posts = append(s.posts, p)
	return p
}

func (s *Store) CountVisiblePosts(viewerID int) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, p := range s.posts {
		if s.isPostVisible(p, viewerID) {
			count++
		}
	}
	return count
}

func (s *Store) CountAllPosts() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.posts)
}

// CountMyPostsVisibleToOthers 统计当前用户的动态中对他人可见的数量
func (s *Store) CountMyPostsVisibleToOthers(authorID int) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, p := range s.posts {
		if p.AuthorID == authorID && p.Visibility != models.VisibilitySelfOnly {
			count++
		}
	}
	return count
}

// CountAllComments 统计所有评论+回复总数
func (s *Store) CountAllComments() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.comments)
}

// ===== 好友关系 =====

func (s *Store) GetFriendStatus(viewerID, targetID int) models.FriendStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	// 检查是否已是好友（双向accepted）
	for _, r := range s.friendRelations {
		if r.FromID == viewerID && r.ToID == targetID && r.Status == models.FriendStatusAccepted {
			return models.FriendStatusAccepted
		}
	}
	// 检查是否有待确认申请（任一方向）
	for _, r := range s.friendRelations {
		if r.FromID == viewerID && r.ToID == targetID && r.Status == models.FriendStatusPending {
			return models.FriendStatusPending
		}
		if r.FromID == targetID && r.ToID == viewerID && r.Status == models.FriendStatusPending {
			return "pending_received"
		}
	}
	return models.FriendStatusNone
}

func (s *Store) GetFriends(userID int) []models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var friends []models.User
	friendIDs := map[int]bool{}
	for _, r := range s.friendRelations {
		if r.Status == models.FriendStatusAccepted {
			if r.FromID == userID {
				friendIDs[r.ToID] = true
			}
			if r.ToID == userID {
				friendIDs[r.FromID] = true
			}
		}
	}
	for _, u := range s.users {
		if friendIDs[u.ID] {
			friends = append(friends, u)
		}
	}
	return friends
}

func (s *Store) GetPendingReceived(userID int) []models.FriendRelation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.FriendRelation
	for _, r := range s.friendRelations {
		if r.ToID == userID && r.Status == models.FriendStatusPending {
			result = append(result, r)
		}
	}
	return result
}

func (s *Store) SendFriendRequest(fromID, toID int) (models.FriendRelation, error) {
	if fromID == toID {
		return models.FriendRelation{}, fmt.Errorf("不能添加自己为好友")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	// 检查是否已存在关系（任一方向、任一状态）
	for _, r := range s.friendRelations {
		if (r.FromID == fromID && r.ToID == toID) || (r.FromID == toID && r.ToID == fromID) {
			if r.Status == models.FriendStatusAccepted {
				return models.FriendRelation{}, fmt.Errorf("已经是好友")
			}
			if r.Status == models.FriendStatusPending {
				return models.FriendRelation{}, fmt.Errorf("已存在待处理的好友申请")
			}
		}
	}
	r := models.FriendRelation{
		ID:     s.nextFriendID,
		FromID: fromID,
		ToID:   toID,
		Status: models.FriendStatusPending,
	}
	s.nextFriendID++
	s.friendRelations = append(s.friendRelations, r)
	return r, nil
}

func (s *Store) AcceptFriendRequest(relationID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.friendRelations {
		if s.friendRelations[i].ID == relationID && s.friendRelations[i].Status == models.FriendStatusPending {
			s.friendRelations[i].Status = models.FriendStatusAccepted
			// 添加反向关系
			rev := models.FriendRelation{
				ID:     s.nextFriendID,
				FromID: s.friendRelations[i].ToID,
				ToID:   s.friendRelations[i].FromID,
				Status: models.FriendStatusAccepted,
			}
			s.nextFriendID++
			s.friendRelations = append(s.friendRelations, rev)
			return true
		}
	}
	return false
}

func (s *Store) CountFriends(userID int) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	friendIDs := map[int]bool{}
	for _, r := range s.friendRelations {
		if r.Status == models.FriendStatusAccepted {
			if r.FromID == userID {
				friendIDs[r.ToID] = true
			}
			if r.ToID == userID {
				friendIDs[r.FromID] = true
			}
		}
	}
	return len(friendIDs)
}

func (s *Store) CountPending(userID int) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, r := range s.friendRelations {
		if r.ToID == userID && r.Status == models.FriendStatusPending {
			count++
		}
	}
	return count
}

// ===== 评论/回复 =====

func (s *Store) GetCommentsByPost(postID int) []models.Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.Comment
	for _, c := range s.comments {
		if c.PostID == postID {
			result = append(result, c)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.Before(result[j].CreatedAt)
	})
	return result
}

func (s *Store) CountCommentsByPost(postID int) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, c := range s.comments {
		if c.PostID == postID {
			count++
		}
	}
	return count
}

func (s *Store) CreateComment(postID, authorID int, content string, parentID *int) models.Comment {
	s.mu.Lock()
	defer s.mu.Unlock()
	c := models.Comment{
		ID:        s.nextCommentID,
		PostID:    postID,
		AuthorID:  authorID,
		Content:   content,
		ParentID:  parentID,
		CreatedAt: time.Now(),
	}
	s.nextCommentID++
	s.comments = append(s.comments, c)
	return c
}

// ===== 点赞 =====

func (s *Store) ToggleLike(userID, postID int) (liked bool, likeCount int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	// 查找是否已点赞
	for i, l := range s.likes {
		if l.UserID == userID && l.PostID == postID {
			// 取消点赞
			s.likes = append(s.likes[:i], s.likes[i+1:]...)
			return false, s.countLikesByPostUnlocked(postID)
		}
	}
	// 新增点赞
	s.likes = append(s.likes, models.Like{
		ID:        s.nextLikeID,
		UserID:    userID,
		PostID:    postID,
		CreatedAt: time.Now(),
	})
	s.nextLikeID++
	return true, s.countLikesByPostUnlocked(postID)
}

func (s *Store) countLikesByPostUnlocked(postID int) int {
	count := 0
	for _, l := range s.likes {
		if l.PostID == postID {
			count++
		}
	}
	return count
}

func (s *Store) CountLikesByPost(postID int) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.countLikesByPostUnlocked(postID)
}

func (s *Store) IsLikedByUser(userID, postID int) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, l := range s.likes {
		if l.UserID == userID && l.PostID == postID {
			return true
		}
	}
	return false
}

// ===== 好友状态流转 =====

// CancelFriendRequest 取消已发送的好友申请
func (s *Store) CancelFriendRequest(fromID, toID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, r := range s.friendRelations {
		if r.FromID == fromID && r.ToID == toID && r.Status == models.FriendStatusPending {
			s.friendRelations = append(s.friendRelations[:i], s.friendRelations[i+1:]...)
			return true
		}
	}
	return false
}

// RejectFriendRequest 拒绝收到的好友申请
func (s *Store) RejectFriendRequest(relationID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, r := range s.friendRelations {
		if r.ID == relationID && r.Status == models.FriendStatusPending {
			s.friendRelations = append(s.friendRelations[:i], s.friendRelations[i+1:]...)
			return true
		}
	}
	return false
}

// Unfriend 解除好友关系
func (s *Store) Unfriend(uid1, uid2 int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	removed := 0
	for i := len(s.friendRelations) - 1; i >= 0; i-- {
		r := s.friendRelations[i]
		if r.Status == models.FriendStatusAccepted {
			if (r.FromID == uid1 && r.ToID == uid2) || (r.FromID == uid2 && r.ToID == uid1) {
				s.friendRelations = append(s.friendRelations[:i], s.friendRelations[i+1:]...)
				removed++
			}
		}
	}
	return removed > 0
}

// ===== 动态可见性修改 =====

// UpdatePostVisibility 修改动态可见范围（仅作者可改）
func (s *Store) UpdatePostVisibility(postID, authorID int, visibility models.Visibility) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.posts {
		if s.posts[i].ID == postID && s.posts[i].AuthorID == authorID {
			s.posts[i].Visibility = visibility
			return true
		}
	}
	return false
}

// GetPendingSent 获取已发出待确认的申请
func (s *Store) GetPendingSent(userID int) []models.FriendRelation {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.FriendRelation
	for _, r := range s.friendRelations {
		if r.FromID == userID && r.Status == models.FriendStatusPending {
			result = append(result, r)
		}
	}
	return result
}
