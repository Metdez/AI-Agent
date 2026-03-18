from typing import TypedDict, Annotated
from langgraph.graph import add_messages


class PlanStep(TypedDict):
    step: int
    description: str
    files: list[str]  # files to create/modify
    status: str  # pending | active | done | failed


class DeepDevState(TypedDict):
    task: str
    repo_path: str
    branch_name: str
    plan: list[PlanStep]
    current_step: int
    files_modified: list[str]
    test_results: str
    test_passed: bool
    error_analysis: str
    fix_attempts: int
    messages: Annotated[list, add_messages]
    status: str  # planning | coding | testing | fixing | done | failed
    ws_events: list[dict]  # events to stream to frontend
