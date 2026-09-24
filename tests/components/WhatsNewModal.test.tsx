import { render, screen } from '@testing-library/react'
import { WhatsNewModal } from '../../src/components/WhatsNewModal'
import { useWhatsNew } from '../../src/hooks/useWhatsNew'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}:${JSON.stringify(opts)}` : key
  })
}))

jest.mock('../../src/hooks/useWhatsNew', () => ({
  useWhatsNew: jest.fn()
}))

describe('WhatsNewModal', () => {
  it('shows the empty state when nothing has been published yet', () => {
    ;(useWhatsNew as jest.Mock).mockReturnValue({ whatsNew: null })
    render(<WhatsNewModal onClose={jest.fn()} />)

    expect(screen.getByText('empty')).toBeInTheDocument()
  })

  it('renders the version and each update once loaded', () => {
    ;(useWhatsNew as jest.Mock).mockReturnValue({
      whatsNew: { version: '2.38.0', updates: ['first update', 'second update'] }
    })
    render(<WhatsNewModal onClose={jest.fn()} />)

    expect(screen.getByText('versionLabel:{"version":"2.38.0"}')).toBeInTheDocument()
    expect(screen.getByText('first update')).toBeInTheDocument()
    expect(screen.getByText('second update')).toBeInTheDocument()
  })
})
