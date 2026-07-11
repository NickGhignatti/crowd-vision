module github.com/NickGhignatti/crowd-vision/server/auth-policy

go 1.23.0

require (
	github.com/NickGhignatti/crowd-vision/server/auth-contracts v0.0.0
	github.com/cedar-policy/cedar-go v1.8.0
)

require golang.org/x/exp v0.0.0-20220921023135-46d9e7742f1e // indirect

replace github.com/NickGhignatti/crowd-vision/server/auth-contracts => ../auth-contracts
