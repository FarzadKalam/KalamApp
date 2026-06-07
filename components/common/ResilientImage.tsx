import React, { useEffect, useMemo, useState } from 'react';
import {
  getImagePreviewCandidates,
  reportImageTransformFailure,
  type ImagePreviewPreset,
} from '../../utils/imagePreview';

interface ResilientImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'src'> {
  src: string;
  preset?: ImagePreviewPreset;
}

const ResilientImage: React.FC<ResilientImageProps> = ({
  src,
  preset = 'card',
  onError,
  ...imgProps
}) => {
  const candidates = useMemo(() => getImagePreviewCandidates(src, preset), [preset, src]);
  const [candidateIndex, setCandidateIndex] = useState(0);

  useEffect(() => {
    setCandidateIndex(0);
  }, [candidates]);

  const resolvedSrc = candidates[candidateIndex] || src;

  return (
    <img
      {...imgProps}
      src={resolvedSrc}
      onError={(event) => {
        if (candidateIndex < candidates.length - 1) {
          reportImageTransformFailure(resolvedSrc);
          setCandidateIndex((value) => value + 1);
          return;
        }
        onError?.(event);
      }}
    />
  );
};

export default ResilientImage;
