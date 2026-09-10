"""Role ladder, read from `libs/auth-contracts/roles.json`."""

import json
from pathlib import Path

ROLES_FILE = Path(__file__).resolve().parents[2] / "libs" / "auth-contracts" / "roles.json"
ROLE_WEIGHTS: dict[str, int] = json.loads(ROLES_FILE.read_text())
