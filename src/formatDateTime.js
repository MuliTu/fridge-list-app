export const formatDateTime = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })
}
