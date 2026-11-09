import { useEffect, useRef, useState } from 'react';
import { createGame, sceneFromUrl } from './game/createGame';
import { Hud } from './ui/Hud';
import { BottomBar } from './ui/BottomBar';
import { SwitchCard } from './ui/SwitchCard';
import { RadialMenu } from './ui/RadialMenu';
import { RestDialog } from './ui/RestDialog';
import { TouchControls } from './ui/TouchControls';
import { TuningPanel } from './ui/TuningPanel';
import { PerfHud } from './ui/PerfHud';
import { CharacterCreator } from './ui/CharacterCreator';
import { loadNewPerson, saveNewPerson, type NewPerson } from './game/characters/newPerson';
import { gameRestart } from './game/bridge';
import { FloorButtons } from './ui/Hud';
import { WaypointArrow, WorldMap } from './ui/WorldMap';

export function App() {
  const scene = sceneFromUrl();
  const gameRef = useRef<HTMLDivElement>(null);
  // The sandbox starts with character creation; the perf test doesn't.
  const [newPerson, setNewPerson] = useState<NewPerson | null>(null);
  const ready = scene === 'perf' || newPerson !== null;
  // Bumped to rebuild the game (same person, fresh world).
  const [generation, setGeneration] = useState(0);
  useEffect(() => gameRestart.on(() => setGeneration((g) => g + 1)), []);

  useEffect(() => {
    if (!ready) return;
    const game = createGame(gameRef.current!, scene, newPerson ?? undefined);
    // Dev-only handle for poking at the game from the console or automated checks.
    if (import.meta.env.DEV) (window as unknown as { __game?: unknown }).__game = game;
    return () => game.destroy(true);
  }, [scene, ready, newPerson, generation]);

  if (!ready) {
    return (
      <CharacterCreator
        initial={loadNewPerson()}
        onDone={(p) => {
          saveNewPerson(p);
          setNewPerson(p);
        }}
      />
    );
  }

  return (
    <div className="relative h-full w-full">
      <div ref={gameRef} className="absolute inset-0" />
      <Hud />
      <TouchControls />
      {/* Above the touch layer (which covers the whole screen), like the bottom bar. */}
      <FloorButtons />
      <WaypointArrow />
      {/* The perf scene has its own HUD instead of the household bar (which isn't built for hundreds of people). */}
      {scene === 'perf' ? <PerfHud /> : <BottomBar />}
      <TuningPanel perf={scene === 'perf'} />
      <RadialMenu />
      <SwitchCard />
      <RestDialog />
      <WorldMap />
    </div>
  );
}
