import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../model/roles.entity';

export class UpdateRoleDto implements Omit<
  Role,
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
  item: any;
}

export class CreateRoleDto implements Omit<
  Role,
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
  item: any;
}
