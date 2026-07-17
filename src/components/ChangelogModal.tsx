import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getReleases, type ReleaseInfo } from '../lib/firebase'
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

// GitHub Release notes are written for engineers (see CLAUDE.md), not translated/
// localized — rendered as-is here since this view is for technical tracking, not end
// users. A tiny hand-rolled parser instead of pulling in a markdown dependency: release
// bodies only ever use #/##/### headers, "- " bullets (with indented continuation
// lines), **bold**, `code`, and [text](url) links — no fenced code blocks, tables, etc.
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
  const [releases, setReleases] = useState<ReleaseInfo[] | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    getReleases()
      .then(setReleases)
      .catch(() => setError(true))
  }, [])

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <p className="modal-note-readonly">{t('explanation')}</p>

        {error ? (
          <p className="modal-note-readonly">{t('loadError')}</p>
        ) : !releases ? (
          <p className="modal-note-readonly">{t('loading')}</p>
        ) : (
          <div className="changelog-body" dir="ltr">
            {releases.map((release) => (
              <div key={release.tag_name}>
                <h2>{release.name || release.tag_name}</h2>
                <div dangerouslySetInnerHTML={{ __html: renderChangelogHtml(release.body) }} />
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={onClose}>{t('common:actions.close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
