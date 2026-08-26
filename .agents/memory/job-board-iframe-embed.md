---
name: JazzHR/applytojob.com job board iframe embed
description: Constraint discovered embedding the presentail.applytojob.com job board on the Careers page.
---

The company's live job board (`presentail.applytojob.com/apply/jobs/`, JazzHR/Resumator) has no
cross-origin resize cooperation: its own resize script only handles its *internal* same-origin iframe and
never `postMessage`s a height to an embedding parent, with or without `?embed=`/`?widget=` query params.

**Why it matters:** a client-side postMessage/global-handler listener on our side will never fire unless
the vendor changes this. Sizing the embed to fit its actual current content requires measuring it another
way (e.g. server-side), not waiting on vendor cooperation.
