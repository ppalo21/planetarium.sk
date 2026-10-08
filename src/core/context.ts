import * as THREE from 'three';

/** Rozhranie každého modulu (zážitku) appky. */
export interface Module {
  /** zobraziť hviezdne pozadie vo VR */
  stars?: boolean;
  /** vlastná farba pozadia vo VR (inak tmavomodrá obloha) */
  bg?: THREE.Color;
  /** zobraziť podlahovú mriežku vo VR */
  floor?: boolean;
  built?: boolean;
  build(): void;
  enter(arg?: unknown): void | Promise<void>;
  exit(): void;
  update?(dt: number, t: number): void;
  hud?(): void;
  relabel?(): void;
  onTap?(): void;
  onDrag?(dx: number, start: number): void;
  dragStart?(): number;
  /** okuliare zložené z hlavy / znova nasadené */
  onVisibility?(visible: boolean): void;
}

export type Txt = string | { sk: string; en?: string };

/** Zdieľaný stav appky – sprístupnený všetkým modulom. */
export const ctx = {
  renderer: null as unknown as THREE.WebGLRenderer,
  scene: null as unknown as THREE.Scene,
  camera: null as unknown as THREE.PerspectiveCamera,
  /** skupina pri hlave návštevníka (natočená podľa jeho pohľadu pri vycentrovaní) */
  anchor: null as unknown as THREE.Group,
  /** skupina na podlahe pod návštevníkom */
  floor: null as unknown as THREE.Group,
  isAR: false,
  current: '' as string,
  modules: {} as Record<string, Module>,
  content: {} as any,
  lastAct: performance.now(),
  goTo: (_id: string, _arg?: unknown) => {},
  goHome: () => {},
  recenter: () => {},
  startVisitor: () => {},
  /** kam sa pokračuje po úvodnom videu */
  afterIntro: () => {}
};

export const D2R = Math.PI / 180;
export const ASSET = {
  milky: 'assets/pano/mliecna-cesta.jpg',
  planets: 'assets/planety/',
  models: 'assets/modely/'
};
/** absolútna adresa súboru v priečinku appky (fungujú aj z web workerov) */
export const url = (p: string) => new URL(p, document.baseURI).href;
