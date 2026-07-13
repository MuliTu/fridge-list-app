import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

// A slide-in edge-anchored panel (sidebar/drawer), built on the same
// @radix-ui/react-dialog primitive as ./dialog.tsx — this gets us focus trapping,
// Escape-to-close, and close-on-outside-tap for free, matching the ticket's "closes
// on outside-tap" requirement with no custom event listeners. Styled entirely with
// Tailwind utility classes (matching dialog.tsx's own convention), no custom CSS.
const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetPortal = DialogPrimitive.Portal
const SheetClose = DialogPrimitive.Close

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('fixed inset-0 z-[29] bg-black/50', className)} {...props} />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

// Anchored via inset-y-0/end-0 + a margin-inline-end transition (not translateX) —
// logical properties auto-mirror the slide-in edge for RTL (Hebrew, default) vs LTR
// (English) with zero JS/dir branching.
// pt-20 clears the fixed-above hamburger/language-switch row (.user-chip, z-index 35
// per Layout.tsx — kept above the sidebar so tapping it again still closes it): that
// row's real bottom edge measures ~70px, so 80px (Tailwind's `20` spacing step)
// leaves a small margin. Confirmed directly — without this the sidebar's own title
// rendered right underneath the header, visually overlapping it.
const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { closeLabel: string; hideClose?: boolean }
>(({ className, children, closeLabel, hideClose, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed inset-y-0 end-0 z-30 flex w-[min(300px,86vw)] flex-col gap-0.5 overflow-y-auto',
        'bg-background text-foreground shadow-[inset_0_0_0_3px_rgba(244,241,232,0.06)]',
        "pt-20 px-[18px] pb-[calc(18px+env(safe-area-inset-bottom,0px))] font-['Rubik',sans-serif]",
        'transition-[margin-inline-end,opacity] duration-[250ms] ease-in-out',
        'data-[state=closed]:me-[min(-300px,-86vw)] data-[state=closed]:opacity-0 data-[state=closed]:pointer-events-none',
        'data-[state=open]:me-0 data-[state=open]:opacity-100',
        className
      )}
      {...props}
    >
      {children}
      {/* Skippable (see `hideClose`, mirrors DialogContent's own prop): when the
          element that opened this sheet stays reachable and visible above it (this
          app's usage keeps its hamburger trigger elevated above the overlay, see
          Layout.tsx), an extra in-panel close button ends up fighting the trigger
          for the exact same corner of screen real estate — confirmed directly on a
          narrow/mobile viewport, where the two visually overlapped into one
          unreadable icon. */}
      {!hideClose && (
        <DialogPrimitive.Close
          className="absolute end-[18px] top-[18px] flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-white/20 text-muted-foreground"
          aria-label={closeLabel}
        >
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mb-2 flex items-center', className)} {...props} />
)

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("m-0 text-[17px] font-normal text-foreground font-['Secular_One',sans-serif]", className)}
    {...props}
  />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

export { Sheet, SheetTrigger, SheetPortal, SheetClose, SheetOverlay, SheetContent, SheetHeader, SheetTitle }
