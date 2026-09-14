set shell := ["bash", "-c"]
set windows-shell := ["powershell.exe", "-NoLogo", "-Command"]
set working-directory := '..'

[private]
default:
    @just --list db

# The root file alone is not a valid project: gateway depends_on services that only other
# fragments declare. compose.runtime.yml is the full stack the last `just stack` run started.
[private]
runtime:
    @test -f compose.runtime.yml || { echo "compose.runtime.yml not found: start the stack with 'just stack dev' first" >&2; exit 1; }

[doc("Clear all service databases (chat, twin, notification, agent).")]
clear: runtime
    docker compose -f compose.runtime.yml exec chat-db mongosh chatdb --eval "db.dropDatabase()"
    docker compose -f compose.runtime.yml exec twin-db mongosh twindb --eval "db.dropDatabase()"
    docker compose -f compose.runtime.yml exec notification-db mongosh notificationdb --eval "db.dropDatabase()"
    # `-`: a stack started with --no-agent has no agent-db; the other databases are still cleared.
    -docker compose -f compose.runtime.yml exec agent-db psql -U agent -d agentdb -c "TRUNCATE chunks, documents RESTART IDENTITY CASCADE;"

[doc("Clear telemetry database only.")]
clear-telemetry: runtime
    docker compose -f compose.runtime.yml exec telemetry-db psql -U telemetry -d telemetrydb -c "truncate readings, thresholds, sensors, building_rooms, buildings cascade;"
