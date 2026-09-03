import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ApiKey } from '../model/apikey.entity';
import crypto from 'node:crypto';

export function generateSecureKey() {
  const array = new Uint32Array(5);
  return crypto.getRandomValues(array).join('').toString();
}
@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKey)
    private apikeyRepository: Repository<ApiKey>,
  ) {}

  async findAll(userId: string): Promise<ApiKey[]> {
    return await this.apikeyRepository.findBy({ user_id: userId });
  }

  async findOne(id: string, userId: string): Promise<ApiKey | null> {
    return await this.apikeyRepository.findOneBy({ id, user_id: userId });
  }

  async create(
    userId: string,
    expiration: number = new Date().setDate(new Date().getDate() + 10),
    roles: string[] = [],
  ): Promise<ApiKey | null> {
    const apikey = generateSecureKey();
    const n = await this.apikeyRepository.insert({
      apikey: crypto.hash('sha512', apikey),
      user_id: userId,
      date: new Date().toISOString(),
      data: {
        expiration,
        roles,
      },
    });
    const nk = await this.findOne(n.identifiers[0].id, userId);
    return { ...nk, apikey } as ApiKey;
  }

  async deleteOne(apiKeyId: string, userId: string) {
    return await this.apikeyRepository.delete({
      id: apiKeyId,
      user_id: userId,
    });
  }
}
