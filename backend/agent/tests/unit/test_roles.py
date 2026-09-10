import json

from app import cedar_authz, roles


def test_ladder_is_read_from_shared_roles_json():
    assert roles.ROLES_FILE.parts[-3:] == ("libs", "auth-contracts", "roles.json")
    assert json.loads(roles.ROLES_FILE.read_text()) == roles.ROLE_WEIGHTS


def test_config_and_cedar_share_one_ladder():
    assert cedar_authz._ROLE_WEIGHTS is roles.ROLE_WEIGHTS
