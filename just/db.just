set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list db

[doc("Clear all service databases (chat, twin, notification, agent).")]
clear:
    docker compose -f docker-compose.yml -f backend/chat-service/docker-compose.yml exec chat-db mongosh chatdb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f backend/twin-service/docker-compose.yml exec twin-db mongosh twindb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f backend/notification-service/docker-compose.yml exec notification-db mongosh notificationdb --eval "db.dropDatabase()"
    docker compose -f docker-compose.yml -f backend/agent-service/docker-compose.yml exec agent-db psql -U agent -d agentdb -c "TRUNCATE chunks, documents RESTART IDENTITY CASCADE;"

[doc("Clear telemetry database only.")]
clear-telemetry:
    docker compose -f docker-compose.yml -f backend/telemetry-service/docker-compose.yml exec telemetry-db psql -U telemetry -d telemetrydb -c "truncate readings, thresholds, sensors, building_rooms, buildings cascade;"
