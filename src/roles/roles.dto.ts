import { ApiProperty } from '@nestjs/swagger';
import { Role } from '../model/roles.entity';
import { Permission } from '../types';

export class UpdateRoleDto implements Omit<
  Role,
  'user_id' | 'created' | 'updated' | 'user_id' | 'owner'
> {
  @ApiProperty()
  id: string;
  @ApiProperty()
  title: string;
  @ApiProperty()
  permission: Permission;
}

export class CreateRoleDto implements Omit<
  Role,
  'id' | 'created' | 'updated' | 'owner'
> {
  @ApiProperty()
  title: string;
  @ApiProperty()
  permission: Permission;
  @ApiProperty()
  user_id: string;
  @ApiProperty()
  folder?: string;
  @ApiProperty()
  render?: string;
}
