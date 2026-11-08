import { useEffect, useRef } from 'react';
import { createGame } from './game/createGame';
import { Hud } from './ui/Hud';
import { PortraitBar } from './ui/PortraitBar';
import { RadialMenu } from './ui/RadialMenu';
import { TouchControls } from './ui/TouchControls';
import { TuningPanel } from './ui/TuningPanel';

export function App() {
  const gameRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const game = createGame(gameRef.current!);
    // Dev-only handle for poking at the game from the console or automated checks.
    if (import.meta.env.DEV) (window as unknown as { __game?: unknown }).__game = game;
    return () => game.destroy(true);
  }, []);

  return (
    <div className="relative h-full w-full">
      <div ref={gameRef} className="absolute inset-0" />
      <Hud />
      <TouchControls />
      <PortraitBar />
      <TuningPanel />
      <RadialMenu />
    </div>
  );
}
