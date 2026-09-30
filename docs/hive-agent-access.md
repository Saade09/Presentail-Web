# Hive agent access

Presentail Hive agents can hand a coding task to Claude Code in this repository through
`.github/workflows/claude-task.yml` (`workflow_dispatch`). The job checks out `main`, makes the
change on a new branch and opens a pull request. It never merges and never publishes: a person
reviews and merges every change.

Verified 2026-09-30 by a connection test dispatched from Hive.
