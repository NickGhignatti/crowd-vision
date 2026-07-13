// Embedding of shared Cedar authorization bundle (schema.cedarschema + policy.cedar), evaluated
// locally in every service that needs tenant/role decisions.
package authpolicy

import (
	_ "embed"

	"github.com/cedar-policy/cedar-go"
)

//go:embed schema.cedarschema
var SchemaText string

//go:embed policy.cedar
var PolicyText string

var policySet = mustParsePolicySet()

func mustParsePolicySet() *cedar.PolicySet {
	ps, err := cedar.NewPolicySetFromBytes("policy.cedar", []byte(PolicyText))
	if err != nil {
		panic("authpolicy: policy.cedar failed to parse: " + err.Error())
	}
	return ps
}
