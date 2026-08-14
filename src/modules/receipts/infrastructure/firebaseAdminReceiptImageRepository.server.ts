import type { Firestore } from 'firebase-admin/firestore'
import type { ImageRepository, ReceiptImageRecord } from '../application/receiptPersistence'

export class FirebaseAdminReceiptImageRepository implements ImageRepository {
  constructor(private readonly firestore: Pick<Firestore, 'collection'>) {}
  private doc(id: string) { return this.firestore.collection('receiptImages').doc(id) }
  async save(imageId: string, image: ReceiptImageRecord) { await this.doc(imageId).set(image) }
  async find(imageId: string) {
    const snapshot = await this.doc(imageId).get()
    return snapshot.exists ? snapshot.data() as ReceiptImageRecord : null
  }
  async delete(imageId: string) { await this.doc(imageId).delete() }
}
