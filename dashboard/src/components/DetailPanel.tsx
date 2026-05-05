import type { AgentNode, AgentEvent } from '../types'
import { STATUS_COLORS } from '../types'
import EventRow from './EventRow'

interface DetailPanelProps {
  selectedNode: AgentNode | null
  events: AgentEvent[]
}

export default function DetailPanel({ selectedNode, events }: DetailPanelProps) {
  if (!selectedNode) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-sm p-4">
        Click an agent node to inspect
      </div>
    )
  }

  const nodeEvents = events.filter(e => e.agent === selectedNode.id)
  const duration = selectedNode.completedAt
    ? ((selectedNode.completedAt - selectedNode.startedAt) / 1000).toFixed(0) + 's'
    : 'running...'

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: STATUS_COLORS[selectedNode.status] }} />
          <h3 className="font-semibold text-sm">{selectedNode.name}</h3>
        </div>
        <div className="text-xs text-gray-400 mt-1">
          <div>{selectedNode.status} · {duration}</div>
          <div>{selectedNode.sessionId}</div>
        </div>
      </div>

      {(selectedNode.tasksCompleted > 0 || selectedNode.tasksFailed > 0) && (
        <div className="mb-4 p-2 bg-gray-900 rounded text-xs">
          <div>✓ Completed: {selectedNode.tasksCompleted}</div>
          <div>✗ Failed: {selectedNode.tasksFailed}</div>
        </div>
      )}

      <div className="text-xs font-semibold uppercase text-gray-500 mb-2">Events ({nodeEvents.length})</div>
      <div>
        {nodeEvents.length === 0 && <div className="text-gray-500 text-xs">No events yet</div>}
        {nodeEvents.map(evt => <EventRow key={evt.id} event={evt} />)}
      </div>
    </div>
  )
}
