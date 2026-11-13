# Duplicate scan rollout and backfill

The daily Vercel worker stays at 04:15 UTC. On Vercel Hobby it may run anywhere
in that hour, and subdaily native cron is not supported. The opt-in GitHub Actions
workflow calls the same worker every 10 minutes on the default branch; GitHub may
delay or drop scheduled runs. Vercel remains the fallback.
[Vercel limits](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) ·
[GitHub schedule constraints](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

1. Test the candidate against an isolated Firebase project with an unregistered
   list, an active duplicate pair and a bought item. Run the POST and GET below.
   Verify an authorized account can review the finding, an unrelated account
   cannot list findings, and rerunning preserves dismiss and keep-both decisions.
2. Review and deploy the candidate through the existing production release
   process. Confirm the deployment has the existing Firebase Admin credentials,
   `FIREBASE_DATABASE_URL` and `CRON_SECRET`. Check an unauthenticated request
   returns 401 and an authorized GET returns 200 with the expected job counts
   (an authorized GET processes real work).
3. To enable the faster trigger, create the GitHub Actions environment
   `duplicate-scan-worker`, limit it to the default branch, and set its secret
   `DUPLICATE_SCAN_CRON_SECRET` to the production Vercel `CRON_SECRET`. Set the
   repository Actions variable `DUPLICATE_SCAN_WORKER_URL` to the stable HTTPS
   production origin (no route suffix). Run **Duplicate scan worker** via
   **Run workflow** on the default branch; verify HTTP 200 and the job counts.
   A 409 means another invocation has the lease. Until this setup is complete,
   the app still uses the daily fallback.
4. Run the backfill from a trusted operator shell. Set `APP_ORIGIN` to the
   verified deployment and load `CRON_SECRET` securely without printing it.
   Start with a JSON `null` cursor. Run one page at a time and pass back exactly
   the returned `backfill.nextCursor`. If a call fails, retry the previous cursor;
   on 409, wait for the current worker or the three-minute lease to expire.
   Stop when the returned cursor is `null`. Keep any local cursor private:
   it may include a list key.

   ```bash
   worker="${APP_ORIGIN%/}/api/retry-grocery-duplicate-scans"
   cursor=${cursor:-null} # set cursor to the last saved nextCursor when resuming
   if response=$(curl --silent --show-error --fail --max-time 120 --proto '=https' \
     --write-out $'\n%{http_code}' \
     --header "Authorization: Bearer $CRON_SECRET" \
     --header 'Content-Type: application/json' --data "$cursor" "$worker") &&
     [[ ${response##*$'\n'} == 200 ]] &&
     next=$(jq -ers '
       def key:
         type == "string" and (utf8bytelength > 0 and utf8bytelength <= 768) and
         (explode | all(. > 31 and . != 127 and
           . != 35 and . != 36 and . != 46 and . != 47 and . != 91 and . != 93));
       def cursor:
         . == null or
         (type == "object" and (.listId | key) and
           (if has("itemId") then (.itemId | key) else true end));
       if length == 1 and (.[0] |
         type == "object" and .ok == true and
         (.backfill | type == "object" and has("nextCursor") and
           (.nextCursor | cursor) and
           (.queued | type == "number" and . >= 0 and . <= 25 and . == floor)))
       then .[0].backfill.nextCursor | tojson
       else error("invalid backfill response")
       end
     ' <<< "${response%$'\n'*}"); then
     cursor=$next
     jq '.backfill.queued' <<< "${response%$'\n'*}"
     if [[ $cursor == null ]]; then
       echo 'Backfill complete.'
     fi
   else
     echo 'Backfill page failed; previous cursor retained.' >&2
   fi
   ```

5. Let the scheduled worker drain, or run serial authorized GET requests to
   speed up a rollout. Each GET claims up to 10 jobs and rotates through at most
   10 registered lists. A zero-claim response is one batch, not proof of an
   empty queue. Confirm the ready markers for the backfilled lists have drained
   in the trusted Firebase console and monitor `failed` and exhausted jobs.
   Verify findings in an authorized account.

One POST considers at most 25 grocery keys in one list. It writes only the
list registration, jobs and queue markers. It includes previously registered
lists because a recent grocery insert may have registered a list with older
items still missing jobs. A newly queued item is checked again when the finding is
published. Existing jobs (including exhausted jobs), findings and personal
view decisions are preserved. Firebase returns the whole selected list during
list discovery and list transactions, and the matcher reads all groceries in
that list; watch latency and contention on unusually large lists. No scan
deletes groceries. To roll back, stop submitting POSTs, remove the GitHub
Actions URL variable to stop the supplemental trigger, and redeploy the prior
candidate if needed. Leave the additive job and finding records intact.


To verify cold clients without accessing a cloud project, start a local Realtime
Database emulator and run this command with its port (9000 in the demo config):

```bash
DUPLICATE_SCAN_EMULATOR_PORT=9000 npm test -- --runInBand firebaseDuplicateScanRepository.server.test.ts
```

The test uses a unique demo namespace on loopback. It checks numeric legacy
keys, replay, metadata preservation during backfill and drain, the retry limit,
and shared lease recovery with independent clients.
