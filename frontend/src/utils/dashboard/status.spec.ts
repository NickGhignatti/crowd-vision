import { describe, expect, it } from 'vitest'
import { getStatusByOccupants, isAlertStatus, statusTone } from './status.ts'

describe('the occupancy status of a room', () => {
  it.each([
    [0, 'empty'],
    [5, 'normal'],
    [9, 'crowded'],
    [10, 'full'],
    [11, 'overcrowded'],
  ])('%i people in a room for 10 reads %s', (people, status) => {
    expect(getStatusByOccupants(people, 10)).toBe(`dashboard.table.rooms.status.${status}`)
  })
})

describe('how a status is shown', () => {
  it.each([
    ['empty', 'neutral'],
    ['normal', 'success'],
    ['crowded', 'warning'],
    ['full', 'danger'],
    ['overcrowded', 'danger'],
  ])('%s reads as %s', (status, tone) => {
    expect(statusTone(`dashboard.table.rooms.status.${status}`)).toBe(tone)
  })

  it('reads an unknown status as neutral', () => {
    expect(statusTone('')).toBe('neutral')
  })
})

describe('which statuses raise an alert', () => {
  it('only a full or overcrowded room', () => {
    expect(isAlertStatus('dashboard.table.rooms.status.full')).toBe(true)
    expect(isAlertStatus('dashboard.table.rooms.status.overcrowded')).toBe(true)
    expect(isAlertStatus('dashboard.table.rooms.status.crowded')).toBe(false)
  })
})
