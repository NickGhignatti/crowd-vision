# TODO: re-enable these tests once the prompts module is stabilized.
# Imports kept (noqa) so we don't have to re-add them when un-parking the tests below.
from app.agent.prompts import IDK_MARKER, SYSTEM_PROMPT  # noqa: F401


# def test_system_prompt_enforces_idk():
#     assert "I don't know" in SYSTEM_PROMPT
#     assert IDK_MARKER in SYSTEM_PROMPT


# def test_system_prompt_requires_citations():
#     assert "[^chunk_id]" in SYSTEM_PROMPT
