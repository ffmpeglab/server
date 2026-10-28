import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  CreateItemDto,
  UpdateItemDto,
} from './items.dto';
import { Item } from '../model/item.entity';

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(Item)
    private repo: Repository<Item>,
  ) {}

  async findAllFolders(userId: string): Promise<Item[]> {
    return await this.repo.findBy({ user_id: userId, isFolder: true });
  }

  async findOne(id: string, userId: string): Promise<Item | null> {
    return await this.repo.findOneBy({ id, user_id: userId });
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

  async update(
    item: UpdateItemDto,
    userId: string,
  ): Promise<Item | null> {
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
