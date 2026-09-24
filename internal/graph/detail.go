package graph

import (
	"log"
	"sort"

	tfjson "github.com/hashicorp/terraform-json"
	"github.com/hashicorp/terraform-json/sanitize"
)

// Detail is everything the plan knows about one resource instance. It is kept
// server-side and served on demand rather than pushed to every browser: the
// attribute values are far larger than the diagram itself.
type Detail struct {
	Address string                 `json:"address"`
	Type    string                 `json:"type"`
	Name    string                 `json:"name"`
	Module  string                 `json:"module,omitempty"`
	Status  string                 `json:"status"`
	Before  map[string]interface{} `json:"before,omitempty"`
	After   map[string]interface{} `json:"after,omitempty"`
	// Unknown lists attributes Terraform can only resolve during apply.
	Unknown []string `json:"unknown,omitempty"`
}

// BuildDetails indexes every managed resource instance in the plan by address.
func BuildDetails(plan *tfjson.Plan) map[string]*Detail {
	out := map[string]*Detail{}
	for _, rc := range plan.ResourceChanges {
		if rc.Mode != tfjson.ManagedResourceMode || rc.Change == nil {
			continue
		}
		change, err := sanitize.SanitizeChange(rc.Change, "(sensitive value)")
		if err != nil {
			// Fail closed: an unserializable change must never fall back to raw values.
			log.Print("terradune: resource details unavailable: sanitization failed")
			continue
		}
		d := &Detail{
			Address: rc.Address,
			Type:    rc.Type,
			Name:    rc.Name,
			Module:  rc.ModuleAddress,
			Status:  string(statusOf(rc.Change.Actions)),
		}
		if m, ok := change.Before.(map[string]interface{}); ok {
			d.Before = m
		}
		if m, ok := change.After.(map[string]interface{}); ok {
			d.After = m
		}
		d.Unknown = unknownKeys(rc.Change.AfterUnknown)
		out[rc.Address] = d
	}
	return out
}

// unknownKeys lists the top-level attributes marked unknown, which Terraform
// renders as "(known after apply)".
func unknownKeys(v interface{}) []string {
	m, ok := v.(map[string]interface{})
	if !ok {
		return nil
	}
	var keys []string
	for k, val := range m {
		if containsUnknown(val) {
			keys = append(keys, k)
		}
	}
	sort.Strings(keys)
	return keys
}

// Terraform encodes unknown fields inside repeated blocks (routes, ingress,
// listener actions) as arrays of masks, as well as nested objects.
func containsUnknown(v interface{}) bool {
	switch value := v.(type) {
	case bool:
		return value
	case map[string]interface{}:
		for _, child := range value {
			if containsUnknown(child) {
				return true
			}
		}
	case []interface{}:
		for _, child := range value {
			if containsUnknown(child) {
				return true
			}
		}
	}
	return false
}
