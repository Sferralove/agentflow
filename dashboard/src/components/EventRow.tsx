import { useState } from 'react';
import type { AgentEvent } from '../types';

const TOOL_META: Record<string, { label: string; className: string }> = {
  task: {
    label: 'TASK',
    className: 'border-blue-500/40 bg-blue-500/10 text-blue-300',
  },
  write: {
    label: 'WRITE',
    className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  },
  edit: {
    label: 'EDIT',
    className: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  },
  bash: {
    label: 'BASH',
    className: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
};

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function eventContent(evt: AgentEvent): {
  title: string;
  detail: string | null;
  preview: string | null;
} {
  if (evt.type === 'session.created') {
    return { title: 'Session started', detail: evt.agent, preview: null };
  }

  const description = asText(evt.input?.description);
  const command = asText(evt.input?.command);
  const filePath = asText(evt.input?.filePath);
  const subagentType = asText(evt.input?.subagent_type);
  const output = asText(evt.output);
  const error = asText(evt.error);

  if (evt.tool === 'task') {
    return {
      title: description || subagentType || 'Subagent task',
      detail: subagentType ? `subagent: ${subagentType}` : output,
      preview: output,
    };
  }

  if (evt.tool === 'bash') {
    return {
      title: command || 'Shell command',
      detail: error || output,
      preview: error || output,
    };
  }

  if (evt.tool === 'write' || evt.tool === 'edit') {
    return {
      title: filePath || description || `${evt.tool} operation`,
      detail: description && description !== filePath ? description : output,
      preview: output || description,
    };
  }

  return {
    title: evt.tool || evt.type,
    detail: description || command || filePath || output,
    preview: error || output,
  };
}

function sessionTint(sessionId: string): string {
  let hash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    hash = sessionId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsla(${hue}, 46%, 34%, 0.10)`;
}

function eventState(event: AgentEvent): {
  label: string;
  dot: string;
  text: string;
} {
  if (event.error) {
    return { label: 'ERROR', dot: 'bg-red-400', text: 'text-red-300' };
  }
  if (event.type === 'tool.start') {
    return { label: 'START', dot: 'bg-blue-400', text: 'text-blue-300' };
  }
  if (event.type === 'tool.end') {
    return { label: 'DONE', dot: 'bg-emerald-400', text: 'text-emerald-300' };
  }
  return { label: 'EVENT', dot: 'bg-slate-400', text: 'text-slate-300' };
}

export default function EventRow({
  event,
  showSession,
  critical,
}: {
  event: AgentEvent;
  showSession?: boolean;
  critical?: boolean;
}) {
  const [expanded, setExpanded] = useState(Boolean(event.error));
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const shortSid =
    event.sessionId.length > 12 ? event.sessionId.slice(-12) : event.sessionId;
  const tool = event.tool ? TOOL_META[event.tool] : null;
  const state = eventState(event);
  const content = eventContent(event);
  const canExpand = Boolean(content.preview && content.preview !== content.detail);
  const preview = content.preview || content.detail;
  const cappedPreview =
    preview && preview.length > 900 ? `${preview.slice(0, 900)}...` : preview;

  return (
    <div
      className={`group relative border-b px-4 py-3 text-xs transition-colors hover:bg-gray-900/70 ${
        critical
          ? 'border-amber-500/20 bg-amber-500/[0.035]'
          : 'border-gray-800/60'
      }`}
      style={
        showSession
          ? { backgroundColor: sessionTint(event.sessionId) }
          : undefined
      }
    >
      <div className="absolute left-[5.25rem] top-0 h-full w-px bg-gray-800/70" />
      <div className="grid grid-cols-[4.25rem_minmax(0,1fr)] gap-4">
        <div className="flex flex-col items-end gap-1 pr-2">
          <span className="font-mono text-[10px] text-gray-500">{time}</span>
          {showSession && (
            <span
              className="max-w-16 text-balance text-right font-mono text-[9px] text-gray-600"
              title={event.sessionId}
            >
              {shortSid}
            </span>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-1 flex min-w-0 items-center gap-2">
            <span className="relative z-10 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-gray-800 bg-gray-950">
              <span className={`h-2 w-2 rounded-full ${state.dot}`} />
            </span>
            <span
              className={`shrink-0 text-[10px] font-semibold ${state.text}`}
            >
              {state.label}
            </span>
            {critical && (
              <span className="shrink-0 rounded border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-200">
                CRITICAL
              </span>
            )}
            {tool && (
              <span
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] font-semibold ${tool.className}`}
              >
                {tool.label}
              </span>
            )}
            {event.duration != null && (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-gray-500">
                {(event.duration / 1000).toFixed(1)}s
              </span>
            )}
          </div>

          <div
            className="truncate text-[13px] font-medium leading-5 text-gray-200"
            title={content.title}
          >
            {content.title}
          </div>
          {content.detail && (
            <div
              className={`mt-1 max-w-full truncate rounded-md border px-2 py-1 font-mono text-[10px] w-fit ${
                event.error
                  ? 'border-red-500/20 bg-red-500/10 text-red-300'
                  : event.tool === 'bash'
                    ? 'border-amber-500/15 bg-amber-500/10 text-amber-200/80'
                    : 'border-gray-800 bg-gray-950/70 text-gray-500'
              }`}
              title={content.detail}
            >
              {content.detail}
            </div>
          )}
          {preview && (
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className="mt-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 transition-colors hover:text-gray-300"
            >
              {expanded ? 'Hide preview' : canExpand ? 'Show output' : 'Show preview'}
            </button>
          )}
          {expanded && cappedPreview && (
            <pre
              className={`mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border px-3 py-2 font-mono text-[10px] leading-5 ${
                event.error
                  ? 'border-red-500/25 bg-red-950/30 text-red-200'
                  : critical
                    ? 'border-amber-400/20 bg-amber-950/20 text-amber-100/85'
                    : 'border-gray-800 bg-gray-950/80 text-gray-400'
              }`}
            >
              {cappedPreview}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
