export type AgentName = 'supervisor' | 'planner' | 'coder' | 'tester' | 'fixer';
export type AgentStatus = 'idle' | 'active' | 'complete' | 'error';

export interface PlanStep {
  step: number;
  description: string;
  files: string[];
  status: 'pending' | 'active' | 'done' | 'failed';
}

export interface CodeChange {
  file: string;
  content: string;
  action: 'create' | 'modify' | 'delete';
  timestamp: number;
}

export interface GitEvent {
  action: 'branch' | 'commit';
  message: string;
  branch: string;
  timestamp: number;
}

export interface TerminalLine {
  output: string;
  stream: 'stdout' | 'stderr';
  timestamp: number;
}

export interface ThinkingEvent {
  agent: AgentName;
  content: string;
  timestamp: number;
}

export interface CompletionResult {
  summary: string;
  branch: string;
  commits: number;
}

export type WSEvent =
  | { type: 'status'; agent: AgentName; status: AgentStatus }
  | { type: 'plan'; steps: PlanStep[] }
  | { type: 'code'; file: string; content: string; action: string }
  | { type: 'terminal'; output: string; stream: 'stdout' | 'stderr' }
  | { type: 'git'; action: string; message: string; branch: string }
  | { type: 'thinking'; agent: AgentName; content: string }
  | { type: 'complete'; summary: string; branch: string; commits: number }
  | { type: 'error'; message: string; recoverable: boolean };

export type TabName = 'plan' | 'code' | 'terminal' | 'git' | 'thinking';
