/** @jest-environment node */

jest.mock('@tanstack/react-start/server-only', () => ({}), { virtual: true })

import type { Database } from 'firebase-admin/database'

import { FirebaseAdminSemanticGroceryRepository } from './firebaseAdminSemanticGroceryRepository.server'

describe('FirebaseAdminSemanticGroceryRepository', () => {
  it('reads only the selected list path and preserves active, purchased, hidden, and collapsed candidates', async () => {
    const get = jest.fn().mockResolvedValue({
      val: () => ({
        active: { item: 'Milk', category: 'Dairy', bought: false },
        purchased: { item: 'Eggs', category: 'Dairy', bought: true },
        hidden: { item: 'Bread', category: 'Bakery', hidden: true },
        collapsed: { item: 'Apples', category: 'Produce', section_collapsed: true },
        malformed: { category: 'Other' }
      })
    })
    const ref = jest.fn().mockReturnValue({ get })
    const repository = new FirebaseAdminSemanticGroceryRepository({ ref } as unknown as Database)

    await expect(repository.listCandidates('selected-list')).resolves.toEqual([
      expect.objectContaining({ id: 'active', bought: false, hidden: false, collapsed: false }),
      expect.objectContaining({ id: 'purchased', bought: true }),
      expect.objectContaining({ id: 'hidden', hidden: true }),
      expect.objectContaining({ id: 'collapsed', collapsed: true })
    ])
    expect(ref).toHaveBeenCalledWith('users/selected-list/groceries')
    expect(ref).not.toHaveBeenCalledWith(expect.stringContaining('other-list'))
  })

  it('rejects unsafe list IDs before Firebase access', async () => {
    const ref = jest.fn()
    const repository = new FirebaseAdminSemanticGroceryRepository({ ref } as unknown as Database)

    await expect(repository.listCandidates('../other-list')).rejects.toMatchObject({ code: 'invalid_input' })
    expect(ref).not.toHaveBeenCalled()
  })
})
