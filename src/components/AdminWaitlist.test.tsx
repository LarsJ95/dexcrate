// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const m = vi.hoisted(() => ({
  getWaitlist: vi.fn(),
  markWaitlistInvited: vi.fn(),
  removeFromWaitlist: vi.fn(),
  inviteUser: vi.fn(),
}))
vi.mock('../lib/admin', async (orig) => ({ ...(await orig<typeof import('../lib/admin')>()), getWaitlist: m.getWaitlist, markWaitlistInvited: m.markWaitlistInvited, removeFromWaitlist: m.removeFromWaitlist }))
vi.mock('../lib/adminUsers', () => ({ inviteUser: m.inviteUser, deleteUser: vi.fn(), setBlocked: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: {} }))
const { WaitlistPanel } = await import('./AdminWaitlist')
const { MissingStepError } = await import('../lib/admin')

const LIST = [
  { id: 'w1', email: 'misty@example.com', collects: 'Water types', createdAt: '2026-10-25T09:00:00Z', invitedAt: null },
  { id: 'w2', email: 'brock@example.com', collects: null, createdAt: '2026-10-25T10:00:00Z', invitedAt: '2026-10-25T11:00:00Z' },
]

beforeEach(() => {
  for (const f of Object.values(m)) f.mockReset()
  m.getWaitlist.mockResolvedValue(LIST)
  m.inviteUser.mockResolvedValue(undefined)
  m.markWaitlistInvited.mockResolvedValue(undefined)
  m.removeFromWaitlist.mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('WaitlistPanel', () => {
  it('lijst met wachtenden; uitgenodigde zonder Invite-knop', async () => {
    render(<WaitlistPanel onInvited={() => {}} />)
    expect(await screen.findByText('misty@example.com')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Waitlist (1 waiting)' })).toBeTruthy()
    expect(screen.getByText('Water types')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Invite' })).toHaveLength(1)
  })

  it('Invite: uitnodiging versturen, dan markeren', async () => {
    const onInvited = vi.fn()
    render(<WaitlistPanel onInvited={onInvited} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Invite' }))
    await waitFor(() => expect(m.markWaitlistInvited).toHaveBeenCalledWith('w1'))
    expect(m.inviteUser).toHaveBeenCalledWith('misty@example.com')
    expect(m.inviteUser.mock.invocationCallOrder[0]).toBeLessThan(m.markWaitlistInvited.mock.invocationCallOrder[0])
    expect(await screen.findByText('Invitation sent to misty@example.com.')).toBeTruthy()
    expect(onInvited).toHaveBeenCalled()
  })

  it('uitnodigen mislukt: niet als uitgenodigd markeren', async () => {
    m.inviteUser.mockRejectedValue(new Error('Email rate limit exceeded'))
    render(<WaitlistPanel onInvited={() => {}} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Invite' }))
    expect(await screen.findByRole('alert')).toBeTruthy()
    expect(m.markWaitlistInvited).not.toHaveBeenCalled()
  })

  it('Remove pas na bevestigen', async () => {
    render(<WaitlistPanel onInvited={() => {}} />)
    await screen.findByText('misty@example.com')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0])
    expect(m.removeFromWaitlist).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Yes, remove' }))
    await waitFor(() => expect(m.removeFromWaitlist).toHaveBeenCalledWith('w1'))
  })

  it('zonder STAP32: zeg welke STAP', async () => {
    m.getWaitlist.mockRejectedValue(new MissingStepError('STAP32'))
    render(<WaitlistPanel onInvited={() => {}} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/STAP32/)
  })
})
