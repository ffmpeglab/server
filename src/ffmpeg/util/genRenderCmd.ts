import {
  EditorLayer,
  EditorProject,
  EncoderProject,
  FFMpegOutputType,
  Media,
  SpeedValue,
  SpeedValueAsetPts,
} from '../../types';
import { getTotalTime } from './getTotalTime';
import { genExecTime } from './genExecTime';
import { documentDir, getFileId, processFileName } from './util';

export const genRenderCmd = (
  projectData: EditorProject,
  layers: EditorLayer[],
  newMediaId: string,
) => {
  if (!projectData?.id || layers?.length < 1) {
    return { execCmd: [], medias: [], files: [] };
  }
  const fileId = `${projectData.title.replace(' ', '_')}`;
  const { editor: encoding } = projectData;
  const outPostfix = `.${encoding?.output || 'mp4'}`;
  const outFileId = fileId + outPostfix;
  const framerate = encoding?.framerate || 30;
  const totalTime = getTotalTime(layers);
  const niceTime = genExecTime(totalTime);
  const timebase = `1/${framerate}`;
  let fileCounter = 0;
  const assignedMedias = {};
  const genInput = (e: EncoderProject) => {
    fileCounter++;
    const assignedMedia = `MEDIA_${fileCounter}`;
    const mediaFile = `${documentDir()}/${e.folderId}/${getFileId(e)}`;
    assignedMedias[assignedMedia] = mediaFile;
    return `$${assignedMedia}`;
  };

  const layerMedia = layers?.map((layer) => ({
    ...layer,
    media: layer.media?.map((m) => ({ ...m, layer })) || [],
  }));

  const files = layerMedia
    ?.flatMap((l) => l.media)
    ?.flatMap((e) => ['-i', genInput(e)]);

  const aspectRatio = encoding.aspectRatio || '16/9';
  const width = encoding.width || 1280;
  const height = encoding.height || 720;
  const scaleFilter = (diff: number[]) =>
    `setdar=${aspectRatio},scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/${diff[0]}:(oh-ih)/${diff[1]}:black,setsar=1,format=rgba`;

  let videoFilterChains: string[] = [];
  let audioFilterChains: string[] = [];
  const audioStreams: string[] = [];
  let mediaIndex = 0;
  const layerStreams: string[] = [];

  layerMedia?.forEach((layer, layerIndex) => {
    let videoPipeline: string[] = [];
    let prevVideoStream: string | null = null;
    let timelinePosition = 0;
    const makeVideoChain = (index: number, media: EncoderProject) => {
      const transparency = parseFloat(
        (media.encoding?.opacity ?? 1).toString(),
      );
      const speed =
        media.encoding?.speed && media.encoding?.speed !== SpeedValue['100%']
          ? `${SpeedValueAsetPts[media.encoding?.speed]}*PTS`
          : 'PTS-STARTPTS';

      // Get crop values
      const cropLeft = parseInt(media.encoding?.crop?.left?.toString() || '0');
      const cropRight = parseInt(
        media.encoding?.crop?.right?.toString() || '0',
      );
      const cropTop = parseInt(media.encoding?.crop?.top?.toString() || '0');
      const cropBottom = parseInt(
        media.encoding?.crop?.bottom?.toString() || '0',
      );

      // Calculate actual crop dimensions
      const cropFilter = (() => {
        if (cropLeft || cropRight || cropTop || cropBottom) {
          const cropHorizontal = cropLeft + cropRight;
          const cropVertical = cropTop + cropBottom;
          return `crop=in_w-${cropHorizontal}:in_h-${cropVertical}:${cropLeft}:${cropTop}`;
        }
        return '';
      })();

      // Resize parameters
      const resizeX = media?.encoding?.resize?.x || 0;
      const resizeY = media?.encoding?.resize?.y || 0;
      const scaleValue = media?.encoding?.scale || 1;

      // Pan parameters
      const panLeft = parseInt(media?.encoding?.pan?.left?.toString() || '0');
      const panRight = parseInt(media?.encoding?.pan?.right?.toString() || '0');
      const panTop = parseInt(media?.encoding?.pan?.top?.toString() || '0');
      const panBottom = parseInt(
        media?.encoding?.pan?.bottom?.toString() || '0',
      );

      // Color adjustment parameters
      const colorR = media?.encoding?.color?.r ?? 1;
      const colorG = media?.encoding?.color?.g ?? 1;
      const colorB = media?.encoding?.color?.b ?? 1;

      // Build color adjustment filter
      const colorAdjustmentFilter = `colorchannelmixer=rr=${colorR}:gg=${colorG}:bb=${colorB}:aa=${transparency}`;
      const isImage = !(media.isAudio || media.isVideo);
      // Base video processing chain
      let videoParams = `[${index}:v]trim=start=${
        media?.encoding?.start || 0
      }:end=${media?.encoding?.end || media.duration},setpts=${speed}`;
      if (isImage) {
        const loopSize = (
          media.encoding?.end || media.encoding?.start
            ? (media?.encoding?.end || media?.duration || 0) -
              (media?.encoding?.start || 0)
            : media?.duration
        ) as number;
        videoParams = `[${index}:v]loop=loop=${
          loopSize * framerate
        }:size=1:start=0`;
      }
      // Add crop filter if needed
      if (cropFilter) videoParams += `,${cropFilter}`;

      // Handle scaling and positioning in a way that works with FFmpeg constraints
      if (
        scaleValue !== 1 ||
        resizeX ||
        resizeY ||
        panLeft ||
        panRight ||
        panTop ||
        panBottom
      ) {
        // First scale to desired size
        if (scaleValue !== 1) {
          videoParams += `,scale=iw*${scaleValue}:ih*${scaleValue}`;
        }

        // Then create a canvas of the final size and position the content
        const xPos = resizeX + panLeft - panRight;
        const yPos = resizeY + panTop - panBottom;

        // Use split and overlay approach with proper semicolons
        videoParams += `,split[original][dummy];[dummy]scale=${width}:${height},geq=0:128:128[base];[base][original]overlay=x=${xPos}:y=${yPos}`;
      } else {
        // Use the default scale and pad filter if no custom adjustments
        videoParams += `,${scaleFilter([2, 2])}`;
      }

      // Add common processing filters including color adjustment
      videoParams += `,fps=fps=${framerate},settb=expr=${timebase},${colorAdjustmentFilter}`;

      if (media?.encoding?.reverse) {
        videoParams += ',reverse';
      }

      return videoParams + `[v${index}?]`;
    };
    if (!layer.editor.videoDisabled) {
      for (const media of layer.media) {
        const hasVideo = media?.width && media.width > 0;
        if (!hasVideo) continue;

        const mediaSpeed = parseFloat(
          (media?.encoding?.speed && SpeedValueAsetPts[media.encoding?.speed]
            ? SpeedValueAsetPts[media.encoding.speed]
            : 1
          ).toString(),
        );
        const transition = media.encoding?.transitionIn;
        const transitionDuration = parseFloat(
          (media.encoding?.transitionInDuration || 3).toString(),
        );
        const transitionOffset =
          transition && transition !== 'none' ? transitionDuration : 0.0;
        const duration =
          ((media.encoding?.end || media.duration || 0) -
            (media.encoding?.start || 0) -
            transitionOffset) *
          parseFloat(mediaSpeed.toString());
        videoFilterChains.push(makeVideoChain(mediaIndex, media));

        if (prevVideoStream) {
          const transitionOffset = timelinePosition - transitionDuration - 1;

          if (transition && transition !== 'none' && transitionOffset > 0) {
            videoPipeline.push(
              `[${prevVideoStream}?][v${mediaIndex}?]` +
                `xfade=transition=${transition}:duration=${transitionDuration}:offset=${transitionOffset},` +
                `settb=expr=${timebase}[x${mediaIndex}?]`,
            );
            prevVideoStream = `x${mediaIndex}`;
            timelinePosition += duration - transitionDuration;
          } else {
            videoPipeline.push(
              `[${prevVideoStream}?][v${mediaIndex}?]` +
                `concat=n=2:v=1:a=0,` +
                `settb=expr=${timebase}[c${mediaIndex}?]`,
            );
            prevVideoStream = `c${mediaIndex}`;
            timelinePosition += duration;
          }
        } else {
          prevVideoStream = `v${mediaIndex}`;
          timelinePosition = duration;
        }

        mediaIndex++;
      }

      if (prevVideoStream) {
        videoPipeline.push(
          `[${prevVideoStream}?]settb=expr=${timebase}[v_layer${layerIndex}]`,
        );
        layerStreams.push(`v_layer${layerIndex}`);
      }
    }

    videoFilterChains = [...videoFilterChains, ...videoPipeline];
  });

  // Build overlay steps for layers
  const overlaySteps: string[] = [];
  const reverseLayers = layerStreams.reverse();
  if (reverseLayers.length > 0) {
    let currentOverlay = reverseLayers[0];
    for (let i = 1; i < reverseLayers.length; i++) {
      overlaySteps.push(
        `[${currentOverlay}][${reverseLayers[i]}]overlay[overlay${i}]`,
      );
      currentOverlay = `overlay${i}`;
    }
    overlaySteps.push(
      `[${currentOverlay}]split[v_main][v_overlay];` +
        `[v_main]settb=expr=${timebase}[v_concat];` +
        `[v_overlay]nullsink`,
    );
  }

  // Audio processing (unchanged)
  mediaIndex = 0;
  layerMedia?.forEach((layer) => {
    let audioTimelinePosition = 0;
    const { muted } = layer.editor;
    for (const media of layer.media) {
      const duration =
        (media.encoding?.end || media.duration || 0) -
        (media.encoding?.start || 0);
      const audioDelay = audioTimelinePosition * 1000;
      const hasAudio = !muted && media.hasAudio;

      if (hasAudio) {
        const speed =
          media?.encoding?.speed &&
          media?.encoding?.speed !== SpeedValue['100%']
            ? `${SpeedValueAsetPts[media?.encoding?.speed]}*PTS`
            : 'PTS-STARTPTS';
        audioFilterChains.push(
          `[${mediaIndex}:a]` +
            `atrim=start=${media?.encoding?.start || 0}:end=${
              media?.encoding?.end || media.duration
            },` +
            `asetpts=${speed}` +
            (media?.encoding?.speed
              ? `,atempo=${SpeedValue[media?.encoding?.speed]}`
              : '') +
            (media?.encoding?.reverse ? ',areverse,' : ',') +
            `adelay=delays=${audioDelay}|${audioDelay},` +
            `volume=${
              media.layer.editor.muted ? 0 : (media?.encoding?.soundVolume ?? 1)
            }` +
            `[a${mediaIndex}?]`,
        );
        audioStreams.push(`[a${mediaIndex}?]`);
      } else if (media?.width && media.width > 0) {
        audioFilterChains.push(
          `aevalsrc=0:d=${duration}[s${mediaIndex}];` +
            `[s${mediaIndex}]` +
            `adelay=delays=${audioDelay}|${audioDelay},` +
            `volume=${media?.encoding?.soundVolume ?? 1}` +
            `[a${mediaIndex}?]`,
        );
        audioStreams.push(`[a${mediaIndex}?]`);
      }
      mediaIndex++;
      audioTimelinePosition += duration;
    }
  });

  const allFilters = [
    ...videoFilterChains,
    ...overlaySteps,
    ...(encoding.output !== FFMpegOutputType.gif ? audioFilterChains : []),
    ...(audioStreams.length > 0 && encoding.output !== FFMpegOutputType.gif
      ? [
          `${audioStreams.join('')}amix=inputs=${
            audioStreams.length
          }:duration=longest[a_concat]`,
        ]
      : []),
  ]
    .filter(Boolean)
    .join(';\n')
    .replace(/,\s*\[/g, '[')
    .replace(/;\s*;/g, ';');
  const outputDir = documentDir();
  const outputPath = `${outputDir}/${projectData?.id}/${getFileId({
    id: newMediaId,
    filename: outFileId,
  } as Media)}`;
  assignedMedias['OUTPUT_PATH'] = outputPath;
  const execCmd = [
    ...(files || []),
    // ['-crf', encoding?.compressionLevel?.toString() || '20'],
    '-filter_complex',
    allFilters,
    '-aspect',
    aspectRatio,
    // ['-preset', encoding?.preset || 'medium'],
    '-movflags',
    '+faststart',
    ...(encoding.output === FFMpegOutputType.mp3 ? [] : ['-map', '[v_concat]']),
    ...(audioStreams.length > 0 && encoding.output !== FFMpegOutputType.gif
      ? ['-map', '[a_concat]']
      : []),
    '-r',
    framerate.toString(),
    '-ss',
    '00:00:00',
    '-to',
    niceTime,
    '-y',
    '$OUTPUT_PATH',
  ];

  return {
    execCmd,
    medias: layerMedia?.flatMap((l) => l.media),
    files,
    outFileId,
    encoded: [] as string[],
    projectData,
    assignedMedias,
    outputPath,
  };
};
