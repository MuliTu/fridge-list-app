import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-60 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 font-['Rubik',sans-serif]",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:opacity-90',
        secondary: 'bg-transparent text-secondary-foreground border border-border hover:bg-input',
        destructive: 'bg-transparent text-destructive border border-destructive/40 hover:bg-destructive/10',
        ghost: 'bg-transparent text-muted-foreground border border-border hover:bg-input',
        outline: 'bg-transparent text-foreground border border-border hover:bg-input',
        link: 'text-foreground underline-offset-4 hover:underline'
      },
      size: {
        default: 'h-10 px-5 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9 rounded-full'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
