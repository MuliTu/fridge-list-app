import { render, screen, waitFor } from '@testing-library/react'
import { ChangelogModal } from '../../src/components/ChangelogModal'
import { getReleases } from '../../src/lib/firebase'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key
  })
}))

jest.mock('../../src/lib/firebase', () => ({
  getReleases: jest.fn()
}))

describe('ChangelogModal', () => {
  beforeEach(() => {
    ;(getReleases as jest.Mock).mockReset()
  })

  it('shows a loading state before releases arrive', () => {
    ;(getReleases as jest.Mock).mockReturnValue(new Promise(() => {}))
    render(<ChangelogModal onClose={jest.fn()} />)

    expect(screen.getByText('loading')).toBeInTheDocument()
  })

  it('renders each release once loaded', async () => {
    ;(getReleases as jest.Mock).mockResolvedValue([
      { tag_name: 'v2.36.0', name: 'v2.36.0', published_at: '2026-07-17T00:00:00Z', body: '### Added\n- did a thing' },
      { tag_name: 'v2.35.0', name: 'v2.35.0', published_at: '2026-07-17T00:00:00Z', body: '### Fixed\n- fixed a thing' }
    ])
    render(<ChangelogModal onClose={jest.fn()} />)

    await waitFor(() => expect(screen.getByText('v2.36.0')).toBeInTheDocument())
    expect(screen.getByText('v2.35.0')).toBeInTheDocument()
    expect(screen.getByText('did a thing')).toBeInTheDocument()
    expect(screen.getByText('fixed a thing')).toBeInTheDocument()
  })

  it('shows an error message when fetching releases fails', async () => {
    ;(getReleases as jest.Mock).mockRejectedValue(new Error('network error'))
    render(<ChangelogModal onClose={jest.fn()} />)

    await waitFor(() => expect(screen.getByText('loadError')).toBeInTheDocument())
  })
})
