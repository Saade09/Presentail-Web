---
name: Distributed job ownership
description: Safety rules for single-owner recurring work across scaled API replicas.
---

Use two layers for cross-replica recurring work: a durable database lease row
for due windows, fencing, metrics, and takeover state; plus a database session
lock held for the entire execution. Thread ownership loss into all loops and
network requests as an abort signal. Shared cache snapshots must be fenced to
the exact source window and generation. If either lease renewal or the session
lock is lost while work ignores cancellation, leave the durable row running and
terminate the process; never clear ownership and allow overlapping takeover.

**Why:** A renewable lease by itself allows a paused process to resume after
expiry while a replacement is already running. Fencing only the lease row
does not fence external calls, alerts, or order side effects. Process-local OS
caches also mean electing one refresher is unsafe unless followers can hydrate
the exact snapshot produced by that elected generation.

**How to apply:** Any new high-frequency or high-fan-out API worker should use
the shared distributed runner, consume its abort signal between items and in
bounded I/O, and use generation-fenced snapshots when work populates data that
other replicas need locally. Treat non-cooperative ownership loss as process
fatal; deadline cancellation may retain the session lock until work settles.