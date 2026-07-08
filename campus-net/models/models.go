package models

import "time"

// Role 用户角色
type Role string

const (
	RoleStudent Role = "student"
	RoleAuthor  Role = "author"
	RoleAdmin   Role = "admin"
)

// Visibility 可见范围枚举
type Visibility string

const (
	VisibilityPublic    Visibility = "public"
	VisibilityFriends   Visibility = "friends"
	VisibilityGroup     Visibility = "group"     // 指定分组可见
	VisibilitySelfOnly  Visibility = "self"
)

// GroupType 好友分组类型
type GroupType string

const (
	GroupClassmate GroupType = "classmate" // 同班同学
	GroupRoommate  GroupType = "roommate"  // 室友
	GroupBlacklist GroupType = "blacklist" // 黑名单
)

// FriendStatus 好友关系状态
type FriendStatus string

const (
	FriendStatusAccepted        FriendStatus = "accepted"
	FriendStatusPending         FriendStatus = "pending"
	FriendStatusPendingReceived FriendStatus = "pending_received"
	FriendStatusNone            FriendStatus = "none"
)

// User 用户
type User struct {
	ID        int    `json:"id"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
	ClassID   int    `json:"class_id"` // 班级ID，同班同学共享
	DormID    int    `json:"dorm_id"`  // 宿舍ID，室友共享
}

// FriendRelation 好友关系
type FriendRelation struct {
	ID     int          `json:"id"`
	FromID int          `json:"from_id"`
	ToID   int          `json:"to_id"`
	Status FriendStatus `json:"status"`
}

// Post 照片动态
type Post struct {
	ID           int        `json:"id"`
	AuthorID     int        `json:"author_id"`
	Content      string     `json:"content"`
	PhotoURL     string     `json:"photo_url"`
	Visibility   Visibility `json:"visibility"`
	VisibleGroup GroupType  `json:"visible_group"` // 当visibility=group时，指定哪个分组可见（classmate/roommate）
	Hidden       bool       `json:"hidden"`
	CreatedAt    time.Time  `json:"created_at"`
}

// Comment 评论或回复
type Comment struct {
	ID        int       `json:"id"`
	PostID    int       `json:"post_id"`
	AuthorID  int       `json:"author_id"`
	Content   string    `json:"content"`
	ParentID  *int      `json:"parent_id"` // nil 表示顶级评论，否则为回复
	Hidden    bool      `json:"hidden"`
	CreatedAt time.Time `json:"created_at"`
}

// Like 点赞
type Like struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	PostID    int       `json:"post_id"`
	CreatedAt time.Time `json:"created_at"`
}

// BlacklistEntry 黑名单条目
type BlacklistEntry struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`    // 拉黑者
	TargetID  int       `json:"target_id"`  // 被拉黑者
	CreatedAt time.Time `json:"created_at"`
}

// Stats 统计信息
type Stats struct {
	PostCount           int `json:"post_count"`
	FriendCount         int `json:"friend_count"`
	PendingCount        int `json:"pending_count"`
	VisiblePostCount    int `json:"visible_post_count"`
	MyPostsVisibleCount int `json:"my_posts_visible_count"` // 当前用户的动态中对他人可见的数量
	CommentCount        int `json:"comment_count"`           // 评论+回复总数
}

// GroupInfo 分组信息（用于前端展示）
type GroupInfo struct {
	Type        GroupType `json:"type"`
	Label       string    `json:"label"`
	MemberCount int       `json:"member_count"`
}
