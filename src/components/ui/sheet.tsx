import * as React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from 'lucide-react'
import { cn } from '../../lib/utils'

// A slide-in edge-anchored panel (sidebar/drawer), built on the same
// @radix-ui/react-dialog primitive as ./dialog.tsx — this gets us focus trapping,
// Escape-to-close, and close-on-outside-tap for free, matching the ticket's "closes
// on outside-tap" requirement with no custom event listeners.
const Sheet = DialogPrimitive.Root
const SheetTrigger = DialogPrimitive.Trigger
const SheetPortal = DialogPrimitive.Portal
const SheetClose = DialogPrimitive.Close

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay ref={ref} className={cn('sidebar-overlay', className)} {...props} />
))
SheetOverlay.displayName = DialogPrimitive.Overlay.displayName

// Anchored via inset-inline-end + margin-inline-end (see `.sidebar-panel` in
// App.css), not translateX — logical CSS properties auto-mirror the slide-in edge
// for RTL (Hebrew, default) vs LTR (English) with zero JS/dir branching.
const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { closeLabel: string; hideClose?: boolean }
>(({ className, children, closeLabel, hideClose, ...props }, ref) => (
  <SheetPortal>
    <SheetOverlay />
    <DialogPrimitive.Content ref={ref} className={cn('sidebar-panel', className)} {...props}>
      {children}
      {/* Skippable (see `hideClose`, mirrors DialogContent's own prop): when the
          element that opened this sheet stays reachable and visible above it (this
          app's usage keeps its hamburger trigger elevated above the overlay, see
          Layout.tsx), an extra in-panel close button ends up fighting the trigger
          for the exact same corner of screen real estate — confirmed directly on a
          narrow/mobile viewport, where the two visually overlapped into one
          unreadable icon. */}
      {!hideClose && (
        <DialogPrimitive.Close className="sidebar-close-btn" aria-label={closeLabel}>
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </SheetPortal>
))
SheetContent.displayName = DialogPrimitive.Content.displayName

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('sidebar-header', className)} {...props} />
)

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title ref={ref} className={cn('sidebar-title', className)} {...props} />
))
SheetTitle.displayName = DialogPrimitive.Title.displayName

export { Sheet, SheetTrigger, SheetPortal, SheetClose, SheetOverlay, SheetContent, SheetHeader, SheetTitle }
