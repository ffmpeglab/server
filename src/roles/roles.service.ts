import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateEmailRoleDto, CreateRoleDto, UpdateRoleDto } from './roles.dto';
import { Role } from '../model/roles.entity';
import { Item } from '../model/item.entity';
import { Render } from '../model/render.entity';
import { config } from '../config';
import { inviteUser } from './utils';
import { Users } from '../model/user.entity';

@Injectable()
export class RolesService {
  constructor(
    @InjectRepository(Item)
    private itemRepo: Repository<Item>,
    @InjectRepository(Render)
    private renderRepo: Repository<Render>,
    @InjectRepository(Role)
    private repo: Repository<Role>,
    @InjectRepository(Users)
    private userRepo: Repository<Users>,
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
      item: folder,
    });
  }

  async createRole(
    createItem: CreateRoleDto,
    userId: string,
  ): Promise<Role | null> {
    const n = await this.repo.insert({
      ...createItem,
      owner: userId,
    });
    return await this.repo.findOneBy({
      id: n.identifiers[0].id as string,
      owner: userId,
    });
  }

  async validateCreate(
    createItem: CreateRoleDto | CreateEmailRoleDto,
    userId: string,
  ): Promise<Item | Render | null> {
    if (createItem.item && createItem.render) {
      throw new Error('invalid_input');
    }
    if (!createItem.item && !createItem.render) {
      throw new Error('invalid_input');
    }
    if (createItem.item) {
      const item = await this.itemRepo.findOneBy({
        id: createItem.item,
        user_id: userId,
      });
      return item;
    }
    if (createItem.render) {
      const render = await this.renderRepo.findOneBy({
        id: createItem.render,
        user_id: userId,
      });
      return render;
    }
    throw new Error('item_not_found');
  }

  async create(
    createItem: CreateRoleDto,
    userId: string,
  ): Promise<Role | null> {
    const permissionedRow = await this.validateCreate(createItem, userId);
    if (permissionedRow?.user_id === userId) {
      return await this.createRole(createItem, userId);
    }
    throw new Error('item_not_found');
  }

  async createByEmail(
    createItem: CreateEmailRoleDto,
    userId: string,
  ): Promise<Role | null> {
    const permissionedRow = await this.validateCreate(createItem, userId);
    const redirectTo = createItem.render
      ? config.webAppHost + 'editor/render/' + permissionedRow?.id
      : config.webAppHost + 'shared/item/' + permissionedRow?.id;
    const email = createItem.email;

    if (permissionedRow?.user_id !== userId) {
      throw new Error('item_not_found');
    }

    const existingUser = await this.userRepo.findOneBy({ email });

    if (existingUser) {
      const ndto = {
        ...createItem,
        email: undefined,
        user_id: existingUser.id,
      };
      return this.createRole(ndto, userId);
    }

    const invitedUser = await inviteUser(createItem.email, redirectTo);

    if (invitedUser) {
      const ndto = {
        ...createItem,
        email: undefined,
        user_id: invitedUser.id,
      };

      return this.createRole(ndto, userId);
    }

    throw new Error('user_not_found');
  }

  async update(item: UpdateRoleDto, userId: string): Promise<Role | null> {
    await this.repo.update(
      { id: item.id, user_id: userId },
      {
        title: item.title,
        permission: item.permission,
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
