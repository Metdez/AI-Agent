'use client';

import type { AgentName, AgentStatus, PlanStep } from '@/lib/types';
import {
  Brain,
  Code2,
  CheckCircle,
  XCircle,
  Loader2,
  Zap,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';

interface AgentTimelineProps {
  agentStatuses: Record<AgentName, AgentStatus>;
  plan: PlanStep[];
}

const AGENTS: { name: AgentName; label: string; icon: React.ElementType }[] = [
  { name: 'planner', label: 'Planner', icon: Brain },
  { name: 'coder', label: 'Coder', icon: Code2 },
  { name: 'tester', label: 'Tester', icon: Zap },
  { name: 'fixer', label: 'Fixer', icon: AlertTriangle },
];

function StatusIndicator({ status }: { status: AgentStatus }) {
  switch (status) {
    case 'active':
      return (
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-75 pulse-dot" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent-glow" />
        </span>
      );
    case 'complete':
      return <CheckCircle className="w-4 h-4 text-success" />;
    case 'error':
      return <XCircle className="w-4 h-4 text-error" />;
    default:
      return (
        <span className="inline-flex h-2.5 w-2.5 rounded-full bg-slate-600" />
      );
  }
}

function PlanStepItem({ step }: { step: PlanStep }) {
  const statusIcon = () => {
    switch (step.status) {
      case 'done':
        return <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />;
      case 'active':
        return <Loader2 className="w-3.5 h-3.5 text-accent animate-spin flex-shrink-0" />;
      case 'failed':
        return <XCircle className="w-3.5 h-3.5 text-error flex-shrink-0" />;
      default:
        return (
          <span className="w-3.5 h-3.5 flex items-center justify-center flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-600" />
          </span>
        );
    }
  };

  return (
    <div
      className={`flex items-start gap-2.5 py-1.5 text-xs transition-colors ${
        step.status === 'active'
          ? 'text-slate-200'
          : step.status === 'done'
          ? 'text-slate-400'
          : step.status === 'failed'
          ? 'text-error/80'
          : 'text-slate-500'
      }`}
    >
      {statusIcon()}
      <span className="leading-snug">
        {step.step}. {step.description}
      </span>
    </div>
  );
}

export default function AgentTimeline({
  agentStatuses,
  plan,
}: AgentTimelineProps) {
  return (
    <div className="space-y-6">
      {/* Agent pipeline */}
      <div>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-3">
          Agent Pipeline
        </h3>
        <div className="relative space-y-0">
          {AGENTS.map((agent, i) => {
            const status = agentStatuses[agent.name];
            const Icon = agent.icon;
            const isActive = status === 'active';
            const isLast = i === AGENTS.length - 1;

            return (
              <div key={agent.name} className="relative">
                {/* Connector line */}
                {!isLast && (
                  <div className="absolute left-[19px] top-[40px] w-px h-4 bg-white/[0.06]" />
                )}

                <div
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all ${
                    isActive
                      ? 'bg-accent/[0.08] agent-active-glow'
                      : 'hover:bg-panel-hover'
                  }`}
                >
                  <div
                    className={`w-[26px] h-[26px] rounded-md flex items-center justify-center transition-colors ${
                      isActive
                        ? 'bg-accent/20 text-accent-glow'
                        : status === 'complete'
                        ? 'bg-success/10 text-success'
                        : status === 'error'
                        ? 'bg-error/10 text-error'
                        : 'bg-white/[0.04] text-slate-500'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>

                  <span
                    className={`text-sm font-medium flex-1 ${
                      isActive
                        ? 'text-slate-100'
                        : status === 'complete'
                        ? 'text-slate-300'
                        : 'text-slate-500'
                    }`}
                  >
                    {agent.label}
                  </span>

                  <StatusIndicator status={status} />
                </div>
              </div>
            );
          })}

          {/* Fix loop arrow */}
          <div className="flex items-center gap-2 pl-3 pt-1">
            <RotateCcw className="w-3 h-3 text-slate-600" />
            <span className="text-[10px] text-slate-600 italic">
              Fix loop
            </span>
          </div>
        </div>
      </div>

      {/* Plan steps */}
      {plan.length > 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Plan Steps
          </h3>
          <div className="space-y-0.5">
            {plan.map((step) => (
              <PlanStepItem key={step.step} step={step} />
            ))}
          </div>
        </div>
      )}

      {plan.length === 0 && (
        <div>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
            Plan Steps
          </h3>
          <p className="text-xs text-slate-600 italic">
            Waiting for planner...
          </p>
        </div>
      )}
    </div>
  );
}
