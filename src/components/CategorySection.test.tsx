import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CategorySection from './CategorySection'

describe('CategorySection', () => {
  it('exposes collapse state and toggles from a real button', async () => {
    const onToggle = jest.fn()
    const user = userEvent.setup()
    render(
      <CategorySection name="ירקות" color="#84cc16" icon="🥦" collapsed={false} onToggle={onToggle}>
        <li>מלפפון</li>
      </CategorySection>
    )

    const trigger = screen.getByRole('button', { name: /ירקות/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('מלפפון')).toBeInTheDocument()

    await user.click(trigger)
    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('does not render collapsed content', () => {
    render(
      <CategorySection name="פירות" color="#f59e0b" icon="🍎" collapsed onToggle={jest.fn()}>
        <li>תפוח</li>
      </CategorySection>
    )
    expect(screen.getByRole('button', { name: /פירות/ })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('תפוח')).not.toBeInTheDocument()
  })

  it('shows the unchecked item counter in the category header', () => {
    render(
      <CategorySection
        name="Dairy"
        color="#84cc16"
        icon="🥛"
        uncheckedCount={3}
        uncheckedCountLabel="3 unchecked items"
        collapsed={false}
        onToggle={jest.fn()}
      >
        <li>Milk</li>
      </CategorySection>
    )

    expect(screen.getByLabelText('3 unchecked items')).toHaveTextContent('3')
  })
})
