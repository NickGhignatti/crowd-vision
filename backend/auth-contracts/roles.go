package authcontracts

import (
	_ "embed"
	"encoding/json"
)

//go:embed roles.json
var rolesRaw []byte

// RoleWeights is the single role ladder shared by every service.
var RoleWeights = mustLoadRoleWeights()

func mustLoadRoleWeights() map[string]int {
	m := map[string]int{}
	if err := json.Unmarshal(rolesRaw, &m); err != nil {
		panic("auth-contracts: roles.json is invalid: " + err.Error())
	}
	return m
}

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
