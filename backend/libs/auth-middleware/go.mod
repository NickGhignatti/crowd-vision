module github.com/NickGhignatti/crowd-vision/server/auth-middleware

go 1.25.0

require (
	github.com/MicahParks/jwkset v0.11.3
	github.com/MicahParks/keyfunc/v3 v3.8.1
	github.com/NickGhignatti/crowd-vision/server/auth-contracts v0.0.0
	github.com/golang-jwt/jwt/v5 v5.3.1
)

require golang.org/x/time v0.15.0 // indirect

replace github.com/NickGhignatti/crowd-vision/server/auth-contracts => ../auth-contracts
