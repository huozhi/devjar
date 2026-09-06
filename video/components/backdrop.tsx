import {AbsoluteFill} from 'remotion';

export const Backdrop: React.FC<{dark?: boolean}> = ({dark = false}) => {
  return (
    <AbsoluteFill style={{overflow: 'hidden', backgroundColor: dark ? '#171717' : '#f8f6f1', color: dark ? '#f8f6f1' : '#171717', fontFamily: 'Arial, Helvetica, sans-serif'}} />
  );
};
