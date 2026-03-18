'use client';

import { useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import type { TabName } from '@/lib/types';
import TaskInput from '@/components/TaskInput';
import AgentTimeline from '@/components/AgentTimeline';
import CodeViewer from '@/components/CodeViewer';
import TerminalOutput from '@/components/TerminalOutput';
import GitLog from '@/components/GitLog';
import ThinkingPanel from '@/components/ThinkingPanel';
import PlanView from '@/components/PlanView';
import CompletionBanner from '@/components/CompletionBanner';
import {
  Brain,
  Code2,
  GitBranch,
  Terminal,
  ClipboardList,
  Wifi,
  WifiOff,
  AlertTriangle,
} from 'lucide-react';

const TABS: { id: TabName; label: string; icon: React.ElementType }[] = [
  { id: 'plan', label: 'Plan', icon: ClipboardList },
  { id: 'code', label: 'Code', icon: Code2 },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
  { id: 'git', label: 'Git', icon: GitBranch },
  { id: 'thinking', label: 'Thinking', icon: Brain },
];

export default function Dashboard() {
  const ws = useWebSocket();
  const [activeTab, setActiveTab] = useState<TabName>('plan');

  const tabContent = () => {
    switch (activeTab) {
      case 'plan':
        return <PlanView plan={ws.plan} />;
      case 'code':
        return <CodeViewer codeChanges={ws.codeChanges} />;
      case 'terminal':
        return (
          <TerminalOutput lines={ws.terminalLines} isRunning={ws.isRunning} />
        );
      case 'git':
        return <GitLog gitEvents={ws.gitEvents} />;
      case 'thinking':
        return <ThinkingPanel thinkingEvents={ws.thinkingEvents} />;
    }
  };

  // Badge counts for tabs
  const tabBadge = (id: TabName): number | null => {
    switch (id) {
      case 'code':
        return ws.codeChanges.length || null;
      case 'terminal':
        return ws.terminalLines.length || null;
      case 'git':
        return ws.gitEvents.length || null;
      case 'thinking':
        return ws.thinkingEvents.length || null;
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-white/[0.06] bg-panel/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-accent to-purple-600 flex items-center justify-center shadow-lg shadow-accent/20">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold tracking-tight text-slate-100">
              DeepDev
            </h1>
            <p className="text-[10px] text-slate-500 -mt-0.5">
              Autonomous AI Coding Agent
            </p>
          </div>
        </div>

        {/* Connection status */}
        <div
          className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-full border ${
            ws.connected
              ? 'text-success/80 border-success/20 bg-success/[0.05]'
              : 'text-error/80 border-error/20 bg-error/[0.05]'
          }`}
        >
          {ws.connected ? (
            <>
              <Wifi className="w-3 h-3" />
              Connected
            </>
          ) : (
            <>
              <WifiOff className="w-3 h-3" />
              Disconnected
            </>
          )}
        </div>
      </header>

      {/* Task input */}
      <div className="px-6 py-4">
        <TaskInput
          isRunning={ws.isRunning}
          connected={ws.connected}
          onStart={ws.startTask}
          onCancel={ws.cancel}
        />
      </div>

      {/* Error banner */}
      {ws.error && (
        <div className="px-6 pb-3">
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-error/[0.08] border border-error/20 text-sm text-error">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            {ws.error}
          </div>
        </div>
      )}

      {/* Completion banner */}
      {ws.completionResult && (
        <div className="px-6 pb-3">
          <CompletionBanner result={ws.completionResult} />
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex min-h-0 px-6 pb-4 gap-4">
        {/* Left sidebar - Agent Timeline */}
        <div className="w-60 flex-shrink-0 bg-panel rounded-xl border border-white/[0.06] p-4 overflow-y-auto">
          <AgentTimeline
            agentStatuses={ws.agentStatuses}
            plan={ws.plan}
          />
        </div>

        {/* Right content area */}
        <div className="flex-1 min-w-0 bg-panel rounded-xl border border-white/[0.06] flex flex-col overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center border-b border-white/[0.06] px-2">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const badge = tabBadge(tab.id);

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'text-accent-glow tab-active'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tab.label}
                  {badge && (
                    <span
                      className={`ml-1 text-[10px] px-1.5 py-0 rounded-full ${
                        isActive
                          ? 'bg-accent/20 text-accent-glow'
                          : 'bg-white/[0.06] text-slate-500'
                      }`}
                    >
                      {badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 min-h-0 overflow-hidden">{tabContent()}</div>
        </div>
      </div>
    </div>
  );
}
