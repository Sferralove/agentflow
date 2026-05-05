import { memo } from 'react'
import { Handle, Position, type NodeProps } from 'reactflow'
import type { AgentNode as AgentNodeType } from '../types'
import { STATUS_COLORS } from '../types'

const AgentNodeComponent = ({ data, selected }: NodeProps<AgentNodeType>) => {
  const color = STATUS_COLORS[data.status]
  const icon = data.type === 'main' ? '🏗️' : '🤖'

  return (
    <div
      className={`px-4 py-2 rounded-xl border-2 text-white text-center min-w-[140px] transition-all duration-300 ${selected ? 'ring-2 ring-offset-2 ring-offset-gray-950' : ''}`}
      style={{ backgroundColor: color + '22', borderColor: color }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-500" />
      <div className="font-semibold text-sm">{icon} {data.name}</div>
      <div className="text-xs opacity-70 mt-1">
        {data.status}
        {data.tasksCompleted > 0 && ` · ${data.tasksCompleted}/${data.tasksCompleted + data.tasksFailed}`}
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500" />
    </div>
  )
}

export default memo(AgentNodeComponent)
