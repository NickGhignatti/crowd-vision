// Package authpolicy is the Go embedding of CrowdVision's shared Cedar
// authorization bundle (schema.cedarschema + policy.cedar), evaluated
// locally in every service that needs tenant/role decisions (Decision A —
// no authz network call on the data path). See policy.cedar for the rules
// and schema.cedarschema for the entity shapes.
package authpolicy

import (
	_ "embed"

	"github.com/cedar-policy/cedar-go"
)

//go:embed schema.cedarschema
var SchemaText string

//go:embed policy.cedar
var PolicyText string

// policySet is parsed once at package init — every caller shares it, since
// it's read-only after construction and cedar-go's PolicySet is safe for
// concurrent use.
var policySet = mustParsePolicySet()

func mustParsePolicySet() *cedar.PolicySet {
	ps, err := cedar.NewPolicySetFromBytes("policy.cedar", []byte(PolicyText))
	if err != nil {
		panic("authpolicy: policy.cedar failed to parse: " + err.Error())
	}
	return ps
}
