# Flow unread badges follow-up

Current notification badge implementation is preliminary. It counts unread `notifications` records for Messages, Assignments, and Voicemails, not necessarily unread conversation messages or pending assignments. `All` remains based on unread Flow events to avoid duplicate counts, so it is not yet the union of the other tabs. Notification fetch has a 1,000-row cap. Keep this PR draft until counts, read-state synchronization, and automated UI tests are verified.
