module github.com/NickGhignatti/ambitwin/server/auth-middleware

go 1.27.1

require (
	github.com/MicahParks/jwkset v0.11.4
	github.com/MicahParks/keyfunc/v3 v3.9.1
	github.com/NickGhignatti/ambitwin/server/auth-contracts v0.0.0
	github.com/golang-jwt/jwt/v5 v5.3.1
)

require golang.org/x/time v0.15.0 // indirect

replace github.com/NickGhignatti/ambitwin/server/auth-contracts => ../auth-contracts
