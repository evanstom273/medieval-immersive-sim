import Phaser from 'phaser';
import { MovementTestScene } from './scenes/MovementTestScene';

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: '#1c1b19',
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth,
      height: parent.clientHeight,
    },
    render: {
      antialias: true,
      roundPixels: true,
    },
    physics: {
      default: 'arcade',
      arcade: { debug: false },
    },
    scene: [MovementTestScene],
  });
}
