package main

import (
	"reflect"
	"testing"
)

func TestResolveStackArgs(t *testing.T) {
	cases := []struct {
		mode string
		rest []string
		want []string
	}{
		{"dev-light", nil, []string{"dev", "agent"}},
		{"dev-light", []string{"ignored"}, []string{"dev", "agent"}},
		{"dev", []string{"agent", "simulator"}, []string{"dev", "agent", "simulator"}},
		{"down", nil, []string{"down"}},
	}

	for _, c := range cases {
		got := resolveStackArgs(c.mode, c.rest)
		if !reflect.DeepEqual(got, c.want) {
			t.Errorf("resolveStackArgs(%q, %v) = %v, want %v", c.mode, c.rest, got, c.want)
		}
	}
}
