import {
  Controller,
  Get,
  Param,
  Post,
  Request,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FilesService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { AuthGuard } from '../auth/auth.guard';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiParam,
  ApiResponse,
} from '@nestjs/swagger';
import { FileListDto, FileResponseDto, FileUploadDto } from './file.dto';
import { _Object$ } from '@aws-sdk/client-s3';
import { withSupabase, SupabaseCtx } from '@supabase/server/adapters/nestjs';
import type { SupabaseContext } from '@supabase/server';
import { User } from '@supabase/supabase-js';
import { S3Config } from '../types';
import { config, supabaseEnv } from '../config';

@UseGuards(AuthGuard)
@Controller('files')
@ApiBearerAuth()
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  @ApiBody({
    description: 'File',
    type: FileUploadDto,
  })
  async upload(
    @UploadedFile()
    file: { buffer: Buffer<ArrayBufferLike>; originalname: string },
    @Request() req: Request & { user: string },
  ) {
    return this.filesService.uploadFile(
      req.user,
      file.originalname,
      file.buffer,
    );
  }

  @Get('list')
  @ApiResponse({ type: FileListDto, isArray: true })
  async list(@Request() req: Request & { user: string }) {
    return this.filesService.listFiles(req.user);
  }

  @Get('file/:id')
  @ApiParam({
    name: 'id',
    description: 'The ID of the file',
    required: true,
    type: String,
  })
  @ApiResponse({ type: FileResponseDto })
  async file(
    @Param() params: { id: string },
    @Request() req: Request & { user: string },
  ) {
    return this.filesService.getFile(params.id, req.user);
  }

  @Get('s3config')
  @UseGuards(withSupabase({ auth: 'none', env: supabaseEnv }))
  @ApiResponse({ type: S3Config })
  async s3(
    @Request() req: Request & { user: string },
    @SupabaseCtx() ctx: SupabaseContext,
  ): Promise<S3Config> {
    const {
      data: { users },
      error,
    } = await ctx.supabaseAdmin.auth.admin.listUsers();
    const userId = req.user;
    console.info({ userId, users, error });
    const existingUser = users.find((user) => (user as User).id === userId);
    console.info({ existingUser });
    const { email } = existingUser || {};
    if (!email) {
      throw new UnauthorizedException();
    }

    const { data: linkData, error: createUserLinkError } =
      await ctx.supabaseAdmin.auth.admin.generateLink({
        type: 'magiclink',
        email,
      });

    if (createUserLinkError) {
      console.error('createUserLinkError', createUserLinkError);
      throw new UnauthorizedException();
    }

    const { data: otpData, error: otpError } =
      await ctx.supabaseAdmin.auth.verifyOtp({
        token_hash: linkData.properties.hashed_token,
        type: 'magiclink',
      });

    if (otpError || !otpData?.session?.access_token) {
      console.error('otpError', otpError || otpData);
      throw new UnauthorizedException();
    }

    const { access_token } = otpData.session;

    return {
      bucketId: config.s3.bucketId,
      region: config.s3.region,
      endpoint: config.supabaseHost + '/storage/v1/s3',
      credentials: {
        accessKeyId: config.supabaseProjectId,
        secretAccessKey: config.supabaseAnonKey,
        sessionToken: access_token,
      },
      userId,
    };
  }
}
