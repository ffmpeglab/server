import { Media } from './Media';

export interface Contact {
  id: string;
  isContact: boolean;
  name: string;
  photo: string;
  date: number;
  description: string;
  email?: string;
  originalId: string;
  folderId: string;
  online?: boolean;
  lastSeen?: number;
  thumbnail?: string;
  unread?: number;
  partyId?: string;
  mnemonic: string;
  orderId: number;
}
export interface IMessage {
  _id: string | number;
  text: string;
  createdAt: Date | number;
  image?: string;
  video?: string;
  audio?: string;
  system?: boolean;
  sent?: boolean;
  received?: boolean;
  pending?: boolean;
}

export interface ContactRes {
  docs: Contact[];
}

export interface ChatRoom {
  userIds: string[];
  _id: string;
  created: number;
  admins: string[];
  userId: string[];
}

export interface ChatRoomRes {
  docs: ChatRoom[];
}

export enum ChatMessageType {
  media = 'media',
  call = 'call',
  text = 'text',
  party_request = 'party_request',
  party_confirmation = 'party_confirmation',
  party_start = 'party_start',
  party_join = 'party_join',
  party_stop = 'party_stop',
  party_quit = 'party_quit',
  party_media = 'party_media',
  party_stop_media = 'party_media_stop',
  party_media_pause = 'party_media_pause',
  party_media_unpause = 'party_media_unpause',
  party_media_sync = 'party_media_sync',
}

export interface ChatMessage extends IMessage {
  id: string;
  created: number;
  roomId: string;
  userId: string;
  readByUserIds: string[];
  jwt: string;
  messageStatus: ChatMessageStatus;
  text: string;
  pushed?: boolean;
  encryptedContent?: string;
  messageType?: ChatMessageType;
  partyId?: string;
  createdAt: number;
  userName: string;
  error?: string;
  message: {
    type: 'media' | 'call' | 'text';
    data: string;
  };
  orderId: number;
  media: Media;
}

export enum ChatMessageStatus {
  created = 'created',
  sent = 'sent',
  delivered = 'delivered',
  read = 'read',
}

export interface ChatMessageRes {
  docs: ChatMessage[];
}

export interface ChatBubbleProps {
  bgColor: string;
  isPreloader?: boolean;
  _id?: string | number;
  chatId: string;
}
