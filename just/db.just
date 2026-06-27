set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

# Bare `just db` lists recipes instead of running a destructive default.
[private]
default:
    @just --list db

[doc("Clear all service databases (auth, chat, twin, notification, agent).")]
clear:
    docker compose -f docker-compose.yml -f server/auth-service/docker-compose.yml exec auth-db mongosh authdb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f server/chat-service/docker-compose.yml exec chat-db mongosh chatdb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f server/twin-service/docker-compose.yml exec twin-db mongosh twindb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f server/notification-service/docker-compose.yml exec notification-db mongosh notificationdb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f server/agent-service/docker-compose.yml exec agent-db psql -U agent -d agentdb -c "TRUNCATE chunks, documents RESTART IDENTITY CASCADE;"

[doc("Clear sensor database only.")]
clear-sensor:
    docker compose -f docker-compose.yml -f server/sensor-service/docker-compose.yml exec sensor-db mongosh sensordb --eval "db.dropDatabase()"
