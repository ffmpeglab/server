import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateItemDto, UpdateItemDto } from './items.dto';
import { Item } from '../model/item.entity';
import { Role } from '../model/roles.entity';
import { Permission } from '../types';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private repo: Repository<Item>,
    @InjectRepository(Role)
    private roles: Repository<Role>,
  ) {}

  async findAllFolders(userId: string): Promise<Item[]> {
    return await this.repo.findBy({ user_id: userId, isFolder: true });
  }

  async findOne(id: string, userId: string): Promise<Item | null> {
    return await this.repo.findOneBy({ id, user_id: userId });
  }

  async findOnePublic(id: string): Promise<Item | null> {
    return await this.repo.findOneBy({ id, public: true });
  }

  async findByFolderPublic(folder: string): Promise<Item[]> {
    const publicFolder = await this.repo.findOneBy({
      id: folder,
      public: true,
      isFolder: true,
    });
    if (publicFolder) {
      return await this.repo.findBy({
        folder,
      });
    }
    throw new Error('no_public_folder_found');
  }

  async findOneByPermission(id: string, userId: string): Promise<Item | null> {
    const permission = await this.roles.findOneBy({
      item: id,
      user_id: userId,
    });
    if (
      permission &&
      [Permission.r, Permission.rw].includes(permission.permission)
    ) {
      const item = await this.repo.findOne({ where: { id } });
      return item;
    }
    throw new Error('no_permission_found');
  }

  async updateByRole(
    item: UpdateItemDto,
    userId: string,
  ): Promise<Item | null> {
    const permission = await this.roles.findOneBy({
      item: item.id,
      user_id: userId,
    });
    if (
      permission &&
      [Permission.w, Permission.rw].includes(permission.permission)
    ) {
      await this.repo.update(
        { id: item.id, user_id: permission.owner },
        {
          title: item.title,
        },
      );
      return await this.findOne(item.id, permission.owner);
    }
    throw new Error('no_permission_found');
  }

  async findByFolder(folder: string, userId: string): Promise<Item[]> {
    return await this.repo.findBy({
      user_id: userId,
      folder,
    });
  }

  async create(
    createItem: CreateItemDto,
    userId: string,
  ): Promise<Item | null> {
    const n = await this.repo.insert({
      ...createItem,
      user_id: userId,
      created: new Date().toISOString(),
    });
    return await this.findOne(n.identifiers[0].id, userId);
  }

  async update(item: UpdateItemDto, userId: string): Promise<Item | null> {
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
