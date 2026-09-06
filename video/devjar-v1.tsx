import {TransitionSeries, linearTiming} from '@remotion/transitions';
import {fade} from '@remotion/transitions/fade';
import {slide} from '@remotion/transitions/slide';
import {FinalScene} from './scenes/final-scene';
import {LaunchScene} from './scenes/launch-scene';
import {LiveScene} from './scenes/live-scene';
import {ShipScene} from './scenes/ship-scene';

export const DevjarV1: React.FC = () => (
  <TransitionSeries>
    <TransitionSeries.Sequence durationInFrames={78} name="Launch"><LaunchScene /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({direction: 'from-right'})} timing={linearTiming({durationInFrames: 12})} />
    <TransitionSeries.Sequence durationInFrames={102} name="Live edit"><LiveScene /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={slide({direction: 'from-bottom'})} timing={linearTiming({durationInFrames: 12})} />
    <TransitionSeries.Sequence durationInFrames={80} name="Static export"><ShipScene /></TransitionSeries.Sequence>
    <TransitionSeries.Transition presentation={fade()} timing={linearTiming({durationInFrames: 12})} />
    <TransitionSeries.Sequence durationInFrames={76} name="End card"><FinalScene /></TransitionSeries.Sequence>
  </TransitionSeries>
);
