# To do

Things agreed to come back to later. Design decisions themselves live in DESIGN_LOG.md.

## Senses: waking up

*Added 2026-11-09 02:00 UTC*

- **Wake people by what a sound is like, not by what type it is.** Today waking uses a table by noise type (shouts, thuds and fighting can wake you; footsteps and chatter never do). Instead: how loud it is where they're lying, and how alarming or out of place it is. New sounds (a baby crying, say) then wake people without needing their own rule.
- **Let everyone sleep and be woken, not just the player.** Waking is currently built around the player's wait and sleep; nobody else's sleep can be interrupted.
- Babies crying and waking people should come out of these systems (a baby's unmet needs → crying → a loud noise → whoever hears it reacts by their own rules), not be scripted. Being attuned to someone (a parent waking for their own baby but sleeping through other noise) could later be a per-listener trait.
