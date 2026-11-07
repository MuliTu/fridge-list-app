import { ApplicationError, type RequestContext } from '../../shared'

export interface ListDeletionRepository {
  deleteCustomList(input: {
    listId: string
    listName: string
    actorUid: string
  }): Promise<{ deletedItems: number }>
}

const invalidFirebaseKey = /[.#$/[\]\u0000-\u001f\u007f]/

const boundedKey = (value: string, field: string): string => {
  if (!value || value.length > 200 || value.trim() !== value || invalidFirebaseKey.test(value)) {
    throw new ApplicationError('invalid_input', `${field} is invalid`)
  }
  return value
}

const boundedListName = (value: unknown): string => {
  if (typeof value !== 'string') throw new ApplicationError('invalid_input', 'listName is required')
  const name = value.trim()
  if (!name || name.length > 120 || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new ApplicationError('invalid_input', 'listName is invalid')
  }
  return name
}

export class ListDeletionService {
  constructor(private readonly repository: ListDeletionRepository) {}

  async delete(context: RequestContext, listId: string, listName: unknown): Promise<{ deletedItems: number }> {
    if (context.principal.kind !== 'user') {
      throw new ApplicationError('forbidden', 'Only signed-in users can delete a shopping list')
    }
    return this.repository.deleteCustomList({
      listId: boundedKey(listId, 'listId'),
      listName: boundedListName(listName),
      actorUid: boundedKey(context.principal.uid, 'uid')
    })
  }
}
