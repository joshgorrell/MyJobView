# Record deletion

When adding or changing deletion behavior, follow [the record deletion rule](docs/record-deletion-rule.md). Remove exclusively dependent notes, notifications, Flow snapshots, and read state transactionally. Preserve independent business records and existing deletion restrictions. Test cleanup, rollback, and organization isolation. New polymorphic references need an explicit deletion mapping; never rely only on frontend cleanup.
