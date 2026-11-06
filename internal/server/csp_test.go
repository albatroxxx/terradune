package server

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
)

// The policy is derived from index.html, so these tests read the page the
// way a browser does, with their own pattern matching, and check that the
// header agrees with it.
var (
	inlineScriptRe = regexp.MustCompile(`(?s)<script>(.*?)</script>`)
	inlineStyleRe  = regexp.MustCompile(`(?s)<style>(.*?)</style>`)
	styleAttrRe    = regexp.MustCompile(`\sstyle="`)
	handlerAttrRe  = regexp.MustCompile(`\son[a-z]+="`)
)

func hashOf(block []byte) string {
	sum := sha256.Sum256(block)
	return "'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
}

func TestContentSecurityPolicyAllowsOnlyTheEmbeddedInlineBlocks(t *testing.T) {
	page, err := static.ReadFile("index.html")
	if err != nil {
		t.Fatal(err)
	}
	policy := contentSecurityPolicy
	for _, forbidden := range []string{"'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'", "http:", "https:", "data:", "*"} {
		if strings.Contains(policy, forbidden) {
			t.Errorf("policy allows %s: %s", forbidden, policy)
		}
	}
	for _, directive := range []string{"default-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'", "connect-src 'self'", "font-src 'self'", "img-src 'self'"} {
		if !strings.Contains(policy, directive) {
			t.Errorf("policy lacks %q: %s", directive, policy)
		}
	}

	scripts := inlineScriptRe.FindAllSubmatch(page, -1)
	styles := inlineStyleRe.FindAllSubmatch(page, -1)
	if len(scripts) == 0 || len(styles) == 0 {
		t.Fatalf("expected inline blocks in the page: %d scripts, %d styles", len(scripts), len(styles))
	}
	for _, m := range scripts {
		if h := hashOf(m[1]); !strings.Contains(policy, "script-src 'self' "+h) && !strings.Contains(policy, " "+h) {
			t.Errorf("inline script hash %s missing from policy", h)
		}
	}
	for _, m := range styles {
		if h := hashOf(m[1]); !strings.Contains(policy, h) {
			t.Errorf("inline style hash %s missing from policy", h)
		}
	}
	// Every hash in the policy must belong to a block in the page: an extra
	// allowance would be an injected script waved through.
	hashes := regexp.MustCompile(`'sha256-[^']+'`).FindAllString(policy, -1)
	if want := len(scripts) + len(styles); len(hashes) != want {
		t.Errorf("policy carries %d hashes for %d inline blocks", len(hashes), want)
	}

	// The policy forbids inline style attributes and event handlers, so the
	// page must not use them, or the browser silently drops the styling.
	if m := styleAttrRe.Find(page); m != nil {
		t.Error("index.html carries a style attribute, which the policy blocks")
	}
	if m := handlerAttrRe.Find(page); m != nil {
		t.Error("index.html carries an inline event handler, which the policy blocks")
	}
	for _, name := range []string{"assets/review.js", "assets/map-inventory.js"} {
		asset, err := static.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if styleAttrRe.Find(asset) != nil || handlerAttrRe.Find(asset) != nil {
			t.Errorf("%s emits a style attribute or inline handler, which the policy blocks", name)
		}
	}
}

func TestContentSecurityPolicyTracksThePage(t *testing.T) {
	page := []byte("<style>a{}</style><script src=\"x.js\"></script><script>alert(1)</script>")
	policy := buildContentSecurityPolicy(page)
	if !strings.Contains(policy, "script-src 'self' "+hashOf([]byte("alert(1)"))) {
		t.Errorf("script hash not derived from the page: %s", policy)
	}
	if !strings.Contains(policy, "style-src 'self' "+hashOf([]byte("a{}"))) {
		t.Errorf("style hash not derived from the page: %s", policy)
	}
	if strings.Count(policy, "sha256-") != 2 {
		t.Errorf("external script must not get a hash: %s", policy)
	}
	changed := buildContentSecurityPolicy([]byte("<script>alert(2)</script>"))
	if strings.Contains(changed, hashOf([]byte("alert(1)"))) {
		t.Error("a changed script kept the old hash")
	}
	if empty := buildContentSecurityPolicy(nil); strings.Contains(empty, "sha256-") || !strings.Contains(empty, "script-src 'self';") {
		t.Errorf("an unreadable page must allow no inline code: %s", empty)
	}
}

func TestSecurityHeadersOnEveryResponse(t *testing.T) {
	h := New("/test").Handler()
	for _, path := range []string{"/", "/state", "/healthz", "/assets/review.js", "/resource?workspace=x&address=y", "/missing"} {
		r := httptest.NewRequest("GET", path, nil)
		r.Host = "localhost:8383"
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		for header, want := range map[string]string{
			"Content-Security-Policy":      contentSecurityPolicy,
			"Cross-Origin-Opener-Policy":   "same-origin",
			"Cross-Origin-Resource-Policy": "same-origin",
			"X-Content-Type-Options":       "nosniff",
			"X-Frame-Options":              "DENY",
			"Referrer-Policy":              "no-referrer",
		} {
			if got := w.Header().Get(header); got != want {
				t.Errorf("%s: %s = %q, want %q", path, header, got, want)
			}
		}
	}
}
