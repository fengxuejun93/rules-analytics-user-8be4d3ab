package models

import "time"

// Visibility 可见范围枚举
type Visibility string

const (
	VisibilityPublic    Visibility = "public"
	VisibilityFriends   Visibility = "friends"
	VisibilitySelfOnly  Visibility = "self"
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
	ID         int        `json:"id"`
	AuthorID   int        `json:"author_id"`
	Content    string     `json:"content"`
	PhotoURL   string     `json:"photo_url"`
	Visibility Visibility `json:"visibility"`
	CreatedAt  time.Time  `json:"created_at"`
}

// Comment 评论或回复
type Comment struct {
	ID        int       `json:"id"`
	PostID    int       `json:"post_id"`
	AuthorID  int       `json:"author_id"`
	Content   string    `json:"content"`
	ParentID  *int      `json:"parent_id"` // nil 表示顶级评论，否则为回复
	CreatedAt time.Time `json:"created_at"`
}

// Like 点赞
type Like struct {
	ID        int       `json:"id"`
	UserID    int       `json:"user_id"`
	PostID    int       `json:"post_id"`
	CreatedAt time.Time `json:"created_at"`
}

// Stats 统计信息
type Stats struct {
	PostCount            int `json:"post_count"`
	FriendCount          int `json:"friend_count"`
	PendingCount         int `json:"pending_count"`
	VisiblePostCount     int `json:"visible_post_count"`
	MyPostsVisibleCount  int `json:"my_posts_visible_count"` // 当前用户的动态中对他人可见的数量
}
