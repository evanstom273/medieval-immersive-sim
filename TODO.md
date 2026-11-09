# To do

Things agreed to come back to later. Design decisions themselves live in DESIGN_LOG.md.

## Senses: waking up

*Added 2026-11-09 02:00 UTC*

- **Wake people by what a sound is like, not by what type it is.** Today waking uses a table by noise type (shouts, thuds and fighting can wake you; footsteps and chatter never do). Instead: how loud it is where they're lying, and how alarming or out of place it is. New sounds (a baby crying, say) then wake people without needing their own rule.
- **Let everyone sleep and be woken, not just the player.** Waking is currently built around the player's wait and sleep; nobody else's sleep can be interrupted.
- Babies crying and waking people should come out of these systems (a baby's unmet needs → crying → a loud noise → whoever hears it reacts by their own rules), not be scripted. Being attuned to someone (a parent waking for their own baby but sleeping through other noise) could later be a per-listener trait.

## Performance: smooth out world ticks

*Added 2026-11-09 02:10 UTC*

- **Stagger brains and senses across movement steps.** Since the fixed tick rates, everyone thinks on the same step (every third movement step), so those frames carry the whole crowd at once. 2000-person run on the phone (01:44 UTC): average 59.8 FPS and less work overall than before, but about 1 frame in 5 runs over 25 ms (p95 31 ms, was 21 ms). Splitting people into three groups, one per step, keeps everyone at 20 thinks a second without the lump. Not urgent: it isn't running badly.
