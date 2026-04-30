"""Per-million-token pricing (USD). Keep rough; log is advisory not billing."""

# Approximate public prices as of 2026-04; update as needed.
PRICING: dict[str, tuple[float, float]] = {
    # (input $/M, output $/M)
    "gemini-2.5-flash": (0.075, 0.30),
    "gemini-2.5-flash-lite": (0.04, 0.15),
    "gemini-2.5-pro": (1.25, 5.00),
    "text-embedding-004": (0.0, 0.0),
    "deepseek-chat": (0.27, 1.10),
    "deepseek-reasoner": (0.55, 2.19),
}


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    in_price, out_price = PRICING.get(model, (0.0, 0.0))
    return (input_tokens / 1_000_000) * in_price + (output_tokens / 1_000_000) * out_price
