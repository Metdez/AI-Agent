"""
Execution: Research prioritizer -- DISABLED.
All research areas now run at equal priority. This module returns {} immediately.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


def prioritize_research(company_info: dict) -> dict:
    """
    Previously used Claude to rank research areas by priority.
    Now disabled -- returns {} immediately. All areas run at equal priority.
    """
    return {}


if __name__ == "__main__":
    print("Research prioritizer disabled -- all areas run at equal priority.")
