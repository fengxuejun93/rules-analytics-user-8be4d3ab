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
	blacklist       []models.BlacklistEntry
	nextUserID      int
	nextPostID      int
	nextCommentID   int
	nextFriendID    int
	nextLikeID      int
	nextBlacklistID int
}

// NewStore 创建存储并初始化种子数据
func NewStore() *Store {
	s := &Store{
		nextUserID:      1,
		nextPostID:      1,
		nextCommentID:   1,
		nextFriendID:    1,
		nextLikeID:      1,
		nextBlacklistID: 1,
	}
	s.seed()
	return s
}

func (s *Store) seed() {
	// 种子用户 - ClassID/DormID 用于分组
	// 1张三和2李四同班(1)同宿舍(1)，3王五同班(1)不同宿舍(2)，4赵六不同班(2)不同宿舍(3)，5钱七不同班(2)不同宿舍(4)
	users := []models.User{
		{ID: 1, Name: "张三", AvatarURL: "https://i.pravatar.cc/80?img=1", ClassID: 1, DormID: 1},
		{ID: 2, Name: "李四", AvatarURL: "https://i.pravatar.cc/80?img=2", ClassID: 1, DormID: 1},
		{ID: 3, Name: "王五", AvatarURL: "https://i.pravatar.cc/80?img=3", ClassID: 1, DormID: 2},
		{ID: 4, Name: "赵六", AvatarURL: "https://i.pravatar.cc/80?img=4", ClassID: 2, DormID: 3},
		{ID: 5, Name: "钱七", AvatarURL: "https://i.pravatar.cc/80?img=5", ClassID: 2, DormID: 4},
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

	// 种子黑名单：4号赵六拉黑了1号张三（张三不能对赵六的动态评论/点赞/加好友）
	blacklist := []models.BlacklistEntry{
		{ID: 1, UserID: 4, TargetID: 1, CreatedAt: time.Now().Add(-1 * time.Hour)},
	}
	s.blacklist = blacklist
	s.nextBlacklistID = 2

	// 种子动态
	now := time.Now()
	posts := []models.Post{
		{ID: 1, AuthorID: 1, Content: "今天天气真好，校园里的银杏树黄了！", PhotoURL: "https://picsum.photos/seed/p1/600/400", Visibility: models.VisibilityPublic, CreatedAt: now.Add(-2 * time.Hour)},
		{ID: 2, AuthorID: 2, Content: "图书馆占座成功，期末冲刺开始！", PhotoURL: "https://picsum.photos/seed/p2/600/400", Visibility: models.VisibilityFriends, CreatedAt: now.Add(-1 * time.Hour)},
		{ID: 3, AuthorID: 3, Content: "偷偷发一条仅自己可见的心情", PhotoURL: "https://picsum.photos/seed/p3/600/400", Visibility: models.VisibilitySelfOnly, CreatedAt: now.Add(-30 * time.Minute)},
		{ID: 4, AuthorID: 4, Content: "食堂新出的红烧肉不错！", PhotoURL: "https://picsum.photos/seed/p4/600/400", Visibility: models.VisibilityPublic, CreatedAt: now.Add(-15 * time.Minute)},
		{ID: 5, AuthorID: 5, Content: "社团招新啦，快来报名！", PhotoURL: "https://picsum.photos/seed/p5/600/400", Visibility: models.VisibilityPublic, CreatedAt: now.Add(-10 * time.Minute)},
		{ID: 6, AuthorID: 1, Content: "周末和同学去了趟郊外，风景很赞", PhotoURL: "https://picsum.photos/seed/p6/600/400", Visibility: models.VisibilityFriends, CreatedAt: now.Add(-5 * time.Minute)},
		{ID: 7, AuthorID: 1, Content: "仅同班同学可见的班会通知", PhotoURL: "https://picsum.photos/seed/p7/600/400", Visibility: models.VisibilityGroup, VisibleGroup: models.GroupClassmate, CreatedAt: now.Add(-3 * time.Minute)},
		{ID: 8, AuthorID: 2, Content: "宿舍夜话，仅室友可见", PhotoURL: "https://picsum.photos/seed/p8/600/400", Visibility: models.VisibilityGroup, VisibleGroup: models.GroupRoommate, CreatedAt: now.Add(-2 * time.Minute)},
	}
	s.posts = posts
	s.nextPostID = 9

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

// ===== 黑名单 =====

// IsBlacklisted 检查 target 是否被 owner 拉黑（owner拉黑了target）
func (s *Store) IsBlacklisted(ownerID, targetID int) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, b := range s.blacklist {
		if b.UserID == ownerID && b.TargetID == targetID {
			return true
		}
	}
	return false
}

// IsBlacklistedEither 检查两人之间是否有任一方拉黑了另一方
func (s *Store) IsBlacklistedEither(uid1, uid2 int) bool {
	return s.IsBlacklisted(uid1, uid2) || s.IsBlacklisted(uid2, uid1)
}

// ToggleBlacklist 切换黑名单（拉黑/取消拉黑）
func (s *Store) ToggleBlacklist(ownerID, targetID int) (blocked bool, err error) {
	if ownerID == targetID {
		return false, fmt.Errorf("不能拉黑自己")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, b := range s.blacklist {
		if b.UserID == ownerID && b.TargetID == targetID {
			s.blacklist = append(s.blacklist[:i], s.blacklist[i+1:]...)
			return false, nil
		}
	}
	s.blacklist = append(s.blacklist, models.BlacklistEntry{
		ID:        s.nextBlacklistID,
		UserID:    ownerID,
		TargetID:  targetID,
		CreatedAt: time.Now(),
	})
	s.nextBlacklistID++
	return true, nil
}

// GetBlacklist 获取某用户的黑名单列表
func (s *Store) GetBlacklist(userID int) []models.BlacklistEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.BlacklistEntry
	for _, b := range s.blacklist {
		if b.UserID == userID {
			result = append(result, b)
		}
	}
	return result
}

// ===== 分组 =====

// GetClassmates 获取同班同学（同ClassID的其他用户）
func (s *Store) GetClassmateMembers(classID, excludeUID int) []models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.User
	for _, u := range s.users {
		if u.ClassID == classID && u.ID != excludeUID {
			result = append(result, u)
		}
	}
	return result
}

// GetRoommates 获取室友（同DormID的其他用户）
func (s *Store) GetRoommateMembers(dormID, excludeUID int) []models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.User
	for _, u := range s.users {
		if u.DormID == dormID && u.ID != excludeUID {
			result = append(result, u)
		}
	}
	return result
}

// IsClassmate 判断两个用户是否同班
func (s *Store) IsClassmate(uid1, uid2 int) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u1 := s.findUserUnlocked(uid1)
	u2 := s.findUserUnlocked(uid2)
	if u1 == nil || u2 == nil {
		return false
	}
	return u1.ClassID == u2.ClassID && u1.ClassID > 0
}

// IsRoommate 判断两个用户是否室友
func (s *Store) IsRoommate(uid1, uid2 int) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u1 := s.findUserUnlocked(uid1)
	u2 := s.findUserUnlocked(uid2)
	if u1 == nil || u2 == nil {
		return false
	}
	return u1.DormID == u2.DormID && u1.DormID > 0
}

func (s *Store) findUserUnlocked(id int) *models.User {
	for i := range s.users {
		if s.users[i].ID == id {
			return &s.users[i]
		}
	}
	return nil
}

// GetGroupInfo 获取当前用户的分组信息
func (s *Store) GetGroupInfo(uid int) []models.GroupInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u := s.findUserUnlocked(uid)
	if u == nil {
		return nil
	}
	var groups []models.GroupInfo
	classmateCount := 0
	roommateCount := 0
	for _, other := range s.users {
		if other.ID == uid {
			continue
		}
		if other.ClassID == u.ClassID && u.ClassID > 0 {
			classmateCount++
		}
		if other.DormID == u.DormID && u.DormID > 0 {
			roommateCount++
		}
	}
	if u.ClassID > 0 {
		groups = append(groups, models.GroupInfo{Type: models.GroupClassmate, Label: "同班同学", MemberCount: classmateCount})
	}
	if u.DormID > 0 {
		groups = append(groups, models.GroupInfo{Type: models.GroupRoommate, Label: "室友", MemberCount: roommateCount})
	}
	blacklistCount := 0
	for _, b := range s.blacklist {
		if b.UserID == uid {
			blacklistCount++
		}
	}
	groups = append(groups, models.GroupInfo{Type: models.GroupBlacklist, Label: "黑名单", MemberCount: blacklistCount})
	return groups
}

// ===== 动态 =====

func (s *Store) GetVisiblePosts(viewerID int, role models.Role) []models.Post {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.Post
	for _, p := range s.posts {
		// 管理员可看到被隐藏的动态，其他人看不到
		if p.Hidden && role != models.RoleAdmin {
			continue
		}
		if s.isPostVisibleUnlocked(p, viewerID, role) {
			result = append(result, p)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.After(result[j].CreatedAt)
	})
	return result
}

func (s *Store) isPostVisibleUnlocked(p models.Post, viewerID int, role models.Role) bool {
	// 管理员可看到所有动态（用于审核管理）
	if role == models.RoleAdmin {
		return true
	}
	// 被作者拉黑的用户不能看到该作者的动态
	if s.isBlacklistedUnlocked(p.AuthorID, viewerID) {
		return false
	}
	// 作者自己始终可见
	if p.AuthorID == viewerID {
		return true
	}
	switch p.Visibility {
	case models.VisibilityPublic:
		return true
	case models.VisibilityFriends:
		return s.areFriendsUnlocked(p.AuthorID, viewerID)
	case models.VisibilityGroup:
		return s.isInGroupUnlocked(p, viewerID)
	case models.VisibilitySelfOnly:
		return false // 作者已在上边返回true
	}
	return false
}

func (s *Store) isInGroupUnlocked(p models.Post, viewerID int) bool {
	author := s.findUserUnlocked(p.AuthorID)
	viewer := s.findUserUnlocked(viewerID)
	if author == nil || viewer == nil {
		return false
	}
	switch p.VisibleGroup {
	case models.GroupClassmate:
		return author.ClassID == viewer.ClassID && author.ClassID > 0
	case models.GroupRoommate:
		return author.DormID == viewer.DormID && author.DormID > 0
	}
	return false
}

func (s *Store) isBlacklistedUnlocked(ownerID, targetID int) bool {
	for _, b := range s.blacklist {
		if b.UserID == ownerID && b.TargetID == targetID {
			return true
		}
	}
	return false
}

func (s *Store) AreFriends(uid1, uid2 int) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.areFriendsUnlocked(uid1, uid2)
}

func (s *Store) areFriendsUnlocked(uid1, uid2 int) bool {
	for _, r := range s.friendRelations {
		if r.FromID == uid1 && r.ToID == uid2 && r.Status == models.FriendStatusAccepted {
			return true
		}
	}
	return false
}

// IsPostVisible 对外暴露的可见性判断
func (s *Store) IsPostVisible(p models.Post, viewerID int, role models.Role) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.isPostVisibleUnlocked(p, viewerID, role)
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

func (s *Store) CreatePost(authorID int, content, photoURL string, visibility models.Visibility, visibleGroup models.GroupType) models.Post {
	s.mu.Lock()
	defer s.mu.Unlock()
	p := models.Post{
		ID:           s.nextPostID,
		AuthorID:     authorID,
		Content:      content,
		PhotoURL:     photoURL,
		Visibility:   visibility,
		VisibleGroup: visibleGroup,
		CreatedAt:    time.Now(),
	}
	s.nextPostID++
	s.posts = append(s.posts, p)
	return p
}

func (s *Store) CountVisiblePosts(viewerID int, role models.Role) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, p := range s.posts {
		if p.Hidden && role != models.RoleAdmin {
			continue
		}
		if s.isPostVisibleUnlocked(p, viewerID, role) {
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

// CountAllComments 统计所有评论+回复总数（非管理员不计数已隐藏的）
func (s *Store) CountAllComments(role models.Role) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, c := range s.comments {
		if c.Hidden && role != models.RoleAdmin {
			continue
		}
		count++
	}
	return count
}

// ===== 好友关系 =====

func (s *Store) GetFriendStatus(viewerID, targetID int) models.FriendStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, r := range s.friendRelations {
		if r.FromID == viewerID && r.ToID == targetID && r.Status == models.FriendStatusAccepted {
			return models.FriendStatusAccepted
		}
	}
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
	// 检查是否被对方拉黑
	for _, b := range s.blacklist {
		if b.UserID == toID && b.TargetID == fromID {
			return models.FriendRelation{}, fmt.Errorf("对方已将你加入黑名单，无法发送好友申请")
		}
	}
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

func (s *Store) GetCommentsByPost(postID int, role models.Role) []models.Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.Comment
	for _, c := range s.comments {
		if c.PostID == postID {
			if c.Hidden && role != models.RoleAdmin {
				continue
			}
			result = append(result, c)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].CreatedAt.Before(result[j].CreatedAt)
	})
	return result
}

func (s *Store) CountCommentsByPost(postID int, role models.Role) int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	count := 0
	for _, c := range s.comments {
		if c.PostID == postID {
			if c.Hidden && role != models.RoleAdmin {
				continue
			}
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
	for i, l := range s.likes {
		if l.UserID == userID && l.PostID == postID {
			s.likes = append(s.likes[:i], s.likes[i+1:]...)
			return false, s.countLikesByPostUnlocked(postID)
		}
	}
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
func (s *Store) UpdatePostVisibility(postID, authorID int, visibility models.Visibility, visibleGroup models.GroupType) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.posts {
		if s.posts[i].ID == postID && s.posts[i].AuthorID == authorID {
			s.posts[i].Visibility = visibility
			s.posts[i].VisibleGroup = visibleGroup
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

// ===== 管理操作：隐藏/恢复/删除 =====

func (s *Store) HidePost(postID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.posts {
		if s.posts[i].ID == postID {
			s.posts[i].Hidden = true
			return true
		}
	}
	return false
}

func (s *Store) RestorePost(postID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.posts {
		if s.posts[i].ID == postID {
			s.posts[i].Hidden = false
			return true
		}
	}
	return false
}

func (s *Store) DeletePost(postID, authorID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, p := range s.posts {
		if p.ID == postID && p.AuthorID == authorID {
			s.posts = append(s.posts[:i], s.posts[i+1:]...)
			for j := len(s.comments) - 1; j >= 0; j-- {
				if s.comments[j].PostID == postID {
					s.comments = append(s.comments[:j], s.comments[j+1:]...)
				}
			}
			for j := len(s.likes) - 1; j >= 0; j-- {
				if s.likes[j].PostID == postID {
					s.likes = append(s.likes[:j], s.likes[j+1:]...)
				}
			}
			return true
		}
	}
	return false
}

func (s *Store) GetComment(id int) *models.Comment {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for i := range s.comments {
		if s.comments[i].ID == id {
			return &s.comments[i]
		}
	}
	return nil
}

func (s *Store) HideComment(commentID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.comments {
		if s.comments[i].ID == commentID {
			s.comments[i].Hidden = true
			return true
		}
	}
	return false
}

func (s *Store) RestoreComment(commentID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i := range s.comments {
		if s.comments[i].ID == commentID {
			s.comments[i].Hidden = false
			return true
		}
	}
	return false
}

func (s *Store) DeleteComment(commentID, authorID int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	for i, c := range s.comments {
		if c.ID == commentID && c.AuthorID == authorID {
			s.comments = append(s.comments[:i], s.comments[i+1:]...)
			return true
		}
	}
	return false
}

// ===== 可见范围预览 =====

// GetVisibilityPreview 获取某个可见范围下能看到该动态的用户列表预览
func (s *Store) GetVisibilityPreview(authorID int, visibility models.Visibility, visibleGroup models.GroupType) []models.User {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var result []models.User
	for _, u := range s.users {
		if u.ID == authorID {
			continue
		}
		// 被作者拉黑的人不在预览中
		if s.isBlacklistedUnlocked(authorID, u.ID) {
			continue
		}
		switch visibility {
		case models.VisibilityPublic:
			result = append(result, u)
		case models.VisibilityFriends:
			if s.areFriendsUnlocked(authorID, u.ID) {
				result = append(result, u)
			}
		case models.VisibilityGroup:
			author := s.findUserUnlocked(authorID)
			if author == nil {
				continue
			}
			switch visibleGroup {
			case models.GroupClassmate:
				if u.ClassID == author.ClassID && author.ClassID > 0 {
					result = append(result, u)
				}
			case models.GroupRoommate:
				if u.DormID == author.DormID && author.DormID > 0 {
					result = append(result, u)
				}
			}
		case models.VisibilitySelfOnly:
			// 仅自己可见，不添加任何人
		}
	}
	return result
}
