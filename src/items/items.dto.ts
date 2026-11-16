import { ApiProperty } from '@nestjs/swagger';
import { Item } from '../model/item.entity';
import type { ItemUnion } from '../types';

export class UpdateItemDto implements Omit<
  Item,
  'user_id' | 'created' | 'updated'
> {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  folder: string;
  @ApiProperty()
  isFolder: boolean;
  @ApiProperty()
  public: boolean;
  @ApiProperty()
  order: number;
  @ApiProperty()
  item: ItemUnion;
}

export class CreateItemDto implements Omit<
  Item,
  'id' | 'created' | 'updated' | 'user_id'
> {
  @ApiProperty()
  title: string;
  @ApiProperty()
  folder: string;
  @ApiProperty()
  isFolder: boolean;
  @ApiProperty()
  public: boolean;
  @ApiProperty()
  order: number;
  @ApiProperty()
  item: ItemUnion;
}
