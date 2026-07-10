package authcontracts

import (
	_ "embed"
	"encoding/json"
)

//go:embed roles.json
var rolesRaw []byte

// RoleWeights is the single role ladder shared by every service. Keep it in
// lockstep with server/auth-service/src/models/role.ts (ROLE_WEIGHTS) until
// the Node services also load this file directly.
var RoleWeights = mustLoadRoleWeights()

func mustLoadRoleWeights() map[string]int {
	m := map[string]int{}
	if err := json.Unmarshal(rolesRaw, &m); err != nil {
		panic("auth-contracts: roles.json is invalid: " + err.Error())
	}
	return m
}

// Can is the whole authorization decision: does principalRole meet or exceed
// requiredRole on the shared ladder? Its signature is deliberately Cedar-shaped
// (principal role in, allow/deny out) so a future move to a real policy engine
// (see the plan's G-CEDAR gate) only changes this function's body.
func Can(principalRole, requiredRole string) bool {
	have, ok := RoleWeights[principalRole]
	if !ok {
		return false
	}
	need, ok := RoleWeights[requiredRole]
	if !ok {
		return false
	}
	return have >= need
}
