"""
Execution: File-based cache for research results, gap-fills, and scraped content.
Cache is keyed on company name + date (invalidates daily).
Stored in .tmp/cache/ alongside other intermediates.
"""

import sys
import json
import re
from pathlib import Path
from datetime import date

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import TMP_DIR

CACHE_DIR = Path(TMP_DIR) / "cache"


def _slugify(name: str) -> str:
    """Convert company name to filesystem-safe slug."""
    slug = name.lower().strip()
    slug = re.sub(r'[^a-z0-9]+', '_', slug)
    slug = slug.strip('_')
    return slug or "unknown"


def _cache_path(company_name: str, cache_type: str) -> Path:
    """Return cache file path: .tmp/cache/{slug}_{type}_{date}.json"""
    slug = _slugify(company_name)
    today = date.today().strftime("%Y-%m-%d")
    return CACHE_DIR / f"{slug}_{cache_type}_{today}.json"


def load_cache(company_name: str, cache_type: str) -> dict | None:
    """
    Load cached result if it exists and is from today.
    Returns None if no cache found.
    """
    if not company_name or company_name.lower() in ("unknown", "unknown startup"):
        return None

    path = _cache_path(company_name, cache_type)
    if path.exists():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            print(f"  -> Cache hit: {cache_type} for {company_name}")
            return data
        except (json.JSONDecodeError, OSError):
            return None
    print(f"  -> Cache miss: {cache_type} for {company_name}")
    return None


def save_cache(company_name: str, cache_type: str, data: dict) -> None:
    """Save data to cache file. Creates cache directory if needed."""
    if not company_name or company_name.lower() in ("unknown", "unknown startup"):
        return

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    path = _cache_path(company_name, cache_type)
    try:
        path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    except OSError as e:
        print(f"  -> Cache save failed: {e}")



if __name__ == "__main__":
    print("Running cache smoke test...")

    test_data = {"market_size": "Test data", "market_size_source": "tavily"}

    # Save
    save_cache("Acme AI", "research", test_data)
    print(f"  Saved cache for 'Acme AI' / 'research'")

    # Load (should hit)
    loaded = load_cache("Acme AI", "research")
    assert loaded == test_data, f"Cache mismatch: {loaded}"
    print(f"  Cache hit: {loaded}")

    # Load miss (different company)
    loaded2 = load_cache("Other Co", "research")
    assert loaded2 is None
    print(f"  Cache miss for 'Other Co': {loaded2}")

    # Load miss (unknown company)
    loaded3 = load_cache("unknown", "research")
    assert loaded3 is None
    print(f"  Cache skip for 'unknown': {loaded3}")

    print("\nAll cache tests passed.")
