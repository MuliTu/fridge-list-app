import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '../components/ui/alert-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'

type ConfirmState = {
  message: string
  resolve: (value: boolean) => void
}

type PromptState = {
  message: string
  resolve: (value: string | null) => void
}

type AlertState = {
  message: string
  resolve: () => void
}

type DialogServiceValue = {
  confirm: (message: string) => Promise<boolean>
  prompt: (message: string, defaultValue?: string) => Promise<string | null>
  alert: (message: string) => Promise<void>
}

const DialogServiceContext = createContext<DialogServiceValue | null>(null)

export const useDialogService = () => {
  const ctx = useContext(DialogServiceContext)
  if (!ctx) throw new Error('useDialogService must be used within DialogServiceProvider')
  return ctx
}

// Themed, promise-based replacements for window.confirm/prompt/alert — those are
// OS-native popups that break out of the app's chalkboard styling entirely. Mounted
// once here so every call site just awaits a promise instead of each needing its own
// modal + state.
export const DialogServiceProvider = ({ children }: { children: ReactNode }) => {
  const { t } = useTranslation('common')
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [promptState, setPromptState] = useState<PromptState | null>(null)
  const [alertState, setAlertState] = useState<AlertState | null>(null)
  const [promptValue, setPromptValue] = useState('')

  const confirm = useCallback(
    (message: string) => new Promise<boolean>((resolve) => setConfirmState({ message, resolve })),
    []
  )

  const prompt = useCallback(
    (message: string, defaultValue = '') =>
      new Promise<string | null>((resolve) => {
        setPromptValue(defaultValue)
        setPromptState({ message, resolve })
      }),
    []
  )

  const alertFn = useCallback(
    (message: string) => new Promise<void>((resolve) => setAlertState({ message, resolve })),
    []
  )

  const resolveConfirm = (value: boolean) => {
    confirmState?.resolve(value)
    setConfirmState(null)
  }

  const resolvePrompt = (value: string | null) => {
    promptState?.resolve(value)
    setPromptState(null)
  }

  const resolveAlert = () => {
    alertState?.resolve()
    setAlertState(null)
  }

  return (
    <DialogServiceContext.Provider value={{ confirm, prompt, alert: alertFn }}>
      {children}

      <AlertDialog open={!!confirmState} onOpenChange={(open) => !open && resolveConfirm(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="sr-only">{t('actions.confirm')}</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-foreground">{confirmState?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resolveConfirm(false)}>{t('actions.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => resolveConfirm(true)}>{t('actions.confirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!promptState} onOpenChange={(open) => !open && resolvePrompt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="sr-only">{promptState?.message}</DialogTitle>
          </DialogHeader>
          <p className="modal-note-readonly">{promptState?.message}</p>
          <Input
            autoFocus
            value={promptValue}
            onChange={(e) => setPromptValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && resolvePrompt(promptValue)}
          />
          <DialogFooter>
            <Button variant="secondary" onClick={() => resolvePrompt(null)}>
              {t('actions.cancel')}
            </Button>
            <Button onClick={() => resolvePrompt(promptValue)}>{t('actions.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!alertState} onOpenChange={(open) => !open && resolveAlert()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="sr-only">{t('actions.ok')}</AlertDialogTitle>
            <AlertDialogDescription className="text-base text-foreground">{alertState?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={resolveAlert}>{t('actions.ok')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DialogServiceContext.Provider>
  )
}
