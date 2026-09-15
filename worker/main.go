package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

type job struct {
	ID    string `json:"id"`
	Title string `json:"title"`
}

var (
	processed atomic.Int64
	started   = time.Now()
)

func main() {
	apiURL := strings.TrimRight(env("API_URL", "http://api:3000"), "/")
	addr := ":" + env("PORT", "8080")

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{"ok": true, "service": "worker"})
	})
	mux.HandleFunc("GET /stats", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, map[string]any{
			"processed": processed.Load(),
			"uptimeSec": int(time.Since(started).Seconds()),
			"api":       apiURL,
		})
	})

	go poll(apiURL)

	log.Printf("worker listening on %s, api at %s", addr, apiURL)
	log.Fatal(http.ListenAndServe(addr, mux))
}

func poll(apiURL string) {
	client := &http.Client{Timeout: 5 * time.Second}
	for {
		j, ok := next(client, apiURL)
		if !ok {
			time.Sleep(500 * time.Millisecond)
			continue
		}
		sum := sha256.Sum256([]byte(j.Title))
		result := strings.ToUpper(j.Title) + " sha256:" + hex.EncodeToString(sum[:4])
		body, _ := json.Marshal(map[string]string{"result": result})
		resp, err := client.Post(fmt.Sprintf("%s/api/jobs/%s/done", apiURL, j.ID), "application/json", bytes.NewReader(body))
		if err != nil {
			log.Printf("done %s: %v", j.ID, err)
			continue
		}
		resp.Body.Close()
		processed.Add(1)
		log.Printf("job %s done: %s", j.ID, result)
	}
}

func next(client *http.Client, apiURL string) (job, bool) {
	resp, err := client.Get(apiURL + "/api/jobs/next")
	if err != nil {
		log.Printf("poll: %v", err)
		return job{}, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return job{}, false
	}
	var j job
	if err := json.NewDecoder(resp.Body).Decode(&j); err != nil {
		log.Printf("decode: %v", err)
		return job{}, false
	}
	return j, true
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
