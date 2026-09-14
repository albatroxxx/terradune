package graph

import (
	"encoding/json"
	"strings"
	"testing"

	tfjson "github.com/hashicorp/terraform-json"
)

func TestDetailsMaskNestedSensitiveValues(t *testing.T) {
	values := map[string]interface{}{
		"name": "visible", "password": "secret-password",
		"nested": []interface{}{map[string]interface{}{"token": "secret-token", "port": 443.0}},
	}
	mask := map[string]interface{}{
		"password": true, "nested": []interface{}{map[string]interface{}{"token": true}},
	}
	plan := &tfjson.Plan{ResourceChanges: []*tfjson.ResourceChange{{
		Address: "aws_future_service.main", Mode: tfjson.ManagedResourceMode, Type: "aws_future_service",
		Change: &tfjson.Change{Actions: tfjson.Actions{tfjson.ActionUpdate}, Before: values, After: values,
			BeforeSensitive: mask, AfterSensitive: mask},
	}}}
	details := BuildDetails(plan)
	b, err := json.Marshal(details)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "secret-") || !strings.Contains(string(b), "visible") || !strings.Contains(string(b), "sensitive value") {
		t.Fatalf("incorrect redaction: %s", b)
	}
	if values["password"] != "secret-password" {
		t.Fatal("sanitization mutated the plan used for dependency resolution")
	}
}
