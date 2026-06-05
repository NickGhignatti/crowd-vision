"""Per-million-token pricing (USD). Keep rough; log is advisory not billing.

Model ids are provider-agnostic (OpenRouter-style "vendor/model"). Anything not
listed falls back to $0 — the cost figure is informational, not billing.
"""

# Approximate public prices as of 2026-06; update as needed.
PRICING: dict[str, tuple[float, float]] = {
    # (input $/M, output $/M)
    "openai/gpt-4o-mini": (0.15, 0.60),
    "openai/gpt-4o": (2.50, 10.00),
    "openai/text-embedding-3-small": (0.02, 0.0),
    "openai/text-embedding-3-large": (0.13, 0.0),
    "google/gemini-2.5-flash": (0.075, 0.30),
    "google/gemini-2.5-pro": (1.25, 5.00),
    "deepseek/deepseek-chat": (0.27, 1.10),
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    in_price, out_price = PRICING.get(model, (0.0, 0.0))
    return (input_tokens / 1_000_000) * in_price + (output_tokens / 1_000_000) * out_price
