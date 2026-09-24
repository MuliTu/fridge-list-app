import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { OnboardingModal } from '../../src/components/OnboardingModal'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

const STEP_COUNT = 7

describe('OnboardingModal', () => {
  it('starts on the welcome step', () => {
    render(<OnboardingModal onClose={jest.fn()} />)

    expect(screen.getByText('steps.welcome.title')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'back' })).not.toBeInTheDocument()
  })

  it('calls onClose(false) when skip is clicked, regardless of step', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<OnboardingModal onClose={onClose} />)

    await user.click(screen.getByRole('button', { name: 'skip' }))

    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('walks forward through every step to the last one, showing the dontShowAgain checkbox only there', async () => {
    const user = userEvent.setup()
    render(<OnboardingModal onClose={jest.fn()} />)

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument()

    for (let i = 0; i < STEP_COUNT - 1; i++) {
      await user.click(screen.getByRole('button', { name: 'next' }))
    }

    expect(screen.getByText('steps.receipts.title')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'next' })).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
  })

  it('back navigates to the previous step', async () => {
    const user = userEvent.setup()
    render(<OnboardingModal onClose={jest.fn()} />)

    await user.click(screen.getByRole('button', { name: 'next' }))
    expect(screen.getByText('steps.addItems.title')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'back' }))
    expect(screen.getByText('steps.welcome.title')).toBeInTheDocument()
  })

  it('finishing without checking the box calls onClose(false)', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<OnboardingModal onClose={onClose} />)

    for (let i = 0; i < STEP_COUNT - 1; i++) {
      await user.click(screen.getByRole('button', { name: 'next' }))
    }
    await user.click(screen.getByRole('button', { name: 'done' }))

    expect(onClose).toHaveBeenCalledWith(false)
  })

  it('checking dontShowAgain then finishing calls onClose(true)', async () => {
    const user = userEvent.setup()
    const onClose = jest.fn()
    render(<OnboardingModal onClose={onClose} />)

    for (let i = 0; i < STEP_COUNT - 1; i++) {
      await user.click(screen.getByRole('button', { name: 'next' }))
    }
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'done' }))

    expect(onClose).toHaveBeenCalledWith(true)
  })
})
