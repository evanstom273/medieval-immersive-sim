import { useEffect, useRef } from 'react';
import { createGame, sceneFromUrl } from './game/createGame';
import { Hud } from './ui/Hud';
import { BottomBar } from './ui/BottomBar';
import { SwitchCard } from './ui/SwitchCard';
import { RadialMenu } from './ui/RadialMenu';
import { RestDialog } from './ui/RestDialog';
import { TouchControls } from './ui/TouchControls';
import { TuningPanel } from './ui/TuningPanel';
import { PerfHud } from './ui/PerfHud';

export function App() {
  const scene = sceneFromUrl();
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = createGame(gameRef.current!, scene);
    // Dev-only handle for poking at the game from the console or automated checks.
    if (import.meta.env.DEV) (window as unknown as { __game?: unknown }).__game = game;
    return () => game.destroy(true);
  }, [scene]);

  return (
    <div className="relative h-full w-full">
      <div ref={gameRef} className="absolute inset-0" />
      <Hud />
      <TouchControls />
      {/* The perf scene has its own HUD instead of the household bar (which isn't built for hundreds of people). */}
      {scene === 'perf' ? <PerfHud /> : <BottomBar />}
      <TuningPanel perf={scene === 'perf'} />
      <RadialMenu />
      <SwitchCard />
      <RestDialog />
    </div>
  );
}
