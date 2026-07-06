package main

import (
	"fmt"
	"log"
	"net/http"
	"os"

	"campus-net/handlers"
	"campus-net/store"
)

func main() {
	s := store.NewStore()
	h := handlers.New(s)

	mux := http.NewServeMux()
	h.RegisterRoutes(mux)

	// 静态文件
	fs := http.FileServer(http.Dir("static"))
	mux.Handle("/", fs)

	port := "8080"
	if p := os.Getenv("PORT"); p != "" {
		port = p
	}

	fmt.Printf("校园网社交原型已启动: http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}
