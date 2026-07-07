package main

import (
	"fmt"
	"io"
	"net/http"
	"strings"
)

func main() {
	tests := []struct {
		name   string
		method string
		url    string
		body   string
	}{
		{"Student hides post (should 403)", "POST", "http://localhost:8080/api/posts/hide?uid=1&role=student", `{"post_id":1}`},
		{"Author deletes others post (should 403)", "POST", "http://localhost:8080/api/posts/delete?uid=1&role=author", `{"post_id":4}`},
		{"Admin hides post (should 200)", "POST", "http://localhost:8080/api/posts/hide?uid=3&role=admin", `{"post_id":1}`},
		{"Admin restores post (should 200)", "POST", "http://localhost:8080/api/posts/restore?uid=3&role=admin", `{"post_id":1}`},
		{"Author changes own visibility (should 200)", "POST", "http://localhost:8080/api/posts/visibility?uid=1&role=author", `{"post_id":1,"visibility":"self"}`},
		{"Author restores visibility (should 200)", "POST", "http://localhost:8080/api/posts/visibility?uid=1&role=author", `{"post_id":1,"visibility":"public"}`},
		{"Student changes visibility (should 403)", "POST", "http://localhost:8080/api/posts/visibility?uid=1&role=student", `{"post_id":1,"visibility":"self"}`},
	}

	for _, t := range tests {
		var resp *http.Response
		var err error
		if t.body != "" {
			resp, err = http.Post(t.url, "application/json", strings.NewReader(t.body))
		} else {
			resp, err = http.Get(t.url)
		}
		if err != nil {
			fmt.Printf("FAIL %s: %v\n", t.name, err)
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		status := "OK"
		if resp.StatusCode >= 400 {
			status = "DENIED"
		}
		fmt.Printf("%s: HTTP %d (%s) %s\n", t.name, resp.StatusCode, status, string(body))
	}
}
