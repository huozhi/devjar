import {Composition, Folder} from 'remotion';
import {DevjarV1} from './devjar-v1';
import {FinalScene} from './scenes/final-scene';
import {LaunchScene} from './scenes/launch-scene';
import {LiveScene} from './scenes/live-scene';
import {ShipScene} from './scenes/ship-scene';

export const DevjarCompositions: React.FC = () => (
  <>
    <Folder name="devjar-v1-scenes">
      <Composition id="launch" component={LaunchScene} durationInFrames={78} fps={30} width={1920} height={1080} />
      <Composition id="live" component={LiveScene} durationInFrames={102} fps={30} width={1920} height={1080} />
      <Composition id="ship" component={ShipScene} durationInFrames={80} fps={30} width={1920} height={1080} />
      <Composition id="final" component={FinalScene} durationInFrames={76} fps={30} width={1920} height={1080} />
    </Folder>
    <Composition id="devjar-v1" component={DevjarV1} durationInFrames={300} fps={30} width={1920} height={1080} />
  </>
);
