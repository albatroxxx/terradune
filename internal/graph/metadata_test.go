package graph

import (
	"encoding/json"
	"strings"
	"testing"

	tfjson "github.com/hashicorp/terraform-json"
)

func TestWholeSensitiveMetadataCannotFallBackToBefore(t *testing.T) {
	for _, field := range []string{"before", "after"} {
		t.Run(field, func(t *testing.T) {
			change := &tfjson.Change{Before: map[string]interface{}{"id": "old-secret"}, After: map[string]interface{}{"id": "new-secret"}}
			if field == "before" {
				change.BeforeSensitive = true
			} else {
				change.AfterSensitive = true
			}
			if got := displayMeta(&tfjson.ResourceChange{Change: change}, map[string]string{"id": "fallback-secret"}); len(got) != 0 {
				t.Fatalf("sensitive whole value leaked: %v", got)
			}
		})
	}
}

func TestMetadataMasksNestedConditionsAndKeepsDependencyIDsInternal(t *testing.T) {
	var plan tfjson.Plan
	err := json.Unmarshal([]byte(`{"format_version":"1.2","resource_changes":[
	  {"address":"aws_vpc.main","mode":"managed","type":"aws_vpc","name":"main","change":{"actions":["no-op"],"after":{"id":"secret-vpc","cidr_block":"10.0.0.0/16"},"after_sensitive":{"id":true}}},
	  {"address":"aws_subnet.main","mode":"managed","type":"aws_subnet","name":"main","change":{"actions":["create"],"after":{"vpc_id":"secret-vpc"},"after_sensitive":{"vpc_id":true}}},
	  {"address":"aws_lb_listener_rule.main","mode":"managed","type":"aws_lb_listener_rule","name":"main","change":{"actions":["create"],"after":{"condition":[{"host_header":[{"values":["secret-host","public-host"]}]}]},"after_sensitive":{"condition":[{"host_header":[{"values":[true,false]}]}]}}}
	]}`), &plan)
	if err != nil {
		t.Fatal(err)
	}
	g := Build(&plan)
	raw, err := json.Marshal(g)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "secret-") || !strings.Contains(string(raw), "public-host") || !strings.Contains(string(raw), "10.0.0.0/16") {
		t.Fatalf("incorrect metadata masking: %s", raw)
	}
	want := Edge{From: "aws_subnet.main", To: "aws_vpc.main"}
	if len(g.Edges) != 1 || g.Edges[0] != want {
		t.Fatalf("raw ID dependency resolution lost: %v", g.Edges)
	}
	if plan.ResourceChanges[0].Change.After.(map[string]interface{})["id"] != "secret-vpc" {
		t.Fatal("sanitization mutated source plan")
	}
}

func TestPlannedSensitiveStateReplacesPriorMetadata(t *testing.T) {
	values := map[string]map[string]string{}
	collectValues(&tfjson.StateModule{Resources: []*tfjson.StateResource{{Address: "aws_vpc.main", AttributeValues: map[string]interface{}{"id": "old-secret"}}}}, values)
	collectValues(&tfjson.StateModule{Resources: []*tfjson.StateResource{{Address: "aws_vpc.main", AttributeValues: map[string]interface{}{"id": "new-secret"}, SensitiveValues: json.RawMessage(`true`)}}}, values)
	if len(values["aws_vpc.main"]) != 0 {
		t.Fatalf("prior metadata retained: %v", values)
	}
	collectValues(&tfjson.StateModule{Resources: []*tfjson.StateResource{{Address: "aws_vpc.main", AttributeValues: map[string]interface{}{"id": "invalid-mask-secret"}, SensitiveValues: json.RawMessage(`{`)}}}, values)
	if len(values["aws_vpc.main"]) != 0 {
		t.Fatalf("malformed mask must fail closed: %v", values)
	}
}
