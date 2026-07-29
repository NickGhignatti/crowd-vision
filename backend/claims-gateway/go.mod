module github.com/NickGhignatti/crowd-vision/server/claims-gateway

go 1.25.0

require github.com/NickGhignatti/crowd-vision/server/auth-contracts v0.0.0

require (
	github.com/MicahParks/jwkset v0.11.0
	github.com/coreos/go-oidc/v3 v3.19.0
	github.com/go-chi/chi/v5 v5.3.0
	github.com/golang-jwt/jwt/v5 v5.3.1
	github.com/google/uuid v1.6.0
)

require (
	github.com/go-jose/go-jose/v4 v4.1.4 // indirect
	golang.org/x/oauth2 v0.36.0 // indirect
	golang.org/x/time v0.9.0 // indirect
)

require (
	github.com/MicahParks/keyfunc/v3 v3.8.0
	github.com/NickGhignatti/crowd-vision/server/auth-middleware v0.0.0
)

replace github.com/NickGhignatti/crowd-vision/server/auth-contracts => ../auth-contracts

replace github.com/NickGhignatti/crowd-vision/server/auth-middleware => ../auth-middleware
