import { Layer, Image as KonvaImage } from 'react-konva';
import useImage from 'use-image';
import { useEffect } from 'react';

// שכבת רקע — תמונת התוכנית. listening=false כדי שלא תהיה יעד הקשה (ביצועים).
export default function BackgroundLayer({ imageUrl, onLoad }) {
  const [image] = useImage(imageUrl || '', 'anonymous');

  useEffect(() => {
    if (image && onLoad) onLoad({ width: image.width, height: image.height });
  }, [image, onLoad]);

  if (!image) return <Layer listening={false} />;
  return (
    <Layer listening={false}>
      <KonvaImage image={image} x={0} y={0} />
    </Layer>
  );
}
