'use client';

import type { PlanStep } from '@/lib/types';
import { CheckCircle, XCircle, Loader2, ClipboardList } from 'lucide-react';

interface PlanViewProps {
  plan: PlanStep[];
}

export default function PlanView({ plan }: PlanViewProps) {
  if (plan.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-600 text-sm">
        <div className="text-center space-y-2">
          <ClipboardList className="w-8 h-8 mx-auto opacity-30" />
          <p>No plan generated yet</p>
          <p className="text-xs text-slate-700">
            The planner agent will create a step-by-step plan
          </p>
        </div>
      </div>
    );
  }

  const doneCount = plan.filter((s) => s.status === 'done').length;
  const progress = plan.length > 0 ? (doneCount / plan.length) * 100 : 0;

  return (
    <div className="p-4 h-full overflow-y-auto">
      {/* Progress bar */}
      <div className="mb-5">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1.5">
          <span>Progress</span>
          <span>
            {doneCount} / {plan.length} steps
          </span>
        </div>
        <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-accent-glow rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-2">
        {plan.map((step, i) => {
          const isActive = step.status === 'active';
          const isDone = step.status === 'done';
          const isFailed = step.status === 'failed';

          return (
            <div
              key={step.step}
              className={`flex items-start gap-3 p-3 rounded-lg border transition-all animate-fade-in ${
                isActive
                  ? 'bg-accent/[0.06] border-accent/20'
                  : isDone
                  ? 'bg-success/[0.03] border-white/[0.04]'
                  : isFailed
                  ? 'bg-error/[0.04] border-error/20'
                  : 'bg-white/[0.01] border-white/[0.04]'
              }`}
            >
              {/* Step icon */}
              <div className="flex-shrink-0 mt-0.5">
                {isDone && (
                  <CheckCircle className="w-4.5 h-4.5 text-success" />
                )}
                {isActive && (
                  <Loader2 className="w-4.5 h-4.5 text-accent animate-spin" />
                )}
                {isFailed && (
                  <XCircle className="w-4.5 h-4.5 text-error" />
                )}
                {step.status === 'pending' && (
                  <div className="w-[18px] h-[18px] rounded-full border border-slate-700 flex items-center justify-center">
                    <span className="text-[10px] text-slate-600 font-mono">
                      {step.step}
                    </span>
                  </div>
                )}
              </div>

              {/* Step content */}
              <div className="flex-1 min-w-0">
                <p
                  className={`text-sm leading-relaxed ${
                    isActive
                      ? 'text-slate-200'
                      : isDone
                      ? 'text-slate-400'
                      : isFailed
                      ? 'text-error/80'
                      : 'text-slate-500'
                  }`}
                >
                  {step.description}
                </p>
              </div>

              {/* Step number */}
              {step.status !== 'pending' && (
                <span className="text-[10px] text-slate-600 font-mono flex-shrink-0">
                  #{step.step}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
