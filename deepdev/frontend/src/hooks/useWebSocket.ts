'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import type {
  AgentName,
  AgentStatus,
  CodeChange,
  CompletionResult,
  GitEvent,
  PlanStep,
  TerminalLine,
  ThinkingEvent,
  WSEvent,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface State {
  connected: boolean;
  isRunning: boolean;
  agentStatuses: Record<AgentName, AgentStatus>;
  plan: PlanStep[];
  codeChanges: CodeChange[];
  terminalLines: TerminalLine[];
  gitEvents: GitEvent[];
  thinkingEvents: ThinkingEvent[];
  events: WSEvent[];
  error: string | null;
  completionResult: CompletionResult | null;
}

const INITIAL_AGENT_STATUSES: Record<AgentName, AgentStatus> = {
  supervisor: 'idle',
  planner: 'idle',
  coder: 'idle',
  tester: 'idle',
  fixer: 'idle',
};

const initialState: State = {
  connected: false,
  isRunning: false,
  agentStatuses: { ...INITIAL_AGENT_STATUSES },
  plan: [],
  codeChanges: [],
  terminalLines: [],
  gitEvents: [],
  thinkingEvents: [],
  events: [],
  error: null,
  completionResult: null,
};

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

type Action =
  | { type: 'CONNECTED' }
  | { type: 'DISCONNECTED' }
  | { type: 'RESET' }
  | { type: 'SET_RUNNING'; running: boolean }
  | { type: 'WS_EVENT'; event: WSEvent };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'CONNECTED':
      return { ...state, connected: true, error: null };

    case 'DISCONNECTED':
      return { ...state, connected: false };

    case 'RESET':
      return {
        ...initialState,
        connected: state.connected,
      };

    case 'SET_RUNNING':
      return { ...state, isRunning: action.running };

    case 'WS_EVENT': {
      const event = action.event;
      const events = [...state.events, event];

      switch (event.type) {
        case 'status':
          return {
            ...state,
            events,
            agentStatuses: {
              ...state.agentStatuses,
              [event.agent]: event.status,
            },
          };

        case 'plan':
          return { ...state, events, plan: event.steps };

        case 'code':
          return {
            ...state,
            events,
            codeChanges: [
              ...state.codeChanges,
              {
                file: event.file,
                content: event.content,
                action: event.action as CodeChange['action'],
                timestamp: Date.now(),
              },
            ],
          };

        case 'terminal':
          return {
            ...state,
            events,
            terminalLines: [
              ...state.terminalLines,
              {
                output: event.output,
                stream: event.stream,
                timestamp: Date.now(),
              },
            ],
          };

        case 'git':
          return {
            ...state,
            events,
            gitEvents: [
              ...state.gitEvents,
              {
                action: event.action as GitEvent['action'],
                message: event.message,
                branch: event.branch,
                timestamp: Date.now(),
              },
            ],
          };

        case 'thinking':
          return {
            ...state,
            events,
            thinkingEvents: [
              ...state.thinkingEvents,
              {
                agent: event.agent,
                content: event.content,
                timestamp: Date.now(),
              },
            ],
          };

        case 'complete':
          return {
            ...state,
            events,
            isRunning: false,
            completionResult: {
              summary: event.summary,
              branch: event.branch,
              commits: event.commits,
            },
          };

        case 'error':
          return {
            ...state,
            events,
            error: event.message,
            isRunning: event.recoverable ? state.isRunning : false,
          };

        default:
          return { ...state, events };
      }
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws';
const MAX_RETRIES = 5;
const BASE_DELAY = 1000;

export function useWebSocket() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
        dispatch({ type: 'CONNECTED' });
      };

      ws.onmessage = (e) => {
        try {
          const event: WSEvent = JSON.parse(e.data);
          dispatch({ type: 'WS_EVENT', event });
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        dispatch({ type: 'DISCONNECTED' });
        wsRef.current = null;

        if (retriesRef.current < MAX_RETRIES) {
          const delay = BASE_DELAY * Math.pow(2, retriesRef.current);
          retriesRef.current += 1;
          reconnectTimerRef.current = setTimeout(connect, delay);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // connection failed – rely on onclose for retry
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const sendMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(msg));
      }
    },
    [],
  );

  const startTask = useCallback(
    (task: string, repoPath: string) => {
      dispatch({ type: 'RESET' });
      dispatch({ type: 'SET_RUNNING', running: true });
      sendMessage({ type: 'start_task', task, repo_path: repoPath });
    },
    [sendMessage],
  );

  const cancel = useCallback(() => {
    sendMessage({ type: 'cancel' });
    dispatch({ type: 'SET_RUNNING', running: false });
  }, [sendMessage]);

  return {
    connected: state.connected,
    sendMessage,
    startTask,
    cancel,
    events: state.events,
    agentStatuses: state.agentStatuses,
    plan: state.plan,
    codeChanges: state.codeChanges,
    terminalLines: state.terminalLines,
    gitEvents: state.gitEvents,
    thinkingEvents: state.thinkingEvents,
    isRunning: state.isRunning,
    error: state.error,
    completionResult: state.completionResult,
  };
}
