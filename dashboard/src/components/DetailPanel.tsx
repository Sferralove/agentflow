import type { AgentNode, AgentEvent } from '../types'
import { STATUS_COLORS } from '../types'
import EventRow from './EventRow'

interface DetailPanelProps {
  selectedNode: AgentNode | null
  events: AgentEvent[]
  unified?: boolean
}

export default function DetailPanel({ selectedNode, events, unified }: DetailPanelProps) {
  if (!selectedNode) {
    return (
      <div className="h-full flex flex-col">
        <div className="px-3 py-2 border-b border-gray-800 text-[11px] font-semibold uppercase text-gray-500 shrink-0">
          {unified ? `Timeline · all sessions` : 'Timeline'} · {events.length} events
        </div>
        <div className="flex-1 overflow-y-auto">
          {events.length === 0 ? (
            <div className="text-gray-600 text-xs text-center mt-12 px-4">
              {unified ? 'Start OpenCode to see events' : 'Click an agent node to inspect'}
            </div>
          ) : (
            events.map(evt => <EventRow key={evt.id} event={evt} showSession={unified} />)
          )}
        </div>
      </div>
    )
  }

  const duration = selectedNode.completedAt
    ? ((selectedNode.completedAt - selectedNode.startedAt) / 1000).toFixed(0) + 's'
    : selectedNode.status === 'error' ? 'error'
    : 'running...'

  return (
    <div className="h-full flex flex-col">
      <div className="px-3 py-2 border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[selectedNode.status] }} />
          <h3 className="font-semibold text-sm">{selectedNode.name}</h3>
        </div>
        <div className="text-[11px] text-gray-500 mt-0.5">
          {selectedNode.status} · {duration}
          {(selectedNode.tasksCompleted > 0 || selectedNode.tasksFailed > 0) && (
            <span> · {selectedNode.tasksCompleted}/{selectedNode.tasksCompleted + selectedNode.tasksFailed} tasks</span>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-1.5 text-[11px] font-semibold uppercase text-gray-600 border-b border-gray-800/50">
          Events · {events.length}
        </div>
        {events.length === 0 ? (
          <div className="text-gray-600 text-xs text-center mt-8">No events for this agent</div>
        ) : (
          events.map(evt => <EventRow key={evt.id} event={evt} />)
        )}
      </div>
    </div>
  )
}
