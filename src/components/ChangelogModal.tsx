import { useTranslation } from 'react-i18next'
import CHANGELOG_MD from '../../CHANGELOG.md?raw'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog'
import { Button } from './ui/button'

interface ChangelogModalProps {
  onClose: () => void
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const renderInline = (s: string) =>
  escapeHtml(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')

// CHANGELOG.md is written for engineers (see CLAUDE.md), not translated/localized —
// rendered as-is here since this view is for technical tracking, not end users.
// A tiny hand-rolled parser instead of pulling in a markdown dependency: the file
// only ever uses #/##/### headers, "- " bullets (with indented continuation lines),
// **bold**, `code`, and [text](url) links — no fenced code blocks, tables, etc.
const renderChangelogHtml = (markdown: string) => {
  let html = ''
  let inList = false
  const closeList = () => {
    if (inList) {
      html += '</ul>'
      inList = false
    }
  }

  for (const line of markdown.split('\n')) {
    if (/^###\s+/.test(line)) {
      closeList()
      html += `<h3>${renderInline(line.replace(/^###\s+/, ''))}</h3>`
    } else if (/^##\s+/.test(line)) {
      closeList()
      html += `<h2>${renderInline(line.replace(/^##\s+/, ''))}</h2>`
    } else if (/^#\s+/.test(line)) {
      closeList()
      html += `<h1>${renderInline(line.replace(/^#\s+/, ''))}</h1>`
    } else if (/^-\s+/.test(line)) {
      if (!inList) {
        html += '<ul>'
        inList = true
      }
      html += `<li>${renderInline(line.replace(/^-\s+/, ''))}</li>`
    } else if (inList && /^\s+\S/.test(line)) {
      html = html.replace(/<\/li>$/, ` ${renderInline(line.trim())}</li>`)
    } else if (line.trim() === '') {
      closeList()
    } else {
      closeList()
      html += `<p>${renderInline(line)}</p>`
    }
  }
  closeList()
  return html
}

export default function ChangelogModal({ onClose }: ChangelogModalProps) {
  const { t } = useTranslation('changelog')

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <p className="modal-note-readonly">{t('explanation')}</p>

        <div className="changelog-body" dir="ltr" dangerouslySetInnerHTML={{ __html: renderChangelogHtml(CHANGELOG_MD) }} />

        <DialogFooter>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
