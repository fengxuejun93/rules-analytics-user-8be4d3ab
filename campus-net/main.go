package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"

	"campus-net/handlers"
	"campus-net/store"
)

func main() {
	s := store.NewStore()
	h := handlers.New(s)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	// 静态文件（仅非 /api/ 路径走静态服务）
	fs := http.FileServer(http.Dir("static"))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// API 路由已在 RegisterRoutes 注册，不会走到这里
		// 防止默认匹配兜底
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		fs.ServeHTTP(w, r)
	})

	port := "8080"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	fmt.Printf("校园网社交原型已启动: http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
