// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../lib/supabase', () => ({ supabase: {} }))

const { SideTrainer } = await import('./SideTrainer')

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('SideTrainer', () => {
  it('trainernaam, level en titel zoals Home ze onthield; e-mail alleen als tooltip', () => {
    localStorage.setItem('dexcrate:trainer-level', '12')
    localStorage.setItem('dexcrate:badges-earned', 'boulder,cascade')
    render(<SideTrainer email="misty.waterflower@example.com" />)
    const link = screen.getByRole('link', { name: /Misty/ })
    expect(link.getAttribute('href')).toBe('#/overview')
    expect(link.getAttribute('title')).toBe('misty.waterflower@example.com')
    expect(link.textContent).toBe('MistyLv. 12Ace Trainer')
    expect(screen.getByRole('button', { name: /Your partner/ })).toBeTruthy()
  })

  it('nog niets onthouden (of rommel): geen level, beginnerstitel', () => {
    localStorage.setItem('dexcrate:trainer-level', 'abc')
    render(<SideTrainer email={null} />)
    expect(screen.getByRole('link').textContent).toBe('TrainerYoungster')
  })
})
