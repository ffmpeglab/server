import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateItemDto,
  UpdateItemDto,
} from './roles.dto';
import { Role } from '../model/roles.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Role)
    private repo: Repository<Role>,
  ) {}

  async findAllRoles(userId: string): Promise<Role[]> {
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
    createItem: CreateItemDto,
    userId: string,
  ): Promise<Role | null> {
    const n = await this.repo.insert({
      ...createItem,
      user_id: userId,
    });
    return await this.findOne(n.identifiers[0].id, userId);
  }

  async update(
    item: UpdateItemDto,
    userId: string,
  ): Promise<Role | null> {
    await this.repo.update(
      { id: item.id, user_id: userId },
      {
        title: item.title,
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
