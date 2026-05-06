import { expect, test } from 'bun:test'
import { ToolTimer } from '../src/toolTiming.js'

test('tracks overlapping tools independently when call ids are available', () => {
  const timer = new ToolTimer()

  timer.start('session-a', 'bash', 'call-1', 1000)
  timer.start('session-a', 'bash', 'call-2', 1500)

  expect(timer.end('session-a', 'bash', 'call-2', 2200)).toBe(700)
  expect(timer.end('session-a', 'bash', 'call-1', 2600)).toBe(1600)
})

test('falls back to oldest start time for tools without call ids', () => {
  const timer = new ToolTimer()

  timer.start('session-a', 'edit', undefined, 1000)
  timer.start('session-a', 'edit', undefined, 1300)

  expect(timer.end('session-a', 'edit', undefined, 1800)).toBe(800)
  expect(timer.end('session-a', 'edit', undefined, 2100)).toBe(800)
})
