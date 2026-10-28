import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateRoleDto, UpdateRoleDto } from './roles.dto';
import { Role } from '../model/roles.entity';
import { Permission } from '../types';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private repo: Repository<Role>,
  ) {}

  async findAllAssignedRoles(userId: string): Promise<Role[]> {
    return await this.repo.findBy({ user_id: userId });
  }

  async findOne(id: string, userId: string): Promise<Role | null> {
    return await this.repo.findOneBy({ id, user_id: userId });
  }

  async findByFolder(folder: string, userId: string): Promise<Role[]> {
    return await this.repo.findBy({
      user_id: userId,
      folder,
    });
  }

  async create(
    createItem: CreateRoleDto,
    userId: string,
  ): Promise<Role | null> {
    const n = await this.repo.insert({
      ...createItem,
      owner: userId,
    });
    return await this.findOne(n.identifiers[0].id, userId);
  }

  async update(item: UpdateRoleDto, userId: string): Promise<Role | null> {
    await this.repo.update(
      { id: item.id, user_id: userId },
      {
        title: item.title,
        permission: item.permission as Permission,
      },
    );
    return await this.findOne(item.id, userId);
  }

  async deleteOne(id: string, userId: string) {
    return await this.repo.delete({
      id,
      user_id: userId,
    });
  }
}
