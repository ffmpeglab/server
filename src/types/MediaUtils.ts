import { ApiProperty } from '@nestjs/swagger';

export enum XFade {
  none = 'none',
  //fade
  fade = 'fade',
  fadeblack = 'fadeblack',
  fadewhite = 'fadewhite',
  distance = 'distance',
  //wipe
  wipeleft = 'wipeleft',
  wiperight = 'wiperight',
  wipeup = 'wipeup',
  wipedown = 'wipedown',
  //slide
  slideleft = 'slideleft',
  slideright = 'slideright',
  slideup = 'slideup',
  slidedown = 'slidedown',
  //smooth
  smoothleft = 'smoothleft',
  smoothright = 'smoothright',
  smoothup = 'smoothup',
  smoothdown = 'smoothdown',
  //cover
  // coverleft = 'coverleft',
  // coverright = 'coverright',
  // coverup = 'coverup',
  // coverdown = 'coverdown',
  //reveal
  // revealleft = 'revealleft',
  // revealright = 'revealright',
  // revealup = 'revealup',
  // revealdown = 'revealdown',
  //fadegrays
  fadegrays = 'fadegrays',
  //squueze
  squeezev = 'squeezev',
  squeezeh = 'squeezeh',
  //zoomin
  zoomin = 'zoomin',
  //dissolve
  dissolve = 'dissolve',
  //pixelize
  pixelize = 'pixelize',
  //radial
  radial = 'radial',
  //blur
  hblur = 'hblur',
  //wipe
  wipetl = 'wipetl',
  wipetr = 'wipetr',
  wipebl = 'wipebl',
  wipebr = 'wipebr',
  //slice
  hlslice = 'hlslice',
  hrslice = 'hrslice',
  vuslice = 'vuslice',
  vdslice = 'vdslice',
  //crop
  circlecrop = 'circlecrop',
  rectcrop = 'rectcrop',
  circleclose = 'circleclose',
  circleopen = 'circleopen',
  //close/open
  horzclose = 'horzclose',
  horzopen = 'horzopen',
  vertclose = 'vertclose',
  vertopen = 'vertopen',
}

export enum FFMpegPreset {
  ultrafast = 'ultrafast',
  superfast = 'superfast',
  veryfast = 'veryfast',
  faster = 'faster',
  fast = 'fast',
  medium = 'medium',
  slow = 'slow',
  slower = 'slower',
  veryslow = 'veryslow',
}

export enum FFMpegOutputType {
  mp4 = 'mp4',
  gif = 'gif',
  mp3 = 'mp3',
  mov = 'mov',
  avi = 'avi',
  mkv = 'mkv',
  png = 'png',
  jpg = 'jpg',
}

enum NoneFade {
  none = 'none',
}

export type XFADE = XFade;

export class PositionParams {
  @ApiProperty()
  top: number;
  @ApiProperty()
  bottom: number;
  @ApiProperty()
  left: number;
  @ApiProperty()
  right: number;
}

export class Resize {
  @ApiProperty()
  x: number;
  @ApiProperty()
  y: number;
}

export class RGB {
  @ApiProperty()
  r: number;
  @ApiProperty()
  g: number;
  @ApiProperty()
  b: number;
}

export enum SpeedValue {
  '50%' = 0.5,
  '60%' = 0.6,
  '70%' = 0.7,
  '80%' = 0.8,
  '90%' = 0.9,
  '100%' = 1,
  '110%' = 1.1,
  '120%' = 1.2,
  '130%' = 1.3,
  '140%' = 1.4,
  '150%' = 1.5,
  '160%' = 1.6,
  '170%' = 1.7,
  '180%' = 1.8,
  '190%' = 1.9,
  '200%' = 2,
}

export enum SpeedValueAsetPts {
  '50%' = 1.5,
  '60%' = 1.4,
  '70%' = 1.3,
  '80%' = 1.2,
  '90%' = 1.1,
  '100%' = 1,
  '110%' = 0.9,
  '120%' = 0.8,
  '130%' = 0.7,
  '140%' = 0.6,
  '150%' = 0.5,
  '160%' = 0.4,
  '170%' = 0.3,
  '180%' = 0.2,
  '200%' = 0.1,
}

export const outputTypes = ['LOW', 'SD', 'HD'];
export const fullOutputTypes = [...outputTypes, 'FULLHD'];
export const aspectRatios = ['16/9', '9/16'];

export const qualityToSize = {
  FULLHD: { width: 1920, height: 1080 },
  HD: { width: 1280, height: 720 },
  SD: { width: 854, height: 480 },
  LOW: { width: 640, height: 360 },
};

export enum CodeSelection {
  generated = 'generated',
  custom = 'custom',
}
