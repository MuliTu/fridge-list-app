# Share one shopping list

List sharing is available in the deployed application.

1. Open the shopping list you want to share.
2. Choose **Share this list**.
3. Enter the person's email address and choose **Add person**.
4. The invited person signs in with that verified email and opens the list under **Shared with me**.

Participants can view and edit only the selected shopping list. Other shopping lists, stock and receipts are not included. The owner can remove a participant from the same sharing dialog to revoke that list's access.

Participant photos appear beside the share button, with initials when a photo is unavailable. These show list membership, not online presence.

The recipient can add items, mark purchases, change urgency, edit item names and notes, and delete items within the invited list. Removing access prevents subsequent reads and edits. Open pages refresh automatically.

Verification included automated tests for cross-list read and edit isolation, revocation, ownership checks, and account signup. The deployed owner dialog was checked for participant loading and invitation-field availability. No invitations were sent to other people during this verification.
