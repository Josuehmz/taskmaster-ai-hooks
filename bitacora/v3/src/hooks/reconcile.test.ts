import { describe, expect, it } from 'vitest'
import { makeTask } from '../test/helpers'
import type { Task } from '../types'
import { applyChange, removeRow, sameRow, upsertRow, type Compare, type KeyOf } from './reconcile'

const keyOf: KeyOf<Task> = (row) => row.id ?? null
const byCreated: Compare<Task> = (a, b) => a.created_at.localeCompare(b.created_at)
const version = (row: Task) => Date.parse(row.updated_at)

describe('reconcile', () => {
  it('upsertRow inserta, reemplaza por clave y es idempotente', () => {
    const a = makeTask()
    const b = makeTask()
    const once = upsertRow([a], b, keyOf, byCreated)
    expect(once).toEqual([a, b])
    expect(upsertRow(once, b, keyOf, byCreated)).toBe(once) // mismo arreglo: sin render
    const renamed = { ...b, title: 'Nuevo' }
    expect(upsertRow(once, renamed, keyOf, byCreated)).toEqual([a, renamed])
  })

  it('sameRow ignora el orden de las columnas (payload Realtime frente a respuesta HTTP)', () => {
    const task = makeTask()
    const reordered = Object.fromEntries(Object.entries(task).reverse()) as Task
    expect(sameRow(task, reordered)).toBe(true)
  })

  it('removeRow devuelve el mismo arreglo si la clave no está', () => {
    const rows = [makeTask()]
    expect(removeRow(rows, 'otra', keyOf)).toBe(rows)
  })

  it('applyChange: DELETE con solo la clave primaria quita la fila', () => {
    const a = makeTask()
    const result = applyChange([a], { type: 'DELETE', old: { id: a.id } }, keyOf, byCreated)
    expect(result.data).toEqual([])
    expect(result.row).toEqual(a)
  })

  it('applyChange: DELETE de una fila ajena es un no-op', () => {
    const rows = [makeTask()]
    const result = applyChange(rows, { type: 'DELETE', old: { id: crypto.randomUUID() } }, keyOf, byCreated)
    expect(result.data).toBe(rows)
    expect(result.row).toBeNull()
  })

  it('applyChange: descarta un UPDATE más viejo que la fila actual', () => {
    const current = makeTask({ updated_at: '2026-11-10T12:00:10.000Z' })
    const stale = { ...current, title: 'viejo', updated_at: '2026-11-10T12:00:05.000Z' }
    const result = applyChange([current], { type: 'UPDATE', row: stale }, keyOf, byCreated, version)
    expect(result.data).toEqual([current])
    expect(result.row).toBeNull()
  })
})
